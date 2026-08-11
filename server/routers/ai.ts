import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getGroqApiKey, groqChat, type GroqMessage } from "../groq";
import {
  AI_PERSONAS,
  AI_PERSONA_LABELS,
  CATEGORY_LABELS,
  STATUS_LABELS,
  type AiPersona,
} from "../../drizzle/schema";

/** How many past turns to send back to the model for context. */
const CONTEXT_TURNS = 14;

const PERSONA_CONFIGS: Record<
  AiPersona,
  {
    roleTitle: string;
    focusDesc: string;
    expertise: string[];
  }
> = {
  curation: {
    roleTitle: "總策展與法律財務顧問",
    focusDesc: "專精於市集商業模式、損益試算、合約法務、政府與青年創業補助（U-start/青年局）及整體籌備里程碑。",
    expertise: [
      "精確估算損益平衡點、攤位定價策略與預算分配",
      "審閱合夥協議、場地租借合約與免責保護條款",
      "指導教育部 U-start、台北市青年局等青創補助申請要點與商業計畫書撰寫",
      "協助團隊梳理短中長期目標與跨組協同進度",
    ],
  },
  design: {
    roleTitle: "美學與場域設計顧問",
    focusDesc: "專精於品牌視覺識別（CIS/Logo）、市集空間美學、攤位動線配置、大型裝置藝術企劃與美感陳列規範。",
    expertise: [
      "深化「慢生活 × 療癒 × 體驗」的品牌視覺語言與標準色/字體應用",
      "規劃場域動線、人流導引、拍照打卡亮點裝置與舞台視覺",
      "提供單桌、帳篷立體陳列指引與攤商美感陳列 SOP 規範",
      "把關社群視覺風格、宣傳海報及活動現場氛圍營造",
    ],
  },
  vendor: {
    roleTitle: "招商與攤商關係顧問",
    focusDesc: "專精於招商簡章文案撰寫、攤商品牌篩選審查、合約規範制定、水電負載協調與攤主關係維護。",
    expertise: [
      "撰寫具信賴感與號召力的高質感《市集招商簡章》與報名表單",
      "制定多品類（手作/選物/插畫/甜點飲品）審查評分標準與同品項排他原則",
      "擬定《攤商合作合約》與《營運管理規範書》（罰則、水電、退費、保證金退款）",
      "協調攤商用電瓦數安全申報與現場攤商關懷通訊流程",
    ],
  },
  marketing: {
    roleTitle: "行銷與數位公關顧問",
    focusDesc: "專精於社群矩陣營運（IG/FB/LINE）、品牌故事文案、Accupass 活動上架、短影音 Reels 企劃與現場人潮引流。",
    expertise: [
      "擬定各階段社群宣傳時程表與多角度切入之爆款貼文腳本",
      "撰寫動人的品牌故事、招商公告與活動宣傳 Slogan",
      "策劃 Accupass 上架、社團口碑傳播與 KOL/媒體合作邀約",
      "設計現場互動拍照、集章打卡與活動後問卷回饋機制",
    ],
  },
};

function buildPersonaSystemPrompt(
  persona: AiPersona,
  taskSummary: string,
  eventInfo: string
): string {
  const config = PERSONA_CONFIGS[persona] || PERSONA_CONFIGS.curation;
  const personaLabel = AI_PERSONA_LABELS[persona] || config.roleTitle;

  return [
    `你現在是《咻一下》市集團隊的「${personaLabel}」。`,
    `定位與專長：${config.focusDesc}`,
    "",
    "你的核心專長領域包含：",
    ...config.expertise.map(e => `• ${e}`),
    "",
    "回答時請遵守以下原則：",
    "1. 始終保持身為該領域頂尖專家的專業度與親切感，使用繁體中文（台灣習慣用語）。",
    "2. 給出具體、可立即落地的指引（包含範例文案、數字試算、步驟清單或具體建議），避免空泛理論。",
    "3. 考量團隊為四人初創團隊（預算與時間精實），方案務求務實且高性價比。",
    "4. 重點鮮明、段落條理清晰，支援 Markdown 格式，適合在手機與平板上快速閱讀。",
    "5. 密切結合市集當前最新籌備進度與活動日期給予針對性建議。",
    "",
    eventInfo,
    "",
    "團隊目前最新任務與籌備進度摘要：",
    taskSummary || "（目前尚未建立任務）",
  ].join("\n");
}

export const aiRouter = router({
  /** Whether the Groq key is present, so the UI can explain what is missing. */
  status: protectedProcedure.query(() => ({
    configured: Boolean(getGroqApiKey()),
  })),

  /** Conversation history filtered by persona. */
  messages: protectedProcedure
    .input(
      z
        .object({
          persona: z.enum(AI_PERSONAS).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      return db.getAiMessages(input?.persona);
    }),

  ask: protectedProcedure
    .input(
      z.object({
        persona: z.enum(AI_PERSONAS).default("curation"),
        content: z.string().min(1).max(4000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!getGroqApiKey()) {
        throw new Error("尚未設定 Groq API 金鑰");
      }

      const persona = input.persona;

      await db.addAiMessage({
        persona,
        role: "user",
        content: input.content,
        authorId: ctx.user.id,
      });

      // Build compact context from current tasks + event settings + history of this persona
      const [tasks, settings, history] = await Promise.all([
        db.getAllTasks(),
        db.getAppSettings(),
        db.getAiMessages(persona),
      ]);

      // Prioritize tasks in this persona's category if applicable
      const categoryMap: Partial<Record<AiPersona, string>> = {
        curation: "curation",
        design: "design",
        vendor: "vendor",
        marketing: "marketing",
      };
      const relevantCategory = categoryMap[persona];

      const sortedTasks = [...tasks].sort((a, b) => {
        if (relevantCategory) {
          if (a.category === relevantCategory && b.category !== relevantCategory) return -1;
          if (a.category !== relevantCategory && b.category === relevantCategory) return 1;
        }
        return 0;
      });

      const taskSummary = sortedTasks
        .slice(0, 60)
        .map(
          t =>
            `- [${CATEGORY_LABELS[t.category]}] ${t.title}（${STATUS_LABELS[t.status]}${
              t.assigneeName ? `／${t.assigneeName}` : ""
            }${t.dueDate ? `／截止 ${new Date(t.dueDate).toLocaleDateString("zh-TW")}` : ""}）`
        )
        .join("\n");

      const eventInfo = settings?.marketEventDate
        ? `市集活動：${settings.marketEventName || "未命名"}，日期 ${new Date(
            settings.marketEventDate
          ).toLocaleDateString("zh-TW")}。`
        : "市集日期尚未確定。";

      const recent = history.slice(-CONTEXT_TURNS);
      const messages: GroqMessage[] = [
        { role: "system", content: buildPersonaSystemPrompt(persona, taskSummary, eventInfo) },
        ...recent.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const reply = await groqChat(messages, { temperature: 0.7, maxTokens: 2048 });

      await db.addAiMessage({
        persona,
        role: "assistant",
        content: reply,
      });

      return { reply, persona } as const;
    }),

  clear: protectedProcedure
    .input(
      z
        .object({
          persona: z.enum(AI_PERSONAS).optional(),
        })
        .optional()
    )
    .mutation(async ({ input }) => {
      await db.clearAiMessages(input?.persona);
      return { success: true } as const;
    }),
});

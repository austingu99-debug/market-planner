import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { getGroqApiKey, groqChat, type GroqMessage } from "../groq";
import { CATEGORY_LABELS, STATUS_LABELS } from "../../drizzle/schema";

/** How many past turns to send back to the model for context. */
const CONTEXT_TURNS = 12;

function buildSystemPrompt(taskSummary: string, eventInfo: string): string {
  return [
    "你是一位資深的市集擺攤與品牌籌備顧問，正在協助一個四人的創業小團隊準備參加創意市集。",
    "回答時請遵守以下原則：",
    "1. 使用繁體中文（台灣用語），語氣專業但親切。",
    "2. 回答要具體可執行，避免空泛的建議；能給數字、清單、範例就給。",
    "3. 考慮小團隊資源有限（四人、預算有限），建議要務實。",
    "4. 回答長度適中，重點清楚，適合在手機上閱讀。",
    "5. 若問題與他們目前的籌備進度有關，請參考下方的進度資訊。",
    "",
    eventInfo,
    "",
    "目前籌備進度摘要：",
    taskSummary || "（目前尚未建立任務）",
  ].join("\n");
}

export const aiRouter = router({
  /** Whether the Groq key is present, so the UI can explain what is missing. */
  status: protectedProcedure.query(() => ({
    configured: Boolean(getGroqApiKey()),
  })),

  /** Shared conversation history for the whole team. */
  messages: protectedProcedure.query(() => db.getAiMessages()),

  ask: protectedProcedure
    .input(z.object({ content: z.string().min(1).max(4000) }))
    .mutation(async ({ input, ctx }) => {
      if (!getGroqApiKey()) {
        throw new Error("尚未設定 Groq API 金鑰");
      }

      await db.addAiMessage({
        role: "user",
        content: input.content,
        authorId: ctx.user.id,
      });

      // Build compact context from current tasks + event settings.
      const [tasks, settings, history] = await Promise.all([
        db.getAllTasks(),
        db.getAppSettings(),
        db.getAiMessages(),
      ]);

      const taskSummary = tasks
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
        { role: "system", content: buildSystemPrompt(taskSummary, eventInfo) },
        ...recent.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      const reply = await groqChat(messages, { temperature: 0.7, maxTokens: 2048 });

      await db.addAiMessage({ role: "assistant", content: reply });

      return { reply } as const;
    }),

  clear: protectedProcedure.mutation(async () => {
    await db.clearAiMessages();
    return { success: true } as const;
  }),
});

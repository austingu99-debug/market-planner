import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { groqParseFile } from "../groq";
import { getDb } from "../db";
import { tasks, editions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// 草稿任務的 schema（用於 AI 解析結果）
export const ImportTaskDraftSchema = z.object({
  title: z.string().min(1, "標題不能為空"),
  description: z.string().optional().nullable(),
  category: z.enum(["curation", "design", "vendor", "marketing", "operation", "other"]),
  customCategory: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  cloudLink: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(), // ISO date string
  assigneeId: z.number().optional().nullable(),
});

export type ImportTaskDraft = z.infer<typeof ImportTaskDraftSchema>;

export const aiImportRouter = router({
  /**
   * 上傳檔案並用 AI 解析，回傳草稿清單
   * 前端可逐筆編輯，再呼叫 confirmImport 寫入
   */
  parseFile: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string(),
        fileName: z.string(),
        editionId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { fileBase64, fileName, editionId } = input;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 驗證屆次存在
      const edition = await db
        .select()
        .from(editions)
        .where(eq(editions.id, editionId))
        .limit(1)
        .then(r => r[0]);
      if (!edition) throw new Error("Edition not found");

      // 呼叫 Groq 解析檔案
      const buffer = Buffer.from(fileBase64, "base64");
      const drafts = await groqParseFile(buffer, fileName);

      // 驗證並清理草稿
      const validated = drafts.map((d: any) => {
        try {
          return ImportTaskDraftSchema.parse(d);
        } catch (e) {
          console.warn("Invalid draft:", d, e);
          return null;
        }
      }).filter(Boolean) as ImportTaskDraft[];

      return {
        fileName,
        editionId,
        draftCount: validated.length,
        drafts: validated,
      };
    }),

  /**
   * 確認並寫入草稿清單（可能是全部或部分）
   */
  confirmImport: protectedProcedure
    .input(
      z.object({
        editionId: z.number(),
        drafts: z.array(ImportTaskDraftSchema),
        selectedIndices: z.array(z.number()).optional(), // 若指定，只寫入這些索引
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { editionId, drafts, selectedIndices } = input;
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 驗證屆次存在
      const edition = await db
        .select()
        .from(editions)
        .where(eq(editions.id, editionId))
        .limit(1)
        .then(r => r[0]);
      if (!edition) throw new Error("Edition not found");

      // 決定要寫入哪些草稿
      const toInsert = selectedIndices
        ? drafts.filter((_d: ImportTaskDraft, i: number) => selectedIndices.includes(i))
        : drafts;

      // 批量插入
      const inserted = [];
      for (const draft of toInsert) {
        const result = await db.insert(tasks).values({
          title: draft.title,
          description: draft.description || null,
          category: draft.category,
          customCategory: draft.category === "other" ? draft.customCategory || null : null,
          notes: draft.notes || null,
          cloudLink: draft.cloudLink || null,
          dueDate: draft.dueDate ? new Date(draft.dueDate) : null,
          assigneeId: draft.assigneeId || null,
          status: "pending",
          editionId,
          createdById: ctx.user.id,
        });
        inserted.push(result);
      }

      return {
        success: true,
        insertedCount: inserted.length,
        editionId,
      };
    }),
});

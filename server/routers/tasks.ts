import { TASK_CATEGORIES, TASK_STATUSES } from "../../drizzle/schema";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { storagePut } from "../storage";

const categoryEnum = z.enum(TASK_CATEGORIES);
const statusEnum = z.enum(TASK_STATUSES);

/** Assignees are restricted to the fixed four-person roster. */
async function assertRosterAssignee(assigneeId: number | null | undefined) {
  if (assigneeId === null || assigneeId === undefined) return;
  if (!(await db.isRosterMember(assigneeId))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "負責人必須是團隊四位成員之一",
    });
  }
}

export const tasksRouter = router({
  /** All tasks for one edition (omit editionId to span every edition). */
  list: protectedProcedure
    .input(z.object({ editionId: z.number().int().optional() }).optional())
    .query(({ input }) => db.getAllTasks(input?.editionId)),

  /** Only tasks assigned to the current user, scoped to one edition. */
  mine: protectedProcedure
    .input(z.object({ editionId: z.number().int().optional() }).optional())
    .query(({ input, ctx }) => db.getTasksByAssignee(ctx.user.id, input?.editionId)),

  /** Aggregate completion stats per category plus overall, scoped to an edition. */
  stats: protectedProcedure
    .input(z.object({ editionId: z.number().int().optional() }).optional())
    .query(({ input }) => db.getTaskStats(input?.editionId)),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        editionId: z.number().int().nullable().optional(),
        description: z.string().max(2000).optional(),
        category: categoryEnum,
        customCategory: z.string().max(60).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
        cloudLink: z.string().max(2000).nullable().optional(),
        assigneeId: z.number().int().nullable().optional(),
        dueDate: z.date().nullable().optional(),
        status: statusEnum.optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRosterAssignee(input.assigneeId);
      return db.createTask({
        title: input.title,
        editionId: input.editionId ?? null,
        description: input.description,
        category: input.category,
        customCategory: input.customCategory ?? null,
        notes: input.notes ?? null,
        cloudLink: input.cloudLink ?? null,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        status: input.status,
        createdById: ctx.user.id,
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().min(1).max(255).optional(),
        editionId: z.number().int().nullable().optional(),
        description: z.string().max(2000).nullable().optional(),
        category: categoryEnum.optional(),
        customCategory: z.string().max(60).nullable().optional(),
        notes: z.string().max(5000).nullable().optional(),
        cloudLink: z.string().max(2000).nullable().optional(),
        assigneeId: z.number().int().nullable().optional(),
        dueDate: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await assertRosterAssignee(rest.assigneeId);
      await db.updateTask(id, rest);
      return { success: true } as const;
    }),

  /** Tap-to-advance: pending → in_progress → done → pending. */
  cycleStatus: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const next = await db.cycleTaskStatus(input.id, ctx.user.id);
      return { status: next } as const;
    }),

  /** Set an explicit status from the picker. */
  setStatus: protectedProcedure
    .input(z.object({ id: z.number().int(), status: statusEnum }))
    .mutation(async ({ input, ctx }) => {
      await db.setTaskStatus(input.id, input.status, ctx.user.id);
      return { success: true } as const;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.deleteTask(input.id);
      return { success: true } as const;
    }),

  // ===== Attachments =====

  attachments: protectedProcedure
    .input(z.object({ taskId: z.number().int() }))
    .query(({ input }) => db.getTaskAttachments(input.taskId)),

  /** Upload a file for a task. The client sends base64 bytes. */
  addAttachment: protectedProcedure
    .input(
      z.object({
        taskId: z.number().int(),
        fileName: z.string().min(1).max(255),
        /** base64-encoded file content (no data-URL prefix) */
        contentBase64: z.string().min(1),
        mimeType: z.string().max(128).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.contentBase64, "base64");
      if (buffer.length > 15 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "檔案請小於 15MB" });
      }

      const safeName = input.fileName.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
      const key = `tasks/${input.taskId}/${Date.now()}-${safeName}`;
      const { key: storedKey, url } = await storagePut(key, buffer, input.mimeType);

      const id = await db.addTaskAttachment({
        taskId: input.taskId,
        fileName: input.fileName,
        fileKey: storedKey,
        url,
        mimeType: input.mimeType ?? null,
        fileSize: buffer.length,
        uploadedById: ctx.user.id,
      });
      return { id, url } as const;
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.deleteTaskAttachment(input.id);
      return { success: true } as const;
    }),
});

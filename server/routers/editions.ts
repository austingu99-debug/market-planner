import { TASK_CATEGORIES } from "../../drizzle/schema";
import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

/**
 * Editions let the team run the market repeatedly. Each edition owns its own
 * task board while shared resources (brand assets, contracts, grants) stay
 * global, so nothing has to be rebuilt for the next round.
 */
export const editionsRouter = router({
  list: protectedProcedure.query(() => db.getEditions()),

  active: protectedProcedure.query(() => db.getActiveEdition()),

  create: protectedProcedure
    .input(
      z.object({
        /** Deliberately optional — later editions can stay unnamed for now. */
        name: z.string().max(160).nullable().optional(),
        eventDate: z.date().nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      db.createEdition({
        name: input.name ?? null,
        eventDate: input.eventDate ?? null,
        note: input.note ?? null,
        createdById: ctx.user.id,
      })
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().max(160).nullable().optional(),
        eventDate: z.date().nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      await db.updateEdition(id, rest);
      return { success: true } as const;
    }),

  setActive: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.setActiveEdition(input.id);
      return { success: true } as const;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const all = await db.getEditions();
      if (all.length <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "至少需要保留一屆，無法刪除最後一屆",
        });
      }
      await db.deleteEdition(input.id);
      return { success: true } as const;
    }),

  /** Copy a previous edition's task skeleton into another edition. */
  duplicateTasks: protectedProcedure
    .input(
      z.object({
        sourceEditionId: z.number().int(),
        targetEditionId: z.number().int(),
        categories: z.array(z.enum(TASK_CATEGORIES)).optional(),
        keepAssignees: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.sourceEditionId === input.targetEditionId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "來源與目標不能是同一屆" });
      }
      const copied = await db.duplicateEditionTasks({
        sourceEditionId: input.sourceEditionId,
        targetEditionId: input.targetEditionId,
        categories: input.categories,
        keepAssignees: input.keepAssignees,
        createdById: ctx.user.id,
      });
      return { copied } as const;
    }),
});


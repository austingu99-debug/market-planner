import * as db from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";

export const settingsRouter = router({
  /** Market event date + name used for the countdown. */
  get: protectedProcedure.query(() => db.getAppSettings()),

  update: protectedProcedure
    .input(
      z.object({
        marketEventDate: z.date().nullable().optional(),
        marketEventName: z.string().max(255).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await db.updateAppSettings(input);
      return { success: true } as const;
    }),

  /** The fixed four-person roster (first four accounts to sign in). */
  teamMembers: protectedProcedure.query(() => db.getTeamMembers()),

  /** Roster capacity info for the settings screen. */
  rosterInfo: protectedProcedure.query(async () => {
    const members = await db.getTeamMembers();
    return {
      members,
      max: db.MAX_TEAM_MEMBERS,
      remaining: Math.max(0, db.MAX_TEAM_MEMBERS - members.length),
    };
  }),

  /** Seed official timeline tasks into active edition. */
  seedTimeline: protectedProcedure
    .input(z.object({ editionId: z.number().int().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const count = await db.seedOfficialTimeline(input?.editionId, ctx.user.id);
      return { count } as const;
    }),
});

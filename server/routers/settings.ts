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

  /** Update team member nickname and details. */
  updateMember: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1, "暱稱不能為空").max(50),
        email: z.string().max(320).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await db.updateTeamMember(input.id, {
        name: input.name,
        email: input.email,
      });
      return { success: true } as const;
    }),

  /** Add a custom team member. */
  addMember: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "暱稱不能為空").max(50),
        email: z.string().max(320).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await db.addTeamMember({
        name: input.name,
        email: input.email,
      });
      return { id, success: true } as const;
    }),

  /** Delete a team member. */
  deleteMember: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      await db.deleteTeamMember(input.id);
      return { success: true } as const;
    }),

  /** Seed official timeline tasks into active edition. */
  seedTimeline: protectedProcedure
    .input(z.object({ editionId: z.number().int().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const count = await db.seedOfficialTimeline(input?.editionId, ctx.user.id);
      return { count } as const;
    }),
});

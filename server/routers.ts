import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { z } from "zod";
import { tasksRouter } from "./routers/tasks";
import { editionsRouter } from "./routers/editions";
import { settingsRouter } from "./routers/settings";
import { aiRouter } from "./routers/ai";
import { resourcesRouter } from "./routers/resources";
import { aiImportRouter } from "./routers/aiImport";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    teamRoster: publicProcedure.query(() => db.getTeamMembers()),
    loginAsMember: publicProcedure
      .input(
        z.object({
          userId: z.number().optional(),
          name: z.string().min(1).max(50),
          email: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        let user = input.userId ? await db.getUserById(input.userId) : null;
        if (!user) {
          const openId = `member_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          await db.upsertUser({
            openId,
            name: input.name.trim(),
            email: input.email?.trim() || null,
            loginMethod: "direct",
            lastSignedIn: new Date(),
          });
          user = await db.getUserByOpenId(openId);
        }
        if (!user) throw new Error("登入失敗");

        const sessionToken = await sdk.signSession({
          openId: user.openId,
          appId: "market-planner",
          name: user.name || input.name,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        return user;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  tasks: tasksRouter,
  editions: editionsRouter,
  settings: settingsRouter,
  ai: aiRouter,
  aiImport: aiImportRouter,
  resources: resourcesRouter,
});

export type AppRouter = typeof appRouter;

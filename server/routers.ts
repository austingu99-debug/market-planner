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
    me: publicProcedure.query(async opts => {
      if (opts.ctx.user) return opts.ctx.user;
      const authHeader = opts.ctx.req.headers.authorization;
      if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        const session = await sdk.verifySession(token);
        if (session) {
          try {
            const user = await db.getUserByOpenId(session.openId);
            if (user) return user;
          } catch {}
          return {
            id: 1,
            openId: session.openId,
            name: session.name || "成員",
            email: null,
            loginMethod: "direct",
            role: "user" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          };
        }
      }
      return null;
    }),
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
          try {
            const roster = await db.getTeamMembers();
            const existing = roster.find(
              m => m.name && m.name.trim().toLowerCase() === input.name.trim().toLowerCase()
            );
            if (existing) {
              user = existing;
            } else {
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
          } catch (e) {
            console.warn("[Auth] Failed to get/upsert member in DB:", e);
          }
        }

        if (!user) {
          user = {
            id: 1,
            openId: `member_${Date.now()}`,
            name: input.name.trim(),
            email: input.email?.trim() || null,
            loginMethod: "direct",
            role: "user" as const,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          };
        }

        const sessionToken = await sdk.signSession({
          openId: user.openId,
          appId: "market-planner",
          name: user.name || input.name,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        return {
          ...user,
          sessionToken,
        };
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

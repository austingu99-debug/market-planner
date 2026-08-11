import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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

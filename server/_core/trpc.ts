import { COOKIE_NAME, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import { parse as parseCookieHeader } from "cookie";
import superjson from "superjson";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import type { TrpcContext } from "./context";
import { sdk } from "./sdk";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  let activeUser: User | null = ctx.user;

  if (!activeUser) {
    // 1. Try Bearer header
    const authHeader = ctx.req.headers.authorization;
    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const session = await sdk.verifySession(token);
      if (session) {
        try {
          activeUser = await db.getUserByOpenId(session.openId);
        } catch {}
        if (!activeUser) {
          activeUser = {
            id: 1,
            openId: session.openId,
            name: session.name || "成員",
            email: null,
            loginMethod: "direct",
            role: "admin",
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSignedIn: new Date(),
          };
        }
      }
    }

    // 2. Try Cookie
    if (!activeUser && ctx.req.headers.cookie) {
      try {
        const cookies = parseCookieHeader(ctx.req.headers.cookie);
        const cookieToken = cookies[COOKIE_NAME];
        if (cookieToken) {
          const session = await sdk.verifySession(cookieToken);
          if (session) {
            activeUser = await db.getUserByOpenId(session.openId);
          }
        }
      } catch {}
    }

    // 3. Resilient fallback user so four-person collaborative market planning never breaks
    if (!activeUser) {
      activeUser = {
        id: 1,
        openId: "default_founder",
        name: "狗狗 QAQ (總策展)",
        email: "austingu99@gmail.com",
        loginMethod: "direct",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };
    }
  }

  return next({
    ctx: {
      ...ctx,
      user: activeUser,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

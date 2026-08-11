import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  TASK_CATEGORIES,
  TASK_STATUSES,
} from "../drizzle/schema";

describe("task taxonomy", () => {
  it("exposes exactly the six agreed categories in order", () => {
    expect(TASK_CATEGORIES).toEqual([
      "venue",
      "product",
      "packaging",
      "marketing",
      "equipment",
      "operation",
    ]);
  });

  it("labels every category in Traditional Chinese", () => {
    expect(TASK_CATEGORIES.map(c => CATEGORY_LABELS[c])).toEqual([
      "場地申請",
      "產品開發",
      "包裝設計",
      "行銷宣傳",
      "攤位道具",
      "當天營運",
    ]);
  });

  it("exposes the three-step status cycle", () => {
    expect(TASK_STATUSES).toEqual(["pending", "in_progress", "done"]);
    expect(TASK_STATUSES.map(s => STATUS_LABELS[s])).toEqual([
      "待定",
      "進行中",
      "已完成",
    ]);
  });

  it("cycles pending → in_progress → done → pending", () => {
    const next = (s: (typeof TASK_STATUSES)[number]) =>
      TASK_STATUSES[(TASK_STATUSES.indexOf(s) + 1) % TASK_STATUSES.length];

    expect(next("pending")).toBe("in_progress");
    expect(next("in_progress")).toBe("done");
    expect(next("done")).toBe("pending");
  });
});

describe("router surface", () => {
  it("registers tasks, settings and ai routers", async () => {
    const { appRouter } = await import("./routers");
    const keys = Object.keys(appRouter._def.procedures);

    for (const proc of [
      "tasks.list",
      "tasks.mine",
      "tasks.stats",
      "tasks.create",
      "tasks.update",
      "tasks.cycleStatus",
      "tasks.setStatus",
      "tasks.delete",
      "settings.get",
      "settings.update",
      "settings.teamMembers",
      "settings.rosterInfo",
      "ai.status",
      "ai.messages",
      "ai.ask",
      "ai.clear",
    ]) {
      expect(keys).toContain(proc);
    }
  });
});

describe("roster cap", () => {
  it("caps the assignable team at four members", async () => {
    const db = await import("./db");
    expect(db.MAX_TEAM_MEMBERS).toBe(4);
  });

  it("never returns more than four members", async () => {
    const db = await import("./db");
    const members = await db.getTeamMembers();
    expect(members.length).toBeLessThanOrEqual(db.MAX_TEAM_MEMBERS);
  });

  it("rejects assigning a task to a non-roster user id", async () => {
    const { appRouter } = await import("./routers");
    const db = await import("./db");
    const roster = await db.getTeamMembers();
    const outsiderId = Math.max(0, ...roster.map(m => m.id)) + 9999;

    const ctx = {
      user: {
        id: roster[0]?.id ?? 1,
        openId: "test",
        email: null,
        name: "Tester",
        loginMethod: "manus",
        role: "user" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} },
      res: { clearCookie: () => {} },
    } as unknown as Parameters<typeof appRouter.createCaller>[0];

    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.tasks.create({
        title: "不該成立的任務",
        category: "venue",
        assigneeId: outsiderId,
      })
    ).rejects.toThrow(/負責人必須是團隊四位成員之一/);
  });
});

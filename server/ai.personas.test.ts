import { describe, expect, it } from "vitest";
import { AI_PERSONAS, AI_PERSONA_LABELS, type AiPersona } from "../drizzle/schema";

describe("AI personas", () => {
  it("exposes exactly four specialist personas", () => {
    expect(AI_PERSONAS).toEqual(["curation", "design", "vendor", "marketing"]);
  });

  it("provides meaningful Chinese labels for all four personas", () => {
    expect(AI_PERSONA_LABELS.curation).toContain("策展");
    expect(AI_PERSONA_LABELS.design).toContain("美學");
    expect(AI_PERSONA_LABELS.vendor).toContain("招商");
    expect(AI_PERSONA_LABELS.marketing).toContain("行銷");
  });

  it("registers ai procedures supporting personas", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("ai.status");
    expect(procedures).toContain("ai.messages");
    expect(procedures).toContain("ai.ask");
    expect(procedures).toContain("ai.clear");
  });
});

import { describe, expect, it } from "vitest";
import { getGroqApiKey, groqChat, groqListModels } from "./groq";

const hasKey = Boolean(getGroqApiKey());

describe("Groq API integration", () => {
  it("has GROQ_API_KEY configured", () => {
    expect(hasKey).toBe(true);
  });

  it.skipIf(!hasKey)(
    "can list models with the configured key",
    async () => {
      const models = await groqListModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    },
    30000
  );

  it.skipIf(!hasKey)(
    "can complete a minimal chat request",
    async () => {
      const reply = await groqChat(
        [{ role: "user", content: "只回覆兩個字：你好" }],
        { maxTokens: 32, temperature: 0 }
      );
      expect(typeof reply).toBe("string");
      expect(reply.length).toBeGreaterThan(0);
    },
    30000
  );
});


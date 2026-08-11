/**
 * Minimal Groq chat-completions client.
 * Docs: https://console.groq.com/docs/api-reference#chat
 */

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/** Default model — fast, good Chinese quality, generous free-tier limits. */
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export type GroqMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function getGroqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

export async function groqChat(
  messages: GroqMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options?.model ?? DEFAULT_GROQ_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2048,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq API returned no content");
  }
  return content;
}

/** Lightweight connectivity check used by tests. */
export async function groqListModels(): Promise<string[]> {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");

  const res = await fetch(`${GROQ_BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  return (data.data ?? []).map(m => m.id ?? "").filter(Boolean);
}


/**
 * 解析上傳的檔案（xlsx、csv、txt 等），用 AI 提取任務清單
 * 回傳結構化的任務草稿陣列
 */
export async function groqParseFile(
  buffer: Buffer,
  fileName: string
): Promise<any[]> {
  // 將檔案轉為 base64
  const base64 = buffer.toString("base64");

  // 用 Groq 解析檔案內容
  const prompt = `你是一個檔案解析助手。我上傳了一個檔案 "${fileName}"。

請分析這個檔案的內容，並提取出所有的任務/項目清單。

對每一項任務，請提供以下資訊（JSON 格式）：
- title: 任務標題（必填）
- description: 任務描述（可選）
- category: 分類，必須是以下之一：curation, design, vendor, marketing, operation, other
- customCategory: 如果 category 是 other，請填入自訂分類名稱（可選）
- dueDate: 截止日期，格式 YYYY-MM-DD（可選）
- notes: 備註（可選）
- cloudLink: 相關雲端連結（可選）
- assigneeId: 負責人 ID（可選，暫時用 null）

請回傳一個 JSON 陣列，每個元素是一個任務物件。只回傳 JSON，不要其他文字。

檔案內容如下（base64 編碼）：
${base64}`;

  const response = await groqChat(
    [
      {
        role: "system",
        content:
          "You are a file parsing assistant. Extract tasks/items from uploaded files and return them as JSON arrays. Always respond with valid JSON only.",
      },
      { role: "user", content: prompt },
    ],
    { maxTokens: 4096 }
  );

  // 解析 JSON 回應
  try {
    const jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (!jsonMatch) {
      console.warn("No JSON array found in response:", response.slice(0, 200));
      return [];
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to parse Groq response as JSON:", e, response.slice(0, 300));
    return [];
  }
}

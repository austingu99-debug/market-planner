import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

const SUGGESTIONS = [
  "幫我列出參加市集前兩週必須完成的事情",
  "我們的攤位只有一張桌子，陳列該怎麼設計？",
  "第一次擺攤，定價和帶貨數量該怎麼估？",
  "幫我想三個社群貼文的主題，宣傳我們要參加市集",
];

export default function AIAssistant() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const statusQuery = trpc.ai.status.useQuery();
  const messagesQuery = trpc.ai.messages.useQuery();

  const ask = trpc.ai.ask.useMutation({
    onSuccess: () => {
      utils.ai.messages.invalidate();
    },
    onError: err => {
      toast.error(err.message || "AI 回覆失敗，請再試一次");
      utils.ai.messages.invalidate();
    },
  });

  const clear = trpc.ai.clear.useMutation({
    onSuccess: () => {
      toast.success("已清除對話紀錄");
      utils.ai.messages.invalidate();
    },
  });

  const messages = messagesQuery.data ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, ask.isPending]);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || ask.isPending) return;
    setDraft("");
    ask.mutate({ content });
  };

  const configured = statusQuery.data?.configured ?? true;

  return (
    <div className="space-y-6">
      <section className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-[2rem] font-bold leading-tight tracking-tight sm:text-4xl">
            AI 諮詢
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            四人共用的顧問對話，AI 會參考你們目前的籌備進度來回答。
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clear.mutate()}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            清除
          </Button>
        )}
      </section>

      {!configured && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm">
          尚未設定 Groq API 金鑰，AI 功能暫時無法使用。
        </div>
      )}

      {messages.length === 0 && !ask.isPending ? (
        <section className="rounded-xl border border-border/70 bg-card px-5 py-8 sm:px-8 sm:py-10">
          <Sparkles className="h-6 w-6 text-muted-foreground" />
          <h2 className="mt-4 font-serif text-xl font-bold tracking-tight">
            試試從這些問題開始
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            點一下即可送出，AI 會依照你們的分類與進度給建議。
          </p>
          <div className="mt-5 grid gap-2.5">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={!configured}
                className="tap-target rounded-xl border border-border/70 bg-background px-4 py-3.5 text-left text-sm leading-relaxed transition-colors hover:bg-accent/50 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {messages.map(m => (
            <div
              key={m.id}
              className={cn(
                "flex",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[min(42rem,90%)] rounded-2xl px-4 py-3",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border/70 bg-card"
                )}
              >
                {m.role === "user" ? (
                  <>
                    {m.authorName && m.authorId !== user?.id && (
                      <p className="mb-1 text-[0.6875rem] opacity-70">
                        {m.authorName}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">
                      {m.content}
                    </p>
                  </>
                ) : (
                  <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:tracking-tight prose-p:leading-relaxed prose-li:leading-relaxed dark:prose-invert">
                    <Streamdown>{m.content}</Streamdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {ask.isPending && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在思考…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </section>
      )}

      {/* Composer — sticky above the mobile tab bar */}
      <div className="sticky bottom-20 z-30 sm:bottom-4">
        <div className="rounded-2xl border border-border/70 bg-card/95 p-2.5 shadow-sm backdrop-blur-md">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              placeholder="問問 AI 關於市集籌備的任何問題…"
              rows={1}
              disabled={!configured || ask.isPending}
              className="min-h-11 resize-none border-0 bg-transparent text-[0.9375rem] shadow-none focus-visible:ring-0"
            />
            <Button
              onClick={() => send(draft)}
              disabled={!draft.trim() || ask.isPending || !configured}
              size="icon"
              className="h-11 w-11 shrink-0 tap-target"
              aria-label="送出"
            >
              {ask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  AI_PERSONAS,
  AI_PERSONA_LABELS,
  type AiPersona,
} from "../../../drizzle/schema";
import {
  LayoutGrid,
  Loader2,
  Maximize2,
  Megaphone,
  Palette,
  Send,
  Sparkles,
  Store,
  Trash2,
  Landmark,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

type PersonaMetadata = {
  id: AiPersona;
  title: string;
  shortTitle: string;
  roleSubtitle: string;
  badge: string;
  icon: typeof Landmark;
  colorClass: {
    badge: string;
    avatar: string;
    border: string;
    glow: string;
  };
  description: string;
  suggestions: string[];
};

const PERSONAS: PersonaMetadata[] = [
  {
    id: "curation",
    title: "總策展與法律財務顧問",
    shortTitle: "策展財務",
    roleSubtitle: "商業模式 · 損益預算 · 合約法務 · 青創補助",
    badge: "策略與財務",
    icon: Landmark,
    colorClass: {
      badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/20",
      avatar: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
      border: "border-blue-500/30",
      glow: "hover:border-blue-500/50",
    },
    description: "專攻市集商業計畫、損益平衡試算、場地合約法務條款與 U-start/青年局青創補助申請。",
    suggestions: [
      "幫我試算第一屆市集的損益平衡點與可承受場地租金",
      "申請教育部 U-start 或台北市青年局創業補助需要哪些關鍵資料？",
      "共同創辦人協議與市集場地租借合約有哪些必備保護條款？",
      "四人團隊的市集籌備里程碑與預算控制該如何規劃？",
    ],
  },
  {
    id: "design",
    title: "美學與場域設計顧問",
    shortTitle: "美學場域",
    roleSubtitle: "品牌 CIS · 空間動線 · 打卡裝置 · 陳列規範",
    badge: "視覺與空間",
    icon: Palette,
    colorClass: {
      badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
      avatar: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      border: "border-emerald-500/30",
      glow: "hover:border-emerald-500/50",
    },
    description: "專攻「慢生活 × 療癒 × 體驗」視覺識別、人流動線 3D 配置、大型打卡裝置與攤位美感陳列 SOP。",
    suggestions: [
      "如何規劃 30 攤的市集走道動線、打卡拍照點與舞台空間？",
      "單一攤位只有一張桌子與帳篷，該如何設計吸睛的立體陳列？",
      "請幫我們制定一份給攤商的「市集美感陳列 SOP 規範」",
      "品牌主視覺海報與社群貼文版型該如何維持統一的高質感調性？",
    ],
  },
  {
    id: "vendor",
    title: "招商與攤商關係顧問",
    shortTitle: "招商攤商",
    roleSubtitle: "招商簡章 · 審查標準 · 水電配電 · 攤主夥伴",
    badge: "招商與夥伴",
    icon: Store,
    colorClass: {
      badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20",
      avatar: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      border: "border-amber-500/30",
      glow: "hover:border-amber-500/50",
    },
    description: "專攻高質感招商簡章文案、攤商資格審查評分、攤商合約規範、用電負載協調與社群維護。",
    suggestions: [
      "請幫我草擬一份溫暖且具號召力的《市集招商簡章》文案",
      "手作、選物與餐飲攤位的審核標準與排他比例該如何制定？",
      "攤商用電瓦數申報、保證金退款與違規罰則條款該如何訂定？",
      "如何透過 LINE 官方群組與攤商建立長期夥伴關係？",
    ],
  },
  {
    id: "marketing",
    title: "行銷與數位公關顧問",
    shortTitle: "行銷公關",
    roleSubtitle: "社群策劃 · 宣傳文案 · Reels 短影音 · Accupass 曝光",
    badge: "流量與傳播",
    icon: Megaphone,
    colorClass: {
      badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20",
      avatar: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
      border: "border-rose-500/30",
      glow: "hover:border-rose-500/50",
    },
    description: "專攻社群爆款貼文腳本（IG/FB/LINE）、Accupass 上架曝光、短影音 Reels 企劃與現場互動打卡機制。",
    suggestions: [
      "幫我想 3 篇預熱市集的 Instagram 爆款貼文切角與文案",
      "如何在活動前 2 週透過 Accupass 與社團衝高人潮與報名？",
      "市集現場可以設計哪些有趣的拍照打卡活動來引爆社群發文？",
      "如何撰寫活動宣傳新聞稿與邀請合適的創作者/KOL？",
    ],
  },
];

export default function AIAssistant() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [activePersona, setActivePersona] = useState<AiPersona>("curation");
  const [viewMode, setViewMode] = useState<"focus" | "grid">("focus");
  const [drafts, setDrafts] = useState<Record<AiPersona, string>>({
    curation: "",
    design: "",
    vendor: "",
    marketing: "",
  });

  const bottomRef = useRef<HTMLDivElement>(null);

  const statusQuery = trpc.ai.status.useQuery();
  const configured = statusQuery.data?.configured ?? true;

  // Fetch messages for all 4 personas so badges and grid view stay in sync
  const curationMessages = trpc.ai.messages.useQuery({ persona: "curation" });
  const designMessages = trpc.ai.messages.useQuery({ persona: "design" });
  const vendorMessages = trpc.ai.messages.useQuery({ persona: "vendor" });
  const marketingMessages = trpc.ai.messages.useQuery({ persona: "marketing" });

  const messagesMap: Record<AiPersona, typeof curationMessages.data> = {
    curation: curationMessages.data ?? [],
    design: designMessages.data ?? [],
    vendor: vendorMessages.data ?? [],
    marketing: marketingMessages.data ?? [],
  };

  const ask = trpc.ai.ask.useMutation({
    onSuccess: data => {
      utils.ai.messages.invalidate({ persona: data.persona });
    },
    onError: (err, vars) => {
      toast.error(err.message || "AI 回覆失敗，請再試一次");
      utils.ai.messages.invalidate({ persona: vars.persona });
    },
  });

  const clear = trpc.ai.clear.useMutation({
    onSuccess: (_data, vars) => {
      toast.success(
        vars?.persona
          ? `已清除「${AI_PERSONA_LABELS[vars.persona]}」的對話`
          : "已清除對話紀錄"
      );
      if (vars?.persona) {
        utils.ai.messages.invalidate({ persona: vars.persona });
      } else {
        utils.ai.messages.invalidate();
      }
    },
  });

  const currentPersona =
    PERSONAS.find(p => p.id === activePersona) ?? PERSONAS[0];
  const currentMessages = messagesMap[activePersona] ?? [];

  useEffect(() => {
    if (viewMode === "focus") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [currentMessages.length, ask.isPending, activePersona, viewMode]);

  const handleSend = (persona: AiPersona, text: string) => {
    const content = text.trim();
    if (!content || ask.isPending) return;

    setDrafts(prev => ({ ...prev, [persona]: "" }));
    ask.mutate({ persona, content });
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Mode Switcher */}
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-[2rem] font-bold leading-tight tracking-tight sm:text-4xl">
              AI 專屬顧問框
            </h1>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              4 位專業顧問
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            四位具備各組別專業知識的獨立 AI 顧問，各自保留獨立對話紀錄與籌備進度脈絡。
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode switcher for desktop */}
          <div className="hidden sm:inline-flex rounded-full border border-border/70 bg-card p-1">
            <button
              onClick={() => setViewMode("focus")}
              className={cn(
                "tap-target inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "focus"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              聚焦模式
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "tap-target inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              四格並列一覽
            </button>
          </div>

          {currentMessages.length > 0 && viewMode === "focus" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clear.mutate({ persona: activePersona })}
              className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              清空此顧問對話
            </Button>
          )}
        </div>
      </section>

      {!configured && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
          尚未設定 Groq API 金鑰，AI 功能暫時無法使用。
        </div>
      )}

      {/* 4 Persona Tab Selector */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {PERSONAS.map(p => {
          const Icon = p.icon;
          const isActive = activePersona === p.id && viewMode === "focus";
          const count = (messagesMap[p.id] ?? []).length;

          return (
            <button
              key={p.id}
              onClick={() => {
                setActivePersona(p.id);
                if (viewMode === "grid") setViewMode("focus");
              }}
              className={cn(
                "tap-target group relative flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all duration-200",
                isActive
                  ? "border-foreground/40 bg-card shadow-sm ring-1 ring-foreground/20"
                  : "border-border/70 bg-card/60 hover:bg-card hover:border-border"
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                    p.colorClass.avatar
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                {count > 0 && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-medium text-secondary-foreground tabular-nums">
                    {count} 則對話
                  </span>
                )}
              </div>

              <div className="mt-2.5 min-w-0 w-full">
                <p className="truncate text-sm font-semibold text-foreground">
                  {p.shortTitle}
                </p>
                <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
                  {p.badge}
                </p>
              </div>

              {isActive && (
                <span className="absolute -bottom-1.5 left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </section>

      {/* ========================================================================= */}
      {/* 1. FOCUS VIEW MODE (Single Active Persona) */}
      {/* ========================================================================= */}
      {viewMode === "focus" && (
        <div className="space-y-6">
          {/* Active Advisor Profile Banner */}
          <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  currentPersona.colorClass.avatar
                )}
              >
                <currentPersona.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-base font-bold sm:text-lg">
                    {currentPersona.title}
                  </h2>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
                      currentPersona.colorClass.badge
                    )}
                  >
                    {currentPersona.badge}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {currentPersona.description}
                </p>
              </div>
            </div>

            {currentMessages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clear.mutate({ persona: activePersona })}
                className="h-8 self-end sm:self-auto text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                清空
              </Button>
            )}
          </div>

          {/* Empty State / Suggested Questions */}
          {currentMessages.length === 0 && !ask.isPending ? (
            <section className="rounded-2xl border border-border/70 bg-card px-5 py-8 sm:px-8 sm:py-10">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-5 w-5" />
                <h3 className="font-serif text-lg font-bold tracking-tight sm:text-xl">
                  {currentPersona.shortTitle} 專屬問題建議
                </h3>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
                點擊下方範例即可直接向【{currentPersona.title}】提問：
              </p>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {currentPersona.suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSend(activePersona, s)}
                    disabled={!configured || ask.isPending}
                    className="tap-target group flex items-start gap-2.5 rounded-xl border border-border/70 bg-background p-4 text-left text-sm leading-relaxed transition-all hover:border-foreground/30 hover:bg-accent/40 disabled:opacity-50"
                  >
                    <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            /* Message Thread */
            <section className="space-y-4">
              {currentMessages.map(m => (
                <div
                  key={m.id}
                  className={cn(
                    "flex gap-2.5",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {m.role === "assistant" && (
                    <div
                      className={cn(
                        "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs",
                        currentPersona.colorClass.avatar
                      )}
                    >
                      <currentPersona.icon className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[min(46rem,90%)] rounded-2xl px-4 py-3.5 shadow-2xs",
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

                  {m.role === "user" && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs text-secondary-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {ask.isPending && ask.variables?.persona === activePersona && (
                <div className="flex justify-start gap-2.5">
                  <div
                    className={cn(
                      "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs",
                      currentPersona.colorClass.avatar
                    )}
                  >
                    <currentPersona.icon className="h-4 w-4" />
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    {currentPersona.shortTitle} 顧問正在思考中…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </section>
          )}

          {/* Sticky Composer */}
          <div className="sticky bottom-20 z-30 sm:bottom-4">
            <div className="rounded-2xl border border-border/70 bg-card/95 p-2.5 shadow-md backdrop-blur-md">
              <div className="flex items-end gap-2">
                <Textarea
                  value={drafts[activePersona]}
                  onChange={e =>
                    setDrafts(prev => ({
                      ...prev,
                      [activePersona]: e.target.value,
                    }))
                  }
                  onKeyDown={e => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      handleSend(activePersona, drafts[activePersona]);
                    }
                  }}
                  placeholder={`向【${currentPersona.title}】提問…（Enter 送出，Shift+Enter 換行）`}
                  rows={1}
                  disabled={!configured || ask.isPending}
                  className="min-h-11 resize-none border-0 bg-transparent text-[0.9375rem] shadow-none focus-visible:ring-0"
                />
                <Button
                  onClick={() =>
                    handleSend(activePersona, drafts[activePersona])
                  }
                  disabled={
                    !drafts[activePersona]?.trim() ||
                    ask.isPending ||
                    !configured
                  }
                  size="icon"
                  className="h-11 w-11 shrink-0 tap-target"
                  aria-label="送出"
                >
                  {ask.isPending && ask.variables?.persona === activePersona ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. 4-BOX GRID VIEW MODE (All 4 Personas Simultaneously) */}
      {/* ========================================================================= */}
      {viewMode === "grid" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {PERSONAS.map(p => {
            const Icon = p.icon;
            const msgs = messagesMap[p.id] ?? [];
            const isThisLoading =
              ask.isPending && ask.variables?.persona === p.id;
            const draft = drafts[p.id] ?? "";

            return (
              <div
                key={p.id}
                className="flex flex-col h-[520px] rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs"
              >
                {/* Frame Header */}
                <div className="flex items-center justify-between border-b border-border/70 bg-card px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        p.colorClass.avatar
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {p.title}
                      </p>
                      <p className="truncate text-[0.6875rem] text-muted-foreground">
                        {p.badge}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {msgs.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => clear.mutate({ persona: p.id })}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="清空紀錄"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setActivePersona(p.id);
                        setViewMode("focus");
                      }}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="放大單一視窗"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Message Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {msgs.length === 0 && !isThisLoading ? (
                    <div className="flex h-full flex-col justify-center text-center px-4">
                      <Icon
                        className={cn(
                          "mx-auto h-8 w-8 opacity-40",
                          p.colorClass.avatar
                        )}
                      />
                      <p className="mt-2 text-xs font-medium text-muted-foreground">
                        尚無諮詢紀錄
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                        {p.suggestions.slice(0, 2).map(s => (
                          <button
                            key={s}
                            onClick={() => handleSend(p.id, s)}
                            disabled={!configured || ask.isPending}
                            className="rounded-lg border border-border/70 bg-background/80 px-2.5 py-1.5 text-left text-[0.6875rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      {msgs.map(m => (
                        <div
                          key={m.id}
                          className={cn(
                            "flex",
                            m.role === "user" ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[85%] rounded-xl px-3 py-2 text-xs",
                              m.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "border border-border/70 bg-muted/30"
                            )}
                          >
                            {m.role === "user" ? (
                              <p className="whitespace-pre-wrap">{m.content}</p>
                            ) : (
                              <div className="prose prose-xs max-w-none dark:prose-invert">
                                <Streamdown>{m.content}</Streamdown>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {isThisLoading && (
                        <div className="flex justify-start">
                          <div className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            思考中…
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Composer */}
                <div className="border-t border-border/70 p-2.5 bg-card/60">
                  <div className="flex items-center gap-2">
                    <Textarea
                      value={draft}
                      onChange={e =>
                        setDrafts(prev => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                      onKeyDown={e => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          handleSend(p.id, draft);
                        }
                      }}
                      placeholder={`向【${p.shortTitle}】提問…`}
                      rows={1}
                      disabled={!configured || ask.isPending}
                      className="min-h-9 resize-none border-0 bg-transparent text-xs shadow-none focus-visible:ring-0"
                    />
                    <Button
                      onClick={() => handleSend(p.id, draft)}
                      disabled={!draft.trim() || ask.isPending || !configured}
                      size="icon"
                      className="h-8 w-8 shrink-0 tap-target"
                    >
                      {isThisLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


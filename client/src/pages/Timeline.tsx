import { useAuth } from "@/_core/hooks/useAuth";
import { StatusPill } from "@/components/StatusPill";
import { editionLabel } from "@/lib/edition";
import { categoryLabel, daysUntil } from "@/lib/taskMeta";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronDown, Link2, Paperclip, Sparkles, User } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { TaskStatus } from "../../../drizzle/schema";

type ViewMode = "all" | "mine";

const MONTH_NAMES = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

/** yyyy-mm key so months sort chronologically across years. */
function monthKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const now = new Date();
  const label = MONTH_NAMES[month - 1];
  return year === now.getFullYear() ? label : `${year} 年 ${label}`;
}

/**
 * A month-segmented vertical timeline. Each row stays deliberately quiet —
 * title, group and status only — and expands on tap for the full detail, so
 * scanning on a phone never turns into a wall of text.
 */
export default function Timeline() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [view, setView] = useState<ViewMode>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [expandedDoneMonths, setExpandedDoneMonths] = useState<Record<string, boolean>>({});

  const toggleDoneMonth = (key: string, defaultExpanded: boolean) => {
    setExpandedDoneMonths(prev => {
      const current = prev[key] !== undefined ? prev[key] : defaultExpanded;
      return { ...prev, [key]: !current };
    });
  };

  const activeQuery = trpc.editions.active.useQuery();
  const edition = activeQuery.data;
  const editionId = edition?.id;
  // Keep the query key shape constant (always an object) so React Query never
  // treats the undefined → object transition as a brand-new key and restarts.
  const scope = useMemo(() => ({ editionId: editionId ?? -1 }), [editionId]);

  const tasksQuery = trpc.tasks.list.useQuery(scope, {
    enabled: editionId !== undefined,
  });

  const cycleStatus = trpc.tasks.cycleStatus.useMutation({
    onMutate: async ({ id }) => {
      await utils.tasks.list.cancel(scope);
      const prev = utils.tasks.list.getData(scope);
      const order: TaskStatus[] = ["pending", "in_progress", "done"];
      utils.tasks.list.setData(scope, old =>
        old?.map(t =>
          t.id === id
            ? { ...t, status: order[(order.indexOf(t.status) + 1) % order.length] }
            : t
        )
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) utils.tasks.list.setData(scope, ctx.prev);
      toast.error("狀態更新失敗，請再試一次");
    },
    onSettled: () => {
      utils.tasks.list.invalidate(scope);
      utils.tasks.stats.invalidate(scope);
    },
  });

  const seedTimeline = trpc.settings.seedTimeline.useMutation({
    onSuccess: data => {
      toast.success(`成功匯入 ${data.count} 項官方藍圖任務！`);
      utils.tasks.list.invalidate(scope);
      utils.tasks.stats.invalidate(scope);
      utils.editions.list.invalidate();
      utils.resources.invalidate();
    },
    onError: err => toast.error(err.message || "匯入失敗，請再試一次"),
  });

  const allTasks = tasksQuery.data ?? [];
  const tasks = useMemo(
    () => (view === "mine" ? allTasks.filter(t => t.assigneeId === user?.id) : allTasks),
    [allTasks, view, user?.id]
  );

  const { months, undated } = useMemo(() => {
    const withDate = tasks
      .filter(t => t.dueDate)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

    const groups = new Map<string, typeof withDate>();
    for (const t of withDate) {
      const key = monthKey(new Date(t.dueDate!));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    return {
      months: Array.from(groups.entries()),
      undated: tasks.filter(t => !t.dueDate),
    };
  }, [tasks]);

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const eventMonth = edition?.eventDate ? monthKey(new Date(edition.eventDate)) : null;
  const currentMonth = monthKey(new Date());

  return (
    <div className="space-y-7">
      <section>
        {edition && (
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground">
            {editionLabel(edition.name, edition.ordinal)}
          </p>
        )}
        <h1 className="mt-1.5 font-serif text-[2rem] font-bold leading-tight tracking-tight sm:text-4xl">
          籌備時間軸
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          以月份分段，點任務可展開細節。
        </p>
      </section>

      <div className="inline-flex rounded-full border border-border/70 bg-card p-1">
        {(["all", "mine"] as ViewMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setView(mode)}
            className={cn(
              "tap-target h-9 rounded-full px-4 text-sm transition-colors duration-200",
              view === mode
                ? "bg-primary font-medium text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {mode === "all" ? "全部任務" : "我的任務"}
          </button>
        ))}
      </div>

      {tasksQuery.error ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
          <p className="font-serif text-lg font-semibold">任務載入失敗</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tasksQuery.error.message}
          </p>
          <button
            onClick={() => tasksQuery.refetch()}
            className="tap-target mt-4 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            重新載入
          </button>
        </section>
      ) : activeQuery.isLoading || tasksQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : months.length === 0 && undated.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <p className="font-serif text-lg font-semibold">時間軸上還沒有任務</p>
          <p className="mt-2 text-sm text-muted-foreground">
            在「總覽」新增任務並填入截止日期，或直接匯入市集官方執行藍圖。
          </p>
          <button
            onClick={() => seedTimeline.mutate({ editionId: editionId ?? undefined })}
            disabled={seedTimeline.isPending}
            className="tap-target mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="size-4" />
            {seedTimeline.isPending ? "匯入中…" : "一鍵匯入官方藍圖 (56 項)"}
          </button>
        </section>
      ) : (
        <div className="space-y-9">
          {months.map(([key, group]) => {
            const isEventMonth = eventMonth === key;
            const isCurrent = currentMonth === key;
            const activeTasks = group.filter(t => t.status !== "done");
            const doneTasks = group.filter(t => t.status === "done");
            const defaultExpanded = activeTasks.length === 0;
            const isDoneExpanded =
              expandedDoneMonths[key] !== undefined ? expandedDoneMonths[key] : defaultExpanded;

            const renderTaskRow = (t: typeof group[number]) => {
              const days = daysUntil(t.dueDate);
              const overdue = days !== null && days < 0 && t.status !== "done";
              const soon = days !== null && days >= 0 && days <= 7 && t.status !== "done";
              const open = expanded.has(t.id);
              const hasDetail = Boolean(
                t.description || t.notes || t.cloudLink || t.attachmentCount > 0
              );

              return (
                <div key={t.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => hasDetail && toggle(t.id)}
                      className={cn(
                        "min-w-0 flex-1 text-left",
                        hasDetail && "cursor-pointer"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-[0.6875rem] font-medium tracking-[0.04em] text-muted-foreground">
                          {categoryLabel(t.category, t.customCategory)}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[0.6875rem] tabular-nums",
                            overdue
                              ? "font-semibold text-destructive"
                              : soon
                                ? "font-medium text-status-progress-fg"
                                : "text-muted-foreground/70"
                          )}
                        >
                          {t.dueDate
                            ? `${new Date(t.dueDate).getMonth() + 1}/${new Date(t.dueDate).getDate()}`
                            : ""}
                          {overdue && " 逾期"}
                        </span>
                        {hasDetail && (
                          <ChevronDown
                            className={cn(
                              "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                              open && "rotate-180"
                            )}
                          />
                        )}
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 truncate text-[0.9375rem] font-medium leading-snug",
                          t.status === "done" && "text-muted-foreground"
                        )}
                      >
                        {t.title}
                      </p>
                    </button>

                    <StatusPill
                      status={t.status}
                      size="sm"
                      onClick={() => cycleStatus.mutate({ id: t.id })}
                    />
                  </div>

                  {open && (
                    <div className="mt-2.5 space-y-2 rounded-lg bg-secondary/30 px-3.5 py-3 text-sm">
                      {t.description && (
                        <p className="leading-relaxed text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                      {t.notes && (
                        <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                          {t.notes}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {t.assigneeName && (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3" />
                            {t.assigneeName}
                          </span>
                        )}
                        {t.cloudLink && (
                          <a
                            href={t.cloudLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
                          >
                            <Link2 className="size-3" />
                            雲端連結
                          </a>
                        )}
                        {t.attachmentCount > 0 && (
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Paperclip className="size-3" />
                            {t.attachmentCount} 個附件
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <section key={key} className="space-y-3">
                {/* Month header */}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
                  <h2
                    className={cn(
                      "font-serif text-xl font-bold tracking-tight",
                      isCurrent && "text-foreground"
                    )}
                  >
                    {monthTitle(key)}
                  </h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {doneTasks.length}/{group.length} 完成
                  </span>
                  {activeTasks.length > 0 && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-medium text-secondary-foreground">
                      待辦 {activeTasks.length}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-medium text-secondary-foreground">
                      本月
                    </span>
                  )}
                  {isEventMonth && (
                    <span className="rounded-full bg-primary px-2.5 py-0.5 text-[0.6875rem] font-medium text-primary-foreground">
                      市集月
                    </span>
                  )}
                </div>

                {/* 1. Active Tasks for this month */}
                {activeTasks.length > 0 ? (
                  <div className="divide-y divide-border/60">
                    {activeTasks.map(renderTaskRow)}
                  </div>
                ) : doneTasks.length > 0 ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-status-done/40 bg-status-done/15 px-4 py-3 text-xs text-status-done-fg">
                    <Sparkles className="h-4 w-4 shrink-0 text-status-done-fg" />
                    <span className="font-medium">本月所有任務皆已完成！</span>
                  </div>
                ) : null}

                {/* 2. Collapsible Completed Tasks for this month */}
                {doneTasks.length > 0 && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => toggleDoneMonth(key, defaultExpanded)}
                      className="tap-target group flex w-full items-center justify-between rounded-xl border border-border/50 bg-card/50 px-3.5 py-2 text-left text-xs font-medium text-muted-foreground transition-all hover:bg-accent/40 hover:text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-status-done-fg" />
                        <span className="font-medium text-foreground/90">本月已完成</span>
                        <span className="rounded-full bg-status-done/80 px-2 py-0.5 text-[0.6875rem] font-semibold text-status-done-fg tabular-nums">
                          {doneTasks.length} 項
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground/75 group-hover:text-foreground">
                        <span>{isDoneExpanded ? "收合" : "展開查看"}</span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition-transform duration-200",
                            isDoneExpanded && "rotate-180"
                          )}
                        />
                      </span>
                    </button>

                    {isDoneExpanded && (
                      <div className="mt-1 divide-y divide-border/40 pl-1 opacity-80">
                        {doneTasks.map(renderTaskRow)}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {undated.length > 0 && (
            <section>
              <div className="border-b border-border pb-2">
                <h2 className="font-serif text-xl font-bold tracking-tight text-muted-foreground">
                  尚未排定日期
                </h2>
              </div>
              <div className="divide-y divide-border/60">
                {undated.map(t => (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-[0.6875rem] font-medium tracking-[0.04em] text-muted-foreground">
                        {categoryLabel(t.category, t.customCategory)}
                      </span>
                      <p
                        className={cn(
                          "mt-0.5 truncate text-[0.9375rem] font-medium leading-snug",
                          t.status === "done" && "text-muted-foreground"
                        )}
                      >
                        {t.title}
                      </p>
                    </div>
                    <StatusPill
                      status={t.status}
                      size="sm"
                      onClick={() => cycleStatus.mutate({ id: t.id })}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

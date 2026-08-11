import { useAuth } from "@/_core/hooks/useAuth";
import { TaskDialog, type TaskFormValues } from "@/components/TaskDialog";
import { TaskRow, type TaskRowData } from "@/components/TaskRow";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  daysUntil,
  formatFullDate,
} from "@/lib/taskMeta";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { editionLabel } from "@/lib/edition";
import { CheckCircle2, ChevronDown, CheckCheck, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { TaskStatus } from "../../../drizzle/schema";

type ViewMode = "all" | "mine";

export default function Home() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [view, setView] = useState<ViewMode>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormValues | null>(null);
  const [expandedDone, setExpandedDone] = useState<Record<string, boolean>>({});

  const toggleDoneCategory = (cat: string, defaultExpanded: boolean) => {
    setExpandedDone(prev => {
      const current = prev[cat] !== undefined ? prev[cat] : defaultExpanded;
      return { ...prev, [cat]: !current };
    });
  };

  const setAllDone = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    for (const cat of CATEGORY_ORDER) {
      next[cat] = expand;
    }
    setExpandedDone(next);
  };

  const activeQuery = trpc.editions.active.useQuery();
  const edition = activeQuery.data;
  const editionId = edition?.id;
  // Keep the query key shape constant (always an object) so React Query never
  // treats the undefined → object transition as a brand-new key and restarts.
  const scope = useMemo(() => ({ editionId: editionId ?? -1 }), [editionId]);

  const enabled = editionId !== undefined;
  const tasksQuery = trpc.tasks.list.useQuery(scope, { enabled });
  const statsQuery = trpc.tasks.stats.useQuery(scope, { enabled });
  const membersQuery = trpc.settings.teamMembers.useQuery();

  const invalidateAll = () => {
    utils.tasks.list.invalidate(scope);
    utils.tasks.stats.invalidate(scope);
    utils.editions.list.invalidate();
  };

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
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.list.setData(scope, ctx.prev);
      toast.error("狀態更新失敗，請再試一次");
    },
    onSettled: invalidateAll,
  });

  const setStatus = trpc.tasks.setStatus.useMutation({
    onMutate: async ({ id, status }) => {
      await utils.tasks.list.cancel(scope);
      const prev = utils.tasks.list.getData(scope);
      utils.tasks.list.setData(scope, old =>
        old?.map(t => (t.id === id ? { ...t, status } : t))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.list.setData(scope, ctx.prev);
      toast.error("狀態更新失敗，請再試一次");
    },
    onSettled: invalidateAll,
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("任務已新增");
      setDialogOpen(false);
      invalidateAll();
    },
    onError: err => toast.error(err.message || "新增失敗，請再試一次"),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("任務已更新");
      setDialogOpen(false);
      invalidateAll();
    },
    onError: err => toast.error(err.message || "更新失敗，請再試一次"),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      toast.success("任務已刪除");
      invalidateAll();
    },
    onError: err => toast.error(err.message || "刪除失敗，請再試一次"),
  });

  const allTasks = tasksQuery.data ?? [];
  const visibleTasks = useMemo(
    () => (view === "mine" ? allTasks.filter(t => t.assigneeId === user?.id) : allTasks),
    [allTasks, view, user?.id]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, TaskRowData[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const t of visibleTasks) {
      map.get(t.category)?.push({
        id: t.id,
        title: t.title,
        description: t.description,
        category: t.category,
        customCategory: t.customCategory,
        notes: t.notes,
        cloudLink: t.cloudLink,
        attachmentCount: t.attachmentCount,
        assigneeName: t.assigneeName,
        dueDate: t.dueDate,
        status: t.status,
      });
    }
    return map;
  }, [visibleTasks]);

  const stats = statsQuery.data;
  const members = membersQuery.data ?? [];
  const countdown = daysUntil(edition?.eventDate ?? null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (task: TaskRowData) => {
    const full = allTasks.find(t => t.id === task.id);
    setEditing({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      category: task.category,
      customCategory: task.customCategory ?? "",
      notes: full?.notes ?? "",
      cloudLink: full?.cloudLink ?? "",
      assigneeId: full?.assigneeId ?? null,
      dueDate: task.dueDate
        ? new Date(task.dueDate).toISOString().slice(0, 10)
        : "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = (values: TaskFormValues) => {
    const trimmedCustom = values.customCategory.trim();
    const payload = {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      category: values.category,
      customCategory: values.category === "other" ? trimmedCustom || null : null,
      notes: values.notes.trim() || null,
      cloudLink: values.cloudLink.trim() || null,
      assigneeId: values.assigneeId,
      dueDate: values.dueDate ? new Date(`${values.dueDate}T00:00:00`) : null,
    };
    if (values.id) {
      updateTask.mutate({
        id: values.id,
        ...payload,
        description: payload.description ?? null,
      });
    } else {
      createTask.mutate({ ...payload, editionId: editionId ?? null });
    }
  };

  return (
    <div className="space-y-8">
      {/* Masthead: title + countdown */}
      <section>
        {edition && (
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground">
            {editionLabel(edition.name, edition.ordinal)}
          </p>
        )}
        <h1 className="mt-1.5 font-serif text-[2rem] font-bold leading-tight tracking-tight sm:text-4xl">
          籌備進度總覽
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-[0.9375rem]">
          總策展與法律財務 · 美學與場域設計 · 招商與攤商關係 · 行銷與數位公關 · 營運執行與物流
        </p>

        {edition?.eventDate && countdown !== null ? (
          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border/70 bg-card px-5 py-4">
            <span className="text-sm text-muted-foreground">
              {editionLabel(edition.name, edition.ordinal)}
            </span>
            <span className="font-serif text-2xl font-bold tabular-nums">
              {countdown > 0 ? `還有 ${countdown} 天` : countdown === 0 ? "就是今天" : `已過 ${Math.abs(countdown)} 天`}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatFullDate(edition.eventDate)}
            </span>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-border/70 bg-card/60 px-5 py-4">
            <p className="text-sm text-muted-foreground">
              尚未設定本屆市集日期。到
              <span className="font-medium text-foreground">「設定」</span>
              填入日期後，這裡會顯示倒數天數。
            </p>
          </div>
        )}
      </section>

      {/* Overall progress + per-category bars */}
      {stats && stats.total > 0 && (
        <section className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground">
                總體完成度
              </p>
              <p className="mt-1 font-serif text-3xl font-bold tabular-nums">
                {stats.percentage}%
              </p>
            </div>
            <p className="text-sm text-muted-foreground tabular-nums">
              已完成 {stats.done} / {stats.total} 項
              {stats.inProgress > 0 && ` · 進行中 ${stats.inProgress}`}
            </p>
          </div>
          <Progress value={stats.percentage} className="mt-4 h-2" />

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORY_ORDER.map(cat => {
              const s = stats.byCategory[cat];
              if (!s) return null;
              return (
                <div key={cat}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{CATEGORY_LABELS[cat]}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.total === 0 ? "尚無任務" : `${s.done}/${s.total}`}
                    </span>
                  </div>
                  <Progress value={s.percentage} className="mt-2 h-1.5" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* View switcher + add */}
      <section className="flex items-center justify-between gap-3">
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

        <div className="flex items-center gap-2">
          {visibleTasks.some(t => t.status === "done") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const anyExpanded = CATEGORY_ORDER.some(cat => {
                  const hasActive = (grouped.get(cat) ?? []).some(t => t.status !== "done");
                  return expandedDone[cat] !== undefined ? expandedDone[cat] : !hasActive;
                });
                setAllDone(!anyExpanded);
              }}
              className="h-9 gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5 text-status-done-fg" />
              <span className="hidden sm:inline">
                {CATEGORY_ORDER.some(cat => {
                  const hasActive = (grouped.get(cat) ?? []).some(t => t.status !== "done");
                  return expandedDone[cat] !== undefined ? expandedDone[cat] : !hasActive;
                })
                  ? "全部收合已完成"
                  : "全部展開已完成"}
              </span>
              <span className="sm:hidden">
                {CATEGORY_ORDER.some(cat => {
                  const hasActive = (grouped.get(cat) ?? []).some(t => t.status !== "done");
                  return expandedDone[cat] !== undefined ? expandedDone[cat] : !hasActive;
                })
                  ? "收合完成"
                  : "展開完成"}
              </span>
            </Button>
          )}

          <Button onClick={openCreate} className="h-10 tap-target">
            <Plus className="mr-1.5 h-4 w-4" />
            新增
          </Button>
        </div>
      </section>

      {/* Category sections */}
      {tasksQuery.error ? (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
          <p className="font-serif text-lg font-semibold">任務載入失敗</p>
          <p className="mt-2 text-sm text-muted-foreground">{tasksQuery.error.message}</p>
          <Button onClick={() => tasksQuery.refetch()} className="mt-4 h-10 tap-target">
            重新載入
          </Button>
        </section>
      ) : activeQuery.isLoading || tasksQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : visibleTasks.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <p className="font-serif text-lg font-semibold">
            {view === "mine" ? "目前沒有指派給你的任務" : "還沒有任何任務"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {view === "mine"
              ? "切換到「全部任務」看看團隊的進度。"
              : "從新增第一項籌備工作開始，例如「確認市集報名截止日」。"}
          </p>
          {view === "all" && (
            <Button onClick={openCreate} className="mt-6 h-11 tap-target">
              <Plus className="mr-1.5 h-4 w-4" />
              新增第一項任務
            </Button>
          )}
        </section>
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.map(cat => {
            const rows = grouped.get(cat) ?? [];
            if (rows.length === 0) return null;
            const s = stats?.byCategory[cat];

            const activeRows = rows.filter(t => t.status !== "done");
            const doneRows = rows.filter(t => t.status === "done");
            const defaultExpanded = activeRows.length === 0;
            const isExpanded =
              expandedDone[cat] !== undefined ? expandedDone[cat] : defaultExpanded;

            return (
              <section key={cat} className="space-y-3">
                {/* Category Header */}
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-serif text-xl font-bold tracking-tight">
                      {CATEGORY_LABELS[cat]}
                    </h2>
                    {activeRows.length > 0 && (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-medium text-secondary-foreground tabular-nums">
                        待辦 {activeRows.length}
                      </span>
                    )}
                  </div>
                  {s && s.total > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.percentage}% 完成（{s.done}/{s.total}）
                    </span>
                  )}
                </div>

                {/* 1. Main Screen: Active / Pending Tasks */}
                {activeRows.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-border/70 divide-y divide-border/70 bg-card">
                    {activeRows.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        showCategory={false}
                        onCycleStatus={id => cycleStatus.mutate({ id })}
                        onSetStatus={(id, status) => setStatus.mutate({ id, status })}
                        onEdit={openEdit}
                        onDelete={id => deleteTask.mutate({ id })}
                      />
                    ))}
                  </div>
                ) : doneRows.length > 0 ? (
                  <div className="flex items-center gap-2.5 rounded-xl border border-status-done/40 bg-status-done/15 px-4 py-3.5 text-sm text-status-done-fg">
                    <Sparkles className="h-4 w-4 shrink-0 text-status-done-fg" />
                    <span className="font-medium">本組待辦事項皆已完成！</span>
                    <span className="text-xs opacity-80 tabular-nums">（共 {doneRows.length} 項）</span>
                  </div>
                ) : null}

                {/* 2. Hierarchical Collapsible Completed Tasks */}
                {doneRows.length > 0 && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => toggleDoneCategory(cat, defaultExpanded)}
                      className="tap-target group flex w-full items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground transition-all hover:bg-accent/40 hover:text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-status-done-fg" />
                        <span className="font-medium text-foreground/90">已完成項目</span>
                        <span className="rounded-full bg-status-done/80 px-2 py-0.5 text-[0.6875rem] font-semibold text-status-done-fg tabular-nums">
                          {doneRows.length} 項
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground/75 group-hover:text-foreground">
                        <span>{isExpanded ? "點擊收合" : "點擊展開"}</span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 transition-transform duration-200",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 overflow-hidden rounded-xl border border-border/50 bg-card/45 divide-y divide-border/50 opacity-90 transition-all">
                        {doneRows.map(task => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            showCategory={false}
                            onCycleStatus={id => cycleStatus.mutate({ id })}
                            onSetStatus={(id, status) => setStatus.mutate({ id, status })}
                            onEdit={openEdit}
                            onDelete={id => deleteTask.mutate({ id })}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        members={members}
        onSubmit={handleSubmit}
        isPending={createTask.isPending || updateTask.isPending}
      />
    </div>
  );
}

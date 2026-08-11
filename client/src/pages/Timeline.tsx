import { useAuth } from "@/_core/hooks/useAuth";
import { StatusPill } from "@/components/StatusPill";
import { TaskDialog, type TaskFormValues } from "@/components/TaskDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { editionLabel } from "@/lib/edition";
import {
  CATEGORY_COLORS,
  CATEGORY_CODES,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categoryCode,
  categoryLabel,
  daysUntil,
  dueTone,
  formatDate,
  formatFullDate,
  STATUS_LABELS,
  STATUS_ORDER,
} from "@/lib/taskMeta";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { TaskCategory, TaskStatus } from "../../../drizzle/schema";

type ViewMode = "all" | "mine";

const MONTH_NAMES = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

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

export default function Timeline() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [view, setView] = useState<ViewMode>("all");
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | "all">("all");
  const [selectedAssignee, setSelectedAssignee] = useState<number | "all">("all");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string | "all">("all");
  
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [expandedDoneMonths, setExpandedDoneMonths] = useState<Record<string, boolean>>({});
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormValues | null>(null);

  const toggleDoneMonth = (key: string, defaultExpanded: boolean) => {
    setExpandedDoneMonths(prev => {
      const current = prev[key] !== undefined ? prev[key] : defaultExpanded;
      return { ...prev, [key]: !current };
    });
  };

  const activeQuery = trpc.editions.active.useQuery();
  const edition = activeQuery.data;
  const editionId = edition?.id;
  const scope = useMemo(() => ({ editionId: editionId ?? -1 }), [editionId]);

  const tasksQuery = trpc.tasks.list.useQuery(scope, {
    enabled: editionId !== undefined,
  });
  const membersQuery = trpc.settings.teamMembers.useQuery();

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

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("任務已更新");
      setDialogOpen(false);
      utils.tasks.list.invalidate(scope);
      utils.tasks.stats.invalidate(scope);
    },
    onError: err => toast.error(err.message || "更新失敗，請再試一次"),
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("任務已新增");
      setDialogOpen(false);
      utils.tasks.list.invalidate(scope);
      utils.tasks.stats.invalidate(scope);
    },
    onError: err => toast.error(err.message || "新增失敗，請再試一次"),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      toast.success("任務已刪除");
      utils.tasks.list.invalidate(scope);
      utils.tasks.stats.invalidate(scope);
    },
    onError: err => toast.error(err.message || "刪除失敗，請再試一次"),
  });

  const allTasks = tasksQuery.data ?? [];
  const members = membersQuery.data ?? [];

  // Filter tasks based on view, category, assignee
  const filteredTasks = useMemo(() => {
    return allTasks.filter(t => {
      if (view === "mine" && t.assigneeId !== user?.id) return false;
      if (selectedAssignee !== "all" && t.assigneeId !== selectedAssignee) return false;
      if (selectedCategory !== "all" && t.category !== selectedCategory) return false;
      return true;
    });
  }, [allTasks, view, user?.id, selectedAssignee, selectedCategory]);

  const { months, undated, allMonthKeys } = useMemo(() => {
    const withDate = filteredTasks
      .filter(t => t.dueDate)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

    const groups = new Map<string, typeof withDate>();
    for (const t of withDate) {
      const key = monthKey(new Date(t.dueDate!));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    const allKeys = Array.from(groups.keys());

    return {
      months: Array.from(groups.entries()),
      undated: filteredTasks.filter(t => !t.dueDate),
      allMonthKeys: allKeys,
    };
  }, [filteredTasks]);

  const displayedMonths = useMemo(() => {
    if (selectedMonthFilter === "all") return months;
    if (selectedMonthFilter === "undated") return [];
    return months.filter(([k]) => k === selectedMonthFilter);
  }, [months, selectedMonthFilter]);

  const showUndatedSection = selectedMonthFilter === "all" || selectedMonthFilter === "undated";

  const toggle = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const expandAll = () => {
    const next = new Set<number>();
    filteredTasks.forEach(t => next.add(t.id));
    setExpanded(next);
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  const eventMonth = edition?.eventDate ? monthKey(new Date(edition.eventDate)) : null;
  const currentMonth = monthKey(new Date());

  const openEdit = (task: any) => {
    setEditing({
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      category: task.category,
      customCategory: task.customCategory ?? "",
      notes: task.notes ?? "",
      cloudLink: task.cloudLink ?? "",
      assigneeId: task.assigneeId ?? null,
      dueDate: task.dueDate
        ? new Date(task.dueDate).toISOString().slice(0, 10)
        : "",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
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
    <div className="space-y-8 pb-12">
      {/* 1. Header & Navigation */}
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card/90 to-muted/40 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="space-y-2">
            {edition && (
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wider text-primary">
                <CalendarDays className="h-3.5 w-3.5" />
                {editionLabel(edition.name, edition.ordinal)}
              </div>
            )}
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              籌備時間軸
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              依月份節點循序推進 · 清楚掌握各組任務截止日與市集開幕里程碑
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={openCreate} className="h-10 rounded-full px-5 shadow-xs tap-target">
              <Plus className="mr-1.5 h-4 w-4" />
              新增時間軸任務
            </Button>
          </div>
        </div>

        {/* Month Quick Jump Selector */}
        {allMonthKeys.length > 0 && (
          <div className="mt-7 border-t border-border/60 pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Clock className="h-3.5 w-3.5" />
              <span>月份快速切換：</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedMonthFilter("all")}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all shadow-xs",
                  selectedMonthFilter === "all"
                    ? "bg-foreground text-background border-foreground font-semibold"
                    : "border-border/70 bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                全部月份 ({filteredTasks.length})
              </button>
              {allMonthKeys.map(key => {
                const isSelected = selectedMonthFilter === key;
                const isCurrent = currentMonth === key;
                const isEvent = eventMonth === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedMonthFilter(isSelected ? "all" : key)}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all shadow-xs",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-semibold"
                        : isEvent
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                        : isCurrent
                        ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                        : "border-border/70 bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {monthTitle(key)}
                    {isEvent && " 🎪"}
                    {isCurrent && " 📍"}
                  </button>
                );
              })}
              {undated.length > 0 && (
                <button
                  onClick={() => setSelectedMonthFilter(selectedMonthFilter === "undated" ? "all" : "undated")}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all shadow-xs",
                    selectedMonthFilter === "undated"
                      ? "bg-foreground text-background border-foreground font-semibold"
                      : "border-border/70 bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  未定日期 ({undated.length})
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 2. Filter Toolbar */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode switcher */}
          <div className="inline-flex rounded-full border border-border/80 bg-card p-1 shadow-xs">
            {(["all", "mine"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={cn(
                  "cursor-pointer rounded-full px-3.5 py-1 text-xs font-medium transition-all",
                  view === mode
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode === "all" ? "全部任務" : "我的任務"}
              </button>
            ))}
          </div>

          {/* Member Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 rounded-full text-xs gap-1.5 px-3 border-border/80 bg-card",
                  selectedAssignee !== "all" && "border-primary/40 bg-primary/10 text-primary font-semibold"
                )}
              >
                <User className="h-3 w-3" />
                {selectedAssignee === "all"
                  ? "全部成員"
                  : members.find(m => m.id === selectedAssignee)?.name || "指定成員"}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setSelectedAssignee("all")}>
                全部成員
              </DropdownMenuItem>
              {members.map(m => (
                <DropdownMenuItem key={m.id} onClick={() => setSelectedAssignee(m.id)}>
                  {m.name || `成員 #${m.id}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Category Filter Chips */}
          <div className="hidden sm:flex items-center gap-1.5 ml-1">
            {CATEGORY_ORDER.map(cat => {
              const active = selectedCategory === cat;
              const theme = CATEGORY_COLORS[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(active ? "all" : cat)}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-0.5 transition-all text-xs",
                    active
                      ? `${theme.badge} font-bold shadow-xs border-current`
                      : "border-border/60 bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  {CATEGORY_CODES[cat]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Expand / Collapse all details */}
        <div className="flex items-center gap-2 self-end sm:self-auto text-xs text-muted-foreground">
          <button onClick={expandAll} className="hover:text-foreground underline cursor-pointer">
            全部展開細節
          </button>
          <span>·</span>
          <button onClick={collapseAll} className="hover:text-foreground underline cursor-pointer">
            全部折疊
          </button>
        </div>
      </section>

      {/* 3. Main Timeline Content */}
      {tasksQuery.error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
          <p className="font-serif text-lg font-semibold text-destructive">任務載入失敗</p>
          <p className="mt-2 text-sm text-muted-foreground">{tasksQuery.error.message}</p>
          <Button onClick={() => tasksQuery.refetch()} className="mt-4 rounded-full">
            重新整理
          </Button>
        </section>
      ) : activeQuery.isLoading || tasksQuery.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-card border border-border/40" />
          ))}
        </div>
      ) : months.length === 0 && undated.length === 0 ? (
        /* Empty State */
        <section className="rounded-3xl border border-dashed border-border/90 bg-card/60 px-6 py-20 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarDays className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-serif text-xl font-bold text-foreground sm:text-2xl">
            時間軸上目前尚無任務
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            建立任務並填入截止日期後，系統會自動將任務依月份與日期串接成精準的時間軸！
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={openCreate} className="h-11 rounded-full px-6 shadow-xs tap-target">
              <Plus className="mr-1.5 h-4 w-4" />
              新增第一筆任務
            </Button>
            <Button variant="outline" asChild className="h-11 rounded-full px-5 bg-card/80 border-border/80 shadow-xs tap-target">
              <a href="/ai-import">
                <Sparkles className="mr-1.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                AI 智能檔案匯入
              </a>
            </Button>
          </div>
        </section>
      ) : (
        <div className="space-y-12">
          {/* Month Segmented Timeline */}
          {displayedMonths.map(([key, group]) => {
            const isEventMonth = eventMonth === key;
            const isCurrent = currentMonth === key;
            const activeTasks = group.filter(t => t.status !== "done");
            const doneTasks = group.filter(t => t.status === "done");
            const defaultExpanded = activeTasks.length === 0;
            const isDoneExpanded =
              expandedDoneMonths[key] !== undefined ? expandedDoneMonths[key] : defaultExpanded;

            const renderTimelineCard = (t: typeof group[number]) => {
              const days = daysUntil(t.dueDate);
              const overdue = days !== null && days < 0 && t.status !== "done";
              const soon = days !== null && days >= 0 && days <= 7 && t.status !== "done";
              const isOpen = expanded.has(t.id);
              const colorTheme = CATEGORY_COLORS[t.category] || CATEGORY_COLORS.other;

              return (
                <div
                  key={t.id}
                  className={cn(
                    "group relative rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm",
                    t.status === "done" && "bg-card/60 opacity-80"
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    {/* Left: Category Badge + Title + Date info */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="mt-0.5">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-md text-[0.6875rem] font-bold border shadow-xs",
                            colorTheme.badge
                          )}
                        >
                          {categoryCode(t.category, t.customCategory)}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h3
                            onClick={() => toggle(t.id)}
                            className={cn(
                              "font-serif text-base font-semibold leading-snug tracking-tight text-foreground hover:text-primary cursor-pointer transition-colors",
                              t.status === "done" && "line-through text-muted-foreground"
                            )}
                          >
                            {t.title}
                          </h3>

                          {t.dueDate && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full",
                                overdue
                                  ? "bg-destructive/10 text-destructive border border-destructive/20"
                                  : soon
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              <Calendar className="h-3 w-3" />
                              {formatDate(t.dueDate)}
                              {overdue && " · 逾期"}
                              {soon && " · 即將到期"}
                            </span>
                          )}
                        </div>

                        {t.description && !isOpen && (
                          <p className="mt-1 text-xs text-muted-foreground line-clamp-1 leading-relaxed">
                            {t.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions + Status */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/50">
                      {t.assigneeName && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                          <User className="h-3 w-3" />
                          {t.assigneeName}
                        </span>
                      )}

                      <StatusPill
                        status={t.status}
                        onClick={() => cycleStatus.mutate({ id: t.id })}
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(t)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>

                      <button
                        onClick={() => toggle(t.id)}
                        className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                        title={isOpen ? "收合" : "展開細節"}
                      >
                        <ChevronDown
                          className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail Box */}
                  {isOpen && (
                    <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-4 text-xs space-y-3">
                      {t.description && (
                        <div>
                          <span className="font-semibold text-foreground">任務說明：</span>
                          <p className="mt-1 text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {t.description}
                          </p>
                        </div>
                      )}

                      {t.notes && (
                        <div>
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <StickyNote className="h-3 w-3 text-primary" />
                            備註與討論：
                          </span>
                          <p className="mt-1 text-muted-foreground leading-relaxed whitespace-pre-wrap bg-background/50 p-2.5 rounded-lg border border-border/50">
                            {t.notes}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/40">
                        {t.cloudLink && (
                          <a
                            href={t.cloudLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                          >
                            <ExternalLink className="h-3 w-3" />
                            開啟相關雲端資料夾
                          </a>
                        )}

                        {t.attachmentCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Paperclip className="h-3 w-3" />
                            {t.attachmentCount} 份附屬文件
                          </span>
                        )}

                        <button
                          onClick={() => deleteTask.mutate({ id: t.id })}
                          className="ml-auto text-destructive hover:underline cursor-pointer inline-flex items-center gap-1"
                        >
                          <Trash2 className="h-3 w-3" />
                          刪除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            };

            return (
              <section key={key} className="relative pl-6 sm:pl-8 space-y-4">
                {/* Visual vertical timeline bar */}
                <div className="absolute left-2.5 sm:left-3 top-4 bottom-0 w-0.5 bg-border/80" />

                {/* Month Milestone Node */}
                <div className="relative flex items-center gap-3">
                  <div
                    className={cn(
                      "absolute -left-6 sm:-left-8 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background shadow-xs",
                      isEventMonth
                        ? "border-amber-500 bg-amber-500 text-white"
                        : isCurrent
                        ? "border-primary bg-primary text-primary-foreground animate-pulse"
                        : "border-border bg-card"
                    )}
                  >
                    <div className="h-2 w-2 rounded-full bg-current" />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                      {monthTitle(key)}
                    </h2>

                    {isEventMonth && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300 shadow-xs">
                        🎪 市集舉辦月份
                      </span>
                    )}

                    {isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-3 py-0.5 text-xs font-bold text-primary shadow-xs">
                        📍 本月進行中
                      </span>
                    )}

                    <span className="text-xs text-muted-foreground tabular-nums ml-1">
                      {doneTasks.length} / {group.length} 項完成
                    </span>
                  </div>
                </div>

                {/* Active Tasks list */}
                <div className="space-y-3 pt-1">
                  {activeTasks.length > 0 ? (
                    activeTasks.map(renderTimelineCard)
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                      🎉 本月所有進行中任務均已完成！
                    </div>
                  )}
                </div>

                {/* Collapsible Done Tasks */}
                {doneTasks.length > 0 && (
                  <div className="pt-2">
                    <button
                      onClick={() => toggleDoneMonth(key, activeTasks.length === 0)}
                      className="inline-flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/70 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-status-done-fg" />
                      <span>查看本月已完成 ({doneTasks.length})</span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-200",
                          isDoneExpanded && "rotate-180"
                        )}
                      />
                    </button>

                    {isDoneExpanded && (
                      <div className="mt-3 space-y-3 pl-2 border-l border-status-done/40">
                        {doneTasks.map(renderTimelineCard)}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          {/* Undated Tasks Section */}
          {showUndatedSection && undated.length > 0 && (
            <section className="mt-12 rounded-3xl border border-dashed border-border/90 bg-card/60 p-6 sm:p-7 shadow-xs">
              <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-foreground">
                      尚未排定截止日期 ({undated.length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      建議為以下任務設定截止日期，即可自動排入上方月份時間軸
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {undated.map(t => {
                  const colorTheme = CATEGORY_COLORS[t.category] || CATEGORY_COLORS.other;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-background p-3.5 shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[0.6875rem] font-bold border",
                              colorTheme.badge
                            )}
                          >
                            {categoryCode(t.category, t.customCategory)}
                          </span>
                          <span
                            onClick={() => openEdit(t)}
                            className="font-medium text-sm text-foreground hover:text-primary cursor-pointer truncate"
                          >
                            {t.title}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(t)}
                          className="h-7 text-xs rounded-full"
                        >
                          設定日期
                        </Button>
                        <StatusPill status={t.status} size="sm" onClick={() => cycleStatus.mutate({ id: t.id })} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Task Edit / Create Dialog */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        defaultCategory="curation"
        onSubmit={handleSubmit}
      />
    </div>
  );
}

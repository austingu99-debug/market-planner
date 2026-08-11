import { useAuth } from "@/_core/hooks/useAuth";
import { StatusPill } from "@/components/StatusPill";
import { TaskDialog, type TaskFormValues } from "@/components/TaskDialog";
import { TaskRow, type TaskRowData } from "@/components/TaskRow";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Kanban,
  LayoutGrid,
  List,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Table,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { TaskCategory, TaskStatus } from "../../../drizzle/schema";

type DisplayMode = "grouped" | "kanban" | "table";

export default function Home() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // View state
  const [displayMode, setDisplayMode] = useState<DisplayMode>("grouped");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<number | "all" | "mine">("all");
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | "all">("all");
  const [selectedCategory, setSelectedCategory] = useState<TaskCategory | "all">("all");
  
  // Modals & Accordions
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormValues | null>(null);
  const [defaultCategoryForNew, setDefaultCategoryForNew] = useState<TaskCategory>("curation");
  const [expandedDone, setExpandedDone] = useState<Record<string, boolean>>({});

  const toggleDoneCategory = (cat: string, defaultExpanded: boolean) => {
    setExpandedDone(prev => {
      const current = prev[cat] !== undefined ? prev[cat] : defaultExpanded;
      return { ...prev, [cat]: !current };
    });
  };

  const activeQuery = trpc.editions.active.useQuery();
  const edition = activeQuery.data;
  const editionId = edition?.id;
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
  const members = membersQuery.data ?? [];
  const stats = statsQuery.data;
  const countdown = daysUntil(edition?.eventDate ?? null);

  // Filtering logic
  const filteredTasks = useMemo(() => {
    return allTasks.filter(t => {
      // 1. Assignee filter
      if (selectedAssignee === "mine") {
        if (t.assigneeId !== user?.id) return false;
      } else if (selectedAssignee !== "all") {
        if (t.assigneeId !== selectedAssignee) return false;
      }

      // 2. Status filter
      if (selectedStatus !== "all" && t.status !== selectedStatus) {
        return false;
      }

      // 3. Category filter
      if (selectedCategory !== "all" && t.category !== selectedCategory) {
        return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q) ?? false;
        const matchNotes = t.notes?.toLowerCase().includes(q) ?? false;
        const matchCustom = t.customCategory?.toLowerCase().includes(q) ?? false;
        if (!matchTitle && !matchDesc && !matchNotes && !matchCustom) return false;
      }

      return true;
    });
  }, [allTasks, selectedAssignee, selectedStatus, selectedCategory, searchQuery, user?.id]);

  // Grouped map
  const grouped = useMemo(() => {
    const map = new Map<string, TaskRowData[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const t of filteredTasks) {
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
  }, [filteredTasks]);

  const openCreate = (defaultCat: TaskCategory = "curation") => {
    setDefaultCategoryForNew(defaultCat);
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

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedAssignee("all");
    setSelectedStatus("all");
    setSelectedCategory("all");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedAssignee !== "all" ||
    selectedStatus !== "all" ||
    selectedCategory !== "all";

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header & Hero Countdown Section */}
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card/90 to-muted/40 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="space-y-2">
            {edition && (
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wider text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {editionLabel(edition.name, edition.ordinal)}
              </div>
            )}
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              籌備進度總覽
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              五大專業組別協力推進 · 掌握核心里程碑 · 打造高品質質感市集
            </p>
          </div>

          {/* Countdown Dial Card */}
          <div className="flex shrink-0 flex-col items-start gap-3 rounded-2xl border border-border/80 bg-background/80 p-5 shadow-xs backdrop-blur-xs sm:flex-row sm:items-center sm:gap-6">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">市集舉辦日</p>
                <p className="font-serif text-lg font-bold text-foreground">
                  {edition?.eventDate ? formatFullDate(edition.eventDate) : "尚未設定日期"}
                </p>
              </div>
            </div>

            <div className="hidden h-10 w-px bg-border/80 sm:block" />

            <div>
              {edition?.eventDate && countdown !== null ? (
                <div>
                  <span className="font-serif text-2xl font-black tabular-nums text-primary sm:text-3xl">
                    {countdown > 0 ? countdown : countdown === 0 ? "0" : Math.abs(countdown)}
                  </span>
                  <span className="ml-1 text-sm font-semibold text-foreground">
                    {countdown > 0 ? "天後登場" : countdown === 0 ? "今天開幕！" : "天前已圓滿"}
                  </span>
                </div>
              ) : (
                <a
                  href="/settings"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  前往設定活動日期
                  <ChevronRight className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Overall Metric Chips */}
        {stats && stats.total > 0 && (
          <div className="mt-8 border-t border-border/60 pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  總體完成率
                </div>
                <div className="font-serif text-2xl font-bold tabular-nums text-foreground">
                  {stats.percentage}%
                </div>
              </div>

              {/* Status Quick Filter Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSelectedStatus(selectedStatus === "all" ? "all" : "all")}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedStatus === "all"
                      ? "border-foreground/30 bg-foreground text-background font-semibold"
                      : "border-border/70 bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  全部 {stats.total}
                </button>
                <button
                  onClick={() => setSelectedStatus(selectedStatus === "pending" ? "all" : "pending")}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedStatus === "pending"
                      ? "border-status-pending-fg bg-status-pending text-status-pending-fg font-semibold shadow-xs"
                      : "border-border/70 bg-card text-muted-foreground hover:bg-status-pending/40"
                  )}
                >
                  待定 {stats.pending}
                </button>
                <button
                  onClick={() => setSelectedStatus(selectedStatus === "in_progress" ? "all" : "in_progress")}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedStatus === "in_progress"
                      ? "border-status-progress-fg bg-status-progress text-status-progress-fg font-semibold shadow-xs"
                      : "border-border/70 bg-card text-muted-foreground hover:bg-status-progress/40"
                  )}
                >
                  進行中 {stats.inProgress}
                </button>
                <button
                  onClick={() => setSelectedStatus(selectedStatus === "done" ? "all" : "done")}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedStatus === "done"
                      ? "border-status-done-fg bg-status-done text-status-done-fg font-semibold shadow-xs"
                      : "border-border/70 bg-card text-muted-foreground hover:bg-status-done/40"
                  )}
                >
                  已完成 {stats.done}
                </button>
              </div>
            </div>

            <Progress value={stats.percentage} className="mt-3.5 h-2.5 rounded-full" />
          </div>
        )}
      </section>

      {/* 2. Controls & Search Toolbar */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜尋任務名稱、說明、備註..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-10 pl-9 pr-8 rounded-full border-border/80 bg-card shadow-xs focus-visible:ring-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            {/* View Mode Switcher */}
            <div className="inline-flex rounded-full border border-border/80 bg-card p-1 shadow-xs">
              <button
                onClick={() => setDisplayMode("grouped")}
                title="分組檢視"
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
                  displayMode === "grouped"
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">組別分組</span>
              </button>
              <button
                onClick={() => setDisplayMode("kanban")}
                title="看板檢視"
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
                  displayMode === "kanban"
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Kanban className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">狀態看板</span>
              </button>
              <button
                onClick={() => setDisplayMode("table")}
                title="表格清單"
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
                  displayMode === "table"
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">緊湊清單</span>
              </button>
            </div>

            {/* Main Action: Add Task */}
            <Button
              onClick={() => openCreate("curation")}
              className="h-10 rounded-full px-4 font-medium shadow-xs tap-target"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              新增任務
            </Button>
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="flex items-center gap-1 font-medium text-muted-foreground mr-1">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            篩選：
          </span>

          {/* Member Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-7 rounded-full text-xs gap-1.5 px-3 border-border/80 bg-card",
                  selectedAssignee !== "all" && "border-primary/40 bg-primary/10 text-primary font-semibold"
                )}
              >
                <User className="h-3 w-3" />
                {selectedAssignee === "all"
                  ? "全部成員"
                  : selectedAssignee === "mine"
                  ? "只看我的任務"
                  : (members.find(m => m.id === selectedAssignee)?.name || "").replace(/\s*[（(\[【][^）)\]】]*[）)\]】]\s*/g, "").trim() || "指定成員"}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setSelectedAssignee("all")}>
                全部成員
              </DropdownMenuItem>
              {user && (
                <DropdownMenuItem onClick={() => setSelectedAssignee("mine")}>
                  ✨ 只看我的任務
                </DropdownMenuItem>
              )}
              {(members ?? []).map(m => {
                const clean = (m.name || `成員 #${m.id}`).replace(/\s*[（(\[【][^）)\]】]*[）)\]】]\s*/g, "").trim();
                return (
                  <DropdownMenuItem key={m.id} onClick={() => setSelectedAssignee(m.id)}>
                    {clean}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
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

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline cursor-pointer"
            >
              清除所有篩選 ({filteredTasks.length} 筆結果)
            </button>
          )}
        </div>
      </section>

      {/* 3. Main Content Views */}
      {activeQuery.isLoading || tasksQuery.isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-card border border-border/40" />
          ))}
        </div>
      ) : allTasks.length === 0 ? (
        /* Empty State: No tasks at all */
        <section className="rounded-3xl border border-dashed border-border/90 bg-card/60 px-6 py-20 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Plus className="h-7 w-7" />
          </div>
          <h2 className="mt-4 font-serif text-xl font-bold text-foreground sm:text-2xl">
            開啟您的市集籌備計畫
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            目前尚未建立任何任務。您可以直接點擊新增第一項籌備項目，或透過 AI 智能檔案解析快速匯入規劃清單！
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => openCreate("curation")} className="h-11 rounded-full px-6 shadow-xs tap-target">
              <Plus className="mr-1.5 h-4 w-4" />
              手動新增第一個任務
            </Button>
            <Button variant="outline" asChild className="h-11 rounded-full px-5 bg-card/80 border-border/80 shadow-xs tap-target">
              <a href="/ai-import">
                <Sparkles className="mr-1.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                AI 智能檔案匯入
              </a>
            </Button>
          </div>
        </section>
      ) : filteredTasks.length === 0 ? (
        /* Empty Filter State */
        <div className="rounded-2xl border border-border bg-card/50 px-6 py-16 text-center">
          <p className="font-serif text-lg font-medium text-foreground">沒有符合篩選條件的任務</p>
          <p className="mt-1 text-sm text-muted-foreground">試著調整搜尋字詞或切換成員/組別篩選。</p>
          <Button variant="outline" size="sm" onClick={clearAllFilters} className="mt-4 rounded-full">
            重設篩選
          </Button>
        </div>
      ) : displayMode === "grouped" ? (
        /* View 1: Grouped Cards View */
        <div className="space-y-7">
          {CATEGORY_ORDER.map(cat => {
            const rows = grouped.get(cat) ?? [];
            if (rows.length === 0) return null;
            const theme = CATEGORY_COLORS[cat];
            const catStats = stats?.byCategory[cat];

            const activeRows = rows.filter(t => t.status !== "done");
            const doneRows = rows.filter(t => t.status === "done");
            const isDoneExpanded =
              expandedDone[cat] !== undefined ? expandedDone[cat] : activeRows.length === 0;

            return (
              <section
                key={cat}
                className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs transition-shadow hover:shadow-sm"
              >
                {/* Category Header Bar */}
                <div className="border-b border-border/70 bg-muted/20 px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold tracking-wide border",
                          theme.badge
                        )}
                      >
                        {CATEGORY_CODES[cat]}
                      </span>
                      <h2 className="font-serif text-lg font-bold tracking-tight text-foreground">
                        {CATEGORY_LABELS[cat]}
                      </h2>
                    </div>

                    <div className="flex items-center gap-3">
                      {catStats && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground tabular-nums">
                            {catStats.done} / {catStats.total} 項已完成
                          </span>
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full transition-all duration-300", theme.bar)}
                              style={{ width: `${catStats.percentage}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openCreate(cat)}
                        className="h-8 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        新增
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Active Tasks List */}
                {activeRows.length > 0 ? (
                  <div className="divide-y divide-border/60">
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
                ) : (
                  <div className="px-6 py-6 text-center text-sm text-muted-foreground">
                    🎉 本組所有進行中任務已全數完成！
                  </div>
                )}

                {/* Collapsible Completed Section */}
                {doneRows.length > 0 && (
                  <div className="border-t border-border/70 bg-muted/10">
                    <button
                      onClick={() => toggleDoneCategory(cat, activeRows.length === 0)}
                      className="flex w-full items-center justify-between px-5 py-3 text-xs font-medium text-muted-foreground hover:bg-muted/20 transition-colors sm:px-6 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-status-done-fg" />
                        <span>
                          已完成項目 ({doneRows.length})
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isDoneExpanded ? "rotate-180" : ""
                        )}
                      />
                    </button>

                    {isDoneExpanded && (
                      <div className="divide-y divide-border/60 border-t border-border/50 bg-background/30">
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
      ) : displayMode === "kanban" ? (
        /* View 2: Kanban Board (3 Columns) */
        <div className="grid gap-5 md:grid-cols-3">
          {STATUS_ORDER.map(colStatus => {
            const colTasks = filteredTasks.filter(t => t.status === colStatus);
            return (
              <div
                key={colStatus}
                className="flex flex-col rounded-2xl border border-border/80 bg-muted/20 p-4 shadow-xs"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-bold text-base text-foreground">
                      {STATUS_LABELS[colStatus]}
                    </span>
                    <span className="inline-flex h-5 items-center justify-center rounded-full bg-background px-2 text-xs font-semibold tabular-nums text-muted-foreground shadow-xs">
                      {colTasks.length}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openCreate("curation")}
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Column Cards */}
                <div className="mt-3 space-y-3 overflow-y-auto max-h-[calc(100vh-22rem)] pr-1">
                  {colTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                      無 {STATUS_LABELS[colStatus]} 任務
                    </div>
                  ) : (
                    colTasks.map(task => {
                      const colorTheme = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.other;
                      const tone = dueTone(task.dueDate, task.status);
                      return (
                        <div
                          key={task.id}
                          className="group relative rounded-xl border border-border/80 bg-card p-4 shadow-xs transition-all hover:border-primary/40 hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-md text-[0.6875rem] font-semibold border shadow-xs",
                                colorTheme.badge
                              )}
                            >
                              {categoryCode(task.category, task.customCategory)}
                            </span>
                            <StatusPill status={task.status} onClick={() => cycleStatus.mutate({ id: task.id })} />
                          </div>

                          <h4
                            onClick={() => openEdit(task as any)}
                            className="mt-2.5 font-serif font-semibold text-foreground text-sm hover:text-primary cursor-pointer leading-snug line-clamp-2"
                          >
                            {task.title}
                          </h4>

                          {task.description && (
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-[0.6875rem] text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              {task.assigneeName ? (
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {task.assigneeName}
                                </span>
                              ) : (
                                <span className="opacity-60">未指派</span>
                              )}
                            </div>

                            {task.dueDate && (
                              <span
                                className={cn(
                                  "tabular-nums font-medium",
                                  tone === "overdue" && "text-destructive font-bold",
                                  tone === "soon" && "text-status-progress-fg font-bold"
                                )}
                              >
                                {formatDate(task.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* View 3: Compact Unified Table List */
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs divide-y divide-border/60">
          {filteredTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task as any}
              showCategory={true}
              onCycleStatus={id => cycleStatus.mutate({ id })}
              onSetStatus={(id, status) => setStatus.mutate({ id, status })}
              onEdit={openEdit}
              onDelete={id => deleteTask.mutate({ id })}
            />
          ))}
        </div>
      )}

      {/* Task Edit / Create Dialog */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        members={members}
        defaultCategory={defaultCategoryForNew}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

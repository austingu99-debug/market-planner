import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATEGORY_COLORS,
  categoryCode,
  dueTone,
  formatDate,
  STATUS_LABELS,
  STATUS_ORDER,
} from "@/lib/taskMeta";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2,
  MoreVertical,
  Paperclip,
  Pencil,
  StickyNote,
  Trash2,
  User,
} from "lucide-react";
import type { TaskCategory, TaskStatus } from "../../../drizzle/schema";

export type TaskRowData = {
  id: number;
  title: string;
  description: string | null;
  category: TaskCategory;
  customCategory: string | null;
  notes: string | null;
  cloudLink: string | null;
  attachmentCount: number;
  assigneeName: string | null;
  dueDate: Date | null;
  status: TaskStatus;
};

type TaskRowProps = {
  task: TaskRowData;
  onCycleStatus: (id: number) => void;
  onSetStatus: (id: number, status: TaskStatus) => void;
  onEdit: (task: TaskRowData) => void;
  onDelete: (id: number) => void;
  showCategory?: boolean;
};

/**
 * A single task row — refined editorial card on mobile and structured table row on desktop.
 */
export function TaskRow({
  task,
  onCycleStatus,
  onSetStatus,
  onEdit,
  onDelete,
  showCategory = true,
}: TaskRowProps) {
  const tone = dueTone(task.dueDate, task.status);
  const colorTheme = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.other;

  return (
    <div
      className={cn(
        "group relative bg-card transition-all duration-200 hover:bg-card/90",
        "px-4 py-4 sm:px-6 sm:py-4.5",
        "sm:grid sm:grid-cols-[minmax(12rem,18rem)_1fr_auto] sm:items-center sm:gap-6",
        task.status === "done" && "bg-card/60 opacity-80 hover:opacity-100"
      )}
    >
      {/* Left: category badge + title */}
      <div className="flex items-center gap-2.5 min-w-0">
        {showCategory && (
          <span
            className={cn(
              "shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[0.6875rem] font-semibold tracking-wide border shadow-xs",
              colorTheme.badge
            )}
          >
            {categoryCode(task.category, task.customCategory)}
          </span>
        )}
        <h3
          onClick={() => onEdit(task)}
          className={cn(
            "cursor-pointer font-serif text-[1.0625rem] font-semibold leading-snug tracking-tight hover:text-primary transition-colors sm:text-base truncate",
            task.status === "done" && "line-through text-muted-foreground decoration-border"
          )}
          title={task.title}
        >
          {task.title}
        </h3>
      </div>

      {/* Middle: description + meta */}
      <div className="mt-1.5 min-w-0 sm:mt-0">
        {task.description && (
          <p
            className={cn(
              "text-[0.9375rem] leading-relaxed text-muted-foreground sm:text-sm sm:truncate",
              task.status === "done" && "opacity-70"
            )}
          >
            {task.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:mt-1">
          {task.assigneeName && (
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
              <User className="h-3 w-3 text-primary" />
              {task.assigneeName.replace(/\s*[（(\[【][^）)\]】]*[）)\]】]\s*/g, "").trim()}
            </span>
          )}
          {task.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 tabular-nums",
                tone === "overdue" && "font-semibold text-destructive",
                tone === "soon" && "font-medium text-status-progress-fg"
              )}
            >
              {formatDate(task.dueDate)}
              {tone === "overdue" && " · 已逾期"}
              {tone === "soon" && " · 即將到期"}
            </span>
          )}
          {task.notes && (
            <span className="inline-flex items-center gap-1" title="有備註">
              <StickyNote className="h-3 w-3" />
              備註
            </span>
          )}
          {task.cloudLink && (
            <a
              href={task.cloudLink}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
            >
              <Link2 className="h-3 w-3" />
              雲端
            </a>
          )}
          {task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title="附件數量">
              <Paperclip className="h-3 w-3" />
              {task.attachmentCount}
            </span>
          )}
        </div>
      </div>

      {/* Right: status pill + row menu */}
      <div className="mt-3 flex items-center justify-between gap-2 sm:mt-0 sm:justify-end">
        <StatusPill status={task.status} onClick={() => onCycleStatus(task.id)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="更多操作"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {STATUS_ORDER.filter(s => s !== task.status).map(s => (
              <DropdownMenuItem key={s} onClick={() => onSetStatus(task.id, s)}>
                改為「{STATUS_LABELS[s]}」
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil className="mr-2 h-4 w-4" />
              編輯任務
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(task.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              刪除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

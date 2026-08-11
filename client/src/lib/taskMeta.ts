import type { TaskCategory, TaskStatus } from "../../../drizzle/schema";

export const CATEGORY_ORDER: TaskCategory[] = [
  "curation",
  "design",
  "vendor",
  "marketing",
  "operation",
  "other",
];

export const CATEGORY_LABELS: Record<TaskCategory, string> = {
  curation: "總策展與法律財務",
  design: "美學與場域設計",
  vendor: "招商與攤商關係",
  marketing: "行銷與數位公關",
  operation: "營運執行與物流",
  other: "自訂",
};

/** Short code shown as a prefix on each row, echoing the reference design. */
export const CATEGORY_CODES: Record<TaskCategory, string> = {
  curation: "總策展",
  design: "美學場域",
  vendor: "招商攤商",
  marketing: "行銷公關",
  operation: "營運物流",
  other: "自訂",
};

/**
 * Display label for a task's category — falls back to the user-typed
 * custom label when the category is "other".
 */
export function categoryLabel(
  category: TaskCategory,
  customCategory?: string | null
): string {
  if (category === "other" && customCategory?.trim()) return customCategory.trim();
  return CATEGORY_LABELS[category];
}

export function categoryCode(
  category: TaskCategory,
  customCategory?: string | null
): string {
  if (category === "other" && customCategory?.trim()) return customCategory.trim();
  return CATEGORY_CODES[category];
}

export const STATUS_ORDER: TaskStatus[] = ["pending", "in_progress", "done"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "待定",
  in_progress: "進行中",
  done: "已完成",
};

export const STATUS_PILL_CLASS: Record<TaskStatus, string> = {
  done: "bg-status-done text-status-done-fg",
  in_progress: "bg-status-progress text-status-progress-fg",
  pending: "bg-status-pending text-status-pending-fg",
};

/** Days until a due date; negative means overdue. */
export function daysUntil(date: Date | null | undefined): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Urgency tone for the due-date label. */
export function dueTone(
  date: Date | null | undefined,
  status: TaskStatus
): "overdue" | "soon" | "normal" | "none" {
  if (!date || status === "done") return "none";
  const days = daysUntil(date);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "normal";
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  });
}

export function formatFullDate(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

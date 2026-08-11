import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_PILL_CLASS } from "@/lib/taskMeta";
import type { TaskStatus } from "../../../drizzle/schema";

type StatusPillProps = {
  status: TaskStatus;
  onClick?: () => void;
  className?: string;
  size?: "sm" | "md";
};

/**
 * Muted status capsule matching the reference design.
 * Tapping advances the status when `onClick` is supplied.
 */
export function StatusPill({ status, onClick, className, size = "md" }: StatusPillProps) {
  const base = cn(
    "inline-flex items-center justify-center rounded-full font-medium tracking-wide select-none",
    size === "md" ? "h-9 min-w-[5.25rem] px-4 text-sm" : "h-7 min-w-[4.25rem] px-3 text-xs",
    STATUS_PILL_CLASS[status],
    className
  );

  if (!onClick) {
    return <span className={base}>{STATUS_LABELS[status]}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(base, "tap-target hover:brightness-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}
      aria-label={`狀態：${STATUS_LABELS[status]}，點擊切換`}
    >
      {STATUS_LABELS[status]}
    </button>
  );
}


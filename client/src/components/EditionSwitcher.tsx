import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { editionLabel } from "@/lib/edition";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

/**
 * The market runs repeatedly, so every task board is scoped to an edition.
 * This switcher lets the team flip between rounds without losing history.
 */
export function EditionSwitcher() {
  const utils = trpc.useUtils();
  const editionsQuery = trpc.editions.list.useQuery();
  const activeQuery = trpc.editions.active.useQuery();

  const invalidateAll = () => {
    utils.editions.invalidate();
    utils.tasks.invalidate();
    utils.settings.invalidate();
  };

  const setActive = trpc.editions.setActive.useMutation({
    onSuccess: invalidateAll,
    onError: () => toast.error("切換失敗，請再試一次"),
  });

  const create = trpc.editions.create.useMutation({
    onSuccess: async () => {
      invalidateAll();
      toast.success("已新增下一屆，標題可稍後在設定頁填寫");
    },
    onError: () => toast.error("新增失敗，請再試一次"),
  });

  const editions = editionsQuery.data ?? [];
  const active = activeQuery.data;

  if (editions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border/70 bg-secondary/40 px-3 text-xs font-medium transition-colors duration-200 hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="切換屆次"
        >
          <span className="truncate">
            {active ? editionLabel(active.name, active.ordinal) : "選擇屆次"}
          </span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          切換屆次
        </DropdownMenuLabel>
        {editions.map(e => (
          <DropdownMenuItem
            key={e.id}
            onClick={() => {
              if (e.id !== active?.id) setActive.mutate({ id: e.id });
            }}
            className="gap-2"
          >
            <Check
              className={cn(
                "size-3.5 shrink-0",
                e.id === active?.id ? "opacity-100" : "opacity-0"
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              {editionLabel(e.name, e.ordinal)}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {e.taskCount > 0 ? `${e.doneCount}/${e.taskCount}` : "—"}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => create.mutate({})}
          disabled={create.isPending}
          className="gap-2 text-muted-foreground"
        >
          <Plus className="size-3.5" />
          新增下一屆
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { editionLabel } from "@/lib/edition";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Settings() {
  const utils = trpc.useUtils();
  const rosterQuery = trpc.settings.rosterInfo.useQuery();
  const editionsQuery = trpc.editions.list.useQuery();
  const activeQuery = trpc.editions.active.useQuery();

  const active = activeQuery.data;
  const editions = editionsQuery.data ?? [];

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [copyFrom, setCopyFrom] = useState<string>("");

  useEffect(() => {
    if (!active) return;
    setName(active.name ?? "");
    setDate(active.eventDate ? new Date(active.eventDate).toISOString().slice(0, 10) : "");
    setNote(active.note ?? "");
  }, [active?.id, active?.name, active?.eventDate, active?.note]);

  const invalidate = () => {
    utils.editions.invalidate();
    utils.tasks.invalidate();
  };

  const updateEdition = trpc.editions.update.useMutation({
    onSuccess: () => {
      toast.success("已儲存");
      invalidate();
    },
    onError: () => toast.error("儲存失敗，請再試一次"),
  });

  const createEdition = trpc.editions.create.useMutation({
    onSuccess: () => {
      toast.success("已新增屆次，名稱可稍後填寫");
      invalidate();
    },
    onError: () => toast.error("新增失敗，請再試一次"),
  });

  const setActive = trpc.editions.setActive.useMutation({
    onSuccess: invalidate,
    onError: () => toast.error("切換失敗"),
  });

  const duplicate = trpc.editions.duplicateTasks.useMutation({
    onSuccess: res => {
      toast.success(`已複製 ${res.copied} 項任務作為範本`);
      setCopyFrom("");
      invalidate();
    },
    onError: () => toast.error("複製失敗，請再試一次"),
  });

  const removeEdition = trpc.editions.delete.useMutation({
    onSuccess: () => {
      toast.success("已刪除屆次");
      invalidate();
    },
    onError: () => toast.error("刪除失敗，可能仍有任務綁在這一屆"),
  });

  const members = rosterQuery.data?.members ?? [];
  const remaining = rosterQuery.data?.remaining ?? 0;
  const maxMembers = rosterQuery.data?.max ?? 4;

  const otherEditions = editions.filter(e => e.id !== active?.id && e.taskCount > 0);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-serif text-[2rem] font-bold leading-tight tracking-tight sm:text-4xl">
          設定
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          管理各屆市集、活動日期與團隊成員。
        </p>
      </section>

      {/* Current edition */}
      <section className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl font-bold tracking-tight">本屆資料</h2>
          {active && (
            <span className="text-xs text-muted-foreground">
              第 {active.ordinal} 屆
            </span>
          )}
        </div>

        {!active ? (
          <p className="mt-4 text-sm text-muted-foreground">尚未建立任何屆次。</p>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edition-name">屆次名稱</Label>
              <Input
                id="edition-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={`例：第 ${active.ordinal} 屆 咻一下市集`}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                留空會顯示為「第 {active.ordinal} 屆」。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edition-date">市集日期</Label>
              <Input
                id="edition-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                填入後首頁會顯示倒數天數；還沒確定可以留空。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edition-note">備註</Label>
              <Textarea
                id="edition-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="場地、主題方向、合作單位等"
                rows={3}
              />
            </div>

            <Button
              onClick={() =>
                updateEdition.mutate({
                  id: active.id,
                  name: name.trim() || null,
                  eventDate: date ? new Date(`${date}T00:00:00`) : null,
                  note: note.trim() || null,
                })
              }
              disabled={updateEdition.isPending}
              className="h-11 tap-target"
            >
              儲存
            </Button>
          </div>
        )}
      </section>

      {/* All editions */}
      <section className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
        <h2 className="font-serif text-xl font-bold tracking-tight">所有屆次</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          每屆的任務與進度各自獨立，切換後畫面只顯示該屆內容。
        </p>

        <div className="mt-4 divide-y divide-border/70">
          {editions.map(e => (
            <div key={e.id} className="flex items-center gap-3 py-3">
              <button
                onClick={() => e.id !== active?.id && setActive.mutate({ id: e.id })}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    e.id === active?.id ? "text-foreground" : "opacity-0"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {editionLabel(e.name, e.ordinal)}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {e.taskCount > 0
                      ? `${e.doneCount}/${e.taskCount} 完成`
                      : "尚無任務"}
                    {e.eventDate &&
                      ` · ${new Date(e.eventDate).toLocaleDateString("zh-TW")}`}
                  </span>
                </span>
              </button>
              {editions.length > 1 && e.taskCount === 0 && (
                <button
                  onClick={() => removeEdition.mutate({ id: e.id })}
                  className="tap-target shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="刪除此屆"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          onClick={() => createEdition.mutate({})}
          disabled={createEdition.isPending}
          className="mt-4 h-11 w-full bg-transparent tap-target"
        >
          <Plus className="mr-1.5 size-4" />
          新增下一屆
        </Button>
      </section>

      {/* Duplicate as template */}
      {active && otherEditions.length > 0 && (
        <section className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
          <h2 className="font-serif text-xl font-bold tracking-tight">
            從舊屆複製任務範本
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            把某一屆的任務清單複製到
            <span className="font-medium text-foreground">
              {editionLabel(active.name, active.ordinal)}
            </span>
            ，狀態會全部重設為「待定」，截止日不會帶過來。
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Select value={copyFrom} onValueChange={setCopyFrom}>
              <SelectTrigger className="h-11 flex-1">
                <SelectValue placeholder="選擇要複製的屆次" />
              </SelectTrigger>
              <SelectContent>
                {otherEditions.map(e => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {editionLabel(e.name, e.ordinal)}（{e.taskCount} 項）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!copyFrom || duplicate.isPending}
              onClick={() =>
                duplicate.mutate({
                  sourceEditionId: Number(copyFrom),
                  targetEditionId: active.id,
                })
              }
              className="h-11 bg-transparent tap-target"
            >
              <Copy className="mr-1.5 size-4" />
              複製
            </Button>
          </div>
        </section>
      )}

      {/* Team roster */}
      <section className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
        <h2 className="font-serif text-xl font-bold tracking-tight">團隊成員</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          團隊固定 {maxMembers} 位成員。成員登入後會自動加入名單，並可被指派任務。
        </p>
        <div className="mt-4 divide-y divide-border/70">
          {members.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">目前只有你登入過。</p>
          ) : (
            members.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm font-medium">{m.name || `成員 ${m.id}`}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {m.email || ""}
                </span>
              </div>
            ))
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {remaining > 0
            ? `還有 ${remaining} 個名額，把網址分享給其他夥伴，他們登入後就會加入名單。`
            : `名單已滿（${maxMembers}/${maxMembers}）。之後登入的人仍可瀏覽與勾選，但不會出現在負責人選項中。`}
        </p>
      </section>

      <section className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
        <h2 className="font-serif text-xl font-bold tracking-tight">加到手機主畫面</h2>
        <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">iPhone（Safari）：</span>
            點下方分享圖示 → 選擇「加入主畫面」。
          </p>
          <p>
            <span className="font-medium text-foreground">Android（Chrome）：</span>
            點右上角選單 → 選擇「加到主畫面」或「安裝應用程式」。
          </p>
          <p>加入後打開就像 App 一樣，不需要每次輸入網址。</p>
        </div>
      </section>
    </div>
  );
}

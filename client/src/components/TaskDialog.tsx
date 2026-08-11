import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/taskMeta";
import { trpc } from "@/lib/trpc";
import { FileText, Link2, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { TaskCategory } from "../../../drizzle/schema";

export type TaskFormValues = {
  id?: number;
  title: string;
  description: string;
  category: TaskCategory;
  /** Free-text label used when category === "other". */
  customCategory: string;
  notes: string;
  cloudLink: string;
  assigneeId: number | null;
  dueDate: string; // yyyy-mm-dd, empty means none
};

type TeamMember = { id: number; name: string | null };

type TaskDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskFormValues | null;
  initial?: TaskFormValues | null;
  defaultCategory?: TaskCategory;
  members?: TeamMember[];
  onSubmit: (values: TaskFormValues) => void;
  isPending?: boolean;
};

const EMPTY: TaskFormValues = {
  title: "",
  description: "",
  category: "curation",
  customCategory: "",
  notes: "",
  cloudLink: "",
  assigneeId: null,
  dueDate: "",
};

const NO_ASSIGNEE = "__none__";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskDialog({
  open,
  onOpenChange,
  task,
  initial,
  defaultCategory = "curation",
  members: membersProp,
  onSubmit,
  isPending,
}: TaskDialogProps) {
  const [values, setValues] = useState<TaskFormValues>(EMPTY);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const teamMembersQuery = trpc.settings.teamMembers.useQuery(undefined, {
    enabled: open && (!membersProp || membersProp.length === 0),
  });

  const members = membersProp ?? teamMembersQuery.data ?? [];
  const currentTask = task ?? initial;
  const taskId = currentTask?.id;

  const attachmentsQuery = trpc.tasks.attachments.useQuery(
    { taskId: taskId ?? 0 },
    { enabled: open && Boolean(taskId) }
  );

  const addAttachment = trpc.tasks.addAttachment.useMutation({
    onSuccess: () => {
      toast.success("檔案已上傳");
      utils.tasks.attachments.invalidate();
      utils.tasks.list.invalidate();
      utils.tasks.mine.invalidate();
    },
    onError: err => toast.error(err.message || "上傳失敗，請再試一次"),
  });

  const deleteAttachment = trpc.tasks.deleteAttachment.useMutation({
    onSuccess: () => {
      utils.tasks.attachments.invalidate();
      utils.tasks.list.invalidate();
      utils.tasks.mine.invalidate();
    },
    onError: () => toast.error("刪除失敗"),
  });

  useEffect(() => {
    if (open) {
      if (currentTask) {
        setValues(currentTask);
      } else {
        setValues({
          ...EMPTY,
          category: defaultCategory,
        });
      }
    }
  }, [open, currentTask, defaultCategory]);

  const isEdit = Boolean(currentTask?.id);
  const canSubmit = values.title.trim().length > 0 && !isPending;
  const attachments = attachmentsQuery.data ?? [];

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !taskId) return;

    for (const file of Array.from(files)) {
      if (file.size > 15 * 1024 * 1024) {
        toast.error(`${file.name} 超過 15MB，請壓縮後再上傳`);
        continue;
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result);
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await addAttachment.mutateAsync({
        taskId,
        fileName: file.name,
        contentBase64: base64,
        mimeType: file.type || undefined,
      });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {isEdit ? "編輯任務" : "新增任務"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">任務名稱</Label>
            <Input
              id="task-title"
              value={values.title}
              onChange={e => setValues(v => ({ ...v, title: e.target.value }))}
              placeholder="例：向市集主辦單位送出攤位申請"
              className="h-11"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">說明（選填）</Label>
            <Textarea
              id="task-desc"
              value={values.description}
              onChange={e => setValues(v => ({ ...v, description: e.target.value }))}
              placeholder="補充細節、待確認事項或參考連結"
              rows={3}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>分類</Label>
              <Select
                value={values.category}
                onValueChange={val =>
                  setValues(v => ({ ...v, category: val as TaskCategory }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {values.category === "other" && (
                <Input
                  value={values.customCategory}
                  onChange={e =>
                    setValues(v => ({ ...v, customCategory: e.target.value }))
                  }
                  placeholder="自行輸入分類名稱，例：財務結算"
                  className="mt-2 h-11"
                  maxLength={60}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>負責人</Label>
              <Select
                value={values.assigneeId === null ? NO_ASSIGNEE : String(values.assigneeId)}
                onValueChange={val =>
                  setValues(v => ({
                    ...v,
                    assigneeId: val === NO_ASSIGNEE ? null : Number(val),
                  }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="未指派" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSIGNEE}>未指派</SelectItem>
                  {members.map(m => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name || `成員 ${m.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-due">截止日期（選填）</Label>
            <Input
              id="task-due"
              type="date"
              value={values.dueDate}
              onChange={e => setValues(v => ({ ...v, dueDate: e.target.value }))}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-notes">備註（選填）</Label>
            <Textarea
              id="task-notes"
              value={values.notes}
              onChange={e => setValues(v => ({ ...v, notes: e.target.value }))}
              placeholder="隨手記下討論結果、聯絡人、報價、注意事項⋯⋯"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-link" className="flex items-center gap-1.5">
              <Link2 className="size-3.5" />
              雲端連結（選填）
            </Label>
            <Input
              id="task-link"
              value={values.cloudLink}
              onChange={e => setValues(v => ({ ...v, cloudLink: e.target.value }))}
              placeholder="貼上 Google 雲端硬碟／文件／表單網址"
              className="h-11"
              inputMode="url"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Paperclip className="size-3.5" />
              附件
            </Label>

            {!isEdit ? (
              <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground">
                先建立任務後，再打開編輯就能上傳附件。
              </p>
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => handleFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={addAttachment.isPending}
                  className="h-11 w-full justify-center gap-2 bg-secondary/40"
                >
                  {addAttachment.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {addAttachment.isPending ? "上傳中⋯⋯" : "選擇檔案上傳"}
                </Button>

                {attachments.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {attachments.map(a => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/25 px-3 py-2"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 flex-1 truncate text-sm underline-offset-2 hover:underline"
                        >
                          {a.fileName}
                        </a>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatBytes(a.fileSize)}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteAttachment.mutate({ id: a.id })}
                          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                          aria-label={`刪除 ${a.fileName}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground">
                  單檔上限 15MB。附件變更會立即儲存，不必按下方按鈕。
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11">
            取消
          </Button>
          <Button
            onClick={() => onSubmit(values)}
            disabled={!canSubmit}
            className="h-11 tap-target"
          >
            {isEdit ? "儲存變更" : "新增任務"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

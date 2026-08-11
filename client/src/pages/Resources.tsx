import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  FileText,
  FolderOpen,
  FolderPlus,
  Link2,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Shared library: team-defined folders that hold uploaded files and/or
 * external cloud links. Mobile-first, one folder expanded at a time.
 */
export default function Resources() {
  const utils = trpc.useUtils();
  const foldersQuery = trpc.resources.folders.useQuery();
  const itemsQuery = trpc.resources.items.useQuery();

  const [openFolderId, setOpenFolderId] = useState<number | null>(null);
  const [folderDialog, setFolderDialog] = useState<{
    open: boolean;
    id?: number;
    name: string;
    description: string;
  }>({ open: false, name: "", description: "" });
  const [linkDialog, setLinkDialog] = useState<{
    open: boolean;
    folderId: number | null;
    title: string;
    linkUrl: string;
    note: string;
  }>({ open: false, folderId: null, title: "", linkUrl: "", note: "" });

  const uploadTargetRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    utils.resources.folders.invalidate();
    utils.resources.items.invalidate();
  };

  const createFolder = trpc.resources.createFolder.useMutation({
    onSuccess: () => {
      toast.success("資料夾已建立");
      setFolderDialog({ open: false, name: "", description: "" });
      refresh();
    },
    onError: () => toast.error("建立失敗，請再試一次"),
  });

  const updateFolder = trpc.resources.updateFolder.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      setFolderDialog({ open: false, name: "", description: "" });
      refresh();
    },
    onError: () => toast.error("更新失敗"),
  });

  const deleteFolder = trpc.resources.deleteFolder.useMutation({
    onSuccess: () => {
      toast.success("資料夾已刪除");
      refresh();
    },
    onError: () => toast.error("刪除失敗"),
  });

  const addLink = trpc.resources.addLink.useMutation({
    onSuccess: () => {
      toast.success("連結已加入");
      setLinkDialog({ open: false, folderId: null, title: "", linkUrl: "", note: "" });
      refresh();
    },
    onError: () => toast.error("加入失敗，請確認網址格式"),
  });

  const addFile = trpc.resources.addFile.useMutation({
    onSuccess: () => {
      toast.success("檔案已上傳");
      refresh();
    },
    onError: err => toast.error(err.message || "上傳失敗"),
  });

  const deleteItem = trpc.resources.deleteItem.useMutation({
    onSuccess: refresh,
    onError: () => toast.error("刪除失敗"),
  });

  const folders = foldersQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  async function handleFiles(files: FileList | null) {
    const folderId = uploadTargetRef.current;
    if (!files || files.length === 0 || !folderId) return;

    for (const file of Array.from(files)) {
      if (file.size > 15 * 1024 * 1024) {
        toast.error(`${file.name} 超過 15MB`);
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

      await addFile.mutateAsync({
        folderId,
        fileName: file.name,
        contentBase64: base64,
        mimeType: file.type || undefined,
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const submitFolder = () => {
    const name = folderDialog.name.trim();
    if (!name) return;
    const description = folderDialog.description.trim() || null;
    if (folderDialog.id) {
      updateFolder.mutate({ id: folderDialog.id, name, description });
    } else {
      createFolder.mutate({ name, description });
    }
  };

  return (
    <div className="space-y-7">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      <section>
        <h1 className="font-serif text-[2rem] font-bold leading-tight tracking-tight sm:text-4xl">
          檔案與資源
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          自行建立分類夾，放入設計稿、報名表、參考資料，或直接貼上雲端連結。四人共用。
        </p>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {folders.length} 個資料夾 · {items.length} 筆資源
        </p>
        <Button
          onClick={() => setFolderDialog({ open: true, name: "", description: "" })}
          className="h-10 tap-target"
        >
          <FolderPlus className="mr-1.5 h-4 w-4" />
          新增資料夾
        </Button>
      </div>

      {foldersQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      ) : folders.length === 0 ? (
        <section className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <p className="mt-4 font-serif text-lg font-semibold">還沒有任何資料夾</p>
          <p className="mt-2 text-sm text-muted-foreground">
            例如建立「攤位設計稿」、「報名文件」、「供應商報價」，把檔案與連結集中管理。
          </p>
          <Button
            onClick={() => setFolderDialog({ open: true, name: "", description: "" })}
            className="mt-6 h-11 tap-target"
          >
            <FolderPlus className="mr-1.5 h-4 w-4" />
            建立第一個資料夾
          </Button>
        </section>
      ) : (
        <div className="space-y-4">
          {folders.map(folder => {
            const folderItems = items.filter(i => i.folderId === folder.id);
            const expanded = openFolderId === folder.id;
            return (
              <section
                key={folder.id}
                className="overflow-hidden rounded-xl border border-border/70 bg-card"
              >
                <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
                  <button
                    onClick={() => setOpenFolderId(expanded ? null : folder.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-baseline gap-2">
                      <h2 className="font-serif text-lg font-bold tracking-tight">
                        {folder.name}
                      </h2>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {folder.itemCount} 筆
                      </span>
                    </div>
                    {folder.description && (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {folder.description}
                      </p>
                    )}
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                        aria-label="資料夾操作"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => {
                          uploadTargetRef.current = folder.id;
                          fileInputRef.current?.click();
                        }}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        上傳檔案
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setLinkDialog({
                            open: true,
                            folderId: folder.id,
                            title: "",
                            linkUrl: "",
                            note: "",
                          })
                        }
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        加入雲端連結
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setFolderDialog({
                            open: true,
                            id: folder.id,
                            name: folder.name,
                            description: folder.description ?? "",
                          })
                        }
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        重新命名
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteFolder.mutate({ id: folder.id })}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        刪除資料夾
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {expanded && (
                  <div className="border-t border-border/70">
                    {folderItems.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
                        這個資料夾還是空的，從右上選單上傳檔案或加入連結。
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/70">
                        {folderItems.map(item => {
                          const href = item.kind === "file" ? item.fileUrl : item.linkUrl;
                          return (
                            <li
                              key={item.id}
                              className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
                            >
                              {item.kind === "file" ? (
                                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              )}
                              <div className="min-w-0 flex-1">
                                <a
                                  href={href ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-[0.9375rem] font-medium underline-offset-2 hover:underline"
                                >
                                  {item.title}
                                </a>
                                {item.note && (
                                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                    {item.note}
                                  </p>
                                )}
                                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                  <span>{item.uploadedByName || "成員"}</span>
                                  {item.kind === "file" && item.fileSize && (
                                    <span className="tabular-nums">
                                      {formatBytes(item.fileSize)}
                                    </span>
                                  )}
                                  {item.kind === "link" && item.linkUrl && (
                                    <span className="truncate">{hostOf(item.linkUrl)}</span>
                                  )}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <a
                                  href={href ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded p-2 text-muted-foreground transition-colors hover:text-foreground"
                                  aria-label="開啟"
                                >
                                  <ExternalLink className="size-4" />
                                </a>
                                <button
                                  onClick={() => deleteItem.mutate({ id: item.id })}
                                  className="rounded p-2 text-muted-foreground transition-colors hover:text-destructive"
                                  aria-label="刪除"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-border/70 px-4 py-3 sm:px-5">
                      <Button
                        variant="outline"
                        onClick={() => {
                          uploadTargetRef.current = folder.id;
                          fileInputRef.current?.click();
                        }}
                        disabled={addFile.isPending}
                        className="h-10 flex-1 justify-center gap-2 bg-secondary/40"
                      >
                        {addFile.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Upload className="size-4" />
                        )}
                        上傳檔案
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          setLinkDialog({
                            open: true,
                            folderId: folder.id,
                            title: "",
                            linkUrl: "",
                            note: "",
                          })
                        }
                        className="h-10 flex-1 justify-center gap-2 bg-secondary/40"
                      >
                        <Plus className="size-4" />
                        雲端連結
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Folder create / rename */}
      <Dialog
        open={folderDialog.open}
        onOpenChange={open => setFolderDialog(d => ({ ...d, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              {folderDialog.id ? "重新命名資料夾" : "新增資料夾"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="folder-name">資料夾名稱</Label>
              <Input
                id="folder-name"
                value={folderDialog.name}
                onChange={e => setFolderDialog(d => ({ ...d, name: e.target.value }))}
                placeholder="例：攤位設計稿"
                className="h-11"
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-desc">說明（選填）</Label>
              <Textarea
                id="folder-desc"
                value={folderDialog.description}
                onChange={e =>
                  setFolderDialog(d => ({ ...d, description: e.target.value }))
                }
                placeholder="這個資料夾放什麼？"
                rows={2}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setFolderDialog(d => ({ ...d, open: false }))}
              className="h-11"
            >
              取消
            </Button>
            <Button
              onClick={submitFolder}
              disabled={
                !folderDialog.name.trim() ||
                createFolder.isPending ||
                updateFolder.isPending
              }
              className="h-11 tap-target"
            >
              {folderDialog.id ? "儲存" : "建立"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add link */}
      <Dialog
        open={linkDialog.open}
        onOpenChange={open => setLinkDialog(d => ({ ...d, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">加入雲端連結</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="link-title">名稱</Label>
              <Input
                id="link-title"
                value={linkDialog.title}
                onChange={e => setLinkDialog(d => ({ ...d, title: e.target.value }))}
                placeholder="例：市集報名表（Google 表單）"
                className="h-11"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">網址</Label>
              <Input
                id="link-url"
                value={linkDialog.linkUrl}
                onChange={e => setLinkDialog(d => ({ ...d, linkUrl: e.target.value }))}
                placeholder="https://docs.google.com/..."
                className="h-11"
                inputMode="url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-note">備註（選填）</Label>
              <Input
                id="link-note"
                value={linkDialog.note}
                onChange={e => setLinkDialog(d => ({ ...d, note: e.target.value }))}
                placeholder="補充說明"
                className="h-11"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setLinkDialog(d => ({ ...d, open: false }))}
              className="h-11"
            >
              取消
            </Button>
            <Button
              onClick={() => {
                if (!linkDialog.folderId) return;
                addLink.mutate({
                  folderId: linkDialog.folderId,
                  title: linkDialog.title.trim(),
                  linkUrl: linkDialog.linkUrl.trim(),
                  note: linkDialog.note.trim() || null,
                });
              }}
              disabled={
                !linkDialog.title.trim() ||
                !linkDialog.linkUrl.trim() ||
                addLink.isPending
              }
              className="h-11 tap-target"
            >
              加入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


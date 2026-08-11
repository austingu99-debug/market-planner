import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { editionLabel } from "@/lib/edition";
import { trpc } from "@/lib/trpc";
import { categoryLabel } from "@/lib/taskMeta";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ImportTaskDraft } from "../../../server/routers/aiImport";

export default function AIImport() {
  const { user } = useAuth();
  const editionsQuery = trpc.editions.list.useQuery();
  const activeQuery = trpc.editions.active.useQuery();

  const [selectedEditionId, setSelectedEditionId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<ImportTaskDraft[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // 初始化屆次選擇
  useEffect(() => {
    if (activeQuery.data?.id && !selectedEditionId) {
      setSelectedEditionId(activeQuery.data.id);
    }
  }, [activeQuery.data, selectedEditionId]);

  const parseFileMutation = trpc.aiImport.parseFile.useMutation({
    onSuccess: (result) => {
      setDrafts(result.drafts);
      setSelectedIndices(new Set(result.drafts.map((_, i) => i)));
      toast.success(`解析成功,找到 ${result.drafts.length} 筆任務`);
    },
    onError: (error) => {
      toast.error(`解析失敗: ${error.message}`);
    },
  });

  const confirmImportMutation = trpc.aiImport.confirmImport.useMutation({
    onSuccess: (result) => {
      toast.success(`成功匯入 ${result.insertedCount} 筆任務`);
      setDrafts([]);
      setFile(null);
      setSelectedIndices(new Set());
    },
    onError: (error) => {
      toast.error(`匯入失敗: ${error.message}`);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setDrafts([]);
    }
  };

  const handleParse = async () => {
    if (!file || !selectedEditionId) {
      toast.error("請選擇檔案和屆次");
      return;
    }

    setIsLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      await parseFileMutation.mutateAsync({
        fileBase64: base64,
        fileName: file.name,
        editionId: selectedEditionId,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedEditionId || drafts.length === 0) return;

    const toImport = Array.from(selectedIndices).map(i => drafts[i]);
    await confirmImportMutation.mutateAsync({
      editionId: selectedEditionId,
      drafts: toImport,
      selectedIndices: Array.from(selectedIndices),
    });
  };

  const toggleIndex = (index: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  const toggleAll = () => {
    if (selectedIndices.size === drafts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(drafts.map((_, i) => i)));
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <Card>
        <CardHeader>
          <CardTitle>AI 檔案匯入</CardTitle>
          <CardDescription>上傳試算表或文件,AI 幫你解析並建立任務</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 屆次選擇 */}
          <div className="space-y-2">
            <Label>選擇屆次</Label>
            <Select value={selectedEditionId?.toString() || ""} onValueChange={v => setSelectedEditionId(parseInt(v))}>
              <SelectTrigger>
                <SelectValue placeholder="選擇屆次" />
              </SelectTrigger>
              <SelectContent>
                {editionsQuery.data?.map((ed, idx) => (
                  <SelectItem key={ed.id} value={ed.id.toString()}>
                    {editionLabel(ed.name, idx + 1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 檔案上傳 */}
          <div className="space-y-2">
            <Label htmlFor="file">上傳檔案 (xlsx, csv, txt)</Label>
            <div className="flex gap-2">
              <Input
                id="file"
                type="file"
                accept=".xlsx,.csv,.txt,.pdf"
                onChange={handleFileChange}
                disabled={isLoading || parseFileMutation.isPending}
              />
              <Button
                onClick={handleParse}
                disabled={!file || !selectedEditionId || isLoading || parseFileMutation.isPending}
                className="gap-2"
              >
                {isLoading || parseFileMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    解析中
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    解析
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 草稿清單 */}
      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>任務草稿 ({selectedIndices.size}/{drafts.length})</CardTitle>
                <CardDescription>可逐筆編輯,勾選要匯入的項目</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {selectedIndices.size === drafts.length ? "取消全選" : "全選"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.map((draft, idx) => (
              <div key={idx} className="flex gap-3 rounded-lg border p-3">
                <Checkbox
                  checked={selectedIndices.has(idx)}
                  onCheckedChange={() => toggleIndex(idx)}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1">
                  <div className="font-medium">{draft.title}</div>
                  {draft.description && <div className="text-sm text-muted-foreground">{draft.description}</div>}
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-2 py-1">{categoryLabel(draft.category as "curation" | "design" | "vendor" | "marketing" | "operation" | "other", draft.customCategory || undefined)}</span>
                    {draft.dueDate && <span>截止: {draft.dueDate}</span>}
                  </div>
                </div>
              </div>
            ))}

            {/* 匯入按鈕 */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleConfirm}
                disabled={selectedIndices.size === 0 || confirmImportMutation.isPending}
                className="flex-1"
              >
                {confirmImportMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    匯入中
                  </>
                ) : (
                  `確認匯入 (${selectedIndices.size})`
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDrafts([]);
                  setFile(null);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  Download,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/data-table";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type EmailMode = "sequence" | "random" | "fixed";

type EmailItem = {
  id: number;
  email: string;
  type: string;
  status: string;
  created_at: string;
  used_at?: string | null;
};

type EmailListResponse = {
  total: number;
  unused: number;
  used: number;
  items: EmailItem[];
};

type GenericResponse = {
  success: boolean;
  message?: string;
  count?: number;
};

type ImportResponse = {
  success: boolean;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  total: number;
};

const STATUS_BADGE: Record<string, string> = {
  unused: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  used: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export default function EmailsDataPage() {
  const setStatusBar = useAppStore((s) => s.setStatusBar);

  const [mode, setMode] = React.useState<EmailMode>("sequence");
  const [prefix, setPrefix] = React.useState("");
  const [suffix, setSuffix] = React.useState("");
  const [countText, setCountText] = React.useState("10");
  const [startText, setStartText] = React.useState("1");
  const [fixedText, setFixedText] = React.useState("");

  const [items, setItems] = React.useState<EmailItem[]>([]);
  const [stats, setStats] = React.useState({ total: 0, unused: 0, used: 0 });
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [confirmClear, setConfirmClear] = React.useState(false);

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      setLoading(true);
      try {
        const res = await apiGet<EmailListResponse>("/api/data/emails");
        setItems(res.items ?? []);
        setStats({
          total: res.total ?? 0,
          unused: res.unused ?? 0,
          used: res.used ?? 0,
        });
        if (!opts?.silent) {
          setStatusBar(`已加载 ${res.total ?? 0} 个邮箱`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "加载邮箱失败";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [setStatusBar],
  );

  React.useEffect(() => {
    void load({ silent: true });
  }, [load]);

  const selectedIds = React.useMemo(
    () =>
      items
        .filter((it) => selection[String(it.id)])
        .map((it) => it.id),
    [items, selection],
  );

  const handleGenerate = async () => {
    if (generating) return;
    const body: Record<string, unknown> = { mode };

    if (mode === "fixed") {
      if (!fixedText.trim()) {
        toast.warning("请输入邮箱列表");
        return;
      }
      body.fixed_emails = fixedText;
    } else {
      const trimmedPrefix = prefix.trim();
      const trimmedSuffix = suffix.trim();
      if (!trimmedPrefix || !trimmedSuffix) {
        toast.warning("请输入前缀和后缀");
        return;
      }
      const count = Number(countText);
      if (!Number.isFinite(count) || count < 1) {
        toast.warning("数量必须是正整数");
        return;
      }
      body.prefix = trimmedPrefix;
      body.suffix = trimmedSuffix;
      body.count = Math.floor(count);
      if (mode === "sequence") {
        const start = Number(startText);
        if (!Number.isFinite(start) || start < 1) {
          toast.warning("起始数字必须是正整数");
          return;
        }
        body.start_number = Math.floor(start);
      }
    }

    setGenerating(true);
    try {
      const res = await apiPost<GenericResponse>(
        "/api/data/emails/generate",
        body,
      );
      toast.success(res.message ?? "生成成功");
      setStatusBar(res.message ?? "邮箱生成完成");
      await load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "生成邮箱失败";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      toast.warning("请先选择要删除的邮箱");
      return;
    }
    try {
      await Promise.all(
        selectedIds.map((id) => apiDelete(`/api/data/emails/${id}`)),
      );
      toast.success(`已删除 ${selectedIds.length} 个邮箱`);
      setSelection({});
      await load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "删除失败";
      toast.error(msg);
    }
  };

  const handleConfirmClear = async () => {
    setConfirmClear(false);
    try {
      const res = await apiDelete<GenericResponse>("/api/data/emails");
      toast.success(res.message ?? "已清空");
      setSelection({});
      await load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "清空失败";
      toast.error(msg);
    }
  };

  const handleImportOutlook = async () => {
    if (importing) return;
    setImporting(true);
    setStatusBar("正在导入 Outlook 邮箱…");
    try {
      const res = await apiPost<ImportResponse>(
        "/api/data/emails/import-outlook",
      );
      const summary = `导入完成: 成功 ${res.success_count}, 跳过 ${res.skipped_count}, 失败 ${res.failed_count}`;
      toast.success(summary);
      setStatusBar(summary);
      await load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "导入失败";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const columns = React.useMemo<ColumnDef<EmailItem>[]>(
    () => [
      {
        id: "select",
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="全选"
            checked={table.getIsAllRowsSelected()}
            indeterminate={
              table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
            }
            onCheckedChange={(value) =>
              table.toggleAllRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`选择 ${row.original.email}`}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      },
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => row.original.id,
      },
      { accessorKey: "email", header: "邮箱" },
      {
        accessorKey: "type",
        header: "类型",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.type || "—"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => {
          const s = row.original.status || "unused";
          return (
            <Badge className={cn(STATUS_BADGE[s] ?? STATUS_BADGE.unused)}>
              {s}
            </Badge>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "创建时间",
        cell: ({ row }) => row.original.created_at || "—",
      },
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>邮箱生成器</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as EmailMode)}
          >
            <TabsList>
              <TabsTrigger value="sequence">顺序生成</TabsTrigger>
              <TabsTrigger value="random">随机生成</TabsTrigger>
              <TabsTrigger value="fixed">固定邮箱</TabsTrigger>
            </TabsList>

            <TabsContent value="sequence" className="pt-1">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-prefix-seq">前缀</Label>
                  <Input
                    id="email-prefix-seq"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="例如: chat"
                    disabled={generating}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-suffix-seq">后缀</Label>
                  <Input
                    id="email-suffix-seq"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    placeholder="例如: @outlook.com"
                    disabled={generating}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-count-seq">数量</Label>
                  <Input
                    id="email-count-seq"
                    type="number"
                    min={1}
                    max={1000}
                    value={countText}
                    onChange={(e) => setCountText(e.target.value)}
                    disabled={generating}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-start">起始数字</Label>
                  <Input
                    id="email-start"
                    type="number"
                    min={1}
                    max={99999}
                    value={startText}
                    onChange={(e) => setStartText(e.target.value)}
                    disabled={generating}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="random" className="pt-1">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-prefix-rand">前缀</Label>
                  <Input
                    id="email-prefix-rand"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="例如: chat"
                    disabled={generating}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-suffix-rand">后缀</Label>
                  <Input
                    id="email-suffix-rand"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    placeholder="例如: @outlook.com"
                    disabled={generating}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-count-rand">数量</Label>
                  <Input
                    id="email-count-rand"
                    type="number"
                    min={1}
                    max={1000}
                    value={countText}
                    onChange={(e) => setCountText(e.target.value)}
                    disabled={generating}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="fixed" className="pt-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-fixed">邮箱列表</Label>
                <Textarea
                  id="email-fixed"
                  value={fixedText}
                  onChange={(e) => setFixedText(e.target.value)}
                  rows={4}
                  placeholder={
                    "每行一个邮箱\n例如:\ntest1@outlook.com\ntest2@outlook.com"
                  }
                  disabled={generating}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              {generating ? <Loader2 className="animate-spin" /> : <Play />}
              🚀 生成邮箱
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmClear(true)}
              disabled={generating || items.length === 0}
            >
              <Trash2 />
              🗑️ 清空列表
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleImportOutlook()}
              disabled={importing}
            >
              {importing ? <Loader2 className="animate-spin" /> : <Download />}
              📧 导入 Outlook 邮箱
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>邮箱列表</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>
              总数:{" "}
              <span className="font-semibold text-foreground">{stats.total}</span>
            </span>
            <span>
              未使用:{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {stats.unused}
              </span>
            </span>
            <span>
              已使用:{" "}
              <span className="font-semibold text-slate-600 dark:text-slate-400">
                {stats.used}
              </span>
            </span>
            {selectedIds.length > 0 ? (
              <span className="ml-auto">
                已选 {selectedIds.length} 项
              </span>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <DataTable
              columns={columns}
              data={items}
              isLoading={loading}
              emptyText="暂无邮箱"
              enableRowSelection
              rowSelection={selection}
              onRowSelectionChange={setSelection}
              getRowId={(row) => String(row.id)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void handleDeleteSelected()}
              disabled={selectedIds.length === 0}
            >
              <Trash2 />
              删除选中
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw />
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空</AlertDialogTitle>
            <AlertDialogDescription>
              确定要清空所有 {stats.total} 个邮箱吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmClear()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={importing} onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>正在导入 Outlook 邮箱</DialogTitle>
            <DialogDescription>
              正在从已注册的 Outlook 账号批量导入邮箱，请稍候…
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

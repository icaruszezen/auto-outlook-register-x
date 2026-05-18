"use client";

import * as React from "react";
import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Loader2, Play, RefreshCw, Trash2 } from "lucide-react";
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
import { DataTable } from "@/components/data-table";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type UserMode = "random" | "manual";

type UserItem = {
  id: number;
  full_name: string;
  postal_code: string;
  county: string;
  district: string;
  address_line1: string;
  address_line2?: string;
  phone?: string;
  status: string;
  created_at: string;
  used_at?: string | null;
};

type UserListResponse = {
  total: number;
  unused: number;
  used: number;
  items: UserItem[];
};

type GenericResponse = {
  success: boolean;
  message?: string;
  count?: number;
};

const STATUS_BADGE: Record<string, string> = {
  unused: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  used: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

const MANUAL_PLACEHOLDER = `格式示例：
全名：劉思敏
郵遞區號：110
縣：台北市
地區：信義區
地址第 1 行：市府路7號
地址第 2 行：（選填）

多个用户用空行分隔`;

export default function UsersDataPage() {
  const setStatusBar = useAppStore((s) => s.setStatusBar);

  const [mode, setMode] = React.useState<UserMode>("random");
  const [countText, setCountText] = React.useState("10");
  const [manualText, setManualText] = React.useState("");

  const [items, setItems] = React.useState<UserItem[]>([]);
  const [stats, setStats] = React.useState({ total: 0, unused: 0, used: 0 });
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [confirmClear, setConfirmClear] = React.useState(false);

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      setLoading(true);
      try {
        const res = await apiGet<UserListResponse>("/api/data/users");
        setItems(res.items ?? []);
        setStats({
          total: res.total ?? 0,
          unused: res.unused ?? 0,
          used: res.used ?? 0,
        });
        if (!opts?.silent) {
          setStatusBar(`已加载 ${res.total ?? 0} 个用户`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "加载用户失败";
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
    () => items.filter((it) => selection[String(it.id)]).map((it) => it.id),
    [items, selection],
  );

  const handleGenerate = async () => {
    if (generating) return;
    const body: Record<string, unknown> = { mode };

    if (mode === "manual") {
      if (!manualText.trim()) {
        toast.warning("请输入用户信息");
        return;
      }
      body.manual_text = manualText;
    } else {
      const count = Number(countText);
      if (!Number.isFinite(count) || count < 1) {
        toast.warning("数量必须是正整数");
        return;
      }
      body.count = Math.floor(count);
    }

    setGenerating(true);
    try {
      const res = await apiPost<GenericResponse>(
        "/api/data/users/generate",
        body,
      );
      toast.success(res.message ?? "生成成功");
      setStatusBar(res.message ?? "用户生成完成");
      await load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "生成用户失败";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      toast.warning("请先选择要删除的用户");
      return;
    }
    try {
      await Promise.all(
        selectedIds.map((id) => apiDelete(`/api/data/users/${id}`)),
      );
      toast.success(`已删除 ${selectedIds.length} 个用户`);
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
      const res = await apiDelete<GenericResponse>("/api/data/users");
      toast.success(res.message ?? "已清空");
      setSelection({});
      await load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "清空失败";
      toast.error(msg);
    }
  };

  const columns = React.useMemo<ColumnDef<UserItem>[]>(
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
            aria-label={`选择 ${row.original.full_name}`}
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
      { accessorKey: "full_name", header: "姓名" },
      { accessorKey: "postal_code", header: "邮编" },
      { accessorKey: "county", header: "县" },
      { accessorKey: "district", header: "地区" },
      {
        accessorKey: "address_line1",
        header: "地址",
        cell: ({ row }) => (
          <span
            className="block max-w-[18rem] truncate"
            title={row.original.address_line1}
          >
            {row.original.address_line1 || "—"}
          </span>
        ),
      },
      {
        accessorKey: "phone",
        header: "电话",
        cell: ({ row }) => row.original.phone || "—",
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
    ],
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>用户信息生成器</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as UserMode)}
          >
            <TabsList>
              <TabsTrigger value="random">随机生成</TabsTrigger>
              <TabsTrigger value="manual">手动输入</TabsTrigger>
            </TabsList>

            <TabsContent value="random" className="pt-1">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="user-count">数量</Label>
                  <Input
                    id="user-count"
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

            <TabsContent value="manual" className="pt-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="user-manual">用户信息</Label>
                <Textarea
                  id="user-manual"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  rows={8}
                  placeholder={MANUAL_PLACEHOLDER}
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
              🚀 生成用户
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmClear(true)}
              disabled={generating || items.length === 0}
            >
              <Trash2 />
              🗑️ 清空列表
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm" className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
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
              <span className="ml-auto">已选 {selectedIds.length} 项</span>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <DataTable
              columns={columns}
              data={items}
              isLoading={loading}
              emptyText="暂无用户"
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
              确定要清空所有 {stats.total} 个用户吗？此操作不可恢复。
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
    </div>
  );
}

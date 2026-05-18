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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type CardMode = "random" | "manual";

type CardItem = {
  id: number;
  number: string;
  month: string;
  year: string;
  cvc: string;
  card_type: string;
  status: string;
  created_at: string;
  used_at?: string | null;
};

type CardListResponse = {
  total: number;
  unused: number;
  used: number;
  items: CardItem[];
};

type GenericResponse = {
  success: boolean;
  message?: string;
  count?: number;
};

const STATUS_BADGE: Record<string, string> = {
  unused: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  used: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const MONTH_OPTIONS = [
  "random",
  ...Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")),
];

const YEAR_OPTIONS = [
  "random",
  ...Array.from({ length: 11 }, (_, i) => String(2025 + i)),
];

const MANUAL_PLACEHOLDER = `格式：卡号|月份|年份|CVV
每行一张卡，例如:
379240306982617|03|2028|8844
5123456789012346|12|2027|123`;

export default function CardsDataPage() {
  const setStatusBar = useAppStore((s) => s.setStatusBar);

  const [mode, setMode] = React.useState<CardMode>("random");
  const [bin, setBin] = React.useState("");
  const [countText, setCountText] = React.useState("10");
  const [month, setMonth] = React.useState<string>("random");
  const [year, setYear] = React.useState<string>("random");
  const [cvv, setCvv] = React.useState("");
  const [manualText, setManualText] = React.useState("");

  const [items, setItems] = React.useState<CardItem[]>([]);
  const [stats, setStats] = React.useState({ total: 0, unused: 0, used: 0 });
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);

  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [confirmClear, setConfirmClear] = React.useState(false);

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      setLoading(true);
      try {
        const res = await apiGet<CardListResponse>("/api/data/cards");
        setItems(res.items ?? []);
        setStats({
          total: res.total ?? 0,
          unused: res.unused ?? 0,
          used: res.used ?? 0,
        });
        if (!opts?.silent) {
          setStatusBar(`已加载 ${res.total ?? 0} 张卡片`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "加载卡片失败";
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
        toast.warning("请输入卡片信息");
        return;
      }
      body.manual_text = manualText;
    } else {
      const trimmedBin = bin.trim();
      if (!trimmedBin) {
        toast.warning("请输入 BIN 值");
        return;
      }
      const count = Number(countText);
      if (!Number.isFinite(count) || count < 1) {
        toast.warning("数量必须是正整数");
        return;
      }
      body.bin = trimmedBin;
      body.count = Math.floor(count);
      body.month = month;
      body.year = year;
      body.cvv = cvv.trim() || "random";
    }

    setGenerating(true);
    try {
      const res = await apiPost<GenericResponse>(
        "/api/data/cards/generate",
        body,
      );
      toast.success(res.message ?? "生成成功");
      setStatusBar(res.message ?? "卡片生成完成");
      await load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "生成卡片失败";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      toast.warning("请先选择要删除的卡片");
      return;
    }
    try {
      await Promise.all(
        selectedIds.map((id) => apiDelete(`/api/data/cards/${id}`)),
      );
      toast.success(`已删除 ${selectedIds.length} 张卡片`);
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
      const res = await apiDelete<GenericResponse>("/api/data/cards");
      toast.success(res.message ?? "已清空");
      setSelection({});
      await load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "清空失败";
      toast.error(msg);
    }
  };

  const columns = React.useMemo<ColumnDef<CardItem>[]>(
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
            aria-label={`选择卡 ${row.original.number}`}
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
      {
        accessorKey: "number",
        header: "卡号（脱敏）",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.number}</span>
        ),
      },
      { accessorKey: "month", header: "月" },
      { accessorKey: "year", header: "年" },
      {
        accessorKey: "cvc",
        header: "CVV",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.cvc || "—"}</span>
        ),
      },
      {
        accessorKey: "card_type",
        header: "类型",
        cell: ({ row }) => row.original.card_type || "—",
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
          <CardTitle>卡片生成器</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as CardMode)}
          >
            <TabsList>
              <TabsTrigger value="random">虚拟卡生成</TabsTrigger>
              <TabsTrigger value="manual">手动输入</TabsTrigger>
            </TabsList>

            <TabsContent value="random" className="pt-1">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="card-bin">BIN 值</Label>
                  <Input
                    id="card-bin"
                    value={bin}
                    onChange={(e) => setBin(e.target.value)}
                    placeholder="例如: 379240306"
                    disabled={generating}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="card-count">数量</Label>
                  <Input
                    id="card-count"
                    type="number"
                    min={1}
                    max={1000}
                    value={countText}
                    onChange={(e) => setCountText(e.target.value)}
                    disabled={generating}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="card-month">过期月份</Label>
                  <Select
                    value={month}
                    onValueChange={(value) =>
                      setMonth((value as string) ?? "random")
                    }
                    disabled={generating}
                  >
                    <SelectTrigger id="card-month" className="w-full">
                      <SelectValue placeholder="选择月份" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m === "random" ? "Random" : m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="card-year">过期年份</Label>
                  <Select
                    value={year}
                    onValueChange={(value) =>
                      setYear((value as string) ?? "random")
                    }
                    disabled={generating}
                  >
                    <SelectTrigger id="card-year" className="w-full">
                      <SelectValue placeholder="选择年份" />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y === "random" ? "Random" : y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label htmlFor="card-cvv">CVV</Label>
                  <Input
                    id="card-cvv"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value)}
                    placeholder="留空则随机生成"
                    disabled={generating}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="pt-1">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="card-manual">卡片列表</Label>
                <Textarea
                  id="card-manual"
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  rows={6}
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
              🚀 生成卡片
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
          <CardTitle>卡片列表</CardTitle>
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
              emptyText="暂无卡片"
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
              确定要清空所有 {stats.total} 张卡片吗？此操作不可恢复。
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

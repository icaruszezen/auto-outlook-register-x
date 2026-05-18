"use client";

import * as React from "react";
import { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  CheckCircle2,
  ClipboardCopy,
  Download,
  RefreshCw,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { API_BASE } from "@/lib/api";
import { apiDelete, apiGet } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Account = {
  email: string;
  password: string;
  birthday?: string;
  status?: string;
  created_at?: string;
};

type StatTone = "primary" | "success" | "warning";

const TONE_STYLES: Record<StatTone, { card: string; icon: string; value: string }> = {
  primary: {
    card: "bg-primary/5 ring-primary/20",
    icon: "bg-primary/10 text-primary",
    value: "text-foreground",
  },
  success: {
    card: "bg-emerald-500/5 ring-emerald-500/20",
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    card: "bg-amber-500/5 ring-amber-500/20",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    value: "text-amber-600 dark:text-amber-400",
  },
};

function StatCard({
  tone,
  label,
  value,
  icon: Icon,
}: {
  tone: StatTone;
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <Card size="sm" className={cn("flex-row items-center gap-4 px-4", styles.card)}>
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-lg",
          styles.icon,
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("font-heading text-2xl font-semibold", styles.value)}>
          {value}
        </span>
      </div>
    </Card>
  );
}

export default function AccountsPage() {
  const setStatusBar = useAppStore((s) => s.setStatusBar);

  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selection, setSelection] = React.useState<RowSelectionState>({});
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);

  const loadAccounts = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      setLoading(true);
      try {
        const list = await apiGet<Account[]>("/api/outlook/accounts");
        setAccounts(list);
        if (!opts?.silent) {
          setStatusBar(`已加载 ${list.length} 个账号`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "加载账号失败";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [setStatusBar],
  );

  React.useEffect(() => {
    void loadAccounts({ silent: true });
  }, [loadAccounts]);

  const stats = React.useMemo(() => {
    const total = accounts.length;
    const registered = accounts.reduce(
      (acc, a) => (a.status === "已注册" ? acc + 1 : acc),
      0,
    );
    return { total, registered, unregistered: total - registered };
  }, [accounts]);

  const selectedAccounts = React.useMemo(
    () => accounts.filter((acc) => selection[acc.email]),
    [accounts, selection],
  );

  const columns = React.useMemo<ColumnDef<Account>[]>(
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
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => {
          const s = row.original.status ?? "未知";
          const isRegistered = s === "已注册";
          return (
            <Badge
              className={cn(
                isRegistered
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              )}
            >
              {s}
            </Badge>
          );
        },
      },
      { accessorKey: "email", header: "邮箱" },
      {
        accessorKey: "password",
        header: "密码",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.password ?? "—"}</span>
        ),
      },
      {
        accessorKey: "birthday",
        header: "生日",
        cell: ({ row }) => row.original.birthday ?? "—",
      },
      {
        accessorKey: "created_at",
        header: "创建时间",
        cell: ({ row }) => row.original.created_at ?? "—",
      },
    ],
    [],
  );

  const handleExport = () => {
    if (accounts.length === 0) {
      toast.warning("没有可导出的账号");
      return;
    }
    const url = `${API_BASE.replace(/\/+$/, "")}/api/outlook/accounts/export`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "outlook_accounts_export.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatusBar("已触发导出");
  };

  const handleCopySelected = async () => {
    if (selectedAccounts.length === 0) {
      toast.warning("请先选择要复制的账号");
      return;
    }
    const lines: string[] = [];
    for (const acc of selectedAccounts) {
      lines.push(`邮箱: ${acc.email ?? ""}`);
      lines.push(`密码: ${acc.password ?? ""}`);
      lines.push(`生日: ${acc.birthday ?? ""}`);
      lines.push(`状态: ${acc.status ?? ""}`);
      lines.push("-".repeat(50));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success(`已复制 ${selectedAccounts.length} 个账号到剪贴板`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "复制失败";
      toast.error(msg);
    }
  };

  const handleConfirmClear = async () => {
    setConfirmClearOpen(false);
    try {
      const res = await apiDelete<{ success: boolean; count: number }>(
        "/api/outlook/accounts",
      );
      toast.success(`已清空 ${res.count} 个账号`);
      setSelection({});
      await loadAccounts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "清空失败";
      toast.error(msg);
    }
  };

  const handleClearClick = () => {
    if (accounts.length === 0) {
      toast.warning("账号列表已经是空的");
      return;
    }
    setConfirmClearOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard tone="primary" label="总数" value={stats.total} icon={Users} />
        <StatCard
          tone="success"
          label="已注册"
          value={stats.registered}
          icon={CheckCircle2}
        />
        <StatCard
          tone="warning"
          label="未注册"
          value={stats.unregistered}
          icon={XCircle}
        />
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">📋 账号列表</h2>
          <span className="text-xs text-muted-foreground">
            {selectedAccounts.length > 0
              ? `已选 ${selectedAccounts.length} / ${accounts.length}`
              : `共 ${accounts.length} 个账号`}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            columns={columns}
            data={accounts}
            isLoading={loading}
            emptyText="暂无账号"
            enableRowSelection
            rowSelection={selection}
            onRowSelectionChange={setSelection}
            getRowId={(row) => row.email}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void loadAccounts()}
          disabled={loading}
        >
          <RefreshCw />
          🔄 刷新
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={accounts.length === 0}
        >
          <Download />
          📤 导出
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleCopySelected()}
          disabled={selectedAccounts.length === 0}
        >
          <ClipboardCopy />
          📋 复制选中
        </Button>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="destructive"
            onClick={handleClearClick}
            disabled={accounts.length === 0}
          >
            <Trash2 />
            🗑️ 清空
          </Button>
        </div>
      </div>

      <AlertDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空</AlertDialogTitle>
            <AlertDialogDescription>
              确定要清空所有 {accounts.length} 个账号吗？此操作不可恢复。
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

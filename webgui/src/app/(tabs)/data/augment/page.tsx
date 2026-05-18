"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  CircleStop,
  CreditCard,
  DownloadCloud,
  Globe,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { LogConsole } from "@/components/log-console";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, apiGet } from "@/lib/api";
import { useWS } from "@/lib/use-ws";
import { useAppStore } from "@/lib/store";
import type { AugmentWS } from "@/types/ws";
import { cn } from "@/lib/utils";

type AugmentAccount = {
  id?: number;
  email: string;
  tenant_url?: string | null;
  credits: number;
  total_credits: number;
  plan_name: string;
  card_bound: number;
  registered_at?: string | null;
  status: string;
};

type AugmentAccountListResponse = {
  total: number;
  registered: number;
  card_bound: number;
  items: AugmentAccount[];
};

type ProxyItem = {
  id: number;
  proxy_url: string;
  ip_address?: string | null;
  location?: string | null;
};

type ProxyStatus = {
  count: number;
  current: ProxyItem | null;
};

const LEVEL_PREFIX: Record<AugmentWS.LogLevel, string> = {
  info: "",
  warning: "⚠️ ",
  error: "❌ ",
  debug: "",
};

const HAS_LEADING_EMOJI = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✅⚠❌]/u;

function formatLogLine(level: AugmentWS.LogLevel, message: string): string {
  const prefix = LEVEL_PREFIX[level] ?? "";
  if (!prefix) return message;
  if (HAS_LEADING_EMOJI.test(message)) return message;
  return `${prefix}${message}`;
}

export default function AugmentDataPage() {
  const setStatusBar = useAppStore((s) => s.setStatusBar);

  const [accounts, setAccounts] = React.useState<AugmentAccount[]>([]);
  const [stats, setStats] = React.useState({ total: 0, registered: 0, card_bound: 0 });
  const [accountsLoading, setAccountsLoading] = React.useState(false);

  const [proxyStatus, setProxyStatus] = React.useState<ProxyStatus>({
    count: 0,
    current: null,
  });

  const [logs, setLogs] = React.useState<string[]>([]);
  const [running, setRunning] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<AugmentAccount | null>(null);
  const [proxyDialogOpen, setProxyDialogOpen] = React.useState(false);

  const processedRef = React.useRef(0);

  const { status, messages, send, connect, disconnect } = useWS<
    AugmentWS.IncomingMessage,
    AugmentWS.OutgoingMessage
  >("/ws/augment-register", {
    autoConnect: false,
    keepHistory: true,
    maxReconnectAttempts: 0,
  });

  const loadAccounts = React.useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res = await apiGet<AugmentAccountListResponse>("/api/augment/accounts");
      setAccounts(res.items ?? []);
      setStats({
        total: res.total ?? 0,
        registered: res.registered ?? 0,
        card_bound: res.card_bound ?? 0,
      });
      setStatusBar(`已加载 ${res.total ?? 0} 个 Augment 账号`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载账号失败";
      toast.error(msg);
    } finally {
      setAccountsLoading(false);
    }
  }, [setStatusBar]);

  const loadProxyStatus = React.useCallback(async () => {
    try {
      const res = await apiGet<ProxyStatus>("/api/proxy/status");
      setProxyStatus(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载代理状态失败";
      toast.error(msg);
    }
  }, []);

  React.useEffect(() => {
    void loadAccounts();
    void loadProxyStatus();
  }, [loadAccounts, loadProxyStatus]);

  React.useEffect(() => {
    if (processedRef.current >= messages.length) return;
    const pending = messages.slice(processedRef.current);
    processedRef.current = messages.length;

    for (const msg of pending) {
      switch (msg.type) {
        case "log": {
          setLogs((prev) => [...prev, formatLogLine(msg.level, msg.message)]);
          break;
        }
        case "started": {
          setLogs((prev) => [...prev, `🚀 开始注册: ${msg.email}`]);
          setStatusBar(`正在注册 Augment: ${msg.email}`);
          break;
        }
        case "finished": {
          const tag = msg.success ? "✅" : "❌";
          setLogs((prev) => [...prev, `${tag} ${msg.message}`]);
          if (msg.success) {
            toast.success(msg.message || "注册成功");
            setStatusBar("Augment 注册成功");
          } else {
            toast.error(msg.message || "注册失败");
            setStatusBar("Augment 注册失败");
          }
          setTimeout(() => {
            void loadAccounts();
          }, 200);
          break;
        }
        default:
          break;
      }
    }
  }, [messages, loadAccounts, setStatusBar]);

  React.useEffect(() => {
    if (status === "open") {
      setRunning(true);
    } else if (status === "closed" || status === "error") {
      setRunning(false);
    }
  }, [status]);

  const handleStart = () => {
    if (running) return;
    processedRef.current = 0;
    setLogs([]);
    setRunning(true);
    setStatusBar("Augment 注册中…");
    connect();
  };

  const handleStop = () => {
    if (!running) return;
    send({ type: "stop" });
    disconnect();
    setStatusBar("已停止 Augment 注册");
  };

  const handleClearLogs = () => setLogs([]);

  const handleExtractInfo = () => {
    toast.info("提取功能开发中…");
  };

  const handleBindCard = () => {
    toast.info("绑卡功能开发中…");
  };

  const handleOpenProxyConfig = () => {
    setProxyDialogOpen(true);
  };

  const handleCloseProxyConfig = (open: boolean) => {
    setProxyDialogOpen(open);
    if (!open) void loadProxyStatus();
  };

  const handleConfirmDelete = async () => {
    const account = pendingDelete;
    if (!account || account.id == null) {
      setPendingDelete(null);
      return;
    }
    setPendingDelete(null);
    try {
      await apiDelete(`/api/augment/accounts/${account.id}`);
      toast.success(`已删除账号: ${account.email}`);
      await loadAccounts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "删除失败";
      toast.error(msg);
    }
  };

  const columns = React.useMemo<ColumnDef<AugmentAccount>[]>(
    () => [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => row.original.id ?? "—",
      },
      { accessorKey: "email", header: "邮箱" },
      {
        accessorKey: "tenant_url",
        header: "Tenant URL",
        cell: ({ row }) => (
          <span className="block max-w-[180px] truncate text-xs text-muted-foreground">
            {row.original.tenant_url || "N/A"}
          </span>
        ),
      },
      {
        id: "credits",
        header: "Credits",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.credits}/{row.original.total_credits}
          </span>
        ),
      },
      { accessorKey: "plan_name", header: "Plan" },
      {
        accessorKey: "card_bound",
        header: "绑卡状态",
        cell: ({ row }) => {
          const bound = row.original.card_bound === 1;
          return (
            <Badge
              className={cn(
                bound
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              )}
            >
              {bound ? "✅ 已绑卡" : "❌ 未绑卡"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "registered_at",
        header: "注册时间",
        cell: ({ row }) => row.original.registered_at || "N/A",
      },
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => (
          <Button
            size="icon-sm"
            variant="destructive"
            title="删除账号"
            onClick={(e) => {
              e.stopPropagation();
              setPendingDelete(row.original);
            }}
          >
            <Trash2 />
          </Button>
        ),
      },
    ],
    [],
  );

  const proxyConfigured = proxyStatus.count > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>操作面板</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="lg"
              onClick={handleStart}
              disabled={running}
              className="h-10 w-full justify-center bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              <Play />
              🚀 立即注册
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleExtractInfo}
              className="h-10 w-full justify-center"
            >
              <DownloadCloud />
              📥 提取账号信息
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleBindCard}
              className="h-10 w-full justify-center"
            >
              <CreditCard />
              💳 绑定卡片
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={() => void loadAccounts()}
              disabled={accountsLoading}
              className="h-10 w-full justify-center"
            >
              <RefreshCw />
              🔄 刷新列表
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleClearLogs}
              disabled={logs.length === 0}
              className="h-10 w-full justify-center"
            >
              <Trash2 />
              🗑️ 清空日志
            </Button>
            <Button
              size="lg"
              variant="destructive"
              onClick={handleStop}
              disabled={!running}
              className="h-10 w-full justify-center"
            >
              <CircleStop />
              ⛔ 停止
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={handleOpenProxyConfig}
              className="h-10 w-full justify-center"
            >
              <Globe />
              🌐 代理配置
            </Button>
            <div
              className={cn(
                "col-span-2 flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium",
                proxyConfigured
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
              )}
            >
              {proxyConfigured
                ? `代理状态: ✅ 已配置 (${proxyStatus.count} 个)`
                : "代理状态: ❌ 未配置"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>日志控制台</CardTitle>
        </CardHeader>
        <CardContent>
          <LogConsole
            lines={logs}
            className="h-[200px]"
            emptyHint={running ? "等待日志输出..." : "暂无日志"}
          />
        </CardContent>
      </Card>

      <Card size="sm" className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle>账号列表</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>
              总数: <span className="font-semibold text-foreground">{stats.total}</span>
            </span>
            <span>
              已注册:{" "}
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {stats.registered}
              </span>
            </span>
            <span>
              已绑卡:{" "}
              <span className="font-semibold text-sky-600 dark:text-sky-400">
                {stats.card_bound}
              </span>
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <DataTable
              columns={columns}
              data={accounts}
              isLoading={accountsLoading}
              emptyText="暂无 Augment 账号"
              getRowId={(row, index) => String(row.id ?? `row-${index}`)}
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `确定要删除账号 ${pendingDelete.email} 吗？此操作不可恢复。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={proxyDialogOpen} onOpenChange={handleCloseProxyConfig}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>代理配置</DialogTitle>
            <DialogDescription>
              完整的代理管理面板将在 P7 阶段实现，当前只显示代理状态。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            {proxyConfigured ? (
              <div className="space-y-1">
                <div>
                  状态:{" "}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ✅ 已配置 ({proxyStatus.count} 个)
                  </span>
                </div>
                {proxyStatus.current ? (
                  <>
                    <div className="font-mono text-xs break-all">
                      {proxyStatus.current.proxy_url}
                    </div>
                    {proxyStatus.current.ip_address ? (
                      <div className="text-xs text-muted-foreground">
                        IP: {proxyStatus.current.ip_address}
                        {proxyStatus.current.location
                          ? ` · ${proxyStatus.current.location}`
                          : ""}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : (
              <div className="text-muted-foreground">❌ 未配置代理</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseProxyConfig(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Inbox, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { apiDelete, apiGet } from "@/lib/api";
import { useWS } from "@/lib/use-ws";
import { useAppStore } from "@/lib/store";
import { useMonitorHandoff } from "@/lib/monitor-store";
import type { RegisterWS } from "@/types/ws";
import { cn } from "@/lib/utils";

type Account = {
  email: string;
  password: string;
  birthday?: string;
  status?: string;
  created_at?: string;
};

type ConfirmDialogState =
  | { kind: "none" }
  | { kind: "confirm"; message: string }
  | { kind: "confirm_success"; message: string }
  | {
      kind: "finished";
      success: boolean;
      email: string;
      password: string;
    };

const EMAIL_LOG_PREFIXES = ["📧 生成邮箱:", "生成邮箱:"];

function extractEmailFromLog(message: string): string | null {
  for (const prefix of EMAIL_LOG_PREFIXES) {
    const idx = message.indexOf(prefix);
    if (idx >= 0) {
      const after = message.slice(idx + prefix.length).trim();
      const email = after.split(/\s/)[0]?.trim();
      if (email && email.includes("@")) return email;
    }
  }
  return null;
}

export default function RegisterPage() {
  const router = useRouter();
  const setStatusBar = useAppStore((s) => s.setStatusBar);
  const setMonitorCredentials = useMonitorHandoff((s) => s.setCredentials);

  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = React.useState(false);

  const [logs, setLogs] = React.useState<string[]>([]);
  const [logTitleEmail, setLogTitleEmail] = React.useState<string | null>(null);
  const [historyEmail, setHistoryEmail] = React.useState<string | null>(null);

  const [running, setRunning] = React.useState(false);
  const [dialog, setDialog] = React.useState<ConfirmDialogState>({ kind: "none" });
  const [pendingDelete, setPendingDelete] = React.useState<Account | null>(null);

  const processedRef = React.useRef(0);
  const finishedHandledRef = React.useRef(false);

  const { status, messages, send, connect, disconnect } = useWS<
    RegisterWS.IncomingMessage,
    RegisterWS.OutgoingMessage
  >("/ws/register", {
    autoConnect: false,
    keepHistory: true,
    maxReconnectAttempts: 0,
  });

  const loadAccounts = React.useCallback(async () => {
    setAccountsLoading(true);
    try {
      const list = await apiGet<Account[]>("/api/outlook/accounts");
      setAccounts(list);
      setStatusBar(`已加载 ${list.length} 个账号`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载账号失败";
      toast.error(msg);
    } finally {
      setAccountsLoading(false);
    }
  }, [setStatusBar]);

  React.useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  React.useEffect(() => {
    if (processedRef.current >= messages.length) return;
    const pending = messages.slice(processedRef.current);
    processedRef.current = messages.length;

    for (const msg of pending) {
      switch (msg.type) {
        case "log": {
          setLogs((prev) => [...prev, msg.message]);
          const detected = extractEmailFromLog(msg.message);
          if (detected) {
            setLogTitleEmail(detected);
          }
          break;
        }
        case "need_confirm":
          setDialog({ kind: "confirm", message: msg.message });
          break;
        case "need_confirm_success":
          setDialog({ kind: "confirm_success", message: msg.message });
          break;
        case "finished": {
          finishedHandledRef.current = true;
          const info = (msg.user_info ?? {}) as Record<string, unknown>;
          const email = typeof info.email === "string" ? info.email : "";
          const password = typeof info.password === "string" ? info.password : "";
          setDialog({
            kind: "finished",
            success: msg.success,
            email,
            password,
          });
          break;
        }
        default:
          break;
      }
    }
  }, [messages]);

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
    finishedHandledRef.current = false;
    setLogs([]);
    setLogTitleEmail(null);
    setHistoryEmail(null);
    setStatusBar("正在注册...");
    setRunning(true);
    connect();
  };

  const handleStop = () => {
    if (!running) return;
    send({ type: "stop" });
    disconnect();
    setStatusBar("已停止注册");
  };

  const handleFinishedAck = () => {
    if (dialog.kind !== "finished") return;
    send({ type: "close_browser" });
    setDialog({ kind: "none" });
    setStatusBar(dialog.success ? "注册成功" : "注册失败");
    setTimeout(() => {
      void loadAccounts();
    }, 200);
  };

  const handleConfirmDone = () => {
    send({ type: "confirm_done" });
    setDialog({ kind: "none" });
  };

  const handleConfirmSuccess = (success: boolean) => {
    send({ type: "confirm_success", success });
    setDialog({ kind: "none" });
  };

  const handleViewLog = React.useCallback(async (account: Account) => {
    setHistoryEmail(account.email);
    setLogTitleEmail(account.email);
    try {
      const res = await apiGet<{ email: string; lines: string[] }>(
        `/api/outlook/accounts/${encodeURIComponent(account.email)}/log`,
      );
      const header = [
        "=".repeat(60),
        "📬 账号信息",
        "=".repeat(60),
        `邮箱: ${account.email}`,
        `密码: ${account.password ?? ""}`,
        `生日: ${account.birthday ?? ""}`,
        `状态: ${account.status ?? ""}`,
        `创建时间: ${account.created_at ?? ""}`,
        "",
      ];
      const body =
        res.lines.length > 0
          ? ["=".repeat(60), "📝 注册过程日志", "=".repeat(60), ...res.lines]
          : [
              "=".repeat(60),
              "⚠️ 暂无注册日志",
              "=".repeat(60),
              "该账号可能是在本次启动前注册的，",
              "或者注册过程中未记录日志。",
            ];
      setLogs([...header, ...body]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载日志失败";
      toast.error(msg);
    }
  }, []);

  const handleMonitor = React.useCallback(
    (account: Account) => {
      setMonitorCredentials(account.email, account.password);
      router.push("/monitor");
    },
    [router, setMonitorCredentials],
  );

  const handleConfirmDelete = async () => {
    const account = pendingDelete;
    if (!account) return;
    setPendingDelete(null);
    try {
      await apiDelete(`/api/outlook/accounts/${encodeURIComponent(account.email)}`);
      toast.success(`已删除账号: ${account.email}`);
      if (historyEmail === account.email) {
        setHistoryEmail(null);
        setLogTitleEmail(null);
        setLogs([]);
      }
      await loadAccounts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "删除失败";
      toast.error(msg);
    }
  };

  const columns = React.useMemo<ColumnDef<Account>[]>(
    () => [
      { accessorKey: "email", header: "邮箱" },
      { accessorKey: "password", header: "密码" },
      {
        accessorKey: "created_at",
        header: "注册时间",
        cell: ({ row }) => row.original.created_at ?? "—",
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
      {
        id: "actions",
        header: "操作",
        cell: ({ row }) => {
          const account = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="outline"
                title="监听邮件"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMonitor(account);
                }}
              >
                <Inbox />
              </Button>
              <Button
                size="icon-sm"
                variant="destructive"
                title="删除账号"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete(account);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          );
        },
      },
    ],
    [handleMonitor],
  );

  const logTitle = logTitleEmail
    ? `📝 注册日志 - ${logTitleEmail}`
    : running
      ? "📝 注册日志 - 实时"
      : "📝 注册日志";

  const confirmDialogOpen = dialog.kind === "confirm";
  const confirmSuccessDialogOpen = dialog.kind === "confirm_success";
  const finishedDialogOpen = dialog.kind === "finished";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={handleStart}
          disabled={running}
          className="bg-emerald-600 text-white hover:bg-emerald-600/90"
        >
          <Play className="size-3.5" />
          🚀 开始注册
        </Button>
        <Button
          onClick={handleStop}
          disabled={!running}
          variant="destructive"
        >
          <Square className="size-3.5" />
          ⏹ 停止
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <section className="flex min-w-0 basis-3/5 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">📋 已注册账号列表</h2>
            <span className="text-xs text-muted-foreground">
              共 {accounts.length} 个账号
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <DataTable
              columns={columns}
              data={accounts}
              isLoading={accountsLoading}
              emptyText="暂无账号"
              getRowId={(row) => row.email}
            />
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadAccounts()}
              disabled={accountsLoading}
            >
              <RefreshCw />
              🔄 刷新列表
            </Button>
          </div>
        </section>

        <section className="flex min-w-0 basis-2/5 flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{logTitle}</h2>
          <LogConsole
            lines={logs}
            className="min-h-0 flex-1"
            emptyHint={running ? "等待日志输出..." : "暂无日志"}
          />
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLogs([])}
              disabled={logs.length === 0}
            >
              <Trash2 />
              🗑️ 清空日志
            </Button>
          </div>
        </section>
      </div>

      <AlertDialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          if (!open && dialog.kind === "confirm") handleConfirmDone();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>需要手动操作</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.kind === "confirm" ? dialog.message : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-xs text-muted-foreground">
            请在浏览器中完成操作后，点击「确定」继续。
          </p>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleConfirmDone}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmSuccessDialogOpen}
        onOpenChange={(open) => {
          if (!open && dialog.kind === "confirm_success") handleConfirmSuccess(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认注册结果</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.kind === "confirm_success" ? dialog.message : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleConfirmSuccess(false)}>
              否
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleConfirmSuccess(true)}>
              是
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={finishedDialogOpen}
        onOpenChange={(open) => {
          if (!open && dialog.kind === "finished") handleFinishedAck();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog.kind === "finished" && dialog.success ? "✅ 注册成功" : "❌ 注册失败"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.kind === "finished"
                ? dialog.success
                  ? `注册成功！邮箱: ${dialog.email || "N/A"}`
                  : `注册失败，邮箱: ${dialog.email || "N/A"}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialog.kind === "finished" && dialog.success && dialog.password ? (
            <p className="text-xs text-muted-foreground">密码: {dialog.password}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">点击「确定」后将关闭浏览器。</p>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleFinishedAck}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </div>
  );
}

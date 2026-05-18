"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Mail,
  Play,
  Square,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LogConsole } from "@/components/log-console";
import { useWS } from "@/lib/use-ws";
import { useAppStore } from "@/lib/store";
import { useMonitorHandoff } from "@/lib/monitor-store";
import type { MonitorWS } from "@/types/ws";
import { cn } from "@/lib/utils";

type EmailRow = MonitorWS.EmailItem & { _id: string };

type ConnectionInfo = {
  email: string;
  password: string;
  interval: number;
  use_api: boolean;
};

const MIN_INTERVAL = 10;
const MAX_INTERVAL = 300;
const DEFAULT_INTERVAL = 30;

function clampInterval(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.floor(value)));
}

export default function MonitorPage() {
  const setStatusBar = useAppStore((s) => s.setStatusBar);
  const handoffEmail = useMonitorHandoff((s) => s.email);
  const handoffPassword = useMonitorHandoff((s) => s.password);
  const clearHandoff = useMonitorHandoff((s) => s.clear);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [intervalText, setIntervalText] = React.useState(
    String(DEFAULT_INTERVAL),
  );
  const [useApi, setUseApi] = React.useState(false);

  const [connection, setConnection] = React.useState<ConnectionInfo | null>(
    null,
  );

  const [emails, setEmails] = React.useState<EmailRow[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<string[]>([]);
  const [logsOpen, setLogsOpen] = React.useState(true);

  const processedRef = React.useRef(0);
  const finishedHandledRef = React.useRef(false);
  const seqRef = React.useRef(0);

  React.useEffect(() => {
    if (handoffEmail || handoffPassword) {
      if (handoffEmail) setEmail(handoffEmail);
      if (handoffPassword) setPassword(handoffPassword);
      clearHandoff();
    }
  }, [handoffEmail, handoffPassword, clearHandoff]);

  const wsQuery = React.useMemo(
    () =>
      connection
        ? {
            email: connection.email,
            password: connection.password,
            interval: connection.interval,
            use_api: connection.use_api,
          }
        : undefined,
    [connection],
  );

  const { status, messages, send, connect, disconnect } = useWS<
    MonitorWS.IncomingMessage,
    MonitorWS.OutgoingMessage
  >("/ws/monitor", {
    autoConnect: false,
    keepHistory: true,
    maxReconnectAttempts: 0,
    query: wsQuery,
  });

  const running = status === "open" || status === "connecting";

  React.useEffect(() => {
    if (processedRef.current >= messages.length) return;
    const pending = messages.slice(processedRef.current);
    processedRef.current = messages.length;

    for (const msg of pending) {
      switch (msg.type) {
        case "log":
          setLogs((prev) => [...prev, msg.message]);
          break;
        case "emails": {
          if (!msg.items || msg.items.length === 0) break;
          const tagged: EmailRow[] = msg.items.map((item) => {
            seqRef.current += 1;
            return { ...item, _id: `m-${seqRef.current}` };
          });
          setEmails((prev) => [...tagged, ...prev]);
          setStatusBar(`收到 ${tagged.length} 封新邮件`);
          break;
        }
        case "finished": {
          if (finishedHandledRef.current) break;
          finishedHandledRef.current = true;
          if (msg.success) {
            toast.success(msg.message || "监听已结束");
          } else {
            toast.error(msg.message || "监听失败");
          }
          setStatusBar(msg.message || "监听结束");
          disconnect();
          setConnection(null);
          break;
        }
        default:
          break;
      }
    }
  }, [messages, disconnect, setStatusBar]);

  const handleStart = () => {
    if (running) return;
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      toast.error("请填写邮箱和密码");
      return;
    }
    const intervalNum = clampInterval(Number(intervalText));
    setIntervalText(String(intervalNum));

    processedRef.current = 0;
    finishedHandledRef.current = false;
    setLogs([]);
    setEmails([]);
    setSelectedId(null);
    setStatusBar(`开始监听 ${trimmedEmail}`);

    setConnection({
      email: trimmedEmail,
      password: trimmedPassword,
      interval: intervalNum,
      use_api: useApi,
    });
    setTimeout(() => connect(), 0);
  };

  const handleStop = () => {
    if (status === "open") {
      send({ type: "stop" });
    }
    disconnect();
    setConnection(null);
    setStatusBar("已停止监听");
  };

  const selectedEmail = React.useMemo(
    () => emails.find((e) => e._id === selectedId) ?? null,
    [emails, selectedId],
  );

  const statusLabel: Record<typeof status, string> = {
    idle: "未连接",
    connecting: "连接中...",
    open: "监听中",
    closed: "已断开",
    error: "连接错误",
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card size="sm" className="px-4">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto_auto]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monitor-email">邮箱</Label>
            <Input
              id="monitor-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@outlook.com"
              disabled={running}
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monitor-password">密码</Label>
            <Input
              id="monitor-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              disabled={running}
              autoComplete="current-password"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monitor-interval">间隔(秒)</Label>
            <Input
              id="monitor-interval"
              type="number"
              min={MIN_INTERVAL}
              max={MAX_INTERVAL}
              step={5}
              value={intervalText}
              onChange={(e) => setIntervalText(e.target.value)}
              onBlur={() =>
                setIntervalText(String(clampInterval(Number(intervalText))))
              }
              disabled={running}
              className="w-24"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monitor-use-api" className="whitespace-nowrap">
              API 模式
            </Label>
            <div className="flex h-8 items-center">
              <Switch
                id="monitor-use-api"
                checked={useApi}
                onCheckedChange={setUseApi}
                disabled={running}
              />
            </div>
          </div>
          <Button
            onClick={handleStart}
            disabled={running}
            className="bg-emerald-600 text-white hover:bg-emerald-600/90"
          >
            <Play className="size-3.5" />
            📬 开始监听
          </Button>
          <Button onClick={handleStop} disabled={!running} variant="destructive">
            <Square className="size-3.5" />
            ⏹ 停止
          </Button>
        </div>
        <div className="px-4 pb-1 text-xs text-muted-foreground">
          状态:{" "}
          <span
            className={cn(
              "font-medium",
              status === "open"
                ? "text-emerald-500"
                : status === "connecting"
                  ? "text-amber-500"
                  : status === "error"
                    ? "text-red-500"
                    : "",
            )}
          >
            {statusLabel[status]}
          </span>
          {connection ? (
            <span className="ml-3">
              · 模式: {connection.use_api ? "API" : "浏览器"} · 间隔:{" "}
              {connection.interval}s
            </span>
          ) : null}
        </div>
      </Card>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">
            <Inbox className="mr-1 inline size-4" />
            📬 收件箱
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              共 {emails.length} 封
            </span>
          </h2>
        </div>
        <div className="min-h-0 flex-[3] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-[28%]">发件人</TableHead>
                <TableHead>主题</TableHead>
                <TableHead className="w-[14rem]">时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emails.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="h-24 text-center text-sm text-muted-foreground"
                  >
                    {running ? "等待新邮件..." : "暂无邮件"}
                  </TableCell>
                </TableRow>
              ) : (
                emails.map((row) => (
                  <TableRow
                    key={row._id}
                    onClick={() => setSelectedId(row._id)}
                    data-state={row._id === selectedId ? "selected" : undefined}
                    className="cursor-pointer"
                  >
                    <TableCell title={row.from}>
                      <span className="line-clamp-1 max-w-[16rem]">
                        {row.from || "—"}
                      </span>
                    </TableCell>
                    <TableCell title={row.subject}>
                      <span className="line-clamp-1 max-w-[28rem]">
                        {row.subject || "(无主题)"}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.date || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <h2 className="text-sm font-semibold tracking-tight">
          <Mail className="mr-1 inline size-4" />
          📄 邮件内容
        </h2>
        <div className="min-h-0 flex-[2] overflow-auto rounded-md border bg-card">
          {selectedEmail ? (
            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">发件人:</span>
                <span className="break-all">{selectedEmail.from || "—"}</span>
                <span className="text-muted-foreground">主题:</span>
                <span className="break-words">
                  {selectedEmail.subject || "(无主题)"}
                </span>
                <span className="text-muted-foreground">时间:</span>
                <span>{selectedEmail.date || "—"}</span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground/90">
                {selectedEmail.body || "(无正文)"}
              </pre>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {emails.length === 0
                ? running
                  ? "等待邮件中..."
                  : "选择上方邮件查看正文"
                : "点击上方邮件查看正文"}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setLogsOpen((v) => !v)}
          className="flex items-center gap-1 self-start text-sm font-semibold tracking-tight text-foreground/80 hover:text-foreground"
        >
          {logsOpen ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
          <Terminal className="size-4" />
          日志
          <span className="text-xs font-normal text-muted-foreground">
            ({logs.length})
          </span>
        </button>
        {logsOpen ? (
          <LogConsole
            lines={logs}
            onClear={() => setLogs([])}
            className="h-32"
            emptyHint={running ? "等待日志..." : "暂无日志"}
          />
        ) : null}
      </section>
    </div>
  );
}

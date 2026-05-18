"use client";

import * as React from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ProxyItem = {
  id: number;
  proxy_url: string;
  ip_address?: string | null;
  location?: string | null;
  provider?: string | null;
};

type ProxyAddResponse = {
  success_count: number;
  failed_count: number;
};

type ProxyDetectResponse = {
  success: boolean;
  ip?: string | null;
  location?: string | null;
  as_number?: string | null;
  provider?: string | null;
  error?: string | null;
};

export interface ProxyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const COLUMN_WIDTHS = ["w-[60px]", "w-[200px]", "w-[140px]", "w-[160px]", "w-[200px]", "w-[110px]"];

export function ProxyDialog({ open, onOpenChange, onChanged }: ProxyDialogProps) {
  const [proxies, setProxies] = React.useState<ProxyItem[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [proxyText, setProxyText] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [redetectingId, setRedetectingId] = React.useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<number | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);

  const loadProxies = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<ProxyItem[]>("/api/proxy/list");
      setProxies(res ?? []);
      setSelectedId((prev) => {
        if (prev != null && (res ?? []).some((p) => p.id === prev)) return prev;
        return null;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "加载代理失败";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      void loadProxies();
    } else {
      setProxyText("");
      setRedetectingId(null);
      setSaving(false);
      setPendingDeleteId(null);
      setConfirmClearOpen(false);
    }
  }, [open, loadProxies]);

  const handleSave = async () => {
    const lines = proxyText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      toast.warning("请输入至少一个代理");
      return;
    }

    setSaving(true);
    try {
      const res = await apiPost<ProxyAddResponse>("/api/proxy/add", {
        proxy_strings: lines,
      });
      const success = res?.success_count ?? 0;
      const failed = res?.failed_count ?? 0;
      if (success > 0 && failed === 0) {
        toast.success(`✅ 成功 ${success} 个`);
      } else if (success > 0) {
        toast.warning(`✅ 成功 ${success} 个，⚠️ 失败 ${failed} 个`);
      } else {
        toast.error(`⚠️ 全部失败 (${failed} 个)`);
      }
      setProxyText("");
      await loadProxies();
      onChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "保存代理失败";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRedetect = async (proxy: ProxyItem) => {
    setRedetectingId(proxy.id);
    try {
      const res = await apiPost<ProxyDetectResponse>(
        `/api/proxy/${proxy.id}/redetect`,
      );
      if (res?.success) {
        toast.success(
          `✅ 检测成功${res.ip ? ` · ${res.ip}` : ""}${
            res.location ? ` · ${res.location}` : ""
          }`,
        );
        await loadProxies();
        onChanged?.();
      } else {
        toast.error(`⚠️ 检测失败: ${res?.error ?? "未知错误"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "重新检测失败";
      toast.error(msg);
    } finally {
      setRedetectingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setPendingDeleteId(null);
    try {
      await apiDelete(`/api/proxy/${id}`);
      toast.success("已删除代理");
      if (selectedId === id) setSelectedId(null);
      await loadProxies();
      onChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "删除失败";
      toast.error(msg);
    }
  };

  const handleClearAll = async () => {
    setConfirmClearOpen(false);
    try {
      await apiDelete("/api/proxy");
      toast.success("已清空所有代理");
      setSelectedId(null);
      await loadProxies();
      onChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "清空失败";
      toast.error(msg);
    }
  };

  const handleUseSelected = async () => {
    if (selectedId == null) {
      toast.warning("请先选中一个代理");
      return;
    }
    try {
      await apiPost("/api/proxy/select", { id: selectedId });
      const target = proxies.find((p) => p.id === selectedId);
      toast.success(
        `✅ 已使用代理${target?.proxy_url ? `: ${target.proxy_url}` : ""}`,
      );
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "切换代理失败";
      toast.error(msg);
    }
  };

  const pendingDeleteProxy = React.useMemo(
    () => proxies.find((p) => p.id === pendingDeleteId) ?? null,
    [proxies, pendingDeleteId],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[calc(100%-2rem)] sm:max-w-[900px] gap-4",
        )}
      >
        <DialogHeader>
          <DialogTitle>代理配置</DialogTitle>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <div className="text-sm font-semibold">📋 已保存的代理列表</div>
          <div className="rounded-md border">
            <div className="max-h-[250px] overflow-auto">
              <RadioGroup
                value={selectedId == null ? "" : String(selectedId)}
                onValueChange={(value) => {
                  if (typeof value !== "string" || value === "") {
                    setSelectedId(null);
                    return;
                  }
                  const parsed = Number.parseInt(value, 10);
                  setSelectedId(Number.isNaN(parsed) ? null : parsed);
                }}
              >
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/75">
                    <TableRow>
                      <TableHead className={COLUMN_WIDTHS[0]}>选择</TableHead>
                      <TableHead className={COLUMN_WIDTHS[1]}>代理地址</TableHead>
                      <TableHead className={COLUMN_WIDTHS[2]}>IP</TableHead>
                      <TableHead className={COLUMN_WIDTHS[3]}>位置</TableHead>
                      <TableHead className={COLUMN_WIDTHS[4]}>商家</TableHead>
                      <TableHead className={COLUMN_WIDTHS[5]}>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-20 text-center text-sm text-muted-foreground"
                        >
                          加载中…
                        </TableCell>
                      </TableRow>
                    ) : proxies.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="h-20 text-center text-sm text-muted-foreground"
                        >
                          暂无代理
                        </TableCell>
                      </TableRow>
                    ) : (
                      proxies.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className={COLUMN_WIDTHS[0]}>
                            <Radio.Root
                              value={String(p.id)}
                              className="inline-flex size-4 items-center justify-center rounded-full border border-input bg-background outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary"
                            >
                              <Radio.Indicator
                                keepMounted
                                className="size-1.5 rounded-full bg-primary-foreground data-unchecked:hidden"
                              />
                            </Radio.Root>
                          </TableCell>
                          <TableCell
                            className={cn(
                              COLUMN_WIDTHS[1],
                              "font-mono text-xs break-all",
                            )}
                          >
                            {p.proxy_url || "—"}
                          </TableCell>
                          <TableCell className={COLUMN_WIDTHS[2]}>
                            {p.ip_address ? (
                              <span className="font-mono text-xs">
                                {p.ip_address}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                未检测
                              </span>
                            )}
                          </TableCell>
                          <TableCell className={COLUMN_WIDTHS[3]}>
                            {p.location || (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className={COLUMN_WIDTHS[4]}>
                            {p.provider || (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className={COLUMN_WIDTHS[5]}>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon-sm"
                                variant="outline"
                                title="重新检测"
                                disabled={redetectingId === p.id}
                                onClick={() => void handleRedetect(p)}
                              >
                                {redetectingId === p.id ? (
                                  <Loader2 className="animate-spin" />
                                ) : (
                                  <RefreshCw />
                                )}
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="destructive"
                                title="删除"
                                onClick={() => setPendingDeleteId(p.id)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </RadioGroup>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className="text-sm font-semibold">➕ 添加新代理</div>
          <div className="text-xs text-muted-foreground">
            每行一个代理，支持格式：
            <span className="ml-1">http://host:port</span>
            <span className="mx-1">·</span>
            <span>http://user:pass@host:port</span>
            <span className="mx-1">·</span>
            <span>socks5://host:port</span>
          </div>
          <Textarea
            value={proxyText}
            onChange={(e) => setProxyText(e.target.value)}
            placeholder="输入新代理列表..."
            className="min-h-[120px] max-h-[180px] font-mono text-xs"
            disabled={saving}
          />
        </section>

        <DialogFooter className="sm:justify-between sm:gap-2">
          <div className="flex flex-wrap gap-2 sm:flex-row">
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-primary text-primary-foreground"
            >
              {saving ? (
                <Loader2 className="animate-spin" />
              ) : (
                <span aria-hidden>💾</span>
              )}
              保存并检测
            </Button>
            <Button
              onClick={() => void handleUseSelected()}
              disabled={selectedId == null}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
            >
              <span aria-hidden>✅</span>
              使用选中的代理
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmClearOpen(true)}
              disabled={proxies.length === 0}
            >
              <Trash2 />
              清空所有
            </Button>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(value) => {
          if (!value) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteProxy
                ? `确定要删除代理 ${pendingDeleteProxy.proxy_url} 吗？`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId != null) {
                  void handleDelete(pendingDeleteId);
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmClearOpen}
        onOpenChange={(value) => {
          if (!value) setConfirmClearOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空</AlertDialogTitle>
            <AlertDialogDescription>
              确定要清空所有代理吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleClearAll()}
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

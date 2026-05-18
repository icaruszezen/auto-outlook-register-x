/**
 * 自动注册 Tab —— useWS 用法示例
 *
 * 本页面会通过 WebSocket 与后端 /ws/register 通信，下方示例展示了如何使用
 * `useWS` hook 串联日志流、确认弹窗和按钮状态。具体业务实现见 P3 阶段。
 *
 * @example
 * ```tsx
 * "use client";
 * import { useWS } from "@/lib/use-ws";
 * import type { RegisterWS } from "@/types/ws";
 *
 * export default function RegisterPage() {
 *   const { status, lastMessage, send, connect, disconnect } = useWS<
 *     RegisterWS.IncomingMessage,
 *     RegisterWS.OutgoingMessage
 *   >("/ws/register", { autoConnect: false });
 *
 *   useEffect(() => {
 *     if (!lastMessage) return;
 *     switch (lastMessage.type) {
 *       case "log":
 *         appendLog(lastMessage.message);
 *         break;
 *       case "need_confirm":
 *         openConfirmDialog(lastMessage.message, () =>
 *           send({ type: "confirm_done" }),
 *         );
 *         break;
 *       case "need_confirm_success":
 *         openYesNoDialog(lastMessage.message, (ok) =>
 *           send({ type: "confirm_success", success: ok }),
 *         );
 *         break;
 *       case "finished":
 *         toast(lastMessage.success ? "注册成功" : "注册失败");
 *         send({ type: "close_browser" });
 *         break;
 *     }
 *   }, [lastMessage, send]);
 *
 *   return (
 *     <div>
 *       <button onClick={connect} disabled={status !== "idle" && status !== "closed"}>
 *         🚀 开始注册
 *       </button>
 *       <button
 *         onClick={() => {
 *           send({ type: "stop" });
 *           disconnect();
 *         }}
 *         disabled={status !== "open"}
 *       >
 *         ⏹ 停止
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 *
 * 监听邮箱（带 query）：
 * ```ts
 * useWS<MonitorWS.IncomingMessage, MonitorWS.OutgoingMessage>("/ws/monitor", {
 *   autoConnect: true,
 *   query: { email, password, interval, use_api: useApi },
 * });
 * ```
 */
export default function RegisterPage() {
  return <h1 className="text-xl font-semibold tracking-tight">自动注册</h1>;
}

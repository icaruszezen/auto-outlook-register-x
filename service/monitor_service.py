# -*- coding: utf-8 -*-
"""WebSocket-facing service that wraps the Outlook email monitor.

Bridges the synchronous monitor loop (Selenium browser mode or Microsoft Graph
API mode) to an async WebSocket. The monitor code in core/ is unchanged — this
layer only translates its callbacks into JSON frames and forwards a stop
signal from the client.

Wire protocol
-------------
Server -> client:
  {"type": "log",      "message": str}
  {"type": "emails",   "items":   [{"from", "subject", "date", "body"}]}
  {"type": "finished", "success": bool, "message": str}

Client -> server:
  {"type": "stop"}
"""
from __future__ import annotations

import asyncio
import threading
import time
from typing import Any, Dict, List

from core.outlook.outlook_api_monitor import OutlookAPIMonitor
from core.outlook.outlook_monitor import OutlookEmailMonitor
from core.outlook.token_manager import TokenManager
from utils.logger import get_logger

logger = get_logger(__name__)


def _format_emails(raw_emails: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {
            "from": e.get("sender", ""),
            "subject": e.get("subject", ""),
            "date": e.get("time", ""),
            "body": e.get("body", ""),
        }
        for e in raw_emails
    ]


class MonitorService:
    def __init__(self, websocket) -> None:
        self.ws = websocket
        self.loop: asyncio.AbstractEventLoop | None = None
        self._stop_event = threading.Event()
        self._closed = False
        self.monitor: OutlookEmailMonitor | None = None
        self.api_monitor: OutlookAPIMonitor | None = None
        self.token_manager = TokenManager()

    async def start(
        self,
        email: str,
        password: str,
        interval: int = 30,
        use_api: bool = False,
    ) -> None:
        self.loop = asyncio.get_running_loop()
        recv_task = asyncio.create_task(self._receive_loop())

        try:
            await self.loop.run_in_executor(
                None, self._run_monitor, email, password, interval, use_api
            )
        finally:
            self._closed = True
            self._stop_event.set()
            recv_task.cancel()
            try:
                await recv_task
            except (asyncio.CancelledError, Exception):
                pass
            await self.loop.run_in_executor(None, self._close_resources)

    async def _receive_loop(self) -> None:
        try:
            while not self._closed:
                data = await self.ws.receive_json()
                if data.get("type") == "stop":
                    self._stop_event.set()
                else:
                    logger.warning(f"未知 ws 消息: {data!r}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.info(f"ws 接收循环结束: {e}")
            self._stop_event.set()

    def _run_monitor(
        self, email: str, password: str, interval: int, use_api: bool
    ) -> None:
        try:
            self._emit_log("=" * 60)
            self._emit_log(f"🚀 开始监听邮箱: {email}")
            self._emit_log("=" * 60)

            if use_api:
                try:
                    token = self.token_manager.load_token(email)
                except Exception as e:
                    logger.error(f"加载token失败: {e}", exc_info=True)
                    self._emit_log(f"⚠️  加载token失败，切换到浏览器模式: {e}")
                    token = None

                if token:
                    self._emit_log("✅ 找到有效的API token，使用API模式")
                    self._run_api_mode(email, token, interval)
                    return
                self._emit_log("⚠️  未找到有效的API token，切换到浏览器模式")

            self._run_browser_mode(email, password, interval)
        except Exception as e:
            logger.error(f"监听失败: {e}", exc_info=True)
            self._emit_log(f"❌ 监听失败: {e}")
            self._emit_finished(False, f"监听失败: {e}")

    def _run_browser_mode(self, email: str, password: str, interval: int) -> None:
        try:
            self.monitor = OutlookEmailMonitor(
                email, password, progress_callback=self._emit_log
            )

            self._emit_log("🌐 正在启动浏览器...")
            try:
                if not self.monitor.start_browser():
                    self._emit_log("❌ 浏览器启动失败，请检查Chrome是否已安装")
                    self._emit_finished(False, "浏览器启动失败")
                    return
            except Exception as e:
                logger.error(f"启动浏览器异常: {e}", exc_info=True)
                self._emit_log(f"❌ 启动浏览器异常: {e}")
                self._emit_finished(False, f"启动浏览器异常: {e}")
                return

            self._emit_log("🔐 正在登录Outlook...")
            try:
                if not self.monitor.login():
                    self._emit_log("❌ 登录失败，请检查邮箱和密码")
                    self._emit_finished(False, "登录失败")
                    return
            except Exception as e:
                logger.error(f"登录异常: {e}", exc_info=True)
                self._emit_log(f"❌ 登录异常: {e}")
                self._emit_finished(False, f"登录异常: {e}")
                return
        except Exception as e:
            logger.error(f"浏览器模式初始化失败: {e}", exc_info=True)
            self._emit_log(f"❌ 初始化失败: {e}")
            self._emit_finished(False, f"初始化失败: {e}")
            return

        try:
            self._emit_log("📬 正在获取邮件列表...")
            emails = self.monitor.get_latest_emails(count=10)
            if emails:
                self._emit_log(f"✅ 获取到 {len(emails)} 封邮件")
                self._emit_emails(_format_emails(emails))
            else:
                self._emit_log("📭 收件箱为空")
        except Exception as e:
            logger.error(f"获取邮件列表失败: {e}", exc_info=True)
            self._emit_log(f"⚠️  获取邮件列表失败: {e}")
            emails = []

        self._emit_log(f"\n⏰ 开始监听，每{interval}秒检查一次...")
        self._emit_log("✅ 监听已启动，浏览器保持打开状态")

        last_count = len(emails) if emails else 0

        while not self._stop_event.is_set():
            try:
                if self._stop_event.wait(timeout=interval):
                    break

                try:
                    self._emit_log(
                        f"\n🔄 [{time.strftime('%H:%M:%S')}] 检查新邮件..."
                    )
                    if self.monitor and self.monitor.driver:
                        self.monitor.driver.refresh()
                        time.sleep(3)
                    else:
                        self._emit_log("⚠️  浏览器已关闭，停止监听")
                        break
                except Exception as e:
                    logger.error(f"刷新页面失败: {e}")
                    self._emit_log(f"⚠️  刷新页面失败: {e}")
                    continue

                try:
                    new_emails = self.monitor.get_latest_emails(count=10)
                    if new_emails:
                        current = len(new_emails)
                        if current > last_count:
                            delta = current - last_count
                            self._emit_log(f"📨 检测到 {delta} 封新邮件！")
                            self._emit_emails(_format_emails(new_emails[:delta]))
                            last_count = current
                        else:
                            self._emit_log("ℹ️  暂无新邮件")
                    else:
                        self._emit_log("ℹ️  收件箱为空")
                except Exception as e:
                    logger.error(f"获取邮件失败: {e}", exc_info=True)
                    self._emit_log(f"⚠️  获取邮件失败: {e}")
                    continue
            except Exception as e:
                logger.error(f"监听循环异常: {e}", exc_info=True)
                self._emit_log(f"⚠️  监听循环异常: {e}")
                continue

        self._emit_log("\n✅ 监听已停止")
        self._emit_finished(True, "监听已停止")

    def _run_api_mode(self, email: str, token: Any, interval: int) -> None:
        try:
            self.api_monitor = OutlookAPIMonitor(
                email, token, progress_callback=self._emit_log
            )

            if not self.api_monitor.test_connection():
                self._emit_log("⚠️  API连接失败，token可能已过期")
                try:
                    self.token_manager.delete_token(email)
                except Exception as e:
                    logger.warning(f"删除过期 token 失败: {e}")
                self._emit_finished(False, "API连接失败")
                return

            self._emit_log("📬 正在获取邮件列表...")
            emails = self.api_monitor.get_latest_emails(count=10)
        except Exception as e:
            logger.error(f"API模式初始化失败: {e}", exc_info=True)
            self._emit_log(f"❌ API模式初始化失败: {e}")
            self._emit_finished(False, f"API模式初始化失败: {e}")
            return

        if emails:
            self._emit_log(f"✅ 获取到 {len(emails)} 封邮件")
            self._emit_emails(_format_emails(emails))
        else:
            self._emit_log("📭 收件箱为空")

        self._emit_log(f"\n⏰ 开始监听，每{interval}秒检查一次...")
        self._emit_log("✅ 监听已启动（API模式，浏览器已关闭）")

        last_count = len(emails) if emails else 0

        while not self._stop_event.is_set():
            try:
                if self._stop_event.wait(timeout=interval):
                    break

                self._emit_log(
                    f"\n🔄 [{time.strftime('%H:%M:%S')}] 检查新邮件..."
                )
                new_emails = self.api_monitor.get_latest_emails(count=10)
                if new_emails:
                    current = len(new_emails)
                    if current > last_count:
                        delta = current - last_count
                        self._emit_log(f"📨 检测到 {delta} 封新邮件！")
                        self._emit_emails(_format_emails(new_emails[:delta]))
                        last_count = current
                    else:
                        self._emit_log("ℹ️  暂无新邮件")
                else:
                    self._emit_log("ℹ️  收件箱为空")
            except Exception as e:
                logger.error(f"检查邮件失败: {e}")
                self._emit_log(f"⚠️  检查邮件时出错: {e}")
                continue

        self._emit_log("\n✅ 监听已停止")
        self._emit_finished(True, "监听已停止")

    def _close_resources(self) -> None:
        if self.monitor is None:
            return
        try:
            if getattr(self.monitor, "driver", None):
                self.monitor.close()
        except Exception as e:
            logger.warning(f"关闭浏览器失败: {e}")

    def _emit_log(self, message: str) -> None:
        self._send_threadsafe({"type": "log", "message": message})

    def _emit_emails(self, items: List[Dict[str, Any]]) -> None:
        self._send_threadsafe({"type": "emails", "items": items})

    def _emit_finished(self, success: bool, message: str) -> None:
        self._send_threadsafe(
            {"type": "finished", "success": success, "message": message}
        )

    def _send_threadsafe(self, payload: Dict[str, Any]) -> None:
        if self.loop is None or self._closed:
            return
        try:
            asyncio.run_coroutine_threadsafe(self._send(payload), self.loop)
        except RuntimeError:
            pass

    async def _send(self, payload: Dict[str, Any]) -> None:
        try:
            await self.ws.send_json(payload)
        except Exception as e:
            logger.debug(f"ws 发送失败 ({payload.get('type')}): {e}")

# -*- coding: utf-8 -*-
"""WebSocket-facing service that wraps Augment registration.

Mirrors the gui/augment_tab.py::RegisterWorker thread pattern but pushes log
events to a WebSocket instead of Qt signals. Translates AugmentRegister's
``log_callback(level, message)`` into JSON frames and runs the synchronous
selenium flow in an executor.

Wire protocol
-------------
Server -> client:
  {"type": "log",      "level": "info|warning|error|debug", "message": str}
  {"type": "started",  "email": str}
  {"type": "finished", "success": bool, "message": str}

Client -> server:
  {"type": "stop"}
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

from config.settings import Settings
from core.proxy import create_stealth_browser, get_proxy_manager
from core.register.register_factory import RegisterFactory
from database.db_manager import DatabaseManager
from utils.logger import get_logger

logger = get_logger(__name__)


class AugmentRegisterService:
    def __init__(self, websocket) -> None:
        self.ws = websocket
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.register = None
        self.driver = None
        self._closed = False
        self._stop_requested = False

    async def start(self, email: Optional[str] = None, user_info: Optional[Dict[str, Any]] = None) -> None:
        self.loop = asyncio.get_running_loop()
        recv_task = asyncio.create_task(self._receive_loop())

        try:
            target_email = email
            if not target_email:
                # Match Qt: take the first unused email when none was supplied.
                emails = DatabaseManager().get_all_emails(status="unused")
                if not emails:
                    await self._send({
                        "type": "finished",
                        "success": False,
                        "message": "没有可用的邮箱",
                    })
                    return
                target_email = emails[0].email

            await self._send({"type": "started", "email": target_email})

            success, message = await self.loop.run_in_executor(
                None, self._run_register, target_email, user_info or {}
            )
            await self._send({
                "type": "finished",
                "success": success,
                "message": message,
            })
        finally:
            self._closed = True
            await self.loop.run_in_executor(None, self._cleanup_driver)
            recv_task.cancel()
            try:
                await recv_task
            except (asyncio.CancelledError, Exception):
                pass

    async def _receive_loop(self) -> None:
        try:
            while not self._closed:
                data = await self.ws.receive_json()
                if data.get("type") == "stop":
                    self._stop_requested = True
                    if self.register:
                        try:
                            self.register.stop()
                        except Exception as e:
                            logger.warning(f"停止 Augment 注册失败: {e}")
                else:
                    logger.warning(f"未知 ws 消息: {data!r}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.info(f"ws 接收循环结束: {e}")

    def _run_register(self, email: str, user_info: Dict[str, Any]) -> tuple[bool, str]:
        try:
            self._on_log("info", "🔄 正在获取代理...")
            proxy = get_proxy_manager().get_next_proxy()
            if proxy:
                self._on_log("info", f"✅ 获取代理: {proxy.to_chrome_proxy()}")
            else:
                self._on_log("warning", "⚠️ 未配置代理，使用本地IP")

            self._on_log("info", "🌐 正在创建浏览器...")
            self.driver = create_stealth_browser(
                chrome_version=Settings.CHROME_VERSION,
                headless=False,
                proxy=proxy,
            )
            self._on_log("info", "✅ 浏览器创建成功")

            self._on_log("info", "🔧 正在创建注册器...")
            self.register = RegisterFactory.create_register("augment", self.driver)
            if self.register is None:
                return False, "创建注册器失败"

            self.register.set_log_callback(self._on_log)

            self._on_log("info", "🚀 开始注册流程...")
            success = self.register.start_register(email, user_info)
            return bool(success), "注册成功" if success else "注册失败"
        except Exception as e:
            logger.error(f"Augment 注册线程异常: {e}")
            self._on_log("error", f"❌ 错误: {e}")
            return False, str(e)

    def _cleanup_driver(self) -> None:
        if self.driver is not None:
            try:
                self.driver.quit()
            except Exception:
                pass
            self.driver = None

    def _on_log(self, level: str, message: str) -> None:
        self._send_threadsafe({"type": "log", "level": level, "message": message})

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

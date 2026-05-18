# -*- coding: utf-8 -*-
"""WebSocket-facing service that wraps OutlookRegistration.

Bridges the synchronous registration worker (driven by Selenium in a thread)
to an async WebSocket. The browser/registration code in core/ is unchanged —
this layer only translates its callbacks into JSON frames.

Wire protocol
-------------
Server -> client:
  {"type": "log",                 "message": str}
  {"type": "need_confirm",        "message": str}
  {"type": "need_confirm_success","message": str}
  {"type": "finished",            "success": bool, "user_info": dict}

Client -> server:
  {"type": "confirm_done"}
  {"type": "confirm_success", "success": bool}
  {"type": "close_browser"}
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Tuple

from core.outlook.outlook_register import OutlookRegistration
from service.confirm_bus import ConfirmBus
from utils.log_manager import LogManager
from utils.logger import get_logger

logger = get_logger(__name__)

_KEY_CONFIRM = "confirm"
_KEY_CONFIRM_SUCCESS = "confirm_success"
_KEY_CLOSE_BROWSER = "close_browser"


class OutlookRegisterService:
    def __init__(self, websocket) -> None:
        self.ws = websocket
        self.bus = ConfirmBus()
        self.registrar: OutlookRegistration | None = None
        self.current_email: str | None = None
        self.loop: asyncio.AbstractEventLoop | None = None
        self._closed = False

    async def start(self) -> None:
        self.loop = asyncio.get_running_loop()
        recv_task = asyncio.create_task(self._receive_loop())

        try:
            success, user_info = await self.loop.run_in_executor(None, self._run_register)
            await self._send({
                "type": "finished",
                "success": success,
                "user_info": user_info,
            })

            await self.loop.run_in_executor(None, self.bus.wait_for, _KEY_CLOSE_BROWSER)
            await self.loop.run_in_executor(None, self._close_registrar)
        finally:
            self._closed = True
            self.bus.cancel_all()
            recv_task.cancel()
            try:
                await recv_task
            except (asyncio.CancelledError, Exception):
                pass

    async def _receive_loop(self) -> None:
        try:
            while not self._closed:
                data = await self.ws.receive_json()
                msg_type = data.get("type")
                if msg_type == "confirm_done":
                    self.bus.set(_KEY_CONFIRM, True)
                elif msg_type == "confirm_success":
                    self.bus.set(_KEY_CONFIRM_SUCCESS, bool(data.get("success", False)))
                elif msg_type == "close_browser":
                    self.bus.set(_KEY_CLOSE_BROWSER, True)
                else:
                    logger.warning(f"未知 ws 消息: {data!r}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.info(f"ws 接收循环结束: {e}")
            self.bus.cancel_all()

    def _run_register(self) -> Tuple[bool, Dict[str, Any]]:
        try:
            self.registrar = OutlookRegistration(
                progress_callback=self._on_progress,
                confirm_callback=self._on_confirm,
                confirm_success_callback=self._on_confirm_success,
            )
            result = self.registrar.register()
            user_info = getattr(self.registrar, "user_info", {}) or {}
            return bool(result), user_info
        except Exception as e:
            logger.error(f"注册线程异常: {e}")
            self._on_progress(f"\n❌ 注册异常: {e}")
            user_info = getattr(self.registrar, "user_info", {}) or {}
            return False, user_info

    def _close_registrar(self) -> None:
        if self.registrar is None:
            return
        try:
            self.registrar.close()
        except Exception as e:
            logger.warning(f"关闭浏览器失败: {e}")

    def _on_progress(self, message: str) -> None:
        if self.current_email is None and ("生成邮箱:" in message or "📧 生成邮箱:" in message):
            parts = message.split(":", 1)
            if len(parts) == 2:
                self.current_email = parts[1].strip()

        if self.current_email:
            try:
                LogManager.append_log(self.current_email, message)
            except Exception as e:
                logger.warning(f"持久化日志失败: {e}")

        self._send_threadsafe({"type": "log", "message": message})

    def _on_confirm(self, message: str) -> None:
        self._send_threadsafe({"type": "need_confirm", "message": message})
        self.bus.wait_for(_KEY_CONFIRM)

    def _on_confirm_success(self, message: str) -> bool:
        self._send_threadsafe({"type": "need_confirm_success", "message": message})
        result = self.bus.wait_for(_KEY_CONFIRM_SUCCESS)
        return bool(result)

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

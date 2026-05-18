# -*- coding: utf-8 -*-
"""WebSocket route for the Outlook email monitor flow."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from service.monitor_service import MonitorService
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


def _parse_bool(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: str | None, default: int, minimum: int = 1) -> int:
    if value is None:
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= minimum else default


@router.websocket("/ws/monitor")
async def monitor_ws(websocket: WebSocket) -> None:
    params = websocket.query_params
    email = (params.get("email") or "").strip()
    password = params.get("password") or ""
    interval = _parse_int(params.get("interval"), default=30, minimum=10)
    use_api = _parse_bool(params.get("use_api"))

    await websocket.accept()

    if not email or not password:
        try:
            await websocket.send_json(
                {
                    "type": "finished",
                    "success": False,
                    "message": "缺少 email 或 password 参数",
                }
            )
        finally:
            await websocket.close()
        return

    service = MonitorService(websocket)
    try:
        await service.start(email, password, interval=interval, use_api=use_api)
    except WebSocketDisconnect:
        logger.info("ws 客户端已断开")
    except Exception as e:
        logger.error(f"ws /ws/monitor 异常: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

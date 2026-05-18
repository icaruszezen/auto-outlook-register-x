# -*- coding: utf-8 -*-
"""WebSocket route for the Outlook registration flow."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from service.register_service import OutlookRegisterService
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.websocket("/ws/register")
async def register_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    service = OutlookRegisterService(websocket)
    try:
        await service.start()
    except WebSocketDisconnect:
        logger.info("ws 客户端已断开")
    except Exception as e:
        logger.error(f"ws /ws/register 异常: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

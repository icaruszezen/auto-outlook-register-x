# -*- coding: utf-8 -*-
"""WebSocket route for the Augment registration flow."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from service.augment_service import AugmentRegisterService
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.websocket("/ws/augment-register")
async def augment_register_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    # Optional preset: ?email=foo@bar.com — Qt's flow grabs the first unused
    # email when none is supplied, so we mirror that fallback in the service.
    email = websocket.query_params.get("email") or None

    service = AugmentRegisterService(websocket)
    try:
        await service.start(email=email)
    except WebSocketDisconnect:
        logger.info("ws 客户端已断开")
    except Exception as e:
        logger.error(f"ws /ws/augment-register 异常: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

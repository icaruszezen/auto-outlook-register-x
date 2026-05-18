# -*- coding: utf-8 -*-
"""REST endpoints for Augment account management.

Mirrors gui/augment_tab.py:
  - GET /api/augment/accounts   list AugmentDBManager.get_all_accounts()
  - POST /api/augment/register  spawn an async registration task (returns task_id)
                                actual log streaming happens via /ws/augment-register
  - DELETE /api/augment/accounts/{id}
  - POST /api/augment/extract-info / bind-card  placeholders (Qt impl is also a stub)
"""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, HTTPException

from api.schemas import (
    AugmentAccountItem,
    AugmentAccountListResponse,
    AugmentBindCardRequest,
    AugmentExtractRequest,
    AugmentRegisterRequest,
    AugmentRegisterResponse,
    GenericResponse,
)
from database import DatabaseManager
from database.augment_db_manager import AugmentDBManager
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/augment", tags=["augment"])


def _augment_db() -> AugmentDBManager:
    return AugmentDBManager()


@router.get("/accounts", response_model=AugmentAccountListResponse)
def list_accounts():
    db = _augment_db()
    accounts = db.get_all_accounts()

    items: List[AugmentAccountItem] = [
        AugmentAccountItem(**a.to_dict()) for a in accounts
    ]
    registered = sum(1 for a in accounts if a.status == "registered")
    card_bound = sum(1 for a in accounts if a.card_bound == 1)

    return AugmentAccountListResponse(
        total=len(accounts),
        registered=registered,
        card_bound=card_bound,
        items=items,
    )


@router.post("/register", response_model=AugmentRegisterResponse)
def start_register(req: AugmentRegisterRequest):
    """Allocate a task_id; client connects to /ws/augment-register?email=... to stream."""
    target_email = (req.email or "").strip()
    if not target_email:
        emails = DatabaseManager().get_all_emails(status="unused")
        if not emails:
            raise HTTPException(status_code=400, detail="没有可用的邮箱")
        target_email = emails[0].email

    task_id = uuid.uuid4().hex
    return AugmentRegisterResponse(task_id=task_id, email=target_email)


@router.delete("/accounts/{account_id}", response_model=GenericResponse)
def delete_account(account_id: int):
    db = _augment_db()
    if db.get_account_by_id(account_id) is None:
        raise HTTPException(status_code=404, detail=f"账号不存在: {account_id}")
    if not db.delete_account(account_id):
        raise HTTPException(status_code=500, detail="删除失败")
    return GenericResponse(success=True, message=f"已删除账号 {account_id}")


@router.post("/extract-info", response_model=GenericResponse)
def extract_info(req: AugmentExtractRequest):
    """占位实现，与 Qt 中的 extract_account_info 一致（功能开发中）."""
    return GenericResponse(success=False, message="提取功能开发中")


@router.post("/bind-card", response_model=GenericResponse)
def bind_card(req: AugmentBindCardRequest):
    """占位实现，与 Qt 中的 bind_card 一致（功能开发中）."""
    return GenericResponse(success=False, message="绑卡功能开发中")

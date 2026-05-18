# -*- coding: utf-8 -*-
"""REST endpoints for Outlook accounts and per-account registration logs."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException

from config.settings import Settings
from utils.file_manager import FileManager, get_db_manager
from utils.log_manager import LogManager
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/outlook", tags=["outlook"])


@router.get("/accounts")
def list_accounts() -> List[dict]:
    return FileManager.load_accounts()


@router.delete("/accounts/{email}")
def delete_account(email: str) -> dict:
    accounts = FileManager.load_accounts()
    if not any(acc.get("email") == email for acc in accounts):
        raise HTTPException(status_code=404, detail=f"账号不存在: {email}")

    db = get_db_manager()
    if db is not None:
        try:
            db.delete_outlook_account(email)
        except Exception as e:
            logger.warning(f"数据库删除账号失败 ({email}): {e}")

    try:
        remaining = [acc for acc in accounts if acc.get("email") != email]
        with open(Settings.ACCOUNTS_FILE, "w", encoding="utf-8") as f:
            for acc in remaining:
                f.write(f"状态: {acc.get('status', '未知')}\n")
                f.write(f"邮箱: {acc.get('email', '')}\n")
                f.write(f"密码: {acc.get('password', '')}\n")
                f.write(f"生日: {acc.get('birthday', '')}\n")
                f.write(f"创建时间: {acc.get('created_at', '')}\n")
                f.write("-" * 50 + "\n")
    except Exception as e:
        logger.error(f"写回账号文件失败 ({email}): {e}")
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")

    LogManager.delete_log(email)
    return {"success": True, "email": email}


@router.get("/accounts/{email}/log")
def get_account_log(email: str) -> dict:
    lines = LogManager.load_log(email)
    return {"email": email, "lines": lines}

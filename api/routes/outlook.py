# -*- coding: utf-8 -*-
"""REST endpoints for Outlook accounts and per-account registration logs."""
from __future__ import annotations

import io
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from config.settings import Settings
from utils.file_manager import FileManager, get_db_manager
from utils.log_manager import LogManager
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/outlook", tags=["outlook"])


@router.get("/accounts")
def list_accounts() -> List[dict]:
    return FileManager.load_accounts()


@router.get("/accounts/export")
def export_accounts() -> StreamingResponse:
    """Stream accounts.txt for download (mirrors AccountsTab 导出)."""
    accounts = FileManager.load_accounts()
    buffer = io.StringIO()
    for acc in accounts:
        buffer.write(f"状态: {acc.get('status', '未知')}\n")
        buffer.write(f"邮箱: {acc.get('email', '')}\n")
        buffer.write(f"密码: {acc.get('password', '')}\n")
        buffer.write(f"生日: {acc.get('birthday', '')}\n")
        buffer.write(f"创建时间: {acc.get('created_at', '')}\n")
        buffer.write("-" * 50 + "\n")

    data = buffer.getvalue().encode("utf-8")
    return StreamingResponse(
        io.BytesIO(data),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="accounts.txt"'},
    )


@router.delete("/accounts")
def clear_accounts() -> dict:
    """清空所有 Outlook 账号（数据库 + 文件 + 日志）."""
    accounts = FileManager.load_accounts()
    db = get_db_manager()
    if db is not None:
        for acc in accounts:
            email = acc.get("email")
            if not email:
                continue
            try:
                db.delete_outlook_account(email)
            except Exception as e:
                logger.warning(f"数据库删除账号失败 ({email}): {e}")

    try:
        if Settings.ACCOUNTS_FILE.exists():
            Settings.ACCOUNTS_FILE.unlink()
    except Exception as e:
        logger.error(f"删除账号文件失败: {e}")
        raise HTTPException(status_code=500, detail=f"清空失败: {e}")

    for acc in accounts:
        email = acc.get("email")
        if email:
            LogManager.delete_log(email)

    return {"success": True, "count": len(accounts)}


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

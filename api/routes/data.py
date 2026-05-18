# -*- coding: utf-8 -*-
"""REST endpoints for email/user/card data management.

Mirrors gui/data_management_tab.py — emails / users / cards CRUD plus
the "import outlook accounts" helper. Reuses utils generators and the
shared DatabaseManager, so no business logic is duplicated.
"""
from __future__ import annotations

import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from api.schemas import (
    CardGenerateRequest,
    CardItem,
    CardListResponse,
    EmailGenerateRequest,
    EmailItem,
    EmailListResponse,
    GenericResponse,
    ImportOutlookResponse,
    UserGenerateRequest,
    UserItem,
    UserListResponse,
)
from database import DatabaseManager
from database.models import Email
from utils.card_generator import CardGenerator
from utils.email_generator import EmailGenerator
from utils.logger import get_logger
from utils.user_generator import UserGenerator

logger = get_logger(__name__)

router = APIRouter(prefix="/api/data", tags=["data"])


def _db() -> DatabaseManager:
    return DatabaseManager()


# ==================== Emails ====================

@router.get("/emails", response_model=EmailListResponse)
def list_emails(status: Optional[str] = Query(default=None, description="unused | used | failed")):
    db = _db()
    emails = db.get_all_emails(status=status)
    items: List[EmailItem] = [
        EmailItem(
            id=e.id,
            email=e.email,
            type=e.type,
            status=e.status,
            created_at=e.created_at,
            used_at=e.used_at,
        )
        for e in emails
    ]
    return EmailListResponse(
        total=len(emails),
        unused=db.get_email_count("unused"),
        used=db.get_email_count("used"),
        items=items,
    )


@router.post("/emails/generate", response_model=GenericResponse)
def generate_emails(req: EmailGenerateRequest):
    db = _db()
    try:
        if req.mode == "fixed":
            if not req.fixed_emails or not req.fixed_emails.strip():
                raise HTTPException(status_code=400, detail="fixed_emails 不能为空")
            emails = EmailGenerator.parse_fixed_emails(req.fixed_emails)
        else:
            if not req.prefix or not req.suffix:
                raise HTTPException(status_code=400, detail="prefix 与 suffix 不能为空")
            count = req.count or 10
            if req.mode == "sequence":
                emails = EmailGenerator.generate_emails_sequence(
                    req.prefix, req.suffix, count, req.start_number or 1
                )
            else:  # random
                emails = EmailGenerator.generate_emails_random(req.prefix, req.suffix, count)

        if not emails:
            return GenericResponse(success=True, count=0, message="未生成任何邮箱")

        added = db.add_emails_batch(emails)
        return GenericResponse(success=True, count=added, message=f"成功生成 {added} 个邮箱")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成邮箱失败: {e}")
        raise HTTPException(status_code=500, detail=f"生成邮箱失败: {e}")


@router.delete("/emails/{email_id}", response_model=GenericResponse)
def delete_email(email_id: int):
    db = _db()
    if db.get_email_by_id(email_id) is None:
        raise HTTPException(status_code=404, detail=f"邮箱不存在: {email_id}")
    db.delete_email(email_id)
    return GenericResponse(success=True, message=f"已删除邮箱 {email_id}")


@router.delete("/emails", response_model=GenericResponse)
def clear_emails():
    db = _db()
    emails = db.get_all_emails()
    for e in emails:
        db.delete_email(e.id)
    return GenericResponse(success=True, count=len(emails), message=f"已清空 {len(emails)} 个邮箱")


@router.post("/emails/import-outlook", response_model=ImportOutlookResponse)
def import_outlook_emails():
    """从已注册 Outlook 账号批量导入邮箱列表（对应 DataManagementTab.import_outlook_accounts）."""
    db = _db()
    try:
        outlook_accounts = db.get_all_outlook_accounts(status="registered")
        if not outlook_accounts:
            raise HTTPException(status_code=404, detail="没有已注册的 Outlook 账号")

        # build lookup of existing emails to skip duplicates without N round-trips
        existing = {e.email for e in db.get_all_emails()}

        success = 0
        failed = 0
        skipped = 0

        for account in outlook_accounts:
            email_addr = (account.get("email") or "").strip()
            if not email_addr:
                failed += 1
                continue
            if email_addr in existing:
                skipped += 1
                continue
            try:
                db.add_email(
                    Email(
                        email=email_addr,
                        type="imported",
                        status="unused",
                        created_at=time.strftime("%Y-%m-%d %H:%M:%S"),
                    )
                )
                existing.add(email_addr)
                success += 1
            except Exception as e:
                logger.error(f"导入失败 {email_addr}: {e}")
                failed += 1

        return ImportOutlookResponse(
            success=True,
            success_count=success,
            failed_count=failed,
            skipped_count=skipped,
            total=len(outlook_accounts),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"导入 Outlook 邮箱失败: {e}")
        raise HTTPException(status_code=500, detail=f"导入失败: {e}")


# ==================== Users ====================

@router.get("/users", response_model=UserListResponse)
def list_users(status: Optional[str] = Query(default=None, description="unused | used")):
    db = _db()
    users = db.get_all_users(status=status)
    items: List[UserItem] = [
        UserItem(
            id=u.id,
            full_name=u.full_name,
            postal_code=u.postal_code,
            county=u.county,
            district=u.district,
            address_line1=u.address_line1,
            address_line2=u.address_line2,
            phone=u.phone,
            status=u.status,
            created_at=u.created_at,
            used_at=u.used_at,
        )
        for u in users
    ]
    return UserListResponse(
        total=len(users),
        unused=db.get_user_count("unused"),
        used=db.get_user_count("used"),
        items=items,
    )


@router.post("/users/generate", response_model=GenericResponse)
def generate_users(req: UserGenerateRequest):
    db = _db()
    try:
        if req.mode == "manual":
            if not req.manual_text or not req.manual_text.strip():
                raise HTTPException(status_code=400, detail="manual_text 不能为空")
            users = UserGenerator.parse_user_string(req.manual_text)
        else:
            count = req.count or 10
            users = UserGenerator.generate_users(count, use_taiwan=True)

        if not users:
            return GenericResponse(success=True, count=0, message="未生成任何用户")

        added = db.add_users_batch(users)
        return GenericResponse(success=True, count=added, message=f"成功生成 {added} 个用户")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成用户失败: {e}")
        raise HTTPException(status_code=500, detail=f"生成用户失败: {e}")


@router.delete("/users/{user_id}", response_model=GenericResponse)
def delete_user(user_id: int):
    db = _db()
    if db.get_user_by_id(user_id) is None:
        raise HTTPException(status_code=404, detail=f"用户不存在: {user_id}")
    db.delete_user(user_id)
    return GenericResponse(success=True, message=f"已删除用户 {user_id}")


@router.delete("/users", response_model=GenericResponse)
def clear_users():
    db = _db()
    users = db.get_all_users()
    for u in users:
        db.delete_user(u.id)
    return GenericResponse(success=True, count=len(users), message=f"已清空 {len(users)} 个用户")


# ==================== Cards ====================

@router.get("/cards", response_model=CardListResponse)
def list_cards(status: Optional[str] = Query(default=None, description="unused | used | failed")):
    db = _db()
    cards = db.get_all_cards(status=status)
    items: List[CardItem] = [
        CardItem(
            id=c.id,
            number=c.get_masked_number(),
            month=c.month,
            year=c.year,
            cvc=c.cvc,
            card_type=c.card_type,
            status=c.status,
            created_at=c.created_at,
            used_at=c.used_at,
        )
        for c in cards
    ]
    return CardListResponse(
        total=len(cards),
        unused=db.get_card_count("unused"),
        used=db.get_card_count("used"),
        items=items,
    )


@router.post("/cards/generate", response_model=GenericResponse)
def generate_cards(req: CardGenerateRequest):
    db = _db()
    try:
        if req.mode == "manual":
            if not req.manual_text or not req.manual_text.strip():
                raise HTTPException(status_code=400, detail="manual_text 不能为空")
            cards = CardGenerator.parse_card_string(req.manual_text)
        else:
            if not req.bin:
                raise HTTPException(status_code=400, detail="bin 不能为空")
            cards = CardGenerator.generate_cards(
                bin_value=req.bin,
                count=req.count or 10,
                month_option=(req.month or "random").lower(),
                year_option=(req.year or "random").lower(),
                cvv_option=req.cvv or "random",
            )

        if not cards:
            return GenericResponse(success=True, count=0, message="未生成任何卡片")

        added = db.add_cards_batch(cards)
        return GenericResponse(success=True, count=added, message=f"成功生成 {added} 张卡片")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成卡片失败: {e}")
        raise HTTPException(status_code=500, detail=f"生成卡片失败: {e}")


@router.delete("/cards/{card_id}", response_model=GenericResponse)
def delete_card(card_id: int):
    db = _db()
    if db.get_card_by_id(card_id) is None:
        raise HTTPException(status_code=404, detail=f"卡片不存在: {card_id}")
    db.delete_card(card_id)
    return GenericResponse(success=True, message=f"已删除卡片 {card_id}")


@router.delete("/cards", response_model=GenericResponse)
def clear_cards():
    db = _db()
    cards = db.get_all_cards()
    for c in cards:
        db.delete_card(c.id)
    return GenericResponse(success=True, count=len(cards), message=f"已清空 {len(cards)} 张卡片")

# -*- coding: utf-8 -*-
"""Pydantic schemas for the FastAPI request/response payloads."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ==================== Email ====================

class EmailGenerateRequest(BaseModel):
    mode: Literal["sequence", "random", "fixed"] = Field(
        ..., description="顺序生成 | 随机生成 | 固定邮箱"
    )
    prefix: Optional[str] = None
    suffix: Optional[str] = None
    count: Optional[int] = Field(default=10, ge=1, le=1000)
    start_number: Optional[int] = Field(default=1, ge=1, le=99999)
    fixed_emails: Optional[str] = Field(default=None, description="多行邮箱字符串，每行一个")


class EmailItem(BaseModel):
    id: Optional[int] = None
    email: str
    type: str
    status: str
    created_at: str
    used_at: Optional[str] = None


class EmailListResponse(BaseModel):
    total: int
    unused: int
    used: int
    items: List[EmailItem]


# ==================== User ====================

class UserGenerateRequest(BaseModel):
    mode: Literal["random", "manual"]
    count: Optional[int] = Field(default=10, ge=1, le=1000)
    manual_text: Optional[str] = None


class UserItem(BaseModel):
    id: Optional[int] = None
    full_name: str
    postal_code: str
    county: str
    district: str
    address_line1: str
    address_line2: str = ""
    phone: str = ""
    status: str
    created_at: str
    used_at: Optional[str] = None


class UserListResponse(BaseModel):
    total: int
    unused: int
    used: int
    items: List[UserItem]


# ==================== Card ====================

class CardGenerateRequest(BaseModel):
    mode: Literal["random", "manual"]
    bin: Optional[str] = None
    month: Optional[str] = "random"
    year: Optional[str] = "random"
    cvv: Optional[str] = ""
    count: Optional[int] = Field(default=10, ge=1, le=1000)
    manual_text: Optional[str] = None


class CardItem(BaseModel):
    id: Optional[int] = None
    number: str = Field(..., description="脱敏后的卡号")
    month: str
    year: str
    cvc: str
    card_type: str
    status: str
    created_at: str
    used_at: Optional[str] = None


class CardListResponse(BaseModel):
    total: int
    unused: int
    used: int
    items: List[CardItem]


# ==================== Generic ====================

class GenericResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None
    count: Optional[int] = None


class ImportOutlookResponse(BaseModel):
    success: bool
    success_count: int
    failed_count: int
    skipped_count: int
    total: int


# ==================== Proxy ====================

class ProxyAddRequest(BaseModel):
    proxy_strings: List[str] = Field(..., min_length=1)


class ProxySelectRequest(BaseModel):
    id: int


class ProxyItem(BaseModel):
    id: int
    proxy_url: str
    protocol: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[str] = None
    as_number: Optional[str] = None
    provider: Optional[str] = None
    is_valid: Optional[int] = None
    last_checked: Optional[str] = None
    created_at: Optional[str] = None


class ProxyAddResponse(BaseModel):
    success_count: int
    failed_count: int


class ProxyDetectResponse(BaseModel):
    success: bool
    ip: Optional[str] = None
    location: Optional[str] = None
    as_number: Optional[str] = None
    provider: Optional[str] = None
    error: Optional[str] = None


class ProxyStatusResponse(BaseModel):
    count: int
    current: Optional[ProxyItem] = None


# ==================== Augment ====================

class AugmentAccountItem(BaseModel):
    id: Optional[int] = None
    email: str
    password: Optional[str] = None
    tenant_url: Optional[str] = None
    auth_session: Optional[str] = None
    code: Optional[str] = None
    state: Optional[str] = None
    portal_url: Optional[str] = None
    credits: int = 0
    total_credits: int = 30000
    used_credits: int = 0
    plan_name: str = "Free Plan"
    next_billing_date: Optional[str] = None
    card_bound: int = 0
    card_number_masked: Optional[str] = None
    status: str = "registered"
    registered_at: Optional[str] = None
    card_bound_at: Optional[str] = None
    last_updated_at: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[str] = None


class AugmentAccountListResponse(BaseModel):
    total: int
    registered: int
    card_bound: int
    items: List[AugmentAccountItem]


class AugmentRegisterRequest(BaseModel):
    email: Optional[str] = Field(
        default=None,
        description="若不传则从未使用邮箱列表中取第一个",
    )
    user_info: Optional[dict] = None


class AugmentRegisterResponse(BaseModel):
    task_id: str
    email: str


class AugmentExtractRequest(BaseModel):
    account_id: int


class AugmentBindCardRequest(BaseModel):
    account_id: int
    card_id: Optional[int] = None
    user_id: Optional[int] = None

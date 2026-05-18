# -*- coding: utf-8 -*-
"""REST endpoints for proxy management.

Mirrors gui/augment_tab.py::ProxyConfigDialog — list/add/detect/select/clear.
Uses AugmentDBManager for persistence and ProxyManager for the in-memory pool.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException

from api.schemas import (
    GenericResponse,
    ProxyAddRequest,
    ProxyAddResponse,
    ProxyDetectResponse,
    ProxyItem,
    ProxySelectRequest,
    ProxyStatusResponse,
)
from core.proxy import ProxyDetector, get_proxy_manager
from database.augment_db_manager import AugmentDBManager
from utils.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/api/proxy", tags=["proxy"])


def _augment_db() -> AugmentDBManager:
    return AugmentDBManager()


def _row_to_item(row: dict) -> ProxyItem:
    return ProxyItem(
        id=row["id"],
        proxy_url=row.get("proxy_url", ""),
        protocol=row.get("protocol"),
        host=row.get("host"),
        port=row.get("port"),
        username=row.get("username"),
        ip_address=row.get("ip_address"),
        location=row.get("location"),
        as_number=row.get("as_number"),
        provider=row.get("provider"),
        is_valid=row.get("is_valid"),
        last_checked=row.get("last_checked"),
        created_at=row.get("created_at"),
    )


@router.get("/list", response_model=List[ProxyItem])
def list_proxies():
    db = _augment_db()
    return [_row_to_item(p) for p in db.get_all_proxies()]


@router.post("/add", response_model=ProxyAddResponse)
def add_proxies(req: ProxyAddRequest):
    """新增代理：解析 → 检测 → 入库（与 ProxyConfigDialog.save_proxies 一致）."""
    db = _augment_db()
    pm = get_proxy_manager()

    success = 0
    failed = 0

    for raw in req.proxy_strings:
        proxy_str = (raw or "").strip()
        if not proxy_str:
            continue
        try:
            pm.add_proxies_from_list([proxy_str])
            proxy_config = pm._parse_proxy_string(proxy_str)
            result = ProxyDetector.detect_proxy_info(proxy_config.to_url())

            if isinstance(result, dict) and result.get("success"):
                db.add_proxy(
                    protocol=proxy_config.protocol,
                    host=proxy_config.host,
                    port=proxy_config.port,
                    username=proxy_config.username,
                    password=proxy_config.password,
                    ip_address=result.get("ip"),
                    location=result.get("location"),
                    as_number=result.get("as_number"),
                    provider=result.get("provider"),
                )
                success += 1
            else:
                # Save the proxy even when detection fails — same behavior as Qt dialog.
                db.add_proxy(
                    protocol=proxy_config.protocol,
                    host=proxy_config.host,
                    port=proxy_config.port,
                    username=proxy_config.username,
                    password=proxy_config.password,
                )
                failed += 1
        except Exception as e:
            logger.error(f"处理代理失败 {proxy_str}: {e}")
            failed += 1

    return ProxyAddResponse(success_count=success, failed_count=failed)


@router.post("/{proxy_id}/redetect", response_model=ProxyDetectResponse)
def redetect_proxy(proxy_id: int):
    db = _augment_db()
    proxy = db.get_proxy_by_id(proxy_id)
    if not proxy:
        raise HTTPException(status_code=404, detail=f"代理不存在: {proxy_id}")

    proxy_url = proxy.get("proxy_url", "")
    if not proxy_url:
        raise HTTPException(status_code=400, detail="代理 URL 为空")

    result = ProxyDetector.detect_proxy_info(proxy_url)
    if isinstance(result, dict) and result.get("success"):
        db.update_proxy_info(
            proxy_id,
            ip_address=result.get("ip"),
            location=result.get("location"),
            as_number=result.get("as_number"),
            provider=result.get("provider"),
        )
        return ProxyDetectResponse(
            success=True,
            ip=result.get("ip"),
            location=result.get("location"),
            as_number=result.get("as_number"),
            provider=result.get("provider"),
        )

    err = result.get("error", "未知错误") if isinstance(result, dict) else "检测失败"
    return ProxyDetectResponse(success=False, error=err)


@router.delete("/{proxy_id}", response_model=GenericResponse)
def delete_proxy(proxy_id: int):
    db = _augment_db()
    pm = get_proxy_manager()
    proxy = db.get_proxy_by_id(proxy_id)
    if not proxy:
        raise HTTPException(status_code=404, detail=f"代理不存在: {proxy_id}")

    db.delete_proxy(proxy_id)
    proxy_url = proxy.get("proxy_url", "")
    if proxy_url:
        try:
            pm.remove_proxy(proxy_url)
        except Exception as e:
            logger.warning(f"内存代理池移除失败: {e}")
    return GenericResponse(success=True, message=f"已删除代理 {proxy_id}")


@router.delete("", response_model=GenericResponse)
def clear_proxies():
    db = _augment_db()
    pm = get_proxy_manager()
    db.clear_proxies()
    pm.clear_proxies()
    return GenericResponse(success=True, message="已清空所有代理")


@router.post("/select", response_model=GenericResponse)
def select_proxy(req: ProxySelectRequest):
    """切换当前使用的代理（写入内存代理池，与 ProxyConfigDialog.use_selected_proxy 一致）."""
    db = _augment_db()
    pm = get_proxy_manager()
    proxy = db.get_proxy_by_id(req.id)
    if not proxy:
        raise HTTPException(status_code=404, detail=f"代理不存在: {req.id}")

    proxy_url = proxy.get("proxy_url", "")
    if not proxy_url:
        raise HTTPException(status_code=400, detail="代理 URL 为空")

    pm.clear_proxies()
    pm.add_proxies_from_list([proxy_url])
    return GenericResponse(success=True, message=f"已切换到代理: {proxy_url}")


@router.get("/status", response_model=ProxyStatusResponse)
def proxy_status():
    pm = get_proxy_manager()
    count = pm.get_proxy_count()

    current: ProxyItem | None = None
    if count > 0:
        # Surface the next-to-be-used proxy without rotating the cursor.
        with pm.lock:
            cfg = pm.proxy_pool[pm.current_proxy_index] if pm.proxy_pool else None
        if cfg is not None:
            db = _augment_db()
            url = cfg.to_url()
            for row in db.get_all_proxies():
                if row.get("proxy_url") == url:
                    current = _row_to_item(row)
                    break
            if current is None:
                current = ProxyItem(
                    id=0,
                    proxy_url=url,
                    protocol=cfg.protocol,
                    host=cfg.host,
                    port=cfg.port,
                    username=cfg.username,
                )

    return ProxyStatusResponse(count=count, current=current)

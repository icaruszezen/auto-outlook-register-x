#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Outlook 自动注册工具 - 主入口（pywebview 桌面壳）
"""
import os
import sys
import time
import socket
import threading
import multiprocessing
from pathlib import Path

import webview

from config.settings import Settings
from utils.logger import setup_logger
from api.server import run_server


API_HOST = "127.0.0.1"
API_PORT = 8765
DEV_FRONTEND_URL = "http://127.0.0.1:3535"


def _wait_for_port(host: str, port: int, timeout: float = 10.0) -> bool:
    """等待指定端口可连接，最多等待 timeout 秒"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.5)
            try:
                sock.connect((host, port))
                return True
            except OSError:
                time.sleep(0.2)
    return False


def _start_api_server() -> threading.Thread:
    """在后台守护线程启动 FastAPI 服务"""
    thread = threading.Thread(
        target=run_server,
        kwargs={"host": API_HOST, "port": API_PORT},
        daemon=True,
        name="api-server",
    )
    thread.start()
    return thread


def _resolve_frontend_url() -> str:
    """根据运行模式解析前端入口 URL"""
    if os.getenv("OUTLOOK_DEV") == "1":
        return DEV_FRONTEND_URL

    if getattr(sys, "frozen", False):
        base = Path(sys._MEIPASS)
    else:
        base = Path(__file__).resolve().parent

    index_file = base / "webgui" / "out" / "index.html"
    return index_file.resolve().as_uri()


def main():
    """主函数"""
    logger = setup_logger()
    logger.info("=" * 60)
    logger.info(f"{Settings.APP_NAME} v{Settings.APP_VERSION}")
    logger.info("=" * 60)

    _start_api_server()
    logger.info(f"等待 API 服务就绪 {API_HOST}:{API_PORT} ...")
    if not _wait_for_port(API_HOST, API_PORT, timeout=10.0):
        logger.error("API 服务在 10 秒内未启动，退出")
        sys.exit(1)
    logger.info("API 服务就绪")

    is_dev = os.getenv("OUTLOOK_DEV") == "1"
    url = _resolve_frontend_url()
    logger.info(f"加载前端 URL: {url} (dev={is_dev})")

    webview.create_window(
        title=Settings.APP_NAME,
        url=url,
        width=1280,
        height=860,
        resizable=True,
    )

    logger.info("应用启动成功")
    webview.start(debug=is_dev)


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()

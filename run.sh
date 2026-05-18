#!/bin/bash
# Outlook 自动注册工具启动脚本 (macOS/Linux, dev mode)

# 切到项目根（脚本所在目录）
cd "$(dirname "$0")" || exit 1

echo "=================================="
echo "  Outlook 自动注册工具 (dev)"
echo "=================================="
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] 未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

# 检查并创建 venv
if [ ! -f ".venv/bin/activate" ]; then
    echo "[INFO] 创建 venv 虚拟环境..."
    python3 -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    echo "[INFO] 安装依赖..."
    pip install -r requirements.txt
else
    # shellcheck disable=SC1091
    source .venv/bin/activate
fi

# 检查前端依赖
if [ ! -d "webgui/node_modules" ]; then
    echo "[ERROR] 未找到 webgui/node_modules"
    echo "请先 cd webgui && npm install"
    exit 1
fi

# 设置开发模式标记
export OUTLOOK_DEV=1

# 后台启动 Next.js dev server
echo "[INFO] 启动前端 dev server..."
(cd webgui && npm run dev) &
NPM_PID=$!

# 退出时杀掉 npm 进程组
cleanup() {
    echo ""
    echo "[INFO] 关闭前端 dev server (pid=$NPM_PID)..."
    if kill -0 "$NPM_PID" 2>/dev/null; then
        # 尝试杀整个进程组
        kill -- -"$NPM_PID" 2>/dev/null || kill "$NPM_PID" 2>/dev/null
        # 兜底：通过 pkill 清掉残留 next-dev 进程
        pkill -P "$NPM_PID" 2>/dev/null
    fi
    wait 2>/dev/null
}
trap cleanup EXIT INT TERM

# 启动桌面壳（pywebview 内部会等待 8765 端口可用）
echo "[INFO] 启动桌面应用..."
python main.py

echo ""
echo "[INFO] 应用已关闭"

@echo off
REM Outlook 自动注册工具启动脚本 (Windows, dev mode)

REM 切到项目根（脚本所在目录）
cd /d "%~dp0"

echo ==================================
echo   Outlook 自动注册工具 (dev)
echo ==================================
echo.

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

REM 检查并创建 venv
if not exist ".venv\Scripts\activate.bat" (
    echo [INFO] 创建 venv 虚拟环境...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] 创建虚拟环境失败
        pause
        exit /b 1
    )
    call .venv\Scripts\activate.bat
    echo [INFO] 安装依赖...
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate.bat
)

REM 检查前端依赖
if not exist "webgui\node_modules" (
    echo [ERROR] 未找到 webgui\node_modules
    echo 请先 cd webgui ^&^& npm install
    pause
    exit /b 1
)

REM 设置开发模式标记
set OUTLOOK_DEV=1

REM 后台启动 Next.js dev server，使用带标识的窗口便于退出时清理
echo [INFO] 启动前端 dev server...
start "outlook-webgui-dev" /D "%~dp0webgui" cmd /c "npm run dev"

REM 启动桌面壳（pywebview 内部会等待 8765 端口可用）
echo [INFO] 启动桌面应用...
python main.py

REM 退出时清理 npm dev 进程树
echo [INFO] 关闭前端 dev server...
taskkill /F /T /FI "WINDOWTITLE eq outlook-webgui-dev" >nul 2>&1

echo.
echo [INFO] 应用已关闭
pause

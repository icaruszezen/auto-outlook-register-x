@echo off
REM Windows 打包脚本
REM 使用 venv 虚拟环境打包

setlocal enabledelayedexpansion

echo ==================================
echo   Outlook 自动注册工具 - Windows 打包
echo ==================================
echo.

REM 检查并创建 venv 虚拟环境
if not exist ".venv\Scripts\activate.bat" (
    echo 🔄 创建 venv 虚拟环境...
    python -m venv .venv
    if errorlevel 1 (
        echo ❌ 创建虚拟环境失败！
        pause
        exit /b 1
    )
)

REM 激活 venv 虚拟环境
echo 🔄 激活 venv 虚拟环境...
call .venv\Scripts\activate.bat

echo ✅ 当前虚拟环境: %VIRTUAL_ENV%
echo.

REM 安装依赖
echo 📦 检查依赖...
pip install -r requirements.txt
pip list | find "PyInstaller" >nul || pip install PyInstaller
pip list | find "PyQt6" >nul || pip install PyQt6

REM 清理旧的构建文件
echo 🧹 清理旧的构建文件...
rmdir /s /q build 2>nul
rmdir /s /q dist 2>nul
del *.app 2>nul
del *.spec 2>nul

REM 运行 PyInstaller
echo 🔨 开始打包...
pyinstaller ^
    --noconfirm ^
    --onefile ^
    --windowed ^
    --name OutlookRegister ^
    --icon=app_icon.ico ^
    --hidden-import=PyQt6 ^
    --hidden-import=PyQt6.QtCore ^
    --hidden-import=PyQt6.QtGui ^
    --hidden-import=PyQt6.QtWidgets ^
    --hidden-import=selenium ^
    --hidden-import=undetected_chromedriver ^
    main.py

REM 检查打包结果
if exist "dist\OutlookRegister.exe" (
    echo.
    echo ✅ 打包成功！
    echo 📦 应用位置: dist\OutlookRegister.exe
    echo.
    echo 🚀 运行应用:
    echo    dist\OutlookRegister.exe
    echo.
) else (
    echo ❌ 打包失败！
    pause
    exit /b 1
)

pause

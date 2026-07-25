@echo off
title OptimizaREP
cd /d "%~dp0"
echo.
echo  ========================================
echo    OptimizaREP - Mide Optimiza Impacta
echo  ========================================
echo.
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js no encontrado.
    pause
    exit /b 1
)
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [INFO] Instalando pnpm...
    npm install -g pnpm
)
if not exist "node_modules" (
    echo  [INFO] Instalando dependencias...
    call pnpm install
)
echo  [OK] Iniciando servidor...
echo  Portal: http://localhost:3000
echo  Ctrl+C para detener
echo  ========================================
echo.
call pnpm dev
pause
@echo off
setlocal
set ROOT=%~dp0
set BACKEND_DIR=%ROOT%backend
set FRONTEND_DIR=%ROOT%frontend
set PYTHON=C:\Users\marcu\AppData\Local\Programs\Python\Python39\python.exe

echo.
echo  Playlistr
echo  ─────────────────────────────
echo.

REM ── Libertar porta 8000 se ocupada
echo [1/3] A verificar porta 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM ── Compilar frontend
echo [2/3] A compilar frontend ^(pode demorar ~30s^)...
cd /d "%FRONTEND_DIR%"
call npm run build
if errorlevel 1 (
    echo.
    echo ERRO ao compilar o frontend. Corre "npm install" na pasta frontend/ e tenta de novo.
    pause
    exit /b 1
)

REM ── Tailscale Serve (HTTPS externo via Tailscale)
echo [3/4] A configurar Tailscale Serve...
"C:\Program Files\Tailscale\tailscale.exe" serve reset >nul 2>&1
start "" /B "C:\Program Files\Tailscale\tailscale.exe" serve 8000

REM ── Iniciar backend em janela separada
echo [4/4] A iniciar servidor...
cd /d "%BACKEND_DIR%"
start "Playlistr" "%PYTHON%" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

REM ── Abrir browser apos o servidor arrancar
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000"

echo.
echo  Playlistr em http://localhost:8000
echo  Telemovel: https://afrikaspc.tail886d5c.ts.net
echo  Fecha a janela "Playlistr" para parar o servidor.
echo.
pause

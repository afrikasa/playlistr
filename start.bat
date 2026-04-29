@echo off
REM ─── Spotify Downloader ───────────────────────────────────────────
set BACKEND_DIR=%~dp0backend
set PYTHON=C:\Users\marcu\AppData\Local\Programs\Python\Python39\python.exe

echo [1/3] A verificar dependencias do backend...
%PYTHON% -m pip install -r "%BACKEND_DIR%\requirements.txt" -q

echo [2/3] A libertar porta 8000 (se ocupada)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [3/3] A iniciar servidor em http://localhost:8000 ...
echo       Abre o browser em: http://localhost:8000
echo       (Ctrl+C para parar)
echo.
cd /d "%BACKEND_DIR%"
%PYTHON% -m uvicorn main:app --host 0.0.0.0 --port 8000

echo.
echo ERRO: o servidor terminou inesperadamente.
pause

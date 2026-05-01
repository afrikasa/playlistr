@echo off
echo A parar Playlistr...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Servidor parado.
timeout /t 2 /nobreak >nul

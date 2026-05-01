@echo off
setlocal
set ROOT=%~dp0
set VBS=%ROOT%start_server.vbs
set TASK_NAME=Playlistr

echo.
echo  Playlistr — Instalar arranque automático
echo  ─────────────────────────────────────────
echo.

REM ── Compilar o frontend uma vez (necessário antes do primeiro arranque)
echo [1/2] A compilar frontend...
cd /d "%ROOT%frontend"
call npm run build
if errorlevel 1 (
    echo ERRO ao compilar o frontend.
    pause
    exit /b 1
)

REM ── Registar no Task Scheduler (corre ao fazer login no Windows)
echo [2/2] A registar no Task Scheduler...
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%VBS%\"" /sc onlogon /rl highest /f

if errorlevel 1 (
    echo.
    echo ERRO ao registar. Corre este .bat como Administrador.
    pause
    exit /b 1
)

echo.
echo  Instalação concluída!
echo.
echo  O Playlistr vai arrancar automaticamente quando fizeres login no Windows.
echo  Acede em:
echo    - Este PC:     http://localhost:8000
echo    - Telemóvel:   http://[IP-do-PC]:8000
echo.
echo  Para saber o IP do PC, corre: ipconfig
echo  Procura "Endereço IPv4" em "Adaptador Ethernet" ou "Wi-Fi".
echo.
pause

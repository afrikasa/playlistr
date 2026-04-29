@echo off
setlocal enabledelayedexpansion

echo ================================
echo  PLAYLISTR - FULL RELEASE
echo ================================
echo.

set /p NEW_VERSION=Nova versao (ex: 1.1.0):
set /p RELEASE_TYPE=Tipo (1=PATCH / 2=MINOR / 3=MAJOR):
set /p RELEASE_TITLE=Titulo da release (ex: Suporte a albuns):

echo.
echo === CONFIRMACAO ===
echo Versao: v!NEW_VERSION!
echo Titulo: !RELEASE_TITLE!
echo.
set /p CONFIRM=Confirma? (S/N):
if /i not "!CONFIRM!"=="S" (
    echo Cancelado.
    pause
    exit /b 0
)

REM Build do frontend
echo.
echo A fazer build do frontend...
cd /d "C:\Users\marcu\Desktop\Spotify-Playlist-Downloader\frontend"
call npm run build
cd /d "C:\Users\marcu\Desktop\spotify-downloader"

REM Commit
echo.
echo A fazer commit...
git add spotify_downloader.py backend\main.py backend\requirements.txt requirements.txt start.bat CLAUDE.md CHANGELOG.md RELEASE_NOTES.md
git commit -m "v!NEW_VERSION!: !RELEASE_TITLE!"

REM Tag e push
echo.
echo A criar tag e fazer push...
git tag -a v!NEW_VERSION! -m "v!NEW_VERSION!: !RELEASE_TITLE!"
git push origin main --tags

REM GitHub Release
echo.
echo A criar GitHub Release...
gh release create v!NEW_VERSION! --title "v!NEW_VERSION! - !RELEASE_TITLE!" --notes-file RELEASE_NOTES.md

echo.
echo ================================
echo  CONCLUIDO! v!NEW_VERSION!
echo ================================
echo.
pause

@echo off
cd /d "%~dp0"
start "arman-site-watchdog" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0watchdog.ps1"
echo Watchdog started. Public link will appear in PUBLIC_URL.txt
pause

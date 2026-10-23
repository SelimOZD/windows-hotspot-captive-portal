@echo off
setlocal
title Windows Hotspot Captive Portal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-portal.ps1"
echo.
echo The portal has stopped.
pause

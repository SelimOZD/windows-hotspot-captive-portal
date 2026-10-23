@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Asking Windows for administrator rights - click "Yes" on the prompt...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo.
echo Restoring normal Wi-Fi band settings (dual band).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-mypublicwifi\Set-WifiBand.ps1" -Band Any
echo.
pause

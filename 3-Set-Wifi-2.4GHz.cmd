@echo off
setlocal
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Asking Windows for administrator rights - click "Yes" on the prompt...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo.
echo Switching the Wi-Fi adapter to 2.4 GHz so both phones and laptops see the hotspot.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-mypublicwifi\Set-WifiBand.ps1" -Band 2.4 -Strong
echo.
echo Next: open MyPublicWiFi and STOP then START the hotspot again.
echo.
pause

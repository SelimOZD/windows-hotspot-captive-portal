$ErrorActionPreference = "Stop"

# --- Configuration -----------------------------------------------------------
# These defaults match MyPublicWiFi's default hotspot subnet (192.168.5.0/24).
if (-not $env:HOTSPOT_HOST) { $env:HOTSPOT_HOST = "192.168.5.1" }
if (-not $env:GUEST_PORT) { $env:GUEST_PORT = "8080" }
if (-not $env:ADMIN_PORT) { $env:ADMIN_PORT = "8081" }
# MyPublicWiFi owns port 80 and performs the captive redirect for us, so our own
# redirect listener stays off.
if (-not $env:CAPTIVE_REDIRECT_PORT) { $env:CAPTIVE_REDIRECT_PORT = "disabled" }
if ($env:INTERNET_FORWARDING -eq "true") {
    throw "INTERNET_FORWARDING must remain false."
}

Write-Host ""
Write-Host "Windows Hotspot Captive Portal" -ForegroundColor Cyan
Write-Host "  Guest portal : http://$($env:HOTSPOT_HOST):$($env:GUEST_PORT)/"
Write-Host "  Admin console: http://127.0.0.1:$($env:ADMIN_PORT)/admin"
Write-Host ""

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $projectRoot "artifacts\api-server"
$serverEntry = Join-Path $serverDir "dist\index.mjs"

if (-not (Test-Path $serverEntry)) {
    Write-Host "The server bundle is missing. Build it once with:" -ForegroundColor Yellow
    Write-Host "  pnpm install"
    Write-Host "  pnpm run build:windows"
    exit 1
}

# Warn early when the hotspot address is not up yet (the portal would fail to bind).
try {
    $hasAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.IPAddress -eq $env:HOTSPOT_HOST }
    if (-not $hasAddress) {
        Write-Host "Note: $($env:HOTSPOT_HOST) is not assigned on this PC yet." -ForegroundColor Yellow
        Write-Host "Start the MyPublicWiFi hotspot first, then run this again." -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
}

Write-Host "Starting the portal. Press Ctrl+C to stop." -ForegroundColor Cyan
Push-Location $serverDir
try {
    node --enable-source-maps ./dist/index.mjs
} finally {
    Pop-Location
}

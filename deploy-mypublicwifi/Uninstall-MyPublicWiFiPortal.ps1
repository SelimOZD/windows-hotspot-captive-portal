<#
  Restores MyPublicWiFi's original captive-portal page and removes the firewall
  rule added by Install-MyPublicWiFiPortal.ps1. Run as Administrator.
#>
[CmdletBinding()]
param(
  [string]$MyPublicWiFiRoot = 'C:\Program Files (x86)\MyPublicWiFi',
  [int]$PortalPort = 8080
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'This script must be run as Administrator.' -ForegroundColor Red
  exit 1
}

$webDir = Join-Path $MyPublicWiFiRoot 'Web\preview'
$loginTarget = Join-Path $webDir 'login.html'

if (Test-Path $webDir) {
  $backup = Get-ChildItem $webDir -Filter 'login.html.bak-*' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($backup) {
    Copy-Item $backup.FullName $loginTarget -Force
    Write-Host "Restored $($backup.Name) -> login.html" -ForegroundColor Green
  } else {
    Write-Host 'No backup found; leaving MyPublicWiFi files untouched.' -ForegroundColor Yellow
  }
} else {
  Write-Host "MyPublicWiFi web folder not found at $webDir" -ForegroundColor Yellow
}

$ruleName = "Local Wi-Fi Portal (TCP $PortalPort)"
if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName $ruleName
  Write-Host "Removed firewall rule '$ruleName'." -ForegroundColor Green
}

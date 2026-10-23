<#
  Installs our branded captive-portal redirect page into MyPublicWiFi so that
  guests are forwarded to the full portal served by this project.

  MyPublicWiFi serves the live page from  Web\login.html ; Web\preview\login.html
  is the editable copy. This script writes BOTH (with backups) so it does not
  matter which one MyPublicWiFi reads.

  This writes inside "C:\Program Files (x86)\MyPublicWiFi", so it MUST be run
  as Administrator.

  Usage (elevated PowerShell):
    powershell -ExecutionPolicy Bypass -File .\Install-MyPublicWiFiPortal.ps1

  Optional:
    -PortalUrl  "http://192.168.5.1:8080/"   Address of our portal on the hotspot
    -PortalPort 8080                         Port to open in Windows Firewall
    -SkipFirewall                            Do not add the firewall rule
#>
[CmdletBinding()]
param(
  [string]$MyPublicWiFiRoot = 'C:\Program Files (x86)\MyPublicWiFi',
  [string]$PortalUrl = 'http://192.168.5.1:8080/',
  [int]$PortalPort = 8080,
  [switch]$SkipFirewall
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'This script must be run as Administrator.' -ForegroundColor Red
  Write-Host 'Open the Start menu, type "PowerShell", right-click it, choose "Run as administrator", then run this script again.'
  exit 1
}

$templatePath = Join-Path $PSScriptRoot 'login.html'
if (-not (Test-Path $templatePath)) {
  Write-Host "Cannot find login.html next to this script: $templatePath" -ForegroundColor Red
  exit 1
}

$webRoot = Join-Path $MyPublicWiFiRoot 'Web'
if (-not (Test-Path $webRoot)) {
  Write-Host "MyPublicWiFi does not look installed at '$MyPublicWiFiRoot'." -ForegroundColor Yellow
  Write-Host 'Install MyPublicWiFi first, launch it once, then run this script again.'
  Write-Host 'Download: https://mypublicwifi.com/publicwifi/en/index.html'
  exit 1
}

$html = Get-Content $templatePath -Raw -Encoding UTF8
$html = $html.Replace('__PORTAL_URL__', $PortalUrl)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

# MyPublicWiFi serves Web\login.html for "/" but returns 404 for the
# connectivity-probe paths that phones and laptops use to detect a captive
# portal. We drop our page at each of those paths too, so the probe gets our
# portal (HTTP 200 + HTML) instead of a 404.
$targets = @(
  (Join-Path $webRoot 'login.html'),
  (Join-Path $webRoot 'preview\login.html'),
  (Join-Path $webRoot 'index.html')
)
foreach ($probe in @('generate_204', 'connecttest.txt', 'ncsi.txt', 'hotspot-detect.html', 'success.txt', 'redirect', 'redirect.html')) {
  $targets += (Join-Path $webRoot $probe)
}

foreach ($target in $targets) {
  $dir = Split-Path -Parent $target
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  if (Test-Path $target) {
    $backup = "$target.bak-$stamp"
    Copy-Item $target $backup -Force
    Write-Host "Backed up $target -> $backup"
  }
  [System.IO.File]::WriteAllText($target, $html, $utf8NoBom)
  Write-Host "Installed branded portal redirect -> $target" -ForegroundColor Green
}

if (-not $SkipFirewall) {
  $ruleName = "Local Wi-Fi Portal (TCP $PortalPort)"
  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    if ($existing.Enabled -ne 'True') {
      Enable-NetFirewallRule -DisplayName $ruleName
      Write-Host "Re-enabled existing firewall rule for TCP $PortalPort." -ForegroundColor Green
    } else {
      Write-Host "Firewall rule '$ruleName' already present."
    }
  } else {
    New-NetFirewallRule `
      -DisplayName $ruleName `
      -Description "Lets guests on the hotspot reach the Local Wi-Fi Portal." `
      -Direction Inbound -Action Allow -Protocol TCP -LocalPort $PortalPort -Profile Any | Out-Null
    Write-Host "Added Windows Firewall inbound rule for TCP $PortalPort." -ForegroundColor Green
  }

  # Confirm it really exists, rather than silently assuming.
  $check = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($check -and $check.Enabled -eq 'True') {
    Write-Host "Firewall check: inbound TCP $PortalPort is allowed." -ForegroundColor Green
  } else {
    Write-Host "Firewall check FAILED: guests will not reach the portal on port $PortalPort." -ForegroundColor Red
  }
}

Write-Host ''
Write-Host 'IMPORTANT - one setting in MyPublicWiFi is required:' -ForegroundColor Yellow
Write-Host '  Tick "User Authentication" in MyPublicWiFi (its captive portal), and'
Write-Host '  choose a login method such as accepting the Terms of Use.'
Write-Host '  Without it, MyPublicWiFi does not redirect guests at all, so no'
Write-Host '  "Sign in to network" prompt appears.'
Write-Host ''
Write-Host 'Then:' -ForegroundColor Cyan
Write-Host '  1. Start or restart the hotspot in MyPublicWiFi (internet sharing OFF).'
Write-Host '  2. Double-click 1-Run-Portal.cmd in the project folder.'
Write-Host "  3. Reconnect the phone and confirm it lands on $PortalUrl"

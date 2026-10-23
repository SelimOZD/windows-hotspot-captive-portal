<#
  Switches the Wi-Fi adapter between "2.4 GHz only" and normal dual band, so the
  MyPublicWiFi hotspot can broadcast on 2.4 GHz (visible to 2.4 GHz-only phones
  AND laptops). Run as Administrator.

  Values taken from the Intel driver's own enum:
    Preferred Band   : 0 = No preference, 1 = Prefer 2.4GHz, 2 = Prefer 5GHz
    802.11a/b/g mode : 32 = 2.4GHz b/g only, 34 = Dual Band a/b/g

  Examples (elevated PowerShell):
    powershell -ExecutionPolicy Bypass -File .\Set-WifiBand.ps1 -Band 2.4
    powershell -ExecutionPolicy Bypass -File .\Set-WifiBand.ps1 -Band 2.4 -Strong
    powershell -ExecutionPolicy Bypass -File .\Set-WifiBand.ps1 -Band Any   # restore
#>
[CmdletBinding()]
param(
  [ValidateSet('2.4', '5', 'Any')]
  [string]$Band = '2.4',
  [string]$AdapterName = 'Wi-Fi',
  [switch]$Strong
)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Run this script as Administrator.' -ForegroundColor Red
  exit 1
}

if (-not (Get-NetAdapter -Name $AdapterName -ErrorAction SilentlyContinue)) {
  Write-Host "No adapter named '$AdapterName'. Available:" -ForegroundColor Red
  Get-NetAdapter | Select-Object Name, InterfaceDescription | Format-Table -AutoSize
  exit 1
}

# Preferred Band: 0 = No preference, 1 = Prefer 2.4GHz, 2 = Prefer 5GHz
$preferredBandValue = switch ($Band) { '2.4' { 1 } '5' { 2 } default { 0 } }

Write-Host "Setting 'Preferred Band' to '$Band'..."
Set-NetAdapterAdvancedProperty -Name $AdapterName -RegistryKeyword 'RoamingPreferredBandType' -RegistryValue $preferredBandValue -NoRestart

if ($Strong -or $Band -eq 'Any') {
  # 802.11a/b/g Wireless Mode: 32 = 2.4GHz b/g only, 34 = Dual Band a/b/g
  $wirelessModeValue = if ($Band -eq '2.4') { 32 } else { 34 }
  $modeLabel = if ($Band -eq '2.4') { '2.4 GHz only' } else { 'dual band' }
  Write-Host "Setting radio mode to '$modeLabel'..."
  Set-NetAdapterAdvancedProperty -Name $AdapterName -RegistryKeyword 'WirelessMode' -RegistryValue $wirelessModeValue -NoRestart
}

Write-Host 'Restarting the Wi-Fi adapter (it will drop for a few seconds)...' -ForegroundColor Cyan
Restart-NetAdapter -Name $AdapterName
Start-Sleep -Seconds 3

Write-Host ''
Write-Host 'Result:' -ForegroundColor Green
foreach ($kw in @('RoamingPreferredBandType', 'WirelessMode')) {
  $p = Get-NetAdapterAdvancedProperty -Name $AdapterName -RegistryKeyword $kw -ErrorAction SilentlyContinue
  if ($p) { Write-Host ("  {0} = {1}" -f $p.DisplayName, $p.DisplayValue) }
}

Write-Host ''
Write-Host 'Next: in MyPublicWiFi, STOP and then START the hotspot, and check the phone.' -ForegroundColor Green

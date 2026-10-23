[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) {
    $OutputPath = Join-Path (Split-Path -Parent $root) 'Windows-Wi-Fi-Captive-Portal.zip'
}

Write-Host ""
Write-Host "Packaging Windows Captive Portal" -ForegroundColor Cyan
Write-Host "  source: $root"
Write-Host "  output: $OutputPath"
Write-Host ""

$stage = Join-Path $env:TEMP ("wifi-portal-pack-" + [guid]::NewGuid().ToString('N'))
$dest = Join-Path $stage 'Windows-Wi-Fi-Captive-Portal'
New-Item -ItemType Directory -Path $stage -Force | Out-Null

try {
    # Copy everything except dependencies, VCS metadata and local state.
    robocopy $root $dest /E /XD node_modules .git /XF *.tsbuildinfo Thumbs.db .DS_Store /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed with exit code $LASTEXITCODE"
    }

    $files = Get-ChildItem $dest -Recurse -File -Force
    $totalMb = ($files | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host ("  {0} files, {1:N1} MB" -f $files.Count, $totalMb)

    if (Test-Path $OutputPath) { Remove-Item $OutputPath -Force }
    Compress-Archive -Path $dest -DestinationPath $OutputPath -Force

    $zip = Get-Item $OutputPath
    Write-Host ""
    Write-Host ("Created {0} ({1:N1} MB)" -f $zip.FullName, ($zip.Length / 1MB)) -ForegroundColor Green
}
finally {
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
}

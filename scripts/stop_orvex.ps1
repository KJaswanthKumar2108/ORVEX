# scripts/stop_orvex.ps1
# ORVEX Graceful Shutdown Utility (PowerShell)

[CmdletBinding()]
param (
    [switch]$Dev = $false,
    [switch]$Volumes = $false
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "         ORVEX Platform Shutdown          " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$composeFile = if ($Dev) { "docker-compose.yml" } else { "docker-compose.prod.yml" }
$volFlag = if ($Volumes) { "-v" } else { "" }

Write-Host "[INFO] Stopping services defined in $composeFile..." -ForegroundColor Yellow
& docker compose -f $composeFile down $($volFlag ? @("-v") : @())

Write-Host "[SUCCESS] Services stopped gracefully." -ForegroundColor Green


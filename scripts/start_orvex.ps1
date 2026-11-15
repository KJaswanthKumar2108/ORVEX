# scripts/start_orvex.ps1
# ORVEX Production / Development Stack Startup Script (PowerShell)

[CmdletBinding()]
param (
    [switch]$Dev = $false,
    [switch]$Build = $true
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "         ORVEX Platform Startup           " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check for .env file
$envFile = Join-Path $rootDir ".env"
$envExample = Join-Path $rootDir ".env.example"
if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Write-Host "[WARN] .env not found. Creating default .env from .env.example..." -ForegroundColor Yellow
        Copy-Item $envExample $envFile
    } else {
        Write-Error "Neither .env nor .env.example found."
        exit 1
    }
}

if ($Dev) {
    Write-Host "[INFO] Starting ORVEX in DEVELOPMENT mode (docker-compose.yml)..." -ForegroundColor Yellow
    $composeFile = "docker-compose.yml"
    $healthUrl = "http://localhost:8000/health"
} else {
    Write-Host "[INFO] Starting ORVEX in PRODUCTION mode (docker-compose.prod.yml)..." -ForegroundColor Green
    $composeFile = "docker-compose.prod.yml"
    $healthUrl = "http://localhost:8080/health"
}

$buildFlag = if ($Build) { "--build" } else { "" }

Write-Host "[INFO] Executing: docker compose -f $composeFile up -d $buildFlag" -ForegroundColor Cyan
& docker compose -f $composeFile up -d $($buildFlag ? @("--build") : @())

Write-Host "[INFO] Services launched. Monitoring health..." -ForegroundColor Yellow
$maxRetries = 20
$retryCount = 0
$healthy = $false

while ($retryCount -lt $maxRetries) {
    Start-Sleep -Seconds 3
    $retryCount++
    try {
        $resp = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($resp.status -eq "ok") {
            $healthy = $true
            break
        }
    } catch {
        # Continue waiting
    }
    Write-Host "  ... waiting for application ready ($retryCount/$maxRetries)" -ForegroundColor Gray
}

Write-Host ""
if ($healthy) {
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "   ORVEX Services Online & Healthy!       " -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    if ($Dev) {
        Write-Host "Frontend:  http://localhost:5173" -ForegroundColor White
        Write-Host "Backend:   http://localhost:8000" -ForegroundColor White
        Write-Host "API Docs:  http://localhost:8000/docs" -ForegroundColor White
    } else {
        Write-Host "Dashboard: http://localhost:8080" -ForegroundColor White
        Write-Host "Health:    http://localhost:8080/health" -ForegroundColor White
        Write-Host "Status:    http://localhost:8080/api/v1/system/status" -ForegroundColor White
    }
} else {
    Write-Host "[WARN] Application did not report healthy within timeout. Inspect logs with:" -ForegroundColor Yellow
    Write-Host "       docker compose -f $composeFile logs -f" -ForegroundColor Yellow
}


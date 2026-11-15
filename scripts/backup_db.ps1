# scripts/backup_db.ps1
# ORVEX Database Backup Utility (PowerShell)
# Backs up the PostgreSQL/TimescaleDB database to a timestamped SQL file.

[CmdletBinding()]
param (
    [string]$OutputDir = "backups",
    [string]$ContainerName = "",
    [string]$DbUser = "orvex",
    [string]$DbName = "orvex"
)

$ErrorActionPreference = "Stop"

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir = Join-Path $PSScriptRoot "..\$OutputDir"
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$BackupFile = Join-Path $BackupDir "orvex_backup_$Timestamp.sql"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   ORVEX Database Backup Utility (PS1)   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Target: $BackupFile" -ForegroundColor Yellow

# Detect container if not explicitly specified
if (-not $ContainerName) {
    $runningContainers = docker ps --format "{{.Names}}" 2>$null
    if ($runningContainers -match "orvex-database-prod") {
        $ContainerName = "orvex-database-prod"
    } elseif ($runningContainers -match "orvex-database-1") {
        $ContainerName = "orvex-database-1"
    } elseif ($runningContainers -match "database") {
        $ContainerName = ($runningContainers | Select-String "database")[0].Line
    }
}

if ($ContainerName) {
    Write-Host "[INFO] Using Docker container: $ContainerName" -ForegroundColor Green
    & docker exec $ContainerName pg_dump -U $DbUser -d $DbName --clean --if-exists > $BackupFile
} else {
    Write-Host "[INFO] No active Docker container found; attempting host pg_dump..." -ForegroundColor Yellow
    if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
        $env:PGPASSWORD = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "replace-with-a-local-secret" }
        $port = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5433" }
        & pg_dump -h localhost -p $port -U $DbUser -d $DbName --clean --if-exists > $BackupFile
    } else {
        Write-Error "Neither Docker container nor host pg_dump utility was found."
        exit 1
    }
}

if ((Test-Path $BackupFile) -and ((Get-Item $BackupFile).Length -gt 0)) {
    $size = (Get-Item $BackupFile).Length
    Write-Host "[SUCCESS] Backup created successfully: $BackupFile ($size bytes)" -ForegroundColor Green
    exit 0
} else {
    Write-Error "Backup failed or generated an empty file."
    exit 1
}


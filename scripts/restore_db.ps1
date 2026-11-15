# scripts/restore_db.ps1
# ORVEX Database Restore Utility (PowerShell)
# Restores the PostgreSQL/TimescaleDB database from a specified SQL backup file.

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$ContainerName = "",
    [string]$DbUser = "orvex",
    [string]$DbName = "orvex"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup file not found: $BackupFile"
    exit 1
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   ORVEX Database Restore Utility (PS1)  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Restoring from: $BackupFile" -ForegroundColor Yellow

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
    Write-Host "[INFO] Restoring via Docker container: $ContainerName" -ForegroundColor Green
    Get-Content -Path $BackupFile -Raw | docker exec -i $ContainerName psql -U $DbUser -d $DbName -q
} else {
    Write-Host "[INFO] No active Docker container found; attempting host psql..." -ForegroundColor Yellow
    if (Get-Command psql -ErrorAction SilentlyContinue) {
        $env:PGPASSWORD = if ($env:POSTGRES_PASSWORD) { $env:POSTGRES_PASSWORD } else { "replace-with-a-local-secret" }
        $port = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5433" }
        Get-Content -Path $BackupFile -Raw | psql -h localhost -p $port -U $DbUser -d $DbName -q
    } else {
        Write-Error "Neither Docker container nor host psql utility was found."
        exit 1
    }
}

Write-Host "[SUCCESS] Database restoration completed successfully." -ForegroundColor Green
exit 0


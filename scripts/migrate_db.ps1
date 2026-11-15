# scripts/migrate_db.ps1
# ORVEX Database Migration Utility (PowerShell)
# Applies pending Alembic database migrations.

[CmdletBinding()]
param (
    [string]$Target = "head"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   ORVEX Database Migration Runner (PS1)  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Applying migrations up to target: $Target" -ForegroundColor Yellow

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$alembicIni = Join-Path $rootDir "database\alembic.ini"

if (-not (Test-Path $alembicIni)) {
    Write-Error "Could not find alembic.ini at: $alembicIni"
    exit 1
}

# Run alembic using python in the current environment
try {
    python -m alembic -c $alembicIni upgrade $Target
    Write-Host "[SUCCESS] Database migrations applied successfully." -ForegroundColor Green
    exit 0
} catch {
    Write-Error "Migration execution failed: $_"
    exit 1
}


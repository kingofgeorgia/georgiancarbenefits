param(
    [switch]$SkipBuild,
    [switch]$SkipBackup,
    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found in PATH."
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE: $FilePath $($Arguments -join ' ')"
    }
}

function Wait-ForPostgres {
    $containerId = (& docker compose ps -q postgres).Trim()
    if (-not $containerId) {
        throw "PostgreSQL container is not running."
    }

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $status = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId).Trim()
        if ($status -eq "healthy" -or $status -eq "running") {
            Write-Host "PostgreSQL status: $status" -ForegroundColor Green
            return
        }

        Start-Sleep -Seconds 2
    }

    throw "PostgreSQL did not become healthy within 60 seconds."
}

Assert-Command "docker"

Write-Step "Checking Docker"
Invoke-Checked docker version
Invoke-Checked docker compose version

if (-not (Test-Path ".env")) {
    if (-not (Test-Path ".env.example")) {
        throw ".env and .env.example are both missing."
    }

    Copy-Item ".env.example" ".env"
    Write-Warning "Created .env from .env.example. Review local credentials and SECRET_KEY before using this outside local development."
}

if (-not $SkipBuild) {
    Write-Step "Building backend and frontend images"
    Invoke-Checked docker compose build backend frontend
}

Write-Step "Starting PostgreSQL"
Invoke-Checked docker compose up -d postgres
Wait-ForPostgres

if (-not $SkipBackup) {
    Write-Step "Creating a PostgreSQL backup before migrations"

    $backupDir = Join-Path $ProjectRoot "backups"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupFileName = "mileon-before-migration-$timestamp.sql"
    $backupPath = Join-Path $backupDir $backupFileName
    $containerBackupPath = "/tmp/$backupFileName"
    $containerId = (& docker compose ps -q postgres).Trim()

    $dumpCommand = 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fp -f ' + $containerBackupPath
    $dumpCommand = $dumpCommand.Replace('\"', '"')
    Invoke-Checked docker compose exec -T postgres sh -lc $dumpCommand
    Invoke-Checked docker cp "${containerId}:$containerBackupPath" $backupPath
    Invoke-Checked docker compose exec -T postgres rm -f $containerBackupPath

    Write-Host "Backup saved to: $backupPath" -ForegroundColor Green
}

Write-Step "Checking current database migration"
Invoke-Checked docker compose run --rm backend alembic current

Write-Step "Applying Alembic migrations"
Invoke-Checked docker compose run --rm backend alembic upgrade head

Write-Step "Verifying migration head"
Invoke-Checked docker compose run --rm backend alembic current
Invoke-Checked docker compose run --rm backend alembic heads

Write-Step "Starting backend and frontend"
Invoke-Checked docker compose up -d backend frontend

Write-Step "Waiting for backend health check"
$healthOk = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 3
        if ($response.status -eq "ok") {
            $healthOk = $true
            break
        }
    }
    catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $healthOk) {
    Write-Warning "Backend did not answer /health within 60 seconds. Check logs with: docker compose logs backend"
}
else {
    Write-Host "Backend health: OK" -ForegroundColor Green
}

Write-Step "Container status"
Invoke-Checked docker compose ps

Write-Host "`nMileON Import Calculator is starting locally." -ForegroundColor Green
Write-Host "Frontend: http://localhost:3000"
Write-Host "API docs: http://localhost:8000/docs"
Write-Host "Health:   http://localhost:8000/health"
Write-Host "`nStop without deleting the database volume: docker compose down"
Write-Host "Do NOT use 'docker compose down -v' unless you intentionally want to delete local database data." -ForegroundColor Yellow

if (-not $NoBrowser) {
    Start-Process "http://localhost:3000"
}

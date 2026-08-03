$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

Write-Host ""
Write-Host "  ENERGY BRAWL / LAN SERVER" -ForegroundColor Yellow
Write-Host "  --------------------------" -ForegroundColor DarkGray

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed. Install Node.js 22 or newer first." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Host "npm.cmd was not found in PATH." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    Write-Host "Installing project dependencies..." -ForegroundColor Cyan
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Building mobile client..." -ForegroundColor Cyan
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$env:OPEN_HOST = "1"
Write-Host "Starting LAN server..." -ForegroundColor Green
& npm.cmd run server
exit $LASTEXITCODE

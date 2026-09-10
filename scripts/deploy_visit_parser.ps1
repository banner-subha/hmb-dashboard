# Deployment script for visit-tracker-parser on Google Cloud Run
#
# Source of truth is cloud_run_visits/ (main.py + Dockerfile + requirements.txt).
# The v1 parser at the repo root was quarantined in Phase 0a; see
# _deprecated/visit-parser-v1/README.md.
#
# Specs below match live revision visit-tracker-parser-00004-ndp (2 vCPU / 2 GiB
# + startup CPU boost). Do not lower them: the parser reads a ~50 MB CSV into
# memory in one invocation.
param(
    [string]$Project = "gotenberg-498805",
    [string]$Region = "us-central1",
    [string]$ServiceName = "visit-tracker-parser"
)

$ErrorActionPreference = "Stop"

# Resolve cloud_run_visits/ relative to this script, so the deploy does not
# depend on the caller's working directory. Deploying from the repo root would
# pick up the whole dashboard tree (and the 50 MB CSV) as build context.
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SourceDir = Join-Path $RepoRoot "cloud_run_visits"

if (-not (Test-Path (Join-Path $SourceDir "main.py"))) {
    Write-Host "Expected parser source at $SourceDir but main.py is missing." -ForegroundColor Red
    exit 1
}

Write-Host "Deploying $ServiceName from $SourceDir (Project: $Project, Region: $Region)..." -ForegroundColor Cyan

gcloud run deploy $ServiceName `
    --source $SourceDir `
    --region $Region `
    --project $Project `
    --platform managed `
    --allow-unauthenticated `
    --memory 2Gi `
    --cpu 2 `
    --cpu-boost `
    --min-instances 0 `
    --timeout 300 `
    --update-env-vars="DROPBOX_VISITS_PATH=/OFFICE HO/BI DATA/SALES DASHBOARD/VISIT_TRACKER_SEPT.csv"

# --update-env-vars, not --set-env-vars: the latter replaces the whole literal
# env set. The Dropbox credentials, DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY
# are Secret Manager references attached to the service and must survive a
# deploy untouched -- DATABASE_URL in particular is what the Phase 0b Postgres
# write depends on.

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully deployed $ServiceName to Google Cloud Run!" -ForegroundColor Green
    $url = gcloud run services describe $ServiceName --region $Region --project $Project --format="value(status.url)"
    Write-Host "Service URL: $url" -ForegroundColor Green
} else {
    Write-Host "Cloud Run deployment encountered an issue." -ForegroundColor Red
}

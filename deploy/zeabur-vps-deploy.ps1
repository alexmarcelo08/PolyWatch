param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "root",
  [string]$RemoteDir = "/opt/polywatch"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$archive = Join-Path $env:TEMP "polywatch-deploy.tar.gz"

Push-Location $root
try {
  tar `
    --exclude="./node_modules" `
    --exclude="./.next" `
    --exclude="./.git" `
    --exclude="./.data" `
    --exclude="./.env" `
    --exclude="./.env.local" `
    -czf $archive .

  ssh "$User@$HostName" "mkdir -p $RemoteDir"
  scp $archive "$User@$HostName`:$RemoteDir/polywatch-deploy.tar.gz"
  ssh "$User@$HostName" "cd $RemoteDir && tar -xzf polywatch-deploy.tar.gz && docker compose up -d --build"
}
finally {
  Pop-Location
  if (Test-Path $archive) {
    Remove-Item $archive -Force
  }
}

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$certDir = Join-Path $root ".cert"
$pfxPath = Join-Path $certDir "ai-ktv-local.pfx"
$rootCerPath = Join-Path $certDir "ai-ktv-local-root-ca.cer"
$passphrase = "ai-ktv-local-dev"

if (!(Test-Path -LiteralPath $pfxPath) -or !(Test-Path -LiteralPath $rootCerPath)) {
  & (Join-Path $PSScriptRoot "new-local-https-cert.ps1") -OutputDir ".cert" -Passphrase $passphrase
}

if (!$env:PORT) {
  $env:PORT = "3443"
}

$env:AI_KTV_SERVER_HTTPS = "1"
$env:AI_KTV_HTTPS_PFX = $pfxPath
$env:AI_KTV_HTTPS_PFX_PASSPHRASE = $passphrase

Set-Location $root
& node --import tsx server/src/index.ts
exit $LASTEXITCODE

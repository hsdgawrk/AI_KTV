param(
  [string]$OutputDir = ".cert",
  [string]$Passphrase = "ai-ktv-local-dev",
  [switch]$TrustOnThisMachine
)

$ErrorActionPreference = "Stop"

Import-Module Microsoft.PowerShell.Security -ErrorAction Stop
Import-Module PKI -ErrorAction Stop

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$resolvedOutputDir = Join-Path $root $OutputDir
New-Item -ItemType Directory -Force -Path $resolvedOutputDir | Out-Null

$pfxPath = Join-Path $resolvedOutputDir "ai-ktv-local.pfx"
$rootCerPath = Join-Path $resolvedOutputDir "ai-ktv-local-root-ca.cer"
$legacyRootCerPath = Join-Path $resolvedOutputDir "ai-ktv-local.cer"
$serverCerPath = Join-Path $resolvedOutputDir "ai-ktv-local-server.cer"
$password = ConvertTo-SecureString -String $Passphrase -Force -AsPlainText

$hostNames = @("localhost")
if ($env:COMPUTERNAME) {
  $hostNames += $env:COMPUTERNAME
  $hostNames += "$($env:COMPUTERNAME).local"
}

$ipAddresses = @("127.0.0.1")
$ipAddresses += Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.PrefixOrigin -ne "WellKnown"
  } |
  Select-Object -ExpandProperty IPAddress -Unique

$sanEntries = @()
$sanEntries += $hostNames | Sort-Object -Unique | ForEach-Object { "DNS=$_" }
$sanEntries += $ipAddresses | Sort-Object -Unique | ForEach-Object { "IPAddress=$_" }
$sanExtension = "2.5.29.17={text}$($sanEntries -join '&')"

$rootCa = New-SelfSignedCertificate `
  -Subject "CN=AI-KTV Local Root CA" `
  -FriendlyName "AI-KTV Local Root CA" `
  -KeyAlgorithm RSA `
  -KeyLength 4096 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage CertSign, CRLSign, DigitalSignature `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(10) `
  -TextExtension @("2.5.29.19={critical}{text}ca=TRUE&pathlength=0")

$serverCert = New-SelfSignedCertificate `
  -Subject "CN=AI-KTV Local HTTPS" `
  -FriendlyName "AI-KTV Local HTTPS" `
  -Type SSLServerAuthentication `
  -Signer $rootCa `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(2) `
  -TextExtension @($sanExtension)

Export-PfxCertificate -Cert $serverCert -FilePath $pfxPath -Password $password -ChainOption BuildChain | Out-Null
Export-Certificate -Cert $rootCa -FilePath $rootCerPath | Out-Null
Copy-Item -LiteralPath $rootCerPath -Destination $legacyRootCerPath -Force
Export-Certificate -Cert $serverCert -FilePath $serverCerPath | Out-Null

if ($TrustOnThisMachine) {
  Import-Certificate -FilePath $rootCerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
}

Write-Output "Created local HTTPS certificate chain:"
Write-Output "  Server PFX: $pfxPath"
Write-Output "  Root CA CER: $rootCerPath"
Write-Output "  Server CER: $serverCerPath"
Write-Output ""
Write-Output "Certificate host entries:"
$sanEntries | ForEach-Object { Write-Output "  $_" }
Write-Output ""
Write-Output "Install and fully trust the Root CA CER on Master/Slave devices before opening https://<host-ip>:3443/slave."

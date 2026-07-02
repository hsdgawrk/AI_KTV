param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$url = "http://localhost:5173/master"
$profile = Join-Path $root ".browser-profile\master-kiosk"

$browserCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$browser = $browserCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $browser) {
  throw "Cannot find Microsoft Edge or Google Chrome."
}

try {
  Invoke-WebRequest -UseBasicParsing "http://localhost:3000/health" -TimeoutSec 2 | Out-Null
} catch {
  Write-Warning "AI-KTV server is not responding. Run npm run dev before opening the Master screen."
}

New-Item -ItemType Directory -Force -Path $profile | Out-Null

$arguments = @(
  "--app=$url",
  "--user-data-dir=`"$profile`"",
  "--autoplay-policy=no-user-gesture-required",
  "--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies"
)

if ($DryRun) {
  Write-Output "Browser: $browser"
  Write-Output "Arguments: $($arguments -join ' ')"
  exit 0
}

Start-Process -FilePath $browser -ArgumentList $arguments

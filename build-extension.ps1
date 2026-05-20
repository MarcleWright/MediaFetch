param(
  [ValidateSet("public", "private")]
  [string]$Variant = "public",

  [string]$LineageBaseUrl = "http://127.0.0.1:17321",

  [string]$LineageToken = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $root "chrome-plugin"
$dist = Join-Path $root "dist"
$target = Join-Path $dist "MediaFetch-$Variant"
$zipPath = Join-Path $dist "MediaFetch-$Variant.zip"

if (Test-Path $target) {
  Remove-Item -LiteralPath $target -Recurse -Force
}
New-Item -ItemType Directory -Path $target -Force | Out-Null

Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force

$manifestPath = Join-Path $target "manifest.json"
if ($Variant -eq "public") {
  $manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
  $manifest.host_permissions = @($manifest.host_permissions | Where-Object { $_ -ne "http://127.0.0.1:17321/*" })
  $manifestJson = ($manifest | ConvertTo-Json -Depth 20).Replace("\u003c", "<").Replace("\u003e", ">")
  $manifestJson | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}

$lineageEnabled = if ($Variant -eq "private") { "true" } else { "false" }
$featureBaseUrl = if ($Variant -eq "private") { $LineageBaseUrl } else { "" }
$featureToken = if ($Variant -eq "private") { $LineageToken } else { "" }
$featureBaseUrlJson = ConvertTo-Json $featureBaseUrl -Compress
$featureTokenJson = ConvertTo-Json $featureToken -Compress
@"
globalThis.MEDIAFETCH_FEATURES = {
  lineageIntegration: $lineageEnabled,
  defaultLineageBaseUrl: $featureBaseUrlJson,
  defaultLineageToken: $featureTokenJson,
};
"@ | Set-Content -LiteralPath (Join-Path $target "features.js") -Encoding UTF8

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $target "*") -DestinationPath $zipPath -Force

Write-Host "Built $Variant extension:"
Write-Host $target
Write-Host $zipPath

# NS Landing Page build script
# Usage:  edit parts/style.css , parts/body.html , parts/app.js (and parts/shell.html)
#         then run  ./build.ps1  in PowerShell  ->  regenerates index.html
# body.html is Base64-encoded and injected by JS at runtime, so the page source
# / crawlers do NOT expose the content.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$parts = Join-Path $root "parts"

$style = Get-Content (Join-Path $parts "style.css") -Raw -Encoding UTF8
$body  = Get-Content (Join-Path $parts "body.html") -Raw -Encoding UTF8
$app   = Get-Content (Join-Path $parts "app.js")    -Raw -Encoding UTF8
$shell = Get-Content (Join-Path $parts "shell.html") -Raw -Encoding UTF8

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($body))

$html = $shell.Replace('__STYLE__', $style).Replace('__B64__', $b64).Replace('__APP__', $app)

$out = Join-Path $root "index.html"
[System.IO.File]::WriteAllText($out, $html, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ("[OK] index.html generated. body base64 = {0:N0} chars" -f $b64.Length)

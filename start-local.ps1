$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskPort = if ($env:PORT) { [int]$env:PORT } else { 3102 }
if ($taskPort -lt 1 -or $taskPort -gt 65535) { throw 'PORT must be between 1 and 65535.' }
$taskPreviewUrl = "http://127.0.0.1:$taskPort"
$taskHealth = $null
try {
    $taskHealth = Invoke-RestMethod -Uri "$taskPreviewUrl/api/health" -TimeoutSec 2
} catch { }
if ($taskHealth.app -eq 'gradpath' -and $taskHealth.ok) {
    throw "Another GradPath is already running at $taskPreviewUrl. Stop its launcher window with Ctrl+C, then start this copy again, or choose a different PORT. The existing service was left unchanged."
}
$taskNodeCommand = Get-Command node -ErrorAction SilentlyContinue
$taskNodePath = if ($taskNodeCommand) { $taskNodeCommand.Source } else { $null }
$taskBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if ($taskNodePath) {
    $taskVersion = & $taskNodePath -p 'parseInt(process.versions.node)'
    if ([int]$taskVersion -lt 24) { $taskNodePath = $null }
}
if (-not $taskNodePath -and (Test-Path -LiteralPath $taskBundledNode)) { $taskNodePath = $taskBundledNode }
if (-not $taskNodePath) { throw 'Node.js 24 or later is required. Install Node.js, then run this launcher again.' }
& $taskNodePath server/index.mjs
exit $LASTEXITCODE

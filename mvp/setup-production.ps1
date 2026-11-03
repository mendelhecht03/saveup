# Switches mvp/.env.local to Plaid Production without the secret ever being shown or pasted into chat.
# Run from the repository root:  & .\mvp\setup-production.ps1
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '.env.local'
$sandboxBackup = Join-Path $PSScriptRoot '.env.sandbox.local'
$dataDir = 'C:\dev\saveup-local-data\production'

$clientId = ''
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*PLAID_CLIENT_ID\s*=\s*(.+?)\s*$') { $clientId = $Matches[1] }
  }
  # Keep the Sandbox settings so you can switch back later. Ignored by Git (.env.*).
  if (-not (Test-Path $sandboxBackup)) {
    Copy-Item $envFile $sandboxBackup
    Write-Host "Saved your Sandbox settings to mvp\.env.sandbox.local"
  }
}
if (-not $clientId) { $clientId = (Read-Host 'Plaid client ID (Dashboard > Developers > Keys)').Trim() }
if (-not $clientId) { throw 'A Plaid client ID is required.' }

$secure = Read-Host 'Paste your Plaid PRODUCTION secret (it stays hidden), then press Enter' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
if (-not $secret) { throw 'No secret was entered. Nothing was changed.' }
if ($secret -notmatch '^[0-9a-f]{20,64}$') { Write-Host 'Note: that does not look like a usual Plaid secret (hex letters and numbers). Saving it anyway.' }

$text = "PLAID_CLIENT_ID=$clientId`nPLAID_SECRET=$secret`nPLAID_ENV=production`nPORT=4188`nSAVEUP_DATA_DIR=$dataDir`n"
# UTF-8 without a byte-order mark, so Node reads the first key correctly.
[IO.File]::WriteAllText($envFile, $text, (New-Object System.Text.UTF8Encoding $false))
$secret = $null
Write-Host "Done. mvp\.env.local now uses Plaid Production, with real data stored in $dataDir"
Write-Host 'To return to test data later: copy mvp\.env.sandbox.local over mvp\.env.local.'

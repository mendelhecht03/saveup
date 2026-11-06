# Asks for your Azure Document Intelligence endpoint and key and saves them
# into lite/.env.local. Nothing is printed back, and the key is hidden while
# you paste it. Press Enter on an empty prompt to keep the value already there.
# Find both in the Azure portal: your Document Intelligence resource -> Keys and Endpoint.
$envFile = Join-Path $PSScriptRoot '..\lite\.env.local'
if (-not (Test-Path $envFile)) { Write-Host "Can't find $envFile" -ForegroundColor Red; exit 1 }

function Read-Value([string]$label, [bool]$hidden) {
  if (-not $hidden) { return (Read-Host $label).Trim() }
  $secure = Read-Host $label -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

$fields = @(
  @{ Name = 'AZURE_DOCINTEL_ENDPOINT'; Label = 'Paste the Endpoint (starts with https://)'; Hidden = $false },
  @{ Name = 'AZURE_DOCINTEL_KEY';      Label = 'Paste KEY 1 (hidden)';                     Hidden = $true }
)

$lines = [System.Collections.Generic.List[string]]::new()
$lines.AddRange([string[]](Get-Content -LiteralPath $envFile))

foreach ($f in $fields) {
  $value = Read-Value $f.Label $f.Hidden
  if (-not $value) { Write-Host "  Kept the existing $($f.Name)."; continue }
  if ($f.Name -eq 'AZURE_DOCINTEL_ENDPOINT' -and $value -notmatch '^https://') {
    Write-Host "  That doesn't look like an endpoint (it should start with https://). Skipped." -ForegroundColor Yellow; continue
  }
  $i = -1
  for ($n = 0; $n -lt $lines.Count; $n++) { if ($lines[$n] -match "^\s*$($f.Name)\s*=") { $i = $n; break } }
  if ($i -ge 0) { $lines[$i] = "$($f.Name)=$value" } else { $lines.Add("$($f.Name)=$value") }
  Write-Host "  Saved $($f.Name)." -ForegroundColor Green
}

# UTF-8 without a byte-order mark, so the app reads the file cleanly.
[IO.File]::WriteAllLines((Resolve-Path $envFile), $lines, [Text.UTF8Encoding]::new($false))
Write-Host "`nDone. Restart the app (Ctrl+C in its window, then npm start) so it picks up the key." -ForegroundColor Cyan

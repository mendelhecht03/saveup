# Renders the sample receipts in sandbox/receipts.mjs as thermal-receipt PNGs
# (sandbox/receipts/<id>.png) for testing receipt reading. Windows PowerShell 5.1.
# From lite/:  powershell -NoProfile -ExecutionPolicy Bypass -File sandbox\receipts\render-samples.ps1
# It runs export-samples.mjs first (needs node on PATH) to get the data as JSON.
param([string]$Json = '')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Json) {
  $Json = Join-Path ([IO.Path]::GetTempPath()) 'saveup-receipts.json'
  & node (Join-Path $here 'export-samples.mjs') $Json | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'export-samples.mjs failed' }
}
$receipts = Get-Content -Raw -Encoding UTF8 $Json | ConvertFrom-Json

$W = 576; $M = 30; $LH = 27
$bullet = [string][char]0x2022
$fontBig = New-Object System.Drawing.Font('Consolas', 30, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fontRegular = New-Object System.Drawing.Font('Consolas', 19, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$fontBold = New-Object System.Drawing.Font('Consolas', 19, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

function Money([int]$c) {
  $sign = ''; if ($c -lt 0) { $sign = '-'; $c = -$c }
  return ('{0}${1}.{2:D2}' -f $sign, [math]::Floor($c / 100), ($c % 100))
}

function Render($r) {
  $parts = $r.store -split ' · '
  if ($parts.Count -lt 2) { $parts = $r.store -split ([string][char]0x00B7) }
  $storeName = $parts[0].Trim()
  $address = ''; if ($parts.Count -gt 1) { $address = $parts[1].Trim() }

  # Build the rows first: kind, left text, right text.
  $rows = New-Object System.Collections.ArrayList
  function Add($kind, $left, $right) { [void]$rows.Add(@{ k = $kind; l = $left; r = $right }) }
  Add 'big' $r.merchant.ToUpper() ''
  Add 'center' $storeName ''
  Add 'center' $address ''
  Add 'center' '(201) 555-0148' ''
  Add 'gap' '' ''
  $d = [datetime]::ParseExact($r.date, 'yyyy-MM-dd', $null)
  $tm = [datetime]::ParseExact($r.time, 'HH:mm', $null)
  Add 'row' ($d.ToString('MM/dd/yyyy') + '  ' + $tm.ToString('hh:mm tt', [Globalization.CultureInfo]::InvariantCulture)) ('REG 03 TRN ' + (4000 + $r.id.Length * 37))
  Add 'rule' '' ''
  $count = 0
  foreach ($i in $r.items) {
    Add 'row' $i.code (Money $i.amountCents)
    if ($i.qty) { Add 'row' ('   ' + $i.qty + ' @ ' + (Money $i.unitCents) + ' EA') ''; $count += $i.qty } else { $count += 1 }
  }
  Add 'rule' '' ''
  Add 'row' 'SUBTOTAL' (Money $r.subtotalCents)
  Add 'row' 'SALES TAX' (Money $r.taxCents)
  Add 'bold' '*** TOTAL' (Money $r.totalCents)
  Add 'gap' '' ''
  if ($r.payment.method -eq 'cash') {
    Add 'row' 'CASH' (Money $r.totalCents)
  } else {
    Add 'row' ('VISA ' + $bullet + $bullet + $bullet + $bullet + ' ' + $r.payment.last4) (Money $r.totalCents)
    Add 'row' ('CHIP READ   AUTH ' + (100000 + ($r.totalCents * 7 + $r.id.Length * 131) % 900000)) ''
  }
  Add 'row' ('ITEMS SOLD ' + $count) ''
  Add 'rule' '' ''
  Add 'center' ('THANK YOU FOR SHOPPING AT ' + $r.merchant.ToUpper()) ''
  Add 'center' 'PLEASE KEEP YOUR RECEIPT' ''
  Add 'gap' '' ''

  $H = $M * 2
  foreach ($row in $rows) { if ($row.k -eq 'big') { $H += 44 } elseif ($row.k -eq 'gap') { $H += 12 } else { $H += $LH } }

  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::FromArgb(247, 246, 243))

  # Faint paper specks so it is not perfectly clean.
  $rand = New-Object System.Random(42 + $r.id.Length)
  for ($n = 0; $n -lt 220; $n++) {
    $a = $rand.Next(18, 50)
    $b = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($a, 90, 90, 90))
    $g.FillRectangle($b, $rand.Next(0, $W), $rand.Next(0, $H), 1, 1); $b.Dispose()
  }

  # A tiny tilt, like a receipt laid on a table.
  $g.TranslateTransform($W / 2, $H / 2); $g.RotateTransform(0.35); $g.TranslateTransform(-$W / 2, -$H / 2)

  $ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(42, 42, 46))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(110, 110, 114), 1)
  $pen.DashStyle = 'Dash'
  $center = New-Object System.Drawing.StringFormat; $center.Alignment = 'Center'
  $right = New-Object System.Drawing.StringFormat; $right.Alignment = 'Far'

  $y = $M
  foreach ($row in $rows) {
    switch ($row.k) {
      'big' { $g.DrawString($row.l, $fontBig, $ink, (New-Object System.Drawing.RectangleF(0, $y, $W, 44)), $center); $y += 44 }
      'center' { $g.DrawString($row.l, $fontRegular, $ink, (New-Object System.Drawing.RectangleF(0, $y, $W, $LH)), $center); $y += $LH }
      'gap' { $y += 12 }
      'rule' { $g.DrawLine($pen, $M, $y + $LH / 2, $W - $M, $y + $LH / 2); $y += $LH }
      default {
        $f = $fontRegular; if ($row.k -eq 'bold') { $f = $fontBold }
        $g.DrawString($row.l, $f, $ink, [single]$M, [single]$y)
        if ($row.r) { $g.DrawString($row.r, $f, $ink, (New-Object System.Drawing.RectangleF($M, $y, ($W - 2 * $M), $LH)), $right) }
        $y += $LH
      }
    }
  }

  $out = Join-Path $here ($r.id + '.png')
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $ink.Dispose(); $pen.Dispose()
  $kb = [math]::Round((Get-Item $out).Length / 1KB)
  Write-Output ("{0}  {1}x{2}  {3} KB" -f $out, $W, $H, $kb)
}

foreach ($r in $receipts) { Render $r }

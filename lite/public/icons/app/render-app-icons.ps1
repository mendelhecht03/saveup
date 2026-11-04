# Draws the SaveUp app icons (home screen, install prompt, browser tab) with
# System.Drawing, so no image tools are needed. Run from lite/:
#   powershell -NoProfile -ExecutionPolicy Bypass -File public\icons\app\render-app-icons.ps1
Add-Type -AssemblyName System.Drawing
$out = Split-Path -Parent $MyInvocation.MyCommand.Path

function Draw-Icon([int]$size, [string]$file, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'; $g.InterpolationMode = 'HighQualityBicubic'
  $g.Clear([System.Drawing.Color]::Transparent)

  # Full-bleed blue for maskable and Apple icons (the OS rounds the corners);
  # a rounded tile on transparent for the plain icon.
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $top = [System.Drawing.Color]::FromArgb(255, 74, 144, 255)
  $bottom = [System.Drawing.Color]::FromArgb(255, 22, 92, 235)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $top, $bottom, 90
  if ($maskable) { $g.FillRectangle($brush, $rect) }
  else {
    $r = $size * 0.22; $d = $r * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90); $path.AddArc(0, $size - $d, $d, $d, 90, 90); $path.CloseFigure()
    $g.FillPath($brush, $path)
  }

  # Soft highlight at the top, like the clay icons.
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse([single]($size * -0.1), [single]($size * -0.55), [single]($size * 1.2), [single]($size * 0.95))
  $glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 255, 255, 255))
  $g.FillPath($glowBrush, $glow)

  # The mark sits in the middle 60% so maskable crops never cut it.
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $font = New-Object System.Drawing.Font 'Segoe UI Black', ([single]($size * 0.42)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
  $g.DrawString('S', $font, $white, (New-Object System.Drawing.RectangleF ([single]($size * -0.04)), ([single]($size * 0.04)), $size, $size), $fmt)

  # Upward arrow to the upper right: "save up".
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([single]($size * 0.055))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  $x = $size * 0.66; $y1 = $size * 0.47; $y0 = $size * 0.27; $w = $size * 0.075
  $g.DrawLine($pen, [single]$x, [single]$y1, [single]$x, [single]$y0)
  $g.DrawLine($pen, [single]($x - $w), [single]($y0 + $w), [single]$x, [single]$y0)
  $g.DrawLine($pen, [single]($x + $w), [single]($y0 + $w), [single]$x, [single]$y0)

  $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Draw-Icon 512 'icon-512.png' $false
Draw-Icon 192 'icon-192.png' $false
Draw-Icon 512 'icon-maskable-512.png' $true
Draw-Icon 180 'apple-touch-icon.png' $true
Draw-Icon 32 'favicon-32.png' $false
Write-Output "Wrote app icons to $out"

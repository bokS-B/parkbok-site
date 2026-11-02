# Wheel pages share image (og-wheel.png, 1200x630). English only, no BOM needed.
#   powershell -ExecutionPolicy Bypass -File tools/make-og-wheel.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#f6f7f9"))
$colors = "#2563eb", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"
$cx = 250; $cy = 315; $r = 215
for ($i = 0; $i -lt 8; $i++) {
  $b = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($colors[$i]))
  $g.FillPie($b, $cx - $r, $cy - $r, 2 * $r, 2 * $r, ($i * 45 - 90 - 22), 45)
}
$g.FillEllipse([System.Drawing.Brushes]::White, $cx - 26, $cy - 26, 52, 52)
$tri = [System.Drawing.Point[]]@((New-Object System.Drawing.Point ($cx - 18), ($cy - $r - 28)), (New-Object System.Drawing.Point ($cx + 18), ($cy - $r - 28)), (New-Object System.Drawing.Point $cx, ($cy - $r + 14)))
$g.FillPolygon((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#1d2129"))), $tri)
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#1d2129"))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#5d6675"))
$blue = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml("#2563eb"))
$f1 = New-Object System.Drawing.Font "Arial", 72, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$f2 = New-Object System.Drawing.Font "Arial", 34, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$f3 = New-Object System.Drawing.Font "Arial", 36, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("Spin the Wheel", $f1, $ink, 530, 190)
$g.DrawString("Name picker  |  Yes or No  |  Numbers  |  Food", $f2, $muted, 534, 285)
$g.DrawString("Free. No sign-up. Share with a link.", $f2, $muted, 534, 330)
$g.DrawString("parkbok.com/wheel", $f3, $blue, 534, 410)
$g.Dispose()
$bmp.Save((Join-Path $root "og-wheel.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Get-Item (Join-Path $root "og-wheel.png") | Select-Object Name, Length

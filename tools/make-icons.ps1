# 파비콘·앱 아이콘·공유 미리보기(OG) 이미지를 만든다.
#   powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$blue = [System.Drawing.ColorTranslator]::FromHtml("#2563eb")
$ink  = [System.Drawing.ColorTranslator]::FromHtml("#1d2129")
$muted = [System.Drawing.ColorTranslator]::FromHtml("#5d6675")

function RoundRect([System.Drawing.Graphics]$g, [System.Drawing.Brush]$brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($brush, $path)
}

function DrawIcon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"
  $g.Clear([System.Drawing.Color]::Transparent)
  RoundRect $g (New-Object System.Drawing.SolidBrush $blue) 0 0 $size $size ($size * 0.22)
  $font = New-Object System.Drawing.Font "Arial", ($size * 0.62), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
  $rect = New-Object System.Drawing.RectangleF 0, ($size * 0.02), $size, $size
  $g.DrawString("P", $font, [System.Drawing.Brushes]::White, $rect, $fmt)
  $g.Dispose()
  return $bmp
}

foreach ($s in 32, 180, 192, 512) {
  $b = DrawIcon $s
  $name = if ($s -eq 32) { "favicon-32.png" } else { "icon-$s.png" }
  $b.Save((Join-Path $root $name), [System.Drawing.Imaging.ImageFormat]::Png)
  if ($s -eq 32) {
    $icon = [System.Drawing.Icon]::FromHandle($b.GetHicon())
    $fs = [System.IO.File]::Create((Join-Path $root "favicon.ico"))
    $icon.Save($fs); $fs.Close()
  }
  $b.Dispose()
}

# OG 이미지 1200x630
$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"
$g.Clear([System.Drawing.Color]::White)
$g.FillRectangle((New-Object System.Drawing.SolidBrush $blue), 0, 0, $W, 14)
$icon = DrawIcon 160
$g.DrawImage($icon, 90, 150, 160, 160); $icon.Dispose()
$fontTitle = New-Object System.Drawing.Font "Malgun Gothic", 64, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fontSub = New-Object System.Drawing.Font "Malgun Gothic", 36, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$fontBrand = New-Object System.Drawing.Font "Arial", 40, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString("HWP 뷰어 · 텍스트 정리 도구", $fontTitle, (New-Object System.Drawing.SolidBrush $ink), 290, 150)
$g.DrawString("설치 없이, 가입 없이, 파일 전송 없이 브라우저에서 바로", $fontSub, (New-Object System.Drawing.SolidBrush $muted), 294, 250)
$g.DrawString("parkbok.com", $fontBrand, (New-Object System.Drawing.SolidBrush $blue), 294, 330)
$g.DrawString("HWP·HWPX 열기 → PDF·텍스트   |   줄바꿈 제거 · 글자수 세기 · SQL IN절", $fontSub, (New-Object System.Drawing.SolidBrush $muted), 90, 500)
$g.Dispose()
$bmp.Save((Join-Path $root "og.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Get-ChildItem (Join-Path $root "favicon.ico"), (Join-Path $root "favicon-32.png"), (Join-Path $root "icon-180.png"), (Join-Path $root "icon-192.png"), (Join-Path $root "icon-512.png"), (Join-Path $root "og.png") | Select-Object Name, Length

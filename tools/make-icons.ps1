# 파비콘 ICO 생성기 — favicon-32.png 를 PNG 그대로 담은 favicon.ico 로 만든다.
# 실행 순서(저장소 루트에서):
#   1) python tools/make-logo.py                                        # SVG·PNG 아이콘·og.png
#   2) powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1    # favicon.ico
# 예전에 여기서 그리던 'P' 글자 아이콘과 OG 이미지는 tools/make-logo.py 로 옮겼다.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$png = Join-Path $root "favicon-32.png"
$ico = Join-Path $root "favicon.ico"
if (-not (Test-Path $png)) { throw "favicon-32.png 가 없다. 먼저 python tools/make-logo.py 를 실행한다." }

$bytes = [System.IO.File]::ReadAllBytes($png)
# PNG 헤더에서 크기 읽기 (IHDR: 16~23 바이트, 빅엔디언)
$w = ([int]$bytes[16] -shl 24) -bor ([int]$bytes[17] -shl 16) -bor ([int]$bytes[18] -shl 8) -bor [int]$bytes[19]
$h = ([int]$bytes[20] -shl 24) -bor ([int]$bytes[21] -shl 16) -bor ([int]$bytes[22] -shl 8) -bor [int]$bytes[23]
if ($w -gt 256 -or $h -gt 256) { throw "ICO 항목은 256px 이하여야 한다: ${w}x${h}" }

# ICONDIR(6) + ICONDIRENTRY(16) + PNG 본문. PNG 내장 ICO 는 Windows Vista+·모든 주요 브라우저가 읽는다.
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
$bw.Write([byte]($(if ($w -eq 256) { 0 } else { $w })))
$bw.Write([byte]($(if ($h -eq 256) { 0 } else { $h })))
$bw.Write([byte]0); $bw.Write([byte]0)
$bw.Write([uint16]1); $bw.Write([uint16]32)
$bw.Write([uint32]$bytes.Length); $bw.Write([uint32]22)
$bw.Write($bytes)
$bw.Flush()
[System.IO.File]::WriteAllBytes($ico, $ms.ToArray())
$bw.Dispose(); $ms.Dispose()

# 읽기 검증
Add-Type -AssemblyName System.Drawing
$check = New-Object System.Drawing.Icon $ico
"favicon.ico {0}x{1}, {2} bytes" -f $check.Width, $check.Height, (Get-Item $ico).Length
$check.Dispose()

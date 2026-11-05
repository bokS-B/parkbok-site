# Approved transparent brand assets -> browser/search favicons. Windows, no extra packages.
# Keeps the original silhouette; no tile, added stroke, tracing or typography.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$brand = Join-Path $root 'assets/brand'
$source = [System.Drawing.Image]::FromFile((Join-Path $brand 'logo-transparent-1024.png'))
function Render-TransparentIcon([int]$size) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($source, 0, 0, $size, $size)
        $stream = New-Object System.IO.MemoryStream
        try { $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); return ,$stream.ToArray() }
        finally { $stream.Dispose() }
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    $sizes = @(16, 32, 48)
    $images = @{}
    foreach ($size in $sizes) { $images[$size] = Render-TransparentIcon $size }
    [System.IO.File]::WriteAllBytes((Join-Path $root 'favicon-32.png'), $images[32])
    [System.IO.File]::WriteAllBytes((Join-Path $root 'icon-192.png'), (Render-TransparentIcon 192))
    $stream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter $stream
    try {
        $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
        $offset = 6 + 16 * $sizes.Count
        foreach ($size in $sizes) {
            $writer.Write([byte]$size); $writer.Write([byte]$size)
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$images[$size].Length); $writer.Write([uint32]$offset)
            $offset += $images[$size].Length
        }
        foreach ($size in $sizes) { $writer.Write([byte[]]$images[$size]) }
        $writer.Flush()
        [System.IO.File]::WriteAllBytes((Join-Path $root 'favicon.ico'), $stream.ToArray())
    } finally { $writer.Dispose(); $stream.Dispose() }
} finally { $source.Dispose() }

$svg = [System.IO.File]::ReadAllText((Join-Path $brand 'logo-transparent.svg'))
$match = [regex]::Match($svg, 'viewBox="([0-9. -]+)"')
if (-not $match.Success) { throw 'Missing SVG viewBox' }
$v = $match.Groups[1].Value.Split(' ') | ForEach-Object { [double]::Parse($_, [cultureinfo]::InvariantCulture) }
$side = [math]::Max($v[2], $v[3])
$box = @(($v[0] - ($side-$v[2])/2), ($v[1] - ($side-$v[3])/2), $side, $side) | ForEach-Object { $_.ToString('0.###', [cultureinfo]::InvariantCulture) }
$style = '<style>path{fill:#511919}@media(prefers-color-scheme:dark){path{fill:#e2a096}}</style>'
$svg = [regex]::Replace($svg, '<svg[^>]*>', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + ($box -join ' ') + '">' + $style)
[System.IO.File]::WriteAllText((Join-Path $root 'favicon.svg'), $svg, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Transparent SVG, ICO (16/32/48), PNG (32/192) generated from approved brand assets.'

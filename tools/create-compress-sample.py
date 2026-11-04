"""Reproducible original PARKBOK illustration; no third-party photo or personal data.
Manual asset-generation tool. Requires Pillow, not used by the website or build.
"""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw

width, height = 1200, 800
im = Image.new('RGB', (width, height), '#FFF1DF')
draw = ImageDraw.Draw(im)
draw.ellipse((780, 100, 1020, 340), fill='#FFD16B')
for level, amplitude, phase, color in [(400, 100, .4, '#F8B8C4'), (510, 75, 2, '#B96F92'), (620, 38, 1, '#77C4B6'), (720, 25, 3, '#397D7A')]:
    points = [(x, round(level + amplitude * math.sin(x / 210 + phase))) for x in range(width)]
    draw.polygon(points + [(width, height), (0, height)], fill=color)
draw.rounded_rectangle((760, 645, 900, 656), radius=5, fill='#FFF1DF')
draw.rounded_rectangle((810, 676, 870, 687), radius=5, fill='#FFF1DF')
# Gentle deterministic paper texture makes compression changes visible.
rng = random.Random(20261104)
data = bytearray(im.tobytes())
for i in range(0, len(data), 3):
    noise = rng.randint(-9, 9)
    for c in range(3): data[i+c] = max(0, min(255, data[i+c] + noise))
im = Image.frombytes('RGB', im.size, bytes(data))
out = Path(__file__).resolve().parent.parent / 'image/assets/compress-sample.jpg'
out.parent.mkdir(exist_ok=True)
im.save(out, quality=94, subsampling=0, optimize=True)
print(f'{out}: {out.stat().st_size} bytes, {width} x {height}')

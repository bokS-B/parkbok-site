# 로고 원본(assets/brand/logo-source.png) → 벡터·아이콘·OG 이미지 생성기
#   python tools/make-logo.py
# 필요: Python 3.12, Pillow, numpy, potracer(pip install --user potracer)
# 산출물:
#   assets/brand/logo.svg                  단일 path, currentColor (가로형)
#   assets/brand/logo-mark.svg             정사각 viewBox 중앙 배치 (아이콘용)
#   assets/brand/logo-transparent-1024.png 투명 배경 1024x1024
#   favicon.svg                            둥근 사각 배경 + 마크
#   favicon-32.png icon-180.png icon-192.png icon-512.png
#   og.png                                 1200x630 공유 미리보기
# favicon.ico 변환은 tools/make-icons.ps1 이 담당한다.
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    import potrace
except ImportError:  # pragma: no cover
    sys.exit("potracer 가 없다: pip install --user potracer")

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "assets" / "brand"
SRC = BRAND / "logo-source.png"

# 팔레트 — 마크 색은 원본에서 샘플링해 덮어쓴다
CREAM = (255, 247, 240)      # #fff7f0 아이콘·OG 배경
INK = (29, 33, 41)           # #1d2129 사이트 --ink
MUTED = (93, 102, 117)       # #5d6675 사이트 --muted
MARGIN = 0.04                # 도형 bbox 바깥 여백 비율
FAV_BOLD = 11                # 파비콘(≤32px) 획 보정: 원본 픽셀 기준 양쪽 11px(획 약 45→67px)


def rgb_hex(c):
    return "#%02x%02x%02x" % tuple(int(v) for v in c[:3])


def load_source():
    """원본을 읽어 (알파 마스크 0~255, 샘플 색) 을 돌려준다. 흰 배경 PNG 도 처리한다."""
    im = Image.open(SRC).convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    alpha = a[..., 3] / 255.0
    rgb = a[..., :3]
    # 흰 배경 위에 합성한 밝기 — 알파가 없는 원본이어도 적갈색/흰색을 가른다
    comp = rgb * alpha[..., None] + 255.0 * (1.0 - alpha[..., None])
    lum = comp.mean(axis=2)
    ink = lum < 128
    # 커버리지: 알파 있는 원본은 알파를, 없는 원본은 밝기 반전을 쓴다
    if alpha.min() < 0.5:
        cover = alpha * (lum < 200)
    else:
        cover = np.clip((255.0 - lum) / 255.0, 0, 1)
    opaque = rgb[(alpha > 0.98) & ink]
    if len(opaque) == 0:
        opaque = rgb[ink]
    color = tuple(int(v) for v in np.median(opaque, axis=0))
    return (cover * 255).round().astype(np.uint8), color


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def trace_contours(mask_bool):
    """potrace 로 윤곽을 따서 [(start, [세그먼트...]), ...] 를 돌려준다. 좌표는 픽셀."""
    bmp = potrace.Bitmap(~mask_bool)  # potracer 는 False 를 전경으로 본다
    path = bmp.trace(turdsize=20, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
                     alphamax=1.0, opticurve=True, opttolerance=0.35)
    out = []
    for curve in path:
        segs = []
        for s in curve.segments:
            if s.is_corner:
                segs.append(("L", s.c, s.end_point))
            else:
                segs.append(("C", s.c1, s.c2, s.end_point))
        out.append((curve.start_point, segs))
    return out


def path_d(contours, ox, oy, scale):
    """윤곽 목록을 SVG path d 문자열로. (ox,oy) 를 빼고 scale 을 곱한다."""
    def P(p):
        return f"{fmt((p.x - ox) * scale)} {fmt((p.y - oy) * scale)}"
    parts = []
    for start, segs in contours:
        parts.append("M" + P(start))
        for s in segs:
            if s[0] == "L":
                parts.append("L" + P(s[1]) + "L" + P(s[2]))
            else:
                parts.append("C" + P(s[1]) + " " + P(s[2]) + " " + P(s[3]))
        parts.append("Z")
    return "".join(parts)


def write_text(p, text):
    p.write_text(text, encoding="utf-8", newline="\n")
    print(f"  {p.relative_to(ROOT)}  {p.stat().st_size:,} B")


def embolden(cover, px):
    """획을 px 만큼 둥글게 두껍게 한다(가우시안 블러 + 임계). 16~32px 파비콘의 시각 보정용."""
    if px <= 0:
        return cover
    from PIL import ImageFilter
    b = np.asarray(Image.fromarray(cover, "L").filter(ImageFilter.GaussianBlur(px))).astype(np.float32) / 255.0
    # 경계에서 px 바깥 지점의 블러 값 ≈ 0.159, 그 근처 ±0.04 를 안티에일리어스 램프로 쓴다
    t = 0.159
    return (np.clip((b - (t - 0.04)) / 0.08, 0, 1) * 255).round().astype(np.uint8)


def crop_box(cover):
    ys, xs = np.where(cover > 64)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def make_svgs(cover, color):
    mask = cover >= 128
    contours = trace_contours(mask)
    x0, y0, x1, y1 = crop_box(cover)
    bw, bh = x1 - x0, y1 - y0
    # 가로 1000 단위로 정규화, 여백 4%
    scale = 1000.0 / bw
    m = 1000.0 * MARGIN
    w = 1000.0 + 2 * m
    h = bh * scale + 2 * m
    d = path_d(contours, x0 - m / scale, y0 - m / scale, scale)
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(w)} {fmt(h)}" '
           f'role="img" aria-label="parkbok">'
           f'<path fill="currentColor" fill-rule="evenodd" d="{d}"/></svg>\n')
    write_text(BRAND / "logo.svg", svg)

    # 정사각 마크: 긴 변 기준 한 변 = 1000 + 여백, 중앙 배치
    side = max(bw, bh) * scale + 2 * m
    ox = x0 - ((side - bw * scale) / 2) / scale
    oy = y0 - ((side - bh * scale) / 2) / scale
    dm = path_d(contours, ox, oy, scale)
    mark = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(side)} {fmt(side)}" '
            f'role="img" aria-label="parkbok">'
            f'<path fill="currentColor" fill-rule="evenodd" d="{dm}"/></svg>\n')
    write_text(BRAND / "logo-mark.svg", mark)

    # 파비콘: 둥근 사각(rx 22%) 크림 배경 + 적갈색 마크 (마크는 한 변의 84%).
    # 16~32px 에서 획이 1px 아래로 떨어져 뭉개지므로 획을 FAV_BOLD px 두껍게 한 마스크를 쓴다.
    bold = trace_contours(embolden(cover, FAV_BOLD) >= 128)
    fav_side = 64.0
    k = fav_side * 0.84 / side          # 마크 축소 비율
    pad = (fav_side - side * k) / 2
    dfav = path_d(bold, ox - pad / (scale * k), oy - pad / (scale * k), scale * k)
    fav = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
           f'<rect width="64" height="64" rx="14" fill="{rgb_hex(CREAM)}"/>'
           f'<path fill="{rgb_hex(color)}" fill-rule="evenodd" d="{dfav}"/></svg>\n')
    write_text(ROOT / "favicon.svg", fav)
    return len(contours), (w, h)


def mark_image(cover, color, box_w, box_h, pad=0):
    """마크를 box 안에 맞춘 RGBA 이미지로. 원본 알파를 LANCZOS 로 줄여 가장자리를 부드럽게 유지.
    pad>0 이면 두껍게 한 마스크의 bbox 가 pad 만큼 커진 것으로 보고 box 도 같이 키운다."""
    x0, y0, x1, y1 = crop_box(cover)
    src = Image.fromarray(cover[y0:y1, x0:x1], "L")
    if pad:
        bw0, bh0 = x1 - x0 - 2 * pad, y1 - y0 - 2 * pad
        box_w, box_h = box_w * (x1 - x0) / bw0, box_h * (y1 - y0) / bh0
    bw, bh = src.size
    s = min(box_w / bw, box_h / bh)
    size = (max(1, round(bw * s)), max(1, round(bh * s)))
    a = src.resize(size, Image.LANCZOS)
    im = Image.new("RGBA", size, color + (0,))
    im.putalpha(a)
    return im


def rounded_bg(size, rx, fill):
    # 투명 바탕도 크림 색으로 둔다 — 검정(0,0,0,0) 위에 paste 하면 모서리 반투명 픽셀의 RGB 가 어두워져 회색 테가 생긴다
    im = Image.new("RGBA", (size, size), fill + (0,))
    # 4배 슈퍼샘플로 모서리 계단 제거
    big = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(big).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=rx * 4, fill=255)
    a = big.resize((size, size), Image.LANCZOS)
    im.paste(Image.new("RGBA", (size, size), fill + (255,)), (0, 0), a)
    return im


def icon(cover, color, size, rounded, mark_ratio, bold=0):
    bg = rounded_bg(size, round(size * 0.22), CREAM) if rounded else Image.new("RGBA", (size, size), CREAM + (255,))
    box = size * mark_ratio
    # 두껍게 한 마스크도 원본 bbox 기준으로 맞춰 favicon.svg 와 배치가 같게 한다
    x0, y0, x1, y1 = crop_box(cover)
    s = min(box / (x1 - x0), box / (y1 - y0))
    m = mark_image(embolden(cover, bold), color, (x1 - x0) * s, (y1 - y0) * s, pad=bold)
    bg.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return bg


def save_png(im, p):
    im.save(p, "PNG", optimize=True)
    print(f"  {p.relative_to(ROOT)}  {p.stat().st_size:,} B  {im.width}x{im.height}")


def make_pngs(cover, color):
    # 투명 1024: 마크가 한 변의 92%
    t = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    m = mark_image(cover, color, 1024 * 0.92, 1024 * 0.92)
    t.alpha_composite(m, ((1024 - m.width) // 2, (1024 - m.height) // 2))
    save_png(t, BRAND / "logo-transparent-1024.png")

    # 32·192: 둥근 사각(투명 모서리). 180(iOS)·512(maskable): 꽉 찬 사각, 마크는 안전영역 80% 안(72%)
    save_png(icon(cover, color, 32, True, 0.84, bold=FAV_BOLD), ROOT / "favicon-32.png")
    save_png(icon(cover, color, 192, True, 0.80), ROOT / "icon-192.png")
    save_png(icon(cover, color, 180, False, 0.76), ROOT / "icon-180.png")
    save_png(icon(cover, color, 512, False, 0.72), ROOT / "icon-512.png")


def font(bold, px):
    fonts_dir = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    cands = ([fonts_dir / "Pretendard-Bold.otf", fonts_dir / "malgunbd.ttf"] if bold
             else [fonts_dir / "Pretendard-Regular.otf", fonts_dir / "malgun.ttf"])
    for c in cands:
        if c.exists():
            return ImageFont.truetype(str(c), px)
    return ImageFont.load_default(px)


def make_og(cover, color):
    W, H = 1200, 630
    im = Image.new("RGBA", (W, H), CREAM + (255,))
    d = ImageDraw.Draw(im)
    # 왼쪽 마크 260px 폭, 세로 중앙
    m = mark_image(cover, color, 260, 260)
    mx, my = 110, (H - m.height) // 2
    im.alpha_composite(m, (mx, my))
    tx = mx + 260 + 90
    f_brand = font(True, 112)
    f_sub = font(True, 44)
    f_small = font(False, 30)
    # 텍스트 블록 세로 중앙
    lines = [("parkbok", f_brand, color, 0),
             ("설치 없이 바로 쓰는 무료 도구", f_sub, INK, 22),
             ("PDF · 이미지 · 색상 · 텍스트 · HWP", f_small, MUTED, 26)]
    heights = []
    for text, f, _, gap in lines:
        b = d.textbbox((0, 0), text, font=f)
        heights.append((b[3] - b[1], b[1], gap))
    total = sum(h + g for h, _, g in heights)
    y = (H - total) // 2
    for (text, f, col, gap), (h, top, _) in zip(lines, heights):
        d.text((tx, y + gap - top), text, font=f, fill=col + (255,))
        y += h + gap
    save_png(im.convert("RGB"), ROOT / "og.png")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    cover, color = load_source()
    print(f"원본 {SRC.name}: 마크 색 {rgb_hex(color)}, 커버리지 {(cover >= 128).sum():,} px")
    n, (w, h) = make_svgs(cover, color)
    print(f"윤곽 {n}개, logo.svg viewBox 0 0 {fmt(w)} {fmt(h)}")
    make_pngs(cover, color)
    make_og(cover, color)


if __name__ == "__main__":
    main()

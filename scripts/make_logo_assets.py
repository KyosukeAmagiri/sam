#!/usr/bin/env python3
"""Build the web logo assets from the official WSLSA logo (assets/wslsa-logo-source.png).

The source is the full logo, crest above the wordmark, on a white background. This script turns the
white into transparency (keeping anti-aliased edges), then writes:

    src/assets/wslsa-crest.png       crest only (lion, shield, griffin): banner, footer, hero, PDF
    src/assets/favicon.png           crest on a white tile for the browser tab
    src/assets/apple-touch-icon.png  the same at 180 px for home-screen shortcuts
    src/assets/og-image.png          full logo on white, 1200 x 630, for link previews

Needs Pillow and numpy. Run it again only when the source logo changes; the outputs are committed.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets" / "wslsa-logo-source.png"
OUT = ROOT / "src" / "assets"


def white_to_alpha(img):
    """Colour-to-alpha against white: solid ink stays opaque, edges keep their partial coverage."""
    a = np.asarray(img.convert("RGB")).astype(np.float64)
    ink = 255 - a.min(axis=2)  # how far each pixel is from white
    alpha = np.clip((ink - 6) / 226, 0, 1)  # the burgundy ink sits about 243 from white
    safe = np.where(alpha > 0, alpha, 1)[..., None]
    rgb = np.clip((a - (1 - alpha[..., None]) * 255) / safe, 0, 255)
    out = np.dstack([rgb, alpha * 255]).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def trim(img, pad=2):
    box = img.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
    l, t, r, b = box
    return img.crop((max(l - pad, 0), max(t - pad, 0), min(r + pad, img.width), min(b + pad, img.height)))


def crest_rows(img):
    """The crest is the first block of rows with ink; the wordmark starts after a blank band."""
    alpha = np.asarray(img.getchannel("A")) > 10
    rows = alpha.any(axis=1)
    top = int(np.argmax(rows))
    y = top
    while y < len(rows) and rows[y]:
        y += 1
    return top, y


def tile(crest, size, fill=0.9, bg=(255, 255, 255, 255)):
    canvas = Image.new("RGBA", (size, size), bg)
    w = round(size * fill)
    h = round(crest.height * w / crest.width)
    small = crest.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(small, ((size - w) // 2, (size - h) // 2))
    return canvas


def save_png(img, path, colours=None):
    if colours:
        img = img.quantize(colors=colours, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    img.save(path, optimize=True)
    print(f"Wrote {path.relative_to(ROOT)} ({img.width}x{img.height}, {path.stat().st_size / 1024:.1f} KB)")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    logo = trim(white_to_alpha(Image.open(SRC)))
    top, bottom = crest_rows(logo)
    crest = trim(logo.crop((0, top, logo.width, bottom)))
    save_png(crest, OUT / "wslsa-crest.png", colours=96)
    save_png(tile(crest, 64, fill=0.96), OUT / "favicon.png")
    save_png(tile(crest, 180, fill=0.84), OUT / "apple-touch-icon.png")
    og = Image.new("RGBA", (1200, 630), (255, 255, 255, 255))
    h = 470
    w = round(logo.width * h / logo.height)
    og.alpha_composite(logo.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, (630 - h) // 2))
    save_png(og.convert("RGB"), OUT / "og-image.png", colours=64)


if __name__ == "__main__":
    main()

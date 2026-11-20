from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
docs = root / "docs"

source = root / "node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"
font = TTFont(source)
font.flavor = None
font.save(docs / "vendor/noto-sans.ttf")

def create_icon(name, size, edge_to_edge=False):
    image = Image.new("RGBA", (512, 512), (37, 78, 61, 255) if edge_to_edge else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    green = "#254e3d"
    white = "#f3f6ed"
    if not edge_to_edge:
        draw.rounded_rectangle((0, 0, 511, 511), radius=118, fill=green)
    draw.rounded_rectangle((152, 130, 360, 382), radius=31, fill=white)
    draw.rounded_rectangle((171, 149, 341, 363), radius=18, fill=green)
    draw.rectangle((207, 146, 223, 366), fill=white)
    for y in (207, 246, 285):
        draw.rounded_rectangle((249, y, 316, y + 13), radius=6, fill=white)
    image.resize((size, size), Image.Resampling.LANCZOS).save(docs / name)

create_icon("icon-192.png", 192)
create_icon("icon-512.png", 512)
create_icon("icon-maskable.png", 512, True)
create_icon("apple-touch-icon.png", 180, True)

"""Add a field-map background picture to the web game (drawn 1 picture pixel = 1 screen pixel).

  python3 tools/bg_add.py <picture> <name> [--height 300] [--colors 64]

Scales the picture to the screen height (300 screen pixels = the game's 100 world pixels), reduces the colours
so it stays crisp, and writes web/data/maps/<name>.png.
"""
import argparse, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("picture"); ap.add_argument("name")
ap.add_argument("--height", type=int, default=300); ap.add_argument("--colors", type=int, default=64)
a = ap.parse_args()
im = Image.open(a.picture).convert("RGB")
w = round(im.width * a.height / im.height)
im = im.resize((w, a.height), Image.BOX).quantize(colors=a.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
os.makedirs(os.path.join(ROOT, "web", "data", "maps"), exist_ok=True)
out = os.path.join(ROOT, "web", "data", "maps", a.name + ".png")
im.save(out)
print(out, im.size, "= world", round(w / 3), "px wide")

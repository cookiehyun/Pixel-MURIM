"""Pack every picture named in web/data/hi/manifest.txt into a few atlas sheets, so the game loads a handful of
files instead of hundreds (each was a round trip, which made the first load slow on the web).

  python3 tools/hi_atlas.py

- writes web/data/hi/atlas_<n>.png (2048 wide shelves) and web/data/hi/atlas.txt: "<file> <sheet> <x> <y> <w> <h>"
- the game cuts frames out of the sheets; a picture missing from atlas.txt is still fetched on its own
- sd_build.py, sd_add.py and sd_fxguide.py run this after installing, so the sheets never go stale
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HI = os.path.join(ROOT, "web", "data", "hi")
SHEET_W, SHEET_H = 2048, 2048


def main():
    files = []
    for ln in open(os.path.join(HI, "manifest.txt")):
        p = ln.split()
        if len(p) >= 4 and p[0] != "ANIM" and not p[0].startswith("#") and p[1] not in files:
            if os.path.exists(os.path.join(HI, p[1])): files.append(p[1])
    ims = {f: Image.open(os.path.join(HI, f)).convert("RGBA") for f in files}
    order = sorted(files, key=lambda f: (-ims[f].height, f))
    sheets, place = [], {}
    x = y = shelf = 0
    cur = None
    for f in order:
        w, h = ims[f].size
        if cur is None or x + w > SHEET_W:
            x, y, shelf = 0, y + shelf + 1 if cur is not None else 0, 0
        if cur is None or y + h > SHEET_H:
            cur = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0)); sheets.append(cur); x = y = shelf = 0
        cur.paste(ims[f], (x, y))
        place[f] = (len(sheets) - 1, x, y, w, h)
        x += w + 1; shelf = max(shelf, h)
    for n in range(32):                                    # old sheets
        q = os.path.join(HI, f"atlas_{n}.png")
        if os.path.exists(q): os.remove(q)
    for n, sh in enumerate(sheets):
        bb = sh.getbbox() or (0, 0, 1, 1)
        sh.crop((0, 0, SHEET_W, bb[3])).save(os.path.join(HI, f"atlas_{n}.png"), optimize=True)
    with open(os.path.join(HI, "atlas.txt"), "w") as fo:
        for f in files:
            s, x, y, w, h = place[f]
            fo.write(f"{f} {s} {x} {y} {w} {h}\n")
    print(f"atlas: {len(files)} pictures in {len(sheets)} sheets")


if __name__ == "__main__":
    main()

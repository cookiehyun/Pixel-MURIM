"""Split an AI sheet (several poses on a flat magenta background) into one picture per figure, so figures
that touch or overlap can still be pixelized one by one.

  python3 tools/sd_split.py <picture> <out dir> <count>

- figure pixels: not the background colour (top-left corner), tolerance 60
- figures: connected shapes on a 4x-reduced mask (small gaps closed); bits smaller than 2% of the largest
  (sweat drops, hair strands, a loose effect) join the nearest figure, until <count> figures remain
- writes <out dir>/fig_<k>.png (k = 0.. left to right): the figure alone on the background colour, cut out
  with a margin, keeping the sheet's scale
"""
import os, sys
from collections import deque
import numpy as np
from PIL import Image

src, out, want = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(int)
bgc = np.median(a[2:30, 2:30].reshape(-1, 3), axis=0)
fg = np.abs(a - bgc).sum(axis=2) >= 60

# reduced mask: a cell is on when any pixel in its 4x4 block is
F = 4
h, w = fg.shape
H, W = (h + F - 1) // F, (w + F - 1) // F
small = np.zeros((H, W), bool)
for y in range(F):
    for x in range(F):
        part = fg[y::F, x::F]
        small[:part.shape[0], :part.shape[1]] |= part

lab = np.full((H, W), -1, int)
comps = []
for y0 in range(H):
    for x0 in range(W):
        if not small[y0, x0] or lab[y0, x0] >= 0:
            continue
        k = len(comps); cells = []
        dq = deque([(y0, x0)]); lab[y0, x0] = k
        while dq:
            y, x = dq.popleft(); cells.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and small[yy, xx] and lab[yy, xx] < 0:
                        lab[yy, xx] = k; dq.append((yy, xx))
        comps.append(cells)

# merge the small bits into the nearest big shape, then the smallest shapes until <want> remain
groups = [{"cells": c} for c in comps]
def centre(g):
    c = np.array(g["cells"]); return c[:, 1].mean(), c[:, 0].mean()
def gap(g1, g2):
    c1, c2 = np.array(g1["cells"]), np.array(g2["cells"])
    return min(abs(c1[:, 1].min() - c2[:, 1].max()), abs(c2[:, 1].min() - c1[:, 1].max()), abs(centre(g1)[0] - centre(g2)[0]))
big = max(len(g["cells"]) for g in groups)
while True:
    groups.sort(key=lambda g: len(g["cells"]))
    tiny = len(groups[0]["cells"]) < big * 0.02
    if not tiny and len(groups) <= want:
        break
    g = groups.pop(0)
    o = min(groups, key=lambda q: gap(g, q))
    o["cells"] += g["cells"]
if len(groups) != want:
    sys.exit(f"{len(groups)} figures found, expected {want}")

groups.sort(key=lambda g: centre(g)[0])
for k, g in enumerate(groups):
    mask = np.zeros((H, W), bool)
    for y, x in g["cells"]:
        mask[y, x] = True
    full = np.kron(mask, np.ones((F, F), bool))[:h, :w] & fg
    ys, xs = np.where(full)
    m = 24
    y0, y1, x0, x1 = max(0, ys.min() - m), min(h, ys.max() + m + 1), max(0, xs.min() - m), min(w, xs.max() + m + 1)
    pic = np.empty((y1 - y0, x1 - x0, 3), np.uint8); pic[:] = bgc.astype(np.uint8)
    sub = full[y0:y1, x0:x1]
    pic[sub] = a[y0:y1, x0:x1][sub]
    Image.fromarray(pic).save(os.path.join(out, f"fig_{k}.png"))
    print(k, "x", x0, x1, "h", ys.max() - ys.min() + 1)

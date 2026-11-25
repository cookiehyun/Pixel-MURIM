"""Cut effect-only frames out of an AI sheet drawn over a position guide (grey character silhouettes on #FF00FF,
one per frame box), size them to the fighter and install them as sprites anchored at the silhouette's feet.

  python3 tools/sd_fxguide.py <char> <picture> <height> <name,name,...>

- height: the fighter's standing height in art pixels (the grey silhouette is scaled to it)
- the grey silhouette, the white box lines and the magenta are dropped; what is left is the effect
- frames go to web/data/hi/sd/<char>_fx/<name>.png, manifest lines "<char>.<name> ... ax ay fight"
  (ax, ay = the silhouette's feet: draw the sprite at the fighter's foot point)
"""
import os, sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
char, pic, height, names = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4].split(",")
a = np.asarray(Image.open(os.path.join(ROOT, "docs", "art", "sd", "src", pic)).convert("RGB")).astype(int)
H, W = a.shape[:2]
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(2), a.min(2)
grey = (mx - mn < 22) & (mn > 110) & (mx < 200)
magenta = (r > 170) & (b > 170) & (g < 110)
white = (mn > 215) & (mx - mn < 30)
# box lines: rows / columns that are mostly white
lines = np.zeros_like(white)
lines[white.mean(1) > 0.3, :] = True
lines[:, white.mean(0) > 0.3] = True
lines &= white
# the silhouettes: big grey components, left to right
seen = np.zeros_like(grey); sil = []
for y0, x0 in zip(*np.where(grey)):
    if seen[y0, x0]: continue
    q = deque([(y0, x0)]); seen[y0, x0] = True; pts = []
    while q:
        y, x = q.popleft(); pts.append((y, x))
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < H and 0 <= xx < W and grey[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True; q.append((yy, xx))
    if len(pts) > 500: sil.append(np.array(pts))
sil.sort(key=lambda p: p[:, 1].mean())
assert len(sil) == len(names), f"{len(sil)} silhouettes, {len(names)} names"
fx = ~(grey | magenta | lines) & ~((mx - mn < 40) & (mn > 120) & (mx < 215))   # also the grey's anti-aliased rim
dst = os.path.join(ROOT, "web", "data", "hi", "sd", char + "_fx")
os.makedirs(dst, exist_ok=True)
cx = [p[:, 1].mean() for p in sil]
out = []
for k, (nm, p) in enumerate(zip(names, sil)):
    left = 0 if k == 0 else int((cx[k - 1] + cx[k]) / 2)
    right = W if k == len(sil) - 1 else int((cx[k] + cx[k + 1]) / 2)
    top, bot = p[:, 0].min(), p[:, 0].max()
    s = height / (bot - top + 1)                          # source px -> art px
    feet = p[p[:, 0] >= bot - (bot - top) * 0.1]
    fxx, fyy = feet[:, 1].mean(), bot
    m = fx[:, left:right]
    rgba = np.zeros((H, right - left, 4), np.uint8)
    rgba[..., :3] = a[:, left:right]; rgba[..., 3] = m * 255
    im = Image.fromarray(rgba)
    w2, h2 = max(1, round(im.width * s)), max(1, round(im.height * s))
    # area-average colour and coverage, then keep the cells that are mostly effect
    pre = rgba.astype(float); pre[..., :3] *= pre[..., 3:4] / 255
    small = np.asarray(Image.fromarray(pre.astype(np.uint8)).resize((w2, h2), Image.BOX)).astype(float)
    cov = small[..., 3] / 255
    col = np.where(cov[..., None] > 0, small[..., :3] / np.maximum(cov[..., None], 1e-3), 0)
    keep = cov > 0.45
    res = np.zeros((h2, w2, 4), np.uint8)
    res[..., :3] = np.clip(col, 0, 255); res[..., 3] = keep * 255
    q = Image.fromarray(res[..., :3]).quantize(colors=24, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")
    res[..., :3] = np.asarray(q)
    # specks (a stray box-line corner, a lone spray pixel): fewer than 4 neighbours in a 5x5 window
    k5 = np.zeros_like(keep, int)
    for dy in range(-2, 3):
        for dx in range(-2, 3): k5 += np.roll(np.roll(keep, dy, 0), dx, 1)
    keep &= k5 >= 4
    res[..., 3] = keep * 255
    ys, xs = np.where(keep)
    if len(ys) == 0: continue
    y0c, y1c, x0c, x1c = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = res[y0c:y1c, x0c:x1c]
    ax, ay = round((fxx - left) * s) - x0c, round(fyy * s) - y0c
    Image.fromarray(crop).save(os.path.join(dst, nm + ".png"))
    out.append(f"{char}.{nm} sd/{char}_fx/{nm}.png {ax} {ay} fight")
    print(nm, crop.shape[1], crop.shape[0], ax, ay)
man = os.path.join(ROOT, "web", "data", "hi", "manifest.txt")
lines_m = open(man).read().split("\n")
mine = {l.split()[0] for l in out}
keep_m = [l for l in lines_m if l and l.split()[0] not in mine]
open(man, "w").write("\n".join(keep_m + out) + "\n")

import subprocess as _sp
_sp.run([sys.executable, os.path.join(ROOT, "tools", "hi_atlas.py")], check=True)   # repack the atlas sheets

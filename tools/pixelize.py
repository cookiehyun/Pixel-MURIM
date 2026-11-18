"""Turn an AI-drawn "pixel art" picture (several poses of one character side by side on a flat
background) into clean hi-res game sprites for the web version.

  python3 tools/pixelize.py <picture> <out dir> --names idle,palm1,palm2,win --height 76 [--splits 50:245,270:538,...]

- background: the flat colour around the figures (taken from the top-left corner), removed only where it is
  connected to the border, so dark clothes inside the outline stay
- figures: found by empty columns between them (or --splits x0:x1,...)
- scale: one scale for all figures, so the FIRST figure is --height pixels tall (keeps poses the same size)
- colours: reduced to --colors shared colours; each output pixel takes the most common colour of its cell
- clean-up: light outline on the silhouette edge, lonely pixels removed
Writes <out dir>/<name>.png and prints "name w h anchorX anchorY" lines for web/data/hi/manifest.txt.
The anchor is the ground point under the hip: bottom row, x = centre of the body at belt height.
"""
import argparse, os
from collections import Counter, deque
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--names", required=True)
ap.add_argument("--height", type=int, default=76)
ap.add_argument("--colors", type=int, default=28)
ap.add_argument("--splits", default="")
ap.add_argument("--bg-tol", type=int, default=34)
ap.add_argument("--rows", default="", help="y0:y1 band that holds the figures (cuts off logos / watermarks)")
args = ap.parse_args()

a = np.asarray(Image.open(args.src).convert("RGB")).astype(int)
H0, W0 = a.shape[:2]
bgc = np.median(a[2:30, 2:30].reshape(-1, 3), axis=0)
near = np.abs(a - bgc).sum(axis=2) < args.bg_tol
bgmask = np.zeros_like(near)
dq = deque([(0, x) for x in range(W0)] + [(H0 - 1, x) for x in range(W0)] + [(y, 0) for y in range(H0)] + [(y, W0 - 1) for y in range(H0)])
while dq:
    y, x = dq.popleft()
    if not (0 <= y < H0 and 0 <= x < W0) or bgmask[y, x] or not near[y, x]:
        continue
    bgmask[y, x] = True
    dq.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
alpha = ~bgmask
if args.rows:
    r0, r1 = (int(v) for v in args.rows.split(":"))
    alpha[:r0] = False; alpha[r1:] = False

if args.splits:
    splits = [tuple(int(v) for v in s.split(":")) for s in args.splits.split(",")]
else:
    on = alpha.sum(axis=0) > 2
    splits, start = [], None
    for x in range(W0 + 1):
        v = on[x] if x < W0 else False
        if v and start is None: start = x
        if not v and start is not None:
            if x - start > 15: splits.append((start, x))
            start = None
names = args.names.split(",")
assert len(names) == len(splits), f"{len(splits)} figures found {splits}, {len(names)} names given"

fig = a[alpha].astype("uint8")
side = int(np.ceil(np.sqrt(len(fig))))
strip = np.zeros((side * side, 3), dtype="uint8"); strip[:len(fig)] = fig
pimg = Image.fromarray(strip.reshape(side, side, 3)).quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
q = np.asarray(Image.fromarray(a.astype("uint8")).quantize(palette=pimg, dither=Image.Dither.NONE))
pal = np.array(pimg.getpalette()[:args.colors * 3]).reshape(-1, 3)

def bbox(x0, x1):
    m = alpha[:, x0:x1]
    ys, xs = np.where(m.any(axis=1))[0], np.where(m.any(axis=0))[0]
    return ys.min(), ys.max() + 1, x0 + xs.min(), x0 + xs.max() + 1

y0f, y1f, _, _ = bbox(*splits[0])
scale = (y1f - y0f) / args.height
os.makedirs(args.out, exist_ok=True)
for name, (x0, x1) in zip(names, splits):
    ya, yb, xa, xb = bbox(x0, x1)
    Hn, Wn = int(round((yb - ya) / scale)), int(round((xb - xa) / scale))
    out = np.zeros((Hn, Wn, 4), dtype=np.uint8)
    for j in range(Hn):
        for i in range(Wn):
            cy0, cy1 = ya + int(j * scale), ya + max(int(j * scale) + 1, int((j + 1) * scale))
            cx0, cx1 = xa + int(i * scale), xa + max(int(i * scale) + 1, int((i + 1) * scale))
            cell = alpha[cy0:cy1, cx0:cx1]
            if cell.mean() < 0.45: continue
            c = Counter(q[cy0:cy1, cx0:cx1][cell].tolist()).most_common(1)[0][0]
            out[j, i, :3] = pal[c]; out[j, i, 3] = 255
    op = out[:, :, 3] > 0
    for j in range(Hn):
        for i in range(Wn):
            if not op[j, i]: continue
            nb = [(j + dy, i + dx) for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0))]
            inside = [0 <= y < Hn and 0 <= x < Wn and op[y, x] for y, x in nb]
            if not any(inside): out[j, i, 3] = 0; continue
            if not all(inside) and out[j, i, :3].astype(int).sum() > 150:
                out[j, i, :3] = (out[j, i, :3] * 0.35 + np.array([27, 22, 38]) * 0.65).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(os.path.join(args.out, name + ".png"))
    belt = int(Hn * 0.5)
    xs = np.where(out[belt, :, 3] > 0)[0]
    ax = int(round((xs.min() + xs.max()) / 2)) if len(xs) else Wn // 2
    print(name, Wn, Hn, ax, Hn - 1)

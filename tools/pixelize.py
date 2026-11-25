"""Turn AI-drawn "pixel art" pictures (several poses of one character side by side on a flat
background) into clean game sprites for the web version (data/hi/, drawn 2x2 per art pixel).

  python3 tools/pixelize.py <out dir> <picture>:<scale>[@x0-x1+x0-x1...][#y0-y1]=<name,name,...> [...]

  scale = source pixels per art pixel (e.g. 8.3 when a standing figure 465 px tall should be 56 art pixels);
  @... gives the figure column ranges when figures touch.

- background: the flat colour around the figures (top-left corner), removed only where it is connected
  to the border, so dark clothes inside the outline stay
- figures: separated by empty columns (one name per figure, left to right; "-" skips a figure)
- pixel grid: one art pixel = <scale> source pixels; the grid offset is chosen per figure so the cells line up
  with the drawn pixels (most uniform cells), and each art pixel is read at the middle of its cell
- colours: all pictures share one palette (--colors), so the same cloth is the same colour everywhere
- clean-up: lonely pixels removed
Writes <out dir>/<name>.png and prints manifest lines "name anchorX anchorY" (anchor = ground point under
the hip: bottom row, x = middle of the feet).
"""
import argparse, os
from collections import Counter, deque
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("jobs", nargs="+", help="picture=name1,name2,...")
ap.add_argument("--colors", type=int, default=32)
ap.add_argument("--bg-tol", type=int, default=34)
ap.add_argument("--rows", default="", help="y0:y1 band holding the figures (cuts off logos / watermarks)")
args = ap.parse_args()


def background(a):
    h, w = a.shape[:2]
    bgc = np.median(a[2:30, 2:30].reshape(-1, 3), axis=0)
    near = np.abs(a - bgc).sum(axis=2) < args.bg_tol
    bg = np.zeros_like(near)
    dq = deque([(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)])
    while dq:
        y, x = dq.popleft()
        if not (0 <= y < h and 0 <= x < w) or bg[y, x] or not near[y, x]:
            continue
        bg[y, x] = True
        dq.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    alpha = ~bg
    if args.rows:
        r0, r1 = (int(v) for v in args.rows.split(":"))
        alpha[:r0] = False; alpha[r1:] = False
    return alpha


def grid(edges):
    """period and phase of a 1-D edge signal (strongest repeat between 4 and 16 px)"""
    x = np.arange(len(edges))
    best = None
    for p in np.arange(4.0, 16.0, 0.01):
        z = (edges * np.exp(-2j * np.pi * x / p)).sum()
        m = abs(z)
        if best is None or m > best[0]:
            best = (m, p, z)
    _, p, z = best
    # a multiple of the true period also peaks; prefer the smallest period that is nearly as strong
    for k in (4, 3, 2):
        q = p / k
        if q < 4: continue
        zq = (edges * np.exp(-2j * np.pi * x / q)).sum()
        if abs(zq) > 0.6 * best[0]:
            p, z = q, zq
            break
    phase = (np.angle(z) / (2 * np.pi) * p) % p          # edges sit at phase + n * p
    return p, phase


pictures = []
for job in args.jobs:
    spec, names = job.split("=")
    spl = None
    rows = None
    if "#" in spec:
        spec, rr = spec.split("#")
        rows = tuple(int(v) for v in rr.split("-"))
    if "@" in spec:
        spec, sp = spec.split("@")
        spl = [tuple(int(v) for v in r.split("-")) for r in sp.split("+")]
    path, scale = spec.rsplit(":", 1)
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    al = background(a)
    if rows: al[:rows[0]] = False; al[rows[1]:] = False
    pictures.append((a, al, names.split(","), float(scale), spl))

# shared palette from every figure pixel of every picture
allpix = np.concatenate([a[m] for a, m, *_ in pictures]).astype("uint8")
side = int(np.ceil(np.sqrt(len(allpix))))
strip = np.zeros((side * side, 3), dtype="uint8"); strip[:len(allpix)] = allpix
pimg = Image.fromarray(strip.reshape(side, side, 3)).quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
pal = np.array(pimg.getpalette()[:args.colors * 3]).reshape(-1, 3)
os.makedirs(args.out, exist_ok=True)

for a, alpha, names, sc, spl in pictures:
    q = np.asarray(Image.fromarray(a.astype("uint8")).quantize(palette=pimg, dither=Image.Dither.NONE))
    lum = a.sum(axis=2)
    if spl:
        figs = spl
    else:
        on = alpha.sum(axis=0) > 2
        figs, start = [], None
        for x in range(a.shape[1] + 1):
            v = on[x] if x < a.shape[1] else False
            if v and start is None: start = x
            if not v and start is not None:
                if x - start > 3 * sc: figs.append((start, x))
                start = None
    if len(names) == 1 and len(figs) > 1: figs = [(figs[0][0], figs[-1][1])]   # one figure with loose bits (blood spray)
    assert len(figs) == len(names), f"{len(figs)} figures found {figs}, names {names}"
    for name, (x0, x1) in zip(names, figs):
        if name == "-": continue
        m = alpha[:, x0:x1]
        ys = np.where(m.any(axis=1))[0]; xs = np.where(m.any(axis=0))[0]
        ya, yb, xa0, xb0 = ys.min(), ys.max() + 1, x0 + xs.min(), x0 + xs.max() + 1
        # grid offset: the one whose cells are most uniform in brightness
        best = None
        for oy in np.linspace(0, sc, 5, endpoint=False):
            for ox in np.linspace(0, sc, 5, endpoint=False):
                cost = 0.0
                for cyv in np.arange(ya - oy, yb, sc * 3):
                    for cxv in np.arange(xa0 - ox, xb0, sc * 3):
                        blk = lum[int(max(0, cyv)):int(cyv + sc), int(max(0, cxv)):int(cxv + sc)]
                        if blk.size: cost += blk.std()
                if best is None or cost < best[0]: best = (cost, ox, oy)
        _, ox, oy = best
        cx = np.arange(xa0 - ox, xb0 + sc, sc); cy = np.arange(ya - oy, yb + sc, sc)
        W, H = len(cx) - 1, len(cy) - 1
        out = np.zeros((H, W, 4), dtype=np.uint8)
        for j in range(H):
            for i in range(W):
                y0, y1 = int(cy[j] + sc * 0.25), int(cy[j] + sc * 0.75) + 1
                xa, xb = int(cx[i] + sc * 0.25), int(cx[i] + sc * 0.75) + 1
                if y0 < 0 or xa < 0: continue
                cell = alpha[y0:y1, xa:xb]
                if cell.size == 0 or cell.mean() < 0.5: continue
                c = Counter(q[y0:y1, xa:xb][cell].tolist()).most_common(1)[0][0]
                out[j, i, :3] = pal[c]; out[j, i, 3] = 255
        # specks: connected pieces under 6 pixels (bits of a neighbouring figure, noise)
        op = out[:, :, 3] > 0
        seen = np.zeros_like(op)
        for j in range(H):
            for i in range(W):
                if not op[j, i] or seen[j, i]: continue
                comp, dq = [], deque([(j, i)]); seen[j, i] = True
                while dq:
                    cy_, cx_ = dq.popleft(); comp.append((cy_, cx_))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy_ + dy, cx_ + dx
                            if 0 <= ny < H and 0 <= nx < W and op[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; dq.append((ny, nx))
                if len(comp) < 6:
                    for cy_, cx_ in comp: out[cy_, cx_, 3] = 0
        op = out[:, :, 3] > 0
        rows = np.where(op.any(axis=1))[0]; cols = np.where(op.any(axis=0))[0]
        out = out[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
        op = out[:, :, 3] > 0
        Hc = out.shape[0]
        feet = np.where(op[max(0, Hc - max(2, Hc // 12)):].any(axis=0))[0]
        ax = int(round((feet.min() + feet.max()) / 2))
        Image.fromarray(out, "RGBA").save(os.path.join(args.out, name + ".png"))
        print(name, ax, Hc - 1, f"# {out.shape[1]}x{Hc}")

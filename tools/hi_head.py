"""Give hi-res frames the same head as a reference frame (AI sheets draw it a pixel bigger or smaller).

  python3 tools/hi_head.py <char> <ref file> <file> [<file> ...] [--rows 17]

The head = the top <rows> rows (hair, topknot, headband tails, face down to the chin). In each frame the
head is lined up on the eye (the dark pixel inside the face) and replaced by the reference head.
Only for upright frames (the head must be at the top); skip lying / rolling / flying frames.
"""
import argparse, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("char"); ap.add_argument("ref"); ap.add_argument("files", nargs="+")
ap.add_argument("--rows", type=int, default=17)
args = ap.parse_args()
D = os.path.join(ROOT, "web", "data", "hi", args.char)

def eye(a, rows):
    r, g, b = (a[:rows, :, k].astype(int) for k in range(3)); op = a[:rows, :, 3] > 0
    skin = op & (r > 180) & (g > 120) & (b < 150) & (r - b > 60)
    ys, xs = np.where(skin)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    dark = op & (r + g + b < 120)
    cand = [(y, x) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if dark[y, x] and skin[y, max(0, x - 1):x + 2].any()]
    # the eye: the dark pixel closest to the middle of the face's upper half
    cy, cx = y0 + (y1 - y0) * 0.35, (x0 + x1) / 2
    return min(cand, key=lambda p: (p[0] - cy) ** 2 + (p[1] - cx) ** 2)

ref = np.array(Image.open(os.path.join(D, args.ref + ".png")))
ry, rx = eye(ref, args.rows)
head = ref[:args.rows]
for f in args.files:
    p = os.path.join(D, f + ".png"); a = np.array(Image.open(p))
    ey, ex = eye(a, args.rows)
    dy, dx = ey - ry, ex - rx
    # room for a head that sticks out further left / up than the old one
    padl, padt = max(0, -dx), max(0, -dy)
    big = np.zeros((a.shape[0] + padt, max(a.shape[1], head.shape[1] + dx + padl) + padl, 4), np.uint8)
    big[padt:padt + a.shape[0], padl:padl + a.shape[1]] = a
    top = padt + dy + args.rows
    big[:top][:, :] = np.where((np.arange(top)[:, None, None] < top), 0, big[:top])   # clear the old head
    for y in range(head.shape[0]):
        for x in range(head.shape[1]):
            if head[y, x, 3]: big[padt + dy + y, padl + dx + x] = head[y, x]
    # keep what was below the head (shoulders) from the frame itself
    big[top:padt + a.shape[0], padl:padl + a.shape[1]][a[top - padt:, :, 3] > 0] = a[top - padt:][a[top - padt:, :, 3] > 0]
    op = big[:, :, 3] > 0
    ys, xs = np.where(op.any(axis=1))[0], np.where(op.any(axis=0))[0]
    out = big[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(out).save(p)
    print(f, "eye", (ey, ex), "->", (ry, rx), "shift left", padl + xs.min() - padl if False else padl - xs.min(), "grow top", padt - ys.min())

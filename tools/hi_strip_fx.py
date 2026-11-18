"""Erase drawn-in effects (glowing cyan qi) from hi-res frames, keep the character.

  python3 tools/hi_strip_fx.py <png> [<png> ...]

Cyan-ish pixels are grouped into connected pieces; a piece is effect (erased) when a good part of its
border touches the background - the collar and cuffs, also pale cyan, sit inside the body. Loose
leftovers (outline bits of the effect) smaller than 12 pixels are removed afterwards.
"""
import sys
from collections import deque
import numpy as np
from PIL import Image

def comps(mask):
    H, W = mask.shape; seen = np.zeros_like(mask); out = []
    for y in range(H):
        for x in range(W):
            if mask[y, x] and not seen[y, x]:
                c = []; dq = deque([(y, x)]); seen[y, x] = True
                while dq:
                    cy, cx = dq.popleft(); c.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True; dq.append((ny, nx))
                out.append(c)
    return out

for p in sys.argv[1:]:
    a = np.array(Image.open(p)); H, W = a.shape[:2]
    r, g, b = (a[:, :, k].astype(int) for k in range(3)); op = a[:, :, 3] > 0
    cyan = op & (((g > 140) & (b > 165) & (b >= r + 25)) | ((r > 185) & (g > 205) & (b > 200)))
    n = 0; erased = []
    for c in comps(cyan):
        edge = bg = 0
        for y, x in c:
            for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                ny, nx = y + dy, x + dx
                inside = 0 <= ny < H and 0 <= nx < W
                if inside and cyan[ny, nx]: continue
                edge += 1
                if not inside or not op[ny, nx]: bg += 1
        if edge and bg / edge > 0.3:
            for y, x in c: a[y, x, 3] = 0; erased.append((y, x))
            n += len(c)
    # the effect crossed the body: fill those holes from the pixels around them
    for _ in range(4):
        opn = a[:, :, 3] > 0; todo = []
        for y, x in erased:
            if opn[y, x]: continue
            def solid(dy, dx):
                for k in range(1, 4):
                    yy, xx = y + dy * k, x + dx * k
                    if 0 <= yy < H and 0 <= xx < W and opn[yy, xx] and not cyan[yy, xx]: return True
                return False
            if (solid(0, 1) and solid(0, -1)) or (solid(1, 0) and solid(-1, 0)):
                nb = [tuple(a[y + dy, x + dx]) for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))
                      if 0 <= y + dy < H and 0 <= x + dx < W and opn[y + dy, x + dx] and not cyan[y + dy, x + dx]]
                if nb: todo.append((y, x, max(set(nb), key=nb.count)))
        for y, x, c in todo: a[y, x] = c
        if not todo: break
    op = a[:, :, 3] > 0
    for c in comps(op):
        if len(c) < 12:
            for y, x in c: a[y, x, 3] = 0
    Image.fromarray(a).save(p); print(p, "erased", n)

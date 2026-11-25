"""Add SD field sprites (frames already pixelized by tools/pixelize.py) to the web game.

  python3 tools/sd_add.py <char> <dir with name.png ...> [name ...]

- removes the magenta fringe left from the #FF00FF background (edge pixels go, inner ones become outline)
- anchor: x = middle of the torso band, y = bottom row
- copies to web/data/hi/sd/<char>/<name>.png and writes the lines into web/data/hi/manifest.txt
  (sprite names: sd_<char>.<name>; existing lines of that sprite are replaced)
"""
import os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
char, src = sys.argv[1], sys.argv[2]
names = sys.argv[3:] or sorted(f[:-4] for f in os.listdir(src) if f.endswith(".png"))
dst = os.path.join(ROOT, "web", "data", "hi", "sd", char)
os.makedirs(dst, exist_ok=True)
man = os.path.join(ROOT, "web", "data", "hi", "manifest.txt")
lines = open(man).read().split("\n") if os.path.exists(man) else []
new = []
for n in names:
    a = np.asarray(Image.open(os.path.join(src, n + ".png")).convert("RGBA")).copy()
    r, g, b, al = (a[:, :, i].astype(int) for i in range(4))
    pink = (al > 0) & (r > 110) & (b > 90) & (g < np.minimum(r, b) * 0.72)
    op = al > 0
    edge = np.zeros_like(op)
    edge[1:, :] |= ~op[:-1, :]; edge[:-1, :] |= ~op[1:, :]; edge[:, 1:] |= ~op[:, :-1]; edge[:, :-1] |= ~op[:, 1:]
    edge |= np.pad(np.zeros((a.shape[0] - 2, a.shape[1] - 2), bool), 1, constant_values=True)
    a[pink & edge, 3] = 0
    a[pink & ~edge, :3] = (27, 22, 38)
    op = a[:, :, 3] > 0
    ys, xs = np.where(op)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    op = a[:, :, 3] > 0
    h = a.shape[0]
    band = op[int(h * 0.45):int(h * 0.75)]
    ax = int(np.median(np.where(band)[1]))
    Image.fromarray(a, "RGBA").save(os.path.join(dst, n + ".png"))
    new.append(f"sd_{char}.{n} sd/{char}/{n}.png {ax} {h - 1}")
keep = [l for l in lines if l and not any(l.startswith(f"sd_{char}.{n} ") for n in names)]
open(man, "w").write("\n".join(keep + new) + "\n")
print("\n".join(new))

import subprocess as _sp
_sp.run([sys.executable, os.path.join(ROOT, "tools", "hi_atlas.py")], check=True)   # repack the atlas sheets

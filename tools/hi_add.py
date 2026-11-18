"""Add one AI pixel-art sheet (4 frames side by side) to the web game's hi-res sprites.

  python3 tools/hi_add.py <sheet.png> <char> <file1>:<sprite>[+<sprite>...] <file2>:... [--ref stand0]

- an exact N-times enlarged sheet is shrunk back to 1 pixel per art pixel first
- frames are cut with tools/pixelize.py logic (background removed, one shared palette per sheet)
- anchors: lined up on the belt with the reference frame (default stand0, the idle), so the body
  does not jump between frames; bottom row = ground
- writes web/data/hi/<char>/<file>.png and adds / replaces the lines in web/data/hi/manifest.txt
"""
import argparse, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("sheet"); ap.add_argument("char"); ap.add_argument("frames", nargs="+")
ap.add_argument("--ref", default="stand0")
ap.add_argument("--band", default="0.40,0.52", help="height band (from the top) whose middle lines up with the reference; use the chest (0.25,0.38) when a leg crosses the belt")
ap.add_argument("--only", default="", help="comma list of files to write (the rest of the sheet is ignored)"); ap.add_argument("--ref-ax", type=int, default=None)
ap.add_argument("--colors", type=int, default=24)
ap.add_argument("--bg-tol", type=int, default=4, help="pixel sheets have an exact flat background: keep this small, or dark clothes vanish")
args = ap.parse_args()

im = Image.open(args.sheet).convert("RGB"); a = np.asarray(im).astype(int)
for n in (16, 12, 10, 8, 6, 5, 4, 3, 2):                          # exact enlargement?
    if a.shape[0] % n == 0 and a.shape[1] % n == 0:
        s = a[::n, ::n]
        if not (np.repeat(np.repeat(s, n, 0), n, 1) != a).any():
            im = im.resize((im.width // n, im.height // n), Image.NEAREST); print("shrunk by", n); break
tmp = tempfile.mkdtemp(); src = os.path.join(tmp, "src.png"); im.save(src)
files = [f.split(":")[0] for f in args.frames]
out = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "pixelize.py"), tmp, f"{src}:1=" + ",".join(files), "--colors", str(args.colors), "--bg-tol", str(args.bg_tol)],
                     capture_output=True, text=True)
if out.returncode: print(out.stdout, out.stderr); sys.exit(1)

BAND = tuple(float(v) for v in args.band.split(","))
def belt(a, lo=None, hi=None):
    lo = BAND[0] if lo is None else lo; hi = BAND[1] if hi is None else hi
    op = a[:, :, 3] > 0; H = op.shape[0]
    xs = [x for y in range(int(H * lo), int(H * hi) + 1) for x in np.where(op[y])[0]]
    return float(np.median(xs))

hid = os.path.join(ROOT, "web", "data", "hi"); cdir = os.path.join(hid, args.char); os.makedirs(cdir, exist_ok=True)
man = os.path.join(hid, "manifest.txt"); lines = open(man).read().rstrip("\n").split("\n")
ref_png = os.path.join(cdir, args.ref + ".png")
if os.path.exists(ref_png):
    ref_ax = args.ref_ax if args.ref_ax is not None else next(int(l.split()[2]) for l in lines if l.split()[1:2] == [f"{args.char}/{args.ref}.png"])
    d = ref_ax - belt(np.array(Image.open(ref_png)))
else:
    d = None
only = set(args.only.split(",")) if args.only else None
for spec in args.frames:
    f, sprites = spec.split(":")
    if f == "-" or (only and f not in only): continue
    a = np.array(Image.open(os.path.join(tmp, f + ".png")))
    ax = int(round(belt(a) + d)) if d is not None else a.shape[1] // 2
    ay = a.shape[0] - 1
    Image.fromarray(a).save(os.path.join(cdir, f + ".png"))
    for sp in sprites.split("+"):
        key = f"{args.char}.{sp}"; new = f"{key} {args.char}/{f}.png {ax} {ay}"
        idx = [i for i, l in enumerate(lines) if l.split()[:1] == [key]]
        if idx: lines[idx[0]] = new
        else: lines.append(new)
        print(new)
open(man, "w").write("\n".join(lines) + "\n")

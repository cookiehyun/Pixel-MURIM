"""Build one character's SD fighter frames from its sheets (tools/sd_sheets.txt) and install them:
split each sheet into figures (sd_split.py), pixelize every figure at the sheet's scale (pixelize.py, one shared
palette per sheet) and clear the magenta fringe. Writes <out>/<frame>.png and <out>/anchors.txt (name ax ay).

  python3 tools/sd_build.py <char> <out dir>
"""
import os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
char, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
anchors = []
for ln in open(os.path.join(ROOT, "tools", "sd_sheets.txt")):
    p = ln.split()
    if not p or p[0].startswith("#") or p[0] != char or len(p) < 4:
        continue
    pic, scale, names = p[1], p[2], p[3].split(",")
    tmp = os.path.join(out, "_split", pic)
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "sd_split.py"), os.path.join(ROOT, "docs", "art", "sd", "src", pic), tmp, str(len(names))], check=True, capture_output=True)
    jobs = [f"{tmp}/fig_{k}.png:{scale}={n}" for k, n in enumerate(names) if n != "-"]
    r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "pixelize.py"), out, *jobs, "--colors", "32", "--bg-tol", "60"], check=True, capture_output=True, text=True)
    for l in r.stdout.splitlines():
        q = l.split()
        if len(q) >= 3: anchors.append((q[0], int(q[1]), int(q[2])))
# magenta fringe off (edge pixels go)
for n, _, _ in anchors:
    f = os.path.join(out, n + ".png")
    a = np.asarray(Image.open(f).convert("RGBA")).copy()
    r_, g_, b_ = (a[:, :, i].astype(int) for i in range(3))
    pink = (a[:, :, 3] > 0) & (r_ > 110) & (b_ > 90) & (g_ < np.minimum(r_, b_) * 0.72)
    a[pink, 3] = 0
    Image.fromarray(a).save(f)
# one outline for every sheet: AI sheets come with thicker or thinner black outlines, and the thin ones mostly vanish
# when shrunk (that frame then looks lighter and smaller). Any light pixel on the silhouette edge gets a dark pixel
# outside it, so all frames share the same bold edge.
OUT = np.array([27, 22, 38, 255], np.uint8)
def outline(n):
    f = os.path.join(out, n + ".png")
    a = np.asarray(Image.open(f).convert("RGBA")).copy()
    a = np.pad(a, ((1, 1), (1, 1), (0, 0)))
    op = a[:, :, 3] > 0
    light = op & (a[:, :, :3].astype(int).sum(axis=2) > 180)
    near = np.zeros_like(op)
    near[1:, :] |= light[:-1, :]; near[:-1, :] |= light[1:, :]; near[:, 1:] |= light[:, :-1]; near[:, :-1] |= light[:, 1:]
    a[near & ~op] = OUT
    Image.fromarray(a).save(f)
for n, _, _ in anchors: outline(n)
anchors = [(n, x + 1, y + 1) for n, x, y in anchors]   # one pixel of padding on every side

# anchor x on the body, not the feet: on one leg (kicks) or in a lunge the middle of the feet slides, so the body
# would jump sideways. The back edge of the torso (chest to belt rows) stays put while hands and feet reach forward;
# the anchor keeps idle_0's distance from it. Lying / rolling frames keep the feet anchor.
FEET = {"down_0", "down_1", "roll_0", "roll_1", "roll_2", "roll_3"}
def back_edge(n):
    a = np.asarray(Image.open(os.path.join(out, n + ".png")).convert("RGBA"))
    op = a[:, :, 3] > 0
    ys = np.where(op.any(1))[0]; top, bot = ys.min(), ys.max(); h = bot - top + 1
    rows = [y for y in range(top + int(h * 0.42), top + int(h * 0.62) + 1) if op[y].any()]
    return float(np.median([np.where(op[y])[0].min() for y in rows]))
ref = {n: (x, y) for n, x, y in anchors}
if "idle_0" in ref:
    off = ref["idle_0"][0] - back_edge("idle_0")
    anchors = [(n, x if n in FEET else int(round(back_edge(n) + off)), y) for n, x, y in anchors]

# the same pixel eye on every upright frame
for ln in open(os.path.join(ROOT, "tools", "sd_sheets.txt")):
    q = ln.split()
    if len(q) == 3 and q[0] == "@face" and q[1] == char:
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "sd_face.py"), out, q[2]], check=True)
with open(os.path.join(out, "anchors.txt"), "w") as fh:
    for n, x, y in anchors: fh.write(f"{n} {x} {y}\n")
print(len(anchors), "frames")

# install: web/data/hi/sd/<char>_f/ and manifest lines "<char>.<frame> ... fight" (they replace the classic frames)
if len(sys.argv) > 3 and sys.argv[3] == "--install":
    import shutil
    dst = os.path.join(ROOT, "web", "data", "hi", "sd", char + "_f")
    os.makedirs(dst, exist_ok=True)
    for n, _, _ in anchors: shutil.copy(os.path.join(out, n + ".png"), os.path.join(dst, n + ".png"))
    man = os.path.join(ROOT, "web", "data", "hi", "manifest.txt")
    head = f"# {char}: SD fighter art (tools/sd_build.py), drawn at the classic size"
    lines = [l for l in open(man).read().split("\n") if l != head and not (l.startswith(char + ".") and l.endswith(" fight"))]
    while lines and lines[-1] == "": lines.pop()
    lines.append(head)
    lines += [f"{char}.{n} sd/{char}_f/{n}.png {x} {y} fight" for n, x, y in anchors]
    open(man, "w").write("\n".join(lines) + "\n")
    print("installed", len(anchors), "frames to", dst)

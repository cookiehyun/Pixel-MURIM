"""Give every upright frame of an SD character the same pixel eye.

At game size a face is about 6x5 art pixels: the eye is 1-2 pixels, and AI drawings land on the grid a little
differently in every frame (a dot, a dash, or nothing). So the eye is drawn here, the same way each time:
a 1x2 dark eye, <inset> pixels in from the front (right) edge of the face, starting one row under the top of the
face skin; other dark specks inside the face become skin.

  python3 tools/sd_face.py <dir with frames> <skip names,comma,...> [--inset 2] [--eye 2]

Skin colours are read from the frames themselves (the warm light tones under the hair of idle_0).
"""
import argparse, os
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("dir"); ap.add_argument("skip")
ap.add_argument("--inset", type=int, default=2); ap.add_argument("--eye", type=int, default=2)
ap.add_argument("--ref", default="idle_0")
a = ap.parse_args()
skip = set(a.skip.split(","))
EYE = np.array([28, 20, 30, 255], np.uint8)

def load(n): return np.asarray(Image.open(os.path.join(a.dir, n + ".png")).convert("RGBA")).copy()
def is_skin(px, tones):
    rgb = px[..., :3].astype(int)
    d = np.min([np.abs(rgb - t).sum(axis=-1) for t in tones], axis=0)
    return (px[..., 3] > 0) & (d < 60)

# skin tones: light warm colours in the upper part of the reference frame
ref = load(a.ref)
h = ref.shape[0]
up = ref[: int(h * 0.45)]
cand = up[(up[..., 3] > 0)][:, :3].astype(int)
warm = cand[(cand[:, 0] > 170) & (cand[:, 0] > cand[:, 2] + 40) & (cand[:, 1] > 120)]
tones = np.unique(warm, axis=0)
if len(tones) == 0: raise SystemExit("no skin found in " + a.ref)
skin_main = tuple(int(v) for v in np.median(warm, axis=0)) + (255,)

done = []
for f in sorted(os.listdir(a.dir)):
    if not f.endswith(".png"): continue
    n = f[:-4]
    if n in skip: continue
    px = load(n)
    ys, xs = np.where(px[..., 3] > 0)
    top, bot = ys.min(), ys.max()
    head = np.zeros(px.shape[:2], bool); head[top: top + int((bot - top + 1) * 0.45)] = True
    sk = is_skin(px, tones) & head
    if sk.sum() < 6: continue
    # the face: the biggest connected skin patch in the head band (not a raised hand or a warm hair tie);
    # its top row and front (rightmost) column
    lab = -np.ones(sk.shape, int); best = []
    for y0, x0 in zip(*np.where(sk)):
        if lab[y0, x0] >= 0: continue
        comp = []; st = [(y0, x0)]; lab[y0, x0] = len(best) + 1000
        while st:
            y, x = st.pop(); comp.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < sk.shape[0] and 0 <= xx < sk.shape[1] and sk[yy, xx] and lab[yy, xx] < 0:
                    lab[yy, xx] = 1; st.append((yy, xx))
        if len(comp) > len(best): best = comp
    if len(best) < 6: continue
    face = np.zeros(sk.shape, bool)
    for y, x in best: face[y, x] = True
    ftop = min(y for y, _ in best)
    rows = face[ftop: ftop + 3]
    front = max(np.where(r)[0].max() for r in rows if r.any())
    ex, ey = front - a.inset, ftop + 1
    # the drawn eyes and specks under the brow line, in front of the ear, become skin
    for y in range(ftop + 1, ftop + 4):
        for x in range(front - 4, front):
            dark_or_white = px[y, x, :3].sum() < 330 or px[y, x, :3].min() > 215   # drawn eyes, eye whites, specks
            if 0 <= x < px.shape[1] and px[y, x, 3] and not face[y, x] and dark_or_white and (face[y, x - 1] or face[y, x + 1] or face[y - 1, x] or face[y + 1, x]):
                px[y, x] = skin_main
    for k in range(a.eye):
        if 0 <= ey + k < px.shape[0] and 0 <= ex < px.shape[1]: px[ey + k, ex] = EYE
    Image.fromarray(px).save(os.path.join(a.dir, f))
    done.append(n)
print(len(done), "faces:", " ".join(done))

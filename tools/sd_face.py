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
# bald or hooded heads: no clear "top of the face". Copy the reference frame's brow and eye instead: the box
# rows y0..y1 below the head's top row, columns x0..-1 from the front of the face (rightmost skin in those rows)
ap.add_argument("--copy", default="")
ap.add_argument("--redraw", type=int, default=0)   # rows below the face top holding the eye (hair over the brow)
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

def head_box(px, y0, y1):
    ys = np.where(px[..., 3].any(1) if px.ndim == 3 else None)[0] if False else np.where((px[..., 3] > 0).any(1))[0]
    top = ys.min()
    sk = is_skin(px, tones)
    rows = [y for y in range(top + y0, top + y1 + 1) if sk[y].any()]
    if not rows: return None
    front = int(np.median([np.where(sk[y])[0].max() for y in rows]))
    return top, front, sk

def face_blob(px):
    """the face: the biggest skin patch in the upper 45% of the figure -> (mask, top row, front column)"""
    op = px[..., 3] > 0
    ys = np.where(op.any(1))[0]; top, bot = ys.min(), ys.max()
    sk = is_skin(px, tones); sk[top + int((bot - top + 1) * 0.45):] = False
    lab = np.zeros(sk.shape, int); best = []; k = 0
    for y0, x0 in zip(*np.where(sk)):
        if lab[y0, x0]: continue
        k += 1; st = [(y0, x0)]; lab[y0, x0] = k; pts = []
        while st:
            y, x = st.pop(); pts.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < sk.shape[0] and 0 <= xx < sk.shape[1] and sk[yy, xx] and not lab[yy, xx]: lab[yy, xx] = k; st.append((yy, xx))
        if len(pts) > len(best): best = pts
    if len(best) < 6: return None
    m = np.zeros(sk.shape, bool)
    for y, x in best: m[y, x] = True
    ftop = min(y for y, _ in best)
    front = max(x for y, x in best if y <= ftop + 3)
    return m, ftop, front

def holes(px, m, ftop, front, rows):
    """non-skin pixels inside the face (skin on both sides in the row) in the given rows: the drawn eye and brow"""
    out = []
    for y in range(ftop, ftop + rows):
        xs = np.where(m[y])[0] if 0 <= y < m.shape[0] else []
        if len(xs) < 2: continue
        for x in range(xs.min(), xs.max() + 1):
            if not m[y, x] and px[y, x, 3] > 0: out.append((y, x))
    return out

if a.redraw:
    # eyes drawn by the model come in every size (a dot or a wide dark band). Each frame's eye is the near-black
    # patch in the head that touches the most skin; it becomes skin and the reference frame's eye is drawn in its
    # place (aligned on the patch's top row and front column)
    def eye_patch(px):
        op = px[..., 3] > 0
        ys = np.where(op.any(1))[0]; top, bot = ys.min(), ys.max()
        sk = is_skin(px, tones)
        blk = op & (px[..., :3].astype(int).sum(axis=2) < 110)
        blk[top + int((bot - top + 1) * 0.4):] = False
        lab = np.zeros(blk.shape, int); best = None; k = 0
        for y0, x0 in zip(*np.where(blk)):
            if lab[y0, x0]: continue
            k += 1; st = [(y0, x0)]; lab[y0, x0] = k; pts = []
            while st:
                y, x = st.pop(); pts.append((y, x))
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < blk.shape[0] and 0 <= xx < blk.shape[1] and blk[yy, xx] and not lab[yy, xx]: lab[yy, xx] = k; st.append((yy, xx))
            if len(pts) > 12: continue                     # outline runs, not an eye
            touch = sum(1 for y, x in pts for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1))
                        if 0 <= yy < sk.shape[0] and 0 <= xx < sk.shape[1] and sk[yy, xx])
            sides = sum(1 for y, x in pts if x > 0 and x + 1 < sk.shape[1] and sk[y, x - 1] and sk[y, x + 1])
            score = touch + 3 * sides
            if touch >= 3 and (best is None or score > best[0]): best = (score, pts)
        return best[1] if best else None
    rp = eye_patch(ref)
    ry, rx = min(y for y, _ in rp), max(x for _, x in rp)
    eye = [(y - ry, x - rx, tuple(ref[y, x])) for y, x in rp if int(ref[y, x, :3].astype(int).sum()) < 60]   # the black of the eye only
    done = []
    for f in sorted(os.listdir(a.dir)):
        if not f.endswith(".png"): continue
        n = f[:-4]
        if n in skip or n == a.ref: continue
        px = load(n)
        ep = eye_patch(px)
        if not ep: continue
        ey, ex = min(y for y, _ in ep), max(x for _, x in ep)
        for y, x in ep: px[y, x] = skin_main
        for dy, dx, c in eye:
            y, x = ey + dy, ex + dx
            if 0 <= y < px.shape[0] and 0 <= x < px.shape[1] and px[y, x, 3]: px[y, x] = c
        Image.fromarray(px).save(os.path.join(a.dir, f)); done.append(n)
    print(len(done), "faces (eye redrawn):", " ".join(done), "| ref eye", len(eye), "px")
    raise SystemExit

if a.copy:
    y0, y1, x0 = (int(v) for v in a.copy.split(":"))
    hb = head_box(ref, y0, y1)
    rt, rf, _ = hb
    patch = ref[rt + y0: rt + y1 + 1, rf + x0: rf].copy()            # the reference brow and eye (skin included)
    done = []
    for f in sorted(os.listdir(a.dir)):
        if not f.endswith(".png"): continue
        n = f[:-4]
        if n in skip or n == a.ref: continue
        px = load(n)
        hb = head_box(px, y0, y1)
        if not hb: continue
        top, front, sk = hb
        ty, tx = top + y0, front + x0
        if tx < 0 or ty < 0 or ty + patch.shape[0] > px.shape[0] or front > px.shape[1]: continue
        # first the frame's own brow / eye marks around the box become skin (no double brows)
        for y in range(ty - 1, ty + patch.shape[0] + 2):
            for x in range(tx - 1, front):
                if not (0 < x < px.shape[1] - 1 and 0 <= y < px.shape[0]) or not px[y, x, 3] or sk[y, x]: continue
                if px[y, x, :3].astype(int).sum() < 330 and (sk[y, x - 1] or sk[y, x + 1]):
                    px[y, x] = skin_main
        region = px[ty: ty + patch.shape[0], tx: front]
        # only over the face: the target pixel is opaque, the patch pixel is opaque
        m = (region[..., 3] > 0) & (patch[..., 3] > 0)
        region[m] = patch[m]
        Image.fromarray(px).save(os.path.join(a.dir, f))
        done.append(n)
    print(len(done), "faces (copied):", " ".join(done))
    raise SystemExit

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
    # the drawn eyes and specks in front of the ear become skin; a light pixel touching the eye (an eye white)
    # becomes part of the eye
    for y in range(ftop, ftop + 4):
        for x in range(front - 4, front):
            if not (0 <= x < px.shape[1] and 0 <= y < px.shape[0]) or not px[y, x, 3] or face[y, x]: continue
            white = px[y, x, :3].min() > 200
            dark = px[y, x, :3].sum() < 330
            if not (white or dark) or not (face[y, x - 1] or face[y, x + 1] or face[y - 1, x] or face[y + 1, x]): continue
            px[y, x] = skin_main
    # around the eye nothing else dark or light: exactly the same 1x<eye> eye as standing
    for y in range(ey - 1, ey + a.eye + 1):
        for x in range(ex - 2, ex + 2):
            if not (0 <= y < px.shape[0] and 0 <= x < px.shape[1]) or not px[y, x, 3] or face[y, x]: continue
            v = px[y, x, :3].astype(int)
            if (v.sum() < 330 or v.min() > 200) and ((x > 0 and face[y, x - 1]) or (x + 1 < px.shape[1] and face[y, x + 1])):
                px[y, x] = skin_main
    for k in range(a.eye):
        if 0 <= ey + k < px.shape[0] and 0 <= ex < px.shape[1]: px[ey + k, ex] = EYE
    Image.fromarray(px).save(os.path.join(a.dir, f))
    done.append(n)
print(len(done), "faces:", " ".join(done))

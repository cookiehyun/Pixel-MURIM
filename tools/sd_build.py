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
jobs = []

# "fit" sheets: AI kick sheets come with smaller heads and longer legs than the rest. Such a sheet is scaled by head
# size (so head and body match the first sheet) and then its legs (below the belt) are shortened in the picture so
# each frame stands as tall as the arcade frame of the same name.
def hair_size(f):
    a = np.asarray(Image.open(f).convert("RGB")).astype(int)
    fg = np.abs(a - a[2, 2]).sum(2) >= 60
    ys = np.where(fg.any(1))[0]; top, bot = ys[0], ys[-1]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hair = fg & (r < 90) & (g < 90) & (b < 100) & (np.abs(r - b) < 30)
    hair[int(top + (bot - top + 1) * 0.45):] = False
    return float(np.sqrt(hair.sum())), top, bot, fg, a
def head_len(f):
    """top of the head to the chin, in picture rows: the first run of face-skin rows from the top (fists lower down
    are separated from it by the collar)."""
    _, top, bot, fg, a = hair_size(f)
    sk = fg & (a[..., 0] > 200) & (a[..., 1] > 150) & (a[..., 0] - a[..., 2] > 40)
    need = max(3, int(fg.shape[1] * 0.02))
    rows = [y for y in range(top, top + int((bot - top + 1) * 0.6)) if sk[y].sum() >= need]
    if not rows: return None
    if rows[0] <= top + (bot - top + 1) * 0.04: return None   # a hand raised above the head, not a face
    run = [rows[0]]
    for y in rows[1:]:
        if y - run[-1] <= 4: run.append(y)
        else: break
    return run[-1] - top + 1
CLASSIC = {}
tf = os.path.join(ROOT, "web", "data", char + ".txt")
if os.path.exists(tf):
    for l in open(tf):
        q = l.split()
        if q and q[0] == "SPRITE": CLASSIC[q[1]] = int(q[3])
ref_head = None
kh = 1.0
FACE_SKIP = {}
for ln in open(os.path.join(ROOT, "tools", "sd_sheets.txt")):
    q = ln.split()
    if len(q) >= 3 and q[0] == "@face": FACE_SKIP[q[1]] = set(q[2].split(","))                                                    # SD height / arcade height (idle_0)
# "@ref <char> <picture> <height>": a model sheet sets the head size (its first figure, standing <height> tall)
for ln in open(os.path.join(ROOT, "tools", "sd_sheets.txt")):
    q = ln.split()
    if len(q) == 4 and q[0] == "@ref" and q[1] == char:
        tmp = os.path.join(out, "_split", "ref_" + q[2])
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "sd_split.py"), os.path.join(ROOT, "docs", "art", "sd", "src", q[2]), tmp, "4"], check=True, capture_output=True)
        _, top, bot, _, _ = hair_size(f"{tmp}/fig_0.png")
        ref_head = head_len(f"{tmp}/fig_0.png") / ((bot - top + 1) / float(q[3]))
        if "idle_0" in CLASSIC: kh = float(q[3]) / CLASSIC["idle_0"]
    if len(q) == 3 and q[0] == "@height" and q[1] == char and "idle_0" in CLASSIC:
        kh = float(q[2]) / CLASSIC["idle_0"]                  # SD height of the standing frame (no model-sheet head)
for ln in open(os.path.join(ROOT, "tools", "sd_sheets.txt")):
    p = ln.split()
    if not p or p[0].startswith("#") or p[0] != char or len(p) < 4:
        continue
    pic, scale, names = p[1], p[2], p[3].split(",")
    tmp = os.path.join(out, "_split", pic)
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "sd_split.py"), os.path.join(ROOT, "docs", "art", "sd", "src", pic), tmp, str(len(names))], check=True, capture_output=True)
    if ref_head is None:                                   # the first sheet sets the head size (art pixels)
        ref_head = float(np.median([head_len(f"{tmp}/fig_{k}.png") or 0 for k in range(len(names))])) / float(scale)
    if len(p) > 4 and p[4] in ("fit", "legs"):
        hl = [head_len(f"{tmp}/fig_{k}.png") for k, nm in enumerate(names) if nm not in FACE_SKIP.get(char, ())]
        if p[4] == "fit": scale = f"{float(np.median([h for h in hl if h])) / ref_head:.2f}"   # "legs": keep the given scale
        for k, nm in enumerate(names):
            if nm == "-" or nm not in CLASSIC: continue
            # legs are only re-lengthened on standing poses (folded legs in a crouch, a jump or on the floor stay)
            if CLASSIC[nm] < 0.85 * CLASSIC.get("idle_0", CLASSIC[nm]) or nm.startswith(("down", "roll", "jump", "j", "c")): continue
            f = f"{tmp}/fig_{k}.png"
            _, top, bot, fg, a = hair_size(f)
            want = int(round(CLASSIC[nm] * kh * float(scale)))      # picture rows for the arcade frame's height
            have = bot - top + 1
            if have == want: continue
            if p[4] == "legs" and abs(have - want) > 0.2 * have: continue   # a pose too far from the arcade one (lunge vs stand): leave it
            # the belt: the darkest row band between 40% and 65% of the figure; legs start below it
            band = range(top + int(have * 0.40), top + int(have * 0.65))
            dark = [(int((fg[y] & (a[y].sum(1) < 150)).sum()), y) for y in band]
            belt = max(dark)[1] + 4
            im = Image.open(f).convert("RGB")
            upper = im.crop((0, 0, im.width, belt))
            legs = im.crop((0, belt, im.width, bot + 1))
            legs = legs.resize((im.width, max(1, legs.height - (have - want))), Image.LANCZOS)   # shorter or longer legs
            outp = Image.new("RGB", (im.width, belt + legs.height + 24), tuple(int(v) for v in a[2, 2]))
            outp.paste(upper, (0, 0)); outp.paste(legs, (0, belt))
            outp.save(f)
        print(pic, "fit: scale", scale)
    jobs += [f"{tmp}/fig_{k}.png:{scale}={n}" for k, n in enumerate(names) if n != "-"]
# one call for every sheet: one shared palette, so skin, cloth and hair are the same colours in every frame
ncol = "40"                                                 # "@colors <char> <n>": more colours (a steel blade needs its own greys)
for ln in open(os.path.join(ROOT, "tools", "sd_sheets.txt")):
    q = ln.split()
    if len(q) == 3 and q[0] == "@colors" and q[1] == char: ncol = q[2]
r = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "pixelize.py"), out, *jobs, "--colors", ncol, "--bg-tol", "60"], check=True, capture_output=True, text=True)
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
# one skin colour: the AI sheets shade skin with several near-identical tones and borrow the shoe brown for cheek and
# hand shadows; all skin tones become the most common one, and a brown pixel touching skin (above the feet) becomes one
# skin-shadow tone. On for characters listed with "@skin <char>" in sd_sheets.txt.
def unify_skin(names):
    from collections import Counter
    frames = {n: np.asarray(Image.open(os.path.join(out, n + ".png")).convert("RGBA")).copy() for n in names}
    cnt = Counter()
    for a in frames.values():
        for c in a[a[:, :, 3] > 0][:, :3]: cnt[tuple(int(v) for v in c)] += 1
    tones = [c for c in cnt if c[0] > 200 and c[0] - c[2] > 60 and 150 <= c[1] <= 215]
    if not tones: return
    main = max(tones, key=lambda c: cnt[c])
    tones = [c for c in tones if sum(abs(int(a) - int(b)) for a, b in zip(c, main)) <= 30]   # near-identical tones only (muscle shading stays)
    base = np.array(main, np.uint8)
    shade = (base.astype(float) * np.array([0.86, 0.75, 0.76])).astype(np.uint8)
    for n, a in frames.items():
        rgb = a[:, :, :3].astype(int); op = a[:, :, 3] > 0
        sk = op & np.isin(rgb[:, :, 0] * 65536 + rgb[:, :, 1] * 256 + rgb[:, :, 2], [t[0] * 65536 + t[1] * 256 + t[2] for t in tones])
        a[sk, :3] = base
        ys = np.where(op.any(1))[0]; feet = ys.min() + int((ys.max() - ys.min()) * 0.78)
        brown = op & (rgb[:, :, 0] > 120) & (rgb[:, :, 0] - rgb[:, :, 2] > 60) & (rgb[:, :, 0] < 200) & (rgb[:, :, 1] < 120)
        near = np.zeros_like(sk)
        near[1:, :] |= sk[:-1, :]; near[:-1, :] |= sk[1:, :]; near[:, 1:] |= sk[:, :-1]; near[:, :-1] |= sk[:, 1:]
        sh = brown & near; sh[feet:] = False
        a[sh, :3] = shade
        Image.fromarray(a).save(os.path.join(out, n + ".png"))
for ln in open(os.path.join(ROOT, "tools", "sd_sheets.txt")):
    q = ln.split()
    if len(q) == 2 and q[0] == "@skin" and q[1] == char:
        unify_skin([n for n, _, _ in anchors])

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
    if len(q) >= 3 and q[0] == "@face" and q[1] == char:
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "sd_face.py"), out, q[2], *q[3:]], check=True)
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
    mine = {f"{char}.{n}" for n, _, _ in anchors}           # only this build's frames are replaced (an @alias may supply the rest)
    lines = [l for l in open(man).read().split("\n") if l != head and not (l.split(" ")[0] in mine and l.endswith(" fight"))]
    while lines and lines[-1] == "": lines.pop()
    lines.append(head)
    lines += [f"{char}.{n} sd/{char}_f/{n}.png {x} {y} fight" for n, x, y in anchors]
    # "@alias <char> <other set>": the same SD frames stand in for another classic sprite set of the character
    # (Heukrim with the sword drawn: the classic set's blade is lifted and drawn over them as an effect)
    for ln in open(os.path.join(ROOT, "tools", "sd_sheets.txt")):
        q = ln.split()
        if len(q) == 3 and q[0] == "@alias" and q[1] == char:
            h2 = f"# {q[2]}: {char}'s SD fighter art (tools/sd_build.py @alias)"
            lines = [l for l in lines if l != h2 and not (l.startswith(q[2] + ".") and l.endswith(" fight"))]
            lines.append(h2)
            lines += [f"{q[2]}.{n} sd/{char}_f/{n}.png {x} {y} fight" for n, x, y in anchors]
    open(man, "w").write("\n".join(lines) + "\n")
    print("installed", len(anchors), "frames to", dst)

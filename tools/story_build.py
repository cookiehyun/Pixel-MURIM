"""Turn the story scripts (docs/story/*.md) into game data for the web version.

  python3 tools/story_build.py

Writes
  web/data/story.json  routes -> chapters -> events (see the format below)
  web/data/kfont.txt   the Galmuri9 glyphs the story and the story menus use (tools/fonts/Galmuri9.bdf, OFL)

Script format: docs/story/README.md. Per chapter (### heading):
  { "title", "place", "fight": {...} | null, "pre": [ev], "post": [ev], "lose": [ev] }
  pre  = everything before "▶ 대전 시작" (the whole chapter when there is no fight)
  post = after "▶ 승리 후", lose = after "▶ 패배 시"
Events:
  ["sec", title]             a "## " section of the prologue (new place)
  ["cut", text]              a [컷] stage direction, shown as narration
  ["say", who, text, dir]    a line; dir = the (stage direction) in front of it, or ""
  ["clue", text]             ▶ 단서 ...   (notebook entry)
  ["clear", text]            ▶ ... 편 클리어 / 해금
  ["pick"]                   ▶ 짝 고르기  (finale: choose two of the seven)
Fight: { "raw", "opp": [names], "seq": n, "tag": bool, "team": [names], "pick": bool, "stage", "variant" }
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "docs", "story")
OUT = os.path.join(ROOT, "web", "data")
ROUTES = [  # id, file, owner (route character; None = several)
    ("prologue", "00_prologue.md", None), ("danwoo", "01_danwoo.md", "단우"), ("cheolsan", "02_cheolsan.md", "철산"),
    ("muyeong", "03_muyeong.md", "무영"), ("seolhwa", "04_seolhwa.md", "설화"), ("heukrim", "05_heukrim.md", "흑림"),
    ("hongryeon", "06_hongryeon.md", "홍련"), ("cheonma", "07_cheonma.md", "천마"), ("finale", "08_finale.md", None),
]
SAY = re.compile(r"^([^\s\[▶#>*|`:][^:]{0,9}?)\s*:\s?(.*)$")
META = ("장소", "대전", "진행", "단서", "연결", "풀리는 단서", "얻는 단서")


def parse_fight(raw):
    left, _, stage = raw.partition("· 무대:")
    stage = stage.strip()
    m = re.match(r"(?:새 무대\s*)?「?([^」(]+?)」?\s*(?:\((.*)\))?$", stage)
    st, var = (m.group(1).strip(), (m.group(2) or "").strip()) if m else (stage, "")
    m = re.match(r"(.*?)\s*\((.*)\)\s*$", left.strip())
    names, flags = (m.group(1), m.group(2)) if m else (left.strip(), "")
    f = {"raw": raw, "stage": st, "variant": var, "tag": "태그" in flags, "team": [], "pick": "고름" in flags, "seq": 1}
    if f["tag"] and not f["pick"]:
        t = flags.split("태그:")[1].split(".")[0]
        f["team"] = [n.replace("고정", "").strip() for n in t.split("+")]
    opp = [n.strip() for n in re.split(r"\s*\+\s*|와\s+", names) if n.strip()]
    if "세 번 연속" in flags: f["seq"] = 3
    if not f["tag"] and not f["pick"] and "+" in names: opp.reverse()     # "보스 + 졸개" in 1:1: the underlings come first
    f["opp"] = opp
    return f


def add_text(ev, line):
    k = 2 if ev[-1][0] == "say" else 1
    ev[-1][k] = (ev[-1][k] + "\n" if ev[-1][k] else "") + line.strip()


def parse_route(path, rid):
    lines = open(path, encoding="utf-8").read().split("\n")
    title = next(l[2:].strip() for l in lines if l.startswith("# "))
    chapters, ch, sec, last = [], None, "pre", None

    def new_chapter(t):
        nonlocal ch, sec, last
        ch = {"title": t, "place": "", "fight": None, "pre": [], "post": [], "lose": []}
        chapters.append(ch); sec = "pre"; last = None

    for raw in lines:
        line = raw.rstrip()
        s = line.strip()
        if line.startswith("### "):
            new_chapter(line[4:].strip()); continue
        if line.startswith("# ") or s.startswith(">") or s in ("---", "") or s.startswith("**"):
            last = None if s in ("---", "") else last
            continue
        if ch is None:
            new_chapter(title)
        if sec == "fightwait": sec = "post"     # anything between the fight marker and "승리 후" plays after the win
        ev = ch[sec]
        if line.startswith("## "):
            ev.append(["sec", re.sub(r"^\d+\.\s*", "", line[3:].strip())]); last = None; continue
        if any(s.startswith(k + ":") for k in META):
            k, v = s.split(":", 1)
            if k == "장소": ch["place"] = v.strip()
            if k == "대전": ch["fight"] = parse_fight(v.strip())
            continue
        if s.startswith("⇄"):
            continue
        if s.startswith("▶"):
            body = s[1:].strip()
            if body.startswith("대전 시작") or body.startswith("태그 대전 시작"): sec = "fightwait"
            elif body.startswith("승리 후"): sec = "post"
            elif body.startswith("패배 시"): sec = "lose"
            elif body.startswith("단서"): ch["post" if ch["fight"] else "pre"].append(["clue", body])
            elif body.startswith("짝 고르기"): ch["pre"].append(["pick"])
            elif "클리어" in body or "해금" in body: ch[sec if sec in ("pre", "post") else "post"].append(["clear", body])
            last = None
            continue
        if s.startswith("["):
            ev.append(["cut", re.sub(r"^\[[^\]]*\]\s*", "", s)]); last = "cut"; continue
        m = SAY.match(s)
        if m and not line.startswith(" "):
            who, text = m.group(1).strip(), m.group(2).strip()
            d = re.match(r"^\(([^)]*)\)\s*(.*)$", text)
            dr = ""
            if d: dr, text = d.group(1), d.group(2)
            ev.append(["say", who, text, dr]); last = "say"; continue
        if line.startswith(" ") and last:
            add_text(ev, s); continue
        ev.append(["cut", s]); last = "cut"
    return {"id": rid, "title": title, "chapters": chapters}


def main():
    routes = []
    for rid, fn, owner in ROUTES:
        r = parse_route(os.path.join(SRC, fn), rid)
        r["owner"] = owner
        routes.append(r)
    os.makedirs(OUT, exist_ok=True)
    data = {"routes": routes}
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    open(os.path.join(OUT, "story.json"), "w", encoding="utf-8").write(js)

    # glyphs: every character of the story plus the Korean text in the story screens' source
    chars = set(js)
    for f in ("story.ts", "storytext.ts", "plays.ts", "field.ts"):
        p = os.path.join(ROOT, "web", "src", f)
        if os.path.exists(p): chars |= set(open(p, encoding="utf-8").read())
    chars |= {chr(c) for c in range(32, 127)}
    want = {ord(c) for c in chars if ord(c) >= 32}
    glyphs, cur = {}, None
    for l in open(os.path.join(ROOT, "tools", "fonts", "Galmuri9.bdf"), encoding="utf-8"):
        l = l.strip()
        if l.startswith("ENCODING"): cur = {"cp": int(l.split()[1])}
        elif cur is None: continue
        elif l.startswith("DWIDTH"): cur["adv"] = int(l.split()[1])
        elif l.startswith("BBX"): cur["bbx"] = [int(v) for v in l.split()[1:]]
        elif l == "BITMAP": cur["rows"] = []
        elif l == "ENDCHAR":
            if cur["cp"] in want: glyphs[cur["cp"]] = cur
            cur = None
        elif "rows" in cur: cur["rows"].append(l)
    out = ["# Galmuri9 (c) Lee Minseo, SIL Open Font License 1.1 (tools/fonts/Galmuri-LICENSE.txt). codepoint adv w h xoff yoff rows(hex)"]
    for cp in sorted(glyphs):
        g = glyphs[cp]
        w, h, xo, yo = g["bbx"]
        out.append(f"{cp} {g['adv']} {w} {h} {xo} {yo} {','.join(g['rows'])}")
    open(os.path.join(OUT, "kfont.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
    missing = sorted(c for c in want if c not in glyphs and c > 32 and not (0xd800 <= c < 0xe000))
    n_ev = sum(len(c[k]) for r in routes for c in r["chapters"] for k in ("pre", "post", "lose"))
    print(f"{len(routes)} routes, {sum(len(r['chapters']) for r in routes)} chapters, {n_ev} events, {len(glyphs)} glyphs")
    if missing: print("missing glyphs:", "".join(chr(c) for c in missing))


if __name__ == "__main__":
    main()

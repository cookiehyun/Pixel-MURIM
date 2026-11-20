"""Story cast: everyone who has no fighter art yet, drawn with the same rig as the seven fighters
(tools/gen_sprites.py). These are design references (to be turned into SD field sprites), not game data.

  python3 tools/gen_cast.py      ->  docs/art/cast/<name>.png (4 poses, 8x) and docs/art/cast/lineup.png
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_sprites as G
from gen_sprites import P
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "art", "cast")

BODY = dict(thigh=7.6, shin=7.6, torso=10.2, upper=5.4, fore=5.0, head_r=3.5,
            w_thigh=1.9, w_shin=1.6, w_upper=1.5, w_fore=1.35, w_hand=1.5, chest=3.8, waist=2.9, skirt=6.0)
BIG = dict(BODY, thigh=8.5, shin=8.5, torso=12.5, upper=6.6, fore=6.0, head_r=3.9,
           w_thigh=3.0, w_shin=2.4, w_upper=2.5, w_fore=2.2, w_hand=2.3, chest=6.4, waist=5.0, skirt=7.0)
WOMAN = dict(BODY, thigh=7.7, shin=7.9, torso=9.8, upper=5.1, fore=4.7, head_r=3.3,
             w_thigh=1.8, w_shin=1.45, w_upper=1.4, w_fore=1.25, w_hand=1.35, chest=3.4, waist=2.4, skirt=9.0)
OLD = dict(BODY, torso=9.8, chest=3.6, waist=3.0)
LOOK = dict(arm_front="b", arm_back="B", arm_front2="b", arm_back2="B", leg_front="p", leg_back="P", boot="n",
            torso="b", torso_dark="B", skirt="b", skirt_dark="B", belt="d", trim="w", cuff="w")
BASEPAL = {"k": "1B1626", "s": "F2C6A0", "S": "C98D6B", "W": "FFF0DC", "Q": "FFFFFF", "y": "C9A040", "m": "4A2A20",
           "u": "B8A486", "U": "D8CCB4", "r": "A83030", "H": "C8C8D0", "t": "EEF2F8", "T": "B8C4D4", "e": "5A3A1E", "E": "9A7040"}
SWORD = dict(kind="sword", length=13)


def spec(name, body, pal, head, scale=1.0, look=None, **kw):
    s = dict(body)
    for k in G.SCALE_KEYS:
        s[k] = s[k] * scale
    s.update(name=name, palette=dict(BASEPAL, **pal), look=dict(LOOK, **(look or {})), head=head)
    s.update(kw)
    if "weapon" in kw and kw["weapon"]["kind"] == "sword":
        s["palette"].setdefault("W", "DCE4EC")
        s["palette"]["W"] = "DCE4EC"
    return s


STAND = P(lean=2, lf=(8, 2), lb=(-8, -2), af=(14, 22), ab=(-8, 4))
WALK_A = P(lean=4, lf=(25, 5), lb=(-20, -25), af=(-18, -4), ab=(22, 34))
WALK_B = P(lean=4, lf=(-18, -25), lb=(25, 5), af=(24, 36), ab=(-18, -6))
KNEEL = P(lean=14, lf=(80, 2), lb=(2, -88), af=(55, 70), ab=(20, 40))
GUARD = P()
SWORD_LOW = P(lean=6, lf=(18, 4), lb=(-20, -8), af=(30, 60), ab=(-10, 10), wa=110)
SWORD_UP = P(lean=-8, lf=(26, 4), lb=(-26, -10), af=(170, 160), ab=(160, 150), wa=150)
SWORD_POINT = P(lean=8, lf=(26, 4), lb=(-26, -12), af=(80, 86), ab=(-10, 15), wa=88)
ARMS_FWD = P(lean=6, lf=(12, 2), lb=(-12, -4), af=(84, 90), ab=(80, 88))
SHAMBLE = P(lean=10, lf=(18, 4), lb=(-14, -22), af=(80, 92), ab=(76, 86))
HANDS_IN = P(lean=0, lf=(6, 2), lb=(-6, -2), af=(55, 120), ab=(40, 125))
LYING = P(lean=0, lf=(5, 0), lb=(-5, -5), af=(170, 175), ab=(150, 160), ground="bbox", rot=-90)
CROUCH = P(lean=24, lf=(75, -15), lb=(35, -70), af=(70, 100), ab=(40, 60))

CAST = [
    # name, spec, poses (4), description for the order sheet
    ("cultist", spec("cultist", BODY, {"h": "1C1A22", "b": "2C2832", "B": "1C1922", "w": "7A2228", "d": "7A2228",
                                         "p": "24212A", "P": "18161D", "n": "141218", "r": "C02A2A"}, "hood",
                     look=dict(cuff="r"), weapon=SWORD),
     [STAND, WALK_A, SWORD_LOW, SWORD_UP]),
    ("gangsi", spec("gangsi", BODY, {"s": "9EA493", "S": "70786A", "h": "16161A", "b": "6E6252", "B": "4C4439",
                                       "w": "8E7E66", "d": "3A2A22", "p": "5A5046", "P": "403A32", "n": "2A2420", "N": "9A5A30", "R": "E03020"},
                    "jiangshi", look=dict(cuff=None), eye_ink="R"),
     [ARMS_FWD, SHAMBLE, P(lean=12, lf=(-12, -24), lb=(18, 4), af=(78, 90), ab=(82, 92)), LYING]),
    ("monk", spec("monk", BODY, {"h": "2A221C", "b": "A8743A", "B": "74502A", "w": "C89A5A", "d": "6A2A1A",
                                   "p": "8A7C68", "P": "6A5E4E", "n": "3B2A1E"}, "monk", beads=True,
                  look=dict(arm_front="s", arm_back="B", arm_front2="s", arm_back2="S", cuff=None, trim=None)),
     [GUARD, WALK_A, STAND, LYING]),
    ("hyegong", spec("hyegong", OLD, {"h": "EDEDF0", "H": "FFFFFF", "b": "D0A848", "B": "967628", "w": "B02E2E",
                                        "d": "B02E2E", "p": "C8A860", "P": "9A7E44", "n": "4A3424"}, "abbot"),
     [STAND, P(lean=10, lf=(14, 4), lb=(-14, -6), af=(40, 140), ab=(35, 145)), KNEEL, LYING]),
    ("jinmu", spec("jinmu", OLD, {"h": "E8E8EC", "H": "FFFFFF", "b": "CFCFC6", "B": "96968E", "w": "5A5A62",
                                    "d": "3A3A44", "p": "6A6A72", "P": "505058", "n": "5A4A34", "y": "8A6A40"},
                   "sage", weapon=SWORD),
     [STAND, SWORD_LOW, SWORD_POINT, LYING]),
    ("jeogun", spec("jeogun", OLD, {"h": "ECECF0", "H": "FFFFFF", "b": "6A1E24", "B": "44121A", "w": "C8B070",
                                      "d": "1E1418", "p": "2E2228", "P": "20181C", "n": "18121A", "y": "C8B070"},
                    "sage", beard=3.0, tail=True, weapon=SWORD),
     [STAND, WALK_A, SWORD_POINT, KNEEL]),
    ("yacha", spec("yacha", BODY, {"s": "D8CCC4", "S": "A8988E", "h": "121016", "H": "2A2430", "b": "2E2438",
                                     "B": "1C1624", "w": "5A4A6A", "d": "140E18", "p": "201A26", "P": "15111A", "n": "0E0A10"},
                   "yacha", weapon=SWORD),
     [SWORD_LOW, WALK_A, P(lean=24, lf=(40, 0), lb=(-40, -40), af=(95, 92), ab=(10, 40), wa=95), KNEEL]),
    ("geumgang", spec("geumgang", BIG, {"s": "C89068", "S": "9A6A4A", "h": "1A1414", "a": "5A606A", "A": "8A929E",
                                          "b": "6A707A", "B": "454A54", "w": "B8BEC8", "d": "7A2020", "p": "3A3028",
                                          "P": "2A2420", "n": "2A2420", "r": "B02828"}, "helmet",
                      look=dict(arm_front="b", arm_back="B", cuff="w")),
     [GUARD, WALK_A, STAND, KNEEL]),
    ("dang", spec("dang", WOMAN, {"h": "16141C", "b": "2A4A50", "B": "1A3036", "w": "8A5AB0", "d": "3A1E4A",
                                    "p": "26262E", "P": "1C1C22", "n": "18161C", "y": "C8C8D8", "v": "3A2A4A"},
                  "bun", veil=True, look=dict(cuff="d")),
     [HANDS_IN, WALK_A, P(lean=6, lf=(20, 4), lb=(-24, -10), af=(70, 110), ab=(30, 120), open_hand=True), KNEEL]),
    ("namgungrin", spec("namgungrin", BODY, {"h": "18161E", "b": "E8EEF4", "B": "A8B8CC", "w": "3A6AA8", "d": "2A4A7A",
                                               "p": "4A5A70", "P": "36435A", "n": "2A2A34", "y": "C8CCD8"},
                        "guan", weapon=SWORD),
     [SWORD_LOW, WALK_A, SWORD_POINT, STAND]),
    ("baekmyeon", spec("baekmyeon", WOMAN, {"h": "DCDCE2", "M": "F4F4F0", "b": "E8E8EC", "B": "B8B8C4", "w": "C8C8D0",
                                              "d": "8A8A96", "p": "D0D0D8", "P": "A8A8B4", "n": "8A8A96"}, "mask", scale=0.9),
     [P(lean=18, lf=(40, -10), lb=(-30, -40), af=(60, 110), ab=(40, 120)), WALK_A, CROUCH, STAND]),
    ("soyeon", spec("soyeon", WOMAN, {"h": "2A1E22", "b": "EEF2F6", "B": "BAC8D8", "w": "8ABCE6", "d": "5A92CC",
                                        "p": "C8D0DC", "P": "A0AABA", "n": "2E4A78", "y": "D8DCE4", "r": "C83040"},
                    "kid", pin=True, scale=0.88),
     [STAND, WALK_A, LYING, CROUCH]),
    ("yussi", spec("yussi", WOMAN, {"h": "1E1A20", "b": "B8A88A", "B": "8A7C64", "w": "E8E0D0", "d": "7A3A3A",
                                      "p": "4A4048", "P": "38303A", "n": "3A2A24", "y": "8A6A40"},
                   "bun", low_bun=True, look=dict(skirt="p", skirt_dark="P"), skirt=13.0),
     [STAND, WALK_A, WALK_B, P(lean=-4, lf=(6, 2), lb=(-6, -2), af=(40, 150), ab=(30, 150))]),
    ("mabu", spec("mabu", BODY, {"h": "2A2220", "b": "7A5A3A", "B": "54402A", "w": "C8B898", "d": "3A2A1E",
                                   "p": "5A5046", "P": "403A32", "n": "3A2A20", "r": "8A7A60"}, "band", stubble=True),
     [STAND, WALK_A, KNEEL, CROUCH]),
    ("baekmujin", spec("baekmujin", BODY, {"h": "2A2628", "H": "8A8890", "b": "F0EEE8", "B": "C0BCB0", "w": "C8A858",
                                             "d": "6A5A3A", "p": "8A8478", "P": "6A6458", "n": "3A3430", "y": "5AA080"},
                       "guan", grey=True, beard=2.5),
     [P(lean=0, lf=(6, 2), lb=(-6, -2), af=(60, 130), ab=(55, 135)), WALK_A, STAND,
      P(lean=4, lf=(10, 2), lb=(-10, -4), af=(100, 150), ab=(-6, 6), open_hand=True)]),
    ("chief", spec("chief", OLD, {"h": "E6E6EA", "H": "FFFFFF", "b": "E4E0D4", "B": "B4AE9E", "w": "8A8070",
                                    "d": "6A5A48", "p": "D0CABC", "P": "A8A294", "n": "6A5A40", "y": "6A5A40"}, "sage",
                   beard=4.0),
     [STAND, WALK_A, KNEEL, LYING]),
    ("villager", spec("villager", BODY, {"h": "221E20", "b": "8A7A62", "B": "62563F", "w": "D8CCB0", "d": "4A3A2A",
                                           "p": "D0C6B0", "P": "A89E88", "n": "6A5034", "r": "C8BC9C"}, "band"),
     [STAND, WALK_A, WALK_B, CROUCH]),
    ("child", spec("child", BODY, {"h": "22202A", "b": "C9C0AC", "B": "9A927E", "w": "E8E2D2", "d": "7A4A2A",
                                     "p": "7A6E5E", "P": "5A5044", "n": "8A6A40"}, "kid", scale=0.62),
     [STAND, WALK_A, CROUCH, WALK_B]),
    ("arong", spec("arong", BODY, {"h": "22202A", "b": "D9D2C0", "B": "A79F8E", "w": "EEE8DA", "d": "8C3A2E",
                                     "p": "6A6058", "P": "4D453F", "n": "9A7A4A"}, "kid", scale=0.62),
     [STAND, WALK_A, WALK_B, CROUCH]),
]

BG = (61, 69, 89, 255)


def render(sp, pose):
    grid, _ = G.build(sp, pose)
    g, ax, ay = G.crop(grid)
    return G.to_png(g, sp["palette"], 1), ax, ay


def sheet(name, sp, poses, scale=8):
    ims = [render(sp, p) for p in poses]
    cw = max(i.width for i, _, _ in ims) + 8
    ch = max(i.height for i, _, _ in ims) + 6
    out = Image.new("RGBA", (cw * len(ims), ch), BG)
    for k, (im, ax, ay) in enumerate(ims):
        out.alpha_composite(im, (k * cw + cw // 2 - ax, ch - 3 - ay - 1))
    return out.resize((out.width * scale, out.height * scale), Image.NEAREST)


def main():
    os.makedirs(OUT, exist_ok=True)
    lineup = []
    for name, sp, poses in CAST:
        sheet(name, sp, poses).save(os.path.join(OUT, name + ".png"))
        lineup.append((name, render(sp, poses[0])))
    # everyone side by side at the same scale, with the seven fighters for height
    for nm in ("danwoo", "cheolsan", "muyeong", "seolhwa", "heukrim", "hongryeon", "cheonma"):
        sp = {"danwoo": G.DANWOO, "cheolsan": G.CHEOLSAN, "muyeong": G.MUYEONG, "seolhwa": G.SEOLHWA,
              "heukrim": G.HEUKRIM, "hongryeon": G.HONGRYEON, "cheonma": G.CHEONMA}[nm]
        lineup.insert(0 if nm == "danwoo" else len(lineup), (nm, render(sp, G.BASE_POSES["idle_0"])))
    cw = max(i.width for _, (i, _, _) in lineup) + 4
    chh = max(i.height for _, (i, _, _) in lineup) + 14
    cols = 13
    rows = (len(lineup) + cols - 1) // cols
    sc = 5
    out = Image.new("RGBA", (cw * cols * sc, chh * rows * sc), BG)
    d = ImageDraw.Draw(out)
    for k, (nm, (im, ax, ay)) in enumerate(lineup):
        x0, y0 = (k % cols) * cw * sc, (k // cols) * chh * sc
        big = im.resize((im.width * sc, im.height * sc), Image.NEAREST)
        out.alpha_composite(big, (x0 + (cw // 2 - ax) * sc, y0 + (chh - 10 - ay - 1) * sc))
        d.text((x0 + 6, y0 + (chh - 8) * sc), nm, fill=(230, 230, 240, 255))
    out.save(os.path.join(OUT, "lineup.png"))
    print(len(CAST), "cast sheets ->", OUT)


if __name__ == "__main__":
    main()

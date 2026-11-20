"""Prologue background layout references (chunky pixels, side view, 2 screens wide = 384 x 108 world px).
They show composition and mood to turn into finished backgrounds; not game data.

  python3 tools/gen_bg_refs.py   ->  docs/art/bg/<scene>.png (4x)
"""
import math, os, random
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "art", "bg")
W, H, G = 384, 108, 92          # ground line


def hx(s):
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


class C:
    def __init__(self, seed=1):
        self.im = Image.new("RGB", (W, H))
        self.p = self.im.load()
        self.r = random.Random(seed)

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < W and 0 <= y < H:
            self.p[x, y] = c

    def rect(self, x, y, w, h, c):
        for j in range(int(h)):
            for i in range(int(w)):
                self.px(x + i, y + j, c)

    def sky(self, top, mid, bot):
        for y in range(H):
            t = y / G
            c = mix(top, mid, min(1, t / 0.6)) if t < 0.6 else mix(mid, bot, min(1, (t - 0.6) / 0.4))
            for x in range(W):
                self.p[x, y] = c

    def moon(self, x, y, r, c, glow=None):
        for j in range(-r - 4, r + 5):
            for i in range(-r - 4, r + 5):
                d = math.hypot(i, j)
                if d <= r:
                    self.px(x + i, y + j, c if d < r - 1 or (i + j) % 2 else mix(c, (0, 0, 0), 0.2))
                elif glow and d <= r + 3 and (i + j) % 2 == 0:
                    self.px(x + i, y + j, glow)

    def ridge(self, base, amp, freq, col, ph=0.0):
        for x in range(W):
            v = math.sin(x * freq + ph) * 0.6 + math.sin(x * freq * 2.3 + ph * 1.7) * 0.3 + math.sin(x * freq * 5.1) * 0.1
            top = int(base - amp * (v * 0.5 + 0.5))
            for y in range(top, H):
                self.px(x, y, col)

    def ground(self, c1, c2, y=G, rough=0.08):
        for yy in range(y, H):
            for x in range(W):
                self.px(x, yy, c2 if self.r.random() < rough else c1)
        for x in range(W):
            self.px(x, y, mix(c1, (0, 0, 0), 0.3))

    def pine(self, x, g, h, col):
        self.rect(x, g - 3, 1, 3, mix(col, (0, 0, 0), 0.3))
        for j in range(h):
            half = int(((j % 5) + 1) * 0.7 + (j / h) * 3.5)
            for i in range(-half, half + 1):
                self.px(x + i, g - 3 - h + j, col)

    def thatch(self, x, g, w, wall, straw, burn=0.0, fire=False):
        top = g - 18
        self.rect(x, top, w, 17, hx(wall))
        for px_ in (0, w // 2, w - 1):
            self.rect(x + px_, top, 1, 17, hx("4A3424"))
        self.rect(x + w // 5, g - 13, 6, 12, hx("2A1E1A"))
        self.rect(x + int(w * 0.62), g - 12, 7, 5, hx("3A2A24"))
        rw, rh = w + 10, 11
        for i in range(rw):
            t = (i - rw / 2) / (rw / 2)
            yt = int(top + 2 - rh * max(0, 1 - abs(t) ** 2.6) ** 0.55)
            for y in range(yt, top + 3):
                c = hx(straw)
                if (y - yt) % 4 == 3:
                    c = mix(c, (0, 0, 0), 0.25)
                if burn and self.r.random() < burn * (1 - (y - yt) / rh * 0.5):
                    c = hx("2A2020")
                self.px(x - 5 + i, y, c)
            if fire and self.r.random() < 0.7:
                fh = int(4 + 8 * (1 - abs(t)) * self.r.random() + 3)
                for k in range(fh):
                    self.px(x - 5 + i + self.r.choice((-1, 0, 0, 1)), yt - k, hx("FFD050") if k < fh * 0.3 else hx("FF7A20") if k < fh * 0.7 else hx("C02A10"))

    def flag(self, x, y, cloth="1A161C", mark="C02A1A"):
        self.rect(x, y, 1, 15, hx("4A3424"))
        self.rect(x + 1, y + 1, 10, 7, hx(cloth))
        for (i, j) in ((5, 2), (4, 3), (5, 3), (6, 3), (4, 4), (5, 4), (6, 4), (5, 5), (7, 2)):
            self.px(x + 1 + i, y + 1 + j, hx(mark))

    def tiled_hall(self, x, g, w, h, wall="8A2A24", roof="2E3440", pillar="6A1E1A", eave=8, sign=None):
        top = g - h
        self.rect(x, top, w, h, hx(wall))
        for k in range(0, w + 1, max(8, w // 6)):
            self.rect(x + k, top, 2, h, hx(pillar))
        self.rect(x - 2, g - 3, w + 4, 3, hx("6A6A70"))                          # stone base
        # curved tiled roof with upturned eaves
        rw = w + eave * 2
        for i in range(rw):
            t = (i - rw / 2) / (rw / 2)
            lift = int(3 * abs(t) ** 4)
            yt = top - 12 + int(6 * abs(t)) - lift
            for y in range(yt, top - lift + 1):
                c = hx(roof) if (i % 3) else mix(hx(roof), (255, 255, 255), 0.12)
                self.px(x - eave + i, y, c)
            self.px(x - eave + i, top - lift + 1, mix(hx(roof), (0, 0, 0), 0.4))
        self.rect(x + w // 2 - 6, top - 14, 12, 3, mix(hx(roof), (0, 0, 0), 0.3))   # ridge
        if sign:
            self.rect(x + w // 2 - 7, top + 2, 14, 6, hx("2A1E14"))
            self.rect(x + w // 2 - 6, top + 3, 12, 4, hx("C8A040"))
            for k in range(2):
                self.rect(x + w // 2 - 4 + k * 5, top + 4, 3, 2, hx("2A1E14"))

    def fire_band(self, x0, x1, base, hmax):
        for x in range(x0, x1):
            fh = int(hmax * (0.4 + 0.6 * abs(math.sin(x * 0.37) * math.cos(x * 0.11))) * self.r.uniform(0.7, 1.0))
            for k in range(fh):
                c = hx("FFE070") if k < fh * 0.25 else hx("FF8A20") if k < fh * 0.65 else hx("B02210")
                self.px(x, base - k, c)

    def bamboo(self, x, col, light, top=0):
        for y in range(top, G):
            self.px(x, y, col)
            self.px(x + 1, y, light if y % 11 else mix(col, (0, 0, 0), 0.4))
        for j in range(top + 6, G - 10, 14):
            for k in range(5):
                self.px(x + 2 + k, j - k // 2, light)

    def rain(self, n, col):
        for _ in range(n):
            x, y = self.r.randrange(W), self.r.randrange(H)
            for k in range(4):
                self.px(x - k // 2, y + k, col)

    def snow(self, n, col):
        for _ in range(n):
            x, y = self.r.randrange(W), self.r.randrange(H)
            self.px(x, y, col)
            if self.r.random() < 0.3:
                self.px(x + 1, y, col)

    def smoke(self, x, y, n, col):
        for k in range(n):
            r = 2 + k * 0.8
            cx, cy = x - k * 2.2, y - k * 4
            for j in range(-int(r), int(r) + 1):
                for i in range(-int(r), int(r) + 1):
                    if i * i + j * j <= r * r and (i + j + k) % 2 == 0:
                        self.px(cx + i, cy + j, col)

    def save(self, name):
        os.makedirs(OUT, exist_ok=True)
        self.im.resize((W * 4, H * 4), Image.NEAREST).save(os.path.join(OUT, name + ".png"))


def cheongpung_night():
    c = C(1)
    c.sky(hx("1A0E16"), hx("4A1418"), hx("8A2A1E"))
    c.moon(300, 18, 9, hx("E04030"), hx("8A2020"))
    c.ridge(70, 18, 0.025, hx("2A1418"), 1.0)
    for x in range(4, W, 13):
        c.pine(x, 78, 9 + (x * 7) % 8, hx("1E1014"))
    c.ground(hx("3A2620"), hx("4A3028"))
    for k, x in enumerate((20, 96, 172, 250, 320)):
        c.thatch(x, G, 44, "6E4A34", "A07A3A", burn=0.3, fire=True)
        if k % 2 == 0:
            c.flag(x + 20, G - 46)
        c.smoke(x + 20, G - 34, 9, hx("2A1A1C"))
    c.save("01_cheongpung_night")


def janggyeonggak():
    c = C(2)
    c.sky(hx("0E0C14"), hx("16141E"), hx("1E1A24"))
    c.rect(0, 0, W, G, hx("1A1620"))
    for x in range(10, W, 46):                                   # sutra shelves
        c.rect(x, 18, 32, G - 18, hx("3A2618"))
        for y in range(22, G - 4, 9):
            c.rect(x + 2, y, 28, 7, hx("1A120C"))
            for k in range(x + 3, x + 29, 3):
                c.rect(k, y + 1, 2, 6, hx("8A6A3A") if (k + y) % 4 else hx("A83A2A"))
    wx = 180
    c.rect(wx, 14, 40, 30, hx("2A2A3A"))                         # moonlit lattice window
    for i in range(0, 41, 5):
        c.rect(wx + i, 14, 1, 30, hx("4A3424"))
    for j in range(0, 31, 5):
        c.rect(wx, 14 + j, 40, 1, hx("4A3424"))
    for y in range(44, G):                                       # moonbeam on the floor
        for x in range(wx - (y - 44) // 2, wx + 40 + (y - 44) // 3):
            if (x + y) % 2 == 0:
                c.px(x, y, hx("4A4A66"))
    c.ground(hx("2A1C14"), hx("341F16"))
    c.rect(150, G - 10, 30, 10, hx("4A3020"))                    # reading desk with an open sutra
    c.rect(156, G - 13, 18, 3, hx("D8C8A0"))
    c.save("02_shaolin_library")


def nahan_yard():
    c = C(3)
    c.sky(hx("140A12"), hx("3A1018"), hx("6A1E1E"))
    c.moon(60, 16, 8, hx("E04030"), hx("8A2020"))
    c.ridge(60, 16, 0.02, hx("24141C"), 2.0)
    c.tiled_hall(120, 70, 150, 26, wall="6A2A20", roof="2A2E38", pillar="5A1A14", sign=True)
    c.rect(0, 62, W, 8, hx("5A4A40"))                            # courtyard wall
    for x in range(0, W, 6):
        c.rect(x, 60, 5, 2, hx("2A2E38"))
    c.ground(hx("6A645C"), hx("585248"), rough=0.15)
    for x in range(0, W, 12):
        for y in range(G, H, 6):
            c.px(x + (y // 6 % 2) * 6, y, hx("4A4440"))
    c.rect(185, G - 12, 14, 12, hx("3A3A3A"))                    # incense burner
    c.rect(182, G - 14, 20, 3, hx("4A4A4A"))
    c.save("03_shaolin_yard")


def bamboo_hut():
    c = C(4)
    c.sky(hx("2A3438"), hx("3A4A48"), hx("4A5A52"))
    for x in range(0, W, 7):
        c.bamboo(x + c.r.randrange(4), hx("2A4A34"), hx("3A6A44"), top=c.r.randrange(10))
    c.ground(hx("3A3428"), hx("4A4232"))
    c.thatch(150, G, 52, "8A6A4A", "8A7448")
    c.rect(150 + 10, G - 13, 6, 12, hx("1A1410"))
    for x in range(140, 240, 2):
        c.px(x, G + 2, hx("5A5A6A"))                             # puddles
    c.rain(500, hx("8A9AA8"))
    c.save("04_bamboo_hut_rain")


def emei_snow():
    c = C(5)
    c.sky(hx("7A8494"), hx("A8B0BC"), hx("C8CED6"))
    c.ridge(66, 26, 0.02, hx("D8DEE6"), 0.5)
    c.ridge(76, 14, 0.04, hx("B8C0CC"), 2.0)
    c.tiled_hall(140, 74, 110, 22, wall="8A2A24", roof="4A5060", pillar="6A1E1A", sign=True)
    for x in range(140 - 8, 140 + 118):                          # snow on the roof
        c.px(x, 74 - 22 - 6, hx("F2F4F8"))
    c.rect(0, 70, W, 6, hx("8A8A8E"))
    for x in (40, 70, 300, 340):
        c.pine(x, 76, 18, hx("2A3A34"))
    c.ground(hx("E8ECF2"), hx("D0D6E0"), rough=0.12)
    c.snow(700, hx("FFFFFF"))
    c.save("05_emei_snow")


def namgung_fire():
    c = C(6)
    c.sky(hx("1A0A0E"), hx("4A1210"), hx("A0361A"))
    c.fire_band(0, W, 70, 34)
    c.rect(0, 58, W, 14, hx("4A403A"))                           # long manor wall
    for x in range(0, W, 6):
        c.rect(x, 56, 5, 2, hx("2A2A30"))
    c.tiled_hall(150, 80, 84, 30, wall="6A3A2A", roof="24262E", pillar="3A1E14", sign=True)   # gate with 南宮 board
    c.rect(182, 80 - 22, 20, 22, hx("1A1210"))                   # gate door, open
    c.flag(240, 36)
    c.fire_band(120, 170, 52, 20)
    c.fire_band(230, 290, 50, 24)
    c.ground(hx("4A3A30"), hx("5A4A3A"))
    c.rect(330, G - 22, 6, 22, hx("2A2020"))                     # back gate (far right)
    c.save("06_namgung_fire")


def xiha_station():
    c = C(7)
    c.sky(hx("1A0E16"), hx("40141A"), hx("70281E"))
    c.moon(330, 14, 7, hx("E04030"), hx("8A2020"))
    c.ridge(62, 30, 0.012, hx("2A1A20"), 1.5)                    # the hundred-thousand mountains
    c.ground(hx("6A5440"), hx("7A6048"), rough=0.12)
    # stable shed: posts, roof, empty stalls
    c.rect(90, G - 30, 160, 3, hx("4A3424"))
    for x in range(90, 251, 20):
        c.rect(x, G - 30, 2, 30, hx("3A2818"))
        c.rect(x + 2, G - 10, 18, 2, hx("5A4028"))
    for i in range(170):
        c.px(84 + i, G - 31 - (i % 3 == 0), hx("5A4A3A"))
    c.flag(250, G - 46)
    # broken cart
    c.rect(280, G - 12, 34, 4, hx("6A4A2A"))
    for (cx, cy) in ((286, G - 5), (308, G - 3)):
        for a in range(0, 360, 20):
            c.px(cx + 4 * math.cos(math.radians(a)), cy + 4 * math.sin(math.radians(a)), hx("3A2818"))
    c.rect(312, G - 16, 3, 3, hx("9A9AA0"))                      # an iron nail in the back board
    c.save("07_xiha_station")


def cheonma_hall():
    c = C(8)
    c.sky(hx("0A060A"), hx("140A10"), hx("1E1016"))
    c.rect(0, 0, W, G, hx("140C12"))
    for x in range(20, W, 56):                                   # red pillars
        c.rect(x, 0, 8, G, hx("5A1018"))
        c.rect(x + 1, 0, 2, G, hx("7A1A22"))
    c.rect(150, 20, 30, 26, hx("2A1016"))                        # tall window, red moon outside
    c.moon(165, 32, 7, hx("E04030"))
    for i in range(0, 31, 6):
        c.rect(150 + i, 20, 1, 26, hx("3A2A24"))
    c.rect(220, G - 8, 90, 8, hx("2A2026"))                      # dais and black throne
    c.rect(232, G - 14, 66, 6, hx("3A2E34"))
    c.rect(250, G - 46, 30, 32, hx("0E0A0E"))
    c.rect(246, G - 50, 38, 6, hx("1A1418"))
    c.rect(262, G - 54, 6, 4, hx("C8A040"))
    c.ground(hx("1E161A"), hx("261C20"))
    c.save("08_cheonma_hall")


def dark_room():
    c = C(9)
    c.rect(0, 0, W, H, hx("100C10"))
    c.rect(220, 16, 28, 28, hx("1A1622"))
    c.moon(234, 28, 6, hx("E04030"))
    for i in range(0, 29, 7):
        c.rect(220 + i, 16, 1, 28, hx("2A2026"))
    c.rect(120, G - 18, 90, 4, hx("3A2618"))                     # table
    c.rect(126, G - 14, 4, 14, hx("2A1C12")); c.rect(200, G - 14, 4, 14, hx("2A1C12"))
    c.rect(130, G - 21, 16, 3, hx("C8B890"))                     # torn sutra
    c.rect(152, G - 22, 18, 4, hx("8A2A2A"))                     # blood-stained sword manual
    c.rect(176, G - 23, 8, 5, hx("E8E8E8")); c.px(178, G - 21, hx("101010")); c.px(181, G - 21, hx("101010"))   # broken white mask
    c.rect(196, G - 24, 4, 6, hx("8A6A3A"))                      # incense burner
    for k in range(40):                                          # sandalwood smoke
        c.px(198 + math.sin(k * 0.4) * 3 + k * 0.3, G - 25 - k, hx("5A5060"))
    c.ground(hx("1A1418"), hx("201A1E"))
    c.save("09_dark_room")


if __name__ == "__main__":
    for f in (cheongpung_night, janggyeonggak, nahan_yard, bamboo_hut, emei_snow, namgung_fire, xiha_station, cheonma_hall, dark_room):
        f()
    print("backgrounds ->", OUT)

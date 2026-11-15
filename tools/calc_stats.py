"""Select-screen stats (1-5) computed from the real game data.

3 = average of the six regular fighters; each step is a fixed % away from that average,
so a 1 or a 5 means a real, large difference.
  POW  average damage of the 8 ground normals                       (step 10%)
  SPD  walk + dash speed                                            (step 6%)
  RNG  reach of the ground normals, +10% with a projectile, -10% without (step 10%)
  HP   health                                                       (step 6%)
  TEC  how hard the fighter is to pin down: fast startup and recovery of the normals,
       small hurtbox, and rush / uppercut / teleport / returning-fan specials (step 8%)

Movement and health come from Fighter.SetupCharacter (copied below: update FIGHTERS when
those numbers change). Prints the lines to paste into Screens.Init.
usage: python3 tools/calc_stats.py
"""
import math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# prefix: (hp, walk, dash, halfW, hurtH)   -- from Fighter.SetupCharacter (cheonma: playable version)
FIGHTERS = {
    "danwoo": (1000, 2.0, 3.2, 6, 30),
    "cheolsan": (1080, 1.4, 2.6, 8, 34),
    "muyeong": (930, 2.0, 3.0, 6, 30),
    "seolhwa": (880, 2.1, 3.3, 5, 29),
    "heukrim": (1000, 2.1, 3.3, 6, 31),
    "hongryeon": (960, 2.0, 3.2, 5, 29),
    "cheonma": (1000, 1.9, 3.0, 7, 32),
}
SLOT = {k: i for i, k in enumerate(FIGHTERS)}
NORMALS = ("lp", "hp", "lk", "hk", "clp", "chp", "clk", "chk")


def stat(dev, step):
    return max(1, min(5, math.floor(3 + dev / step + 0.5)))


def main():
    rows = [l.split() for l in open(os.path.join(ROOT, "data", "moves.txt")) if l.strip() and not l.startswith("#")]
    info = {}
    for c in FIGHTERS:
        n = [r for r in rows if r[0] == c and r[1] in NORMALS]
        sp = [r for r in rows if r[0] == c and r[1] in ("sp1", "sp2")]
        info[c] = dict(dmg=sum(int(r[6]) for r in n) / len(n),
                       reach=sum(int(r[11]) + int(r[13]) for r in n) / len(n),
                       su=sum(int(r[3]) for r in n) / len(n),
                       rec=sum(int(r[5]) for r in n) / len(n),
                       proj=any(r[17] in ("P", "PB", "TP") for r in sp),
                       types=[r[17] for r in sp])
    base = [c for c in FIGHTERS if c != "cheonma"]

    def avg(f):
        return sum(f(c) for c in base) / len(base)

    a_dmg = avg(lambda c: info[c]["dmg"]); a_reach = avg(lambda c: info[c]["reach"])
    a_su = avg(lambda c: info[c]["su"]); a_rec = avg(lambda c: info[c]["rec"])
    a_hp = avg(lambda c: FIGHTERS[c][0]); a_walk = avg(lambda c: FIGHTERS[c][1])
    a_dash = avg(lambda c: FIGHTERS[c][2]); a_body = avg(lambda c: FIGHTERS[c][3] * FIGHTERS[c][4])
    for c, (hp, walk, dash, hw, hh) in FIGHTERS.items():
        i = info[c]
        pw = stat(i["dmg"] / a_dmg - 1, 0.10)
        spd = stat(((walk / a_walk - 1) + (dash / a_dash - 1)) / 2, 0.06)
        rng = stat(i["reach"] / a_reach - 1 + (0.10 if i["proj"] else -0.10), 0.10)
        h = stat(hp / a_hp - 1, 0.06)
        tec = (0.5 * (a_su / i["su"] - 1) + 0.25 * (a_rec / i["rec"] - 1) + 0.5 * (a_body / (hw * hh) - 1)
               + 0.06 * sum(t in ("R", "U", "TP", "PB") for t in i["types"]) - 0.06)
        t = stat(tec, 0.08)
        k = SLOT[c]
        print(f"    rStat({k}, 0) = {pw}: rStat({k}, 1) = {spd}: rStat({k}, 2) = {rng}: rStat({k}, 3) = {h}: rStat({k}, 4) = {t}"
              f"   ' {c} total {pw + spd + rng + h + t}")


if __name__ == "__main__":
    main()

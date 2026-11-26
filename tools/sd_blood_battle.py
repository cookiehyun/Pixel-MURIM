"""Bake the historical troops' cloth colors into their own atlas entries."""
from pathlib import Path
from PIL import Image

HI = Path(__file__).resolve().parents[1] / "web/data/hi"
manifest = HI / "manifest.txt"
lines = manifest.read_text().splitlines()
source = {p[0]: p for line in lines if len(p := line.split()) >= 4 and p[1].endswith(".png")}
entries = {}
# Reuse the game's swordsman anatomy and planted-foot anchors. Mount the original
# cultist hood at the neck of each pose; the cutout clears the old ponytail.
costume = {
    # local name: (fighter pose, hood x/y, neck row, ponytail left of x, end row)
    "idle_0": ("idle_0", 8, 1, 11, 9, 14),
    "walk_0": ("walk_0", 9, 1, 11, 10, 14),
    "walk_1": ("walk_2", 10, 1, 11, 10, 14),
    "atk_0": ("lp_0", 8, 1, 12, 8, 15),
    "atk_1": ("lp_1", 12, 1, 11, 13, 14),
    "hit": ("hit_0", 9, 2, 11, 9, 17),
}

def red_uniform(image, hood, frame):
    _, hx, hy, neck, tail, end = costume[frame]
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, alpha = px[x, y]
            if not alpha:
                continue
            if (y < neck and x < hx + 12) or (y < end and x < tail):
                px[x, y] = (0, 0, 0, 0)
            elif 35 < r < 151 and b > r + 4 and g >= r:
                px[x, y] = (min(154, r + 28), g // 3, b // 3, alpha)
            elif neck <= y < image.height - 6 and x < hx + 12 and min(r, g, b) >= 140:
                px[x, y] = (int(r * .57), int(g * .16), int(b * .17), alpha)
    image.alpha_composite(hood, (hx, hy))

def clothing(role, rgb):
    r, g, b = rgb
    if role == "sect_sword" and b > r + 4 and 34 < r < 145 and g >= r:
        return (r // 3, min(157, g + 18), min(217, b + 53))
    if role == "sect_fist":
        if b > r * 1.45 and g > r * 1.25:
            return (r // 2, min(181, g + 34), g)
        if r > 125 and r > 2.7 * g and abs(b - g) < 24:
            return (r, int(r * .72), 47)
    return rgb

hood = Image.open(HI / source["sd_cultist.idle_0"][1]).convert("RGBA").crop((5, 0, 19, 13))
for y in range(hood.height):
    for x in range(hood.width):
        r, g, b, alpha = hood.getpixel((x, y))
        if alpha and max(r, g, b) >= 25 and not (r > g * 1.22 and g > b * 1.13):
            hood.putpixel((x, y), (min(193, 28 + r * 2), 9 + g // 3, 17 + b // 3, alpha))
hood = hood.resize((12, 12), Image.Resampling.NEAREST)
# The eye slit and folded mask keep the hood legible at field size.
for y in range(8, 12):
    for x in range(5, 12):
        r, g, b, a = hood.getpixel((x, y))
        if a and r > g * 1.16 and g > 55:
            hood.putpixel((x, y), (111, 26, 34, a) if y == 8 else (72, 18, 26, a))

for role, prefix, frames in [
    ("blood_acolyte", "muyeong", costume),
    ("sect_sword", "muyeong", ["idle_0", "lp_0", "lp_1", "guard", "hit_0", "down_1"]),
    ("sect_fist", "danwoo", ["idle_0", "lp_0", "lp_1", "guard", "hit_0", "down_1", "walk_0", "walk_2"])
]:
    directory = HI / "sd" / role
    directory.mkdir(exist_ok=True)
    for frame in frames:
        pose = costume[frame][0] if role == "blood_acolyte" else frame
        _, path, ax, ay, *_ = source[f"{prefix}.{pose}"]
        image = Image.open(HI / path).convert("RGBA")
        if role == "blood_acolyte":
            red_uniform(image, hood, frame)
        else:
            pixels = image.load()
            for y in range(image.height):
                for x in range(image.width):
                    *rgb, alpha = pixels[x, y]
                    if alpha:
                        pixels[x, y] = (*clothing(role, tuple(rgb)), alpha)
        target = directory / (frame + ".png")
        image.save(target)
        key = f"sd_{role}.{frame}"
        entries[key] = f"{key} {target.relative_to(HI)} {ax} {ay}"
# Preserve the atlas registration order, including other troops' frame IDs.
updated = [entries.pop(line.partition(" ")[0], line) for line in lines]
manifest.write_text("\n".join(updated + list(entries.values())) + "\n")

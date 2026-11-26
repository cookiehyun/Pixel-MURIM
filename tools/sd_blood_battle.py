"""Bake the historical troops' cloth colors into their own atlas entries."""
from pathlib import Path
from PIL import Image

HI = Path(__file__).resolve().parents[1] / "web/data/hi"
manifest = HI / "manifest.txt"
lines = manifest.read_text().splitlines()
source = {p[0]: p for line in lines if len(p := line.split()) >= 4 and p[1].endswith(".png")}
entries = {}
# Last hood row per pose. The raised sword changes the top of the bounding box.
hood = {"idle_0": 12, "walk_0": 12, "atk_0": 21, "atk_1": 12, "hit": 12}
def clothing(role, rgb, y, frame):
    r, g, b = rgb
    if role == "blood_acolyte":
        if max(rgb) < 25 or (r > g * 1.22 and g > b * 1.13) or min(rgb) > 128:
            return rgb  # outline, skin and blade
        if r > g * 1.65 and b > g * 1.3:
            return (201, 49, 38)  # sash
        if y <= hood[frame]:
            return (min(195, 25 + r * 2), 9 + g // 3, 17 + b // 3)
        return (min(136, 16 + r * 3 // 2), 11 + g // 3, 18 + b // 3)
    if role == "sect_sword" and b > r + 4 and 34 < r < 145 and g >= r:
        return (r // 3, min(157, g + 18), min(217, b + 53))
    if role == "sect_fist":
        if b > r * 1.45 and g > r * 1.25:
            return (r // 2, min(181, g + 34), g)
        if r > 125 and r > 2.7 * g and abs(b - g) < 24:
            return (r, int(r * .72), 47)
    return rgb

for role, prefix, frames in [
    ("blood_acolyte", "sd_cultist", hood),
    ("sect_sword", "muyeong", ["idle_0", "lp_0", "lp_1", "guard", "hit_0", "down_1"]),
    ("sect_fist", "danwoo", ["idle_0", "lp_0", "lp_1", "guard", "hit_0", "down_1", "walk_0", "walk_2"])
]:
    directory = HI / "sd" / role
    directory.mkdir(exist_ok=True)
    for frame in frames:
        _, path, ax, ay, *_ = source[f"{prefix}.{frame}"]
        image = Image.open(HI / path).convert("RGBA")
        pixels = image.load()
        for y in range(image.height):
            for x in range(image.width):
                *rgb, alpha = pixels[x, y]
                if alpha:
                    pixels[x, y] = (*clothing(role, tuple(rgb), y, frame), alpha)
        target = directory / (frame + ".png")
        image.save(target)
        key = f"sd_{role}.{frame}"
        entries[key] = f"{key} {target.relative_to(HI)} {ax} {ay}"
keep = [line for line in lines if line.partition(" ")[0] not in entries]
manifest.write_text("\n".join(keep + list(entries.values())) + "\n")

"""Pose the shipped gangsi walk sprite for the prologue, preserving its native pixel size and palette."""
from math import cos, sin, radians
from pathlib import Path

from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'web/data/hi/sd/gangsi'
MANIFEST = ROOT / 'web/data/hi/manifest.txt'
source = Image.open(DIR / 'walk_0.png').convert('RGBA')


# Each piece retains its original pixel coordinates and overlaps its neighbour at the joint.
def piece(points):
    mask = Image.new('L', source.size)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    art = source.copy()
    art.putalpha(ImageChops.multiply(source.getchannel('A'), mask))
    return art


hair = piece([(0, 0), (21, 0), (21, 13), (17, 15), (11, 16), (6, 20), (2, 19), (0, 16)])
chest = piece([(7, 15), (15, 15), (17, 20), (13, 24), (15, 27), (5, 28), (5, 23)])
arm = piece([(10, 16), (16, 16), (20, 16), (22, 13), (25, 14), (25, 19), (20, 21), (13, 20), (10, 19)])
thigh = piece([(5, 24), (11, 24), (11, 29), (8, 31), (3, 31), (2, 30)])
shin = piece([(3, 29), (8, 29), (6, 32), (7, 35), (0, 35), (0, 32)])
far_thigh = piece([(10, 24), (15, 24), (16, 29), (15, 32), (11, 32), (11, 29)])
far_shin = piece([(11, 30), (16, 30), (16, 32), (19, 32), (19, 35), (11, 35)])


def project(src, dest, angle, p):
    c, s = cos(radians(angle)), sin(radians(angle))
    dx, dy = p[0] - src[0], p[1] - src[1]
    return dest[0] + dx * c - dy * s, dest[1] + dx * s + dy * c


# Degrees of torso, neck, arms, near thigh/shin and far thigh/shin.
# The hip stays over the same world point as weight shifts from back to knee to feet.
poses = [
    (-80, -74,  5, -115, -114, -77, -70),
    (-72, -59, -36, -125, -86, -98, -38),
    (-35, -14, -25, -122, -104, -118, -26),
    ( 17,  8, 31, -103, -18, 53, 79),
    (  7,  3, 12, -25, 16, 22, -22),
]
hip = (10, 25)
pelvis = (48, 48)
entries = {}
# Two in-betweens per joint transition. The last transition settles directly
# into the unmodified walk_0 pose.
keyframes = poses + [(0, 0, 0, 0, 0, 0, 0)]
frames = []
for i, (start, end) in enumerate(zip(keyframes, keyframes[1:])):
    for suffix, fraction in [('', 0), ('a', 1/3), ('b', 2/3)]:
        angles = [a + (b - a) * fraction for a, b in zip(start, end)]
        frames.append((f'rise_{i}{suffix}', angles, i >= 1))
for name, (torso, neck, reach, leg, knee, back_leg, back_knee), eyes_open in frames:
    canvas = Image.new('RGBA', (96, 96))

    def place(image, joint, at, angle):
        c, s = cos(radians(angle)), sin(radians(angle))
        inverse = (c, s, joint[0] - c * at[0] - s * at[1],
                   -s, c, joint[1] + s * at[0] - c * at[1])
        posed = image.transform(canvas.size, Image.Transform.AFFINE, inverse, Image.Resampling.NEAREST)
        canvas.alpha_composite(posed)

    def limb(upper, lower, root, hinge, angle, bend):
        at = project(hip, pelvis, torso, root)
        place(upper, root, at, angle)
        place(lower, hinge, project(root, at, angle, hinge), bend)

    limb(far_thigh, far_shin, (13, 25), (14, 31), back_leg, back_knee)
    limb(thigh, shin, (8, 25), (5, 30), leg, knee)
    place(chest, hip, pelvis, torso)
    place(arm, (12, 17), project(hip, pelvis, torso, (12, 17)), reach)
    neck_at = project(hip, pelvis, torso, (12, 15))
    place(hair, (12, 15), neck_at, neck)
    if eyes_open:
        eye = project((12, 15), neck_at, neck, (16, 11))
        ex, ey = (round(c) for c in eye)
        canvas.putpixel((ex, ey), (224, 60, 43, 255))
        if name.startswith("rise_1"):
            canvas.putpixel((ex - 1, ey), (160, 30, 34, 255))
    box = canvas.getbbox()
    frame = canvas.crop(box)
    frame.save(DIR / (name + '.png'))
    # walk_0's ground anchor is two art pixels to the right of its hip.
    ax = pelvis[0] + 2 - box[0]
    sprite = 'sd_gangsi.' + name
    entries[sprite] = f'{sprite} sd/gangsi/{name}.png {ax} {frame.height - 1}'

lines = [line for line in MANIFEST.read_text().splitlines() if line.partition(' ')[0] not in entries]
MANIFEST.write_text('\n'.join(lines + list(entries.values())) + '\n')

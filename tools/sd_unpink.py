"""Take the magenta background back out of translucent effects (a glow, a light wall) that an AI sheet drew
over it, so they pixelize white / gold instead of pink.

  python3 tools/sd_unpink.py <in picture> <out picture>

- a pinkish pixel (blue well above green) is read as effect colour mixed with the background:
  weak ones (mostly background) become background, the rest get the background taken out again
"""
import sys
import numpy as np
from PIL import Image

a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(float)
M = np.median(a[2:30, 2:30].reshape(-1, 3), axis=0)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
pink = (b > g + 30) & (r > 120)
alpha = np.clip(g / 225.0, 0, 1)                       # the effect tones are light (green ~225); the background has none
drop = pink & (alpha < 0.45)
fix = pink & ~drop
al = np.maximum(alpha, 1e-3)[..., None]
un = np.clip((a - (1 - al) * M) / al, 0, 255)
un[..., 2] = np.minimum(un[..., 2], un[..., 1])        # what is left of the pink leans gold, never violet
out = a.copy()
out[fix] = un[fix]
out[drop] = M
Image.fromarray(out.astype(np.uint8)).save(sys.argv[2], lossless=True)
print(f"{int(fix.sum())} pixels restored, {int(drop.sum())} dropped")

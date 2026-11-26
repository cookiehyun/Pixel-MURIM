// Irreversible burn times, sampled on the map's two-pixel art grid.
// Coordinates refer to the original, fixed 576 × 300 viewport of scroll_map.
import * as R from "./renderer";
import { RGB } from "./util";

const W = R.PHYS_W, H = R.PHYS_H, cols = W / 2;
const lastPaper = 166;
export const SCROLL_BURN_END = lastPaper + 40; // includes the flight of the last flakes
const towns = [[151, 165, 0], [427, 73, 13], [135, 235, 31], [464, 188, 46], [377, 143, 66]];
const soot = [RGB(34, 21, 22), RGB(52, 30, 26), RGB(67, 39, 29), RGB(87, 49, 31)];
const coals = [RGB(113, 37, 28), RGB(167, 49, 25), RGB(210, 70, 24), RGB(242, 118, 37)];
const gold = RGB(255, 175, 66);
const ash = [RGB(83, 68, 64), RGB(58, 49, 49), RGB(38, 34, 36), RGB(18, 16, 19)];

function hash(x: number, y: number): number {
  let n = Math.imul(x + 17, 1597334677) ^ Math.imul(y + 31, 3812015801);
  n = Math.imul(n ^ (n >>> 16), 2246822507);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

// Low-frequency folds split the flame front into fingers; fine grain chips its rim.
function noise(x: number, y: number, span: number): number {
  const i = Math.floor(x / span), j = Math.floor(y / span);
  const u = x / span - i, v = y / span - j;
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v)
       + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}

function makeMask(pic: Int32Array, width: number) {
  const arrival = new Int16Array(cols * H / 2).fill(-1);
  const grain = new Uint8Array(arrival.length);
  const flakes: { x: number; y: number; tick: number; seed: number }[] = [];
  let latest = 0;
  for (let x = 0; x < W; x += 2) {
    // Trace the parchment's torn upper and lower edges in the original art.
    // Its wooden rollers and the tabletop lose their light as the sheet disappears.
    let top = 16, bottom = H - 1;
    const isPaper = (y: number) => (pic[y * width + x] & 255) > 119;
    while (top < 38 && !isPaper(top)) top++;
    while (bottom > 282 && !isPaper(bottom)) bottom--;
    for (let y = top + (top % 2); y <= bottom; y += 2) {
      if (x < 55 - .036 * y || x > 515 + .053 * y) continue;
      const k = (y / 2) * cols + x / 2;
      const fiber = hash(x, y);
      grain[k] = Math.floor(fiber * 256);
      const ripple = 34 * (noise(x, y, 52) - .5) + 19 * (noise(x, y, 17) - .5) + 7 * (noise(x, y, 6) - .5) + 3 * (fiber - .5);
      let first = Infinity;
      for (const [sx, sy, delay] of towns) {
        const dx = (x - sx) * .91, dy = (y - sy) * 1.12;
        const distance = Math.sqrt(dx * dx + dy * dy);
        first = Math.min(first, delay + distance * .67 + ripple * Math.min(1, distance / 32));
      }
      arrival[k] = Math.round(first);
      latest = Math.max(latest, arrival[k]);
    }
  }
  for (let k = 0; k < arrival.length; k++) {
    if (arrival[k] < 0) continue;
    arrival[k] = Math.round(arrival[k] * (lastPaper - 12) / latest);
    // Each site emits once, precisely as this piece of the sheet gives way.
    if (hash(k, 192) < .035) flakes.push({
      x: k % cols * 2, y: Math.floor(k / cols) * 2, tick: arrival[k] + 8, seed: grain[k],
    });
  }
  return { arrival, grain, flakes, overlay: new Int32Array(W * H) };
}

let mask: ReturnType<typeof makeMask> | undefined;

export function drawScrollBurn(t: number, pic: Int32Array, width: number): void {
  if (t >= SCROLL_BURN_END) { R.flashScreen(0); return; }
  mask ??= makeMask(pic, width);
  const { arrival, grain, flakes, overlay } = mask;
  const light = Math.min(1, Math.max(0, (lastPaper - t) / 74));
  overlay.fill(-1);
  for (let k = 0; k < arrival.length; k++) {
    const age = t - arrival[k];
    const x = k % cols * 2, y = Math.floor(k / cols) * 2, idx = y * W + x;
    if (arrival[k] < 0) {
      if (light < 1) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const c = pic[(y + j) * width + x + i];
        overlay[idx + j * W + i] = RGB((c & 255) * light, ((c >> 8) & 255) * light, (c >> 16) * light);
      }
      continue;
    }
    if (age < 0) continue;
    const g = grain[k];
    let c = 0; // the dark space behind a burnt-through part of the scroll
    if (age < 5) c = soot[g >> 6];
    else if (age < 10) c = (g + age) % 9 === 0 ? gold : coals[(g + (t >> 1)) & 3];
    else if (age < 12) c = soot[g >> 7];
    overlay[idx] = overlay[idx + 1] = overlay[idx + W] = overlay[idx + W + 1] = c;
  }
  R.blitPhys(overlay, W, H, 0);

  for (const f of flakes) {
    const age = t - f.tick;
    if (age < -4 || age >= 33) continue;
    if (age <= 5) {
      // A tapered pixel flame rises from a live patch, then breaks into ash.
      const height = 3 + Math.round((1 - Math.abs(age) / 6) * (4 + f.seed % 11));
      for (let h = 0; h < height; h += 2) {
        const dx = Math.round(Math.sin((t + f.seed) * .48 + h * .19) * h * .15);
        R.physRect(f.x + dx, f.y - h, h < height / 2 ? 4 : 2, 2, h < 4 ? gold : coals[h < height * .7 ? 3 : 1]);
      }
    } else {
      const drift = age - 5, life = 13 + f.seed % 15;
      if (drift >= life) continue;
      const x = f.x + drift * (.28 + (f.seed % 9) * .09) + 2 * Math.sin(drift * .3 + f.seed);
      const y = f.y - drift * (1 + (f.seed % 5) * .18);
      const c = ash[Math.floor(drift * 4 / life)];
      // Larger chips peel away with one lit edge and crumble into two flecks.
      if (f.seed % 7 === 0) {
        const split = Math.max(0, drift - 8) * .3;
        R.physRect(x + 1 + split, y - 2, drift < 10 ? 5 : 2, 2, drift < 6 ? coals[0] : c);
        R.physRect(x - split, y + 1, drift < 9 ? 5 : 2, 2, c);
      }
      R.physRect(x, y, drift < 7 ? 4 : 2, 2, c);
      if (drift < 9) R.physRect(x + 2, y - 1, 2, 1, drift < 3 ? coals[1] : c);
    }
  }
}

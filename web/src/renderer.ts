// Port of Renderer.bas: a 192x100 back buffer, drawn to a canvas once per frame.
import { D } from "./data";
import { RGB } from "./util";

export const SCREEN_W = 192;
export const SCREEN_H = 100;
export const GROUND_Y = 88;

let back = new Int32Array(SCREEN_W * SCREEN_H);
const bg = new Int32Array(SCREEN_W * SCREEN_H);
const bgDark = new Int32Array(SCREEN_W * SCREEN_H);
let ctx: CanvasRenderingContext2D | null = null;
let img: ImageData | null = null;
const altCache = new Map<number, Int32Array>();

export function init(canvas: HTMLCanvasElement): void {
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  ctx = canvas.getContext("2d")!;
  img = ctx.createImageData(SCREEN_W, SCREEN_H);
  setStage(0);
}

export function beginFrame(dark = false): void {
  back.set(dark ? bgDark : bg);
}

/** Copy the finished frame to the canvas (VBA colors are r | g<<8 | b<<16, the same byte order as RGBA). */
export function flush(): void {
  if (!ctx || !img) return;
  const px = new Uint32Array(img.data.buffer);
  for (let k = 0; k < back.length; k++) px[k] = (back[k] | 0xff000000) >>> 0;
  ctx.putImageData(img, 0, 0);
}

export function backPixel(x: number, y: number): number {
  return back[x + y * SCREEN_W];
}

export function putPixel(x: number, y: number, color: number): void {
  x = Math.trunc(x); y = Math.trunc(y);
  if (x >= 0 && x < SCREEN_W && y >= 0 && y < SCREEN_H) back[x + y * SCREEN_W] = color;
}

export function fillRect(x: number, y: number, w: number, h: number, color: number): void {
  let x0 = Math.trunc(x), y0 = Math.trunc(y);
  let x1 = x0 + Math.trunc(w) - 1, y1 = y0 + Math.trunc(h) - 1;
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > SCREEN_W - 1) x1 = SCREEN_W - 1;
  if (y1 > SCREEN_H - 1) y1 = SCREEN_H - 1;
  if (x1 < x0) return;
  for (let j = y0; j <= y1; j++) back.fill(color, j * SCREEN_W + x0, j * SCREEN_W + x1 + 1);
}

export function drawRectOutline(x: number, y: number, w: number, h: number, color: number): void {
  if (w <= 0 || h <= 0) return;
  fillRect(x, y, w, 1, color);
  fillRect(x, y + h - 1, w, 1, color);
  fillRect(x, y, 1, h, color);
  fillRect(x + w - 1, y, 1, h, color);
}

function pixels(id: number, alt: boolean): ArrayLike<number> {
  if (!alt) return D.SprPix;
  let a = altCache.get(id);
  if (!a) {
    const off = D.SprOff[id], n = D.SprW[id] * D.SprH[id];
    a = new Int32Array(D.SprPix.length).fill(-1);
    for (let k = off; k < off + n; k++) a[k] = D.SprPix[k] < 0 ? -1 : altColor(D.SprPix[k]);
    altCache.set(id, a);
  }
  return a;
}

/** Draw sprite with its anchor (ground point under the hip) on (x, y). flip mirrors; tint >= 0 paints it one color. */
export function drawSprite(id: number, x: number, y: number, flip: boolean, tint = -1, alt = false): void {
  const w = D.SprW[id], h = D.SprH[id], ax = D.SprAX[id], ay = D.SprAY[id], off = D.SprOff[id];
  const pix = pixels(id, alt);
  x = Math.trunc(x); y = Math.trunc(y);
  for (let sy = 0; sy < h; sy++) {
    const py = y - ay + sy;
    if (py < 0 || py >= SCREEN_H) continue;
    for (let sx = 0; sx < w; sx++) {
      const c = pix[off + sy * w + sx];
      if (c < 0) continue;
      const px = flip ? x + ax - sx : x - ax + sx;
      if (px >= 0 && px < SCREEN_W) back[px + py * SCREEN_W] = tint >= 0 ? tint : c;
    }
  }
}

/** Sprite enlarged k times, clipped to (cx0, cy0)-(cx1, cy1) (select screens). */
export function drawSpriteScaled(id: number, x: number, y: number, flip: boolean, k: number,
  cx0: number, cy0: number, cx1: number, cy1: number, tint = -1, alt = false): void {
  const w = D.SprW[id], h = D.SprH[id], ax = D.SprAX[id], ay = D.SprAY[id], off = D.SprOff[id];
  const pix = pixels(id, alt);
  if (cx0 < 0) cx0 = 0;
  if (cy0 < 0) cy0 = 0;
  if (cx1 > SCREEN_W - 1) cx1 = SCREEN_W - 1;
  if (cy1 > SCREEN_H - 1) cy1 = SCREEN_H - 1;
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      let c = pix[off + sy * w + sx];
      if (c < 0) continue;
      if (tint >= 0) c = tint;
      const px = flip ? x + (ax - sx) * k - (k - 1) : x + (sx - ax) * k;
      const py = y + (sy - ay) * k;
      for (let j = py; j < py + k; j++) {
        if (j < cy0 || j > cy1) continue;
        for (let i = px; i < px + k; i++) if (i >= cx0 && i <= cx1) back[i + j * SCREEN_W] = c;
      }
    }
  }
}

/** Alternate colors for a mirror match: clothes turned 150 degrees in hue, skin / greys / outline kept. */
export function altColor(c: number): number {
  let r = (c & 255) / 255, g = ((c >> 8) & 255) / 255, b = ((c >> 16) & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, v = mx;
  const s = mx > 0 ? d / mx : 0;
  if (s < 0.2 || v < 0.16) return c;
  let h: number;
  if (mx === r) h = 60 * ((g - b) / d);
  else if (mx === g) h = 60 * ((b - r) / d) + 120;
  else h = 60 * ((r - g) / d) + 240;
  if (h < 0) h += 360;
  if (h >= 8 && h <= 45 && s < 0.62 && v > 0.45) return c;
  h += 150;
  if (h >= 360) h -= 360;
  const i = Math.floor(h / 60), f = h / 60 - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return RGB(r * 255, g * 255, b * 255);
}

function darken(c: number): number {
  return RGB((c & 255) * 0.3, ((c >> 8) & 255) * 0.3, ((c >> 16) & 255) * 0.3 + 20);
}

export function setStage(k: number): void {
  if (k < D.StageCount && D.StageW === SCREEN_W && D.StageH === SCREEN_H) {
    bg.set(D.StagePix[k]);
  } else {
    for (let y = 0; y < SCREEN_H; y++) {
      const t = y / (GROUND_Y - 1);
      const c = y < GROUND_Y ? RGB(40 + 60 * t, 60 + 80 * t, 120 + 90 * t) : RGB(60, 45, 35);
      bg.fill(c, y * SCREEN_W, (y + 1) * SCREEN_W);
    }
  }
  for (let k2 = 0; k2 < bg.length; k2++) bgDark[k2] = darken(bg[k2]);
}

/** Small preview of stage k (1/stp size) with its top-left at (x0, y0). */
export function drawStageThumb(k: number, x0: number, y0: number, stp: number): void {
  const pix = D.StagePix[k];
  for (let y = 0; y < Math.trunc(SCREEN_H / stp); y++)
    for (let x = 0; x < Math.trunc(SCREEN_W / stp); x++) putPixel(x0 + x, y0 + y, pix[x * stp + y * stp * D.StageW]);
}

/** Screen pixels covered by a sprite (for outlines and auras). */
export function spriteMask(id: number, x: number, y: number, flip: boolean): Set<number> {
  const w = D.SprW[id], h = D.SprH[id], ax = D.SprAX[id], ay = D.SprAY[id], off = D.SprOff[id];
  const m = new Set<number>();
  x = Math.trunc(x); y = Math.trunc(y);
  for (let sy = 0; sy < h; sy++)
    for (let sx = 0; sx < w; sx++) {
      if (D.SprPix[off + sy * w + sx] < 0) continue;
      const px = flip ? x + ax - sx : x - ax + sx, py = y - ay + sy;
      m.add(px + py * 1024);
    }
  return m;
}

/** A pale ghost of a sprite: white outline, body blended toward ice blue. */
export function drawGhost(id: number, x: number, y: number, flip: boolean): void {
  const m = spriteMask(id, x, y, flip);
  for (const k of m) {
    const px = ((k % 1024) + 1024) % 1024, py = Math.round((k - px) / 1024);
    if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) continue;
    const edge = !m.has(k + 1) || !m.has(k - 1) || !m.has(k + 1024) || !m.has(k - 1024);
    if (edge) { back[px + py * SCREEN_W] = RGB(255, 255, 255); continue; }
    const b = back[px + py * SCREEN_W];
    const r = (b & 255) * 0.45 + 150 * 0.55, g = ((b >> 8) & 255) * 0.45 + 190 * 0.55, bl = ((b >> 16) & 255) * 0.45 + 255 * 0.55;
    back[px + py * SCREEN_W] = RGB(Math.trunc(r), Math.trunc(g), Math.trunc(bl));
  }
}

/** Fill the whole frame with one color (white flash on a finishing blow). */
export function flashScreen(color: number): void { back.fill(color); }

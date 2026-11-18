// Port of Renderer.bas, drawn at three times the resolution.
// The game still thinks in a 192x100 world (SCREEN_W / SCREEN_H: simulation, hitboxes, menus, online).
// The back buffer is 576x300: classic sprites and all drawing calls become 3x3 blocks, while
// hi-res sprites (D.SprHi, PNG art) draw each art pixel as a HI x HI block (2x2: ~56 px tall art
// fills the same height as a 38 px classic sprite).
import { D } from "./data";
import { RGB } from "./util";

export const SCREEN_W = 192;
export const SCREEN_H = 100;
export const GROUND_Y = 88;
export const PX = 3;                                  // physical pixels per world pixel
export const HI = 2;                                  // physical pixels per hi-res art pixel
const PW = SCREEN_W * PX, PH = SCREEN_H * PX;

let back = new Int32Array(PW * PH);
const bg = new Int32Array(PW * PH);
const bgDark = new Int32Array(PW * PH);
let ctx: CanvasRenderingContext2D | null = null;
let img: ImageData | null = null;
const altCache = new Map<number, Int32Array>();

export function init(canvas: HTMLCanvasElement): void {
  canvas.width = PW;
  canvas.height = PH;
  ctx = canvas.getContext("2d")!;
  img = ctx.createImageData(PW, PH);
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
  return back[x * PX + y * PX * PW];
}

function block(px: number, py: number, color: number, n = PX): void {
  if (px < 0 || py < 0 || px > PW - n || py > PH - n) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const X = px + i, Y = py + j;
      if (X >= 0 && X < PW && Y >= 0 && Y < PH) back[X + Y * PW] = color;
    }
    return;
  }
  for (let j = 0; j < n; j++) back.fill(color, px + (py + j) * PW, px + n + (py + j) * PW);
}

export function putPixel(x: number, y: number, color: number): void {
  x = Math.trunc(x); y = Math.trunc(y);
  if (x >= 0 && x < SCREEN_W && y >= 0 && y < SCREEN_H) block(x * PX, y * PX, color);
}

export function fillRect(x: number, y: number, w: number, h: number, color: number): void {
  let x0 = Math.trunc(x), y0 = Math.trunc(y);
  let x1 = x0 + Math.trunc(w) - 1, y1 = y0 + Math.trunc(h) - 1;
  if (x0 < 0) x0 = 0;
  if (y0 < 0) y0 = 0;
  if (x1 > SCREEN_W - 1) x1 = SCREEN_W - 1;
  if (y1 > SCREEN_H - 1) y1 = SCREEN_H - 1;
  if (x1 < x0) return;
  for (let j = y0 * PX; j < (y1 + 1) * PX; j++) back.fill(color, j * PW + x0 * PX, j * PW + (x1 + 1) * PX);
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

/** Draw sprite with its anchor (ground point under the hip) on world point (x, y). flip mirrors; tint >= 0 paints it one color. */
export function drawSprite(id: number, x: number, y: number, flip: boolean, tint = -1, alt = false): void {
  const w = D.SprW[id], h = D.SprH[id], ax = D.SprAX[id], ay = D.SprAY[id], off = D.SprOff[id];
  const pix = pixels(id, alt);
  x = Math.trunc(x); y = Math.trunc(y);
  if (D.SprHi[id]) {                                  // hi-res art: HI x HI screen pixels per art pixel
    const X = x * PX + (PX - HI >> 1), Y = y * PX + PX - HI;   // anchor pixel sits on the world pixel
    for (let sy = 0; sy < h; sy++) {
      const py = Y + (sy - ay) * HI;
      if (py <= -HI || py >= PH) continue;
      for (let sx = 0; sx < w; sx++) {
        const c = pix[off + sy * w + sx];
        if (c < 0) continue;
        const px = flip ? X + (ax - sx) * HI : X + (sx - ax) * HI;
        if (px > -HI && px < PW) block(px, py, tint >= 0 ? tint : c, HI);
      }
    }
    return;
  }
  for (let sy = 0; sy < h; sy++) {
    const py = y - ay + sy;
    if (py < 0 || py >= SCREEN_H) continue;
    for (let sx = 0; sx < w; sx++) {
      const c = pix[off + sy * w + sx];
      if (c < 0) continue;
      const px = flip ? x + ax - sx : x - ax + sx;
      if (px >= 0 && px < SCREEN_W) block(px * PX, py * PX, tint >= 0 ? tint : c);
    }
  }
}

/** Sprite enlarged k times, clipped to world rect (cx0, cy0)-(cx1, cy1) (select screens). */
export function drawSpriteScaled(id: number, x: number, y: number, flip: boolean, k: number,
  cx0: number, cy0: number, cx1: number, cy1: number, tint = -1, alt = false): void {
  const w = D.SprW[id], h = D.SprH[id], ax = D.SprAX[id], ay = D.SprAY[id], off = D.SprOff[id];
  const pix = pixels(id, alt);
  const B = D.SprHi[id] ? k * HI : k * PX;            // screen pixels per sprite pixel
  const X0 = Math.max(0, cx0 * PX), Y0 = Math.max(0, cy0 * PX);
  const X1 = Math.min(PW - 1, cx1 * PX + PX - 1), Y1 = Math.min(PH - 1, cy1 * PX + PX - 1);
  const bx = x * PX, by = y * PX + (D.SprHi[id] ? (PX - HI) * k : 0);
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      let c = pix[off + sy * w + sx];
      if (c < 0) continue;
      if (tint >= 0) c = tint;
      const px = flip ? bx + (ax - sx) * B - (D.SprHi[id] ? 0 : B - PX) : bx + (sx - ax) * B;
      const py = by + (sy - ay) * B;
      for (let j = py; j < py + B; j++) {
        if (j < Y0 || j > Y1) continue;
        for (let i = px; i < px + B; i++) if (i >= X0 && i <= X1) back[i + j * PW] = c;
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
  for (let y = 0; y < SCREEN_H; y++) {
    for (let x = 0; x < SCREEN_W; x++) {
      let c: number;
      if (k < D.StageCount && D.StageW === SCREEN_W && D.StageH === SCREEN_H) c = D.StagePix[k][x + y * SCREEN_W];
      else {
        const t = y / (GROUND_Y - 1);
        c = y < GROUND_Y ? RGB(40 + 60 * t, 60 + 80 * t, 120 + 90 * t) : RGB(60, 45, 35);
      }
      for (let j = 0; j < PX; j++) bg.fill(c, x * PX + (y * PX + j) * PW, (x + 1) * PX + (y * PX + j) * PW);
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
    if (edge) { block(px * PX, py * PX, RGB(255, 255, 255)); continue; }
    const b = back[px * PX + py * PX * PW];
    const r = (b & 255) * 0.45 + 150 * 0.55, g = ((b >> 8) & 255) * 0.45 + 190 * 0.55, bl = ((b >> 16) & 255) * 0.45 + 255 * 0.55;
    block(px * PX, py * PX, RGB(Math.trunc(r), Math.trunc(g), Math.trunc(bl)));
  }
}

/** Fill the whole frame with one color (white flash on a finishing blow). */
export function flashScreen(color: number): void { back.fill(color); }

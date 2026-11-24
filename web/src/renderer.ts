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

export function block(px: number, py: number, color: number, n = PX): void {
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

// palette variants: 1 = mirror-match colours, 2.. = story stand-ins (a known fighter recoloured as someone
// else until that character has art); +SKIN_DIM darkens any of them (people in the back row of a scene)
export const SKIN_ALT = 1, SKIN_SHADOW = 2, SKIN_PALE = 3, SKIN_BLOOD = 4, SKIN_IRON = 5, SKIN_CORPSE = 6, SKIN_VIOLET = 7,
  SKIN_GOLD = 8, SKIN_CULT = 9, SKIN_DIM = 16;
const skinCache = new Map<number, Int32Array>();

function lum(c: number): number { return ((c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11) / 255; }
function mixRGB(c: number, r: number, g: number, b: number, a: number): number {
  return RGB((c & 255) + (r - (c & 255)) * a, ((c >> 8) & 255) + (g - ((c >> 8) & 255)) * a, ((c >> 16) & 255) + (b - ((c >> 16) & 255)) * a);
}
function shade(l: number, r: number, g: number, b: number): number { return RGB(r * l, g * l, b * l); }

export function skinColor(c: number, skin: number): number {
  const l = lum(c);
  switch (skin & 15) {
    case SKIN_ALT: c = altColor(c); break;
    case SKIN_SHADOW: c = mixRGB(shade(l * 1.1, 150, 120, 200), c & 255, (c >> 8) & 255, (c >> 16) & 255, 0.25); break;
    case SKIN_PALE: c = mixRGB(c, 236, 232, 226, 0.45); break;
    case SKIN_BLOOD: c = shade(Math.min(1, l * 1.25), 255, 70, 60); break;
    case SKIN_IRON: c = mixRGB(shade(Math.min(1, l * 1.1), 190, 200, 215), c & 255, (c >> 8) & 255, (c >> 16) & 255, 0.2); break;
    case SKIN_CORPSE: c = shade(Math.min(1, l * 1.05), 150, 170, 140); break;
    case SKIN_VIOLET: c = mixRGB(c, 150, 80, 190, 0.45); break;
    case SKIN_GOLD: c = mixRGB(c, 230, 190, 110, 0.35); break;
    case SKIN_CULT: c = (c & 255) > 200 && ((c >> 8) & 255) > 150 ? c : shade(Math.min(1, l * 0.75 + 0.04), 120, 96, 110); break;   // black-robed cultist, skin kept
  }
  if (skin & SKIN_DIM) c = RGB((c & 255) * 0.55, ((c >> 8) & 255) * 0.55, ((c >> 16) & 255) * 0.6 + 8);
  return c;
}

function pixels(id: number, alt: boolean | number): ArrayLike<number> {
  const skin = alt === true ? SKIN_ALT : alt === false ? 0 : alt;
  if (!skin) return D.SprPix;
  const key = id * 64 + skin;
  let a = skinCache.get(key);
  if (!a) {
    const off = D.SprOff[id], n = D.SprW[id] * D.SprH[id];
    a = new Int32Array(D.SprPix.length).fill(-1);
    for (let k = off; k < off + n; k++) a[k] = D.SprPix[k] < 0 ? -1 : skinColor(D.SprPix[k], skin);
    skinCache.set(key, a);
  }
  return a;
}

// hi-res art scale: SD story art is drawn at 2 in the field and at 3 (one art pixel per world pixel, the classic
// fighters' size) when it fights in the fight engine
let mHiS = 0;                                          // 0: each sprite's own scale
export function setHiScale(n: number): void { mHiS = n; }

/** Draw sprite with its anchor (ground point under the hip) on world point (x, y). flip mirrors; tint >= 0 paints it one color. */
export function drawSprite(id: number, x: number, y: number, flip: boolean, tint = -1, alt: boolean | number = false): void {
  const w = D.SprW[id], h = D.SprH[id], ax = D.SprAX[id], ay = D.SprAY[id], off = D.SprOff[id];
  const pix = pixels(id, alt);
  x = Math.trunc(x); y = Math.trunc(y);
  if (D.SprHi[id]) {                                  // hi-res art: S x S screen pixels per art pixel (S = HI, or 3 for SD fighters in a fight)
    const S = mHiS || D.SprHiS[id] || HI, X = x * PX + (PX - S >> 1), Y = y * PX + PX - S;   // anchor pixel sits on the world pixel
    for (let sy = 0; sy < h; sy++) {
      const py = Y + (sy - ay) * S;
      if (py <= -S || py >= PH) continue;
      for (let sx = 0; sx < w; sx++) {
        const c = pix[off + sy * w + sx];
        if (c < 0) continue;
        const px = flip ? X + (ax - sx) * S : X + (sx - ax) * S;
        if (px > -S && px < PW) block(px, py, tint >= 0 ? tint : c, S);
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
  cx0: number, cy0: number, cx1: number, cy1: number, tint = -1, alt: boolean | number = false): void {
  const w = D.SprW[id], h = D.SprH[id], ax = D.SprAX[id], ay = D.SprAY[id], off = D.SprOff[id];
  const pix = pixels(id, alt);
  const small = D.SprHi[id] && D.SprHiS[id] !== 3;     // hi-res art with pixels smaller than world pixels (SD fighter art is world size)
  const B = small ? k * HI : k * PX;                  // screen pixels per sprite pixel
  const X0 = Math.max(0, cx0 * PX), Y0 = Math.max(0, cy0 * PX);
  const X1 = Math.min(PW - 1, cx1 * PX + PX - 1), Y1 = Math.min(PH - 1, cy1 * PX + PX - 1);
  const bx = x * PX, by = y * PX + (small ? (PX - HI) * k : 0);
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      let c = pix[off + sy * w + sx];
      if (c < 0) continue;
      if (tint >= 0) c = tint;
      const px = flip ? bx + (ax - sx) * B - (small ? 0 : B - PX) : bx + (sx - ax) * B;
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
  if (s < 0.3 || v < 0.32) return c;                    // greys, dark hair, outlines and shadows keep their colour
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

// ---------------------------------------------------------------- hi-res effects (art-pixel size, blended)

function blendAt(k: number, color: number, a: number): void {
  const b = back[k];
  const r = (b & 255) + ((color & 255) - (b & 255)) * a;
  const g = ((b >> 8) & 255) + (((color >> 8) & 255) - ((b >> 8) & 255)) * a;
  const bl = ((b >> 16) & 255) + (((color >> 16) & 255) - ((b >> 16) & 255)) * a;
  back[k] = RGB(r, g, bl);
}

/** One dot the size of a hi-res art pixel at world point (wx, wy); a < 1 blends it over the frame. */
export function artDot(wx: number, wy: number, color: number, a = 1): void {
  const px = Math.round(wx * PX), py = Math.round(wy * PX);
  for (let j = 0; j < HI; j++) {
    const y = py + j;
    if (y < 0 || y >= PH) continue;
    for (let i = 0; i < HI; i++) {
      const x = px + i;
      if (x < 0 || x >= PW) continue;
      if (a >= 1) back[x + y * PW] = color; else blendAt(x + y * PW, color, a);
    }
  }
}

/** Screen-pixel origin of art pixel (sx, sy) of hi-res sprite id drawn at world (x, y). */
export function hiArtOrigin(id: number, x: number, y: number, flip: boolean, sx: number, sy: number): [number, number] {
  const S = hiScale(id), X = Math.trunc(x) * PX + (PX - S >> 1), Y = Math.trunc(y) * PX + PX - S;
  return [flip ? X + (D.SprAX[id] - sx) * S : X + (sx - D.SprAX[id]) * S, Y + (sy - D.SprAY[id]) * S];
}
/** Screen pixels per art pixel of hi-res sprite id (SD fighter art: 3). */
export const hiScale = (id: number) => mHiS || D.SprHiS[id] || HI;

/** Rage look for hi-res art: flickering red / orange rim, flame tongues off the top edge, embers, red wash. */
export function drawRageHi(id: number, x: number, y: number, flip: boolean, f: number): void {
  const w = D.SprW[id], h = D.SprH[id], off = D.SprOff[id];
  const on = (sx: number, sy: number) => sx >= 0 && sy >= 0 && sx < w && sy < h && D.SprPix[off + sy * w + sx] >= 0;
  const put = (sx: number, sy: number, c: number, a = 1) => {
    const [px, py] = hiArtOrigin(id, x, y, flip, sx, sy), S = hiScale(id);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const X = px + i, Y = py + j;
      if (X >= 0 && X < PW && Y >= 0 && Y < PH) { if (a >= 1) back[X + Y * PW] = c; else blendAt(X + Y * PW, c, a); }
    }
  };
  for (let sy = -1; sy <= h; sy++)
    for (let sx = -1; sx <= w; sx++) {
      if (on(sx, sy)) continue;
      if (!(on(sx + 1, sy) || on(sx - 1, sy) || on(sx, sy + 1) || on(sx, sy - 1))) continue;
      const k = (((sx * 7 + sy * 13 + f * 5) % 6) + 6) % 6;
      put(sx, sy, k < 4 ? RGB(200, 30, 20) : RGB(255, 120, 40));
    }
  for (let sx = 0; sx < w; sx++) {
    let top = -1;
    for (let sy = 0; sy < h; sy++) if (on(sx, sy)) { top = sy; break; }
    if (top < 0) continue;
    const t = (((sx * 31 + f * 17) % 7) + 7) % 7;
    if (t <= 2) continue;
    for (let k = 1; k < t; k++) put(sx, top - k - 1, k === t - 1 ? RGB(255, 230, 120) : k > t / 2 ? RGB(255, 140, 40) : RGB(220, 40, 20));
  }
}

/** Wash every pixel of hi-res sprite id (drawn at world x, y) toward color by a. */
export function tintHi(id: number, x: number, y: number, flip: boolean, color: number, a: number): void {
  const w = D.SprW[id], h = D.SprH[id], off = D.SprOff[id];
  for (let sy = 0; sy < h; sy++)
    for (let sx = 0; sx < w; sx++) {
      if (D.SprPix[off + sy * w + sx] < 0) continue;
      const [px, py] = hiArtOrigin(id, x, y, flip, sx, sy), S = hiScale(id);
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const X = px + i, Y = py + j;
        if (X >= 0 && X < PW && Y >= 0 && Y < PH) blendAt(X + Y * PW, color, a);
      }
    }
}

// ---------------------------------------------------------------- story mode helpers (screen-pixel coordinates)

export const PHYS_W = PW, PHYS_H = PH;

/** Darken / tint a screen-pixel rectangle toward color by a (dialogue boxes). */
export function shadeRect(x: number, y: number, w: number, h: number, color: number, a: number): void {
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(PW, x + w), y1 = Math.min(PH, y + h);
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) blendAt(i + j * PW, color, a);
}
export function physRect(x: number, y: number, w: number, h: number, color: number): void {
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(PW, x + w), y1 = Math.min(PH, y + h);
  for (let j = y0; j < y1; j++) back.fill(color, x0 + j * PW, x1 + j * PW);
}

/** Recolour the current stage background (night, burnt, black and white, blood moon ...). */
export const TINT_NONE = 0, TINT_NIGHT = 1, TINT_BURNT = 2, TINT_MONO = 3, TINT_BLOOD = 4, TINT_TORCH = 5, TINT_DARK = 6,
  TINT_VIOLET = 7, TINT_DAWN = 8, TINT_DUSK = 9, TINT_BLACK = 10;
export function tintStage(t: number): void {
  if (!t) return;
  for (let k = 0; k < bg.length; k++) {
    const c = bg[k], r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255, l = r * 0.3 + g * 0.59 + b * 0.11;
    let o = c;
    switch (t) {
      case TINT_NIGHT: o = RGB(r * 0.45, g * 0.5, b * 0.7 + 18); break;
      case TINT_BURNT: o = RGB(Math.min(255, l * 1.3 + 30), l * 0.62, l * 0.35); break;
      case TINT_MONO: o = RGB(l * 0.9, l * 0.9, l * 0.9); break;
      case TINT_BLOOD: o = RGB(Math.min(255, l * 1.15 + 20), l * 0.3, l * 0.32); break;
      case TINT_TORCH: o = RGB(Math.min(255, r * 0.7 + 40), g * 0.55 + 12, b * 0.35); break;
      case TINT_DARK: o = RGB(r * 0.35, g * 0.35, b * 0.45 + 6); break;
      case TINT_VIOLET: o = RGB(r * 0.75 + 30, g * 0.55, Math.min(255, b * 0.9 + 50)); break;
      case TINT_DAWN: o = RGB(r * 0.75 + 10, g * 0.8 + 12, Math.min(255, b * 0.9 + 34)); break;
      case TINT_DUSK: o = RGB(Math.min(255, r * 0.9 + 40), g * 0.7 + 8, b * 0.55); break;
      case TINT_BLACK: o = RGB(4, 3, 8); break;
    }
    bg[k] = o;
    bgDark[k] = darken(o);
  }
}

/** A soft disc blended over the frame (screen-pixel centre and radius): smoke, dust. */
export function shadeCircle(cx: number, cy: number, r: number, color: number, a: number): void {
  if (a <= 0 || r <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(PW - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(PH - 1, Math.ceil(cy + r));
  const r2 = r * r;
  // quantised to 2 x 2 blocks so it stays pixel-art
  for (let y = y0 & ~1; y <= y1; y += 2) for (let x = x0 & ~1; x <= x1; x += 2) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy > r2) continue;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) if (x + i < PW && y + j < PH) blendAt(x + i + (y + j) * PW, color, a);
  }
}

/** Copy a picture in screen pixels (pw x ph, -1 = transparent) to the frame, its column sx at the left edge. */
export function blitPhys(pix: Int32Array, pw: number, ph: number, sx: number, sy = 0): void {
  sx = Math.round(sx);
  const x0 = Math.max(0, -sx), x1 = Math.min(PW, pw - sx);
  for (let y = 0; y < ph; y++) {
    const ty = y + sy;
    if (ty < 0 || ty >= PH) continue;
    const so = y * pw + sx, to = ty * PW;
    for (let x = x0; x < x1; x++) { const c = pix[so + x]; if (c !== -1) back[to + x] = c; }
  }
}

/** A picture (physical pixels) zoomed by z around a ground line: screen row gy stays on picture row gy, picture column
 *  sx0 + x / z fills screen column x (the field map behind a story fight, seen closer). */
export function blitPhysZoom(pix: Int32Array, pw: number, ph: number, sx0: number, z: number, gy: number): void {
  const cols = new Int32Array(PW);
  for (let x = 0; x < PW; x++) cols[x] = Math.max(0, Math.min(pw - 1, Math.floor(sx0 + x / z)));
  for (let y = 0; y < PH; y++) {
    const r = Math.max(0, Math.min(ph - 1, Math.floor(gy + (y - gy) / z))), so = r * pw, to = y * PW;
    for (let x = 0; x < PW; x++) { const c = pix[so + cols[x]]; back[to + x] = c === -1 ? 0 : c; }
  }
}

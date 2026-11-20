// Side-scrolling story maps (MapleStory-like): a sky, parallax layers drawn once into pixel buffers at world
// resolution (1 world pixel = 3 x 3 screen pixels, the same chunky size as the fighters), plus moving
// smoke, embers and flags drawn every frame.
import * as R from "./renderer";
import { SCREEN_W, SCREEN_H, PX } from "./renderer";
import { RGB } from "./util";

export interface Layer { par: number; w: number; pix: Int32Array }
export interface FieldMap {
  w: number;                                    // map width in world pixels (camera range: 0 .. w - SCREEN_W)
  sky: Int32Array;                              // one colour per row
  layers: Layer[];                              // back to front; the layer with par 1 is where people stand
  front: Layer[];                               // drawn over the people
  smoke: { x: number; y: number; s: number }[];
  embers: { x: number; y: number }[];           // smouldering pixels on the main layer (flicker)
  flags: { x: number; y: number }[];            // pole top of a black-flame flag
  glow: number;                                 // colour of the embers
  img?: { w: number; h: number; pix: Int32Array };
  noAsh?: boolean;
  rain?: boolean;
  snow?: boolean;                              // indoors / no fire: no drifting ash   // a finished picture (screen pixels) instead of drawn layers
}

// ---------------------------------------------------------------- picture maps (data/maps/<name>.png, see tools/bg_add.py)

const pictures = new Map<string, { w: number; h: number; pix: Int32Array }>();
export const PICTURE_MAPS = ["cheongpung_fire", "shaolin_library", "shaolin_yard", "bamboo_hut", "emei_snow", "namgung_fire", "xiha_station", "cheonma_hall", "dark_room", "mask_closeup"];
const RAIN_MAPS = ["bamboo_hut"], SNOW_MAPS = ["emei_snow"];
const FIRE_MAPS = ["cheongpung_fire", "shaolin_yard", "namgung_fire"];

let loading: Promise<void> | null = null, loaded = false;
export const ready = () => loaded;
export function preload(): Promise<void> {
  if (!loading) loading = loadPictures().then(() => { loaded = true; });
  return loading;
}
async function loadPictures(): Promise<void> {
  await Promise.all(PICTURE_MAPS.map(async (n) => {
    try {
      const r = await fetch("maps/" + n + ".png");
      if (!r.ok) return;
      const bmp = await createImageBitmap(await r.blob());
      const cv = document.createElement("canvas");
      cv.width = bmp.width; cv.height = bmp.height;
      const c2 = cv.getContext("2d")!;
      c2.drawImage(bmp, 0, 0);
      const d = c2.getImageData(0, 0, bmp.width, bmp.height).data;
      const pix = new Int32Array(bmp.width * bmp.height);
      for (let k = 0; k < pix.length; k++) pix[k] = d[k * 4 + 3] < 128 ? -1 : RGB(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]);
      pictures.set(n, { w: bmp.width, h: bmp.height, pix });
    } catch { /* missing picture: the map stays empty */ }
  }));
}

/** A map made of one picture as wide as the scene. */
export function pictureMap(name: string): FieldMap {
  const img = pictures.get(name);
  const w = img ? Math.round(img.w / PX) : SCREEN_W;
  return { w, sky: new Int32Array(SCREEN_H), layers: [], front: [], smoke: [], embers: [], flags: [], glow: RGB(255, 120, 40), img, noAsh: !FIRE_MAPS.includes(name), rain: RAIN_MAPS.includes(name), snow: SNOW_MAPS.includes(name) };
}

const T = -1;
class Canvas {
  pix: Int32Array;
  constructor(public w: number, public h = SCREEN_H) { this.pix = new Int32Array(w * h).fill(T); }
  set(x: number, y: number, c: number): void {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.pix[x + y * this.w] = c;
  }
  get(x: number, y: number): number { return x >= 0 && x < this.w && y >= 0 && y < this.h ? this.pix[x + y * this.w] : T; }
  rect(x: number, y: number, w: number, h: number, c: number): void { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  vline(x: number, y0: number, y1: number, c: number): void { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
}

// deterministic noise so the map is the same every time
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return ((seed >>> 8) & 0xffff) / 0x10000; };
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 0x10000; };
const mix = (a: number, b: number, t: number) => RGB(
  (a & 255) + ((b & 255) - (a & 255)) * t, ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t,
  ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
const dark = (c: number, k: number) => RGB((c & 255) * k, ((c >> 8) & 255) * k, ((c >> 16) & 255) * k);

function ridge(c: Canvas, base: number, amp: number, freq: number, col: number, ph: number, rough = 0): void {
  for (let x = 0; x < c.w; x++) {
    const v = Math.sin(x * freq + ph) * 0.6 + Math.sin(x * freq * 2.3 + ph * 1.7) * 0.3 + Math.sin(x * freq * 5.1 + ph) * 0.1;
    const top = Math.round(base - amp * (v * 0.5 + 0.5) - (rough ? Math.floor(hash(x, 3) * rough) : 0));
    for (let y = top; y < c.h; y++) c.set(x, y, y === top ? mix(col, RGB(200, 190, 200), 0.18) : col);
  }
}

function pine(c: Canvas, x: number, ground: number, h: number, col: number): void {
  c.vline(x, ground - 3, ground, dark(col, 0.8));
  for (let j = 0; j < h; j++) {
    const half = Math.round(((j % 5) + 1) * 0.7 + (j / h) * 3.5);
    for (let i = -half; i <= half; i++) c.set(x + i, ground - 3 - h + j, col);
  }
}

// ---------------------------------------------------------------- village pieces

const WALL = RGB(150, 120, 90), WALL_D = RGB(112, 88, 66), POST = RGB(74, 52, 36), POST_D = RGB(50, 34, 26),
  STRAW = RGB(184, 150, 88), STRAW_D = RGB(146, 114, 62), STRAW_L = RGB(208, 178, 112), CHAR = RGB(38, 30, 30),
  CHAR_L = RGB(66, 52, 46), STONE = RGB(128, 122, 118), STONE_D = RGB(92, 88, 86), OUT = RGB(28, 22, 26);

/** A thatched house (초가집). burn 0..1 = how much of the roof is charred; hole = collapsed part of the roof. */
function house(c: Canvas, m: FieldMap, x: number, g: number, w: number, burn: number, hole: number, flag: boolean): void {
  const wallTop = g - 19;
  // stone footing
  for (let i = -1; i <= w; i++) c.set(x + i, g - 1, hash(x + i, 1) > 0.5 ? STONE : STONE_D);
  for (let i = -1; i <= w; i++) c.set(x + i, g, STONE_D);
  // mud wall with soot creeping down from the roof
  for (let j = wallTop; j < g - 1; j++) for (let i = 0; i < w; i++) {
    const soot = burn * Math.max(0, 1 - (j - wallTop) / 14) + (hash(x + i, j) - 0.5) * 0.25;
    let col = (i + j) % 7 === 0 ? WALL_D : WALL;
    if (soot > 0.35) col = mix(col, CHAR, Math.min(1, soot));
    c.set(x + i, j, col);
  }
  // posts and the beam
  for (const px of [0, Math.round(w / 2), w - 1]) c.vline(x + px, wallTop - 1, g - 2, px === 0 ? POST_D : POST);
  for (let i = -1; i <= w; i++) c.set(x + i, wallTop, POST_D);
  // door and lattice window
  const dx = x + Math.round(w * 0.2);
  c.rect(dx, g - 14, 7, 13, RGB(36, 26, 24));
  c.vline(dx - 1, g - 15, g - 2, POST_D); c.vline(dx + 7, g - 15, g - 2, POST_D);
  for (let i = 0; i < 7; i++) c.set(dx + i, g - 15, POST_D);
  const wx = x + Math.round(w * 0.62);
  c.rect(wx, g - 13, 8, 6, RGB(60, 46, 40));
  for (let i = 0; i < 8; i += 2) c.vline(wx + i, g - 13, g - 8, RGB(186, 160, 120));
  for (let i = 0; i < 8; i++) { c.set(wx + i, g - 11, RGB(186, 160, 120)); c.set(wx + i, g - 14, POST_D); c.set(wx + i, g - 7, POST_D); }
  // wooden porch step
  c.rect(x + 2, g - 2, w - 4, 1, POST);
  // thatched roof: a soft rounded mound wider than the walls
  const rx0 = x - 5, rw = w + 10, rh = 12, base = wallTop + 2;
  const holeX0 = rx0 + Math.round(rw * 0.55), holeX1 = holeX0 + Math.round(rw * hole);
  for (let i = 0; i < rw; i++) {
    const t = (i - rw / 2) / (rw / 2);
    const top = Math.round(base - rh * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.6)), 0.55));
    const inHole = hole > 0 && i + rx0 >= holeX0 && i + rx0 < holeX1;
    for (let y = top; y <= base; y++) {
      if (inHole && y < base - 1) { if ((i + rx0) % 4 === 0) c.set(rx0 + i, y, POST_D); continue; }   // bare rafters
      const strand = hash(rx0 + i, y >> 1) > 0.62;
      let col = y === top ? STRAW_L : strand ? STRAW_D : STRAW;
      if ((y - top) % 5 === 3) col = STRAW_D;                                    // rope lines across the thatch
      if (y === base) col = dark(STRAW_D, 0.75);
      const ch = burn * 1.25 - (hash(rx0 + i >> 1, y >> 1) * 0.55 + (y - top) / rh * 0.35);
      if (ch > 0.2) {
        col = ch > 0.42 ? CHAR : CHAR_L;
        if (ch < 0.27 && hash(i, y) > 0.55) m.embers.push({ x: rx0 + i, y });   // glowing edge of the burnt part
      }
      c.set(rx0 + i, y, y === top ? (ch > 0.2 ? CHAR_L : col) : col);
    }
    c.set(rx0 + i, top - 1, OUT);
  }
  if (burn > 0.25) m.smoke.push({ x: x + Math.round(w * (0.3 + hash(x, 9) * 0.4)), y: base - rh + 2, s: 0.5 + burn });
  if (flag) m.flags.push({ x: x + Math.round(w * 0.5), y: base - rh - 12 });
}

/** Brushwood fence (싸리 울타리). */
function fence(c: Canvas, x0: number, x1: number, g: number, broken: number): void {
  for (let x = x0; x <= x1; x++) {
    if (broken && hash(x, 77) < broken) continue;
    const h = 8 + Math.floor(hash(x, 5) * 3);
    if (x % 2 === 0) c.vline(x, g - h, g, hash(x, 6) > 0.4 ? RGB(110, 84, 54) : RGB(86, 64, 42));
    c.set(x, g - 5, RGB(70, 50, 34)); c.set(x, g - 2, RGB(70, 50, 34));
  }
}

/** Village well (우물): stone ring, a fallen wooden frame. */
function well(c: Canvas, x: number, g: number): void {
  for (let j = 0; j < 8; j++) for (let i = 0; i < 18; i++) {
    const brick = ((i + (j % 2) * 3) % 6 === 0) || j % 3 === 0;
    c.set(x + i, g - 8 + j, brick ? STONE_D : hash(x + i, j) > 0.5 ? STONE : RGB(140, 134, 128));
  }
  for (let i = 0; i < 18; i++) { c.set(x + i, g - 9, RGB(160, 154, 146)); c.set(x + i, g - 10, OUT); }
  c.vline(x + 1, g - 22, g - 9, POST); c.vline(x + 2, g - 22, g - 9, POST_D);        // the standing post
  for (let k = 0; k < 14; k++) c.set(x + 3 + k, g - 22 + Math.round(k * 0.95), POST);   // the beam, fallen against the ring
  c.rect(x + 13, g - 3, 4, 3, RGB(96, 70, 44)); c.set(x + 14, g - 4, RGB(60, 44, 30));   // an upturned bucket
}

/** Village guardian posts (장승) at the village entrance. */
function jangseung(c: Canvas, x: number, g: number, tall: number): void {
  const w = 6, top = g - tall;
  for (let j = top; j <= g; j++) for (let i = 0; i < w; i++) c.set(x + i, j, i === 0 ? POST_D : hash(x + i, j) > 0.7 ? RGB(120, 88, 58) : RGB(104, 76, 50));
  c.rect(x - 1, top - 3, w + 2, 3, RGB(40, 34, 32));                 // hat
  c.rect(x + 1, top + 4, 1, 1, OUT); c.rect(x + 4, top + 4, 1, 1, OUT);   // eyes
  c.rect(x + 1, top + 7, 4, 1, RGB(160, 50, 40));                     // grin
  for (let j = top + 11; j < top + 20; j += 2) c.set(x + 3, j, OUT);   // carved letters
}

function deadTree(c: Canvas, x: number, g: number, h: number): void {
  const col = RGB(46, 36, 34);
  c.vline(x, g - h, g, col); c.vline(x + 1, g - h + 3, g, dark(col, 0.8));
  for (let k = 0; k < 7; k++) { c.set(x - 1 - k, g - h + 6 - Math.round(k * 0.7), col); c.set(x + 2 + k, g - h + 10 - Math.round(k * 0.8), col); }
  for (let k = 0; k < 4; k++) c.set(x + 1 + k, g - h - k, col);
}

// ---------------------------------------------------------------- 청풍촌 (the morning after the fire)

export function cheongpung(): FieldMap {
  seed = 11;
  const W = 768, G = 88;
  const m: FieldMap = { w: W, sky: new Int32Array(SCREEN_H), layers: [], front: [], smoke: [], embers: [], flags: [], glow: RGB(255, 120, 40) };
  // ash-grey dawn: cold grey above, a sick pink band behind the smoke at the horizon
  for (let y = 0; y < SCREEN_H; y++) {
    const t = y / 70;
    m.sky[y] = t < 0.55 ? mix(RGB(52, 56, 74), RGB(104, 100, 116), t / 0.55) : mix(RGB(104, 100, 116), RGB(190, 150, 136), Math.min(1, (t - 0.55) / 0.45));
  }
  const far = new Canvas(SCREEN_W + Math.ceil((W - SCREEN_W) * 0.15) + 2);
  ridge(far, 58, 22, 0.021, RGB(96, 96 + 2, 118), 1.3);
  ridge(far, 66, 14, 0.034, RGB(80, 80, 100), 4.1);
  m.layers.push({ par: 0.15, w: far.w, pix: far.pix });

  const mid = new Canvas(SCREEN_W + Math.ceil((W - SCREEN_W) * 0.45) + 2);
  ridge(mid, 74, 10, 0.03, RGB(58, 60, 70), 2.2, 2);
  for (let x = 6; x < mid.w; x += 9 + Math.floor(rnd() * 12)) pine(mid, x, 76 + Math.floor(rnd() * 3), 10 + Math.floor(rnd() * 9), RGB(40, 44, 50));
  for (let y = 78; y < SCREEN_H; y++) for (let x = 0; x < mid.w; x++) mid.set(x, y, RGB(50, 50, 58));   // fields behind the village
  for (let x = 0; x < mid.w; x += 1) if (hash(x, 80) > 0.6) mid.set(x, 79, RGB(64, 62, 66));
  m.layers.push({ par: 0.45, w: mid.w, pix: mid.pix });

  const main = new Canvas(W);
  // ground: packed dirt, a lighter village road, ash patches and stones
  for (let y = G; y < SCREEN_H; y++) for (let x = 0; x < W; x++) {
    const road = y >= G + 2 && y <= G + 7;
    let col = road ? RGB(122, 108, 92) : RGB(90, 78, 68);
    if (y === G) col = RGB(70, 60, 54);
    const n = hash(x >> 1, y);
    if (n > 0.93) col = STONE_D;
    else if (n > 0.86) col = dark(col, 0.85);
    if (hash(x >> 3, y >> 1) > 0.82 && !road) col = RGB(104, 100, 98);   // ash
    main.set(x, y, col);
  }
  // west road out of the village (left edge): a signpost
  main.vline(14, G - 20, G, POST); main.rect(8, G - 19, 14, 4, RGB(130, 100, 64)); main.rect(9, G - 18, 12, 2, RGB(150, 118, 76));
  main.set(10, G - 17, OUT); main.set(13, G - 17, OUT); main.set(16, G - 17, OUT);
  fence(main, 30, 70, G, 0.25);
  well(main, 86, G);
  house(main, m, 128, G, 44, 0.85, 0, true);
  fence(main, 178, 214, G, 0.4);
  deadTree(main, 196, G, 30);
  house(main, m, 222, G, 52, 0.55, 0.22, false);
  house(main, m, 318, G, 40, 1, 0.38, true);
  fence(main, 364, 400, G, 0.15);
  house(main, m, 470, G, 48, 0.7, 0, true);
  fence(main, 524, 560, G, 0.5);
  house(main, m, 566, G, 44, 0.35, 0, false);
  deadTree(main, 626, G, 26);
  jangseung(main, 700, G, 26); jangseung(main, 726, G, 23);
  m.layers.push({ par: 1, w: W, pix: main.pix });

  const fr = new Canvas(SCREEN_W + Math.ceil((W - SCREEN_W) * 1.3) + 2);
  for (let x = 0; x < fr.w; x++) {
    if (hash(x >> 2, 900) > 0.78) {
      const h = 2 + Math.floor(hash(x, 901) * 5);
      if (x % 2 === 0) fr.vline(x, SCREEN_H - h, SCREEN_H - 1, RGB(26, 22, 24));
    }
  }
  m.front.push({ par: 1.3, w: fr.w, pix: fr.pix });
  return m;
}

// ---------------------------------------------------------------- drawing

function drawLayer(L: Layer, camX: number): void {
  const ox = Math.round(camX * L.par);
  for (let y = 0; y < SCREEN_H; y++) {
    const row = y * L.w;
    for (let x = 0; x < SCREEN_W; x++) {
      const lx = x + ox;
      if (lx < 0 || lx >= L.w) continue;
      const c = L.pix[lx + row];
      if (c !== T) R.block(x * PX, y * PX, c);
    }
  }
}

export function drawBack(m: FieldMap, camX: number, t: number): void {
  if (m.img) { R.physRect(0, 0, R.PHYS_W, R.PHYS_H, 0); R.blitPhys(m.img.pix, m.img.w, m.img.h, camX * PX); return; }
  for (let y = 0; y < SCREEN_H; y++) R.physRect(0, y * PX, R.PHYS_W, PX, m.sky[y]);
  for (const L of m.layers) drawLayer(L, camX);
  // embers glowing on the burnt thatch
  for (let k = 0; k < m.embers.length; k++) {
    const e = m.embers[k], f = (Math.sin(t * 0.3 + k * 1.7) + 1) / 2;
    if (f > 0.35) R.block(Math.round(e.x - camX) * PX, e.y * PX, f > 0.8 ? RGB(255, 200, 90) : m.glow);
  }
  // black-flame flags on the roofs, waving
  for (const fl of m.flags) {
    const x = Math.round(fl.x - camX);
    if (x < -14 || x > SCREEN_W + 2) continue;
    R.fillRect(x, fl.y, 1, 14, RGB(60, 44, 32));
    for (let j = 0; j < 7; j++) for (let i = 1; i <= 10; i++) {
      const wave = Math.round(Math.sin(t * 0.25 + i * 0.6) * (i / 10) * 1.2);
      const yy = fl.y + 1 + j + wave;
      // black cloth with a dark-red flame in the middle
      const flame = (i >= 4 && i <= 7 && j >= 2 && j <= 5 && !(j === 2 && (i === 4 || i === 7)) && !(j === 5 && i === 7)) || (i === 6 && j === 1);
      R.putPixel(x + i, yy, flame ? (j <= 2 ? RGB(230, 120, 40) : RGB(190, 40, 30)) : j === 0 || j === 6 ? RGB(14, 12, 16) : RGB(26, 22, 28));
    }
  }
  // smoke rising from the burnt houses, drifting west
  for (let k = 0; k < m.smoke.length; k++) {
    const s = m.smoke[k];
    for (let p = 0; p < 7; p++) {
      const age = ((t * 0.6 + p * 17 + k * 31) % 120) / 120;
      const x = s.x - camX - age * 26 + Math.sin(age * 6 + k) * 3, y = s.y - age * 70;
      const r = (2 + age * 9) * s.s;
      R.shadeCircle(x * PX, y * PX, r * PX, age < 0.15 ? RGB(70, 64, 66) : RGB(118, 114, 120), 0.32 * (1 - age));
    }
  }
}

export function drawFront(m: FieldMap, camX: number, t: number): void {
  for (const L of m.front) drawLayer(L, camX);
  if (m.rain) {
    for (let k = 0; k < 90; k++) {
      const x = (k * 97 + Math.floor(t * 1.3) * 7 + k * k) % (R.PHYS_W + 40) - 20, y = (k * 53 + t * 26) % (R.PHYS_H + 30) - 30;
      for (let j = 0; j < 12; j += 2) R.shadeRect(x - j / 4, y + j, 2, 2, RGB(190, 196, 214), 0.45);
    }
  }
  if (m.snow) {
    for (let k = 0; k < 120; k++) {
      const x = ((k * 131 + k * k * 7) % (R.PHYS_W + 60)) - 30 - ((t * (3 + (k % 4))) % (R.PHYS_W + 60)) + R.PHYS_W;
      const y = (k * 71 + t * (2 + (k % 3))) % (R.PHYS_H + 10) - 10;
      const xx = ((x % (R.PHYS_W + 60)) + R.PHYS_W + 60) % (R.PHYS_W + 60) - 30;
      R.shadeRect(xx + Math.sin(t * 0.07 + k) * 6, y, k % 5 === 0 ? 4 : 2, k % 5 === 0 ? 4 : 2, RGB(240, 240, 250), 0.85);
    }
  }
  if (m.noAsh) return;
  // drifting ash and a few sparks
  for (let k = 0; k < 26; k++) {
    const x = ((k * 53 + t * (0.4 + (k % 3) * 0.2)) % (SCREEN_W + 20)) - 10, y = (k * 37 + Math.sin(t * 0.05 + k) * 8 + t * 0.15) % SCREEN_H;
    R.artDot(SCREEN_W - x, y, k % 5 === 0 ? RGB(255, 150, 70) : RGB(170, 166, 170), k % 5 === 0 ? 0.9 : 0.5);
  }
}

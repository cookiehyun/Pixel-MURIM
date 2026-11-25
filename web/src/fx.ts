// Port of FX.bas: short-lived hit / guard sparks and impact effects.
import * as R from "./renderer";
import { GROUND_Y } from "./renderer";
import { RGB, vint } from "./util";

export const FX_HIT = 0, FX_HEAVY = 1, FX_BLOCK = 2, FX_SLAM = 3, FX_SLASH = 4, FX_DARK = 5;
const MAX_FX = 8, FX_LIFE = 4, SLAM_LIFE = 8;

const mX = new Array(MAX_FX).fill(0), mY = new Array(MAX_FX).fill(0), mType = new Array(MAX_FX).fill(0);
const mAge = new Array(MAX_FX).fill(FX_LIFE), mMid = new Array(MAX_FX).fill(-1), mOut = new Array(MAX_FX).fill(-1);
const mPetal = new Array(MAX_FX).fill(false);

export function init(): void {
  for (let k = 0; k < MAX_FX; k++) mAge[k] = FX_LIFE;
}

const life = (k: number) => (mType[k] === FX_SLAM ? SLAM_LIFE : FX_LIFE);

/** Hit spark in the attacker's colors, plus a per-fighter extra for heavy hits. */
export function spawnHit(x: number, y: number, heavy: boolean, prefix: string): void {
  let m: number, o: number, petal = false;
  switch (prefix.replace(/^sd_/, "")) {                    // SD story fighters spark like their arcade selves
    case "heuksa": m = RGB(200, 170, 225); o = RGB(110, 60, 140); break;
    case "danwoo": m = RGB(190, 230, 255); o = RGB(90, 150, 255); break;
    case "cheolsan": m = RGB(255, 205, 120); o = RGB(205, 120, 60); break;
    case "muyeong": m = RGB(235, 240, 255); o = RGB(160, 180, 210); break;
    case "seolhwa": m = RGB(255, 190, 215); o = RGB(240, 100, 150); petal = true; break;
    case "heukrim": m = RGB(185, 255, 150); o = RGB(80, 190, 70); break;
    case "hongryeon": m = RGB(255, 215, 110); o = RGB(230, 70, 60); break;
    case "cheonma": m = RGB(190, 160, 240); o = RGB(90, 50, 150); break;
    case "hyeolma": m = RGB(255, 140, 110); o = RGB(170, 30, 40); break;
    default: m = RGB(255, 224, 102); o = RGB(255, 130, 50);
  }
  const k = spawn(x, y, heavy ? FX_HEAVY : FX_HIT);
  mMid[k] = m; mOut[k] = o; mPetal[k] = petal;
  if (heavy) {
    if (prefix === "cheolsan") spawn(x, GROUND_Y - 3, FX_SLAM);
    else if (prefix === "muyeong") spawn(x, y, FX_SLASH);
    else if (prefix === "heukrim" || prefix === "cheonma" || prefix === "hyeolma" || prefix === "sd_heuksa") spawn(x, y, FX_DARK);
  }
}

export function spawn(x: number, y: number, kind: number): number {
  let k: number, oldest = 0;
  for (k = 0; k < MAX_FX; k++) {
    if (mAge[k] >= life(k)) break;
    if (mAge[k] > mAge[oldest]) oldest = k;
  }
  if (k === MAX_FX) k = oldest;
  mX[k] = Math.trunc(x); mY[k] = Math.trunc(y); mType[k] = kind; mAge[k] = 0;
  mMid[k] = -1; mOut[k] = -1; mPetal[k] = false;
  return k;
}

export function update(): void {
  for (let k = 0; k < MAX_FX; k++) if (mAge[k] < life(k)) mAge[k]++;
}

export function draw(): void {
  for (let k = 0; k < MAX_FX; k++) {
    if (mAge[k] >= life(k)) continue;
    if (mType[k] === FX_SLAM) slam(mX[k], mY[k], mAge[k]);
    else if (mType[k] === FX_SLASH) slashFx(mX[k], mY[k], mAge[k], k);
    else if (mType[k] === FX_DARK) darkFx(mX[k], mY[k], mAge[k]);
    else spark(mX[k], mY[k], mAge[k], mType[k], k);
  }
}

function darkFx(x: number, y: number, age: number): void {
  const r = 3 + age * 3;
  if (age < 2) R.fillRect(x - 3, y - 3, 7, 7, RGB(30, 10, 40));
  for (let k = 0; k <= 15; k++) {
    const a = (k * 3.14159) / 8 + age * 0.3;
    R.putPixel(x + vint(Math.cos(a) * r), y + vint(Math.sin(a) * r), age < 2 ? RGB(200, 120, 255) : RGB(120, 60, 170));
  }
  for (let k = 0; k <= 3; k++) R.putPixel(x - 5 + k * 3, y - 4 - age * 2 - (k % 2) * 2, RGB(150, 90, 200));
}

function slashFx(x: number, y: number, age: number, k: number): void {
  const sx = k % 2 === 0 ? 1 : -1;
  const n = 9 - age * 2;
  const c = age === 0 ? RGB(255, 255, 255) : RGB(190, 230, 255);
  for (let d = -n; d <= n; d++) {
    R.putPixel(x + d, y + sx * Math.trunc(d / 2), c);
    if (age < 2) R.putPixel(x + d, y + sx * Math.trunc(d / 2) + 1, RGB(140, 200, 255));
  }
}

function slam(x: number, y: number, age: number): void {
  const r = 4 + age * 4;
  const c = age < 3 ? RGB(255, 255, 255) : RGB(255, 210, 120);
  for (let k = 0; k <= 31; k++) {
    const a = (k * 3.14159) / 16;
    R.putPixel(x + vint(Math.cos(a) * r), y + vint(Math.sin(a) * r * 0.35), c);
  }
  if (age < 2) R.fillRect(x - 6, y - 10, 13, 10, RGB(255, 255, 255));
  for (let dx = -2; dx <= 2; dx++) {
    if (dx === 0) continue;
    R.fillRect(x + dx * (6 + age * 3), y - 2 - Math.trunc(age / 2), 3, 2, RGB(170, 150, 120));
    R.putPixel(x + dx * (5 + age * 3), y - 4 - age, RGB(200, 185, 150));
  }
}

function spark(x: number, y: number, age: number, kind: number, slot: number): void {
  let cCore: number, cMid: number, cOut: number;
  if (kind === FX_BLOCK) {
    cCore = RGB(255, 255, 255); cMid = RGB(150, 215, 255); cOut = RGB(60, 120, 255);
  } else {
    cCore = RGB(255, 255, 255); cMid = RGB(255, 224, 102); cOut = RGB(255, 130, 50);
    if (mMid[slot] >= 0) { cMid = mMid[slot]; cOut = mOut[slot]; }
  }
  if (mPetal[slot] && age >= 1) {
    R.putPixel(x - 3 - age * 2, y - 2 - age, cOut);
    R.putPixel(x + 4 + age * 2, y - 4 - age, cMid);
    R.putPixel(x + 2 + age, y + 3 + age, cOut);
  }
  const r = kind === FX_HEAVY ? 2 : 0;
  switch (age) {
    case 0: ray(x, y, 0, 2 + r, cCore); R.putPixel(x, y, cCore); break;
    case 1: ray(x, y, 0, 3 + r, cMid); diag(x, y, 2 + r, cMid); R.fillRect(x - 1, y - 1, 3, 3, cCore); break;
    case 2: ray(x, y, 3 + r, 5 + r, cOut); diag(x, y, 3 + r, cOut); R.putPixel(x, y, cMid); break;
    default:
      for (let k = -1; k <= 1; k += 2) {
        R.putPixel(x + k * (6 + r), y, cOut);
        R.putPixel(x, y + k * (6 + r), cOut);
      }
  }
}

function ray(x: number, y: number, r0: number, r1: number, c: number): void {
  for (let d = r0; d <= r1; d++) {
    R.putPixel(x + d, y, c); R.putPixel(x - d, y, c); R.putPixel(x, y + d, c); R.putPixel(x, y - d, c);
  }
}

function diag(x: number, y: number, r: number, c: number): void {
  R.putPixel(x + r, y + r, c); R.putPixel(x - r, y + r, c); R.putPixel(x + r, y - r, c); R.putPixel(x - r, y - r, c);
}

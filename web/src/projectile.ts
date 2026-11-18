// Port of Projectile.bas: one projectile slot per fighter (wind palms, fans, fire pillars, demon bursts).
import { D, MT_PROJ_BOOM, MT_SUPER_FIRE, MT_SUPER_PROJ, animId, hasAnim, animFrame } from "./data";
import * as R from "./renderer";
import { GROUND_Y, SCREEN_W } from "./renderer";
import * as FX from "./fx";
import { F, hurtRect, hashMix } from "./fighter";
import { applyAttack } from "./combat";
import { RGB, clng, vint } from "./util";

const BOOM_OUT = 14, FIRE_DELAY = 4;
const mOn = [false, false], mX = [0, 0], mY = [0, 0], mVX = [0, 0], mMv = [0, 0], mHits = [0, 0], mCD = [0, 0];
const mAge = [0, 0], mStall = [0, 0], mBack = [false, false], mType = [0, 0], mAnimOwn = [-1, -1], mLinger = [0, 0];
let mAnimSmall = 0, mAnimBig = 0;

function ownAnim(owner: number): number {
  const n = "fx.proj_" + F[owner].prefix;
  return hasAnim(n) ? animId(n) : -1;
}

export function init(): void {
  mOn[0] = mOn[1] = false;
  mLinger[0] = mLinger[1] = 0;
  mAnimSmall = animId("fx.wind");
  mAnimBig = animId("fx.bigwind");
  mAnimOwn[0] = ownAnim(0);
  mAnimOwn[1] = ownAnim(1);
}

export const alive = (owner: number) => mOn[owner];

export function spawn(owner: number, mv: number): void {
  mType[owner] = D.MvType[mv];
  mBack[owner] = false;
  if (mType[owner] === MT_SUPER_FIRE) {
    mX[owner] = D.MvP1[mv] > 0 ? F[owner].x + F[owner].facing * D.MvP1[mv] : F[1 - owner].x;
    mY[owner] = GROUND_Y - Math.trunc(D.MvHbH[mv] / 2);
    mVX[owner] = 0;
  } else {
    const f = F[owner];
    mX[owner] = f.x + f.facing * 12;
    mY[owner] = f.footY - 21;
    mVX[owner] = f.facing * D.MvP1[mv];
  }
  mMv[owner] = mv;
  mAnimOwn[owner] = ownAnim(owner);
  mHits[owner] = Math.max(1, D.MvP2[mv]);
  mCD[owner] = 0; mStall[owner] = 0; mAge[owner] = 0;
  mOn[owner] = true;
}

/** Distance from the opponent's projectile to fighter target, or 999 if none / moving away. */
export function incomingDistance(target: number): number {
  const o = 1 - target;
  if (!mOn[o]) return 999;
  if ((F[target].x - mX[o]) * mVX[o] <= 0) return 999;
  return Math.abs(F[target].x - mX[o]);
}

export function update(): void {
  for (let k = 0; k <= 1; k++) {
    if (mLinger[k] > 0) { mLinger[k]--; mAge[k]++; }
    if (!mOn[k]) continue;
    if (mStall[k] > 0) mStall[k]--;
    else mX[k] += mVX[k];
    mAge[k]++;
    if (mCD[k] > 0) mCD[k]--;
    if (mType[k] === MT_PROJ_BOOM) {
      if (!mBack[k] && mAge[k] >= BOOM_OUT) {
        mBack[k] = true; mVX[k] = -mVX[k] * 1.15; mCD[k] = 0;
      } else if (mBack[k] && Math.abs(mX[k] - F[k].x) < 6) mOn[k] = false;
    } else if (mType[k] === MT_SUPER_FIRE) {
      if (mAge[k] > 40) mOn[k] = false;
    }
    if (mX[k] < -20 || mX[k] > SCREEN_W + 20) mOn[k] = false;
  }
  if (mOn[0] && mOn[1]) {
    if (Math.abs(mX[0] - mX[1]) < halfW(0) + halfW(1) && Math.abs(mY[0] - mY[1]) < 10) {
      FX.spawn(vint((mX[0] + mX[1]) / 2), vint(mY[0]), FX.FX_HEAVY);
      mHits[0]--; mHits[1]--;
      if (mHits[0] <= 0) mOn[0] = false;
      if (mHits[1] <= 0) mOn[1] = false;
    }
  }
  for (let k = 0; k <= 1; k++) if (mOn[k]) checkHit(k);
}

const halfW = (k: number) => D.MvHbW[mMv[k]] / 2;

function checkHit(k: number): void {
  if (mCD[k] > 0) return;
  if (mType[k] === MT_SUPER_FIRE && mAge[k] < FIRE_DELAY) return;
  const d = 1 - k;
  const u = hurtRect(d);
  if (!u) return;
  const pw = D.MvHbW[mMv[k]], ph = D.MvHbH[mMv[k]];
  const px0 = vint(mX[k]) - Math.trunc(pw / 2), py0 = vint(mY[k]) - Math.trunc(ph / 2);
  if (px0 + pw <= u.x || u.x + u.w <= px0 || py0 + ph <= u.y || u.y + u.h <= py0) return;
  mHits[k]--;
  const lastHit = mHits[k] <= 0;
  applyAttack(k, d, mMv[k], vint(mX[k]), vint(mY[k]), true, lastHit);
  if (lastHit) {
    mOn[k] = false;
    if (isBurst(k)) mLinger[k] = 5;
  } else if (mType[k] === MT_PROJ_BOOM) mCD[k] = 999;
  else {
    mCD[k] = 3;
    if (mType[k] !== MT_SUPER_FIRE) mStall[k] = 3;
  }
}

export function draw(): void {
  for (let k = 0; k <= 1; k++) {
    if (mLinger[k] > 0 && !mOn[k]) demonBursts(k);
    if (!mOn[k]) continue;
    let a: number;
    if (isBurst(k)) { demonBursts(k); a = -1; }
    else if (mType[k] === MT_SUPER_FIRE) { firePillar(k); a = -1; }
    else if (D.MvType[mMv[k]] === MT_SUPER_PROJ) a = mAnimBig;
    else if (mAnimOwn[k] >= 0) a = mAnimOwn[k];
    else a = mAnimSmall;
    if (a >= 0) R.drawSprite(animFrame(a, mAge[k]), vint(mX[k]), vint(mY[k]), mVX[k] < 0);
  }
}

const isBurst = (k: number) => mType[k] === MT_SUPER_FIRE && F[k].prefix === "cheonma";

function demonBursts(k: number): void {
  const ox = [-7, 8, -3, 6], oy = [-20, -30, -12, -24];
  const cx = vint(mX[k]), cy = GROUND_Y;
  if (mAge[k] < FIRE_DELAY) {
    for (let j = 0; j <= 5; j++) {
      const a = FIRE_DELAY - mAge[k];
      R.putPixel(cx + (j - 3) * (2 + a), cy - 16 + ((j % 3) - 1) * (2 + a), RGB(200, 40, 80));
    }
    return;
  }
  for (let j = 0; j <= 3; j++) {
    const a = mAge[k] - FIRE_DELAY - j * 3;
    if (a < 0 || a >= 6) continue;
    const x = cx + ox[j], y = cy + oy[j], r = 4 + a * 2;
    if (a < 4) {
      disc(x, y, r - 1, RGB(200, 30, 60));
      disc(x, y, Math.trunc(r / 2), RGB(255, 110, 120));
      if (a < 2) disc(x, y, Math.trunc(r / 4), RGB(255, 235, 235));
      ring(x, y, r, RGB(120, 30, 140));
      ring(x, y, r + 1, RGB(60, 10, 50));
    } else ring(x, y, r, RGB(90, 25, 80));
  }
}

function disc(x: number, y: number, r: number, c: number): void {
  if (r < 1) { R.putPixel(x, y, c); return; }
  for (let dy = -r; dy <= r; dy++) {
    const dx = vint(Math.sqrt(r * r - dy * dy) + 0.5);
    R.fillRect(x - dx, y + dy, dx * 2 + 1, 1, c);
  }
}

function ring(x: number, y: number, r: number, c: number): void {
  if (r < 1) return;
  for (let t = 0; t <= 47; t++) R.putPixel(x + clng(r * Math.cos(t * 0.1309)), y + clng(r * Math.sin(t * 0.1309)), c);
}

function firePillar(k: number): void {
  const x0 = vint(mX[k]);
  if (mAge[k] < FIRE_DELAY) {
    for (let j = -3; j <= 3; j += 2) R.putPixel(x0 + j * 2, GROUND_Y - 1 - ((mAge[k] + j) % 2 + 2) % 2, RGB(255, 160, 60));
    return;
  }
  let h = D.MvHbH[mMv[k]] * (mAge[k] < FIRE_DELAY + 3 ? (mAge[k] - FIRE_DELAY + 1) / 3 : 1);
  if (mAge[k] > 34) h = (h * (40 - mAge[k])) / 6;
  for (let y = 0; y <= h - 1; y++) {
    const wob = vint(2 * Math.sin((y + mAge[k] * 3) * 0.5));
    let w = 9 - Math.trunc(y / 6);
    if (w < 2) w = 2;
    const c = y < h / 3 ? RGB(255, 240, 160) : y < (h * 2) / 3 ? RGB(255, 160, 50) : RGB(220, 60, 40);
    R.fillRect(x0 - w + wob, GROUND_Y - 1 - y, w * 2, 1, c);
    if (w > 3) R.fillRect(x0 - Math.trunc(w / 3) + wob, GROUND_Y - 1 - y, Math.trunc((w * 2) / 3), 1, RGB(255, 250, 220));
  }
}

export function hashPart(): number {
  let h = 0;
  for (let k = 0; k <= 1; k++) {
    if (mOn[k]) {
      h = hashMix(h, clng(mX[k] * 100)); h = hashMix(h, mHits[k]); h = hashMix(h, mAge[k]);
    } else h = hashMix(h, -1);
  }
  return clng(h);
}

export function clear(): void {
  mOn[0] = mOn[1] = false;
}

// Port of Combat.bas: hit resolution, guard, combo scaling, meter, hit stop, KO.
import { D, LV_LOW, LV_OVERHEAD, LV_UNBLOCK, MT_NORMAL, MT_RUSH, MT_SUPER_QUAKE, MT_SUPER_RUSH, MT_SUPER_TELE, MT_SUPER_RIFT } from "./data";
import * as FX from "./fx";
import { F, hitRect, hurtRect, applyHit, applyBlock, startSuperSlash, atWall, demonAwake, raging, METER_MAX, ST_GUARD, ST_ATTACK, ST_HIT, ST_THROWN, ST_DOWN } from "./fighter";

export const C = { HitStop: 0, SuperFreeze: 0, SuperOwner: 0, SlowMo: 0, ImpactDark: 0, WhiteFlash: 0, KoFinished: false };
const KO_TICKS = 80;
let mKoTimer = 0;
const mCombo = [0, 0], mComboShow = [0, 0], mComboShown = [0, 0];
let mText = "", mTextTicks = 0, mTextOwner = -1;

export function init(): void {
  C.HitStop = 0; C.SuperFreeze = 0; C.SlowMo = 0; C.ImpactDark = 0; C.WhiteFlash = 0; C.KoFinished = false;
  mKoTimer = 0;
  mCombo[0] = mCombo[1] = 0; mComboShow[0] = mComboShow[1] = 0; mTextTicks = 0;
}

export const isKO = () => mKoTimer > 0;
export const koTicksLeft = () => mKoTimer;
export const comboCount = (a: number) => (mComboShow[a] > 0 ? mComboShown[a] : 0);
export const bannerText = () => (mTextTicks > 0 ? mText : "");
export const bannerOwner = () => mTextOwner;

export function showText(s: string, ticks: number, owner = -1): void {
  mText = s; mTextTicks = ticks; mTextOwner = owner;
}

export function addComboHit(a: number): void {
  mCombo[a]++;
  if (mCombo[a] >= 2) { mComboShown[a] = mCombo[a]; mComboShow[a] = 40; }
}

export function startSuper(i: number): void {
  C.SuperFreeze = 12; C.SuperOwner = i;
  showText("SUPER", 24, i);
}

export function addMeter(i: number, n: number): void {
  F[i].meter = Math.min(METER_MAX, F[i].meter + n);
}

export function tickTimers(): void {
  for (let a = 0; a <= 1; a++) if (mComboShow[a] > 0) mComboShow[a]--;
  if (mTextTicks > 0) mTextTicks--;
  if (C.ImpactDark > 0) C.ImpactDark--;
  if (C.WhiteFlash > 0) C.WhiteFlash--;
}

export function resolve(): void {
  if (mKoTimer > 0) {
    mKoTimer--;
    if (mKoTimer === 0) C.KoFinished = true;
    return;
  }
  for (let a = 0; a <= 1; a++) {
    const d = 1 - a, st = F[d].state;
    if (!(st === ST_HIT || st === ST_THROWN || (st === ST_DOWN && F[d].downPhase === 0))) mCombo[a] = 0;
  }
  checkMelee(0, 1);
  checkMelee(1, 0);
}

function checkMelee(a: number, d: number): void {
  if (F[a].hasHit) return;
  const h = hitRect(a);
  if (!h) return;
  const u = hurtRect(d);
  if (!u) return;
  const ix0 = Math.max(h.x, u.x), iy0 = Math.max(h.y, u.y);
  const ix1 = Math.min(h.x + h.w, u.x + u.w), iy1 = Math.min(h.y + h.h, u.y + u.h);
  if (ix1 <= ix0 || iy1 <= iy0) return;
  F[a].hasHit = true;
  F[a].hitCount++;
  const cx = Math.trunc((ix0 + ix1) / 2), cy = Math.trunc((iy0 + iy1) / 2), mv = F[a].mv;
  if (D.MvType[mv] === MT_RUSH && D.MvP2[mv] > 1) applyAttack(a, d, mv, cx, cy, false, F[a].hitCount >= D.MvP2[mv]);
  else applyAttack(a, d, mv, cx, cy, false, true);
}

/** One hit of move mv from attacker a on defender d at (cx, cy). */
export function applyAttack(a: number, d: number, mv: number, cx: number, cy: number, isProj: boolean, lastHit: boolean): void {
  if (mKoTimer > 0) return;
  const mt = D.MvType[mv];
  const special = mt !== MT_NORMAL;
  let hits = isProj || mt === MT_RUSH ? D.MvP2[mv] : 1;
  if (hits < 1) hits = 1;
  const heavy = D.MvDamage[mv] >= 80;
  let push = heavy ? 2.2 : 0.8;
  if (!lastHit) push = 0.4;
  if (mt === MT_SUPER_QUAKE) push = 3.5;
  // berserk Cheolsan: every special breaks the guard
  const level = special && !isProj && F[a].prefix === "cheolsan" && raging(a) ? LV_UNBLOCK : D.MvLevel[mv];
  if (level === LV_UNBLOCK && F[d].state === ST_GUARD) showText("GUARD BREAK", 24, a);

  if ((mt === MT_SUPER_RUSH || mt === MT_SUPER_TELE || mt === MT_SUPER_RIFT) && !blocks(d, level)) {
    FX.spawn(cx, cy, FX.FX_SLASH);
    startSuperSlash(a, d);
    return;
  }
  if (blocks(d, level)) {
    applyBlock(d, D.MvBlockstun[mv], push * 0.8);
    if (special) dealDamage(d, Math.trunc(D.MvDamage[mv] / (4 * hits)));
    addMeter(a, 15); addMeter(d, 10);
    FX.spawn(cx, cy, FX.FX_BLOCK);
    C.HitStop = 2;
  } else {
    const fd = F[d];
    const counter = !isProj && fd.state === ST_ATTACK && fd.stTick < D.MvStartup[fd.mv];
    mCombo[a]++;
    let dmg = D.MvDamage[mv] / hits;
    // combo scaling: from the 3rd hit each hit is worth 12% less, down to 30%
    if (mCombo[a] >= 3) dmg *= Math.max(0.3, 1 - 0.12 * (mCombo[a] - 2));
    if (counter) dmg *= 1.25;
    if (demonAwake(a)) dmg *= 1.15;
    if (raging(a)) dmg *= 1.25;
    dealDamage(d, Math.floor(dmg + 0.5));
    const ko = F[d].health <= 0;
    let stun = D.MvHitstun[mv];
    // long combos: hitstun shrinks and pushback grows, so a string can never loop forever
    if (mCombo[a] >= 4) { stun = Math.max(2, stun - Math.floor((mCombo[a] - 3) * 1.5)); push *= 1 + 0.2 * (mCombo[a] - 3); }
    if (counter) stun += 4;
    const kd = (D.MvKD[mv] && lastHit) || ko;
    applyHit(d, stun, push, kd);
    F[d].flash = 2;
    addMeter(a, isProj ? 30 : 50);
    addMeter(d, 25);
    FX.spawnHit(cx, cy, heavy || counter, F[a].prefix);
    C.HitStop = heavy || counter ? 4 : 3;
    if (heavy && !isProj && F[a].prefix === "cheolsan") C.HitStop += 2;
    if (counter) showText("COUNTER", 20, a);
    if (mCombo[a] >= 2) { mComboShown[a] = mCombo[a]; mComboShow[a] = 40; }
    if (D.MvLevel[mv] === LV_UNBLOCK) { C.HitStop = 8; C.ImpactDark = 8; C.SlowMo = 24; }
    else if (level === LV_UNBLOCK) C.HitStop = 6;
    if (ko) C.HitStop = 10;
  }
  if (!isProj && atWall(d)) F[a].slide = -F[a].facing * push * 1.2;
}

export function blocks(d: number, level: number): boolean {
  const f = F[d];
  if (f.state !== ST_GUARD) return false;
  if (level === LV_LOW) return f.crouch;
  if (level === LV_OVERHEAD) return !f.crouch;
  if (level === LV_UNBLOCK) return false;
  return true;
}

export function dealDamage(d: number, dmg: number): void {
  const f = F[d];
  f.health = Math.max(0, f.health - dmg);
  f.redCap = Math.max(f.health, f.redCap - Math.trunc(dmg / 2));
  f.trailDelay = 12;
  if (f.health === 0 && mKoTimer === 0) mKoTimer = KO_TICKS;
}

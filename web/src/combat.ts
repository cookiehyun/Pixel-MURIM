import * as Training from "./trainingFrames";
import { advanceTicks } from "./combatTime";
// Port of Combat.bas: hit resolution, guard, combo scaling, meter, hit stop, KO.
import { D, LV_LOW, LV_OVERHEAD, LV_UNBLOCK, MT_NORMAL, MT_RUSH, MT_SUPER_QUAKE, MT_SUPER_RUSH, MT_SUPER_TELE, MT_SUPER_RIFT } from "./data";
import { profiledFight, fastFight } from "./game";
import * as FX from "./fx";
import { F, MV_CHP, canAirFollow, inStartup, strikes, hurtRects, intersection, evades, applyHit, applyBlock, startSuperSlash, atWall, parrying, counterStrike, demonAwake, raging, METER_MAX, ST_GUARD, ST_ATTACK, ST_HIT, ST_THROWN, ST_DOWN } from "./fighter";

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

export function resolve(steps = 1): void {
  if (mKoTimer > 0) {
    mKoTimer = advanceTicks(mKoTimer, steps, -1);
    if (mKoTimer === 0) C.KoFinished = true;
    return;
  }
  for (let a = 0; a <= 1; a++) {
    const d = 1 - a, st = F[d].state;
    if (!(st === ST_HIT || st === ST_THROWN || (st === ST_DOWN && !F[d].onGround))) mCombo[a] = 0;
  }
  const first = meleeContact(0);
  // Cinematic moves and parries take control of the opponent. Only ordinary strikes trade.
  const ordinary = (i: number) => F[i].state === ST_ATTACK && D.MvType[F[i].mv] === MT_NORMAL;
  const simultaneous = profiledFight() && ordinary(0) && ordinary(1);
  const second = simultaneous ? meleeContact(1) : undefined;
  if (first && second) {
    const stop0 = land(first, true);
    const stop1 = land(second, true);
    C.HitStop = Math.max(stop0, stop1);
    Training.contact(0, true);
    Training.contact(1, true);
    return;
  }
  if (first) land(first);
  const other = simultaneous ? second : meleeContact(1);
  if (other) land(other);
}

function meleeContact(a: number) {
  const d = 1-a, f = F[a], defender = F[d];
  const windows = strikes(a);
  if (!windows.length) return;
  const hurts = hurtRects(d);
  for (const {window, boxes} of windows) {
    if (window ? f.struckGroups.includes(window.group) : f.hasHit) continue;
    if (evades(d, window)) continue;
    for (const box of boxes) for (const hurt of hurts) {
      const overlap = intersection(box,hurt);
      if (!overlap) continue;
      const blocked = window ? defender.state === ST_GUARD &&
        (window.guard === "either" || (window.guard === "crouching") === defender.crouch) : undefined;
      return {a, d, mv: f.mv, group: window?.group, blocked, overlap, awake: demonAwake(a)};
    }
  }
  if (windows.length && !f.hasHit) f.contact = "whiff";
}

function land(hit: NonNullable<ReturnType<typeof meleeContact>>, trade = false): number {
  const {a,d,mv,group,blocked,overlap} = hit, f = F[a];
  if (group !== undefined) f.struckGroups.push(group);
  f.hasHit = true;
  f.hitCount++;
  const cx = Math.trunc(overlap.x + overlap.w/2), cy = Math.trunc(overlap.y + overlap.h/2);
  const last = D.MvType[mv] !== MT_RUSH || f.hitCount >= D.MvP2[mv];
  const stop = applyAttack(a,d,mv,cx,cy,false,last,blocked,trade,hit.awake);
  if (!trade) Training.contact(a);
  return stop;
}

/** One hit of move mv from attacker a on defender d at (cx, cy). */
export function applyAttack(a: number, d: number, mv: number, cx: number, cy: number, isProj: boolean, lastHit: boolean, blocked?: boolean, trade = false, awake = demonAwake(a)): number {
  if (mKoTimer > 0 && !trade) return 0;
  if (parrying(d) && D.MvLevel[mv] !== LV_UNBLOCK) { if (!isProj) F[a].contact = "parried"; counterStrike(d, a, cx, cy); return 0; }
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

  if ((mt === MT_SUPER_RUSH || mt === MT_SUPER_TELE || mt === MT_SUPER_RIFT) && !canAirFollow(d) && !blocks(d, level)) {
    FX.spawn(cx, cy, FX.FX_SLASH);
    startSuperSlash(a, d);
    return 0;
  }
  let stop: number;
  if (blocked ?? blocks(d, level)) {
    if (!isProj) F[a].contact = "guard";
    applyBlock(d, D.MvBlockstun[mv], push * 0.8);
    if (special) dealDamage(d, Math.trunc(D.MvDamage[mv] / (4 * hits)));
    addMeter(a, 15); addMeter(d, 10);
    FX.spawn(cx, cy, FX.FX_BLOCK);
    stop = 2;
  } else {
    const fd = F[d];
    const counter = !isProj && inStartup(d);
    if (!isProj) F[a].contact = counter ? "counter" : !fd.onGround ? "air" : "hit";
    mCombo[a]++;
    let dmg = D.MvDamage[mv] / hits;
    // combo scaling: from the 3rd hit each hit is worth 12% less, down to 30%
    if (mCombo[a] >= 3) dmg *= Math.max(0.3, 1 - 0.12 * (mCombo[a] - 2));
    if (counter) dmg *= 1.25;
    if (awake) dmg *= 1.15;
    if (raging(a)) dmg *= 1.25;
    dealDamage(d, Math.floor(dmg + 0.5));
    const ko = F[d].health <= 0;
    let stun = D.MvHitstun[mv];
    // long combos: hitstun shrinks and pushback grows, so a string can never loop forever
    if (mCombo[a] >= 4) { stun = Math.max(2, stun - Math.floor((mCombo[a] - 3) * 1.5)); push *= 1 + 0.2 * (mCombo[a] - 3); }
    if (counter) stun += 4;
    const kd = (D.MvKD[mv] && lastHit) || ko;
    const launch = !ko && !isProj && !fd.onGround && !canAirFollow(d) && fastFight()
      && F[a].kit === "danwoo" && mv === F[a].moves[MV_CHP];
    applyHit(d, stun, push, kd, launch);
    F[d].flash = 2;
    addMeter(a, isProj ? 30 : 50);
    addMeter(d, 25);
    FX.spawnHit(cx, cy, heavy || counter, F[a].prefix);
    stop = heavy || counter ? 4 : 3;
    if (heavy && !isProj && F[a].prefix === "cheolsan") stop += 2;
    if (counter) showText("COUNTER", 20, a);
    if (mCombo[a] >= 2) { mComboShown[a] = mCombo[a]; mComboShow[a] = 40; }
    if (D.MvLevel[mv] === LV_UNBLOCK) { stop = 8; C.ImpactDark = 8; C.SlowMo = 24; }
    else if (level === LV_UNBLOCK) stop = 6;
    if (ko) stop = 10;
  }
  if (!isProj && atWall(d)) F[a].slide = -F[a].facing * push * 1.2;
  if (!trade) C.HitStop = stop;
  return stop;
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

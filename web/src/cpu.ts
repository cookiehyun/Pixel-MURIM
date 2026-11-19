// Port of CpuAI.bas: the CPU opponent produces the same inputs a player would.
import { D, LV_LOW, LV_OVERHEAD, MT_PROJ, MT_PROJ_BOOM, MT_RISE, MT_RUSH, MT_GRAB, MT_TELEPORT, MT_SUPER_FIRE, MT_SUPER_TELE, MT_SUPER_RUSH, MT_SUPER_PROJ, MT_NORMAL, MT_SUPER_GRAB, MT_RAGE, MT_SUPER_RIFT } from "./data";
import {
  F, feedInput, threatened, inRecovery, canAfford, B_LP, B_HP, B_LK, B_HK, METER_MAX, MV_SP1, MV_SP2, MV_SUPER,
  ST_ATTACK, ST_JUMP, ST_DOWN, ST_HIT, ST_LAND, ST_IDLE, ST_WALK, ST_CROUCH, ST_GUARD, ST_THROWN,
} from "./fighter";
import * as Proj from "./projectile";
import { SCREEN_W } from "./renderer";
import { randomize, rnd } from "./util";

export const LV_EASY = 0, LV_NORMAL = 1, LV_HARD = 2;
const SNAPS = 16, QMAX = 8;
let pReact = 4, pMistake = 0.15, pBlock = 0.6, pAntiAir = 0.45, pCombo = 0.55, pTech = 0.3, pAggr = 0.55;
let pSpecial = 0.5, pPunish = 0.55, pRoll = 0.3, pReversal = 0.1, mLevel = LV_NORMAL;

const mk = <T>(v: T) => [0, 1].map(() => new Array<T>(SNAPS).fill(v));
let sAtk = mk(false), sLow = mk(false), sOver = mk(false), sAir = mk(false), sRecov = mk(false), sMv = mk(-1);
const sPos = [0, 0];
const qDir = [new Array(QMAX).fill(0), new Array(QMAX).fill(0)], qPress = [new Array(QMAX).fill(0), new Array(QMAX).fill(0)];
const qHeld = [new Array(QMAX).fill(0), new Array(QMAX).fill(0)], qLen = [0, 0], qPos = [0, 0];
const mPlanDir = [5, 5], mPlanTicks = [0, 0], mGuardDecided = [false, false], mGuardOn = [false, false];
const mGuardLow = [false, false], mGuardMv = [-1, -1], mDownDecided = [false, false], mWakeDecided = [false, false];
const mAADecided = [false, false], mPunishDecided = [false, false], mComboDecided = [false, false];
const mTechDecided = [false, false], mAirDecided = [false, false];

export function init(level: number, seed = 0): void {
  mLevel = level;
  if (level === LV_EASY) {
    pReact = 7; pMistake = 0.35; pBlock = 0.25; pAntiAir = 0.1; pCombo = 0.15;
    pTech = 0; pAggr = 0.35; pSpecial = 0.25; pPunish = 0.2; pRoll = 0.1; pReversal = 0;
  } else if (level === LV_HARD) {
    pReact = 2; pMistake = 0.04; pBlock = 0.9; pAntiAir = 0.85; pCombo = 0.9;
    pTech = 0.85; pAggr = 0.75; pSpecial = 0.8; pPunish = 0.9; pRoll = 0.55; pReversal = 0.35;
  } else {
    pReact = 4; pMistake = 0.15; pBlock = 0.6; pAntiAir = 0.45; pCombo = 0.55;
    pTech = 0.3; pAggr = 0.55; pSpecial = 0.5; pPunish = 0.55; pRoll = 0.3; pReversal = 0.1;
  }
  randomize(seed || Math.floor(Math.random() * 1e9));
  sAtk = mk(false); sLow = mk(false); sOver = mk(false); sAir = mk(false); sRecov = mk(false); sMv = mk(-1);
  for (let i = 0; i <= 1; i++) {
    qLen[i] = 0; qPos[i] = 0; mPlanTicks[i] = 0; mGuardMv[i] = -1; mDownDecided[i] = false; mWakeDecided[i] = false;
  }
}

export const levelName = (l: number) => (l === LV_EASY ? "EASY" : l === LV_HARD ? "HARD" : "NORMAL");

export function observe(i: number): void {
  const o = 1 - i, fo = F[o];
  sPos[i] = (sPos[i] + 1) % SNAPS;
  const p = sPos[i];
  sAtk[i][p] = threatened(i);
  sLow[i][p] = false; sOver[i][p] = false; sMv[i][p] = -1;
  if (fo.state === ST_ATTACK) {
    sMv[i][p] = fo.mv + 1000 * fo.chain;
    sLow[i][p] = D.MvLevel[fo.mv] === LV_LOW;
    sOver[i][p] = D.MvLevel[fo.mv] === LV_OVERHEAD;
  }
  sAir[i][p] = !fo.onGround && (fo.state === ST_JUMP || fo.state === ST_ATTACK) && (F[i].x - fo.x) * fo.vx >= 0;
  sRecov[i][p] = inRecovery(o);
}

const viewIdx = (i: number) => (sPos[i] - pReact + SNAPS * 4) % SNAPS;
const qClear = (i: number) => { qLen[i] = 0; qPos[i] = 0; };

function qAdd(i: number, d: number, press = 0, held = -1): void {
  if (qLen[i] >= QMAX) return;
  qDir[i][qLen[i]] = d; qPress[i][qLen[i]] = press; qHeld[i][qLen[i]] = held < 0 ? press : held;
  qLen[i]++;
}

function qMotion(i: number, motion: string, btn: number): void {
  qClear(i);
  for (let k = 0; k < motion.length; k++) qAdd(i, +motion[k], k === motion.length - 1 ? btn : 0);
}

function qSpecial(i: number, slot: number, heavy: boolean): boolean {
  const cmd = D.MvCmd[F[i].moves[slot]];
  if (cmd.length < 2) return false;
  const btn = cmd.endsWith("K") ? (heavy ? B_HK : B_LK) : heavy ? B_HP : B_LP;
  qMotion(i, cmd.slice(0, -1), btn);
  return true;
}

const specialType = (i: number, slot: number) => D.MvType[F[i].moves[slot]];

function findSpecial(i: number, mt: number): number {
  for (let s = MV_SP1; s <= MV_SP2; s++) {
    let st = specialType(i, s);
    if (st === MT_PROJ_BOOM) st = MT_PROJ;
    if (st === MT_SUPER_GRAB) st = MT_GRAB;
    if (st === MT_SUPER_RUSH) st = MT_RUSH;
    if (st === mt && canAfford(i, s)) return s;
  }
  return -1;
}

export function think(i: number): void {
  if (qPos[i] < qLen[i]) {
    const d = qDir[i][qPos[i]], press = qPress[i][qPos[i]], held = qHeld[i][qPos[i]];
    qPos[i]++;
    if (qPos[i] >= qLen[i]) qClear(i);
    feedInput(i, d, press, held);
    return;
  }
  const o = 1 - i, v = viewIdx(i), f = F[i];
  const dist = Math.abs(F[o].x - f.x);
  let d = 5;
  if (f.state !== ST_THROWN) mTechDecided[i] = false;
  if (f.state !== ST_ATTACK) mComboDecided[i] = false;
  if (f.state !== ST_JUMP) mAirDecided[i] = false;
  if (f.state !== ST_DOWN) { mDownDecided[i] = false; mWakeDecided[i] = false; }

  // Heukrim: draw the sword when there is room (and now and then sheathe it again up close)
  if (f.prefix === "heukrim" && (f.state === ST_IDLE || f.state === ST_WALK)) {
    if ((!f.armed && dist > 26 && rnd() < 0.1) || (f.armed && dist < 16 && rnd() < 0.005)) {
      qSpecial(i, MV_SP1, false);
      return;
    }
  }

  switch (f.state) {
    case ST_THROWN:
      if (!mTechDecided[i]) {
        mTechDecided[i] = true;
        if (rnd() < pTech) { feedInput(i, 5, B_LP | B_LK, B_LP | B_LK); return; }
      }
      break;
    case ST_ATTACK:
      if (f.hasHit && !mComboDecided[i]) {
        mComboDecided[i] = true;
        if (rnd() < pCombo) {
          if (f.meter >= METER_MAX && rnd() < 0.7) qSpecial(i, MV_SUPER, true);
          else if (D.MvType[f.mv] === MT_NORMAL && rnd() < pSpecial) {
            let s = findSpecial(i, MT_PROJ);
            if (s < 0) s = findSpecial(i, MT_RUSH);
            if (s >= 0) qSpecial(i, s, true);
            else qAdd(i, 5, B_HP);
          } else if (f.chain < 2) qAdd(i, f.crouch ? 2 : 5, f.crouch ? B_LK : B_LP);
          else qAdd(i, 5, B_HP);
        }
      }
      if (f.crouch) d = 2;
      break;
    case ST_JUMP:
      if (f.vy > 0 && dist < 26 && !mAirDecided[i]) {
        mAirDecided[i] = true;
        if (rnd() > pMistake) { feedInput(i, 5, B_HK, B_HK); return; }
      }
      break;
    case ST_DOWN:
      if (f.downPhase === 1 && !mDownDecided[i] && f.stTick >= 1) {
        mDownDecided[i] = true;
        if (dist < 50 && rnd() < pRoll) {
          if (Math.abs(f.x - SCREEN_W / 2) > 70 && (f.x < SCREEN_W / 2) === (f.facing > 0)) d = 6;
          else d = rnd() < 0.6 ? 4 : 6;
          feedInput(i, d, 0, 0);
          return;
        }
      } else if (f.downPhase === 2 && !mWakeDecided[i]) {
        mWakeDecided[i] = true;
        if (dist < 34 && rnd() < pReversal) {
          const s = findSpecial(i, MT_RISE);
          if (s >= 0) { qSpecial(i, s, false); think(i); return; }
        }
      }
      if (f.downPhase === 2 && dist < 40 && rnd() < pBlock) d = 4;
      break;
    case ST_HIT: case ST_LAND:
      if (dist < 40 && rnd() < pBlock) d = 4;
      break;
    case ST_IDLE: case ST_WALK: case ST_CROUCH: case ST_GUARD:
      d = neutral(i, o, v, dist);
      if (qLen[i] > 0) { think(i); return; }
      break;
  }
  feedInput(i, d, 0, 0);
}

function neutral(i: number, o: number, v: number, dist: number): number {
  if (sAtk[i][v]) {
    if (!mGuardDecided[i] || sMv[i][v] !== mGuardMv[i]) {
      mGuardDecided[i] = true;
      mGuardMv[i] = sMv[i][v];
      mGuardOn[i] = rnd() < pBlock;
      mGuardLow[i] = mLevel === LV_HARD ? sLow[i][v] : sLow[i][v] || (!sOver[i][v] && rnd() < 0.3);
    }
    if (mGuardOn[i]) { mPlanTicks[i] = 0; return mGuardLow[i] ? 1 : 4; }
  } else mGuardDecided[i] = false;

  if (sAir[i][v] && dist < 42) {
    if (!mAADecided[i]) {
      mAADecided[i] = true;
      if (rnd() < pAntiAir) {
        const s = findSpecial(i, MT_RISE);
        if (s >= 0) qSpecial(i, s, false);
        else { qAdd(i, 2); qAdd(i, 2, B_HP); }
        return 5;
      }
    }
  } else mAADecided[i] = false;

  if (sRecov[i][v] && dist < 34) {
    if (!mPunishDecided[i]) {
      mPunishDecided[i] = true;
      if (rnd() < pPunish) {
        const s = findSpecial(i, MT_GRAB);
        if (s >= 0 && dist < 26) qSpecial(i, s, false);
        else if (dist < 22) qAdd(i, 5, B_HP);
        else qAdd(i, 2, B_HK);
        return 5;
      }
    }
  } else mPunishDecided[i] = false;

  const fo = F[o];
  if (fo.crouch && fo.onGround && dist < 30 && (fo.state === ST_CROUCH || fo.state === ST_GUARD) && rnd() < 0.05 * (1 + pAggr)) {
    qAdd(i, 5, B_HP | B_HK);
    return 5;
  }

  if (F[i].meter >= METER_MAX && rnd() < 0.04 * (1 + pAggr)) {
    const st = specialType(i, MV_SUPER);
    if (st === MT_SUPER_FIRE && D.MvP1[F[i].moves[MV_SUPER]] > 0) { if (dist < 40) { qSpecial(i, MV_SUPER, false); return 5; } }
    else if (st === MT_SUPER_TELE || st === MT_SUPER_FIRE) { qSpecial(i, MV_SUPER, false); return 5; }
    else if (st === MT_SUPER_RUSH) { if (dist < 52) { qSpecial(i, MV_SUPER, true); return 5; } }
    else if (st === MT_SUPER_PROJ) { if (dist > 30) { qSpecial(i, MV_SUPER, true); return 5; } }
    else if (st === MT_RAGE || st === MT_SUPER_RIFT) { if (dist < 64) { qSpecial(i, MV_SUPER, true); return 5; } }
    else if (dist < 38) { qSpecial(i, MV_SUPER, true); return 5; }
  }

  if (mPlanTicks[i] > 0) { mPlanTicks[i]--; return mPlanDir[i]; }

  const r = rnd();
  const ri = (n: number) => Math.floor(rnd() * n);
  const z = zoner(i);
  if (rnd() < pMistake) plan(i, [5, 4, 6, 2][ri(4)], 4 + ri(8));
  else if (z > 0 && dist > 30 && r < 0.4 * z && findSpecial(i, MT_PROJ) >= 0 && !Proj.alive(i)) qSpecial(i, findSpecial(i, MT_PROJ), rnd() < 0.5);
  else if (z > 0 && dist < 42 && r < 0.3 * z) plan(i, 4, 4 + ri(5));
  else if (dist > 55) {
    const s = findSpecial(i, MT_PROJ);
    if (s >= 0 && r < 0.3 * pSpecial + 0.1 && !Proj.alive(i)) qSpecial(i, s, rnd() < 0.5);
    else if (r < 0.5) plan(i, 6, 6 + ri(8));
    else if (r < 0.65) { qAdd(i, 6); qAdd(i, 5); qAdd(i, 6); }
    else if (r < 0.65 + 0.15 * pAggr) qAdd(i, 9);
    else plan(i, 5, 4 + ri(6));
  } else if (dist > 26) {
    let s = findSpecial(i, MT_RUSH);
    if (s < 0) s = findSpecial(i, MT_PROJ);
    if (s >= 0 && r < 0.2 * pSpecial && !Proj.alive(i)) qSpecial(i, s, true);
    else if (r < 0.35 + 0.2 * pAggr) plan(i, 6, 3 + ri(5));
    else if (r < 0.55 + 0.2 * pAggr) qAdd(i, rnd() < 0.5 ? 5 : 2, B_LK);
    else if (r < 0.65 + 0.2 * pAggr) qAdd(i, 9);
    else if (r < 0.85) plan(i, 4, 3 + ri(5));
    else plan(i, 1, 4 + ri(6));
  } else {
    const t = findSpecial(i, MT_TELEPORT);
    if (t >= 0 && rnd() < 0.04 + 0.04 * pSpecial) { qSpecial(i, t, false); return 5; }
    const s = findSpecial(i, MT_GRAB);
    if (r < 0.3 * pAggr + 0.1) qAdd(i, 5, B_LP);
    else if (r < 0.45 * pAggr + 0.2) {
      if (s >= 0 && rnd() < pSpecial) qSpecial(i, s, false);
      else qAdd(i, 5, B_LP | B_LK);
    } else if (r < 0.55 + 0.1 * pAggr) qAdd(i, 2, B_LK);
    else if (r < 0.75) plan(i, 4, 3 + ri(4));
    else if (r < 0.85) { qAdd(i, 4); qAdd(i, 5); qAdd(i, 4); }
    else plan(i, 1, 3 + ri(4));
  }
  return qLen[i] > 0 ? 5 : mPlanDir[i];
}

const zoner = (i: number) => (F[i].prefix === "hongryeon" ? 0.7 : 0);

function plan(i: number, d: number, ticks: number): void {
  mPlanDir[i] = d;
  mPlanTicks[i] = ticks;
}

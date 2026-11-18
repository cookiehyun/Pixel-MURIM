// Port of Tag.bas: 2 vs 2 tag mode (partner waits in F[2 + side], F[4] is the swap buffer).
import { F, init as fighterInit, copyFighter, clearGhosts, NAEGONG_MAX, ST_IDLE, ST_WALK, ST_CROUCH, ST_JUMP } from "./fighter";
import * as FX from "./fx";
import * as Combat from "./combat";
import * as K from "./input";
import { GROUND_Y } from "./renderer";
import { G, isCpu } from "./game";
import * as Lockstep from "./lockstep";
import { rnd, vint } from "./util";

const TAG_COOLDOWN = 40, DROP_HEIGHT = 46, RED_REGEN = 2, CPU_TAG_LOW = 0.5;
let mOn = false;
const mCool = [0, 0], mTags = [0, 0];

export const active = () => mOn;

export function begin(p1a: string, p2a: string, p1b: string, p2b: string, humanIndex: number): void {
  fighterInit(p1b, p2b, humanIndex);
  copyFighter(F[2], F[0]);
  copyFighter(F[3], F[1]);
  fighterInit(p1a, p2a, humanIndex);
  mOn = true;
  mCool[0] = mCool[1] = 0;
}

export function off(): void { mOn = false; }
export const reservePrefix = (s: number) => F[2 + s].prefix;
export const reserveHealth = (s: number) => F[2 + s].health;
export const reserveRed = (s: number) => F[2 + s].redCap;
export const reserveMax = (s: number) => F[2 + s].maxHealth;
export const tagCount = (s: number) => mTags[s];
export const teamRatio = (s: number) => (F[s].health + F[2 + s].health) / (F[s].maxHealth + F[2 + s].maxHealth);

export function resetRound(): void {
  if (!mOn) return;
  for (let i = 0; i <= 1; i++) {
    const f = F[2 + i];
    f.health = f.maxHealth; f.healthShown = f.maxHealth; f.redCap = f.maxHealth; f.naegong = NAEGONG_MAX;
    mCool[i] = 0; mTags[i] = 0;
  }
}

export function tick(): void {
  if (!mOn) return;
  for (let i = 0; i <= 1; i++) {
    if (mCool[i] > 0) mCool[i]--;
    const f = F[2 + i];
    if (f.health < f.redCap) f.health = Math.min(f.redCap, f.health + RED_REGEN);
    f.healthShown = f.health;
    if (f.naegong < NAEGONG_MAX) f.naegong = Math.min(NAEGONG_MAX, f.naegong + 10);
  }
}

export function inputs(allowed: boolean): void {
  if (!mOn || !allowed) return;
  for (let i = 0; i <= 1; i++) {
    if (Lockstep.active()) { if (Lockstep.currentRaw(i) & 0x1000) tryTag(i); }
    else if (G.Multi) { if (K.isPressed(K.keyOf(1 + i, 8))) tryTag(i); }
    else if (isCpu(i)) { if (cpuWantsTag(i)) tryTag(i); }
    else if (i === G.controlled()) { if (K.isPressed(K.BTN_TAG)) tryTag(i); }
  }
}

function canTag(i: number): boolean {
  if (mCool[i] > 0 || F[2 + i].health <= 0) return false;
  const f = F[i];
  return f.onGround && (f.state === ST_IDLE || f.state === ST_WALK || f.state === ST_CROUCH);
}

function cpuWantsTag(i: number): boolean {
  if (!canTag(i)) return false;
  const r = F[i].health / F[i].maxHealth, rr = F[2 + i].health / F[2 + i].maxHealth;
  return r < CPU_TAG_LOW && rr > r + 0.15 && Math.abs(F[0].x - F[1].x) > 30 && rnd() < 0.15;
}

export function tryTag(i: number): void {
  if (!canTag(i)) return;
  const x = F[i].x, fc = F[i].facing, meter = F[i].meter;
  FX.spawn(vint(x + 0.5), vint(F[i].footY) - 16, FX.FX_DARK);
  copyFighter(F[4], F[i]);
  copyFighter(F[i], F[2 + i]);
  copyFighter(F[2 + i], F[4]);
  F[2 + i].state = ST_IDLE; F[2 + i].stTick = 0; F[2 + i].bufAtk = -1;
  const f = F[i];
  f.x = x; f.facing = fc; f.meter = meter; f.footY = GROUND_Y - DROP_HEIGHT; f.vx = 0; f.vy = 0; f.onGround = false;
  f.bufAtk = -1; f.bufDash = 0; f.flash = 0; f.stun = 0; f.chain = 0; f.state = ST_JUMP; f.stTick = 0; f.airAttacked = false;
  clearGhosts(i);
  mCool[i] = TAG_COOLDOWN;
  mTags[i]++;
  Combat.showText("TAG", 16, i);
}

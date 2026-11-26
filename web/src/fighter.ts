// Port of Fighter.bas: the fighter state machine, input decoding, boxes and drawing.
import {
  D, animId, spriteId, moveId, mvKeyOf, hasSprite, hasAnim, animFrame, animFrameHold,
  MT_NORMAL, MT_THROW, MT_PROJ, MT_RISE, MT_RUSH, MT_GRAB, MT_SUPER_PROJ, MT_SUPER_GRAB, MT_SUPER_RUSH,
  MT_TELEPORT, MT_SUPER_TELE, MT_PROJ_BOOM, MT_SUPER_FIRE, MT_SUPER_QUAKE, MT_STANCE, MT_RAGE, MT_SUPER_RIFT, MT_SUPER_CRASH, MT_COUNTER,
} from "./data";
import * as R from "./renderer";
import { GROUND_Y, SCREEN_W } from "./renderer";
import * as FX from "./fx";
import * as Proj from "./projectile";
import * as Combat from "./combat";
import * as Tag from "./tag";
import * as Match from "./match";
import * as K from "./input";
import { G, MODE_ARCADE, MODE_TRAINING } from "./game";
import * as Arcade from "./arcade";
import { RGB, clng, vint } from "./util";

export const ST_IDLE = 0, ST_WALK = 1, ST_CROUCH = 2, ST_JUMP = 3, ST_ATTACK = 4, ST_GUARD = 5, ST_HIT = 6,
  ST_DOWN = 7, ST_THROW = 8, ST_THROWN = 9, ST_DASH = 10, ST_LAND = 11;
export const MV_LP = 0, MV_HP = 1, MV_LK = 2, MV_HK = 3, MV_CLP = 4, MV_CHP = 5, MV_CLK = 6, MV_CHK = 7, MV_JP = 8,
  MV_JK = 9, MV_THROW = 10, MV_SP1 = 11, MV_SP2 = 12, MV_SUPER = 13, MV_OVH = 14;
export const B_LP = 1, B_HP = 2, B_LK = 4, B_HK = 8;
export const METER_MAX = 1000, NAEGONG_MAX = 1000;
const NAEGONG_REGEN = 7;
export const DUMMY_CPU = 0, DUMMY_IDLE = 1, DUMMY_GUARD = 2, DUMMY_ATTACK = 3, DUMMY_CGUARD = 4;

const GRAVITY = 0.5, BACK_WALK = 0.75, GUARD_RANGE = 60, DOWN_LIE_TICKS = 16, GETUP_TICKS = 4, ROLL_TICKS = 8;
const ROLL_SPEED = 3.5, WAKE_THROW_INV = 6, DRAIN_NG = 400, DRAIN_FIRST = 4, DRAIN_EVERY = 5, DRAIN_PULSES = 4;
const DRAIN_RELEASE = DRAIN_FIRST + DRAIN_EVERY * DRAIN_PULSES, DUMMY_INTERVAL = 30, BUF_TICKS = 5, MAX_CHAIN = 3, HIST_LEN = 32, MOTION_WINDOW = 12;
const SUPER_WINDOW = 20, DASH_TICKS = 6, TECH_WINDOW = 3, SG_END = 46, SS_END = 40;
const RAGE_SPEED = 1.35, RIFT_CUTS = 5, RIFT_BREAK = 26, RIFT_END = 40, FLURRY_KICKS = 7, FLURRY_END = 38;

export class TFighter {
  prefix = ""; kit = ""; armed = false;
  state = 0; stTick = 0; x = 0; footY = 0; vx = 0; vy = 0; slide = 0;
  onGround = true; crouch = false; backward = false; facing = 1;
  mv = 0; hasHit = false; chain = 0; airAttacked = false; stun = 0; stunTotal = 0;
  downPhase = 0; rollDir = 0; wakeInv = 0; flash = 0; bufAtk = -1; bufAge = 0; bufDash = 0;
  health = 0; maxHealth = 0; healthShown = 0; redCap = 0; trailDelay = 0; meter = 0; naegong = 0; ngFlash = 0;
  inDir = 5; inPress = 0; inHeld = 0; hist: number[] = new Array(HIST_LEN).fill(5); histPos = 0;
  walkSpeed = 0; dashSpeed = 0; jumpVY = 0; jumpVX = 0; halfW = 0; hurtH = 0; hurtHC = 0; startX = 0;
  aIdle = 0; aWalk = 0; sCrouch = 0; sJump = 0; sGuard = 0; sCGuard = 0; sHit0 = 0; sHit1 = 0; sCHit = 0;
  sDown0 = 0; sDown1 = 0; sRoll0 = 0; sRoll1 = 0; sRoll2 = 0; sRoll3 = 0; sDash = 0; sBDash = 0;
  sPunchA = 0; sPunchB = 0; sLift = 0; sSlam = 0; sSlashA = 0; sSlashB = 0; sSlashC = 0;
  seqFx = 0; superName = ""; sp1Name = ""; hitCount = 0;
  // optional extra frames from hi-res art (-1 = not drawn: the single classic frame is used)
  sCrouchIn = -1; sJumpPrep = -1; sJumpUp = -1; sJumpDown = -1; sLand = -1; sGetup0 = -1; sGetup1 = -1; sDownB = -1; sDash1 = -1; sBDash1 = -1;
  rage = 0; cineSpr = -1; cineX0 = 0; cineCX = 0; cineCY = 0;
  skin = 0; label = "";                         // story stand-ins: palette and HUD name (0 / "" = the fighter itself)
  moves: number[] = new Array(15).fill(0);
  spOrder: number[] = [0, 0, 0];
}

/** 0 / 1 on screen, 2 / 3 tag partners, 4 scratch. */
export const F: TFighter[] = [0, 1, 2, 3, 4].map(() => new TFighter());
let mControl = 0, mDummy = DUMMY_CPU, mDummyTick = 0, mDummyNext = 0, mShowBoxes = false;
const GHOSTS = 4;
const mGX = [[0, 0, 0, 0], [0, 0, 0, 0]], mGY = [[0, 0, 0, 0], [0, 0, 0, 0]], mGId = [[0, 0, 0, 0], [0, 0, 0, 0]];
const mGFlip = [[false, false, false, false], [false, false, false, false]];
const mGN = [0, 0], mPose = [-1, -1], mAwakeShown = [false, false];
const mLandShow = [0, 0];
const mPoseAnim = [-1, -1], mPoseT = [0, 0];       // animated intro / victory pose (drawing only)                     // ticks left of the landing pose after a jump (drawing only)
let mFrame = 0, mDraw = 0;

export function init(c0: string, c1: string, humanIndex: number): void {
  setupCharacter(0, c0, 72);
  setupCharacter(1, c1, 120);
  mControl = humanIndex;
  mDummy = DUMMY_CPU;
  mShowBoxes = false;
}

export const controlled = () => mControl;
export const dummyMode = () => mDummy;
export function setControl(i: number): void { mControl = i; }
export function setDummy(mode: number): void { mDummy = mode; mDummyTick = 0; }
export function toggleBoxes(): void { mShowBoxes = !mShowBoxes; }

function setupCharacter(i: number, prefix: string, x: number): void {
  switch (prefix) {
    case "cheolsan": setup(i, prefix, x, 1.4, 2.6, -4, 1.4, 8, 1080, 34, 25); break;
    case "muyeong": setup(i, prefix, x, 2, 3, -4.4, 1.7, 6, 930, 30, 21); break;
    case "seolhwa": setup(i, prefix, x, 1.85, 3.0, -4.8, 2, 5, 880, 29, 20); break;
    case "heukrim": setup(i, prefix, x, 2.1, 3.3, -4.4, 1.7, 6, 1000, 31, 22); break;
    case "hongryeon": setup(i, prefix, x, 2, 3.2, -4.6, 1.8, 5, 960, 29, 20); break;
    case "cheonma":
      if (i === 1 && G.GameMode === MODE_ARCADE && Arcade.isBossFight()) setup(i, prefix, x, 1.9, 3, -4.3, 1.6, 7, 1400, 32, 23);
      else setup(i, prefix, x, 1.9, 3, -4.3, 1.6, 7, 1000, 32, 23);
      break;
    case "hyeolma": setup(i, prefix, x, 1.9, 3, -4.3, 1.6, 7, 1300, 32, 23); break;   // story final boss
    case "baekmujin": setup(i, prefix, x, 1.9, 3, -4.3, 1.6, 7, 1150, 33, 23); break;  // story boss, the alliance lord
    // story mode: SD art on the same bodies (sd_danwoo is danwoo move for move); 흑사, a rebel elder
    case "sd_danwoo": setup(i, prefix, x, 2, 3.2, -4.5, 1.8, 6, 1000, 30, 21); break;
    case "sd_heuksa": setup(i, prefix, x, 1.9, 3.1, -4.4, 1.7, 6, 1000, 31, 22); break;
    default: setup(i, "danwoo", x, 2, 3.2, -4.5, 1.8, 6, 1000, 30, 21);
  }
  const f = F[i];
  f.seqFx = FX.FX_SLASH;
  switch (f.prefix) {
    case "cheolsan": f.superName = "GEUMGANG BUNNO"; f.sp1Name = "NAHAN BOKMA"; break;
    case "muyeong": f.superName = "MUYEONG CHAMGONG"; f.sp1Name = "MANGEOM GWIJONG"; break;
    case "seolhwa":
      f.superName = "NAKHWA YUSU"; f.seqFx = FX.FX_HIT;
      f.sSlashA = spriteId("seolhwa.hk_1"); f.sSlashB = spriteId("seolhwa.lk_1"); f.sSlashC = spriteId("seolhwa.rush_1");
      break;
    case "heukrim": f.superName = "CHEONMA GANGRIM"; f.seqFx = FX.FX_DARK; break;
    case "hongryeon": f.superName = "HONGRYEON EOPHWA"; break;
    case "cheonma": f.superName = "CHEONMA GEOMBEOP"; f.seqFx = FX.FX_DARK; break;
    case "hyeolma": f.superName = "HYEOLCHEON DAEBEOP"; f.seqFx = FX.FX_DARK; break;
    case "baekmujin": f.superName = "BAEKIL CHEONGEOM"; break;
    case "sd_heuksa": f.superName = "HEUKSA CHEONMANG"; f.seqFx = FX.FX_DARK; break;
    default: f.superName = "CHEONGPUNG JINCHEON";
  }
}

function setup(i: number, prefix: string, x: number, walkSpeed: number, dashSpeed: number, jumpVY: number, jumpVX: number,
  halfW: number, maxHealth: number, hurtH: number, hurtHC: number): void {
  const f = F[i];
  Object.assign(f, { prefix, startX: x, walkSpeed, dashSpeed, jumpVY, jumpVX, halfW, maxHealth, hurtH, hurtHC, armed: false });
  loadKit(i, prefix);
  resetOne(i);
}

const NAMES = ["lp", "hp", "lk", "hk", "clp", "chp", "clk", "chk", "jp", "jk", "throw", "sp1", "sp2", "super", "ovh"];

/** Sprite and move ids for a set ("heukrim" with fists, "heukrimsw" with the sword drawn). */
function loadKit(i: number, kit: string): void {
  const f = F[i], p = kit;
  f.kit = kit;
  f.aIdle = animId(p + ".idle"); f.aWalk = animId(p + ".walk");
  f.sCrouch = spriteId(p + ".crouch"); f.sJump = spriteId(p + ".jump"); f.sGuard = spriteId(p + ".guard");
  f.sCGuard = spriteId(p + ".cguard"); f.sHit0 = spriteId(p + ".hit_0"); f.sHit1 = spriteId(p + ".hit_1");
  f.sCHit = spriteId(p + ".chit"); f.sDown0 = spriteId(p + ".down_0"); f.sDown1 = spriteId(p + ".down_1");
  f.sRoll0 = spriteId(p + ".roll_0"); f.sRoll1 = spriteId(p + ".roll_1"); f.sRoll2 = spriteId(p + ".roll_2");
  f.sRoll3 = spriteId(p + ".roll_3"); f.sDash = spriteId(p + ".dash"); f.sBDash = spriteId(p + ".bdash");
  const opt = (n: string) => (hasSprite(p + "." + n) ? spriteId(p + "." + n) : -1);
  f.sCrouchIn = opt("crouch_in"); f.sJumpPrep = opt("jump_prep"); f.sJumpUp = opt("jump_up"); f.sJumpDown = opt("jump_down");
  f.sLand = opt("land"); f.sGetup0 = opt("getup_0"); f.sGetup1 = opt("getup_1"); f.sDownB = opt("down_b");
  f.sDash1 = opt("dash_1"); f.sBDash1 = opt("bdash_1");
  f.sPunchA = spriteId(p + ".lp_1"); f.sPunchB = spriteId(p + ".hp_1"); f.sLift = spriteId(p + ".throw_1");
  f.sSlam = spriteId(p + ".sp_1"); f.sSlashA = spriteId(p + ".hp_1"); f.sSlashB = spriteId(p + ".chp_1");
  f.sSlashC = spriteId(p + ".lp_1");
  for (let k = 0; k <= 14; k++) f.moves[k] = moveId(p + "." + NAMES[k]);
  f.spOrder = [MV_SUPER, MV_SP1, MV_SP2];
  for (let a = 0; a <= 1; a++)
    for (let b = a + 1; b <= 2; b++)
      if (D.MvCmd[f.moves[f.spOrder[b]]].length > D.MvCmd[f.moves[f.spOrder[a]]].length) {
        const t = f.spOrder[a]; f.spOrder[a] = f.spOrder[b]; f.spOrder[b] = t;
      }
}

export function copyFighter(dst: TFighter, src: TFighter): void {
  Object.assign(dst, src);
  dst.hist = src.hist.slice();
  dst.moves = src.moves.slice();
  dst.spOrder = src.spOrder.slice();
}

export function resetRound(keepMeter = false): void {
  const m0 = F[0].meter, m1 = F[1].meter;
  resetOne(0);
  resetOne(1);
  if (keepMeter) { F[0].meter = m0; F[1].meter = m1; }
}

function resetOne(i: number): void {
  if (F[i].armed) { F[i].armed = false; loadKit(i, F[i].prefix); }
  mGN[i] = 0; mPose[i] = -1; mAwakeShown[i] = false;
  const f = F[i];
  f.x = f.startX; f.footY = GROUND_Y; f.vx = 0; f.vy = 0; f.slide = 0; f.onGround = true; f.crouch = false;
  f.facing = i === 0 ? 1 : -1;
  f.health = f.maxHealth; f.healthShown = f.maxHealth; f.redCap = f.maxHealth; f.trailDelay = 0;
  f.rage = 0; f.cineSpr = -1;
  f.stun = 0; f.wakeInv = 0; f.rollDir = 0; f.flash = 0; f.bufAtk = -1; f.bufDash = 0; f.chain = 0; f.meter = 0;
  f.naegong = NAEGONG_MAX; f.ngFlash = 0; f.inDir = 5; f.inPress = 0; f.inHeld = 0;
  f.hist.fill(5);
  f.state = -1;
  setState(i, ST_IDLE);
}

// ---------------------------------------------------------------- input

export function dirFrom(fwd: boolean, back: boolean, up: boolean, down: boolean): number {
  let d = 5;
  if (fwd) d++;
  if (back && !fwd) d--;
  if (up) d += 3;
  if (down && !up) d -= 3;
  return d;
}

function backHop(t: number): number {
  return t === 1 || t === 5 ? 1.5 : t === 2 || t === 4 ? 2.598 : t === 3 ? 3 : 0;
}

/** Keyboard -> absolute input bits (online sends these). */
export function rawLocal(ks = 0): number {
  let r = 0;
  if (K.isDown(K.keyOf(ks, 0))) r |= 1;
  if (K.isDown(K.keyOf(ks, 1))) r |= 2;
  if (K.isDown(K.keyOf(ks, 2))) r |= 4;
  if (K.isDown(K.keyOf(ks, 3))) r |= 8;
  for (let k = 0; k <= 3; k++) {
    if (K.isPressed(K.keyOf(ks, 4 + k))) r |= 16 << k;
    if (K.isDown(K.keyOf(ks, 4 + k))) r |= 256 << k;
  }
  if (K.isPressed(K.BTN_TAG)) r |= 0x1000;
  return r;
}

export function feedRaw(i: number, r: number): void {
  const l = (r & 1) !== 0, rt = (r & 2) !== 0;
  const d = F[i].facing > 0 ? dirFrom(rt, l, (r & 4) !== 0, (r & 8) !== 0) : dirFrom(l, rt, (r & 4) !== 0, (r & 8) !== 0);
  feedInput(i, d, (r >> 4) & 15, (r >> 8) & 15);
}

export function stateHash(): number {
  let h = 0;
  for (let i = 0; i <= 1; i++) {
    const f = F[i];
    h = hashMix(h, clng(f.x * 100)); h = hashMix(h, clng(f.footY * 100));
    h = hashMix(h, clng(f.vx * 100)); h = hashMix(h, clng(f.vy * 100));
    h = hashMix(h, f.health); h = hashMix(h, f.state); h = hashMix(h, f.stTick);
    h = hashMix(h, f.meter); h = hashMix(h, f.naegong); h = hashMix(h, f.facing);
    h = hashMix(h, f.mv); h = hashMix(h, f.downPhase); h = hashMix(h, f.stun);
    h = hashMix(h, f.kit.length); h = hashMix(h, f.rage);
  }
  if (Tag.active()) for (let i = 2; i <= 3; i++) {
    h = hashMix(h, F[i].health); h = hashMix(h, F[i].naegong); h = hashMix(h, F[i].redCap); h = hashMix(h, F[i].prefix.length);
  }
  h = hashMix(h, Proj.hashPart());
  h = hashMix(h, Combat.C.HitStop); h = hashMix(h, Combat.C.SuperFreeze);
  h = hashMix(h, Match.hashPart());
  return clng(h);
}

export function hashMix(h: number, v: number): number {
  let r = h * 31 + v;
  r = r - Math.floor(r / 1000000007) * 1000000007;
  return r;
}

export function feedHuman(i: number, ks = 0): void {
  const l = K.isDown(K.keyOf(ks, 0)), r = K.isDown(K.keyOf(ks, 1)), u = K.isDown(K.keyOf(ks, 2)), dn = K.isDown(K.keyOf(ks, 3));
  const d = F[i].facing > 0 ? dirFrom(r, l, u, dn) : dirFrom(l, r, u, dn);
  let press = 0, held = 0;
  for (let k = 0; k <= 3; k++) {
    if (K.isPressed(K.keyOf(ks, 4 + k))) press |= 1 << k;
    if (K.isDown(K.keyOf(ks, 4 + k))) held |= 1 << k;
  }
  feedInput(i, d, press, held);
}

export function feedDummy(i: number): void {
  let d = 5, press = 0;
  if (mDummy === DUMMY_CGUARD) { d = 2; if (threatened(i)) d = 1; }
  else if (mDummy === DUMMY_GUARD) { if (threatened(i)) d = 4; }
  else if (mDummy === DUMMY_ATTACK) {
    mDummyTick++;
    if (mDummyTick >= DUMMY_INTERVAL) {
      mDummyTick = 0;
      press = 1 << (mDummyNext % 4);
      if (mDummyNext % 8 >= 4) d = 2;
      mDummyNext++;
    } else if (F[i].state === ST_ATTACK && F[i].crouch) d = 2;
  }
  feedInput(i, d, press, press);
}

export function feedInput(i: number, d: number, press: number, held: number): void {
  const f = F[i];
  f.inDir = d; f.inPress = press; f.inHeld = held;
  f.histPos = (f.histPos + 1) % HIST_LEN;
  f.hist[f.histPos] = d;
  if (f.flash > 0) f.flash--;
  const a = decodeAttack(i);
  if (a >= 0) { f.bufAtk = a; f.bufAge = 0; }
  else if (f.bufAtk >= 0) { f.bufAge++; if (f.bufAge > BUF_TICKS) f.bufAtk = -1; }
  if (tapped(i, 6)) f.bufDash = 1;
  if (tapped(i, 4)) f.bufDash = -1;
  if (d !== 6 && d !== 4) f.bufDash = 0;
}

const histAt = (i: number, t: number) => F[i].hist[(F[i].histPos - t + HIST_LEN * 4) % HIST_LEN];

function tapped(i: number, d: number): boolean {
  if (histAt(i, 0) !== d || histAt(i, 1) === d) return false;
  for (let t = 2; t <= 6; t++) if (histAt(i, t) === d) return histAt(i, t + 1) !== d;
  return false;
}

const dirMatches = (want: number, got: number) => (want === 2 ? got >= 1 && got <= 3 : want === got);

function matchMotion(i: number, dirs: string, window: number): boolean {
  let j = dirs.length, firstHit = -1;
  for (let t = 0; t <= window; t++) {
    if (dirMatches(+dirs[j - 1], histAt(i, t))) {
      if (firstHit < 0) firstHit = t;
      j--;
      if (j === 0) return firstHit <= 4;
    }
  }
  return false;
}

function decodeAttack(i: number): number {
  const f = F[i], press = f.inPress;
  if (press === 0) return -1;
  if ((f.inHeld & (B_LP | B_LK)) === (B_LP | B_LK) && (press & (B_LP | B_LK)) !== 0) return MV_THROW;
  // overhead = both heavy buttons (S + X); walking forward with S stays a plain strong punch
  if ((f.inHeld & (B_HP | B_HK)) === (B_HP | B_HK) && (press & (B_HP | B_HK)) !== 0) return MV_OVH;
  const isP = (press & (B_LP | B_HP)) !== 0, isK = (press & (B_LK | B_HK)) !== 0;
  for (let k = 0; k <= 2; k++) {
    const slot = f.spOrder[k], cmd = D.MvCmd[f.moves[slot]];
    if (cmd.length < 2) continue;
    const btn = cmd[cmd.length - 1];
    if (!((btn === "P" && isP) || (btn === "K" && isK))) continue;
    const motion = cmd.slice(0, -1);
    if (slot === MV_SUPER) {
      if (f.meter >= METER_MAX && matchMotion(i, motion, SUPER_WINDOW)) return slot;
    } else if (matchMotion(i, motion, MOTION_WINDOW)) {
      if (canAfford(i, slot)) return slot;
      f.ngFlash = 12;
    }
  }
  let r = -1;
  if (press & B_LP) r = MV_LP;
  if (press & B_LK) r = MV_LK;
  if (press & B_HP) r = MV_HP;
  if (press & B_HK) r = MV_HK;
  return r;
}

export const canAfford = (i: number, slot: number) => F[i].naegong >= D.MvCost[F[i].moves[slot]];

function takeAttack(i: number): number {
  const a = F[i].bufAtk;
  F[i].bufAtk = -1;
  return a;
}

// ---------------------------------------------------------------- update

export function update(): void {
  mFrame++;
  if (G.GameMode === MODE_TRAINING) {
    if (K.isPressed(K.BTN_SWAP)) { mControl = 1 - mControl; F[0].bufAtk = -1; F[1].bufAtk = -1; }
    if (K.isPressed(K.BTN_DBG_DUMMY)) setDummy((mDummy + 1) % 5);
    if (K.isPressed(K.BTN_DBG_BOX)) mShowBoxes = !mShowBoxes;
    if (K.isPressed(K.BTN_DBG_HIT)) applyHit(1 - mControl, 10, 1.5, false);
    if (K.isPressed(K.BTN_DBG_DOWN)) applyHit(1 - mControl, 0, 1.5, true);
  }
  for (let i = 0; i <= 1; i++) updateFighter(i);
  resolvePush();
  for (let i = 0; i <= 1; i++) { updateFacing(i); updateGhosts(i); }
}

function updateFighter(i: number): void {
  const f = F[i];
  const fwd = f.inDir === 3 || f.inDir === 6 || f.inDir === 9;
  const back = f.inDir === 1 || f.inDir === 4 || f.inDir === 7;
  const u = f.inDir >= 7, d = f.inDir <= 3;
  const wantGuard = back && threatened(i);
  f.stTick++;
  if (f.naegong < NAEGONG_MAX && !(f.state === ST_ATTACK && D.MvCost[f.mv] > 0)) {
    f.naegong += NAEGONG_REGEN;
    if (f.naegong > NAEGONG_MAX) f.naegong = NAEGONG_MAX;
  }
  if (f.ngFlash > 0) f.ngFlash--;
  if (f.wakeInv > 0) f.wakeInv--;
  if (f.rage > 0) {
    f.rage--;
    if (f.state === ST_ATTACK && f.onGround) {            // berserk: half recovery, faster startup
      const s = D.MvStartup[f.mv], a = D.MvActive[f.mv];
      if (f.stTick >= s + a) f.stTick++;
      else if (f.stTick + 1 < s && mFrame % 2 === 0) f.stTick++;
    }
  }
  if (f.slide !== 0) {
    f.x += f.slide;
    f.slide *= 0.6;
    if (Math.abs(f.slide) < 0.1) f.slide = 0;
  }
  switch (f.state) {
    case ST_IDLE: case ST_WALK: case ST_CROUCH:
      actionable(i, fwd, back, u, d, wantGuard); break;
    case ST_GUARD:
      if (f.stun > 0) { f.stun--; f.x += f.vx; f.vx *= 0.7; }
      else actionable(i, fwd, back, u, d, wantGuard);
      break;
    case ST_DASH:
      f.x += f.vx;
      if (u && !f.backward && f.stTick >= 2) {
        setState(i, ST_JUMP);
        f.onGround = false; f.airAttacked = false; f.vy = f.jumpVY; f.vx = f.facing * f.jumpVX * 1.7; f.footY = GROUND_Y;
      } else if (f.backward) f.footY = GROUND_Y - backHop(f.stTick);
      if (f.state === ST_DASH && f.stTick >= DASH_TICKS) { f.footY = GROUND_Y; setState(i, ST_IDLE); }
      break;
    case ST_JUMP: {
      const atk = takeAttack(i);
      if (atk >= 0 && !f.airAttacked) {
        f.airAttacked = true;
        f.mv = atk === MV_LK || atk === MV_HK ? f.moves[MV_JK] : f.moves[MV_JP];
        f.hasHit = false;
        setState(i, ST_ATTACK);
      }
      if (airStep(i)) { setState(i, ST_IDLE); mLandShow[i] = 3; }
      break;
    }
    case ST_ATTACK: updateAttack(i, d); break;
    case ST_LAND: f.stun--; if (f.stun <= 0) setState(i, ST_IDLE); break;
    case ST_HIT:
      f.x += f.vx; f.vx *= 0.7; f.stun--;
      if (f.stun <= 0) setState(i, f.crouch ? ST_CROUCH : ST_IDLE);
      break;
    case ST_DOWN:
      switch (f.downPhase) {
        case 0: if (airStep(i)) { f.downPhase = 1; f.stTick = 0; } break;
        case 1:
          if (f.health > 0) {
            if ((fwd || back) && histAt(i, 1) !== f.inDir && f.stTick >= 1) {
              f.downPhase = 3; f.stTick = 0; f.rollDir = fwd ? f.facing : -f.facing;
            } else if (f.stTick >= DOWN_LIE_TICKS) { f.downPhase = 2; f.stTick = 0; }
          }
          break;
        case 3:
          f.x += f.rollDir * ROLL_SPEED;
          if (f.stTick >= ROLL_TICKS) { f.downPhase = 2; f.stTick = 0; }
          break;
        default:
          if (f.stTick >= GETUP_TICKS) { setState(i, ST_IDLE); f.wakeInv = WAKE_THROW_INV; }
      }
      break;
    case ST_THROW: {
      const mt = D.MvType[f.mv];
      if (mt === MT_SUPER_GRAB) superGrabStep(i);
      else if (mt === MT_SUPER_RIFT) riftStep(i);
      else if (mt === MT_SUPER_RUSH && f.prefix === "seolhwa" && f.mv === f.moves[MV_SUPER]) flurryStep(i);
      else if (mt === MT_SUPER_RUSH || mt === MT_SUPER_TELE) superSlashStep(i);
      else if (isDrain(i)) drainStep(i);
      else if (f.stTick === D.MvStartup[f.mv]) {
        Combat.dealDamage(1 - i, D.MvDamage[f.mv]);
        Combat.addMeter(i, 80);
        applyHit(1 - i, 0, 2.5, true);
        FX.spawn(vint(F[1 - i].x + 0.5), vint(F[1 - i].footY) - 18, FX.FX_HEAVY);
        Combat.C.HitStop = 4;
      }
      if ((mt === MT_THROW || mt === MT_GRAB) && f.stTick >= moveTotal(f.mv)) setState(i, ST_IDLE);
      break;
    }
    case ST_THROWN:
      if (F[1 - i].prefix === "hyeolma" && (F[1 - i].state !== ST_THROW || F[1 - i].health <= 0)) {
        applyHit(i, 4, 0, f.health <= 0);
        break;
      }
      f.vx = 0;
      if (f.stTick <= TECH_WINDOW && f.bufAtk === MV_THROW && D.MvType[F[1 - i].mv] === MT_THROW) techThrow(i);
      break;
  }
  clampX(i);
}

function updateAttack(i: number, d: boolean): void {
  const f = F[i], mt = D.MvType[f.mv], t = f.stTick;
  switch (mt) {
    case MT_PROJ: case MT_SUPER_PROJ: case MT_PROJ_BOOM: case MT_SUPER_FIRE:
      if (t === D.MvStartup[f.mv]) {
        Proj.spawn(i, f.mv);
        if (mt === MT_SUPER_FIRE) Combat.showText(f.superName, 40, i);
      }
      break;
    case MT_NORMAL:
      if (t < D.MvStartup[f.mv] && f.onGround && D.MvP1[f.mv] > 0) f.x += f.facing * D.MvP1[f.mv];
      break;
    case MT_RISE:
      if (t === D.MvStartup[f.mv]) { f.onGround = false; f.vy = D.MvP1[f.mv]; f.vx = f.facing * 0.8; }
      break;
    case MT_RUSH: case MT_SUPER_RUSH:
      if (t >= D.MvStartup[f.mv] && t < D.MvStartup[f.mv] + D.MvActive[f.mv]) {
        f.x += f.facing * D.MvP1[f.mv];
        if (mt === MT_RUSH && D.MvP2[f.mv] > 1 && f.hasHit && f.hitCount < D.MvP2[f.mv]) {
          if ((t - D.MvStartup[f.mv]) % Math.trunc(D.MvActive[f.mv] / D.MvP2[f.mv]) === 0) f.hasHit = false;
        }
      }
      break;
    case MT_GRAB: case MT_SUPER_GRAB:
      if (t === D.MvStartup[f.mv] && tryGrab(i, f.mv)) return;
      break;
    case MT_STANCE:
      if (t === D.MvStartup[f.mv]) toggleArms(i);
      break;
    case MT_RAGE:
      if (t === D.MvStartup[f.mv]) {
        f.rage = D.MvP1[f.mv];
        Combat.showText(f.superName, 40, i);
        FX.spawn(vint(f.x + 0.5), vint(f.footY) - 20, FX.FX_HEAVY);
      }
      break;
    case MT_SUPER_RIFT:
      if (t === D.MvStartup[f.mv]) riftDash(i);
      break;
    case MT_SUPER_CRASH:
      if (t >= D.MvStartup[f.mv]) crashStep(i, t - D.MvStartup[f.mv]);
      break;
    case MT_SUPER_QUAKE:
      if (t === D.MvStartup[f.mv]) {
        if (f.mv === f.moves[MV_SUPER]) Combat.showText(f.superName, 40, i);
        FX.spawn(vint(f.x + 0.5), vint(f.footY) - 4, FX.FX_BLOCK);
      }
      break;
    case MT_TELEPORT: case MT_SUPER_TELE:
      if (t === 1) FX.spawn(vint(f.x + 0.5), vint(f.footY) - 16, FX.FX_DARK);
      if (t === D.MvStartup[f.mv] - 1) {
        teleport(i);
        FX.spawn(vint(f.x + 0.5), vint(f.footY) - 16, FX.FX_DARK);
      }
      break;
  }
  if (!f.onGround) {
    if (airStep(i)) {
      if (mt === MT_RISE) { setState(i, ST_LAND); f.stun = D.MvRecovery[f.mv]; }
      else setState(i, ST_IDLE);
    }
    return;
  }
  if (f.hasHit && f.bufAtk >= 0 && f.bufAtk !== MV_THROW) {
    if (f.bufAtk >= MV_SP1 && f.bufAtk <= MV_SUPER && canCancelIntoSpecial(i, f.bufAtk)) {
      startAttack(i, takeAttack(i), d, true);
      return;
    } else if (f.bufAtk < MV_SP1 && f.chain < chainMax(i) && (isLight(f.mv) || flowChain(i))) {
      const atk = takeAttack(i);
      f.chain++;
      startAttack(i, atk, d, true);
      return;
    }
  }
  if (t >= moveTotal(f.mv)) setState(i, d ? ST_CROUCH : ST_IDLE);
}

function canCancelIntoSpecial(i: number, slot: number): boolean {
  const cur = D.MvType[F[i].mv];
  return slot === MV_SUPER ? cur !== MT_SUPER_PROJ && cur !== MT_SUPER_GRAB : cur === MT_NORMAL;
}

function actionable(i: number, fwd: boolean, back: boolean, u: boolean, d: boolean, wantGuard: boolean): void {
  let atk = takeAttack(i);
  const f = F[i];
  if (atk === MV_THROW) {
    if (tryThrow(i)) return;
    atk = MV_LP;
  }
  if (atk >= 0 && startAttack(i, atk, d, false)) return;
  if (f.bufDash !== 0) {
    f.backward = f.bufDash < 0;
    f.vx = f.facing * f.dashSpeed * f.bufDash * (f.rage > 0 ? RAGE_SPEED : 1);
    f.bufDash = 0;
    setState(i, ST_DASH);
  } else if (u) {
    setState(i, ST_JUMP);
    f.onGround = false; f.airAttacked = false; f.vy = f.jumpVY;
    f.vx = fwd ? f.facing * f.jumpVX : back ? -f.facing * f.jumpVX : 0;
  } else if (wantGuard) {
    f.crouch = d;
    setState(i, ST_GUARD);
  } else if (d) setState(i, ST_CROUCH);
  else if (fwd || back) {
    f.backward = back;
    setState(i, ST_WALK);
    const k = f.rage > 0 ? RAGE_SPEED : 1;
    if (back) f.x -= f.facing * f.walkSpeed * BACK_WALK * k;
    else f.x += f.facing * f.walkSpeed * k;
  } else setState(i, ST_IDLE);
}

function startAttack(i: number, atk: number, crouching: boolean, chained: boolean): boolean {
  const f = F[i];
  let mv: number;
  if (atk === MV_THROW) atk = MV_LP;
  if (atk === MV_OVH && crouching) atk = MV_HP;
  if (atk === MV_OVH) { mv = f.moves[MV_OVH]; crouching = false; }
  else if (atk >= MV_SP1) {
    mv = f.moves[atk];
    if (atk === MV_SP1 && f.rage > 0 && f.prefix === "hyeolma") mv = bloodWaveMove();   // in the frenzy: the blood wave
    const mt = D.MvType[mv];
    if ((mt === MT_PROJ || mt === MT_SUPER_PROJ || mt === MT_PROJ_BOOM || mt === MT_SUPER_FIRE) && Proj.alive(i)) return false;
    if (!canAfford(i, atk)) return false;
    if (atk === MV_SUPER) {
      if (f.meter < METER_MAX) return false;
      f.meter = 0;
      Combat.startSuper(i);
    }
    f.naegong -= D.MvCost[mv];
    crouching = false;
  } else if (crouching) mv = f.moves[atk + 4];
  else mv = f.moves[atk];
  f.mv = mv; f.crouch = crouching; f.vx = 0; f.hasHit = false; f.hitCount = 0;
  if (!chained) f.chain = 0;
  setState(i, ST_ATTACK);
  return true;
}

function canBeGrabbed(o: number): boolean {
  const f = F[o];
  if (!f.onGround || f.wakeInv > 0) return false;
  switch (f.state) {
    case ST_IDLE: case ST_WALK: case ST_CROUCH: case ST_DASH: case ST_LAND: return true;
    case ST_GUARD: return f.stun === 0;
    case ST_ATTACK: return f.stTick >= D.MvStartup[f.mv] + D.MvActive[f.mv];
  }
  return false;
}

const tryThrow = (i: number) => tryGrab(i, F[i].moves[MV_THROW]);

function tryGrab(i: number, mv: number): boolean {
  const o = 1 - i;
  const reach = D.MvHbX[mv] + D.MvHbW[mv];
  if (Math.abs(F[o].x - F[i].x) > reach) return false;
  if (!canBeGrabbed(o)) return false;
  F[i].mv = mv; F[i].vx = 0;
  setState(i, ST_THROW);
  setState(o, ST_THROWN);
  F[o].crouch = false; F[o].bufAtk = -1;
  if (D.MvType[mv] !== MT_SUPER_GRAB && !isDrain(i)) F[o].x = F[i].x + F[i].facing * (F[i].halfW + F[o].halfW - 2);
  if (D.MvType[mv] === MT_SUPER_GRAB) FX.spawn(vint(F[o].x + 0.5), vint(F[o].footY) - 20, FX.FX_HEAVY);
  return true;
}

function superGrabStep(i: number): void {
  const o = 1 - i, f = F[i], t = f.stTick;
  if (t <= 4) {
    const tx = F[o].x - f.facing * (f.halfW + F[o].halfW - 2);
    f.x += (tx - f.x) * 0.5;
  }
  const hx = vint(F[o].x + 0.5) - f.facing * 2, hy = vint(F[o].footY) - 22;
  if (t === 6 || t === 10 || t === 14 || t === 18) {
    Combat.dealDamage(o, 40); Combat.addComboHit(i);
    F[o].flash = 1;
    FX.spawn(hx, hy, t === 18 ? FX.FX_HEAVY : FX.FX_HIT);
    Combat.C.HitStop = 2;
  } else if (t === 34) {
    F[o].footY = GROUND_Y;
    F[o].x = f.x + f.facing * (f.halfW + F[o].halfW + 6);
    Combat.dealDamage(o, Math.max(0, D.MvDamage[f.mv] - 160)); Combat.addComboHit(i);
    applyHit(o, 0, 1.2, true);
    F[o].vy = -2; F[o].flash = 2;
    FX.spawn(vint(F[o].x + 0.5), GROUND_Y - 3, FX.FX_SLAM);
    FX.spawn(vint(F[o].x + 0.5) - 8, GROUND_Y - 6, FX.FX_HEAVY);
    FX.spawn(vint(F[o].x + 0.5) + 8, GROUND_Y - 6, FX.FX_HEAVY);
    Combat.C.HitStop = 8;
    Combat.showText(moveName(i), 40, i);
  }
  if (t >= 22 && t < 34 && F[o].state === ST_THROWN) {
    F[o].x = f.x + f.facing * (t < 30 ? 3 : 3 + (t - 29) * 4);
    F[o].footY = GROUND_Y - (t < 28 ? (t - 21) * 5 : t < 30 ? 30 : 30 - (t - 29) * 6);
  }
  if (t >= SG_END) setState(i, ST_IDLE);
}

function teleport(i: number): void {
  const o = 1 - i, f = F[i];
  const sd = F[o].x >= f.x ? 1 : -1;
  const gap = f.halfW + F[o].halfW + 3;
  let nx = F[o].x + sd * gap;
  if (nx < f.halfW || nx > SCREEN_W - f.halfW) nx = F[o].x - sd * gap;
  f.x = nx;
  f.facing = F[o].x > f.x ? 1 : -1;
}

export function vanished(i: number): boolean {
  const f = F[i];
  if (f.state !== ST_ATTACK) return false;
  const mt = D.MvType[f.mv];
  return (mt === MT_TELEPORT || mt === MT_SUPER_TELE) && f.stTick >= 1 && f.stTick < D.MvStartup[f.mv];
}

export function startSuperSlash(a: number, d: number): void {
  F[a].vx = 0;
  setState(a, ST_THROW);
  setState(d, ST_THROWN);
  F[d].crouch = false; F[d].bufAtk = -1; F[d].footY = GROUND_Y; F[d].onGround = true;
  F[a].cineCX = vint(F[d].x + 0.5); F[a].cineCY = GROUND_Y - 20;
}

function superSlashStep(i: number): void {
  const o = 1 - i, f = F[i], t = f.stTick;
  const cx = vint(F[o].x + 0.5), cy = vint(F[o].footY) - 18;
  if (t === 2 || t === 5 || t === 8 || t === 11 || t === 14 || t === 17) {
    Combat.dealDamage(o, 30); Combat.addComboHit(i);
    F[o].flash = 1;
    FX.spawn(cx + (t % 3) - 1, cy + (Math.trunc(t / 3) % 3) * 3 - 3, f.seqFx);
    Combat.C.HitStop = 1;
    f.x += f.facing * (Math.trunc(t / 3) % 2 === 0 ? 1 : -1);
  } else if (t === 26) {
    Combat.dealDamage(o, Math.max(0, D.MvDamage[f.mv] - 180)); Combat.addComboHit(i);
    applyHit(o, 0, 3, true);
    F[o].flash = 2;
    FX.spawn(cx, cy, f.seqFx); FX.spawn(cx, cy - 4, FX.FX_HEAVY); FX.spawn(cx, cy + 4, FX.FX_HEAVY);
    Combat.C.HitStop = 8;
    Combat.showText(moveName(i), 40, i);
  }
  if (t >= SS_END) setState(i, ST_IDLE);
}

function techThrow(i: number): void {
  const o = 1 - i;
  setState(i, ST_GUARD); F[i].stun = 6; F[i].vx = -F[i].facing * 2.5;
  setState(o, ST_GUARD); F[o].stun = 6; F[o].vx = -F[o].facing * 2.5;
  F[i].bufAtk = -1;
  FX.spawn(vint((F[0].x + F[1].x) / 2), vint(F[i].footY) - 22, FX.FX_BLOCK);
  Combat.showText("ESCAPE", 20);
}

const flowChain = (i: number) => F[i].prefix === "seolhwa" && D.MvType[F[i].mv] === MT_NORMAL && F[i].onGround;
const chainMax = (_i: number) => MAX_CHAIN;

function isLight(mv: number): boolean {
  for (let k = 0; k <= 1; k++) {
    const m = F[k].moves;
    if (mv === m[MV_LP] || mv === m[MV_LK] || mv === m[MV_CLP] || mv === m[MV_CLK]) return true;
  }
  return false;
}

export const moveTotal = (mv: number) => D.MvStartup[mv] + D.MvActive[mv] + D.MvRecovery[mv];

export function threatened(i: number): boolean {
  const o = 1 - i;
  let t = false;
  if (F[o].state === ST_ATTACK) {
    const mv = F[o].mv;
    let reach = D.MvHbX[mv] + D.MvHbW[mv] + F[i].halfW + 8;
    if (D.MvType[mv] === MT_RUSH || D.MvType[mv] === MT_SUPER_RUSH) reach += D.MvP1[mv] * D.MvActive[mv];
    if (reach < 26) reach = 26;
    if (reach > GUARD_RANGE) reach = GUARD_RANGE;
    if (Math.abs(F[o].x - F[i].x) < reach) t = true;
  }
  if (Proj.incomingDistance(i) < 30) t = true;
  return t;
}

function airStep(i: number): boolean {
  const f = F[i];
  f.vy += GRAVITY; f.footY += f.vy; f.x += f.vx;
  if (f.footY >= GROUND_Y) {
    f.footY = GROUND_Y; f.vy = 0; f.vx = 0; f.onGround = true;
    return true;
  }
  return false;
}

export function setState(i: number, st: number): void {
  const f = F[i];
  if (i < 2 && st !== ST_THROW && isDrain(i) && F[1 - i].state === ST_THROWN) {
    applyHit(1 - i, 4, 0, F[1 - i].health <= 0);
  }
  if (f.state !== st || st === ST_ATTACK || st === ST_HIT || st === ST_DOWN || st === ST_THROW || st === ST_DASH) f.stTick = 0;
  f.state = st;
  f.cineSpr = -1;
  if (st === ST_CROUCH) f.crouch = true;
  if (st === ST_IDLE || st === ST_WALK || st === ST_JUMP || st === ST_DASH) f.crouch = false;
}

export function applyHit(i: number, hitstun: number, push: number, knockdown: boolean): void {
  const f = F[i];
  f.bufAtk = -1;
  if (f.onGround) f.footY = GROUND_Y;
  if (knockdown || !f.onGround) {
    setState(i, ST_DOWN);
    f.downPhase = 0; f.onGround = false; f.vy = -3.5; f.vx = -f.facing * push;
  } else {
    f.crouch = f.state === ST_CROUCH || ((f.state === ST_ATTACK || f.state === ST_GUARD || f.state === ST_HIT) && f.crouch);
    setState(i, ST_HIT);
    f.stun = hitstun; f.stunTotal = hitstun; f.vx = -f.facing * push;
  }
  clampX(i);
}

export function applyBlock(i: number, blockstun: number, push: number): void {
  setState(i, ST_GUARD);
  F[i].stun = blockstun;
  F[i].vx = -F[i].facing * push;
}

export const atWall = (i: number) => F[i].x <= F[i].halfW + 0.5 || F[i].x >= SCREEN_W - F[i].halfW - 0.5;

function clampX(i: number): void {
  const f = F[i];
  if (f.x < f.halfW) f.x = f.halfW;
  if (f.x > SCREEN_W - f.halfW) f.x = SCREEN_W - f.halfW;
  if (f.state === ST_DOWN) {
    const id = currentSprite(i);
    let l: number, r: number;
    if (f.facing < 0) { l = vint(f.x + 0.5) + D.SprAX[id] - (D.SprW[id] - 1); r = vint(f.x + 0.5) + D.SprAX[id]; }
    else { l = vint(f.x + 0.5) - D.SprAX[id]; r = l + D.SprW[id] - 1; }
    if (l < 0) f.x -= l;
    if (r > SCREEN_W - 1) f.x -= r - (SCREEN_W - 1);
  }
}

function resolvePush(): void {
  if (Math.abs(F[0].footY - F[1].footY) > 14) return;
  if (F[0].state === ST_DOWN || F[1].state === ST_DOWN) return;
  if (F[0].state === ST_THROWN || F[1].state === ST_THROWN) return;
  if (vanished(0) || vanished(1)) return;
  let dx = F[1].x - F[0].x;
  const minD = F[0].halfW + F[1].halfW;
  if (Math.abs(dx) >= minD) return;
  const s = dx > 0 ? 1 : dx < 0 ? -1 : F[0].facing;
  const ov = minD - Math.abs(dx);
  F[0].x -= (s * ov) / 2;
  F[1].x += (s * ov) / 2;
  clampX(0); clampX(1);
  dx = F[1].x - F[0].x;
  if (Math.abs(dx) < minD) {
    if (F[0].x <= F[0].halfW || F[0].x >= SCREEN_W - F[0].halfW) { F[1].x = F[0].x + s * minD; clampX(1); }
    else { F[0].x = F[1].x - s * minD; clampX(0); }
  }
}

function updateFacing(i: number): void {
  const o = 1 - i, f = F[i];
  if (f.state === ST_IDLE || f.state === ST_WALK || f.state === ST_CROUCH || f.state === ST_GUARD) {
    if (F[o].x > f.x) f.facing = 1;
    else if (F[o].x < f.x) f.facing = -1;
  }
}

// ---------------------------------------------------------------- boxes

export function inActive(i: number): boolean {
  const f = F[i];
  if (f.state !== ST_ATTACK) return false;
  return f.stTick >= D.MvStartup[f.mv] && f.stTick < D.MvStartup[f.mv] + D.MvActive[f.mv];
}

export function inRecovery(i: number): boolean {
  const f = F[i];
  if (f.state === ST_LAND) return true;
  if (f.state === ST_ATTACK && f.onGround) return f.stTick >= D.MvStartup[f.mv] + D.MvActive[f.mv];
  return false;
}

export interface Box { x: number; y: number; w: number; h: number }

export function hitRect(i: number): Box | null {
  if (!inActive(i)) return null;
  const f = F[i], mv = f.mv, mt = D.MvType[mv];
  if (mt === MT_PROJ || mt === MT_SUPER_PROJ || mt === MT_GRAB || mt === MT_SUPER_GRAB || mt === MT_THROW) return null;
  if (mt === MT_PROJ_BOOM || mt === MT_SUPER_FIRE || mt === MT_TELEPORT || mt === MT_STANCE) return null;
  if (mt === MT_RAGE || mt === MT_SUPER_RIFT || mt === MT_SUPER_CRASH) return null;
  const w = D.MvHbW[mv], h = D.MvHbH[mv];
  const x = f.facing > 0 ? vint(f.x + 0.5) + D.MvHbX[mv] : vint(f.x + 0.5) - D.MvHbX[mv] - w + 1;
  return { x, y: vint(f.footY + 0.5) + D.MvHbY[mv], w, h };
}

export function hurtRect(i: number): Box | null {
  const f = F[i];
  if (f.state === ST_DOWN || f.state === ST_THROWN) return null;
  if (vanished(i)) return null;
  if (f.state === ST_ATTACK && D.MvType[f.mv] === MT_RISE && f.stTick < D.MvP2[f.mv]) return null;
  const h = f.crouch ? f.hurtHC : f.hurtH;
  const w = vint(f.halfW * 2 + 4);
  return { x: vint(f.x + 0.5) - Math.trunc(w / 2), y: vint(f.footY + 0.5) - h, w, h };
}

// ---------------------------------------------------------------- draw

export function draw(): void {
  drawGhosts(1 - mControl);
  drawGhosts(mControl);
  drawOne(1 - mControl);
  drawOne(mControl);
  mDraw++;
  for (let i = 0; i <= 1; i++) {
    if (F[i].state === ST_THROW && D.MvType[F[i].mv] === MT_SUPER_RIFT) drawRifts(i);
    if (F[i].state === ST_THROW && F[i].prefix === "seolhwa" && F[i].mv === F[i].moves[MV_SUPER]) drawFlurry(i);
    if (F[i].state === ST_ATTACK && D.MvType[F[i].mv] === MT_SUPER_RIFT) drawRiftStreak(i, F[i].stTick - D.MvStartup[F[i].mv]);
    if (F[i].prefix !== "hyeolma" && F[i].state === ST_ATTACK && D.MvType[F[i].mv] === MT_RAGE) drawRoar(i);
    if (F[i].state === ST_ATTACK && D.MvType[F[i].mv] === MT_SUPER_CRASH) drawCrash(i, F[i].stTick - D.MvStartup[F[i].mv]);
  }
  for (let i = 0; i <= 1; i++) {
    if (isDrain(i)) drawDrainOrbs(i);
    const f = F[i];
    if (f.kit === "cheonma" && f.state === ST_ATTACK && f.mv === f.moves[MV_SP1]) drawDemonPalm(i);
    if (f.kit === "hyeolma" && f.state === ST_ATTACK && f.mv === bloodWaveMove()) drawBloodWave(i);
    if (f.kit === "cheonmasw" && f.state === ST_ATTACK && f.mv === f.moves[MV_SP1]) drawDemonCut(i);
    if ((f.prefix === "danwoo" || f.prefix === "sd_danwoo") && f.state === ST_ATTACK) {
      const own = D.SprHi[currentSprite(i)] && D.SprHiS[currentSprite(i)] !== 3;   // hi-res art that draws its own effects
      if (f.mv === f.moves[MV_SP1] && !own) drawWindPalm(i);
      if (f.mv === f.moves[MV_SP2] && !own) drawSpinFist(i);
      if (f.mv === f.moves[MV_SUPER]) drawQuake(i);
    }
  }
  if (mShowBoxes) { drawBoxes(0); drawBoxes(1); }
}

export function setPose(i: number, nm: string): void {
  mPose[i] = -1; mPoseAnim[i] = -1; mPoseT[i] = mFrame;
  if (!nm) return;
  // a whole animation when the art has one (intro salute, victory sequence), else the single pose
  const an = F[i].prefix + "." + (nm === "win" ? "winpose" : nm);
  if (hasAnim(an)) { mPoseAnim[i] = animId(an); mPose[i] = animFrameHold(mPoseAnim[i], 0); }
  else if (hasSprite(F[i].prefix + "." + nm)) mPose[i] = spriteId(F[i].prefix + "." + nm);
}

export function clearGhosts(i: number): void { mGN[i] = 0; }

function ghostColor(i: number): number {
  if (F[i].prefix === "hyeolma" && raging(i)) return -1;
  if (F[i].rage > 0) return RGB(150, 24, 18);
  return F[i].prefix === "heukrim" || F[i].prefix === "sd_heuksa" ? RGB(74, 56, 96) : F[i].prefix === "cheonma" ? RGB(60, 44, 92) : F[i].prefix === "hyeolma" ? RGB(96, 30, 40) : -1;
}

function updateGhosts(i: number): void {
  if (mLandShow[i] > 0 && (F[i].state !== ST_IDLE && F[i].state !== ST_WALK)) mLandShow[i] = 0;
  else if (mLandShow[i] > 0) mLandShow[i]--;
  if (ghostColor(i) < 0) { mGN[i] = 0; return; }
  const f = F[i];
  let want = false;
  if (f.state === ST_DASH || f.state === ST_JUMP) want = true;
  else if (f.state === ST_ATTACK) {
    const mt = D.MvType[f.mv];
    want = mt === MT_TELEPORT || mt === MT_SUPER_TELE || !f.onGround || (f.rage > 0 && (mt === MT_RUSH || mt === MT_SUPER_RUSH));
  }
  if (want) {
    for (let k = GHOSTS - 1; k >= 1; k--) {
      mGX[i][k] = mGX[i][k - 1]; mGY[i][k] = mGY[i][k - 1]; mGId[i][k] = mGId[i][k - 1]; mGFlip[i][k] = mGFlip[i][k - 1];
    }
    mGX[i][0] = vint(f.x + 0.5); mGY[i][0] = vint(f.footY + 0.5); mGId[i][0] = currentSprite(i); mGFlip[i][0] = f.facing < 0;
    if (mGN[i] < GHOSTS) mGN[i]++;
  } else if (mGN[i] > 0) mGN[i]--;
}

function drawGhosts(i: number): void {
  const c = ghostColor(i);
  if (c < 0) return;
  for (let k = 1; k <= GHOSTS - 1; k += 2) if (k < mGN[i]) R.drawSprite(mGId[i][k], mGX[i][k], mGY[i][k], mGFlip[i][k], c);
}

export function currentSprite(i: number): number {
  const f = F[i], t = f.stTick;
  if (f.cineSpr >= 0) return f.cineSpr;
  if (mPose[i] >= 0 && f.onGround && (f.state === ST_IDLE || f.state === ST_WALK || f.state === ST_CROUCH))
    return mPoseAnim[i] >= 0 ? animFrameHold(mPoseAnim[i], mFrame - mPoseT[i]) : mPose[i];
  if (mLandShow[i] > 0 && f.sLand >= 0 && (f.state === ST_IDLE || f.state === ST_WALK)) return f.sLand;
  switch (f.state) {
    case ST_IDLE: return animFrame(f.aIdle, t);
    case ST_WALK: return animFrame(f.aWalk, t, f.backward);
    case ST_CROUCH: return t < 2 && f.sCrouchIn >= 0 ? f.sCrouchIn : f.sCrouch;
    case ST_LAND: return f.sLand >= 0 ? f.sLand : f.sCrouch;
    case ST_JUMP:
      if (f.sJumpUp >= 0 && f.vy < -2) return t < 1 && f.sJumpPrep >= 0 ? f.sJumpPrep : f.sJumpUp;
      if (f.sJumpDown >= 0 && f.vy > 1.5) return f.sJumpDown;
      return f.sJump;
    case ST_DASH:
      if (f.backward) return f.sBDash1 >= 0 && t >= 3 ? f.sBDash1 : f.sBDash;
      return f.sDash1 >= 0 && t >= 2 ? f.sDash1 : f.sDash;
    case ST_ATTACK: case ST_THROW: {
      const mt = D.MvType[f.mv], mv = f.mv;
      if (f.state === ST_THROW && mt === MT_SUPER_GRAB) {
        if (t < 6) return D.MvSprS[mv];
        if (t < 21) return Math.trunc(t / 4) % 2 === 0 ? f.sPunchB : f.sPunchA;
        if (t < 34) return f.sLift;
        return f.sSlam;
      }
      if (f.state === ST_THROW && (mt === MT_SUPER_RUSH || mt === MT_SUPER_TELE)) {
        if (t < 20) {
          const k = Math.trunc(t / 3) % 3;
          return k === 0 ? f.sSlashA : k === 1 ? f.sSlashB : f.sSlashC;
        }
        return t < 26 ? D.MvSprS[mv] : D.MvSprA[mv];
      }
      if (f.state === ST_THROW) {
        if (t >= D.MvStartup[mv] && D.MvSeqAct[mv] >= 0) return animFrameHold(D.MvSeqAct[mv], t - D.MvStartup[mv]);
        return t >= D.MvStartup[mv] ? D.MvSprA[mv] : D.MvSprS[mv];
      }
      if (t < D.MvStartup[mv] && D.MvSeqPre[mv] >= 0) return animFrameHold(D.MvSeqPre[mv], t);
      if (t >= D.MvStartup[mv] && D.MvSeqAct[mv] >= 0 && (inActive(i) || !f.onGround)) return animFrameHold(D.MvSeqAct[mv], t - D.MvStartup[mv]);
      if (inRecovery(i) && D.MvSeqRec[mv] >= 0) return animFrameHold(D.MvSeqRec[mv], t - D.MvStartup[mv] - D.MvActive[mv]);
      if (mt === MT_RISE && !f.onGround) return D.MvSprA[mv];
      if (inActive(i)) return D.MvSprA[mv];
      return D.MvSprS[mv];
    }
    case ST_GUARD: return f.crouch ? f.sCGuard : f.sGuard;
    case ST_HIT:
      if (f.crouch) return f.sCHit;
      return t < Math.trunc((f.stunTotal + 1) / 2) ? f.sHit0 : f.sHit1;
    case ST_THROWN: {
      let s = f.sHit0;
      const o = F[1 - i];
      if (isDrain(1 - i)) { if (Math.trunc(t / 3) % 2 === 1) s = f.sHit1; }
      else if (o.state === ST_THROW) {
        const omt = D.MvType[o.mv];
        if (omt === MT_SUPER_GRAB) {
          if (o.stTick >= 22) s = f.sDown0;
          else if (Math.trunc(o.stTick / 4) % 2 === 1) s = f.sHit1;
        } else if (omt === MT_SUPER_RUSH || omt === MT_SUPER_TELE) {
          if (Math.trunc(o.stTick / 3) % 2 === 1) s = f.sHit1;
        }
      }
      return s;
    }
    case ST_DOWN:
      switch (f.downPhase) {
        case 0: return f.sDown0;
        case 1: return t < 3 && f.sDownB >= 0 ? f.sDownB : f.sDown1;      // bounce off the floor first
        case 3: {
          const k = f.rollDir === f.facing ? Math.trunc(t / 2) % 4 : (4 - (Math.trunc(t / 2) % 4)) % 4;
          return [f.sRoll0, f.sRoll1, f.sRoll2, f.sRoll3][k];
        }
        default:                                                          // getting up: sit up, then one knee
          if (f.sGetup0 >= 0) return t < 2 || f.sGetup1 < 0 ? f.sGetup0 : f.sGetup1;
          return f.sCrouch;
      }
  }
  return animFrame(f.aIdle, t);
}

function drawOne(i: number): void {
  if (vanished(i)) return;
  const f = F[i];
  const tint = f.flash > 0 ? RGB(255, 255, 255) : -1;
  const x = vint(f.x + 0.5), y = vint(f.footY + 0.5), flip = f.facing < 0;
  if (rageShown(i)) {
    const id = rageSprite(currentSprite(i));
    if (f.prefix === "hyeolma") {
      drawFrenzyArms(i, id);
      R.drawRageHi(id, x, y, flip, mDraw, true);
      R.drawSprite(id, x, y, flip, tint, f.skin || (i === 1 && F[0].prefix === f.prefix && !F[0].skin));
      if (tint < 0) R.tintHi(id, x, y, flip, RGB(156, 18, 44), 0.24);
      return;
    }
    if (D.SprHi[id]) {                                    // hi-res art: aura and red wash drawn at art resolution
      R.drawRageHi(id, x, y, flip, mDraw);
      R.drawSprite(id, x, y, flip, tint);
      if (tint < 0) R.tintHi(id, x, y, flip, RGB(255, 40, 20), 0.18);
      if (f.prefix === "cheolsan") drawSteam(x + f.facing * 2, y - 38);
      return;
    }
    drawRageAura(i, id, x, y, flip);
    R.drawSprite(id, x, y, flip, tint);
    if (f.prefix === "cheolsan") drawSteam(x + f.facing * 2, y - 36);
    return;
  }
  if ((demonAwake(i) || drainLinked(i)) && tint < 0) {
    if (Math.trunc(mFrame / 2) % 2 === 0 || drainLinked(i)) {
      const red = drainLinked(i) ? RGB(200, 30, 50) : RGB(130, 80, 210);   // Cheonma's awakening glows violet
      R.drawSprite(currentSprite(i), x - 1, y, flip, red);
      R.drawSprite(currentSprite(i), x + 1, y, flip, red);
      R.drawSprite(currentSprite(i), x, y - 1, flip, red);
    }
    if (demonAwake(i) && !mAwakeShown[i]) { mAwakeShown[i] = true; Combat.showText("CHEONMA SIMGONG", 40, i); }
  }
  const cur = currentSprite(i);
  R.drawSprite(cur, x, y, flip, tint, f.skin || (i === 1 && F[0].prefix === F[1].prefix && !F[0].skin));
  if (D.SprFx[cur] >= 0 && tint < 0) R.drawSprite(D.SprFx[cur], x, y, flip);   // SD art: the classic frame's effects on top
}

export function isDrain(i: number): boolean {
  return F[i].state === ST_THROW && F[i].prefix === "hyeolma" && D.MvType[F[i].mv] === MT_GRAB;   // the Blood Demon's draining grab
}

function drainStep(i: number): void {
  const o = 1 - i, t = F[i].stTick;
  if (F[o].state !== ST_THROWN || F[i].health <= 0) return;
  if (t >= DRAIN_FIRST && (t - DRAIN_FIRST) % DRAIN_EVERY === 0 && Math.trunc((t - DRAIN_FIRST) / DRAIN_EVERY) < DRAIN_PULSES) {
    const dmg = Math.trunc(D.MvDamage[F[i].mv] / DRAIN_PULSES);
    Combat.dealDamage(o, dmg);
    const steal = Math.min(F[o].naegong, Math.trunc(DRAIN_NG / DRAIN_PULSES));
    F[o].naegong -= steal;
    F[i].naegong = Math.min(NAEGONG_MAX, F[i].naegong + steal);
    F[i].health = Math.min(F[i].maxHealth, F[i].health + Math.trunc(dmg / 2));
    if (F[i].health > F[i].healthShown) F[i].healthShown = F[i].health;
    F[o].flash = 1;
    Combat.addMeter(i, 20);
    if (F[o].health <= 0) applyHit(o, 0, 1.5, true);
  }
  if (t >= DRAIN_RELEASE && F[o].state === ST_THROWN) applyHit(o, 4, 0, false);
}

function drawDrainOrbs(i: number): void {
  const o = 1 - i;
  drawDrainStream(F[i].x, F[i].footY, F[i].facing, F[o].x, F[o].footY, F[i].stTick);
}

export function drawDrainStream(x: number, ground: number, face: number, victimX: number, victimY: number, tick: number): void {
  const tx = x + face * 3, ty = ground - 22;
  for (let k = 0; k <= 7; k++) {
    const ang = k * 0.785398;
    const sx = victimX + 13 * Math.cos(ang), sy = victimY - 18 + 13 * Math.sin(ang);
    const ph = ((tick + k * 3) % 8) / 8;
    const px = clng(sx + (tx - sx) * ph), py = clng(sy + (ty - sy) * ph);
    R.fillRect(px - 1, py, 3, 1, RGB(255, 60, 70));
    R.fillRect(px, py - 1, 1, 3, RGB(255, 60, 70));
    R.putPixel(px, py, RGB(255, 200, 200));
  }
}

const BIG_PALM = ["........ooo.......", ".......oolooog....", "....oooorloloog...", "....oloorlorlog...",
  "....orlorlorlooog.", "....orlorlorloloog", "...oorlorlorlorlog", "...orlorlorlorloog",
  "...orlorlorlorlog.", ".ooorlorlorlorlog.", ".odorlorlorlorloog", "oodrddrrrrrrrrllog",
  "odrddrrlllllrlloog", "oorrdrrlwwwlrllog.", ".orrdrrlwwwlrllog.", ".ooddrrlllllrllog.",
  "..oddrrrrrrrrllog.", "..odrrrrrrrrlooog.", "..ooodrrrrlooog...", "....odrrrrlog.....",
  "....odrrrrlo......", "....oooooooo......"];
const SMALL_PALM = [".....oo.o...", "...ooloolo..", "...orlorlog.", "...orlorlolo", "..oorlorlolo",
  ".odorlorlolo", "oddorrrrrrlo", "odrdrlllrllo", "oordrlwwlrlo", ".ordrlwwlrlo",
  ".oddrrlllrlo", "..odrrrrrlo.", "..oodrrrlog.", "...odrrrlo..", "...oooooo..."];

// Danwoo's palm a quarter bigger (every fourth row and column doubled)
const MID_PALM = (() => {
  const grow = (n: number) => { const ix: number[] = []; for (let k = 0; k < n; k++) { ix.push(k); if (k % 4 === 1) ix.push(k); } return ix; };
  const cols = grow(SMALL_PALM[0].length);
  return grow(SMALL_PALM.length).map((r) => cols.map((c) => SMALL_PALM[r][c]).join(""));
})();

function drawDemonPalm(i: number): void {
  const t = F[i].stTick - D.MvStartup[F[i].mv];
  if (t < 0 || t > D.MvActive[F[i].mv] + 1) return;
  drawPalmAt(F[i].x, F[i].footY, F[i].facing, t <= D.MvActive[F[i].mv], F[i].kit === "hyeolma");
}

export function drawPalmAt(x: number, ground: number, face: number, lit: boolean, red = false): void {
  const ink = (ch: string): number => {
    switch (ch) {
      case "o": return red ? RGB(90, 8, 22) : RGB(34, 14, 56);
      case "d": return (red ? RGB(150, 20, 38) : RGB(80, 40, 130));
      case "r": return lit ? (red ? RGB(220, 40, 58) : RGB(124, 72, 196)) : (red ? RGB(150, 20, 38) : RGB(80, 40, 130));
      case "l": return lit ? (red ? RGB(255, 120, 130) : RGB(184, 150, 240)) : (red ? RGB(220, 40, 58) : RGB(124, 72, 196));
      case "w": return lit ? (red ? RGB(255, 215, 215) : RGB(238, 232, 255)) : (red ? RGB(255, 120, 130) : RGB(184, 150, 240));
      case "g": return lit ? (red ? RGB(255, 70, 90) : RGB(150, 100, 230)) : -1;
    }
    return -1;
  };
  drawArtAt(x, ground, face, MID_PALM, 14, -37, ink);              // a size up from Danwoo's, its heel on the SD palm
}

function drawArt(i: number, rows: string[], dx: number, dy: number, ink: (ch: string) => number): void {
  drawArtAt(F[i].x, F[i].footY, F[i].facing, rows, dx, dy, ink);
}

function drawArtAt(x: number, ground: number, face: number, rows: string[], dx: number, dy: number, ink: (ch: string) => number): void {
  const x0 = clng(x) + face * dx, y0 = clng(ground) + dy;
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++) {
      const col = ink(rows[r][c]);
      if (col >= 0) R.putPixel(face > 0 ? x0 + c : x0 - c, y0 + r, col);
    }
}

function blueInk(lit: boolean): (ch: string) => number {
  return (ch) => {
    switch (ch) {
      case "o": return RGB(14, 34, 96);
      case "d": return RGB(34, 80, 180);
      case "r": return lit ? RGB(66, 140, 236) : RGB(34, 80, 180);
      case "l": return lit ? RGB(150, 206, 255) : RGB(66, 140, 236);
      case "w": return lit ? RGB(236, 248, 255) : RGB(150, 206, 255);
      case "g": return lit ? RGB(110, 190, 255) : -1;
    }
    return -1;
  };
}

function toggleArms(i: number): void {
  const cur = F[i].mv;
  F[i].armed = !F[i].armed;
  loadKit(i, F[i].armed ? F[i].prefix + "sw" : F[i].prefix);
  F[i].mv = cur;
  FX.spawn(vint(F[i].x + 0.5) + F[i].facing * 6, vint(F[i].footY) - 18, FX.FX_BLOCK);
}

function drawWindPalm(i: number): void {
  const t = F[i].stTick - D.MvStartup[F[i].mv];
  if (t < 0 || t > D.MvActive[F[i].mv] + 1) return;
  drawArt(i, SMALL_PALM, 10, -31, blueInk(t <= D.MvActive[F[i].mv]));
}

function drawSpinFist(i: number): void {
  const f = F[i], t = f.stTick - D.MvStartup[f.mv];
  if (t < -2 || t > D.MvActive[f.mv] + 2) return;
  const cx = f.x + f.facing * 2, cy = f.footY - 24;
  for (let k = 0; k <= 14; k++) {
    const th = 3.14159 * (1 - k / 14);
    const px = clng(cx + f.facing * 13 * Math.cos(th)), py = clng(cy + 3 * Math.sin(th));
    const ink = k < 5 ? RGB(34, 80, 180) : k < 10 ? RGB(66, 140, 236) : RGB(150, 206, 255);
    if (t >= 0 || k < 8) R.fillRect(px, py, 2, 1, ink);
  }
  if (t < 0) return;
  const hx = clng(f.x) + f.facing * 13, hy = clng(f.footY) - 24;
  R.fillRect(hx - 3, hy - 2, 7, 5, RGB(34, 80, 180));
  R.fillRect(hx - 2, hy - 3, 5, 7, RGB(34, 80, 180));
  R.fillRect(hx - 2, hy - 2, 5, 5, RGB(66, 140, 236));
  R.fillRect(hx - 1, hy - 1, 3, 3, RGB(236, 248, 255));
  if (t <= 1) {
    R.putPixel(hx + f.facing * 5, hy - 3, RGB(150, 206, 255));
    R.putPixel(hx + f.facing * 6, hy + 1, RGB(150, 206, 255));
    R.putPixel(hx + f.facing * 4, hy + 4, RGB(150, 206, 255));
  }
}

function drawQuake(i: number): void {
  const f = F[i], t = f.stTick - D.MvStartup[f.mv];
  if (t < 0 || t > D.MvActive[f.mv] + 8) return;
  const gx = clng(f.x), gy = clng(f.footY);
  for (let k = 0; k <= 2; k++) {
    const rad = (t - k * 2) * 6 + 6;
    if (rad <= 6 || rad >= 70) continue;
    const h = Math.max(3, 13 - Math.trunc(rad / 7) - k * 2);
    const ink = k === 0 ? RGB(236, 248, 255) : k === 1 ? RGB(120, 196, 255) : RGB(50, 110, 220);
    for (let s = -1; s <= 1; s += 2) {
      R.fillRect(gx + s * rad - 2, gy - h, 4, h, ink);
      R.fillRect(gx + s * (rad - 4) - 1, gy - Math.trunc(h / 2) - 1, 3, Math.trunc(h / 2) + 1, RGB(50, 110, 220));
      R.fillRect(gx + s * (rad + 3), gy - h - 3, 1, 2, RGB(150, 206, 255));
      if (k === 0) R.fillRect(s < 0 ? gx - rad : gx, gy - 1, rad, 1, RGB(120, 196, 255));
    }
  }
  if (t <= D.MvActive[f.mv] + 4 && (!D.SprHi[currentSprite(i)] || D.SprHiS[currentSprite(i)] === 3)) {     // hi-res art draws its own palm (SD fighter art does not)
    const n = BIG_PALM[0].length, flat: string[] = [];
    for (let c = 0; c < Math.trunc(n / 2); c++) {
      let row = "";
      for (let r = BIG_PALM.length - 1; r >= 0; r--) row += BIG_PALM[r][n - 1 - c * 2];
      flat.push(row);
    }
    drawArt(i, flat, 2, -Math.trunc(n / 2) + 1, blueInk(t <= D.MvActive[f.mv]));
    R.fillRect(clng(f.x) - 10, clng(f.footY), 21, 1, RGB(150, 206, 255));
  }
}

const drainLinked = (i: number) => isDrain(i) || (isDrain(1 - i) && F[i].state === ST_THROWN);

export function demonAwake(i: number): boolean {
  const f = F[i];
  return f.prefix === "cheonma" && f.health > 0 && f.health * 10 <= f.maxHealth * 3;
}

function drawBoxes(i: number): void {
  const u = hurtRect(i);
  if (u) R.drawRectOutline(u.x, u.y, u.w, u.h, RGB(60, 255, 120));
  const h = hitRect(i);
  if (h) R.drawRectOutline(h.x, h.y, h.w, h.h, RGB(255, 40, 40));
}

// ---------------------------------------------------------------- new supers (web version)

/** Name shown for the special in progress: sp1 has its own name when the character has one. */
function moveName(i: number): string {
  const f = F[i];
  return f.mv === f.moves[MV_SP1] && f.sp1Name ? f.sp1Name : f.superName;
}

export const raging = (i: number) => F[i].rage > 0;
const rageShown = (i: number) => (F[i].prefix === "cheolsan" || F[i].prefix === "hyeolma") && (F[i].rage > 0 || (F[i].state === ST_ATTACK && D.MvType[F[i].mv] === MT_RAGE));

const rageMap = new Map<number, number>();
function rageSprite(id: number): number {
  let r = rageMap.get(id);
  if (r === undefined) {
    const nm = D.SprName[id];
    r = !D.SprHi[id] && nm.startsWith("cheolsan.") && hasSprite("cheolsanrg." + nm.slice(9)) ? spriteId("cheolsanrg." + nm.slice(9)) : id;
    rageMap.set(id, r);
  }
  return r;
}

/** Berserk aura: a flickering red / orange rim, flame tongues off the top edge, embers rising. */
function drawRageAura(i: number, id: number, x: number, y: number, flip: boolean): void {
  const m = R.spriteMask(id, x, y, flip), f = mDraw;
  const tops = new Map<number, number>();
  for (const k of m) {
    const px = ((k % 1024) + 1024) % 1024, py = Math.round((k - px) / 1024);
    if (!tops.has(px) || py < tops.get(px)!) tops.set(px, py);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const q = k + dx + dy * 1024;
      if (m.has(q)) continue;
      const h = (((px + dx) * 7 + (py + dy) * 13 + f * 5) % 6 + 6) % 6;
      R.putPixel(px + dx, py + dy, h < 4 ? RGB(200, 30, 20) : RGB(255, 120, 40));
    }
  }
  for (const [px, ty] of tops) {
    const h = ((px * 31 + f * 17) % 7 + 7) % 7;
    if (h <= 2) continue;
    for (let k = 1; k < h; k++)
      R.putPixel(px, ty - k - 1, k === h - 1 ? RGB(255, 230, 120) : k > Math.trunc(h / 2) ? RGB(255, 140, 40) : RGB(220, 40, 20));
  }
  for (let e = 0; e < 6; e++) R.putPixel(x - 10 + ((e * 37 + f * 3) % 22), y - 20 - ((f * 2 + e * 11) % 26), RGB(255, 170, 60));
  void i;
}

function drawSteam(x: number, y: number): void {
  for (let k = 0; k < 3; k++) {
    const r = (mDraw + k * 3) % 3, cx = x - 5 + k * 5, cy = y - 3 - ((mDraw * 2 + k * 5) % 8);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) R.putPixel(cx + dx, cy + dy, RGB(230, 225, 220));
  }
}

/** Activation: red shock ring spreading from the roaring monk. */
function drawRoar(i: number): void {
  const f = F[i], t = f.stTick;
  const r = 4 + t * 5, cx = vint(f.x + 0.5), cy = vint(f.footY) - 18;
  for (let a = 0; a < 360; a += 4)
    R.putPixel(cx + clng(r * Math.cos(a * 0.0174533)), cy + clng(r * 0.6 * Math.sin(a * 0.0174533)), RGB(255, 60 + (a % 3) * 40, 30));
}

// ---- Muyeong: 무영참공 (one flash through the opponent, then space tears around them)

function riftDash(i: number): void {
  const o = 1 - i, f = F[i], mv = f.mv;
  const dist = (F[o].x - f.x) * f.facing;
  f.cineX0 = f.x;
  if (dist > 0 && dist <= D.MvP1[mv] && hurtRect(o)) {
    const cx = vint(F[o].x + 0.5), cy = vint(F[o].footY) - 18;
    if (Combat.blocks(o, D.MvLevel[mv])) {
      f.x = F[o].x - f.facing * (f.halfW + F[o].halfW);
      Combat.applyAttack(i, o, mv, cx, cy, false, true);
    } else {
      let nx = F[o].x + f.facing * (f.halfW + F[o].halfW + 8);
      if (nx < f.halfW) nx = f.halfW;
      if (nx > SCREEN_W - f.halfW) nx = SCREEN_W - f.halfW;
      f.x = nx;
      f.facing = F[o].x > f.x ? 1 : -1;
      Combat.applyAttack(i, o, mv, cx, cy, false, true);
    }
    f.hasHit = true;
  } else {
    f.x += f.facing * Math.min(D.MvP1[mv], 50);
    clampX(i);
  }
}

function riftStep(i: number): void {
  const o = 1 - i, f = F[i], t = f.stTick;
  f.cineSpr = spriteId("muyeong.rush_3");
  if (t < RIFT_BREAK) Combat.C.ImpactDark = 2;
  if (t >= 2 && t < 2 + RIFT_CUTS * 3 && (t - 2) % 3 === 0) {
    Combat.dealDamage(o, 30); Combat.addComboHit(i);
    Combat.C.HitStop = 1;
  } else if (t === RIFT_BREAK) {
    Combat.dealDamage(o, Math.max(0, D.MvDamage[f.mv] - RIFT_CUTS * 30)); Combat.addComboHit(i);
    applyHit(o, 0, 3, true);
    F[o].flash = 2;
    Combat.C.WhiteFlash = 2;
    Combat.C.HitStop = 6;
    Combat.showText(moveName(i), 40, i);
  }
  if (t >= RIFT_END) setState(i, ST_IDLE);
}

// fixed rift shapes (angle in degrees, length, offset) and jitter, so every cast looks the same
const RIFTS = [[-35, 52, -2], [20, 58, 3], [75, 48, -4], [-70, 56, 1], [50, 50, 4]];
const JIT: number[] = [];
{ let s = 12345; for (let k = 0; k < 400; k++) { s = (s * 1103515245 + 12345) & 0x7fffffff; JIT.push((s / 0x7fffffff - 0.5) * 0.7); } }

function drawRiftStreak(i: number, t: number): void {
  if (t < 0 || t > 2) return;
  const f = F[i], y = vint(f.footY) - 20;
  const x0 = Math.min(f.cineX0, f.x), x1 = Math.max(f.cineX0, f.x);
  R.fillRect(x0, y - 1, x1 - x0, 1, RGB(170, 220, 255));
  R.fillRect(x0, y, x1 - x0, 1, RGB(255, 255, 255));
  R.fillRect(x0, y + 1, x1 - x0, 1, RGB(170, 220, 255));
}

function drawRifts(i: number): void {
  const f = F[i], t = f.stTick, cx = f.cineCX, cy = f.cineCY;
  drawRiftStreak(i, t);
  if (t < RIFT_BREAK) {
    for (let k = 0; k < RIFTS.length; k++) {
      if (t < 2 + k * 3) continue;
      const ow = t < 17 ? 0 : Math.min(3.5, (t - 17) * 0.5);
      const a = RIFTS[k][0] * 0.0174533, L = RIFTS[k][1], off = RIFTS[k][2];
      const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
      for (let s = -Math.trunc(L / 2); s <= Math.trunc(L / 2); s++) {
        const j = JIT[(k * 80 + s + 40) % 400];
        const taper = 1 - Math.abs(s) / (L / 2 + 1), w = ow * taper;
        const x = cx + ux * s + nx * (off + j), y = cy + uy * s + ny * (off + j);
        if (w < 0.6) { R.putPixel(clng(x), clng(y), RGB(235, 245, 255)); continue; }
        for (let d = -Math.trunc(w) - 1; d <= Math.trunc(w) + 1; d++) {
          const px = clng(x + nx * d), py = clng(y + ny * d);
          if (Math.abs(d) <= w - 1) R.putPixel(px, py, (px + py) % 5 ? RGB(12, 6, 26) : RGB(60, 30, 110));
          else if (Math.abs(d) <= w) R.putPixel(px, py, RGB(235, 245, 255));
          else if ((px * 3 + py) % 4 === 0) R.putPixel(px, py, RGB(120, 200, 255));
        }
      }
    }
  } else {
    const s = t - RIFT_BREAK;
    for (let k = 0; k < 26; k++) {
      const a = (JIT[k * 3] + 0.35) * 6.28 / 0.7, sp = 1.5 + (JIT[k * 3 + 1] + 0.35) * 3.5;
      const d = s * sp + 4;
      const x0 = cx + Math.cos(a) * d, y0 = cy + Math.sin(a) * d * 0.8;
      const c = k % 3 ? RGB(230, 240, 255) : RGB(12, 6, 26);
      R.putPixel(clng(x0), clng(y0), c);
      R.putPixel(clng(x0 + Math.cos(a + 1)), clng(y0 + Math.sin(a + 1)), c);
      R.putPixel(clng(x0 + Math.cos(a + 1) * 2), clng(y0 + Math.sin(a + 1) * 2), c);
    }
  }
}

// ---- Seolhwa: 낙화유수 (a storm of kicks with one pale ghost striking from behind)

const KICKS = ["lk_1", "hk_1", "rush_1", "hk_t", "rush_2", "lk_1", "hk_1", "rush_3"];

function flurryStep(i: number): void {
  const o = 1 - i, f = F[i], t = Math.max(0, f.stTick - 1), fo = F[o];
  const kicksEnd = FLURRY_KICKS * 3;
  if (t < kicksEnd + 3) Combat.C.ImpactDark = 2;
  if (t < kicksEnd) {
    const k = Math.trunc(t / 3), lift = Math.min(t, 6);
    f.x = fo.x - f.facing * 16;
    f.cineSpr = spriteId("seolhwa." + KICKS[k % KICKS.length]);
    fo.footY = GROUND_Y - lift;
    f.cineCY = vint(fo.footY) - 20;
    if (t % 3 === 0) {
      Combat.dealDamage(o, 25); Combat.addComboHit(i);
      fo.flash = 1;
      Combat.C.HitStop = 1;
    }
  } else if (t < kicksEnd + 3) {
    f.cineSpr = spriteId("seolhwa.dp_3");
    f.x = fo.x - f.facing * 6;
    f.footY = GROUND_Y - 24 - (t - kicksEnd) * 2;
    fo.footY = GROUND_Y - 6;
  } else if (t === kicksEnd + 3) {
    f.footY = GROUND_Y;
    f.x = fo.x - f.facing * 8;
    f.cineSpr = spriteId("seolhwa.ovh_1");
    fo.footY = GROUND_Y;
    Combat.dealDamage(o, Math.max(0, D.MvDamage[f.mv] - FLURRY_KICKS * 25)); Combat.addComboHit(i);
    applyHit(o, 0, 2.5, true);
    fo.flash = 2;
    Combat.C.WhiteFlash = 2;
    Combat.C.HitStop = 6;
    Combat.showText(moveName(i), 40, i);
  } else if (t < kicksEnd + 9) f.cineSpr = spriteId("seolhwa.ovh_1");
  if (t >= FLURRY_END) { f.footY = GROUND_Y; setState(i, ST_IDLE); }
}

const PETAL = [RGB(255, 170, 200), RGB(255, 210, 225), RGB(240, 120, 160)];

function drawFlurry(i: number): void {
  const f = F[i], t = Math.max(0, f.stTick - 1), o = 1 - i, kicksEnd = FLURRY_KICKS * 3;
  const cx = f.cineCX, cy = f.cineCY;
  if (t < kicksEnd) {
    const k = Math.trunc(t / 3);
    R.drawGhost(spriteId("seolhwa." + KICKS[(k + 3) % KICKS.length]), vint(F[o].x + 0.5) + f.facing * 20, vint(F[o].footY + 0.5), f.facing > 0);
    if (t % 3 <= 1) {                                   // one arc + spark per kick
      const a0 = (k * 70) % 360;
      for (let s = 0; s < 24; s++) {
        const a = (a0 + (110 * s) / 23) * 0.0174533;
        R.putPixel(cx + clng(11 * Math.cos(a)), cy + clng(11 * Math.sin(a)), RGB(255, 255, 255));
        if (s > 12) R.putPixel(cx + clng(10 * Math.cos(a)), cy + clng(10 * Math.sin(a)), RGB(255, 255, 255));
      }
      const sx = cx + (k % 3) * 3 - 3, sy = cy - 2;
      for (let s = 0; s < 8; s++)
        for (let d = 0; d <= 4; d++) R.putPixel(sx + clng(Math.cos(s * 0.785) * d), sy + clng(Math.sin(s * 0.785) * d), RGB(255, 250, 220));
    }
  } else if (t < kicksEnd + 3) {
    const r = 12, ax = vint(f.x + 0.5) + f.facing * 2, ay = vint(f.footY) - 18;
    for (let s = 0; s < 40; s++) R.putPixel(ax + clng(r * Math.cos(s * 0.15)), ay + clng(r * Math.sin(s * 0.15)), RGB(255, 255, 255));
  } else {
    const s = t - kicksEnd - 1;
    for (let k = 0; k < 40; k++) {
      const a = (JIT[k * 5 % 400] + 0.35) * 6.28 / 0.7, sp = 1 + (JIT[(k * 5 + 1) % 400] + 0.35) * 2.85;
      const d = s * sp;
      const px = cx + Math.cos(a) * d + Math.sin(s * 0.5 + k) * 2;
      const py = cy + Math.sin(a) * d * 0.6 + Math.pow(Math.max(0, s), 1.4) * 0.6;
      R.putPixel(clng(px), clng(py), PETAL[k % 3]);
      R.putPixel(clng(px) + 1, clng(py), PETAL[(k + 1) % 3]);
    }
  }
}

/** Test hook: start move slot for fighter i right now (used by the browser smoke tests). */
export function debugStart(i: number, slot: number): boolean {
  if (slot === MV_SUPER) F[i].meter = METER_MAX;
  F[i].naegong = NAEGONG_MAX;
  return startAttack(i, slot, false, false);
}

// ---- Cheonma: 천마검법 (Cheonma sword art). Three strikes that meet in one crash; the sword stays drawn after.
// Form (moves.txt p1): 1 = three sword waves converge on the foe, 2 = dash in and carve three cuts that burst,
// 3 = 삼절검: three blades fall slanting from the sky and cut three parallel scars (Yacha's left-handed copy reversed the last). Everything lives on the fighter (cineCX/cineCY/cineX0/hitCount) for rollback.

const CRASH_WAVE_T = 10, CRASH_CUTS = [3, 7, 11], CRASH_CUT_BURST = 18, CRASH_BLADES = [4, 10, 16], CRASH_GHOST_END = 34;
const GHOST = 8;   // form 3: all three blades struck clean - they stay standing as afterimages, then break together
const SW_BMJ: Record<string, string> = { palm_1: "finish", hp_3: "idle_0", sp_a: "sky", ovh_1: "sky", sp_1: "finish",
  rush_1: "thrust_1", rush_2: "counter", rush_3: "finish" };
let mCrashKit = "cheonma";                              // whose art is being drawn: picks the frames and the colours
const SW = (n: string) => mCrashKit === "baekmujin" ? spriteId("baekmujin." + (SW_BMJ[n] ?? n)) : spriteId("cheonmasw." + n);

/** One strike of the art: hits when the foe's body overlaps the box; blocked strikes chip. 0 miss, 1 blocked, 2 hit. */
function crashHit(i: number, x: number, y: number, w: number, h: number, dmg: number, final: boolean): number {
  const o = 1 - i, hr = hurtRect(o);
  if (!hr || hr.x > x + w || hr.x + hr.w < x || hr.y > y + h || hr.y + hr.h < y) return 0;
  const cx = vint(F[o].x + 0.5), cy = vint(F[o].footY) - 18;
  if (Combat.blocks(o, D.MvLevel[F[i].mv])) {
    applyBlock(o, 10, final ? 2 : 0.4);
    Combat.dealDamage(o, Math.trunc(dmg / 4));
    FX.spawn(cx, cy, FX.FX_BLOCK);
    Combat.C.HitStop = 2;
    return 1;
  }
  Combat.dealDamage(o, dmg); Combat.addComboHit(i); Combat.addMeter(i, 0);
  if (final) { applyHit(o, 0, 3, true); Combat.C.WhiteFlash = 2; Combat.C.HitStop = 6; }
  else { applyHit(o, 16, 0.3, false); Combat.C.HitStop = 2; }
  F[o].flash = 2;
  FX.spawn(cx, cy, FX.FX_HEAVY);
  return 2;
}

function crashStep(i: number, t: number): void {
  const f = F[i], o = 1 - i, fo = F[o], form = D.MvP1[f.mv] || 1, total = D.MvDamage[f.mv];
  mCrashKit = f.kit === "baekmujin" ? "baekmujin" : "cheonma";
  if (t === 0) {
    if (!f.armed && f.kit === "cheonma") toggleArms(i);                      // the art is drawn with the blade, and it stays out
    Combat.showText(f.superName, 40, i);
    f.hitCount = 0;
    f.cineX0 = f.x;
    f.cineCX = Math.max(8, Math.min(SCREEN_W - 8, vint(fo.x + 0.5)));
    f.cineCY = vint(fo.footY) - 18;
    Combat.C.ImpactDark = 3;
  }
  if (form === 1) {
    f.cineSpr = t < 7 ? SW("palm_1") : SW("hp_3");
    const ox = f.x + f.facing * 12;
    if (t >= 1 && t <= CRASH_WAVE_T) {
      for (let k = 0; k < 3; k++) {
        if (f.hitCount & (1 << k)) continue;
        const [wx, wy] = waveAt(i, k, t, ox);
        if (crashHit(i, wx - 4, wy - 5, 8, 10, 40, false)) f.hitCount |= 1 << k;
      }
    }
    if (t === CRASH_WAVE_T) {
      Combat.C.ImpactDark = 4;
      const n = ((f.hitCount & 1) + ((f.hitCount >> 1) & 1) + ((f.hitCount >> 2) & 1));
      crashHit(i, f.cineCX - 18, f.cineCY - 24, 36, 44, total - n * 40, true);
    }
  } else if (form === 2) {
    if (t === 0) {
      const dist = (fo.x - f.x) * f.facing, hr = hurtRect(o);
      if (dist > 0 && dist <= 84 && hr) {
        f.x = fo.x - f.facing * (f.halfW + fo.halfW + 2);
        clampX(i);
        if (Combat.blocks(o, D.MvLevel[f.mv])) { crashHit(i, hr.x, hr.y, hr.w, hr.h, 60, true); f.hitCount = 0; }
        else { f.hitCount = 1; applyHit(o, 30, 0, false); }
      } else { f.x += f.facing * 50; clampX(i); }
      f.cineCX = vint(fo.x + 0.5); f.cineCY = vint(fo.footY) - 20;
    }
    const cut = CRASH_CUTS.indexOf(t);
    f.cineSpr = t < 3 ? SW("rush_1") : t < CRASH_CUT_BURST ? SW(["hp_1", "chp_1", "rush_2"][Math.min(2, Math.trunc((t - 3) / 4))]) : SW("rush_3");
    if (f.hitCount && cut >= 0) {
      Combat.dealDamage(o, 40); Combat.addComboHit(i);
      fo.stun = Math.max(fo.stun, 14); fo.flash = 1; Combat.C.HitStop = 2;
    }
    if (f.hitCount && t === CRASH_CUT_BURST) {
      Combat.dealDamage(o, total - 3 * 40); Combat.addComboHit(i);
      applyHit(o, 0, 3, true); fo.flash = 2;
      Combat.C.WhiteFlash = 2; Combat.C.HitStop = 6; Combat.C.ImpactDark = 4;
    }
  } else {
    const ghost = (f.hitCount & GHOST) !== 0;
    if (mCrashKit === "baekmujin") {
      f.cineSpr = SW(t < 6 ? "bs_3" : "bs_4");          // the swing that sends the swords, then the finish
      const want = f.cineCX - f.facing * 46;             // the swords rain wide: he slides back out from under them
      if (t < 5 && (f.x - want) * f.facing > 0) { f.x += (want - f.x) * 0.5; clampX(i); }
    }
    else f.cineSpr = t < CRASH_BLADES[2] + 2 ? SW("sp_a") : ghost && t < CRASH_GHOST_END ? SW("ovh_1") : SW("sp_1");
    const k = CRASH_BLADES.indexOf(t - 1);
    if (k >= 0) {
      const all = k === 2 && (f.hitCount & 3) === 3;     // the first two struck clean: the third holds instead of throwing
      const r = crashHit(i, f.cineCX - 12, vint(f.footY) - 46, 24, 46, k < 2 ? 60 : all ? 100 : total - 120, k === 2 && !all);
      if (r === 2) f.hitCount |= 1 << k;
      if (all && r === 2) { f.hitCount |= GHOST; fo.stun = Math.max(fo.stun, CRASH_GHOST_END - t + 2); }
      if (k === 2) Combat.C.ImpactDark = 4;
    }
    if (ghost && t < CRASH_GHOST_END) {
      if (fo.state === ST_HIT) fo.stun = Math.max(fo.stun, 3);       // pinned among the afterimages
      if (t >= CRASH_GHOST_END - 4) Combat.C.ImpactDark = 2;
    }
    if (ghost && t === CRASH_GHOST_END) {                // the afterimages break all at once
      Combat.dealDamage(o, total - 220); Combat.addComboHit(i);
      applyHit(o, 0, 3.5, true); fo.flash = 2;
      if (f.kit !== "baekmujin") Combat.C.WhiteFlash = 3;
      Combat.C.HitStop = 8; Combat.C.ImpactDark = 5;
      FX.spawn(f.cineCX, vint(fo.footY) - 18, FX.FX_HEAVY);
    }
  }
  if (t === D.MvActive[f.mv] - 1) f.cineSpr = -1;
}

function waveAt(i: number, k: number, t: number, ox: number): [number, number] {
  const f = F[i], s = Math.min(1, t / CRASH_WAVE_T), y0 = vint(f.footY) - [44, 26, 6][k];
  const ease = s * s * (3 - 2 * s);
  return [ox + (f.cineCX - ox) * ease, y0 + (f.cineCY - y0) * ease];
}


// Cheonma's colour is violet and steel (red belongs to the Blood Demon); Baek Mujin's 백일천검 is white and gold
const gold = () => mCrashKit === "baekmujin";
const C_DARK = () => gold() ? RGB(92, 72, 32) : RGB(34, 14, 56), C_RED = () => gold() ? RGB(200, 160, 72) : RGB(104, 52, 168),
  C_HOT = () => gold() ? RGB(244, 222, 140) : RGB(176, 140, 236), C_CORE = () => gold() ? RGB(255, 252, 236) : RGB(240, 236, 255);

function burst(cx: number, cy: number, s: number, big: number): void {
  if (s < 0 || s > 12) return;
  if (s < 3) {                                          // the flash: a filled disc, white hot in the middle
    const r = 4 + s * big * 1.4;
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y * 1.3) / r;
        if (d <= 1) R.putPixel(clng(cx + x), clng(cy + y), d < 0.45 ? C_CORE() : d < 0.75 ? C_HOT() : d < 0.92 ? C_RED() : C_DARK());
      }
  }
  const r = 5 + s * big;
  for (let a = 0; a < 360; a += 3) {
    const c = Math.cos(a * 0.0174533), sn = Math.sin(a * 0.0174533);
    for (let w = 0; w < (s < 7 ? 3 : 1); w++)
      R.putPixel(clng(cx + (r - w) * c), clng(cy + (r - w) * 0.7 * sn), s < 5 ? (w === 1 ? C_CORE() : C_HOT()) : w === 0 ? C_RED() : C_DARK());
  }
  if (s < 7) {
    for (let k = 0; k < 12; k++) {
      const a = k * 0.5236 + 0.26, L = 8 + s * big * 1.8, d0 = s * big * 0.9;
      for (let d = d0; d < L; d++) R.putPixel(clng(cx + Math.cos(a) * d), clng(cy + Math.sin(a) * d * 0.8), d > L - 3 ? C_RED() : k % 2 ? C_HOT() : C_CORE());
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, core: number, edge: number, dark = C_DARK()): void {
  const L = Math.max(1, Math.hypot(x1 - x0, y1 - y0)), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
  for (let s = 0; s <= L; s++) {
    const x = x0 + (x1 - x0) * s / L, y = y0 + (y1 - y0) * s / L, taper = 1 - Math.abs(s / L - 0.5) * 2;
    const ww = Math.max(0, w * (0.35 + 0.65 * taper));
    for (let d = -Math.ceil(ww) - 1; d <= Math.ceil(ww) + 1; d++)
      R.putPixel(clng(x + nx * d), clng(y + ny * d), Math.abs(d) <= ww * 0.5 ? core : Math.abs(d) <= ww ? edge : dark);
  }
}

function drawCrash(i: number, t: number): void {
  const f = F[i], form = D.MvP1[f.mv] || 1, gy = vint(f.footY);
  mCrashKit = f.kit === "baekmujin" ? "baekmujin" : "cheonma";
  if (mCrashKit === "baekmujin" && form === 3) { drawSkySwords(i, t); return; }
  if (t < 0) {                                          // gathering: dark red sparks drawn into the blade
    const s = t + D.MvStartup[f.mv];
    for (let k = 0; k < 10; k++) {
      const a = k * 0.628 + s * 0.3, d = 26 - s * 3;
      if (d > 2) R.putPixel(clng(f.x + Math.cos(a) * d), clng(gy - 30 + Math.sin(a) * d * 0.7), k % 2 ? C_HOT() : C_RED());
    }
    return;
  }
  if (form === 1) {
    const ox = f.x + f.facing * 12;
    if (t >= 1 && t <= CRASH_WAVE_T) {
      for (let k = 0; k < 3; k++) {
        for (let tr = 3; tr >= 0; tr--) {                // a short fading streak behind each wave
          if (t - tr < 1) continue;
          const [x, y] = waveAt(i, k, t - tr, ox);
          for (let a = -75; a <= 75; a += 4) {          // crescent of sword energy facing the way it flies
            const ca = Math.cos(a * 0.0174533), sa = Math.sin(a * 0.0174533), r = 12 - tr * 1.5;
            const th = (1 - Math.abs(a) / 90) * (tr === 0 ? 3 : 2);
            for (let w = 0; w <= th; w++) {
              const col = tr > 1 ? (tr === 2 ? C_RED() : C_DARK()) : w < th * 0.4 ? C_CORE() : w < th * 0.8 ? C_HOT() : C_RED();
              R.putPixel(clng(x + f.facing * (ca * (r - w) * 0.55 - 4)), clng(y + sa * (r - w)), col);
            }
          }
        }
      }
    }
    burst(f.cineCX, f.cineCY, t - CRASH_WAVE_T, 3.6);
  } else if (form === 2) {
    if (!f.hitCount) return;
    const cx = f.cineCX, cy = f.cineCY, ANG = [-40, 40, 0];
    if (t < CRASH_CUT_BURST) {
      for (let k = 0; k < 3; k++) {
        if (t < CRASH_CUTS[k]) continue;
        const a = ANG[k] * 0.0174533, L = 30, age = t - CRASH_CUTS[k];
        const ux = Math.cos(a) * f.facing, uy = Math.sin(a), w = age < 2 ? 2.5 : 1.2 + Math.min(2, (t - 13) * 0.4 > 0 ? (t - 13) * 0.4 : 0);
        thickLine(cx - ux * L, cy - uy * L, cx + ux * L, cy + uy * L, w, age < 2 ? C_CORE() : C_HOT(), C_RED());
      }
    } else {
      const s = t - CRASH_CUT_BURST;
      burst(cx, cy, s, 3.6);
      for (let k = 0; k < 24; k++) {                      // the three cuts shatter outward
        const a = k * 0.2618 + (k % 3) * 0.1, d = 6 + s * (2 + (k % 4));
        R.putPixel(clng(cx + Math.cos(a) * d), clng(cy + Math.sin(a) * d * 0.8), k % 2 ? C_HOT() : C_DARK());
      }
    }
  } else {
    drawThreeCuts(f.cineCX, gy, f.facing, t, (f.hitCount & GHOST) !== 0);
  }
}

function drawThreeCuts(cx: number, ground: number, facing: number, t: number, ghost: boolean): void {
  // 삼절검: three blades fall slanting the same way (front-high to back-low) and cut three parallel brush strokes;
  // when all three strike clean the strokes stay as smouldering afterimages, then break together
  for (let k = 0; k < 3; k++) {
    const s = t - CRASH_BLADES[k], g = scarLine(cx, ground, facing, k), bend = [3, -3, 0][k] * facing;
    if (s === -2 || s === -1) brush(g, bend, 0.5, C_RED(), C_RED(), 1, t);                 // a faint line marks the cut
    if (s === 0) drawFallingBlade(g, 0.45);
    if (s === 1) { drawFallingBlade(g, 1); brush(g, bend, 4.5, C_CORE(), C_HOT(), 1, t); }
    if (s >= 2 && s < 5) {
      for (let e = 2; e >= 1; e--) brush(g, bend, 2.5, e === 1 ? C_RED() : C_DARK(), C_DARK(), 0.5, t, e * 3);   // the sweep's trail
      brush(g, bend, 4.5 - s * 0.5, s < 3 ? C_CORE() : C_HOT(), C_RED(), 1, t);
    }
    if (s >= 1) burst(g[2], g[3], s - 1, k === 2 ? 3 : 2);
    if (ghost && s >= 5 && t < CRASH_GHOST_END) {        // the stroke left burning in the air
      brush(g, bend, 3, C_DARK(), C_DARK(), 0.6, t, 3);
      brush(g, bend, (t + k) % 2 ? 3 : 2.6, C_HOT(), C_RED(), 1, t);
      embers(g, bend, t - CRASH_BLADES[k] - 5, k);
    } else if (!ghost && s >= 5 && s < 9) brush(g, bend, 1.5, C_RED(), C_DARK(), 0.6, t);
    if (ghost && t >= CRASH_GHOST_END && t < CRASH_GHOST_END + 2) brush(g, bend, 5, C_CORE(), C_HOT(), 1, t);
    if (ghost) {
      const e = t - CRASH_GHOST_END - 1;
      if (k === 2) burst(cx, ground - 22, e, 2.6);        // one burst where the strokes cross
      if (e >= 0 && e < 8) for (let q = 0; q < 6; q++) {               // each stroke breaks into a few shards
        const a = q * 1.7 + k, d = 3 + e * (1.5 + (q % 3) * 0.5), [x0, y0] = bez(g, bend, (q + 0.5) / 6);
        R.fillRect(clng(x0 + Math.cos(a) * d), clng(y0 + Math.sin(a) * d * 0.7 + e * e * 0.12), 2, 1, q % 3 ? C_HOT() : C_CORE());
      }
    }
  }
}

/** A point on stroke g, bowed sideways by `bend` pixels at the middle (quadratic curve). */
function bez(g: [number, number, number, number], bend: number, u: number): [number, number] {
  const L = Math.hypot(g[2] - g[0], g[3] - g[1]), nx = -(g[3] - g[1]) / L, ny = (g[2] - g[0]) / L;
  const cx = (g[0] + g[2]) / 2 + nx * bend * 2, cy = (g[1] + g[3]) / 2 + ny * bend * 2, v = 1 - u;
  return [v * v * g[0] + 2 * v * u * cx + u * u * g[2], v * v * g[1] + 2 * v * u * cy + u * u * g[3]];
}

/** One brush stroke of the sword: a hairline at the start, full in the middle, the tail splitting into bristles.
 *  `back` shifts it against the cut's bend (the trail of the sweep); `dens` < 1 leaves pixels out. */
function brush(g: [number, number, number, number], bend: number, w: number, core: number, edge: number,
  dens: number, t: number, back = 0): void {
  const N = 70;
  for (let k = 0; k <= N; k++) {
    const u = k / N, [x, y] = bez(g, bend, u), [x2, y2] = bez(g, bend, Math.min(1, u + 0.01));
    const L = Math.hypot(x2 - x, y2 - y) || 1, nx = -(y2 - y) / L, ny = (x2 - x) / L;
    const sb = Math.sign(bend) || 1, bx = x - nx * back * sb, by = y - ny * back * sb;
    const ww = w * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.6);
    if (u > 0.72) {                                     // the tail frays into three bristles
      for (const b of [-0.7, 0, 0.7]) {
        if (((k * 7 + b * 10 + 13) | 0) % 5 === 0) continue;
        const px = clng(bx + nx * b * w), py = clng(by + ny * b * w);
        if (dens >= 1 || (px + py + t) % 2 === 0) R.putPixel(px, py, b === 0 ? core : edge);
      }
      continue;
    }
    for (let d = -Math.ceil(ww); d <= Math.ceil(ww); d++) {
      const px = clng(bx + nx * d), py = clng(by + ny * d);
      if (dens < 1 && (px + py + t) % 2) continue;
      R.putPixel(px, py, Math.abs(d) <= ww * 0.45 ? core : Math.abs(d) <= ww ? edge : C_DARK());
    }
  }
}

/** Sparks rising off a burning stroke (age a ticks since it settled). */
function embers(g: [number, number, number, number], bend: number, a: number, k: number): void {
  for (let q = 0; q < 12; q++) {
    const life = (a + q * 3) % 12, u = ((q * 37 + k * 11) % 100) / 100;
    const [x, y] = bez(g, bend, 0.08 + u * 0.8);
    const px = clng(x + Math.sin((life + q) * 0.7) * 2), py = clng(y - life * 1.6);
    R.putPixel(px, py, life < 4 ? C_CORE() : life < 8 ? C_HOT() : C_RED());
    if (life < 5) R.putPixel(px, py + 1, C_RED());
  }
}

/** Stroke k of 삼절검 as [x0, y0, x1, y1]: the first two cross in an X on the marked spot, the third falls
 *  straight down through the crossing. */
function scarLine(cx: number, ground: number, facing: number, k: number): [number, number, number, number] {
  const cy = ground - 22;
  const dx = [-0.7, 0.7, 0][k] * facing, dy = 1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, r = k === 2 ? 34 : 30;
  return [cx - ux * r, cy - uy * r, cx + ux * (k === 2 ? 22 : r), cy + uy * (k === 2 ? 22 : r)];
}

/** The blade coming down along its cut: p = 0.45 halfway in from the sky, 1 = point at the end of the cut. */
function drawFallingBlade(g: [number, number, number, number], p: number): void {
  const L0 = Math.hypot(g[2] - g[0], g[3] - g[1]), ux = (g[2] - g[0]) / L0, uy = (g[3] - g[1]) / L0;
  const tipX = g[2] - ux * (1 - p) * 140, tipY = g[3] - uy * (1 - p) * 140, BL = 56;
  const hx = tipX - ux * BL, hy = tipY - uy * BL;
  thickLine(hx, hy, tipX, tipY, 3, C_CORE(), C_RED());
  const nx = -uy, ny = ux;
  thickLine(hx - nx * 7, hy - ny * 7, hx + nx * 7, hy + ny * 7, 1, RGB(232, 184, 72), RGB(232, 184, 72));   // the guard
  thickLine(hx - ux * 10, hy - uy * 10, hx, hy, 1, C_DARK(), C_DARK());                                  // the grip
}

// ---- Cheonma with the sword: 천마참 (one unblockable cut, a crimson crescent as tall as a man)
function drawDemonCut(i: number): void {
  const f = F[i], t = f.stTick - D.MvStartup[f.mv];
  drawDemonCutAt(f.x, f.footY, f.facing, t, D.MvActive[f.mv]);
}

function drawDemonCutAt(x: number, ground: number, facing: number, t: number, active: number): void {
  if (t < 0 || t > active + 2) return;
  const lit = t <= active, cx = x + facing * 6, cy = ground - 22;
  for (let a = -110; a <= 80; a += 3) {
    const c = Math.cos(a * 0.0174533), s = Math.sin(a * 0.0174533), prog = (a + 110) / 190;
    if (prog > (t + 1) / (active + 1) + 0.15) continue;
    for (let r = 14; r <= 26; r++) {
      const edge = r === 14 || r === 26, inner = r > 22;
      const col = edge ? C_DARK() : inner ? (lit ? C_CORE() : C_HOT()) : r > 18 ? (lit ? C_HOT() : C_RED()) : C_RED();
      if (!lit && r < 18) continue;
      R.putPixel(clng(cx + facing * c * r), clng(cy + s * r), col);
    }
  }
}

/** Play the armed Heavenly Demon's battle art at a story contact without changing the fight's palette. */
export function drawAltarSwordArt(kind: "slash" | "threeCuts", x: number, ground: number, facing: number, t: number): void {
  const previous = mCrashKit;
  mCrashKit = "cheonma";
  try {
    if (kind === "threeCuts") drawThreeCuts(x, ground, facing, t, true);
    else drawDemonCutAt(x, ground, facing, t, D.MvActive[moveId("cheonmasw.sp1")]);
  } finally { mCrashKit = previous; }
}

// ---- Baek Mujin: 금강벽. A parry stance; a hit landing in its active window is turned aside and answered at once.

/** Is fighter d holding the parry right now? */
export function parrying(d: number): boolean {
  const f = F[d];
  return f.state === ST_ATTACK && D.MvType[f.mv] === MT_COUNTER && f.stTick >= D.MvStartup[f.mv]
    && f.stTick < D.MvStartup[f.mv] + D.MvActive[f.mv];
}

/** d parried a hit from a: the blow is cancelled, a gold flash, and the counter cut (<move>c) starts. */
export function counterStrike(d: number, a: number, cx: number, cy: number): void {
  const f = F[d], mv = moveId(mvKeyOf(f.mv) + "c");
  Combat.showText("COUNTER", 20, d);                     // the flash on the blade is in the counter's first frame
  Combat.C.HitStop = 8; Combat.C.WhiteFlash = 1;
  F[a].hasHit = true;
  if (mv < 0) return;
  f.mv = mv; f.hasHit = false; f.hitCount = 0;
  setState(d, ST_ATTACK);
}

/** 백일천검 on the foe's side: the light swords of baekmujin_fx fall_0..5 at the marked spot (drawn for the foe facing
 *  left, so mirrored when Baek Mujin faces left). Three blades strike at CRASH_BLADES; if all three cut clean they stand
 *  glowing until CRASH_GHOST_END and burst together, otherwise the third blade's burst ends it at once. */
function drawSkySwords(i: number, t: number): void {
  const f = F[i];
  const k = skySwordFrame(t, (f.hitCount & GHOST) !== 0);
  if (k < 0) return;
  const nm = "baekmujin.fall_" + k;
  if (hasSprite(nm)) R.drawSprite(spriteId(nm), f.cineCX, vint(GROUND_Y + 0.5), f.facing < 0);
}

export function skySwordFrame(t: number, ghost: boolean): number {
  if (t < 0) return -1;                                   // the gathering is in his own frames (bs_0..2)
  const b = CRASH_BLADES;
  const end = ghost ? CRASH_GHOST_END : b[2] + 3;
  let k: number;
  if (t <= b[0]) k = 0;
  else if (t <= b[1]) k = 1;
  else if (t <= b[2]) k = 2;
  else if (t < end) k = 3;
  else if (t < end + 4) k = 4;
  else if (t < end + 8) k = 5;
  else return -1;
  return k;
}

// ---- Hyeolma: the blood frenzy and its blood wave (the demon arm and the frenzy coming on are drawn in his SD frames)

let mWaveMv = -2;
function bloodWaveMove(): number {
  if (mWaveMv === -2) mWaveMv = moveId("hyeolma.sp1r");
  return mWaveMv;
}

/** The frenzy: the two great blood arms (hyeolma_fx farm_*) breathe behind him whatever he is doing. */
const shoulderPixels: Record<string, [number, number]> = {
  dash: [17, 14], bdash: [14, 15], jump: [12, 13], jp: [14, 14], jk: [15, 14],
  crouch: [12, 15], clp: [13, 15], clk: [10, 15], chk: [12, 16], chp_1: [12, 17],
  hp_1: [18, 13], ovh_1: [19, 15], throw_1: [22, 14], sp_a: [22, 14],
  down_0: [13, 10], down_1: [28, 9], fall: [22, 9], kneel: [23, 15],
  roll_0: [14, 15], roll_1: [19, 14], roll_2: [12, 13], roll_3: [17, 13],
};

function drawFrenzyArms(i: number, pose: number): void {
  const f = F[i];
  if (f.state === ST_ATTACK && D.MvType[f.mv] === MT_RAGE) return;   // the frenzy's own frames grow them
  drawBloodArms(vint(f.x + 0.5), vint(f.footY + 0.5), f.facing, pose, mDraw);
}

export function drawBloodArms(cx: number, ground: number, face: number, pose: number, tick: number): void {
  const k = Math.trunc(tick / 6) % 4, nm = "hyeolma.farm_" + k;
  const name = D.SprName[pose].slice("hyeolma.".length);
  const [sx, sy] = shoulderPixels[name] ?? [D.SprAX[pose], 14];
  const x = cx + (sx - D.SprAX[pose]) * face;
  const y = ground + sy - D.SprAY[pose];
  if (hasSprite(nm)) R.drawSprite(spriteId(nm), x, y, face < 0);
}

/** The blood wave (frenzy sp1): rings of blood spikes run out along the ground on both sides. */
function drawBloodWave(i: number): void {
  const f = F[i], t = f.stTick - D.MvStartup[f.mv] + 4;
  const k = Math.trunc(t / 2);
  if (t < 0 || k > 5) return;
  const nm = "hyeolma.wave_" + k;
  if (hasSprite(nm)) R.drawSprite(spriteId(nm), vint(f.x + 0.5), vint(f.footY + 0.5), f.facing < 0);
}

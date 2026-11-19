// Port of Match.bas: rounds, timer, best of 3, training refills, round banners.
import { F, resetRound as fighterResetRound, setPose, METER_MAX, NAEGONG_MAX, ST_HIT, ST_DOWN, ST_THROWN, ST_GUARD, ST_ATTACK, hashMix } from "./fighter";
import * as Tag from "./tag";
import * as Proj from "./projectile";
import * as Combat from "./combat";
import * as FX from "./fx";
import * as R from "./renderer";
import { SCREEN_W } from "./renderer";
import * as Font from "./font";
import * as K from "./input";
import * as Lockstep from "./lockstep";
import { G, MODE_ARCADE, GS_MENU, startMatch, restart } from "./game";
import * as Arcade from "./arcade";
import * as Story from "./story";
import { RGB, clng } from "./util";

export const MP_INTRO = 1, MP_FIGHT = 2, MP_KO = 3, MP_TIMEUP = 4, MP_ROUNDEND = 5, MP_MATCHEND = 6;
export const M = { RoundTicks: 1200 };
let WIN_ROUNDS = 2;
const MAX_ROUNDS = 5, INTRO_TICKS = 50, TIMEUP_TICKS = 40, ROUNDEND_TICKS = 60, REFILL_DELAY = 30;

let mRounds = false, mTraining = false, mPhase = 0, mT = 0, mRound = 1, mTime = 0;
const mWins = [0, 0], mCalm = [0, 0];
let mRoundWinner = -1, mMatchWinner = -1, mPerfect = false;

export function beginMatch(rounds: boolean, training: boolean, winRounds = 2): void {
  if (M.RoundTicks <= 0) M.RoundTicks = 1200;
  WIN_ROUNDS = winRounds;
  mRounds = rounds; mTraining = training; mRound = 1; mWins[0] = mWins[1] = 0;
  startRound(false);
}

function startRound(keepMeter: boolean): void {
  fighterResetRound(keepMeter);
  Tag.resetRound();
  Proj.clear();
  Combat.init();
  FX.init();
  mTime = M.RoundTicks; mT = 0; mCalm[0] = mCalm[1] = 0;
  if (mRounds) { mPhase = MP_INTRO; setPose(0, "intro"); setPose(1, "intro"); }
  else mPhase = MP_FIGHT;
  if (mTraining) { F[0].meter = METER_MAX; F[1].meter = METER_MAX; }
}

export const phase = () => mPhase;
export const matchWinner = () => mMatchWinner;
export const phaseTicks = () => mT;
export const wins = (i: number) => mWins[i];
export const roundsOn = () => mRounds;
export const inputAllowed = () => mPhase === MP_FIGHT;

export function hashPart(): number {
  let h = 0;
  for (const v of [mPhase, mT, mRound, mWins[0], mWins[1], mTime]) h = hashMix(h, v);
  return clng(h);
}

export function tick(frozen: boolean): void {
  mT++;
  switch (mPhase) {
    case MP_INTRO:
      if (mT === 30) { setPose(0, ""); setPose(1, ""); }
      if (mT >= INTRO_TICKS) { mPhase = MP_FIGHT; mT = 0; }
      break;
    case MP_FIGHT:
      if (Combat.isKO()) { mPhase = MP_KO; mT = 0; }
      else if (mRounds && !frozen) {
        mTime--;
        if (mTime <= 0) { mTime = 0; mPhase = MP_TIMEUP; mT = 0; }
      }
      if (mTraining) trainingRefill();
      break;
    case MP_KO:
      if (Combat.C.KoFinished) {
        if (mRounds) roundOver();
        else startRound(true);
      }
      break;
    case MP_TIMEUP:
      if (mT >= TIMEUP_TICKS) roundOver();
      break;
    case MP_ROUNDEND:
      if (mT >= ROUNDEND_TICKS) {
        if (mWins[0] >= WIN_ROUNDS || mWins[1] >= WIN_ROUNDS || mRound >= MAX_ROUNDS) {
          mMatchWinner = mWins[0] > mWins[1] ? 0 : mWins[1] > mWins[0] ? 1 : -1;
          mPhase = MP_MATCHEND; mT = 0;
        } else { mRound++; startRound(true); }
      }
      break;
    case MP_MATCHEND:
      if (Lockstep.active()) break;
      if (G.StoryFight) {
        if (mT >= 40 || (mT >= 15 && K.isPressed(K.BTN_LP))) Story.matchOver(mMatchWinner === G.controlled());
      } else if (G.GameMode === MODE_ARCADE) {
        if (mT >= 50 || (mT >= 15 && K.isPressed(K.BTN_LP))) Arcade.matchOver(mMatchWinner === G.controlled());
      } else if (K.isPressed(K.BTN_LP)) restart();
      else if (K.isPressed(K.BTN_HP)) G.GameState = GS_MENU;
      break;
  }
}

function roundOver(): void {
  let r0: number, r1: number;
  if (Tag.active()) { r0 = Tag.teamRatio(0); r1 = Tag.teamRatio(1); }
  else { r0 = F[0].health / F[0].maxHealth; r1 = F[1].health / F[1].maxHealth; }
  mRoundWinner = r0 > r1 ? 0 : r1 > r0 ? 1 : -1;
  mPerfect = false;
  if (mRoundWinner >= 0) {
    mWins[mRoundWinner]++;
    mPerfect = F[mRoundWinner].health === F[mRoundWinner].maxHealth;
    setPose(mRoundWinner, "win");
  }
  mPhase = MP_ROUNDEND; mT = 0;
}

function trainingRefill(): void {
  for (let i = 0; i <= 1; i++) {
    const f = F[i], st = f.state;
    if (st === ST_HIT || st === ST_DOWN || st === ST_THROWN || st === ST_GUARD) mCalm[i] = 0;
    else { mCalm[i]++; if (mCalm[i] === REFILL_DELAY) f.health = f.maxHealth; }
    if (f.meter < METER_MAX && st !== ST_ATTACK) f.meter = METER_MAX;
    if (st !== ST_ATTACK) f.naegong = NAEGONG_MAX;
  }
}

export function draw(): void {
  const cx = Math.trunc(SCREEN_W / 2);
  if (mRounds) {
    const secs = Math.trunc((mTime + 19) / 20);
    const c = secs <= 10 && Math.trunc(mT / 5) % 2 === 0 && mPhase === MP_FIGHT ? RGB(255, 90, 70) : RGB(255, 236, 190);
    Font.drawBig(("0" + secs).slice(-2), cx, 1, c, 1);
    for (let k = 0; k < WIN_ROUNDS; k++) {
      R.fillRect(cx - 16 - k * 5, 10, 3, 3, mWins[0] > k ? RGB(255, 200, 80) : RGB(50, 42, 60));
      R.fillRect(cx + 14 + k * 5, 10, 3, 3, mWins[1] > k ? RGB(255, 200, 80) : RGB(50, 42, 60));
    }
  } else if (mTraining) Font.drawText("TRAINING", cx, 2, RGB(150, 220, 255), 1, 1);

  switch (mPhase) {
    case MP_INTRO:
      if (mT < 30) banner(WIN_ROUNDS === 1 ? "READY" : mWins[0] === WIN_ROUNDS - 1 && mWins[1] === WIN_ROUNDS - 1 ? "FINAL ROUND" : "ROUND " + mRound, 30, RGB(255, 236, 190), 2);
      else banner("FIGHT!", 28, RGB(255, 120, 60), 3);
      break;
    case MP_TIMEUP: banner("TIME", 28, RGB(255, 236, 190), 3); break;
    case MP_ROUNDEND:
      if (mRoundWinner < 0) banner("DRAW", 30, RGB(255, 236, 190), 2);
      else {
        banner((F[mRoundWinner].label || F[mRoundWinner].prefix).toUpperCase() + " WINS", 30, RGB(255, 236, 190), 2);
        if (mPerfect) Font.drawBig("PERFECT", cx, 47, RGB(255, 200, 80), 1);
      }
      break;
    case MP_MATCHEND: {
      let t: string;
      if (mMatchWinner < 0) t = "DRAW GAME";
      else if (G.Multi) t = mMatchWinner + 1 + "P WINS";
      else if (G.WatchMode) t = F[mMatchWinner].prefix.toUpperCase() + " WINS";
      else t = mMatchWinner === G.controlled() ? "YOU WIN" : "YOU LOSE";
      banner(t, 28, RGB(255, 204, 92), 3);
      if (G.GameMode !== MODE_ARCADE && !G.StoryFight && !Lockstep.active()) Font.drawText("A = REMATCH   S = MENU", cx, 54, RGB(220, 210, 230), 1, 1);
      break;
    }
  }
}

function banner(t: string, y: number, c: number, px: number): void {
  R.fillRect(0, y - 3, SCREEN_W, 7 * px + 7, RGB(14, 10, 20));
  R.fillRect(0, y - 4, SCREEN_W, 1, RGB(120, 90, 40));
  R.fillRect(0, y + 7 * px + 4, SCREEN_W, 1, RGB(120, 90, 40));
  Font.drawBig(t, Math.trunc(SCREEN_W / 2), y, c, px);
}

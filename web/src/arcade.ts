// Port of Arcade.bas: six opponents in random order, your own shadow, then Cheonma. Clear unlocks Cheonma.
import * as Account from "./account";
import * as R from "./renderer";
import { SCREEN_W, SCREEN_H } from "./renderer";
import * as Font from "./font";
import * as K from "./input";
import { D } from "./data";
import * as Screens from "./screens";
import { G, GS_LADDER, GS_CONTINUE, GS_ENDING, GS_MENU, startMatch } from "./game";
import { LV_HARD } from "./cpu";
import { RGB } from "./util";

const FIGHTS = 7, BOSS_PREFIX = "cheonma", BOSS_NAME = "CHEONMA";
const mOrder: string[] = [], mName: string[] = [], mStage: number[] = [];
let mIdx = 0, mPlayer = "", mPlayerName = "", mBaseLevel = 1, mContinues = 0, mT = 0, mGameOver = false, mJustUnlocked = false;
const cGold = RGB(240, 190, 80), cDim = RGB(130, 120, 150), cP1 = RGB(90, 170, 255), cP2 = RGB(255, 90, 80);

export function begin(player: string): void {
  mPlayer = player;
  mPlayerName = Screens.rosterName(Screens.rosterIndex(player));
  mBaseLevel = G.CpuLevel;
  const pool: string[] = [];
  for (let k = 0; k < Screens.ROSTER_SIZE; k++) if (Screens.rosterPrefix(k) !== player) pool.push(Screens.rosterPrefix(k));
  for (let k = pool.length - 1; k >= 1; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  const n = pool.length;
  if (player === BOSS_PREFIX) {
    for (let k = 0; k <= FIGHTS - 2; k++) { mOrder[k] = pool[k % n]; mName[k] = Screens.rosterName(Screens.rosterIndex(mOrder[k])); }
  } else {
    for (let k = 0; k <= FIGHTS - 3; k++) { mOrder[k] = pool[k % n]; mName[k] = Screens.rosterName(Screens.rosterIndex(mOrder[k])); }
    mOrder[FIGHTS - 2] = player; mName[FIGHTS - 2] = "SHADOW";
  }
  for (let k = 0; k <= FIGHTS - 2; k++) mStage[k] = k % D.StageCount;
  mOrder[FIGHTS - 1] = BOSS_PREFIX; mName[FIGHTS - 1] = BOSS_NAME; mStage[FIGHTS - 1] = D.StageCount - 1;
  mJustUnlocked = false; mIdx = 0; mContinues = 0;
  showLadder();
}

export const isBossFight = () => mIdx === FIGHTS - 1;
function showLadder(): void { mT = 0; G.GameState = GS_LADDER; }

function startFight(): void {
  G.P1Char = mPlayer; G.P2Char = mOrder[mIdx]; G.HumanIndex = 0; G.StageIndex = mStage[mIdx];
  if (mIdx === FIGHTS - 1) G.CpuLevel = LV_HARD;
  else if (mIdx >= 3 && mBaseLevel < LV_HARD) G.CpuLevel = mBaseLevel + 1;
  else G.CpuLevel = mBaseLevel;
  startMatch();
}

export function matchOver(won: boolean): void {
  G.CpuLevel = mBaseLevel;
  mT = 0;
  if (won) {
    mIdx++;
    if (mIdx >= FIGHTS) {
      if (!bossUnlocked()) { saveUnlock(); mJustUnlocked = true; }
      G.GameState = GS_ENDING;
    } else showLadder();
  } else { mGameOver = false; G.GameState = GS_CONTINUE; }
}

/** Logged in: the account's own unlock (any device). Logged out: this browser's guest unlock. */
export function bossUnlocked(): boolean {
  if (Account.loggedIn()) return Account.saveData().cheonma === true;
  try { return localStorage.getItem("pixelmurim.cheonma") === "1"; } catch { return false; }
}
function saveUnlock(): void {
  if (Account.loggedIn()) { Account.store({ cheonma: true }); return; }
  try { localStorage.setItem("pixelmurim.cheonma", "1"); } catch { /* private mode: not saved */ }
}

const countdownSecs = () => 9 - Math.trunc(mT / 20);

export function screenTick(): void {
  Screens.tickMenu();
  mT++;
  if (G.GameState === GS_LADDER) {
    if (mT >= 70 || (mT >= 10 && K.isPressed(K.BTN_LP))) startFight();
  } else if (G.GameState === GS_CONTINUE) {
    if (mGameOver) { if (mT >= 60 || (mT >= 15 && K.isPressed(K.BTN_LP))) G.GameState = GS_MENU; }
    else if (K.isPressed(K.BTN_LP)) { mContinues++; startFight(); }
    else if (K.isPressed(K.BTN_HP) || countdownSecs() < 0) { mGameOver = true; mT = 0; }
    else if (K.isPressed(K.BTN_LK)) mT = (Math.trunc(mT / 20) + 1) * 20;
  } else if (G.GameState === GS_ENDING) {
    if (mT >= 40 && K.isPressed(K.BTN_LP)) G.GameState = GS_MENU;
  }
}

export function screenRender(): void {
  if (G.GameState === GS_LADDER) ladderRender();
  else if (G.GameState === GS_CONTINUE) continueRender();
  else if (G.GameState === GS_ENDING) endingRender();
}

function panels(): void {
  R.beginFrame(true);
  R.fillRect(0, 10, 64, 90, RGB(14, 20, 40)); R.fillRect(128, 10, 64, 90, RGB(40, 14, 18));
  R.fillRect(63, 10, 1, 90, cP1); R.fillRect(128, 10, 1, 90, cP2);
}

function ladderRender(): void {
  const cx = SCREEN_W / 2;
  panels();
  Font.drawBig(mIdx === FIGHTS - 1 ? "FINAL STAGE" : "STAGE " + (mIdx + 1) + " OF " + FIGHTS, cx, 2, cGold, 1);
  Font.drawText("1P", 3, 13, cP1);
  Font.drawText("CPU", SCREEN_W - 3, 13, cP2, 1, 2);
  Screens.drawBigView(mPlayer, 32, false, 0, 63);
  Screens.drawBigView(mOrder[mIdx], 160, true, 129, SCREEN_W - 1, mOrder[mIdx] === mPlayer);
  Font.drawBig("VS", cx, 13, RGB(255, 240, 210), 2);
  Font.drawBig(mName[mIdx], cx, 31, mIdx === FIGHTS - 1 ? RGB(255, 90, 70) : RGB(255, 240, 210), 1);
  const blink = Math.trunc(Screens.menuTick() / 5) % 2 === 0;
  for (let k = 0; k < FIGHTS; k++) {
    const x = k < 4 ? 64 + k * 16 : 72 + (k - 4) * 16, y = k < 4 ? 46 : 68;
    if (k === FIGHTS - 1 && mIdx < FIGHTS - 1) {
      R.fillRect(x, y, 15, 20, RGB(40, 12, 16));
      Font.drawBig("?", x + 8, y + 3, RGB(150, 50, 50), 2);
    } else Screens.drawPortraitAt(Screens.rosterIndex(mOrder[k]), x, y, 15, mOrder[k] === mPlayer);
    if (k < mIdx) for (let c = 2; c <= 16; c++) {
      R.fillRect(x + Math.trunc(((c - 2) * 12) / 14) + 1, y + c, 2, 1, RGB(220, 40, 40));
      R.fillRect(x + 12 - Math.trunc(((c - 2) * 12) / 14), y + c, 2, 1, RGB(220, 40, 40));
    }
    if (k === mIdx) {
      const c = blink ? cP2 : RGB(120, 40, 40);
      R.drawRectOutline(x - 1, y - 1, 17, 22, c);
      R.drawRectOutline(x, y, 15, 20, c);
    } else R.drawRectOutline(x, y, 15, 20, RGB(70, 60, 90));
  }
  Font.drawText("A = FIGHT", cx, 93, RGB(110, 100, 130), 1, 1);
}

function continueRender(): void {
  const cx = SCREEN_W / 2;
  R.fillRect(0, 0, SCREEN_W, SCREEN_H, RGB(10, 8, 16));
  Screens.drawBigView(mPlayer, 32, false, 0, 63);
  if (mGameOver) { Font.drawBig("GAME OVER", cx + 20, 38, RGB(220, 60, 50), 2); return; }
  Font.drawBig("CONTINUE?", cx + 20, 18, cGold, 2);
  const s = Math.max(0, countdownSecs());
  Font.drawBig(String(s), cx + 20, 40, s <= 3 ? RGB(255, 90, 70) : RGB(255, 240, 210), 4);
  Font.drawText("VS " + mName[mIdx], cx + 20, 74, cDim, 1, 1);
  Font.drawText("A = CONTINUE   S = GIVE UP", cx + 20, 88, RGB(150, 140, 170), 1, 1);
}

const ENDINGS: Record<string, string[]> = {
  cheolsan: ["THE IRON MOUNTAIN STOOD", "UNMOVED. HE RETURNED TO THE", "TEMPLE AND RANG THE GREAT", "BELL FOR NINE DAYS."],
  muyeong: ["ONE BLADE. TEN THOUSAND CUTS.", "MUYEONG SHEATHED HIS SWORD", "AND VANISHED INTO THE MIST", "OF THE BAMBOO FOREST."],
  seolhwa: ["SNOW FELL ON THE PEAK AS", "SEOLHWA LANDED HER LAST KICK.", "NO ONE IN MURIM COULD", "CATCH HER SHADOW AGAIN."],
  heukrim: ["HEUKRIM TOOK THE DEMON ART", "FOR HIMSELF. THE BLACK", "FOREST HAS A NEW MASTER", "AND IT IS VERY QUIET."],
  cheonma: ["THE HEAVENLY DEMON STRUCK", "DOWN HIS OWN SHADOW. NO ONE", "IS LEFT TO CHALLENGE HIM.", "MURIM BOWS TO ONE MASTER."],
  hongryeon: ["THE RED LOTUS BLOOMED OVER", "THE WATERFALL. HONGRYEON", "CLOSED HER FANS AND SMILED.", "THE DANCE WAS OVER."],
  danwoo: ["THE WANDERER DEFEATED THE", "HEAVENLY DEMON AND WALKED ON.", "HIS RED BAND STILL FLIES", "ON EVERY MOUNTAIN ROAD."],
};

function endingRender(): void {
  const cx = SCREEN_W / 2;
  R.fillRect(0, 0, SCREEN_W, SCREEN_H, RGB(12, 10, 22));
  R.fillRect(0, 10, 64, 90, RGB(14, 20, 40));
  R.fillRect(63, 10, 1, 90, cGold);
  Screens.drawBigView(mPlayer, 32, false, 0, 63);
  Font.drawBig("CONGRATULATIONS", cx, 2, cGold, 1);
  Font.drawBig(mPlayerName, 128, 16, RGB(255, 240, 210), 1);
  const shown = Math.trunc(mT / 12), lines = ENDINGS[mPlayer] ?? ENDINGS.danwoo;
  for (let k = 0; k < 4; k++) if (k < shown) Font.drawText(lines[k], 70, 32 + k * 9, RGB(220, 210, 230));
  if (shown > 4) {
    Font.drawText("CONTINUES " + mContinues, 128, 72, cDim, 1, 1);
    if (mJustUnlocked && Math.trunc(mT / 8) % 2 === 0) Font.drawText("NEW FIGHTER: CHEONMA", 128, 82, RGB(255, 90, 70), 1, 1);
    else if (!mJustUnlocked) Font.drawBig("THE END", 128, 80, cGold, 1);
  }
  if (mT >= 40) Font.drawText("A = TITLE", 128, 93, RGB(110, 100, 130), 1, 1);
}

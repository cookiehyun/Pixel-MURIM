// Port of Screens.bas: title menu, character select, level select, stage select.
import * as R from "./renderer";
import { SCREEN_W, SCREEN_H, GROUND_Y } from "./renderer";
import * as Font from "./font";
import * as K from "./input";
import { D, spriteId, animId, animFrame } from "./data";
import { F } from "./fighter";
import * as Arcade from "./arcade";
import { levelName } from "./cpu";
import { G, GS_SELECT, GS_LEVEL, GS_STAGE, GS_MENU, MODE_ARCADE, MODE_TAG, MODE_TRAINING, MODE_VSCPU, restart } from "./game";
import { RGB } from "./util";

const ROSTER = 8, SLOT_CHEONMA = 6, SLOT_RANDOM = 7, GRID_COLS = 4, BOX_W = 15;
export const ROSTER_SIZE = 6;
const rPrefix = ["danwoo", "cheolsan", "muyeong", "seolhwa", "heukrim", "hongryeon", "cheonma", ""];
const rName = ["DANWOO", "CHEOLSAN", "MUYEONG", "SEOLHWA", "HEUKRIM", "HONGRYEON", "CHEONMA", "RANDOM"];
const rStat = [[3, 4, 3, 3, 4], [5, 1, 2, 5, 1], [2, 3, 5, 2, 3], [1, 4, 1, 1, 5], [3, 4, 4, 3, 2], [2, 4, 4, 3, 5], [5, 3, 2, 3, 1], [0, 0, 0, 0, 0]];
const rHeadX = [2, 4, 2, 1, 4, 1, 4, 0], rHeadY = [-30, -35, -31, -30, -32, -30, -35, 0];
const cGold = RGB(240, 190, 80), cDim = RGB(130, 120, 150), cP1 = RGB(90, 170, 255), cP2 = RGB(255, 90, 80);

let mCursor = 0, mMenuLevel = 0, mMenuTick = 0, mPhase = 0, mLevelSel = 1, mStageSel = 0, mNotice = 0;
const mSel = [0, 1, 2, 3], mPick = [0, 1, 2, 3];

export const rosterPrefix = (k: number) => rPrefix[k];
export const rosterName = (k: number) => rName[k];
export const rosterIndex = (p: string) => rPrefix.indexOf(p);
export const menuTick = () => mMenuTick;
export function tickMenu(): void { mMenuTick++; }

export function drawPortraitAt(k: number, x: number, y: number, w = 20, alt = false): void {
  R.fillRect(x, y, w, 20, RGB(26, 22, 36));
  R.drawSpriteScaled(spriteId(rPrefix[k] + ".idle_0"), x + Math.trunc(w / 2) - rHeadX[k] * 2, y + 9 - rHeadY[k] * 2, false, 2, x + 1, y + 1, x + w - 2, y + 18, -1, alt);
}

export function drawBigView(prefix: string, x: number, flip: boolean, clipL: number, clipR: number, alt = false): void {
  const ref = spriteId(prefix + ".idle_0");
  x = flip ? x - (D.SprAX[ref] * 2 - D.SprW[ref]) : x - (D.SprW[ref] - D.SprAX[ref] * 2);
  R.drawSpriteScaled(animFrame(animId(prefix + ".idle"), mMenuTick), x, 96, flip, 2, clipL, 10, clipR, 99, -1, alt);
}

const locked = (k: number) => k === SLOT_CHEONMA && !Arcade.bossUnlocked() && G.GameMode !== MODE_TRAINING;
const isRandom = (k: number) => k === SLOT_RANDOM;
function randomPick(): number {
  const n = ROSTER_SIZE + (locked(SLOT_CHEONMA) ? 0 : 1);
  return Math.floor(Math.random() * n);
}

// ---------------------------------------------------------------- title

const LABELS: Record<number, string[]> = { 0: ["SINGLE PLAYER", "MULTIPLAYER"], 1: ["ARCADE", "VS CPU", "TRAINING"], 2: ["2P", "ONLINE"] };

export function titleTick(): void {
  mMenuTick++;
  if (mNotice > 0) mNotice--;
  const n = LABELS[mMenuLevel].length;
  if (K.isPressed(K.BTN_UP)) mCursor = (mCursor + n - 1) % n;
  if (K.isPressed(K.BTN_DOWN)) mCursor = (mCursor + 1) % n;
  if ((K.isPressed(K.BTN_QUIT) || K.isPressed(K.BTN_HP)) && mMenuLevel > 0) { mCursor = mMenuLevel - 1; mMenuLevel = 0; return; }
  if (!K.isPressed(K.BTN_LP)) return;
  if (mMenuLevel === 0) { mMenuLevel = 1 + mCursor; mCursor = 0; }
  else if (mMenuLevel === 1) {
    G.Multi = false; G.WatchMode = false;
    G.GameMode = mCursor === 0 ? MODE_ARCADE : mCursor === 1 ? MODE_TAG : MODE_TRAINING;
    selectBegin();
  } else if (mMenuLevel === 2) {
    if (mCursor === 0) { G.Multi = true; G.WatchMode = false; G.GameMode = MODE_TAG; selectBegin(); }
    else mNotice = 60;                                    // online: not in the web version yet
  }
}

export function titleRender(): void {
  const cx = SCREEN_W / 2;
  R.beginFrame(true);
  R.drawSprite(animFrame(F[0].aIdle, mMenuTick), 30, GROUND_Y, false);
  R.drawSprite(animFrame(F[1].aIdle, mMenuTick), SCREEN_W - 30, GROUND_Y, true);
  Font.drawBig("PIXEL", cx, 5, RGB(230, 220, 200), 2);
  Font.drawBig("MURIM", cx, 21, RGB(255, 204, 92), 3);
  R.fillRect(cx - 50, 46, 100, 1, RGB(200, 150, 60));
  R.fillRect(cx - 38, 48, 76, 1, RGB(140, 100, 40));
  R.fillRect(cx - 52, 45, 3, 3, RGB(200, 150, 60));
  R.fillRect(cx + 49, 45, 3, 3, RGB(200, 150, 60));
  const labels = LABELS[mMenuLevel];
  for (let k = 0; k < labels.length; k++) {
    const y = 54 + k * 11;
    let c: number;
    if (k === mCursor) {
      R.fillRect(cx - 36, y - 2, 72, 9, RGB(40, 28, 20));
      R.drawRectOutline(cx - 36, y - 2, 72, 9, RGB(230, 180, 80));
      c = RGB(255, 236, 180);
      if (Math.trunc(mMenuTick / 6) % 2 === 0) {
        Font.drawText(">", cx - 32, y, RGB(255, 200, 90));
        Font.drawText("<", cx + 30, y, RGB(255, 200, 90));
      }
    } else {
      R.fillRect(cx - 36, y - 2, 72, 9, RGB(20, 16, 26));
      c = RGB(130, 120, 150);
    }
    Font.drawText(labels[k], cx, y, c, 1, 1);
  }
  if (mNotice > 0) Font.drawText("ONLINE IS COMING SOON", cx, 85, RGB(255, 140, 70), 1, 1);
  Font.drawText(mMenuLevel === 0 ? "UP DOWN = SELECT    A = OK" : "UP DOWN = SELECT    A = OK    S = BACK", cx, 92, RGB(150, 140, 170), 1, 1);
}

// ---------------------------------------------------------------- character select

export function selectBegin(): void {
  mPhase = 0;
  mSel[0] = 0; mSel[1] = 1; mSel[2] = 2; mSel[3] = 3;
  G.GameState = GS_SELECT;
}

const tagMode = () => G.GameMode === MODE_TAG;
const playerPhase = () => (tagMode() ? mPhase <= 1 : mPhase === 0);
const lastPhase = () => (tagMode() ? 3 : 1);
const oppPick = () => (tagMode() ? mPick[2] : mPick[1]);

export function selectTick(): void {
  mMenuTick++;
  let k = mSel[mPhase];
  if (K.isPressed(K.BTN_LEFT)) k = Math.trunc(k / GRID_COLS) * GRID_COLS + (((k % GRID_COLS) + GRID_COLS - 1) % GRID_COLS);
  if (K.isPressed(K.BTN_RIGHT)) k = Math.trunc(k / GRID_COLS) * GRID_COLS + (((k % GRID_COLS) + 1) % GRID_COLS);
  if (K.isPressed(K.BTN_UP) || K.isPressed(K.BTN_DOWN)) k = (k + GRID_COLS) % ROSTER;
  mSel[mPhase] = k;
  if (K.isPressed(K.BTN_LP) && !locked(k)) {
    if (isRandom(k)) k = randomPick();
    mPick[mPhase] = k;
    if (mPhase === 0 && G.GameMode === MODE_ARCADE) { mPick[1] = (k + 1) % ROSTER_SIZE; selectDone(); }
    else if (mPhase < lastPhase()) mPhase++;
    else selectDone();
  } else if (K.isPressed(K.BTN_HP)) {
    if (mPhase > 0) mPhase--;
    else G.GameState = GS_MENU;
  }
}

function selectDone(): void {
  G.P1Char = rPrefix[mPick[0]];
  G.P2Char = rPrefix[oppPick()];
  if (tagMode()) { G.P1Char2 = rPrefix[mPick[1]]; G.P2Char2 = rPrefix[mPick[3]]; }
  G.HumanIndex = 0;
  if (G.Multi) stageBegin();
  else if (G.GameMode === MODE_VSCPU || G.GameMode === MODE_ARCADE || tagMode()) { mLevelSel = G.CpuLevel; G.GameState = GS_LEVEL; }
  else stageBegin();
}

const boxX = (k: number) => 64 + (k % GRID_COLS) * (BOX_W + 1);
const boxY = (k: number) => 50 + Math.trunc(k / GRID_COLS) * 22;

function sidePanels(): void {
  R.beginFrame(true);
  R.fillRect(0, 10, 64, 90, RGB(14, 20, 40)); R.fillRect(128, 10, 64, 90, RGB(40, 14, 18));
  R.fillRect(63, 10, 1, 90, cP1); R.fillRect(128, 10, 1, 90, cP2);
}

export function selectRender(): void {
  const cx = SCREEN_W / 2;
  sidePanels();
  let t: string;
  if (tagMode()) {
    if (G.Multi) t = playerPhase() ? "1P TEAM " + (mPhase + 1) + " OF 2" : "2P TEAM " + (mPhase - 1) + " OF 2";
    else t = playerPhase() ? "YOUR TEAM " + (mPhase + 1) + " OF 2" : "CPU TEAM " + (mPhase - 1) + " OF 2";
  } else if (G.Multi) t = mPhase + 1 + "P SELECT";
  else t = mPhase === 0 ? "SELECT FIGHTER" : "SELECT OPPONENT";
  Font.drawBig(t, cx, 2, cGold, 1);
  const opp = G.Multi ? "2P" : G.GameMode === MODE_TRAINING ? "DUMMY" : "CPU";
  Font.drawText("1P", 3, 13, cP1);
  Font.drawText(opp, SCREEN_W - 3, 13, cP2, 1, 2);
  if (tagMode()) {
    bigView(playerPhase() ? mSel[mPhase] : mPick[1], 32, false, 0, 63);
    if (playerPhase()) Font.drawBig("?", 160, 48, RGB(70, 40, 50), 3);
    else bigView(mSel[mPhase], 160, true, 129, SCREEN_W - 1);
    teamNames();
  } else if (mPhase === 0) {
    bigView(mSel[0], 32, false, 0, 63);
    Font.drawBig("?", 160, 48, RGB(70, 40, 50), 3);
  } else {
    bigView(mPick[0], 32, false, 0, 63);
    bigView(mSel[1], 160, true, 129, SCREEN_W - 1, mSel[1] === mPick[0]);
  }
  const hover = mSel[mPhase];
  if (locked(hover)) {
    Font.drawBig("???", cx, 13, RGB(255, 240, 210), 1);
    Font.drawText("CLEAR ARCADE", cx, 27, cDim, 1, 1);
    Font.drawText("TO UNLOCK", cx, 34, cDim, 1, 1);
  } else if (isRandom(hover)) Font.drawBig(rName[hover], cx, 13, RGB(255, 240, 210), 1);
  else {
    Font.drawBig(rName[hover], cx, 12, RGB(255, 240, 210), 1);
    ["POW", "SPD", "RNG", "HP", "TEC"].forEach((l, j) => statRow(l, rStat[hover][j], 20 + j * 6));
  }
  for (let k = 0; k < ROSTER; k++) portrait(k);
  Font.drawText("A = OK  S = BACK", cx, 94, RGB(110, 100, 130), 1, 1);
}

function teamNames(upto = -1): void {
  if (upto < 0) upto = mPhase;
  for (let k = 0; k < 4; k++) {
    if (k >= upto) continue;
    if (k <= 1) Font.drawText(rName[mPick[k]], 3, 19 + k * 6, cP1);
    else Font.drawText(rName[mPick[k]], SCREEN_W - 3, 19 + (k - 2) * 6, cP2, 1, 2);
  }
}

function statRow(lbl: string, v: number, y: number): void {
  Font.drawText(lbl, 70, y, cDim);
  for (let k = 0; k < 5; k++) R.fillRect(84 + k * 7, y + 1, 6, 3, k < v ? cGold : RGB(50, 44, 60));
}

function bigView(k: number, x: number, flip: boolean, clipL: number, clipR: number, alt = false): void {
  if (locked(k) || isRandom(k)) { Font.drawBig("?", x, 48, isRandom(k) ? RGB(200, 160, 80) : RGB(80, 70, 100), 3); return; }
  drawBigView(rPrefix[k], x, flip, clipL, clipR, alt);
}

function portrait(k: number): void {
  const x = boxX(k), y = boxY(k);
  R.fillRect(x, y, BOX_W, 20, RGB(26, 22, 36));
  if (locked(k)) Font.drawBig("?", x + Math.trunc(BOX_W / 2) + 1, y + 3, RGB(70, 64, 90), 2);
  else if (isRandom(k)) Font.drawBig("?", x + Math.trunc(BOX_W / 2) + 1, y + 3, RGB(200, 160, 80), 2);
  else drawPortraitAt(k, x, y, BOX_W);
  let frameC = RGB(70, 60, 90);
  if (mPhase >= 1 && k === mPick[0]) frameC = cP1;
  if (tagMode() && mPhase >= 2 && k === mPick[1]) frameC = cP1;
  if (tagMode() && mPhase >= 3 && k === mPick[2]) frameC = cP2;
  if (k === mSel[mPhase] && Math.trunc(mMenuTick / 5) % 2 === 0) frameC = playerPhase() ? cGold : cP2;
  R.drawRectOutline(x, y, BOX_W, 20, frameC);
  if (k === mSel[mPhase]) R.drawRectOutline(x - 1, y - 1, BOX_W + 2, 22, frameC);
}

// ---------------------------------------------------------------- level select

export function levelTick(): void {
  mMenuTick++;
  if (K.isPressed(K.BTN_UP)) mLevelSel = (mLevelSel + 2) % 3;
  if (K.isPressed(K.BTN_DOWN)) mLevelSel = (mLevelSel + 1) % 3;
  if (K.isPressed(K.BTN_LP)) {
    G.CpuLevel = mLevelSel;
    if (G.GameMode === MODE_ARCADE) Arcade.begin(G.P1Char);
    else stageBegin();
  } else if (K.isPressed(K.BTN_HP)) {
    mPhase = G.GameMode === MODE_ARCADE ? 0 : lastPhase();
    G.GameState = GS_SELECT;
  }
}

export function levelRender(): void {
  const cx = SCREEN_W / 2;
  sidePanels();
  Font.drawBig("SELECT LEVEL", cx, 2, cGold, 1);
  Font.drawText("1P", 3, 13, cP1);
  Font.drawText("CPU", SCREEN_W - 3, 13, cP2, 1, 2);
  bigView(mPick[0], 32, false, 0, 63);
  if (G.GameMode === MODE_ARCADE) {
    Font.drawBig("?", 160, 48, RGB(110, 50, 60), 3);
    Font.drawText("ARCADE", cx, 23, cDim, 1, 1);
  } else bigView(oppPick(), 160, true, 129, SCREEN_W - 1, oppPick() === mPick[0]);
  if (tagMode()) teamNames(4);
  Font.drawBig("VS", cx, 13, RGB(255, 240, 210), 2);
  const desc = ["SLOW REACTIONS", "SOLID DEFENSE", "MASTER LEVEL"];
  for (let k = 0; k < 3; k++) {
    const y = 32 + k * 19, on = k === mLevelSel;
    R.fillRect(cx - 30, y - 2, 60, 17, on ? RGB(40, 28, 20) : RGB(20, 16, 26));
    R.drawRectOutline(cx - 30, y - 2, 60, 17, on ? cGold : RGB(60, 52, 76));
    if (on && Math.trunc(mMenuTick / 6) % 2 === 0) R.drawRectOutline(cx - 31, y - 3, 62, 19, cGold);
    Font.drawText(levelName(k), cx - 26, y + 1, on ? RGB(255, 236, 180) : cDim);
    for (let s = 0; s <= k; s++) star(cx + 22 - (2 - s) * 7, y + 3, on ? cGold : RGB(90, 80, 60));
    Font.drawText(desc[k], cx, y + 9, on ? RGB(200, 190, 170) : RGB(90, 84, 104), 1, 1);
  }
  Font.drawText("A = START  S = BACK", cx, 94, RGB(110, 100, 130), 1, 1);
}

function star(x: number, y: number, c: number): void {
  R.fillRect(x, y - 2, 1, 5, c); R.fillRect(x - 2, y, 5, 1, c); R.fillRect(x - 1, y - 1, 3, 3, c);
}

// ---------------------------------------------------------------- stage select

function stageBegin(): void { mStageSel = G.StageIndex; G.GameState = GS_STAGE; }

export function stageTick(): void {
  mMenuTick++;
  const n = D.StageCount;
  if (K.isPressed(K.BTN_LEFT)) mStageSel = (mStageSel + n - 1) % n;
  if (K.isPressed(K.BTN_RIGHT)) mStageSel = (mStageSel + 1) % n;
  if (K.isPressed(K.BTN_LP)) { G.StageIndex = mStageSel; restart(); }
  else if (K.isPressed(K.BTN_HP)) {
    if (G.Multi) { mPhase = lastPhase(); G.GameState = GS_SELECT; }
    else if (G.GameMode === MODE_VSCPU || tagMode()) G.GameState = GS_LEVEL;
    else { mPhase = 1; G.GameState = GS_SELECT; }
  }
}

export function stageRender(): void {
  const cx = SCREEN_W / 2;
  R.fillRect(0, 0, SCREEN_W, SCREEN_H, RGB(12, 10, 22));
  Font.drawBig("SELECT STAGE", cx, 2, cGold, 1);
  const x0 = cx - SCREEN_W / 4, y0 = 14;
  R.drawRectOutline(x0 - 2, y0 - 2, SCREEN_W / 2 + 4, SCREEN_H / 2 + 4, cGold);
  R.drawRectOutline(x0 - 1, y0 - 1, SCREEN_W / 2 + 2, SCREEN_H / 2 + 2, RGB(60, 44, 20));
  R.drawStageThumb(mStageSel, x0, y0, 2);
  const c = Math.trunc(mMenuTick / 6) % 2 === 0 ? cGold : RGB(120, 90, 40);
  Font.drawBig("<", x0 - 12, y0 + SCREEN_H / 4 - 7, c, 2);
  Font.drawBig(">", x0 + SCREEN_W / 2 + 12, y0 + SCREEN_H / 4 - 7, c, 2);
  Font.drawBig(D.StageName[mStageSel], cx, 70, RGB(255, 240, 210), 1);
  for (let k = 0; k < D.StageCount; k++)
    R.fillRect(cx - Math.trunc((D.StageCount * 6) / 2) + k * 6 + 1, 81, 4, 3, k === mStageSel ? cGold : RGB(60, 52, 76));
  Font.drawText("LEFT RIGHT = SELECT  A = FIGHT  S = BACK", cx, 92, RGB(110, 100, 130), 1, 1);
}

// Port of Game.bas: game state, one tick of simulation and one render.
import * as R from "./renderer";
import { SCREEN_W } from "./renderer";
import * as Font from "./font";
import * as K from "./input";
import * as Fighter from "./fighter";
import * as Combat from "./combat";
import { C } from "./combat";
import * as Projectile from "./projectile";
import * as FX from "./fx";
import * as Hud from "./hud";
import * as Tag from "./tag";
import * as Match from "./match";
import * as Cpu from "./cpu";
import * as Screens from "./screens";
import * as Arcade from "./arcade";
import * as Online from "./online";
import * as Lockstep from "./lockstep";
import * as Story from "./story";
import * as FM from "./fieldmap";
import { RGB } from "./util";

export const GS_MENU = 0, GS_FIGHT = 1, GS_SELECT = 2, GS_LEVEL = 3, GS_STAGE = 4, GS_LADDER = 5, GS_CONTINUE = 6, GS_ENDING = 7, GS_ONLINE = 8, GS_STORY = 9;
export const MODE_TRAINING = 0, MODE_VSCPU = 1, MODE_SANDBOX = 2, MODE_ARCADE = 3, MODE_TAG = 4;

export const G = {
  GameState: GS_MENU,
  CpuLevel: Cpu.LV_NORMAL,
  HumanIndex: 0,
  P1Char: "danwoo",
  P2Char: "cheolsan",
  P1Char2: "muyeong",
  P2Char2: "seolhwa",
  StageIndex: 0,
  WatchMode: false,
  Multi: false,
  GameMode: MODE_VSCPU,
  StoryFight: false,                   // a story-mode fight: one round, the story takes over at the end
  FieldStage: null as null | { map: string; cx: number },   // a story fight on the spot: the field picture (zoomed) as the stage, SD fighters
  Skins: [0, 0, 0, 0],                 // story stand-ins: palette per fighter (0, 1 on screen; 2, 3 tag partners)
  Labels: ["", "", "", ""],
  controlled: () => Fighter.controlled(),
};

export function profiledFight(): boolean {
  return !G.Multi && !G.StoryFight && !G.WatchMode && !Lockstep.active() &&
    [MODE_TRAINING, MODE_ARCADE, MODE_TAG, MODE_VSCPU].includes(G.GameMode);
}

let mPaused = false, mPauseSel = 0;

export function gameInit(): void {
  FX.init();
  startMatch(0);                       // build fighters so the menu can show them
  G.GameState = GS_MENU;
}

export function startMatch(seed = 0): void {
  R.setStage(G.StageIndex);
  if (G.GameMode === MODE_TAG) Tag.begin(G.P1Char, G.P2Char, G.P1Char2, G.P2Char2, G.HumanIndex);
  else { Fighter.init(G.P1Char, G.P2Char, G.HumanIndex); Tag.off(); }
  for (let i = 0; i < 4; i++) {
    Fighter.F[i].skin = G.StoryFight ? G.Skins[i] : 0;
    Fighter.F[i].label = G.StoryFight ? G.Labels[i] : "";
  }
  Combat.init();
  Projectile.init();
  FX.init();
  mPaused = false;
  Cpu.init(G.CpuLevel, seed);
  const rounds = G.GameMode === MODE_VSCPU || G.GameMode === MODE_ARCADE || G.GameMode === MODE_TAG;
  Match.beginMatch(rounds || G.StoryFight, G.GameMode === MODE_TRAINING, G.StoryFight ? 1 : 2);
  G.GameState = GS_FIGHT;
}

export function restart(): void {
  startMatch();
  if (G.GameMode === MODE_TRAINING) Fighter.setDummy(Fighter.DUMMY_IDLE);
}

export function isCpu(i: number): boolean {
  if (G.Multi) return false;
  if (G.WatchMode) return true;
  if (i !== Fighter.controlled()) return Fighter.dummyMode() === Fighter.DUMMY_CPU;
  return false;
}

export const paused = () => mPaused;

export function gameTick(): void {
  K.poll();
  if (Online.active()) Online.pump();
  if (G.GameState === GS_ONLINE) { Online.lobbyTick(); return; }
  if (G.GameState === GS_STORY) { Story.tick(); return; }
  const netFight = Lockstep.active() && G.GameState === GS_FIGHT;
  if (netFight) {
    // online: no pause; run this tick only when both players' inputs for it are known
    K.consumeFocusLost();
    if (K.isPressed(K.BTN_QUIT)) { Online.leave(); return; }
    Lockstep.captureLocal(Fighter.rawLocal(0));
    Online.sendFightPackets();
    if (!Lockstep.ready()) { Lockstep.noteStall(); return; }
  } else if (G.GameState === GS_FIGHT) {
    if (K.isPressed(K.BTN_QUIT)) { mPaused = !mPaused; mPauseSel = 0; return; }
    if (K.consumeFocusLost() && !mPaused) { mPaused = true; mPauseSel = 0; return; }
    if (mPaused) { pauseTick(); return; }
  } else K.consumeFocusLost();
  switch (G.GameState) {
    case GS_MENU: Screens.titleTick(); return;
    case GS_SELECT: Screens.selectTick(); return;
    case GS_LEVEL: Screens.levelTick(); return;
    case GS_STAGE: Screens.stageTick(); return;
  }
  if (G.GameState >= GS_LADDER && G.GameState <= GS_ENDING) { Arcade.screenTick(); return; }

  for (let i = 0; i <= 1; i++) {
    if (!Match.inputAllowed()) Fighter.feedInput(i, 5, 0, 0);
    else if (netFight) { if (i === 0) Lockstep.feedFrame(); }
    else if (G.Multi) Fighter.feedHuman(i, 1 + i);
    else if (isCpu(i)) { Cpu.observe(i); Cpu.think(i); }
    else if (i === Fighter.controlled()) Fighter.feedHuman(i);
    else Fighter.feedDummy(i);
  }

  Combat.tickTimers();
  if (C.SuperFreeze > 0) C.SuperFreeze--;
  else if (C.HitStop > 0) C.HitStop--;
  else if (C.SlowMo % 2 === 1) C.SlowMo--;
  else {
    if (C.SlowMo > 0) C.SlowMo--;
    Tag.inputs(Match.inputAllowed());
    Tag.tick();
    Fighter.update();
    Projectile.update();
    Combat.resolve();
  }
  FX.update();
  Hud.update();
  Match.tick(C.SuperFreeze > 0 || C.HitStop > 0);
  if (netFight) { Lockstep.endFrame(); Online.afterFrame(); }
}

export function gameRender(): void {
  switch (G.GameState) {
    case GS_ONLINE: Online.render(); return;
    case GS_STORY: Story.render(); break;
    case GS_MENU: Screens.titleRender(); break;
    case GS_SELECT: Screens.selectRender(); break;
    case GS_LEVEL: Screens.levelRender(); break;
    case GS_STAGE: Screens.stageRender(); break;
    default:
      if (G.GameState >= GS_LADDER && G.GameState <= GS_ENDING) Arcade.screenRender();
      else {
        R.beginFrame(C.SuperFreeze > 0 || C.ImpactDark > 0);
        if (G.FieldStage) {
          FM.drawFightStage(G.FieldStage.map, G.FieldStage.cx, 1.5);
          if (C.SuperFreeze > 0 || C.ImpactDark > 0) R.shadeRect(0, 0, R.PHYS_W, R.PHYS_H, 0, 0.55);
          R.setHiScale(3);
        }
        Fighter.draw();
        Projectile.draw();
        FX.draw();
        R.setHiScale(0);
        Hud.draw();
        Match.draw();
        if (C.WhiteFlash > 1) R.flashScreen(RGB(250, 246, 255));
        if (Online.active()) Online.renderOverlay();
        if (mPaused) pauseRender();
      }
  }
  R.flush();
}

// ---------------------------------------------------------------- pause menu

const PAUSE = ["RESUME", "RESTART", "CHARACTER SELECT", "MAIN MENU"];
const pauseLabel = (k: number) => (k === 2 && G.StoryFight ? "STORY MENU" : PAUSE[k]);

function pauseTick(): void {
  if (K.isPressed(K.BTN_UP)) mPauseSel = (mPauseSel + 3) % 4;
  if (K.isPressed(K.BTN_DOWN)) mPauseSel = (mPauseSel + 1) % 4;
  if (K.isPressed(K.BTN_HP)) mPaused = false;
  if (K.isPressed(K.BTN_LP)) {
    mPaused = false;
    if (mPauseSel === 1) restart();
    else if (mPauseSel === 2) { if (G.StoryFight) Story.leaveFight(true); else Screens.selectBegin(); }
    else if (mPauseSel === 3) { if (G.StoryFight) Story.leaveFight(false); G.GameState = GS_MENU; }
  }
}

function pauseRender(): void {
  const cx = SCREEN_W / 2;
  R.fillRect(cx - 40, 22, 80, 58, RGB(14, 10, 22));
  R.drawRectOutline(cx - 40, 22, 80, 58, RGB(230, 180, 80));
  Font.drawBig("PAUSE", cx, 26, RGB(255, 204, 92), 1);
  for (let k = 0; k < 4; k++) {
    const y = 39 + k * 9;
    let c = RGB(140, 130, 160);
    if (k === mPauseSel) { R.fillRect(cx - 36, y - 2, 72, 9, RGB(60, 40, 20)); c = RGB(255, 236, 180); }
    Font.drawText(pauseLabel(k), cx, y, c, 1, 1);
  }
  Font.drawText("ESC OR S = RESUME", cx, 74, RGB(110, 100, 130), 1, 1);
}

// Story field mode: walk a side-scrolling map (camera follows), talk / inspect (A near a "!"), fight groups of
// underlings with your real normal moves, then meet the boss for a 1:1 fight in the fighting engine.
// A chapter is a list of steps (plays.ts): staged scenes (people walk on their own, dialogue) and quests
// (the player has control until the goal is met).
import * as R from "./renderer";
import { SCREEN_W, PX, SKIN_DIM } from "./renderer";
import * as Font from "./font";
import * as KF from "./kfont";
import * as K from "./input";
import * as FX from "./fx";
import * as Fighter from "./fighter";
import { MV_LP, MV_HP, MV_LK, MV_HK, MV_SP1, MV_JP, MV_JK } from "./fighter";
import { D, animId, animFrame, animFrameHold, spriteId, hasSprite, moveId, MT_RUSH, MT_NORMAL, MT_SUPER_QUAKE, LV_UNBLOCK } from "./data";
import * as FM from "./fieldmap";
import { drawBloodBattle, battleContacts, isBattleCut } from "./prologueBattle";
import { RGB } from "./util";

export type Look = [string, number, string];
export type Step = Record<string, unknown> & { t: string };
export interface Host {
  events(sec: string, a: number, b: number): string[][];   // dialogue / cuts of the chapter's script
  look(name: string): Look | null;
  clue(text: string): void;
  // the chapter's boss fight, or an encounter, or (looks + field) a fight on the spot: these two, in the fight engine,
  // with this place's picture as the stage (calls afterFight)
  fight(o?: { opp: string[]; stage?: string; variant?: string; looks?: Look[]; field?: { map: string; cx: number } }): void;
  done(): void;                                             // chapter finished
  cutscene(sec: string, a: number): void;                   // hand the rest of the chapter to the plain cut-scene player
}

// ---------------------------------------------------------------- people

const ST_IDLE = 0, ST_WALK = 1, ST_JUMP = 2, ST_ATK = 3, ST_HIT = 4, ST_DOWN = 5, ST_POSE = 6, ST_DEAD = 7;
const GROUND = 88, GRAV = 0.5;

interface Kit {
  idle: number; walk: number; jump: number; hit: number; down0: number; down1: number; crouch: number;
  moves: number[]; walkSpeed: number; jumpVY: number; halfW: number; hurtH: number; base?: string;
}
const kits = new Map<string, Kit>();
function kit(prefix: string): Kit {
  let k = kits.get(prefix);
  if (k) return k;
  if (prefix.startsWith("sd_")) {
    const [ch, set] = prefix.split(":");
    const a = (n: string) => animId(ch + "." + (set ? set + "_" + (n === "walk" ? "run" : n) : n));
    k = { idle: a("idle"), walk: a("walk"), jump: -1, hit: -1, down0: -1, down1: -1, crouch: -1, moves: [], walkSpeed: set === "carry" ? 3.2 : 1.6, jumpVY: 0, halfW: 5, hurtH: 22, base: ch };
  } else if (prefix === "npc") {
    const i = animId("npc.arong_idle");
    k = { idle: i, walk: animId("npc.arong_walk"), jump: -1, hit: -1, down0: -1, down1: -1, crouch: -1, moves: [], walkSpeed: 1.6, jumpVY: 0, halfW: 4, hurtH: 22 };
  } else {
    Fighter.init(prefix, prefix, 0);                       // borrow a fighter's frames, moves and body
    const f = Fighter.F[0];
    k = { idle: f.aIdle, walk: f.aWalk, jump: f.sJump, hit: f.sHit0, down0: f.sDown0, down1: f.sDown1, crouch: f.sCrouch,
      moves: f.moves.slice(), walkSpeed: f.walkSpeed, jumpVY: f.jumpVY, halfW: f.halfW, hurtH: f.hurtH };
  }
  kits.set(prefix, k);
  return k;
}

interface Ent {
  id: string; look: Look; kit: Kit; x: number; y: number; vx: number; vy: number; face: number;
  st: number; t: number; mv: number; hitDone: boolean; hp: number; maxHp: number; stun: number;
  hostile: boolean; goal: number | null; run: boolean; spd: number; flash: number; air?: boolean; follow: string; gap: number; pose: number;
  cool: number; windup: number; inv: number; kills: boolean; small: boolean;
}

let ents: Ent[] = [];
const ent = (id: string) => ents.find((e) => e.id === id);
const player = () => ent("player")!;

function spawn(id: string, look: Look, x: number, face: number): Ent {
  const e: Ent = { id, look, kit: kit(look[0]), x, y: GROUND, vx: 0, vy: 0, face, st: ST_IDLE, t: 0, mv: -1, hitDone: false,
    hp: 160, maxHp: 160, stun: 0, hostile: false, goal: null, run: false, spd: 0, flash: 0, follow: "", gap: 14, pose: -1, cool: 30, windup: 0,
    inv: 0, kills: false, small: look[0] === "npc" };
  if (id === "player") { e.maxHp = e.hp = 600; }
  ents = ents.filter((o) => o.id !== id);
  ents.push(e);
  return e;
}

function setSt(e: Ent, st: number): void { e.st = st; e.t = 0; }

function sprite(e: Ent, tick: number): number {
  const k = e.kit;
  switch (e.st) {
    case ST_POSE: return e.pose;
    case ST_WALK: return animFrame(k.walk, Math.trunc(e.t * Math.min(1.6, Math.abs(e.vx) / Math.max(0.5, k.walkSpeed))), e.vx * e.face < 0);
    case ST_JUMP: return k.jump >= 0 ? k.jump : animFrame(k.idle, tick);
    case ST_ATK: {
      const mv = e.mv, s = D.MvStartup[mv] + e.windup;
      return e.t >= s && e.t < s + D.MvActive[mv] ? D.MvSprA[mv] : D.MvSprS[mv];
    }
    case ST_HIT: return k.hit >= 0 ? k.hit : animFrame(k.idle, tick);
    case ST_DOWN: case ST_DEAD: return e.y < GROUND - 0.5 ? k.down0 : k.down1;
  }
  return animFrame(k.idle, tick + e.x);
}

interface Box { x: number; y: number; w: number; h: number }
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function hurt(e: Ent): Box { const w = e.kit.halfW * 2 + 4; return { x: e.x - w / 2, y: e.y - e.kit.hurtH, w, h: e.kit.hurtH }; }
function hitBox(e: Ent): Box | null {
  if (e.st !== ST_ATK) return null;
  const mv = e.mv, s = D.MvStartup[mv] + e.windup;
  if (e.t < s || e.t >= s + D.MvActive[mv]) return null;
  const w = D.MvHbW[mv], h = D.MvHbH[mv];
  return { x: e.face > 0 ? e.x + D.MvHbX[mv] : e.x - D.MvHbX[mv] - w + 1, y: e.y + D.MvHbY[mv], w, h };
}

function attack(e: Ent, slot: number, windup = 0): void {
  const mv = e.kit.moves[slot];
  if (mv === undefined || mv < 0) return;
  e.mv = mv; e.hitDone = false; e.windup = windup; setSt(e, ST_ATK);
}

// ---------------------------------------------------------------- the chapter runner

let host: Host | null = null;
let steps: Step[] = [];
let mStep = 0, mWait = 0, mTick = 0, camX = 0, camTarget = "player", camFixed: number | null = null;
let map: FM.FieldMap | null = null;
let quest: Step | null = null, questText = "", questCount = "", control = false;
let mHitStop = 0, mFallen = 0, mCheck: { ents: Ent[]; step: number } | null = null, mNotice = "", mNoticeT = 0;
// dialogue
let queue: string[][] = [], page: string[] = [], pageAt = 0, shown = 0, who = "", kind = "", dir = "";
let mActive = false, mSnap = false, mFlash = 0, mShake = 0;
// scene dressing drawn in code: props (things on the ground, a falling beam, writing on a board), a place caption,
// the opening moon and the closing title
interface Prop { id: string; kind: string; x: number; y: number; t: number; text?: string }
const LATE_PROPS = ["beam", "night", "black"];   // drawn over the people (a falling beam, the night coming on, black)
let props: Prop[] = [];
let mCap = "", mCapT = 0, mMoon = -1, mTitle = false, mTitleT = 0, mWaitA = false, mTitleText = "서장 「혈월의 밤」 끝";
let fadeTicks = 10, blackTicks = 0;
let mFadeOut = 0, mFadeIn = 0, mFadeFor: Step | null = null, mFadeDone: Step | null = null;

export const active = () => mActive;

export function begin(h: Host, play: Step[]): void {
  host = h; steps = play; mStep = 0; mWait = 0; mTick = 0; ents = []; quest = null; control = false; queue = []; page = [];
  camTarget = "player"; camFixed = null; mFallen = 0; mCheck = null; mActive = true;
  map = null; props = []; duel = null; mMoon = -1; mTitle = false; mWaitA = false; mFadeOut = 0; mFadeIn = 0; mFadeDone = null; mFlash = 0; mShake = 0; mCapT = 0; mCarryG = 0; auras.length = 0;
  run();
}
export function stop(): void { mActive = false; }

const MAPS: Record<string, () => FM.FieldMap> = { cheongpung: FM.cheongpung };
for (const n of FM.PICTURE_MAPS) MAPS[n] = () => FM.pictureMap(n);
const mapCache = new Map<string, FM.FieldMap>();

/** Run steps until one has to wait (dialogue, a walk, a quest). */
function run(): void {
  while (mStep < steps.length && host) {
    const s = steps[mStep];
    if (!exec(s)) return;
    mStep++;
  }
}

function lookOf(v: unknown): Look {
  if (Array.isArray(v)) return v as Look;
  return host!.look(String(v)) ?? ["danwoo", 0, ""];
}

/** One step. true = done at once, false = wait (the step finishes in tick()). */
function exec(s: Step): boolean {
  switch (s.t) {
    case "map": {
      if (mFadeDone !== s && map) {
        fadeTicks = Number(s.fadeTicks ?? 10);
        blackTicks = Number(s.blackTicks ?? 0);
        mFadeOut = fadeTicks + blackTicks; mFadeFor = s; return false;
      }
      mFadeDone = null; mFadeIn = 12;
      const name = String(s.map);
      mMapName = name;
      if (!mapCache.has(name)) mapCache.set(name, MAPS[name]());
      map = mapCache.get(name)!;
      ents = []; props = []; mMoon = -1; mSnap = true;   // a new place: nobody carried over, the camera jumps
      return true;
    }
    case "spawn": {
      const e = spawn(String(s.id), lookOf(s.look), Number(s.x), Number(s.face ?? 1));
      if (s.pose) setPose(e, String(s.pose));
      if (s.hp) e.hp = e.maxHp = Number(s.hp);
      if (typeof s.y === "number") e.y = s.y;                 // standing on something (a throne, a roof)
      return true;
    }
    case "pose": {
      const e = ent(String(s.id));
      if (e) {
        setPose(e, String(s.pose));
        if (s.fall) {                                     // struck down: a flash, thrown back, lands in the pose
          e.air = true; e.flash = 3; e.vy = -3.2; e.y -= 1; e.vx = -e.face * 1.6; e.goal = null;
          FX.spawnHit(e.x - camX + e.face * 3, e.y - 14, true, "");
          mShake = 6;
        } else if (s.trip) {                              // tripped while running: pitches forward, face down, a little dust
          e.air = true; e.vy = -1.4; e.y -= 1; e.vx = e.face * 1.8; e.goal = null;
          mShake = 2;
        }
      }
      return true;
    }
    case "face": {
      const e = ent(String(s.id)); if (!e) return true;
      const o = ent(String(s.to));
      e.face = o ? (o.x > e.x ? 1 : -1) : s.to === "left" ? -1 : 1;
      return true;
    }
    case "move": {
      const e = ent(String(s.id)); if (!e) return true;
      e.goal = typeof s.x === "number" ? s.x : (ent(String(s.x))?.x ?? e.x) + Number(s.dx ?? 0);
      e.run = !!s.run; e.spd = Number(s.speed ?? 0); e.follow = "";
      if (map) e.goal = Math.max(6, Math.min(map.w - 6, e.goal));      // walking off the map: stop at its edge
      if (e.st === ST_POSE) setSt(e, ST_IDLE);
      return !s.wait;
    }
    case "follow": { const e = ent(String(s.id)); if (e) { e.follow = String(s.target ?? ""); e.gap = Number(s.gap ?? 14); } return true; }
    case "remove": ents = ents.filter((e) => e.id !== s.id); return true;
    case "vanish": {
      const e = ent(String(s.id));
      if (e) { for (let k = 0; k < 6; k++) FX.spawn(e.x - camX + (k - 3) * 3, e.y - 6 - k * 4, FX.FX_DARK); puffs.push({ x: e.x, y: e.y - 14, t: 0 }); }
      ents = ents.filter((o) => o.id !== s.id);
      return true;
    }
    case "cam": camTarget = String(s.follow ?? ""); camFixed = typeof s.x === "number" ? s.x : null; return true;
    case "wait": {
      // A narration can finish before or after the animation it accompanies.
      const elapsed = s.sinceProp ? props.find(q => q.id === s.sinceProp)?.t : 0;
      mWait = Math.max(0, Number(s.n) - (elapsed ?? 0));
      return mWait === 0;
    }
    case "swap": {                                 // the same place, changed (the bamboo after the cut): people and camera stay
      const name = String(s.map);
      if (!mapCache.has(name)) mapCache.set(name, MAPS[name]());
      map = mapCache.get(name)!;
      return true;
    }
    case "flash": mFlash = Number(s.n ?? 8); return true;
    case "shake": mShake = Number(s.n ?? 10); return true;
    case "caption": mCap = String(s.text); mCapT = Number(s.n ?? 70); return true;
    case "moon": mMoon = 0; return true;
    case "prop": props = props.filter((q) => q.id !== s.id); props.push({ id: String(s.id), kind: String(s.kind), x: Number(s.x), y: Number(s.y ?? GROUND), t: 0, text: s.text as string | undefined }); return true;
    case "unprop": props = props.filter((q) => q.id !== s.id); return true;
    case "title": mTitle = true; mTitleT = 0; if (s.text) mTitleText = String(s.text); return false;
    case "waitA": mWaitA = true; return false;
    case "narr": queue.push(["cut", "(" + String(s.text) + ")"]); nextLine(); return false;
    case "duel": {
      // one foe ("foe") or several at once ("foes": they take both sides of the player)
      const list = ((s.foes as string[] | undefined) ?? [String(s.foe)]).map((id) => ent(id)).filter((e): e is Ent => !!e);
      if (!list.length || !player()) return true;
      const p = player()!, hpMode = !!s.hp;
      const foes: Foe[] = list.map((e, i) => {
        // with several: alternate sides, the first in front (where it stands), the second behind the player
        const side = list.length > 1 && i % 2 === 1 ? -(e.x > p.x ? 1 : -1) : e.x > p.x ? 1 : -1;
        return { e, bn: "atk", vx: 0, combo: 0, down: 0, atk: -1, cool: 30 + i * 25, hit: 0, mv: null, ng: 500, g: 0, x0: e.x, out: false, side };
      });
      duel = { foes, foe: list[0], need: Number(s.hits ?? 0), time: Number(s.time ?? 0), guard: !!s.guard, t: 0, hits: 0, pAtk: -1, pHit: 0, mv: MOVES[0],
        hpMode, dmg: Number(s.dmg ?? 8), block: Number(s.block ?? 0), ko: 0, px0: p.x, pNg: 1000, pG: mCarryG, ngFlash: 0, hist: [],
        eng: hpMode ? engMoves(p) : null, emv: -1, pHas: false, pVx: 0, pGuard: 0, dark: 0, slow: 0 };
      if (hpMode) {
        const full = duel.eng ? 1000 : 100;                  // engine fighters: the arcade's health scale
        if (p.maxHp !== full) p.maxHp = p.hp = full;          // the player's health carries over from bout to bout in a scene
        for (const e of list) e.maxHp = e.hp = Math.round(Number(s.hp) * DIFF.hp[mDiff]);
      }
      quest = s; questText = String(s.text ?? ""); questCount = "";
      for (const e of list) e.goal = null;
      p.goal = null;
      return false;
    }
    case "ev": queue.push(...host!.events(String(s.sec), Number(s.a), Number(s.b ?? s.a))); nextLine(); return false;
    case "say": queue.push(["say", String(s.who), String(s.text), String(s.dir ?? "")]); nextLine(); return false;
    case "clue": host!.clue(String(s.text)); queue.push(["clue", String(s.text)]); nextLine(); return false;
    case "hostile": for (const id of s.ids as string[]) { const e = ent(id); if (e) { e.hostile = true; e.cool = 20 + Math.floor(Math.random() * 30); e.goal = null; } } return true;
    case "quest": {
      quest = s; questText = String(s.text); control = true;
      if (s.goal === "kill") mCheck = { ents: ents.map((e) => ({ ...e })), step: mStep };
      return false;
    }
    case "fight": {
      control = false;
      const p = player(), f = s.foe ? ent(String(s.foe)) : null;
      if (f && p) {                                         // on the spot: the real fight engine, SD art, this map behind
        f.face = p.x > f.x ? 1 : -1; p.face = -f.face;
        host!.fight({ opp: [], looks: [p.look, f.look], field: { map: mMapName, cx: (p.x + f.x) / 2 } });
      } else host!.fight(s.opp ? { opp: s.opp as string[], stage: s.stage as string | undefined, variant: s.variant as string | undefined } : undefined);
      return false;
    }
    case "end": mActive = false; host!.done(); return false;
    case "cutscene": mActive = false; host!.cutscene(String(s.sec), Number(s.a)); return false;
  }
  return true;
}

function setPose(e: Ent, p: string): void {
  if (p === "idle") { setSt(e, ST_IDLE); return; }
  const k = e.kit;
  const base = k.base ?? e.look[0];
  const id = hasSprite(base + "." + p) ? spriteId(base + "." + p) : p === "down" ? k.down1 : p === "crouch" ? k.crouch : p === "hit" ? k.hit : -1;
  if (id < 0) return;
  e.pose = id; setSt(e, ST_POSE);
}

/** The boss fight is over (the story shows its own retry screen when lost). */
export function afterFight(): void {
  mStep++;
  run();
}

// ---------------------------------------------------------------- dialogue

function nextLine(): void {
  page = [];
  while (queue.length) {
    const e = queue.shift()!;
    kind = e[0]; who = ""; dir = "";
    if (e[0] === "say") { who = e[1]; dir = e[3] ?? ""; setPage(e[2] || "……"); return; }
    if (e[0] === "cut") { setPage(e[1]); return; }
    if (e[0] === "clue") { who = "단서"; setPage(e[1].replace(/^단서\s*/, "")); return; }
    if (e[0] === "clear") { setPage(e[1]); return; }
  }
}
function setPage(text: string): void {
  page = KF.wrap((dir ? "(" + dir + ")\n" : "") + text, who && who !== "해설" ? 420 : 500, 2); pageAt = 0; shown = 0;
  // the speaker turns to whoever they are talking to
  const sp = ents.find((e) => e.look === host!.look(who) || (host!.look(who) && e.look[2] === host!.look(who)![2] && e.look[1] === host!.look(who)![1]));
  if (sp && sp.st <= ST_WALK && sp.goal === null) {
    const other = ents.filter((o) => o !== sp && o.st !== ST_DEAD && o.st !== ST_POSE && !o.small).sort((a, b) => Math.abs(a.x - sp.x) - Math.abs(b.x - sp.x))[0];
    if (other) sp.face = other.x > sp.x ? 1 : -1;
  }
}
const lines = () => page.slice(pageAt, pageAt + 3);
const pageLen = () => lines().join("").length;
const talking = () => page.length > 0;

function dialogueTick(): void {
  if (!K.isPressed(K.BTN_LP)) { shown += 2; return; }
  if (shown < pageLen()) { shown = 9999; return; }
  if (pageAt + 3 < page.length) { pageAt += 3; shown = 0; return; }
  nextLine();
  if (!talking()) { mStep++; run(); }
}

// ---------------------------------------------------------------- tick

const puffs: { x: number; y: number; t: number }[] = [];

export function tick(): void {
  mTick++;
  if (mCapT > 0) mCapT--;
  if (mShake > 0) mShake--;
  if (mMoon >= 0) mMoon++;
  for (const q of props) {
    q.t++;
    if (isBattleCut(q.kind)) battleContacts(q.x - camX, q.kind, q.t);
  }
  if (mFadeIn > 0) mFadeIn--;
  if (mFlash > 0) mFlash--;
  if (mFadeOut > 0) { mFadeOut--; if (mFadeOut === 0) { mFadeDone = mFadeFor; run(); } return; }
  if (mWaitA) { if (K.isPressed(K.BTN_LP)) { mWaitA = false; mStep++; run(); } camera(); return; }
  if (mTitle) {
    mTitleT++;
    if (mTitleT > 60 && K.isPressed(K.BTN_LP)) { mTitle = false; mStep++; run(); }
    return;
  }
  if (mNoticeT > 0) mNoticeT--;
  if (mHitStop > 0) { mHitStop--; if (duel && duel.dark > 0) duel.dark--; FX.update(); return; }   // freeze: the darkness runs out with it
  if (talking()) dialogueTick();
  else if (mWait > 0) { mWait--; if (mWait === 0) { mStep++; run(); } }

  const p = player();
  for (const e of ents) if (e.flash > 0) e.flash--;
  for (let k = puffs.length - 1; k >= 0; k--) if (++puffs[k].t > 30) puffs.splice(k, 1);
  for (let k = auras.length - 1; k >= 0; k--) if (++auras[k].t > auras[k].life) auras.splice(k, 1);
  if (duel && !talking()) { duelTick(); camera(); FX.update(); return; }
  if (control && !talking() && p) playerInput(p);
  for (const e of ents) think(e);
  for (const e of ents) physics(e);
  combat();
  FX.update();
  if (!talking() && quest) checkQuest();
  // a blocking walk ("move" with wait): done when the walker has arrived
  const s = steps[mStep];
  if (s && s.t === "move" && s.wait && !talking()) {
    const e = ent(String(s.id));
    if (!e || e.goal === null) { mStep++; run(); }
  }
  camera();
}

function camera(): void {
  if (!map) return;
  const t = camFixed !== null ? camFixed : (ent(camTarget)?.x ?? player()?.x ?? 0) - SCREEN_W / 2 + (camTarget === "player" ? (player()?.face ?? 1) * 18 : 0);
  const want = Math.max(0, Math.min(map.w - SCREEN_W, t));
  if (mSnap) { camX = want; mSnap = false; }
  camX += (want - camX) * 0.12;
  if (Math.abs(want - camX) < 0.3) camX = want;
  if (mShake > 0) camX += (mShake % 2 ? 1 : -1) * Math.min(3, mShake * 0.4);
}

// --- player
const hist: number[] = [];
function playerInput(p: Ent): void {
  const L = K.isDown(K.BTN_LEFT), Rt = K.isDown(K.BTN_RIGHT), dn = K.isDown(K.BTN_DOWN);
  hist.push(dn ? 2 : (p.face > 0 ? Rt : L) ? 6 : 5); if (hist.length > 14) hist.shift();
  // interact
  const near = target();
  if (near && K.isPressed(K.BTN_LP) && p.st <= ST_WALK) { interact(near); return; }
  if (p.st === ST_POSE && (L || Rt)) setSt(p, ST_IDLE);          // a scene pose ends when the player moves
  if (p.st === ST_IDLE || p.st === ST_WALK) {
    if (K.isPressed(K.BTN_UP) && p.kit.jumpVY) { p.vy = p.kit.jumpVY * 1.05; p.vx = (Rt ? 1 : L ? -1 : 0) * 1.9; setSt(p, ST_JUMP); return; }
    const motion = hist.lastIndexOf(2) >= 0 && hist.lastIndexOf(6) > hist.lastIndexOf(2);
    if (K.isPressed(K.BTN_LP) && motion && !near) { attack(p, MV_SP1); hist.length = 0; return; }
    if (K.isPressed(K.BTN_LP)) { attack(p, MV_LP); return; }
    if (K.isPressed(K.BTN_HP)) { attack(p, MV_HP); return; }
    if (K.isPressed(K.BTN_LK)) { attack(p, MV_LK); return; }
    if (K.isPressed(K.BTN_HK)) { attack(p, MV_HK); return; }
    const dirx = Rt ? 1 : L ? -1 : 0;
    const tq = quest && quest.goal === "talk" ? ent(String(quest.id)) : null;
    const blocked = tq && Math.sign(tq.x - p.x) === dirx && Math.abs(tq.x - p.x) < 22;
    if (dirx && blocked) { p.face = dirx; p.vx = 0; if (p.st !== ST_IDLE) setSt(p, ST_IDLE); }
    else if (dirx) { p.face = dirx; p.vx = dirx * p.kit.walkSpeed * 1.6; if (p.st !== ST_WALK) setSt(p, ST_WALK); }
    else { p.vx = 0; if (p.st !== ST_IDLE) setSt(p, ST_IDLE); }
  } else if (p.st === ST_JUMP && p.mv < 0) {
    if (K.isPressed(K.BTN_LP) || K.isPressed(K.BTN_HP)) { const vx = p.vx, vy = p.vy; attack(p, MV_JP); p.vx = vx; p.vy = vy; }
    else if (K.isPressed(K.BTN_LK) || K.isPressed(K.BTN_HK)) { const vx = p.vx, vy = p.vy; attack(p, MV_JK); p.vx = vx; p.vy = vy; }
  }
}

/** The person or thing the player can talk to / inspect right now (the quest's target). */
function target(): Ent | null {
  if (!quest || (quest.goal !== "inspect" && quest.goal !== "talk")) return null;
  const e = ent(String(quest.id)), p = player();
  return e && p && Math.abs(e.x - p.x) < 32 ? e : null;
}
function interact(e: Ent): void {
  const p = player();
  p.vx = 0; setSt(p, ST_IDLE);
  const side = p.x <= e.x ? -1 : 1;
  if (Math.abs(p.x - e.x) < 22) p.x = e.x + side * 22;
  p.face = -side;
  if (e.st <= ST_WALK) e.face = side;
  quest = null; control = false; mStep++; run();
}

function checkQuest(): void {
  const q = quest!;
  const p = player();
  if (q.goal === "reach") {
    const x = Number(q.x);
    if ((Number(q.dir ?? 1) > 0 && p.x >= x) || (Number(q.dir ?? 1) < 0 && p.x <= x)) { quest = null; control = false; p.vx = 0; setSt(p, ST_IDLE); mStep++; run(); }
  } else if (q.goal === "kill") {
    const ids = q.ids as string[];
    const left = ids.filter((id) => { const e = ent(id); return e && e.st !== ST_DEAD; }).length;
    questCount = " (" + (ids.length - left) + "/" + ids.length + ")";
    if (left === 0 && ents.every((e) => e.st !== ST_DEAD)) {
      quest = null; control = false; questCount = ""; p.vx = 0; if (p.st !== ST_JUMP) setSt(p, ST_IDLE); mStep++; run();
    }
  }
  if (p.hp <= 0 && p.st === ST_DOWN && p.t > 40) retry();
}

function retry(): void {
  if (!mCheck) return;
  ents = mCheck.ents.map((e) => ({ ...e }));
  const p = player(); p.hp = p.maxHp;
  mNotice = "다시 일어선다"; mNoticeT = 50;
}

// --- everybody: scripted walking, following, enemy AI
function think(e: Ent): void {
  if (e.inv > 0) e.inv--;
  if (e.cool > 0) e.cool--;
  if (e.st === ST_ATK || e.st === ST_HIT || e.st === ST_DOWN || e.st === ST_DEAD || e.st === ST_JUMP) return;
  if (e.id === "player" && control) return;
  if (e.follow) {
    const t = ent(e.follow);
    if (t) {
      const d = t.x - e.x;
      if (Math.abs(d) > e.gap + 6) { e.goal = t.x - Math.sign(d) * e.gap; e.run = Math.abs(d) > e.gap + 30; }
      else if (e.goal === null && Math.abs(d) > 2) e.face = d > 0 ? 1 : -1;
    }
  }
  if (e.hostile && e.goal === null) { enemyAI(e); return; }
  if (e.goal !== null) {
    const d = e.goal - e.x, sp = e.spd || e.kit.walkSpeed * (e.run ? 1.9 : 1);
    if (Math.abs(d) <= sp) { e.x = e.goal; e.goal = null; e.vx = 0; if (e.st !== ST_POSE) setSt(e, ST_IDLE); }
    else { e.face = d > 0 ? 1 : -1; e.vx = Math.sign(d) * sp; if (e.st !== ST_WALK) setSt(e, ST_WALK); }
  } else if (e.st === ST_WALK) { e.vx = 0; setSt(e, ST_IDLE); }
}

function enemyAI(e: Ent): void {
  const p = player();
  if (!p) return;
  const d = p.x - e.x, ad = Math.abs(d);
  e.face = d > 0 ? 1 : -1;
  // the closest one on each side presses in, the others keep a little distance
  const side = ents.filter((o) => o.hostile && o.st !== ST_DEAD && Math.sign(p.x - o.x) === Math.sign(d)).sort((a, b) => Math.abs(p.x - a.x) - Math.abs(p.x - b.x));
  const rank = side.indexOf(e);
  const want = 15 + rank * 15;
  const busy = ents.filter((o) => o.hostile && o.st === ST_ATK).length;
  if (ad <= 20 && rank === 0 && e.cool === 0 && busy < 2 && p.hp > 0) {
    attack(e, Math.random() < 0.7 ? MV_LP : MV_HP, 9);       // a long, readable wind-up
    e.cool = 34 + Math.floor(Math.random() * 30);
    return;
  }
  if (ad > want + 3) { e.vx = Math.sign(d) * e.kit.walkSpeed * 0.65; if (e.st !== ST_WALK) setSt(e, ST_WALK); }
  else if (ad < want - 6 && rank > 0) { e.vx = -Math.sign(d) * e.kit.walkSpeed * 0.5; if (e.st !== ST_WALK) setSt(e, ST_WALK); }
  else { e.vx = 0; if (e.st !== ST_IDLE) setSt(e, ST_IDLE); }
}

function physics(e: Ent): void {
  e.t++;
  if (e.st === ST_POSE && e.air) {                         // thrown down or tripped: fall to the ground (a pose set up high, like a throne, stays put)
    e.vy += GRAV; e.y += e.vy; e.x += e.vx;
    if (e.y >= GROUND) { e.y = GROUND; e.vy = 0; e.vx = 0; e.air = false; }
    return;
  }
  if (e.st === ST_ATK) {
    const mv = e.mv, s = D.MvStartup[mv] + e.windup, end = s + D.MvActive[mv] + D.MvRecovery[mv];
    if (D.MvType[mv] === MT_RUSH && e.t >= s && e.t < s + D.MvActive[mv]) e.x += e.face * D.MvP1[mv];
    else if (e.y >= GROUND && e.t < s && D.MvP1[mv] > 0 && D.MvType[mv] === 0) e.x += e.face * D.MvP1[mv] * 0.5;
    if (e.y < GROUND) { e.vy += GRAV; e.y += e.vy; e.x += e.vx; if (e.y >= GROUND) { e.y = GROUND; e.vx = 0; e.mv = -1; setSt(e, ST_IDLE); } return; }
    if (e.t >= end) { e.mv = -1; setSt(e, ST_IDLE); }
    e.vx = 0;
  } else if (e.st === ST_JUMP) {
    e.vy += GRAV; e.y += e.vy; e.x += e.vx;
    if (e.y >= GROUND) { e.y = GROUND; e.vx = 0; setSt(e, ST_IDLE); }
  } else if (e.st === ST_HIT) {
    e.x += e.vx; e.vx *= 0.75;
    if (e.t >= e.stun) setSt(e, ST_IDLE);
  } else if (e.st === ST_DOWN || e.st === ST_DEAD) {
    if (e.y < GROUND || e.vy < 0) { e.vy += GRAV; e.y += e.vy; e.x += e.vx; if (e.y >= GROUND) { e.y = GROUND; e.vy = 0; e.vx = 0; e.t = 0; } }
    else if (e.st === ST_DOWN && e.t > (e.hp <= 0 ? 9999 : 26)) { setSt(e, ST_IDLE); e.inv = 16; }
    else if (e.st === ST_DEAD && e.t > 40) ents = ents.filter((o) => o !== e);
  } else {
    e.x += e.vx;
  }
  if (map && (e.id === "player" || e.hostile)) e.x = Math.max(6, Math.min(map.w - 6, e.x));   // others may stand off the edge (walking in)
}

function combat(): void {
  for (const a of ents) {
    const hb = hitBox(a);
    if (!hb || a.hitDone) continue;
    for (const b of ents) {
      if (b === a || b.st === ST_DOWN || b.st === ST_DEAD || b.inv > 0 || b.small || b.st === ST_POSE) continue;
      const enemies = a.id === "player" ? b.hostile : a.hostile && b.id === "player";
      if (!enemies || !overlap(hb, hurt(b))) continue;
      hitOne(a, b);
      if (a.id !== "player" || D.MvType[a.mv] !== MT_RUSH) a.hitDone = true;    // the rush palm goes through the crowd
    }
  }
}

function hitOne(a: Ent, b: Ent): void {
  const mv = a.mv, heavy = mv === a.kit.moves[MV_HK] || mv === a.kit.moves[MV_HP] || mv === a.kit.moves[MV_SP1];
  const dmg = a.id === "player" ? D.MvDamage[mv] : Math.round(D.MvDamage[mv] * 0.55);
  b.hp -= dmg;
  FX.spawnHit(b.x - camX + a.face * -2, b.y - b.kit.hurtH * 0.62, heavy, a.look[0]);
  mHitStop = heavy ? 4 : 2;
  b.face = -a.face; b.goal = null;
  if (b.st === ST_ATK) b.mv = -1;
  if (b.hp <= 0 || (heavy && mv === a.kit.moves[MV_SP1]) || (heavy && a.id === "player" && mv === a.kit.moves[MV_HK])) {
    setSt(b, b.hp <= 0 && b.id !== "player" ? ST_DEAD : ST_DOWN);
    b.vy = -3.2; b.y -= 1; b.vx = a.face * (b.hp <= 0 ? 2.4 : 1.8);
    if (b.hp <= 0 && b.id === "player") b.hp = 0;
  } else {
    setSt(b, ST_HIT); b.stun = D.MvHitstun[mv] + 2; b.vx = a.face * (heavy ? 2.6 : 1.6);
  }
  if (b.id === "player") { b.inv = 8; }
}

// ---------------------------------------------------------------- render

export function render(): void {
  R.beginFrame(false);
  if (!map) { R.physRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(0, 0, 0)); return; }
  if (mTitle) { titleRender(); return; }
  FM.drawBack(map, camX, mTick);
  if (duel && duel.dark > 0) R.shadeRect(0, 0, R.PHYS_W, R.PHYS_H, 0, 0.55);   // super freeze / heavy impact: the world goes dark
  for (const q of props) if (!LATE_PROPS.includes(q.kind)) drawProp(q);
  const order = ents.slice().sort((a, b) => (a.small ? 1 : 0) - (b.small ? 1 : 0) || (a.id === "player" ? 1 : 0) - (b.id === "player" ? 1 : 0));
  for (const e of order) {
    if (e.st === ST_DEAD && e.t > 10 && Math.trunc(e.t / 3) % 2 === 0) continue;
    if (e.id === "player" && e.inv > 0 && mTick % 2 === 0 && e.st !== ST_DOWN) continue;
    const id = sprite(e, mTick);
    if (id < 0) continue;
    const x = Math.round(e.x - camX), y = Math.round(e.y);
    R.drawSprite(id, x, y, e.face < 0, e.flash > 0 ? RGB(255, 255, 255) : -1, e.look[1] | (e.st === ST_DEAD ? SKIN_DIM : 0));
  }
  for (const a of auras) {
    const q = a.t / a.life;
    R.shadeCircle((a.x - camX) * PX, a.y * PX, (a.r + a.t * a.grow) * PX, a.c, 0.55 * (1 - q));
    R.shadeCircle((a.x - camX) * PX, a.y * PX, (a.r * 0.45 + a.t * a.grow * 0.5) * PX, RGB(255, 255, 255), 0.35 * (1 - q));
  }
  if (duel) {                                             // a skill gathering in the hands during its wind-up
    const d = duel, p = player();
    const glow = (e: Ent, mv: DuelMove | null, t: number) => {
      if (!mv?.aura || t < 0 || t >= mv.wind) return;
      const r = 5 + 3 * Math.sin(mTick * 0.8) + t * 0.4;
      R.shadeCircle((e.x - camX + e.face * 7) * PX, (e.y - 15) * PX, r * PX, mv.aura, 0.45);
    };
    if (p && d.pAtk >= 0) glow(p, d.mv, d.pAtk);
    for (const o of d.foes) if (!o.out && o.atk >= 0) glow(o.e, o.mv, o.atk);
    if (p && d.eng && d.pAtk >= 0 && D.MvType[d.emv] === MT_SUPER_QUAKE) drawQuakeField(p, d.emv, d.pAtk);
  }
  for (const pf of puffs) for (let k = 0; k < 5; k++) R.shadeCircle((pf.x - camX + (k - 2) * 5) * PX, (pf.y - pf.t * 0.3 - (k % 2) * 4) * PX, (5 + pf.t * 0.4) * PX, RGB(70, 66, 76), 0.5 * (1 - pf.t / 30));
  FX.draw();
  for (const q of props) if (LATE_PROPS.includes(q.kind)) drawProp(q);
  FM.drawFront(map, camX, mTick);
  if (mMoon >= 0) moonRender();
  if (mCapT > 0 && !talking()) {
    const a = Math.min(1, mCapT / 12, (70 - mCapT + 12) / 12);
    R.shadeRect(0, 200, KF.width(mCap, 2) + 56, 34, RGB(10, 8, 14), 0.75 * a);
    R.physRect(0, 200, 4, 34, RGB(240, 196, 96));
    KF.draw(mCap, 22, 206, RGB(255, 236, 190), 2);
  }
  // enemy health bars and the "!" over the quest target
  for (const e of ents) if (e.hostile && e.st !== ST_DEAD && e.hp < e.maxHp) {
    const x = Math.round(e.x - camX) - 8, y = Math.round(e.y) - e.kit.hurtH - 7;
    R.fillRect(x, y, 16, 2, RGB(30, 20, 24)); R.fillRect(x, y, Math.max(0, Math.round(16 * e.hp / e.maxHp)), 2, RGB(220, 60, 50));
  }
  if (quest && (quest.goal === "inspect" || quest.goal === "talk") && !talking()) {
    const e = ent(String(quest.id));
    if (e) {
      const x = Math.round(e.x - camX), y = Math.round(e.y) - (e.st === ST_POSE ? 14 : e.kit.hurtH + 12) + (Math.trunc(mTick / 8) % 2);
      R.fillRect(x - 2, y - 1, 5, 9, RGB(30, 20, 14)); R.fillRect(x - 1, y, 3, 5, RGB(255, 210, 90)); R.fillRect(x - 1, y + 6, 3, 1, RGB(255, 210, 90));
    }
  }
  if (quest && quest.goal === "reach" && !talking() && Math.trunc(mTick / 6) % 2 === 0) {
    const left = Number(quest.dir ?? 1) < 0;
    KF.draw(left ? "◀" : "▶", left ? 10 : R.PHYS_W - 10, 150, RGB(255, 210, 90), 3, left ? 0 : 2);
  }
  if (mFlash > 0) { R.shadeRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(250, 248, 255), Math.min(1, mFlash / 6)); }
  if (mWaitA && Math.trunc(mTick / 6) % 2 === 0) KF.draw("A ▼", R.PHYS_W - 20, R.PHYS_H - 34, RGB(240, 196, 96), 2, 2);
  hud();
  if (talking()) dialogueRender();
  const dark = mFadeOut > 0 ? 1 - Math.max(0, mFadeOut - blackTicks) / fadeTicks : mFadeIn / 12;
  if (dark > 0) R.shadeRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(0, 0, 0), Math.min(1, dark));
  if (mNoticeT > 0) { R.shadeRect(0, 132, R.PHYS_W, 36, RGB(14, 11, 22), 0.9); KF.draw(mNotice, R.PHYS_W / 2, 140, RGB(240, 196, 96), 2, 1); }
}

/** Health (gold / red), 내공 (green, flashes red when short) and the 궁극 gauge (blue, glows when full; -1 = none). */
function bars(x: number, hp: number, ng: number, g: number, short: boolean, _top: boolean, mine: boolean, y = 10): void {
  const right = !mine;
  const fill = (yy: number, h: number, v: number, c: number) => {
    R.physRect(x, yy, 154, h + 4, RGB(20, 14, 18));
    const w = Math.round(150 * Math.max(0, Math.min(1, v)));
    R.physRect(right ? x + 152 - w : x + 2, yy + 2, w, h, c);
  };
  fill(y, 8, hp, mine ? RGB(240, 196, 96) : RGB(220, 60, 50));
  fill(y + 12, 3, ng, short && Math.trunc(mTick / 3) % 2 === 0 ? RGB(230, 60, 50) : RGB(90, 200, 110));
  if (g >= 0) fill(y + 19, 3, g, g >= 1 ? (Math.trunc(mTick / 4) % 2 === 0 ? RGB(150, 220, 255) : RGB(80, 150, 255)) : RGB(70, 120, 230));
}

function hud(): void {
  const p = player();
  if (!p) return;
  if (duel && duel.hpMode && !talking()) {
    const d = duel;
    bars(12, p.hp / p.maxHp, d.pNg / 1000, d.pG / 100, d.ngFlash > 0, false, true);
    Font.drawText(p.look[2], 5, 14, RGB(230, 230, 240));
  } else if ((control || quest) && p.kit.moves.length) {
    R.physRect(12, 10, 154, 12, RGB(20, 14, 18)); R.physRect(14, 12, Math.round(150 * Math.max(0, p.hp) / p.maxHp), 8, RGB(240, 196, 96));
    Font.drawText(p.look[2], 5, 8, RGB(230, 230, 240));
  }
  if (quest && !talking()) {
    const t = questText + (quest.goal === "kill" ? questCount : "");
    const w = KF.width(t, 2) + 34;
    R.shadeRect(R.PHYS_W - w - 10, 8, w, 34, RGB(14, 11, 22), 0.8);
    R.physRect(R.PHYS_W - w - 10, 8, 3, 34, RGB(240, 196, 96));
    KF.draw(t, R.PHYS_W - 22, 15, RGB(255, 236, 190), 2, 2);
  }
  if (duel && duel.hpMode && !talking()) {                 // the foe's bars, top right under the quest
    const d = duel, o = d.foes.find((q) => q.e === d.foe) ?? d.foes[0], f = o.e, boss = !!SKILLS[f.kit.base ?? f.look[0]];
    bars(R.PHYS_W - 166, f.hp / f.maxHp, o.ng / 1000, boss ? o.g / 100 : -1, false, true, false, 48);
    Font.drawText(f.look[2], SCREEN_W - 5, boss ? 28 : 26, RGB(230, 230, 240), 1, 2);
    if (d.foes.length > 1) for (const q of d.foes) if (!q.out) {   // several foes: a small bar over each head
      const x = Math.round(q.e.x - camX) - 8, y = Math.round(q.e.y) - 38;
      R.fillRect(x - 1, y - 1, 18, 4, RGB(20, 14, 18));
      R.fillRect(x, y, Math.max(0, Math.round(16 * q.e.hp / q.e.maxHp)), 2, q.e === d.foe ? RGB(255, 90, 70) : RGB(190, 50, 45));
    }
  }
  const mine = duel?.hpMode ? SKILLS[p.kit.base ?? p.look[0]] : undefined;
  if (mine && !talking()) {                               // the player's skill commands
    const t = SKILL_HINT[p.kit.base ?? p.look[0]] ?? "";
    R.shadeRect(0, 250, R.PHYS_W, 22, RGB(8, 6, 12), 0.5);
    KF.draw(t, R.PHYS_W / 2, 252, RGB(190, 210, 240), 2, 1);
  }
  if (duel && !talking()) Font.drawText("LEFT RIGHT = MOVE   A S Z X = ATTACK", SCREEN_W / 2, 94, RGB(150, 140, 170), 1, 1);
  if (control && !talking()) Font.drawText(target() ? "A = TALK" : !p.kit.moves.length ? "LEFT RIGHT = RUN" : "ARROWS MOVE  UP JUMP  A S Z X ATTACK", SCREEN_W / 2, 94, RGB(150, 140, 170), 1, 1);
}

function dialogueRender(): void {
  const BY = 8, BH = 82;
  R.shadeRect(12, BY, R.PHYS_W - 24, BH, RGB(14, 11, 22), 0.88);
  R.physRect(12, BY + BH - 2, R.PHYS_W - 24, 2, RGB(150, 110, 50));
  let tx = 30;
  if (who && who !== "해설") {
    KF.draw(who, 30, BY + 8, RGB(240, 196, 96), 2);
    tx = 30 + Math.max(84, KF.width(who, 2) + 20);
  }
  let left = shown;
  const ls = lines();
  for (let k = 0; k < ls.length; k++) {
    const isDir = dir && pageAt + k === 0;
    const c = kind === "cut" ? RGB(186, 204, 226) : who === "단서" ? RGB(240, 196, 96) : isDir ? RGB(140, 128, 160) : RGB(244, 236, 222);
    const s = [...ls[k]].slice(0, Math.max(0, left)).join("");
    left -= [...ls[k]].length;
    KF.draw(s, kind === "cut" ? 30 : tx, BY + 8 + k * 24, c, 2);
  }
  if (shown >= pageLen()) {
    KF.draw("A", R.PHYS_W - 52, BY + BH - 24, RGB(170, 160, 190), 2);
    if (Math.trunc(mTick / 6) % 2 === 0) KF.draw("▼", R.PHYS_W - 34, BY + BH - 24, RGB(240, 196, 96), 2);
  }
}

export const debug = () => JSON.stringify({ dv: duel ? { emv: duel.emv, pAtk: duel.pAtk, pHit: duel.pHit, pG: Math.round(duel.pG), pNg: duel.pNg, dark: duel.dark, slow: duel.slow } : null, cam: Math.round(camX), step: mStep, t: steps[mStep]?.t, quest: questText, talk: talking(), page: page[0] ?? "", ents: ents.map((e) => e.id + ":" + Math.round(e.x) + ":" + e.st + ":" + e.hp) });
export function debugKill(): void { for (const e of ents) if (e.hostile) { e.hp = 0; setSt(e, ST_DEAD); e.t = 99; } }
export function debugWarp(x: number): void { const p = player(); if (p) p.x = x; }

// ---------------------------------------------------------------- scene dressing

function drawProp(q: Prop): void {
  if (isBattleCut(q.kind)) { drawBloodBattle(q.x - camX, q.kind, q.t); return; }
  const sx = Math.round((q.x - camX) * PX), sy = Math.round(q.y * PX);
  switch (q.kind) {
    case "beads":                                          // a broken string of wooden prayer beads, scattered
      for (const [dx, dy] of [[-14, 0], [-9, -1], [-4, 1], [2, 0], [7, -1], [12, 1], [17, 0], [22, 1]])
        { R.physRect(sx + dx * 3, sy - 6 + dy * 2, 6, 6, RGB(92, 58, 30)); R.physRect(sx + dx * 3 + 1, sy - 5 + dy * 2, 2, 2, RGB(160, 112, 64)); }
      break;
    case "hairpin": {                                      // half a silver hairpin in the snow, red thread wound on it
      for (let k = 0; k < 16; k++) R.physRect(sx + k * 2, sy - 6 - Math.floor(k / 4), 3, 3, k > 12 ? RGB(150, 150, 170) : RGB(214, 218, 230));
      for (let k = 3; k < 9; k += 2) R.physRect(sx + k * 2, sy - 8 - Math.floor(k / 4), 3, 5, RGB(200, 30, 40));
      R.physRect(sx + 18, sy - 3, 8, 2, RGB(200, 30, 40));
      if (Math.trunc(q.t / 10) % 3 === 0) R.physRect(sx + 4, sy - 12, 2, 2, RGB(255, 255, 255));
      break;
    }
    case "redmist": {                                      // red qi rising off an open hand / a body
      for (let k = 0; k < 9; k++) {
        const ph = (q.t * 2 + k * 11) % 40, up = ph * 1.4, r = Math.max(2, 9 - ph * 0.2);
        R.shadeCircle(sx + ((k * 7) % 13 - 6) * 3 + Math.sin((q.t + k * 9) * 0.15) * 4, sy - up * PX * 0.5, r * 1.6, k % 3 ? RGB(200, 20, 36) : RGB(255, 90, 90), 0.35);
      }
      break;
    }
    case "night": R.shadeRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(8, 12, 36), Math.min(0.55, q.t / 160)); break;
    case "black": R.physRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(0, 0, 0)); break;
    case "scrollfire": {                                   // the scroll map: towns catch fire one by one, then the two flags close in
      const towns = [[46, 38], [53, 79], [146, 28], [156, 64], [55, 55], [126, 49]];
      towns.forEach(([x, y], k) => {
        const age = q.t - k * 14;
        if (age < 0 || k === 5) return;
        const fx = x * PX, fy = y * PX, g = Math.min(1, age / 20);
        R.shadeCircle(fx, fy, 22 * g, RGB(160, 20, 20), 0.35);
        for (let f = 0; f < 5; f++) {
          const h = (8 + ((q.t * 3 + f * 7 + k * 5) % 10)) * g;
          R.shadeRect(fx - 12 + f * 5, fy - h * 1.5, 5, h * 1.5, f % 2 ? RGB(255, 140, 30) : RGB(220, 40, 20), 0.85);
        }
      });
      const ft = q.t - 100;
      if (ft > 0) {                                        // the alliance's white flag from the left, the cult's black flag from the right
        const u = Math.min(1, ft / 70), tx = 126 * PX, ty = 49 * PX;
        for (const [x0, c, c2] of [[-10, RGB(240, 236, 220), RGB(214, 180, 90)], [202, RGB(30, 20, 36), RGB(150, 90, 210)]] as [number, number, number][]) {
          const x = (x0 * PX) + (tx + (x0 < 0 ? -24 : 24) - x0 * PX) * u, y = 64 * PX + (ty - 64 * PX) * u;
          R.physRect(x, y - 42, 3, 48, RGB(70, 44, 24));
          R.physRect(x + (x0 < 0 ? 3 : -27), y - 42, 27, 18, c2);
          R.physRect(x + (x0 < 0 ? 5 : -25), y - 40, 23, 14, c);
        }
        if (u >= 1) R.shadeCircle(tx, ty, 26 + Math.sin(q.t * 0.3) * 3, RGB(200, 10, 20), 0.45);   // the cult's seat, where they meet
      }
      break;
    }
    case "bloodback": {                                    // one drop climbs back up the groove into the scar
      const path = [[60, 73], [72, 74], [84, 75], [92, 68], [104, 55]];
      const u = (q.t - 40) / 110;
      if (u < 0) break;
      if (u >= 1) { if (q.t < 175) R.shadeCircle(104 * PX, 55 * PX, 10, RGB(255, 60, 60), 0.6 * (1 - (q.t - 150) / 25)); break; }
      const seg = Math.min(path.length - 2, Math.floor(u * (path.length - 1))), w = u * (path.length - 1) - seg;
      const x = path[seg][0] + (path[seg + 1][0] - path[seg][0]) * w, y = path[seg][1] + (path[seg + 1][1] - path[seg][1]) * w;
      R.shadeCircle(x * PX, y * PX, 12, RGB(200, 20, 30), 0.35);
      R.physRect(Math.round(x * PX) - 4, Math.round(y * PX) - 4, 9, 9, RGB(80, 0, 10));
      R.physRect(Math.round(x * PX) - 3, Math.round(y * PX) - 3, 7, 7, RGB(180, 12, 28));
      R.physRect(Math.round(x * PX) - 2, Math.round(y * PX) - 3, 3, 3, RGB(255, 130, 130));
      break;
    }
    case "ripple": {                                       // round ripples on the dark water, twice, the same interval apart
      for (const st of [20, 90]) {
        const a = q.t - st;
        if (a < 0 || a > 60) continue;
        for (const lag of [0, 10]) {
          const r = (a - lag) * 0.5;
          if (r <= 0) continue;
          const alpha = Math.max(0, 0.6 - a / 100);
          for (let d = 0; d < 360; d += 4) R.shadeRect(q.x * PX + Math.cos(d * 0.01745) * r * PX - 1, q.y * PX + Math.sin(d * 0.01745) * r * PX * 0.9 - 1, 3, 3, RGB(170, 180, 220), alpha);
        }
      }
      break;
    }
    case "text":                                           // writing on something in the picture (a name board)
      KF.draw(q.text ?? "", sx, sy, RGB(46, 22, 12), 2, 1, -1);
      break;
    case "beam": {                                         // a burning roof beam falls, then a wall of fire
      const fall = Math.min(1, q.t / 10), y = 30 + (q.y - 30) * fall * fall;
      if (fall >= 1 && q.t === 10) mShake = 10;
      for (let k = 0; k < 6; k++) {                        // fire on the beam / rising from where it lies
        const h = fall >= 1 ? 40 + ((q.t * 7 + k * 13) % 18) : 10;
        for (let j = 0; j < h; j += 3) {
          const c = j < h * 0.3 ? RGB(255, 220, 90) : j < h * 0.7 ? RGB(255, 130, 30) : RGB(190, 40, 20);
          R.shadeRect(sx - 30 + k * 12 + ((j + q.t) % 5) - 2, y * PX - 6 - j, 8, 4, c, 0.85);
        }
      }
      R.physRect(sx - 36, y * PX - 6, 72, 9, RGB(60, 34, 20));
      R.physRect(sx - 36, y * PX - 6, 72, 2, RGB(110, 70, 40));
      break;
    }
  }
}

function moonRender(): void {
  R.physRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(4, 2, 6));
  const r = Math.min(46, 2 + mMoon * 0.6);
  R.shadeCircle(R.PHYS_W / 2, 110, r + 10, RGB(120, 10, 16), 0.35);
  R.shadeCircle(R.PHYS_W / 2, 110, r, RGB(214, 36, 40), 1);
  if (r > 20) for (const [dx, dy, rr] of [[-12, -8, 8], [10, 6, 10], [-4, 16, 5]]) R.shadeCircle(R.PHYS_W / 2 + dx * r / 46, 110 + dy * r / 46, rr * r / 46, RGB(160, 20, 28), 0.6);
}

function titleRender(): void {
  R.physRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(4, 2, 6));
  const r = Math.min(70, 2 + mTitleT * 1.7);
  R.shadeCircle(R.PHYS_W / 2, 120, r + 14, RGB(120, 10, 16), 0.3);
  R.shadeCircle(R.PHYS_W / 2, 120, r, RGB(200, 30, 36), 1);
  if (r > 30) for (const [dx, dy, rr] of [[-18, -12, 12], [16, 10, 15], [-6, 24, 8]]) R.shadeCircle(R.PHYS_W / 2 + dx * r / 70, 120 + dy * r / 70, rr * r / 70, RGB(150, 18, 26), 0.55);
  if (r >= 70 && mTitleT > 50) KF.draw(mTitleText, R.PHYS_W / 2, 222, RGB(230, 210, 180), 2, 1);
  if (mTitleT > 60 && Math.trunc(mTitleT / 8) % 2 === 0) Font.drawText("A = NEXT", SCREEN_W - 4, 92, RGB(150, 140, 170), 1, 2);
}

// ---------------------------------------------------------------- duels: a short SD fight right where the scene is

// one opponent in a duel: its own wind-up, cool-down, stagger, move, 내공, 궁극 gauge, starting spot and side of the player
interface Foe { e: Ent; bn: string; vx: number; combo: number; down: number; atk: number; cool: number; hit: number; mv: DuelMove | null; ng: number; g: number; x0: number; out: boolean; side: number }
interface Duel {
  foes: Foe[]; foe: Ent;                                  // foe = the one shown in the top-right bars (the last one struck)
  need: number; time: number; guard: boolean; t: number; hits: number; pAtk: number; pHit: number; mv: DuelMove;
  hpMode: boolean; dmg: number; block: number; ko: number; px0: number;   // health duel: both sides take damage, the player can fall (then the bout starts over)
  pNg: number; pG: number; ngFlash: number; hist: number[];               // 내공 (0..1000, refills), 궁극 gauge (0..100, hits), stick history
  // a player who has fight-engine moves (sd_danwoo) fights with them: move id, hit landed, pushback, guard, darkening, slow motion
  eng: Record<string, number> | null; emv: number; pHas: boolean; pVx: number; pGuard: number; dark: number; slow: number;
}
let duel: Duel | null = null;
let mMapName = "";                                        // the current map (a fight on the spot uses its picture)
let mCarryG = 0;                                          // the player's 궁극 gauge carries over from bout to bout in a scene
// difficulty chosen at a route's first chapter: 0 easy, 1 normal, 2 hard (foe damage, foe pace, foe health, foe wind-up, foe blocking)
let mDiff = 1;
export function setDifficulty(n: number): void { mDiff = Math.max(0, Math.min(2, n)); }
const DIFF = { dmg: [0.55, 1, 1.5], cool: [1.6, 1, 0.6], hp: [0.75, 1, 1.25], wind: [15, 10, 7], block: [0.4, 1, 1.6], skill: [0.5, 1, 1.5] };

/** The first of these frames the character has (SD art grows over time; older sets fall back to a near pose). */
function frame(e: Ent, names: string[]): number {
  const base = e.kit.base ?? e.look[0];
  for (const n of names) if (hasSprite(base + "." + n)) return spriteId(base + "." + n);
  return animFrame(e.kit.idle, mTick);
}
const ATK0 = ["atk_0", "block", "walk_2", "lower", "stand"], ATK1 = ["atk_1", "block", "walk_0", "slash", "walk_1"];
// the four buttons: light hand, heavy hand, light kick, heavy kick (frames <name>_0 wind-up, <name>_1 strike;
// a character without them uses its light attack). Skills add a command (numpad, relative to facing), a 내공 cost
// or the full 궁극 gauge, a dash, a glow colour and how the hit looks.
interface DuelMove {
  name: string; wind: number; len: number; reach: number; push: number; stop: number; dmg: number;
  label?: string; cmd?: string; cost?: number; ult?: boolean; dash?: number; aura?: number; kind?: "rush" | "spin" | "slam" | "bomb" | "bind" | "power"; breaks?: boolean;
}
const MOVES: DuelMove[] = [
  { name: "atk", wind: 4, len: 10, reach: 32, push: 7, stop: 3, dmg: 8 },
  { name: "hvy", wind: 7, len: 15, reach: 34, push: 13, stop: 5, dmg: 13 },
  { name: "kick", wind: 4, len: 11, reach: 34, push: 8, stop: 3, dmg: 9 },
  { name: "hkick", wind: 7, len: 16, reach: 38, push: 14, stop: 5, dmg: 15 },
];
const BLUE = RGB(110, 180, 255), SMOKE = RGB(60, 52, 72), VIOLET = RGB(120, 60, 150), EMBER = RGB(235, 60, 40);
// the same commands as in the fighting game (README): P = A or S
const SKILLS: Record<string, DuelMove[]> = {
  sd_danwoo: [
    { name: "slam", label: "청풍진천", cmd: "2626", ult: true, wind: 14, len: 30, reach: 90, push: 26, stop: 12, dmg: 40, aura: BLUE, kind: "slam" },
    { name: "spin", label: "벽력권", cmd: "623", cost: 500, wind: 8, len: 18, reach: 36, push: 18, stop: 8, dmg: 22, aura: BLUE, kind: "spin", breaks: true },
    { name: "palm", label: "청풍장", cmd: "236", cost: 300, wind: 5, len: 16, reach: 40, push: 16, stop: 6, dmg: 18, dash: 24, aura: BLUE, kind: "rush" },
  ],
  sd_heuksa: [
    { name: "bind", label: "흑사천망", ult: true, wind: 18, len: 32, reach: 130, push: 20, stop: 12, dmg: 32, aura: VIOLET, kind: "bind" },
    { name: "bomb", label: "흑연탄", cost: 450, wind: 10, len: 20, reach: 120, push: 8, stop: 5, dmg: 12, aura: SMOKE, kind: "bomb" },
    { name: "snake", label: "흑사장", cost: 300, wind: 9, len: 18, reach: 44, push: 14, stop: 6, dmg: 16, dash: 22, aura: VIOLET, kind: "rush" },
  ],
};
const SKILL_HINT: Record<string, string> = { sd_danwoo: "↓↘→A 청풍장  →↓↘A 벽력권  ↓→↓→A 청풍진천" };
// underlings have one: a powered-up blow (glowing red), a little stronger than their plain attack
const POWER: DuelMove = { name: "power", label: "", cost: 700, wind: 14, len: 20, reach: 34, push: 10, stop: 5, dmg: 0, aura: EMBER, kind: "power" };
function showPose(e: Ent, id: number): void { e.pose = id; e.st = ST_POSE; e.vx = 0; }

// glows and shock rings (drawn as soft circles), and the name of a skill as it is used
const auras: { x: number; y: number; t: number; life: number; r: number; c: number; grow: number }[] = [];
function aura(x: number, y: number, r: number, c: number, life = 14, grow = 0.6): void { auras.push({ x, y, t: 0, life, r, c, grow }); }


/** The stick as a numpad digit relative to the facing (6 = toward the foe). */
function stickDir(face: number): number {
  const up = K.isDown(K.BTN_UP), dn = K.isDown(K.BTN_DOWN);
  const fw = face > 0 ? K.isDown(K.BTN_RIGHT) : K.isDown(K.BTN_LEFT), bk = face > 0 ? K.isDown(K.BTN_LEFT) : K.isDown(K.BTN_RIGHT);
  if (dn) return fw ? 3 : bk ? 1 : 2;
  if (up) return fw ? 9 : bk ? 7 : 8;
  return fw ? 6 : bk ? 4 : 5;
}
/** Was the command entered in the last ticks (in order, last step recent)? 2 matches any down direction. */
function entered(hist: number[], cmd: string, window: number): boolean {
  let j = cmd.length, first = -1;
  for (let t = 0; t <= window && t < hist.length; t++) {
    const want = +cmd[j - 1], got = hist[hist.length - 1 - t];
    if (want === 2 ? got >= 1 && got <= 3 : want === got) { if (first < 0) first = t; j--; if (j === 0) return first <= 4; }
  }
  return false;
}

/** A blow lands (either side): damage, glow, shake, gauges. */
function land(d: Duel, atk: Ent, def: Ent, mv: DuelMove, dmg: number, dir: number, blocked: boolean, playerHits: boolean, fo: Foe | null): void {
  const c = mv.aura;
  if (mv.kind === "slam") { for (const s of [-1, 1]) for (let k = 0; k < 3; k++) aura(atk.x + s * (10 + k * 16), GROUND - 4, 8 + k * 2, c!, 18 + k * 4, 0.9); mShake = 12; mFlash = 4; }
  else if (mv.kind === "bind") { for (let k = 0; k < 5; k++) aura(def.x + (k - 2) * 5, def.y - 6 - k * 5, 9, c!, 26, 0.3); mShake = 10; mFlash = 3; }
  else if (mv.kind === "bomb") { for (let k = 0; k < 4; k++) aura(def.x + (k - 1.5) * 7, def.y - 10 - (k % 2) * 6, 10, c!, 30, 0.5); puffs.push({ x: def.x, y: def.y - 14, t: 0 }); }
  else if (c !== undefined) { aura(atk.x + dir * 16, atk.y - 16, mv.kind === "spin" ? 12 : 10, c, 16, 0.8); if (mv.kind !== "power") mShake = Math.max(mShake, 6); }
  if (blocked) { def.flash = 1; showPose(def, frame(def, ["guard", "lower"])); def.x += dir * 2; dmg = mv.cost || mv.ult ? Math.ceil(dmg * 0.2) : 0; }
  else { def.flash = 2; def.x += dir * mv.push; showPose(def, frame(def, ["hit", "walk_1"])); }
  if (d.hpMode && dmg > 0) def.hp -= dmg;
  if (d.hpMode && fo) {
    if (playerHits) { if (!mv.ult) d.pG = Math.min(100, d.pG + (blocked ? 3 : 9)); fo.g = Math.min(100, fo.g + 6); }
    else { if (!mv.ult) fo.g = Math.min(100, fo.g + (blocked ? 3 : 9)); d.pG = Math.min(100, d.pG + 7); }
  }
}

const alive = (d: Duel) => d.foes.filter((o) => !o.out);
function resetBout(d: Duel, p: Ent): void {
  d.ko = 0; d.t = 0; d.hits = 0; d.pAtk = -1; d.pHit = 0; d.pNg = 1000;
  p.hp = p.maxHp; p.x = d.px0; setSt(p, ST_IDLE);
  d.foes.forEach((o, i) => { o.out = false; o.atk = -1; o.hit = 0; o.mv = null; o.cool = 40 + i * 25; o.ng = 500; o.g = 0; o.e.hp = o.e.maxHp; o.e.x = o.x0; o.e.vy = 0; o.e.y = GROUND; o.e.air = false; setSt(o.e, ST_IDLE); });
}

// ---------------------------------------------------------------- field bouts with fight-engine moves
// A player who is also a fight-engine character (sd_danwoo) fights underlings with that character's real moves:
// startup / active / recovery, frames, hitboxes, damage, hitstun, knockdown, pushback, combo scaling, counter hits,
// hit stop, 내공 costs and 궁극 gauge gains are the engine's (data/moves.txt, combat.ts). Distances are scaled by EK:
// SD art stands 2 screen pixels per art pixel here and 3 in the engine.
const EK = 2 / 3;
const engCache = new Map<string, Record<string, number> | null>();
function engMoves(p: Ent): Record<string, number> | null {
  const pre = p.kit.base ?? p.look[0];
  if (!engCache.has(pre)) {
    try { engCache.set(pre, Object.fromEntries(["lp", "hp", "lk", "hk", "sp1", "sp2", "super"].map((n) => [n, moveId(pre + "." + n)]))); }
    catch { engCache.set(pre, null); }
  }
  return engCache.get(pre)!;
}
/** The engine's frame for move mv at tick t (wind-up, strike, recovery sequences included). */
function engSprite(mv: number, t: number): number {
  const S = D.MvStartup[mv], A = D.MvActive[mv];
  if (t < S && D.MvSeqPre[mv] >= 0) return animFrameHold(D.MvSeqPre[mv], t);
  if (t >= S && t < S + A && D.MvSeqAct[mv] >= 0) return animFrameHold(D.MvSeqAct[mv], t - S);
  if (t >= S + A && D.MvSeqRec[mv] >= 0) return animFrameHold(D.MvSeqRec[mv], t - S - A);
  return t >= S && t < S + A ? D.MvSprA[mv] : D.MvSprS[mv];
}
const foeWind = (o: Foe) => (o.mv ? Math.round(o.mv.wind * DIFF.wind[mDiff] / 10) : DIFF.wind[mDiff]);

function engPlayer(d: Duel, p: Ent, live: Foe[], L: boolean, Rt: boolean): void {
  const em = d.eng!;
  d.pNg = Math.min(1000, d.pNg + 7);                     // NAEGONG_REGEN
  if (d.pHit > 0) {                                     // hit or blocking: stunned, sliding back
    d.pHit--; p.x += d.pVx; d.pVx *= 0.7;
    showPose(p, d.pGuard > 0 ? frame(p, ["guard"]) : frame(p, ["hit_0", "hit"]));
    if (d.pGuard > 0) d.pGuard--;
    return;
  }
  if (d.pAtk >= 0) {
    const mv = d.emv, t = d.pAtk, S = D.MvStartup[mv], A = D.MvActive[mv], R = D.MvRecovery[mv], dir = p.face;
    showPose(p, engSprite(mv, t));
    const blockedAhead = live.some((o) => (o.e.x - p.x) * dir > 0 && Math.abs(o.e.x - p.x) < 8 && o.down === 0);   // bodies touch at 12 engine px
    if (D.MvType[mv] === MT_RUSH && t >= S && t < S + A && !blockedAhead) p.x += dir * D.MvP1[mv] * EK;   // rushes travel while active
    else if (D.MvType[mv] === MT_NORMAL && t < S && D.MvP1[mv] > 0 && !blockedAhead) p.x += dir * D.MvP1[mv] * 0.5 * EK;   // heavy normals step in
    if (t >= S && t < S + A && !d.pHas) {
      // the move's hitbox (scaled), against each foe's body
      const a0 = D.MvHbX[mv] * EK, a1 = (D.MvHbX[mv] + D.MvHbW[mv]) * EK;
      const x0 = dir > 0 ? p.x + a0 : p.x - a1, x1 = dir > 0 ? p.x + a1 : p.x - a0;
      const cy = p.y + (D.MvHbY[mv] + D.MvHbH[mv] / 2) * EK;
      for (const o of live) {
        if (o.down > 0 || o.e.x + 4 < x0 || o.e.x - 4 > x1) continue;
        d.pHas = true;
        engHit(d, p, o, mv, (Math.max(x0, o.e.x - 4) + Math.min(x1, o.e.x + 4)) / 2, cy);
      }
    }
    d.pAtk++;
    if (d.pAtk >= S + A + R) d.pAtk = -1;
    return;
  }
  const b = K.isPressed(K.BTN_LP) ? 0 : K.isPressed(K.BTN_HP) ? 1 : K.isPressed(K.BTN_LK) ? 2 : K.isPressed(K.BTN_HK) ? 3 : -1;
  if (b >= 0) {
    let mv = [em.lp, em.hp, em.lk, em.hk][b];
    for (const k of ["super", "sp2", "sp1"]) {           // the engine reads the super first
      const m = em[k], cmd = D.MvCmd[m];
      if (!cmd || (cmd.endsWith("P") ? b > 1 : b < 2)) continue;
      const sup = k === "super";
      if (!entered(d.hist, cmd.slice(0, -1), sup ? 20 : 12)) continue;
      if (sup ? d.pG < 100 : d.pNg < D.MvCost[m]) { if (!sup) d.ngFlash = 20; continue; }
      mv = m;
      if (sup) { d.pG = 0; mHitStop = 12; d.dark = 12; } else d.pNg -= D.MvCost[m];   // the super freeze
      break;
    }
    d.emv = mv; d.pAtk = 0; d.pHas = false;
    return;
  }
  if (L || Rt) {
    const dir = Rt ? 1 : -1, n = live.reduce<Foe | null>((q, o) => (!q || Math.abs(o.e.x - p.x) < Math.abs(q.e.x - p.x) ? o : q), null);
    const back = !!n && (n.e.x - p.x) * dir < 0;
    const blockedBy = live.some((o) => (o.e.x - p.x) * dir > 0 && Math.abs(o.e.x - p.x) < 8 && o.down === 0);
    if (!blockedBy) { p.vx = dir * 2 * EK * (back ? 0.75 : 1); p.x += p.vx; if (p.st !== ST_WALK) setSt(p, ST_WALK); else p.t++; }
    else { p.vx = 0; if (p.st !== ST_IDLE) setSt(p, ST_IDLE); }
  } else { p.vx = 0; if (p.st !== ST_IDLE) setSt(p, ST_IDLE); }
}

/** The engine's applyAttack, on a field foe. */
function engHit(d: Duel, p: Ent, o: Foe, mv: number, cx: number, cy: number): void {
  const f = o.e, dir = f.x >= p.x ? 1 : -1, special = D.MvType[mv] !== MT_NORMAL, heavy = D.MvDamage[mv] >= 80;
  let push = heavy ? 2.2 : 0.8;
  if (D.MvType[mv] === MT_SUPER_QUAKE) push = 3.5;
  const unblock = D.MvLevel[mv] === LV_UNBLOCK;
  const blocked = !unblock && o.atk < 0 && d.block > 0 && Math.random() < d.block * DIFF.block[mDiff];
  if (blocked) {
    o.hit = D.MvBlockstun[mv]; o.vx = dir * push * 0.8 * EK;
    if (special) f.hp -= Math.trunc(D.MvDamage[mv] / 4);
    d.pG = Math.min(100, d.pG + 1.5);
    showPose(f, frame(f, ["guard", "lower"]));
    FX.spawn(cx - camX, cy, FX.FX_BLOCK);
    mHitStop = 2;
    return;
  }
  const counter = o.atk >= 0 && o.atk < foeWind(o);
  o.combo++;
  let dmg = D.MvDamage[mv];
  if (o.combo >= 3) dmg *= Math.max(0.3, 1 - 0.12 * (o.combo - 2));   // combo scaling
  if (counter) dmg *= 1.25;
  f.hp -= Math.floor(dmg + 0.5);
  let stun = D.MvHitstun[mv];
  if (o.combo >= 4) { stun = Math.max(2, stun - Math.floor((o.combo - 3) * 1.5)); push *= 1 + 0.2 * (o.combo - 3); }
  if (counter) stun += 4;
  const ko = f.hp <= 0, kd = D.MvKD[mv] || ko;
  o.atk = -1; o.mv = null; o.vx = dir * push * EK; f.flash = 2;
  if (kd) { o.down = 1; o.hit = 0; f.vy = -3.5 * EK; f.y -= 1; setPose(f, "lie"); }
  else { o.hit = stun; showPose(f, frame(f, ["hit", "walk_1"])); }
  d.pG = Math.min(100, d.pG + 5);                         // +50 of 1000
  d.foe = f; d.hits++;
  FX.spawnHit(cx - camX, cy, heavy || counter, p.look[0]);
  mHitStop = heavy || counter ? 4 : 3;
  if (unblock) { mHitStop = 8; d.dark = 8; d.slow = 24; }  // 벽력권: the impact darkens and slows the world
  if (ko) mHitStop = 10;
}

/** The engine's 청풍진천 shock waves (drawQuake), at field scale. */
function drawQuakeField(p: Ent, mv: number, t: number): void {
  t -= D.MvStartup[mv];
  if (t < 0 || t > D.MvActive[mv] + 8) return;
  const gx = Math.round(p.x - camX), gy = Math.round(p.y);
  for (let k = 0; k <= 2; k++) {
    const rad = Math.round(((t - k * 2) * 6 + 6) * EK);
    if (rad <= 4 || rad >= 47) continue;
    const h = Math.max(2, Math.round((13 - Math.trunc(rad / EK / 7) - k * 2) * EK));
    const ink = k === 0 ? RGB(236, 248, 255) : k === 1 ? RGB(120, 196, 255) : RGB(50, 110, 220);
    for (let s = -1; s <= 1; s += 2) {
      R.fillRect(gx + s * rad - 1, gy - h, 3, h, ink);
      R.fillRect(gx + s * (rad - 3) - 1, gy - Math.trunc(h / 2) - 1, 2, Math.trunc(h / 2) + 1, RGB(50, 110, 220));
      if (k === 0) R.fillRect(s < 0 ? gx - rad : gx, gy - 1, rad, 1, RGB(120, 196, 255));
    }
  }
}

function duelTick(): void {
  const d = duel!, p = player()!;
  if (d.dark > 0) d.dark--;
  if (d.slow > 0) { d.slow--; if (d.slow % 2 === 1) return; }   // slow motion: every other tick
  d.t++;
  if (d.ko > 0) {                                         // the player is down: lie there, then the bout starts over
    d.ko++;
    showPose(p, frame(p, ["down", "hit"]));
    for (const o of alive(d)) if (o.e.st !== ST_IDLE) setSt(o.e, ST_IDLE);
    if (d.ko === 40) { mNotice = "쓰러졌다… 다시 한 번"; mNoticeT = 60; }
    if (d.ko >= 100) resetBout(d, p);
    return;
  }
  const live = alive(d);
  const near = (from: number) => live.reduce<Foe | null>((b, o) => (!b || Math.abs(o.e.x - from) < Math.abs(b.e.x - from) ? o : b), null);
  const L = K.isDown(K.BTN_LEFT), Rt = K.isDown(K.BTN_RIGHT);
  // facing: toward the stick when it is held (several foes can stand on both sides), else toward the nearest foe
  if (d.pAtk < 0 && d.pHit <= 0) {
    if (live.length > 1 && (L || Rt)) p.face = Rt ? 1 : -1;
    else { const n = near(p.x); if (n) p.face = n.e.x > p.x ? 1 : -1; }
  }
  if (d.hpMode) {
    if (!d.eng) d.pNg = Math.min(1000, d.pNg + 6);
    d.hist.push(stickDir(p.face)); if (d.hist.length > 40) d.hist.shift();
    if (d.ngFlash > 0) d.ngFlash--;
  }
  // --- the player
  if (d.eng) engPlayer(d, p, live, L, Rt);
  else if (d.pHit > 0) { d.pHit--; showPose(p, frame(p, ["hit", "stand", "block"])); }
  else if (d.pAtk >= 0) {
    d.pAtk++;
    const mv = d.mv, dir = p.face;
    const alt = mv.name === "hvy" ? "atk" : mv.name === "hkick" ? "kick" : mv.name;
    showPose(p, frame(p, d.pAtk < mv.wind ? [mv.name + "_0", alt + "_0", ...ATK0] : [mv.name + "_1", alt + "_1", ...ATK1]));
    const ahead = near(p.x + dir * 30);
    if (mv.dash && d.pAtk < mv.wind && !(ahead && (ahead.e.x - p.x) * dir > 0 && Math.abs(ahead.e.x - p.x) < 18)) p.x += dir * mv.dash / mv.wind;
    if (d.pAtk === mv.wind) {
      let any = false;
      for (const o of live) {
        const dx = o.e.x - p.x;
        if (Math.abs(dx) >= mv.reach || (mv.kind !== "slam" && dx * dir < -4)) continue;
        const hd = dx >= 0 ? 1 : -1;
        any = true;
        FX.spawnHit(o.e.x - camX - hd * 4, o.e.y - 14, mv.stop >= 5, p.look[0].replace("sd_", "").split(":")[0]);
        mHitStop = mv.stop;
        const blocked = d.guard || (!mv.breaks && !mv.ult && d.hpMode && o.atk < 0 && Math.random() < d.block * DIFF.block[mDiff]);
        land(d, p, o.e, mv, mv.dmg, hd, blocked, true, o);
        if (!blocked) { d.hits++; o.hit = 8 + mv.stop; o.atk = -1; o.mv = null; } else o.hit = 6;
        d.foe = o.e;
        if (d.hpMode && o.e.hp <= 0 && d.foes.length > 1) {   // one of several goes down where it stands
          o.out = true; o.e.hp = 0; setPose(o.e, "lie"); o.e.air = true; o.e.vy = -2; o.e.vx = hd * 1.2; o.e.flash = 3;
        }
      }
      if (any && mv.stop >= 5) mShake = Math.max(mShake, 5);
      if (!any && mv.kind === "slam") land(d, p, p, mv, 0, dir, true, true, null);   // the shock waves show even on a miss
    }
    if (d.pAtk >= mv.len) d.pAtk = -1;
  } else {
    const b = K.isPressed(K.BTN_LP) ? 0 : K.isPressed(K.BTN_HP) ? 1 : K.isPressed(K.BTN_LK) ? 2 : K.isPressed(K.BTN_HK) ? 3 : -1;
    if (b >= 0) {
      let mv = MOVES[b];
      const mine = SKILLS[p.kit.base ?? p.look[0]];
      if (d.hpMode && mine && b <= 1) for (const s of mine) {
        if (!entered(d.hist, s.cmd!, s.ult ? 30 : 16)) continue;
        if (s.ult ? d.pG < 100 : d.pNg < s.cost!) { if (!s.ult) d.ngFlash = 20; continue; }
        mv = s;
        if (s.ult) { d.pG = 0; mHitStop = 10; mFlash = 3; } else d.pNg -= s.cost!;
        break;
      }
      d.mv = mv; d.pAtk = 0;
    } else if (L || Rt) {
      const dir = Rt ? 1 : -1, blockedBy = live.some((o) => (o.e.x - p.x) * dir > 0 && Math.abs(o.e.x - p.x) < 20);
      if (!blockedBy) { p.vx = dir * 1.6; p.x += p.vx; if (p.st !== ST_WALK) setSt(p, ST_WALK); else p.t++; }
      else { p.vx = 0; if (p.st !== ST_IDLE) setSt(p, ST_IDLE); }
    } else { p.vx = 0; if (p.st !== ST_IDLE) setSt(p, ST_IDLE); }
  }
  // --- the foes: each closes in on its side (the nearest one on a side fights, the others wait a step behind),
  // winds up, strikes; bosses use their skills, underlings a powered-up blow
  for (const o of alive(d)) {
    const f = o.e, dist = Math.abs(f.x - p.x), toP = p.x > f.x ? 1 : -1;
    const boss = SKILLS[f.kit.base ?? f.look[0]];
    if (d.hpMode) o.ng = Math.min(1000, o.ng + (boss ? 5 : 4));
    if (o.down > 0) {                                     // knocked down: thrown back, lies, gets up (or stays down, beaten)
      o.down++;
      if (f.y < GROUND || f.vy < 0) { f.vy += GRAV * EK; f.y += f.vy; f.x += o.vx; if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; o.vx = 0; o.down = 2; } }
      else if (f.hp <= 0) { o.out = true; f.hp = 0; }
      else if (o.down > 2 + 16 + 4) { o.down = 0; o.combo = 0; o.cool = 20; setSt(f, ST_IDLE); }   // DOWN_LIE_TICKS + GETUP_TICKS
      continue;
    }
    if (o.hit > 0) { o.hit--; f.x += o.vx; o.vx *= 0.7; continue; }
    o.combo = 0;
    if (o.atk < 0) f.face = toP;
    if (o.atk >= 0) {
      o.atk++;
      const mv = o.mv, w = mv ? Math.round(mv.wind * DIFF.wind[mDiff] / 10) : d.hpMode ? DIFF.wind[mDiff] : 10;
      showPose(f, frame(f, o.atk < w ? [(mv ? mv.name : o.bn) + "_0", ...ATK0] : [(mv ? mv.name : o.bn) + "_1", ...ATK1]));
      if (mv?.dash && o.atk < w && dist > 18) f.x += toP * mv.dash / w;
      if (d.eng && o.atk === w && Math.abs(f.x - p.x) < (mv ? 22 : 18) && d.ko === 0) {   // a sword cut: about the reach of muyeong's slash, scaled
        // against an engine fighter: the blow stuns, pushes and can be guarded (holding away from this foe)
        const heavy = !!mv, away = (p.x - f.x) * (K.isDown(K.BTN_RIGHT) ? 1 : K.isDown(K.BTN_LEFT) ? -1 : 0) > 0;
        const guard = away && d.pAtk < 0 && d.pHit <= 0;
        const base = mv ? d.dmg * 1.8 : d.dmg, push = (heavy ? 2.2 : 1.2) * EK;
        if (guard) {
          d.pHit = d.pGuard = heavy ? 10 : 8; d.pVx = toP * push * 0.8;
          if (heavy) p.hp -= Math.trunc(base * DIFF.dmg[mDiff] / 4);
          FX.spawn(p.x - camX - toP * 4, p.y - 14, FX.FX_BLOCK); mHitStop = 2;
          d.pG = Math.min(100, d.pG + 1); o.g = Math.min(100, o.g + 1.5);
        } else {
          d.pAtk = -1; d.pHit = heavy ? 16 : 12; d.pGuard = 0; d.pVx = toP * push; p.flash = 2;
          p.hp -= Math.max(1, Math.round(base * DIFF.dmg[mDiff]));
          FX.spawnHit(p.x - camX - toP * 4, p.y - 14, heavy, "");
          if (mv) land(d, f, p, mv, 0, toP, false, false, o);
          mHitStop = heavy ? 4 : 3;
          d.pG = Math.min(100, d.pG + 2.5); o.g = Math.min(100, o.g + 5);
          if (p.hp <= 0) { p.hp = 0; d.ko = 1; mShake = 6; o.atk = -1; o.mv = null; mHitStop = 10; return; }
        }
      } else if (!d.eng && o.atk === w && Math.abs(f.x - p.x) < (mv ? mv.reach : 30) && d.pAtk < 0 && d.ko === 0) {
        FX.spawnHit(p.x - camX - toP * 4, p.y - 14, !!mv, mv && boss ? "heukrim" : "");
        d.pHit = mv ? 14 : 10; p.flash = 2;
        const base = mv ? (mv.kind === "power" ? d.dmg * 1.8 : mv.dmg) : d.dmg;
        if (mv) { mHitStop = mv.stop; land(d, f, p, mv, 0, toP, false, false, o); }
        else { p.x += toP * 6; if (d.hpMode) { o.g = Math.min(100, o.g + 9); d.pG = Math.min(100, d.pG + 7); } }
        if (d.hpMode) {
          p.hp -= Math.max(1, Math.round(base * DIFF.dmg[mDiff]));
          if (p.hp <= 0) { p.hp = 0; d.ko = 1; mShake = 6; o.atk = -1; o.mv = null; d.pAtk = -1; return; }
        }
      } else if (o.atk === w && mv && (mv.kind === "bomb" || mv.kind === "bind")) land(d, f, p, mv, 0, toP, true, false, o);
      if (o.atk >= (mv ? mv.len : w + 6)) { o.atk = -1; o.mv = null; o.cool = Math.round((34 + Math.floor(Math.random() * 30)) * (d.hpMode ? DIFF.cool[mDiff] : 1)); }
      continue;
    }
    if (o.cool > 0) o.cool--;
    // its place: on its side of the player, behind any nearer foe on that side
    const side = o.side, rank = alive(d).filter((q) => q !== o && q.down === 0 && q.side === side && Math.abs(q.e.x - p.x) < dist).length;
    const want = d.eng ? 12 + rank * 16 : 22 + rank * 18;   // engine scale: bodies 12 apart (halfW 6 + 6), at reach
    const goal = p.x + side * want;
    const front = rank === 0;
    // a skill from where it stands (bosses: the smoke bomb from afar, the ultimate when the gauge is full)
    let s: DuelMove | null = null;
    if (d.hpMode && o.cool <= 0 && front) {
      if (boss) {
        const ult = boss.find((q) => q.ult);
        if (ult && o.g >= 100 && dist < ult.reach) s = ult;
        else {
          const r = Math.random() * 100 / DIFF.skill[mDiff];
          for (const q of boss) if (!q.ult && o.ng >= q.cost! && dist < q.reach && (q.kind === "bomb" ? dist > 40 && r < 2 : dist <= 24 && r < 40)) { s = q; break; }
        }
      } else if (o.ng >= POWER.cost! && dist <= (d.eng ? 16 : 24) && Math.random() < 0.5 * DIFF.skill[mDiff]) s = POWER;
    }
    if (s) {
      o.mv = s; o.atk = 0;
      if (s.ult) { o.g = 0; mHitStop = 10; mFlash = 3; } else o.ng -= s.cost!;
    } else if (Math.abs(f.x - goal) > (d.eng ? 1.5 : 3)) {
      const step = Math.sign(goal - f.x) * (Math.abs(goal - f.x) > 30 ? 1.2 : 0.7);   // hurry round to its side, then edge in
      f.x += step; f.face = toP;
      if (f.st !== ST_WALK) setSt(f, ST_WALK); else f.t++;
    } else if (front && o.cool <= 0 && dist <= (d.eng ? 16 : 26)) { o.mv = null; o.atk = 0; o.bn = hasSprite((f.kit.base ?? f.look[0]) + ".kick_0") && Math.random() < 0.4 ? "kick" : "atk"; }
    else if (f.st !== ST_IDLE) setSt(f, ST_IDLE);
  }
  if (map) { p.x = Math.max(6, Math.min(map.w - 6, p.x)); for (const o of d.foes) o.e.x = Math.max(6, Math.min(map.w - 6, o.e.x)); }
  // --- the end: every foe down (health), enough hits (the foe falls back), or the time is up (the scene decides what happens)
  const left = alive(d).filter((o) => o.e.hp > 0 || !d.hpMode);
  if ((d.hpMode && left.length === 0) || (!d.hpMode && d.need && d.hits >= d.need) || (d.time && d.t >= d.time)) {
    duel = null; quest = null; questText = ""; if (d.hpMode) mCarryG = d.pG;
    if (d.foes.length === 1) {
      const f = d.foes[0].e;
      setSt(f, ST_IDLE); f.face = p.x > f.x ? 1 : -1;
      if (!d.hpMode && d.need) { f.goal = f.x - f.face * 28; f.spd = 1.2; }   // a sparring foe steps back; a beaten one stays put
    }
    setSt(p, ST_IDLE); p.vx = 0;
    mStep++; run();
  }
}
export function debugGauge(foe = false): void { if (duel) { if (foe) for (const o of duel.foes) o.g = 100; else duel.pG = 100; } }

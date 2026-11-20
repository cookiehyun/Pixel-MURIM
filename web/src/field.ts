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
import { D, animId, animFrame, spriteId, hasSprite, MT_RUSH } from "./data";
import * as FM from "./fieldmap";
import { RGB } from "./util";

export type Look = [string, number, string];
export type Step = Record<string, unknown> & { t: string };
export interface Host {
  events(sec: string, a: number, b: number): string[][];   // dialogue / cuts of the chapter's script
  look(name: string): Look | null;
  clue(text: string): void;
  fight(o?: { opp: string[]; stage?: string; variant?: string }): void;   // the chapter's boss fight, or an encounter (calls afterFight)
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
  hostile: boolean; goal: number | null; run: boolean; spd: number; follow: string; gap: number; pose: number;
  cool: number; windup: number; inv: number; kills: boolean; small: boolean;
}

let ents: Ent[] = [];
const ent = (id: string) => ents.find((e) => e.id === id);
const player = () => ent("player")!;

function spawn(id: string, look: Look, x: number, face: number): Ent {
  const e: Ent = { id, look, kit: kit(look[0]), x, y: GROUND, vx: 0, vy: 0, face, st: ST_IDLE, t: 0, mv: -1, hitDone: false,
    hp: 160, maxHp: 160, stun: 0, hostile: false, goal: null, run: false, spd: 0, follow: "", gap: 14, pose: -1, cool: 30, windup: 0,
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
let mActive = false, mSnap = false, mFlash = 0;

export const active = () => mActive;

export function begin(h: Host, play: Step[]): void {
  host = h; steps = play; mStep = 0; mWait = 0; mTick = 0; ents = []; quest = null; control = false; queue = []; page = [];
  camTarget = "player"; camFixed = null; mFallen = 0; mCheck = null; mActive = true;
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
      const name = String(s.map);
      if (!mapCache.has(name)) mapCache.set(name, MAPS[name]());
      map = mapCache.get(name)!;
      ents = []; mSnap = true;                     // a new place: nobody carried over, the camera jumps
      return true;
    }
    case "spawn": {
      const e = spawn(String(s.id), lookOf(s.look), Number(s.x), Number(s.face ?? 1));
      if (s.pose) setPose(e, String(s.pose));
      if (s.hp) e.hp = e.maxHp = Number(s.hp);
      return true;
    }
    case "pose": { const e = ent(String(s.id)); if (e) setPose(e, String(s.pose)); return true; }
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
    case "wait": mWait = Number(s.n); return false;
    case "flash": mFlash = Number(s.n ?? 8); return true;
    case "ev": queue.push(...host!.events(String(s.sec), Number(s.a), Number(s.b ?? s.a))); nextLine(); return false;
    case "say": queue.push(["say", String(s.who), String(s.text), String(s.dir ?? "")]); nextLine(); return false;
    case "clue": host!.clue(String(s.text)); queue.push(["clue", String(s.text)]); nextLine(); return false;
    case "hostile": for (const id of s.ids as string[]) { const e = ent(id); if (e) { e.hostile = true; e.cool = 20 + Math.floor(Math.random() * 30); e.goal = null; } } return true;
    case "quest": {
      quest = s; questText = String(s.text); control = true;
      if (s.goal === "kill") mCheck = { ents: ents.map((e) => ({ ...e })), step: mStep };
      return false;
    }
    case "fight": control = false; host!.fight(s.opp ? { opp: s.opp as string[], stage: s.stage as string | undefined, variant: s.variant as string | undefined } : undefined); return false;
    case "end": mActive = false; host!.done(); return false;
    case "cutscene": mActive = false; host!.cutscene(String(s.sec), Number(s.a)); return false;
  }
  return true;
}

function setPose(e: Ent, p: string): void {
  if (p === "idle") { setSt(e, ST_IDLE); return; }
  const k = e.kit;
  const base = k.base ?? e.look[0];
  const id = p === "down" ? k.down1 : p === "crouch" ? k.crouch : p === "hit" ? k.hit : hasSprite(base + "." + p) ? spriteId(base + "." + p) : -1;
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
  shown += 2;
  if (!K.isPressed(K.BTN_LP)) return;
  if (shown < pageLen()) { shown = 9999; return; }
  if (pageAt + 3 < page.length) { pageAt += 3; shown = 0; return; }
  nextLine();
  if (!talking()) { mStep++; run(); }
}

// ---------------------------------------------------------------- tick

const puffs: { x: number; y: number; t: number }[] = [];

export function tick(): void {
  mTick++;
  if (mNoticeT > 0) mNoticeT--;
  if (mHitStop > 0) { mHitStop--; FX.update(); return; }
  if (talking()) dialogueTick();
  else if (mWait > 0) { mWait--; if (mWait === 0) { mStep++; run(); } }

  const p = player();
  if (control && !talking() && p) playerInput(p);
  for (const e of ents) think(e);
  for (const e of ents) physics(e);
  combat();
  for (let k = puffs.length - 1; k >= 0; k--) if (++puffs[k].t > 30) puffs.splice(k, 1);
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
  if (map) e.x = Math.max(6, Math.min(map.w - 6, e.x));
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
  if (!map) return;
  FM.drawBack(map, camX, mTick);
  const order = ents.slice().sort((a, b) => (a.small ? 1 : 0) - (b.small ? 1 : 0) || (a.id === "player" ? 1 : 0) - (b.id === "player" ? 1 : 0));
  for (const e of order) {
    if (e.st === ST_DEAD && e.t > 10 && Math.trunc(e.t / 3) % 2 === 0) continue;
    if (e.id === "player" && e.inv > 0 && mTick % 2 === 0 && e.st !== ST_DOWN) continue;
    const id = sprite(e, mTick);
    if (id < 0) continue;
    const x = Math.round(e.x - camX), y = Math.round(e.y);
    R.drawSprite(id, x, y, e.face < 0, -1, e.look[1] | (e.st === ST_DEAD ? SKIN_DIM : 0));
  }
  for (const pf of puffs) for (let k = 0; k < 5; k++) R.shadeCircle((pf.x - camX + (k - 2) * 5) * PX, (pf.y - pf.t * 0.3 - (k % 2) * 4) * PX, (5 + pf.t * 0.4) * PX, RGB(70, 66, 76), 0.5 * (1 - pf.t / 30));
  FX.draw();
  FM.drawFront(map, camX, mTick);
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
  if (mFlash > 0) { R.shadeRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(250, 248, 255), Math.min(1, mFlash / 6)); mFlash--; }
  hud();
  if (talking()) dialogueRender();
  if (mNoticeT > 0) { R.shadeRect(0, 132, R.PHYS_W, 36, RGB(14, 11, 22), 0.9); KF.draw(mNotice, R.PHYS_W / 2, 140, RGB(240, 196, 96), 2, 1); }
}

function hud(): void {
  const p = player();
  if (!p) return;
  if ((control || quest) && p.kit.moves.length) {
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
  if (shown >= pageLen() && Math.trunc(mTick / 6) % 2 === 0) KF.draw("▼", R.PHYS_W - 34, BY + BH - 24, RGB(240, 196, 96), 2);
}

export const debug = () => JSON.stringify({ cam: Math.round(camX), step: mStep, t: steps[mStep]?.t, quest: questText, talk: talking(), page: page[0] ?? "", ents: ents.map((e) => e.id + ":" + Math.round(e.x) + ":" + e.st + ":" + e.hp) });
export function debugKill(): void { for (const e of ents) if (e.hostile) { e.hp = 0; setSt(e, ST_DEAD); e.t = 99; } }
export function debugWarp(x: number): void { const p = player(); if (p) p.x = x; }

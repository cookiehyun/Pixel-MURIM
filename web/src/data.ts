// Port of Data.bas: loads the shared text data (sprites, stages, moves) that the Excel version uses.
import { RGB } from "./util";

export type LocalBox = [number, number, number, number];
export type Grade = "high" | "mid" | "low";
export interface StrikeWindow {
  from: number; until?: number; pose?: string; group: string; grade: Grade;
  guard: "standing" | "crouching" | "either"; boxes: LocalBox[];
}
// Counts of occupied 60 Hz frames. Input is frame 1, active starts at startup+1.
export interface MoveFrames { startup: number; active: number; recovery: number }
export interface CombatProfile {
  frames?: Record<string, MoveFrames>;
  cancelOn?: Record<string, ("guard" | "hit")[]>;
  shapes: Record<string, Record<string,LocalBox>>; poses: Record<string, string>;
  moves: Record<string, StrikeWindow[]>; evades: Record<string, Grade[]>;
}
export let profiles: Record<string, CombatProfile> = {};

export const D = {
  SprCount: 0,
  SprW: [] as number[], SprH: [] as number[], SprAX: [] as number[], SprAY: [] as number[], SprOff: [] as number[],
  SprName: [] as string[],
  SprHi: [] as boolean[],               // hi-res art (PNG): drawn at the doubled screen resolution
  SprHiS: [] as number[],               // screen pixels per art pixel for hi-res art (0 = HI; 3 = SD fighter art at the classic size)
  SprFx: [] as number[],                // effect pixels lifted from the classic frame an SD fighter frame replaced (-1 = none)
  SprPix: [] as number[],
  AnimCount: 0,
  AnimTPF: [] as number[], AnimStart: [] as number[], AnimLen: [] as number[], AnimFrames: [] as number[],
  StageW: 0, StageH: 0, StageCount: 0,
  StagePix: [] as Int32Array[],          // per stage: x + y * StageW
  StageName: [] as string[],
  MvCount: 0,
  MvKind: [] as number[], MvStartup: [] as number[], MvActive: [] as number[], MvRecovery: [] as number[],
  MvDamage: [] as number[], MvHitstun: [] as number[], MvBlockstun: [] as number[], MvLevel: [] as number[], MvKD: [] as boolean[],
  MvHbX: [] as number[], MvHbY: [] as number[], MvHbW: [] as number[], MvHbH: [] as number[],
  MvSprS: [] as number[], MvSprA: [] as number[],
  MvType: [] as number[], MvP1: [] as number[], MvP2: [] as number[], MvCmd: [] as string[],
  MvCost: [] as number[],
  MvSeqPre: [] as number[], MvSeqAct: [] as number[], MvSeqRec: [] as number[],
};

export const MK_STAND = 0, MK_CROUCH = 1, MK_AIR = 2;
export const LV_HIGH = 0, LV_LOW = 1, LV_OVERHEAD = 2, LV_UNBLOCK = 3;
export const MT_NORMAL = 0, MT_THROW = 1, MT_PROJ = 2, MT_RISE = 3, MT_RUSH = 4, MT_GRAB = 5, MT_SUPER_PROJ = 6,
  MT_SUPER_GRAB = 7, MT_SUPER_RUSH = 8, MT_TELEPORT = 9, MT_SUPER_TELE = 10, MT_PROJ_BOOM = 11, MT_SUPER_FIRE = 12,
  MT_SUPER_QUAKE = 13, MT_STANCE = 14, MT_RAGE = 15, MT_SUPER_RIFT = 16, MT_SUPER_CRASH = 17, MT_COUNTER = 18;

const sprIdx = new Map<string, number>();
const animIdx = new Map<string, number>();
const moveIdx = new Map<string, number>();
let frameNames: string[] = [];
let mvKey: string[] = [];
const files = new Map<string, string[]>();

async function fetchLines(name: string): Promise<string[]> {
  const r = await fetch(name);
  if (!r.ok) throw new Error("File not found: " + name);
  return (await r.text()).replace(/\r/g, "").split("\n");
}

function hexColor(hx: string): number {
  return RGB(parseInt(hx.slice(0, 2), 16), parseInt(hx.slice(2, 4), 16), parseInt(hx.slice(4, 6), 16));
}

const SPRITE_FILES = ["danwoo", "cheolsan", "muyeong", "seolhwa", "heukrim", "heukrimsw", "cheolsanrg", "hongryeon", "cheonma", "cheonmasw", "hyeolma", "baekmujin", "fx", "npc", "danwoo_chp"];
const STAGES = ["sanmun", "MOUNTAIN GATE", "bamboo", "BAMBOO FOREST", "inn", "NIGHT INN", "snow", "SNOW PEAK", "waterfall", "WATERFALL"];

export async function loadAll(): Promise<void> {
  const names = [...SPRITE_FILES.map((f) => f + ".txt"), ...STAGES.filter((_, i) => i % 2 === 0).map((s) => "stage_" + s + ".txt"), "moves.txt"];
  const [texts, profileData] = await Promise.all([
    Promise.all(names.map(fetchLines)), fetchLines("combat-profiles.json")
  ]);
  profiles = JSON.parse(profileData.join(" "));
  names.forEach((n, i) => files.set(n, texts[i]));
  for (const f of SPRITE_FILES) loadSpriteFile(f);
  D.StageCount = STAGES.length / 2;
  for (let k = 0; k < D.StageCount; k++) {
    D.StageName[k] = STAGES[k * 2 + 1];
    loadStageFile("stage_" + STAGES[k * 2], k);
  }
  await loadHiSprites();
  buildSdFighters();
  loadMoves();
  for (let k = 0; k < frameNames.length; k++) D.AnimFrames[k] = spriteId(frameNames[k]);
  for (let k = 0; k < D.MvCount; k++) {
    D.MvSeqPre[k] = optAnim(mvKey[k] + "_pre");
    D.MvSeqAct[k] = optAnim(mvKey[k] + "_seq");
    D.MvSeqRec[k] = optAnim(mvKey[k] + "_rec");
  }
}

const sprOwnArt = new Set<number>();          // SD fighter frames drawn for their own sprite set (not borrowed through @alias)
// colours that classic fighter art uses only for effects
const FX_COLORS: Record<string, number[]> = {
  danwoo: [RGB(0xd8, 0xec, 0xff), RGB(0x8f, 0xc0, 0xee), RGB(0xb8, 0xa4, 0x86), RGB(0xd8, 0xcc, 0xb4)],
  heukrim: [RGB(0xc8, 0xff, 0xb0), RGB(0x6a, 0xd0, 0x60)],
  heukrimsw: [RGB(0xc8, 0xff, 0xb0), RGB(0x6a, 0xd0, 0x60), RGB(0xdc, 0xe4, 0xec), RGB(0xff, 0xff, 0xff), RGB(0xb8, 0x9a, 0x50)],   // the drawn blade
  "heukrimsw:own": [RGB(0xc8, 0xff, 0xb0), RGB(0x6a, 0xd0, 0x60)],                                                                  // its own SD frames hold the blade
  cheonma: [RGB(0xe4, 0xd8, 0xff), RGB(0x8a, 0x60, 0xd0)],
  hyeolma: [RGB(0xff, 0xc8, 0xb8), RGB(0xe0, 0x50, 0x3a)],
  baekmujin: [RGB(0xff, 0xf8, 0xe0), RGB(0xd8, 0xb8, 0x60)],   // white and gold sword light
  cheonmasw: [RGB(0xe4, 0xd8, 0xff), RGB(0x8a, 0x60, 0xd0), RGB(0xc4, 0xb4, 0xec), RGB(0xf0, 0xe8, 0xff)],   // the drawn blade
  "cheonmasw:own": [RGB(0xe4, 0xd8, 0xff), RGB(0x8a, 0x60, 0xd0)],                                         // its own SD frames hold the blade
  hongryeon: [RGB(0xff, 0xd8, 0xd0), RGB(0xf0, 0x70, 0x60)],
  seolhwa: [RGB(0xff, 0xe0, 0xec), RGB(0xf6, 0xa8, 0xc4)],
  muyeong: [RGB(0xe8, 0xf2, 0xfa), RGB(0xa9, 0xc4, 0xdc)],
  cheolsan: [RGB(0xee, 0xf2, 0xf8), RGB(0xb8, 0xc4, 0xd4), RGB(0xb8, 0xa4, 0x86), RGB(0xd8, 0xcc, 0xb4)],
};
function liftEffects(id: number, ch: string): number {
  const own = (D.SprName[id] ?? "") && sprOwnArt.has(id);   // SD art drawn for this set: lift only its trail, not the old blade
  const cols = (own && FX_COLORS[ch + ":own"]) || FX_COLORS[ch];
  if (!cols || D.SprW[id] === undefined) return -1;
  const w = D.SprW[id], h = D.SprH[id], off = D.SprOff[id];
  const px: number[] = [];
  let any = false;
  for (let k = 0; k < w * h; k++) { const c = D.SprPix[off + k]; const fx = cols.includes(c); px.push(fx ? c : -1); any ||= fx; }
  if (!any) return -1;
  const nid = D.SprCount++;
  D.SprName[nid] = D.SprName[id] + "__fx"; D.SprW[nid] = w; D.SprH[nid] = h; D.SprAX[nid] = D.SprAX[id]; D.SprAY[nid] = D.SprAY[id];
  D.SprHi[nid] = false; D.SprFx[nid] = -1; D.SprOff[nid] = D.SprPix.length;
  for (const c of px) D.SprPix.push(c);
  return nid;
}

/** data/hi/manifest.txt: PNG art that replaces classic sprites (missing manifest = none). */
async function loadHiSprites(): Promise<void> {
  let lines: string[];
  try { lines = await fetchLines("hi/manifest.txt"); } catch { return; }
  const cache = new Map<string, ImageData>();
  // download every picture at once (one by one was a round trip each: slow start on the web)
  const files = [...new Set(lines.map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 4 && p[0] !== "ANIM" && !p[0].startsWith("#")).map((p) => p[1]))];
  // most pictures come packed in a few atlas sheets (tools/hi_atlas.py): one download each instead of hundreds
  try {
    const at = (await fetchLines("hi/atlas.txt")).map((l) => l.trim().split(/\s+/)).filter((p) => p.length === 6);
    const sheets = [...new Set(at.map((p) => +p[1]))];
    const data = new Map<number, ImageData>();
    await Promise.all(sheets.map(async (n) => {
      const bmp = await createImageBitmap(await (await fetch(`hi/atlas_${n}.png`)).blob());
      const cv = document.createElement("canvas");
      cv.width = bmp.width; cv.height = bmp.height;
      const c2 = cv.getContext("2d")!;
      c2.drawImage(bmp, 0, 0);
      data.set(n, c2.getImageData(0, 0, bmp.width, bmp.height));
    }));
    for (const [f, n, x, y, w, h] of at) {
      const sheet = data.get(+n);
      if (!sheet) continue;
      const out = new ImageData(+w, +h), sw = sheet.width;
      for (let r = 0; r < +h; r++) {
        const from = ((+y + r) * sw + +x) * 4;
        out.data.set(sheet.data.subarray(from, from + +w * 4), r * +w * 4);
      }
      cache.set(f, out);
    }
  } catch { /* no atlas: every picture is fetched on its own */ }
  await Promise.all(files.filter((f) => !cache.has(f)).map(async (f) => {
    try {
      const bmp = await createImageBitmap(await (await fetch("hi/" + f)).blob());
      const cv = document.createElement("canvas");
      cv.width = bmp.width; cv.height = bmp.height;
      const c2 = cv.getContext("2d")!;
      c2.drawImage(bmp, 0, 0);
      cache.set(f, c2.getImageData(0, 0, bmp.width, bmp.height));
    } catch { /* a missing picture: that sprite stays classic */ }
  }));
  for (const ln of lines) {
    const p = ln.trim().split(/\s+/);
    if (p[0] === "ANIM" && p.length >= 4) {
      // ANIM <char.anim> <ticks per frame> <frames...>: replace (or add) an animation's frame list
      if (!animIdx.has(p[1])) animIdx.set(p[1], D.AnimCount++);
      const a = animIdx.get(p[1])!, pre = p[1].split(".")[0] + ".";
      D.AnimTPF[a] = +p[2];
      D.AnimStart[a] = frameNames.length;
      D.AnimLen[a] = p.length - 3;
      for (let k = 3; k < p.length; k++) frameNames.push(pre + p[k]);
      continue;
    }
    if (p.length < 4 || p[0].startsWith("#")) continue;
    const data = cache.get(p[1]);
    if (!data) continue;
    if (!sprIdx.has(p[0])) {                              // a new frame that classic art never had
      const nid = D.SprCount++;
      sprIdx.set(p[0], nid); D.SprName[nid] = p[0];
    }
    const id = sprIdx.get(p[0])!, w = data.width, h = data.height, breathe = p[4] === "breathe";
    if (p[4] === "fight") {
      if (p[1].startsWith("sd/" + p[0].split(".")[0] + "_f/")) sprOwnArt.add(id);
      // SD art replacing a classic fighter frame: drawn at the classic size; the classic frame's painted effects
      // (kick crescents, palm glow, dust) are kept as an overlay so the arcade looks the same
      D.SprHiS[id] = 3;
      D.SprFx[id] = D.SprHi[id] ? -1 : liftEffects(id, p[0].split(".")[0]);
    }
    D.SprW[id] = w; D.SprH[id] = h; D.SprAX[id] = +p[2]; D.SprAY[id] = +p[3]; D.SprHi[id] = true;
    D.SprOff[id] = D.SprPix.length;
    const cut = Math.trunc(h * 0.45);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sy = breathe && y <= cut ? y - 1 : y;          // upper body sinks one pixel
        const k = (x + Math.max(0, sy) * w) * 4, d = data.data;
        D.SprPix.push(sy < 0 || d[k + 3] < 128 ? -1 : RGB(d[k], d[k + 1], d[k + 2]));
      }
  }
}

function optAnim(nm: string): number {
  return animIdx.has(nm) ? animIdx.get(nm)! : -1;
}

export function hasAnim(nm: string): boolean { return animIdx.has(nm); }
export function hasSprite(nm: string): boolean { return sprIdx.has(nm); }
/** "char.move" of a move id. */
export const mvKeyOf = (id: number): string => mvKey[id] ?? "";

export function moveId(nm: string): number {
  const v = moveIdx.get(nm);
  if (v === undefined) throw new Error("Move not found: " + nm + " (data/moves.txt)");
  return v;
}
export function spriteId(nm: string): number {
  const v = sprIdx.get(nm);
  if (v === undefined) throw new Error("Sprite not found: " + nm);
  return v;
}
export function animId(nm: string): number {
  const v = animIdx.get(nm);
  if (v === undefined) throw new Error("Anim not found: " + nm);
  return v;
}

/** Sprite id at tick t, playing once and then holding the last frame. */
export function animFrameHold(a: number, t: number): number {
  let k = Math.trunc(t / D.AnimTPF[a]);
  if (k > D.AnimLen[a] - 1) k = D.AnimLen[a] - 1;
  if (k < 0) k = 0;
  return D.AnimFrames[D.AnimStart[a] + k];
}

/** Sprite id of the frame shown at tick t of a looping animation. */
export function animFrame(a: number, t: number, reverse = false): number {
  let k = Math.trunc(t / D.AnimTPF[a]) % D.AnimLen[a];
  if (reverse) k = D.AnimLen[a] - 1 - k;
  return D.AnimFrames[D.AnimStart[a] + k];
}

function loadSpriteFile(fileName: string): void {
  const lines = files.get(fileName + ".txt")!;
  const pal = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln || ln[0] === "#") continue;
    const p = ln.split(" ");
    if (p[0] === "PAL") pal.set(p[1], hexColor(p[2]));
    else if (p[0] === "SPRITE") {
      const w = +p[2], h = +p[3];
      const id = D.SprCount++;
      D.SprW[id] = w; D.SprH[id] = h; D.SprAX[id] = +p[4]; D.SprAY[id] = +p[5];
      D.SprOff[id] = D.SprPix.length; D.SprName[id] = fileName + "." + p[1];
      sprIdx.set(fileName + "." + p[1], id);
      for (let y = 0; y < h; y++) {
        const row = lines[++i];
        for (let x = 0; x < w; x++) {
          const c = pal.get(row[x]);
          D.SprPix.push(c === undefined ? -1 : c);
        }
      }
    } else if (p[0] === "ANIM") {
      const a = D.AnimCount++;
      D.AnimTPF[a] = +p[2];
      D.AnimStart[a] = frameNames.length;
      D.AnimLen[a] = p.length - 3;
      for (let k = 3; k < p.length; k++) frameNames.push(fileName + "." + p[k]);
      animIdx.set(fileName + "." + p[1], a);
    }
  }
}

function loadStageFile(fileName: string, idx: number): void {
  const lines = files.get(fileName + ".txt")!;
  const pal = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln || ln[0] === "#") continue;
    const p = ln.split(" ");
    if (p[0] === "PAL") pal.set(p[1], hexColor(p[2]));
    else if (p[0] === "STAGE") {
      D.StageW = +p[2]; D.StageH = +p[3];
      const pix = new Int32Array(D.StageW * D.StageH);
      for (let y = 0; y < D.StageH; y++) {
        const row = lines[++i];
        for (let x = 0; x < D.StageW; x++) pix[x + y * D.StageW] = pal.get(row[x]) ?? 0;
      }
      D.StagePix[idx] = pix;
    }
  }
}

// ---------------------------------------------------------------- SD fighters (story mode)
// The fight engine runs SD characters as ordinary fighters: every frame name the engine asks for
// (taken from a classic character's sprite list) points at the nearest SD frame. sd_danwoo also takes
// danwoo's move rows unchanged, so range, damage, stun and timing are the arcade's.
export const SD_FIGHTERS: Record<string, string> = { sd_danwoo: "danwoo", sd_heuksa: "danwoo" };   // SD prefix -> frame-name template
const SD_CLONES_MOVES: Record<string, string> = { sd_danwoo: "danwoo" };
const SD_NEAR: Record<string, string[]> = {
  idle: ["idle"], walk: ["walk"], crouch: ["crouch", "guard", "idle"], jump: ["jump", "kick_0", "idle"],
  lp: ["atk"], hp: ["hvy", "atk"], hp_p: ["atk_0"], lk: ["kick"], hk: ["hkick", "kick"], hk_p: ["kick_0"],
  clp: ["catk", "atk_1"], chp: ["chvy", "atk"], clk: ["ckick", "kick_1"], chk: ["chkick", "kick"], jp: ["jatk", "atk_1"], jk: ["jkick", "kick_1"],
  guard: ["guard", "idle"], cguard: ["cguard", "guard", "idle"], hit: ["hit"], chit: ["hit"], down: ["down", "hit"], roll: ["down"],
  throw: ["throw", "atk"], dash: ["walk_1", "idle"], bdash: ["walk_2", "idle"], dp: ["spin", "atk"], rush: ["palm", "atk"],
  sp: ["palm", "atk"], sp_a: ["palm_1", "atk_1"], ovh: ["ovh", "atk"], intro: ["idle"], win: ["idle"],
  palm: ["palm", "atk"], spin: ["spin", "atk"], spin_t: ["spin_0", "atk_0"], slam: ["slam", "atk"],
};
function sdFrame(sd: string, rest: string): number {
  const m = /^(.*?)(?:_(\d+))?$/.exec(rest)!, base = m[1], idx = m[2] === undefined ? -1 : +m[2];
  const cands = SD_NEAR[rest] ?? SD_NEAR[base] ?? [base];
  for (const c of cands) {
    if (/_\d+$/.test(c) && sprIdx.has(sd + "." + c)) return sprIdx.get(sd + "." + c)!;
    if (c === "walk" && idx >= 0 && sprIdx.has(sd + ".walk_" + (idx % 4))) return sprIdx.get(sd + ".walk_" + (idx % 4))!;
    if (idx >= 0 && sprIdx.has(sd + "." + c + "_" + Math.min(idx, 1))) return sprIdx.get(sd + "." + c + "_" + Math.min(idx, 1))!;
    if (idx < 0 && sprIdx.has(sd + "." + c + "_1")) return sprIdx.get(sd + "." + c + "_1")!;
    if (sprIdx.has(sd + "." + c)) return sprIdx.get(sd + "." + c)!;
  }
  return sprIdx.get(sd + ".idle")!;
}
function buildSdFighters(): void {
  for (const [sd, tpl] of Object.entries(SD_FIGHTERS)) {
    if (!sprIdx.has(sd + ".idle")) continue;                 // its art is not there
    for (let id = 0; id < D.SprCount; id++) {
      const nm = D.SprName[id];
      if (!nm || !nm.startsWith(tpl + ".")) continue;
      const rest = nm.slice(tpl.length + 1);
      if (!sprIdx.has(sd + "." + rest)) sprIdx.set(sd + "." + rest, sdFrame(sd, rest));
    }
    // the template's animations (idle, walk, move wind-ups ...) with the same frame names
    for (const [an, a] of [...animIdx.entries()]) {
      if (!an.startsWith(tpl + ".")) continue;
      const nm = sd + an.slice(tpl.length);
      if (animIdx.has(nm)) continue;
      if (!SD_CLONES_MOVES[sd] && /_(pre|seq|rec)$/.test(an)) continue;   // its own moves have their own frames
      animIdx.set(nm, D.AnimCount++);
      const b = animIdx.get(nm)!;
      D.AnimTPF[b] = D.AnimTPF[a]; D.AnimStart[b] = frameNames.length; D.AnimLen[b] = D.AnimLen[a];
      for (let k = 0; k < D.AnimLen[a]; k++) frameNames.push(sd + "." + frameNames[D.AnimStart[a] + k].slice(tpl.length + 1));
    }
  }
}

function loadMoves(): void {
  const lines = files.get("moves.txt")!;
  D.MvCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].replace(/\t/g, " ").trim().replace(/ +/g, " ");
    if (!ln || ln[0] === "#") continue;
    const p0 = ln.split(" ");
    if (p0.length < 21) throw new Error("moves.txt line " + (i + 1) + ": expected 21 columns");
    const rows = [p0];
    for (const [sd, src] of Object.entries(SD_CLONES_MOVES)) if (p0[0] === src && sprIdx.has(sd + ".idle")) rows.push([sd, ...p0.slice(1)]);
    for (const p of rows) {
    const id = D.MvCount++;
    D.MvKind[id] = p[2] === "S" ? MK_STAND : p[2] === "C" ? MK_CROUCH : MK_AIR;
    D.MvStartup[id] = +p[3]; D.MvActive[id] = +p[4]; D.MvRecovery[id] = +p[5];
    D.MvDamage[id] = +p[6]; D.MvHitstun[id] = +p[7]; D.MvBlockstun[id] = +p[8];
    D.MvLevel[id] = ({ L: LV_LOW, O: LV_OVERHEAD, U: LV_UNBLOCK } as Record<string, number>)[p[9]] ?? LV_HIGH;
    D.MvKD[id] = p[10] === "1";
    D.MvHbX[id] = +p[11]; D.MvHbY[id] = +p[12]; D.MvHbW[id] = +p[13]; D.MvHbH[id] = +p[14];
    D.MvSprS[id] = spriteId(p[0] + "." + p[15]);
    D.MvSprA[id] = spriteId(p[0] + "." + p[16]);
    D.MvType[id] = ({ T: MT_THROW, P: MT_PROJ, U: MT_RISE, R: MT_RUSH, G: MT_GRAB, SP: MT_SUPER_PROJ, SG: MT_SUPER_GRAB,
      SR: MT_SUPER_RUSH, TP: MT_TELEPORT, ST: MT_SUPER_TELE, PB: MT_PROJ_BOOM, SF: MT_SUPER_FIRE, SQ: MT_SUPER_QUAKE,
      SW: MT_STANCE, BK: MT_RAGE, SV: MT_SUPER_RIFT, SC: MT_SUPER_CRASH, CT: MT_COUNTER } as Record<string, number>)[p[17]] ?? MT_NORMAL;
    D.MvP1[id] = parseFloat(p[18]) || 0;
    D.MvP2[id] = parseFloat(p[19]) || 0;
    D.MvCmd[id] = p[20] === "-" ? "" : p[20];
    D.MvCost[id] = p.length >= 22 ? +p[21] : 0;
    moveIdx.set(p[0] + "." + p[1], id);
    mvKey[id] = p[0] + "." + p[1];
    }
  }
}

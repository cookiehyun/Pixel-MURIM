// Port of Data.bas: loads the shared text data (sprites, stages, moves) that the Excel version uses.
import { RGB } from "./util";

export const D = {
  SprCount: 0,
  SprW: [] as number[], SprH: [] as number[], SprAX: [] as number[], SprAY: [] as number[], SprOff: [] as number[],
  SprName: [] as string[],
  SprHi: [] as boolean[],               // hi-res art (PNG): drawn at the doubled screen resolution
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
  MT_SUPER_QUAKE = 13, MT_STANCE = 14, MT_RAGE = 15, MT_SUPER_RIFT = 16;

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

const SPRITE_FILES = ["danwoo", "cheolsan", "muyeong", "seolhwa", "heukrim", "heukrimsw", "cheolsanrg", "hongryeon", "cheonma", "fx"];
const STAGES = ["sanmun", "MOUNTAIN GATE", "bamboo", "BAMBOO FOREST", "inn", "NIGHT INN", "snow", "SNOW PEAK", "waterfall", "WATERFALL"];

export async function loadAll(): Promise<void> {
  const names = [...SPRITE_FILES.map((f) => f + ".txt"), ...STAGES.filter((_, i) => i % 2 === 0).map((s) => "stage_" + s + ".txt"), "moves.txt"];
  const texts = await Promise.all(names.map(fetchLines));
  names.forEach((n, i) => files.set(n, texts[i]));
  for (const f of SPRITE_FILES) loadSpriteFile(f);
  D.StageCount = STAGES.length / 2;
  for (let k = 0; k < D.StageCount; k++) {
    D.StageName[k] = STAGES[k * 2 + 1];
    loadStageFile("stage_" + STAGES[k * 2], k);
  }
  await loadHiSprites();
  loadMoves();
  for (let k = 0; k < frameNames.length; k++) D.AnimFrames[k] = spriteId(frameNames[k]);
  for (let k = 0; k < D.MvCount; k++) {
    D.MvSeqPre[k] = optAnim(mvKey[k] + "_pre");
    D.MvSeqAct[k] = optAnim(mvKey[k] + "_seq");
    D.MvSeqRec[k] = optAnim(mvKey[k] + "_rec");
  }
}

/** data/hi/manifest.txt: PNG art that replaces classic sprites (missing manifest = none). */
async function loadHiSprites(): Promise<void> {
  let lines: string[];
  try { lines = await fetchLines("hi/manifest.txt"); } catch { return; }
  const cache = new Map<string, ImageData>();
  for (const ln of lines) {
    const p = ln.trim().split(/\s+/);
    if (p.length < 4 || p[0].startsWith("#") || !sprIdx.has(p[0])) continue;
    let data = cache.get(p[1]);
    if (!data) {
      const blob = await (await fetch("hi/" + p[1])).blob();
      const bmp = await createImageBitmap(blob);
      const cv = document.createElement("canvas");
      cv.width = bmp.width; cv.height = bmp.height;
      const c2 = cv.getContext("2d")!;
      c2.drawImage(bmp, 0, 0);
      data = c2.getImageData(0, 0, bmp.width, bmp.height);
      cache.set(p[1], data);
    }
    const id = sprIdx.get(p[0])!, w = data.width, h = data.height, breathe = p[4] === "breathe";
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

function loadMoves(): void {
  const lines = files.get("moves.txt")!;
  D.MvCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].replace(/\t/g, " ").trim().replace(/ +/g, " ");
    if (!ln || ln[0] === "#") continue;
    const p = ln.split(" ");
    if (p.length < 21) throw new Error("moves.txt line " + (i + 1) + ": expected 21 columns");
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
      SW: MT_STANCE, BK: MT_RAGE, SV: MT_SUPER_RIFT } as Record<string, number>)[p[17]] ?? MT_NORMAL;
    D.MvP1[id] = parseFloat(p[18]) || 0;
    D.MvP2[id] = parseFloat(p[19]) || 0;
    D.MvCmd[id] = p[20] === "-" ? "" : p[20];
    D.MvCost[id] = p.length >= 22 ? +p[21] : 0;
    moveIdx.set(p[0] + "." + p[1], id);
    mvKey[id] = p[0] + "." + p[1];
  }
}

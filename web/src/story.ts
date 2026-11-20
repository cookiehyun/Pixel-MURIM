// Story mode 「혈월」: route and chapter menus, the scene player (stage background, people on a 2-row
// stage, dialogue box with Korean text), story fights (one round, sequences, tag teams) and the notebook.
// The scripts live in docs/story/*.md; tools/story_build.py turns them into data/story.json.
import * as R from "./renderer";
import { SCREEN_W, GROUND_Y, PX, SKIN_ALT, SKIN_SHADOW, SKIN_PALE, SKIN_BLOOD, SKIN_IRON, SKIN_CORPSE, SKIN_VIOLET, SKIN_GOLD, SKIN_CULT, SKIN_DIM,
  TINT_NONE, TINT_NIGHT, TINT_BURNT, TINT_MONO, TINT_BLOOD, TINT_TORCH, TINT_DARK, TINT_VIOLET, TINT_DAWN, TINT_DUSK, TINT_BLACK } from "./renderer";
import * as Font from "./font";
import * as KF from "./kfont";
import * as K from "./input";
import * as Account from "./account";
import * as Screens from "./screens";
import { animId, animFrame } from "./data";
import { G, GS_STORY, GS_MENU, MODE_TAG, MODE_VSCPU, startMatch } from "./game";
import { RGB } from "./util";
import * as Field from "./field";
import * as FM from "./fieldmap";
import { PLAYS } from "./plays";

// ---------------------------------------------------------------- data

type Ev = (string)[];
interface Fight { raw: string; opp: string[]; seq: number; tag: boolean; team: string[]; pick: boolean; stage: string; variant: string }
interface Chapter { title: string; place: string; fight: Fight | null; pre: Ev[]; post: Ev[]; lose: Ev[] }
interface Route { id: string; title: string; owner: string | null; chapters: Chapter[] }
let routes: Route[] = [];

export async function load(): Promise<void> {
  try {
    const r = await fetch("story.json");
    if (r.ok) routes = (await r.json()).routes;
  } catch { routes = []; }
}

// who is drawn as whom: [fighter, palette, HUD name]. Fighters without art yet are recoloured stand-ins.
type Look = [string, number, string];
const LOOK: Record<string, Look> = {
  단우: ["danwoo", 0, "DANWOO"], 철산: ["cheolsan", 0, "CHEOLSAN"], 무영: ["muyeong", 0, "MUYEONG"], 설화: ["seolhwa", 0, "SEOLHWA"],
  흑림: ["heukrim", 0, "HEUKRIM"], 홍련: ["hongryeon", 0, "HONGRYEON"], 천마: ["cheonma", 0, "CHEONMA"], 위천강: ["cheonma", 0, "CHEONMA"],
  천강: ["cheonma", 0, "CHEONMA"],
  야차: ["muyeong", SKIN_SHADOW, "YACHA"], 적운: ["muyeong", SKIN_PALE, "JEOGUN"], 진무: ["muyeong", SKIN_PALE, "JINMU"],
  남궁린: ["muyeong", SKIN_GOLD, "NAMGUNG RIN"], 금강귀: ["cheolsan", SKIN_IRON, "GEUMGANGGWI"], 당청향: ["hongryeon", SKIN_VIOLET, "DANG CHEONGHYANG"],
  백무진: ["cheonma", SKIN_PALE, "BAEK MUJIN"], 혈마: ["cheonma", SKIN_BLOOD, "HYEOLMA"], 위극: ["cheonma", SKIN_SHADOW, "WI GEUK"],
  흑사: ["heukrim", SKIN_SHADOW, "HEUKSA"], 혈사: ["heukrim", SKIN_BLOOD, "HYEOLSA"], 혈강시: ["cheolsan", SKIN_CORPSE, "GANGSI"],
  갑주: ["cheolsan", SKIN_IRON, "ARMORED GANGSI"], 백면: ["seolhwa", SKIN_PALE, "BAEKMYEON"], 소연: ["seolhwa", SKIN_PALE, "SOYEON"],
  청사: ["heukrim", SKIN_ALT, "CHEONGSA"], 교도: ["muyeong", SKIN_CULT, "CULTIST"], 무사: ["muyeong", SKIN_IRON, "GUARD"],
  추격대: ["muyeong", SKIN_IRON, "PURSUER"], 무승: ["cheolsan", SKIN_ALT, "MONK"], 혜공: ["cheolsan", SKIN_PALE, "HYEGONG"],
  사태: ["seolhwa", SKIN_PALE, "SATAE"],
};
const LOOK_EXACT: Record<string, Look> = {
  "혈마 백무진": ["cheonma", SKIN_BLOOD, "BAEK MUJIN"], "혈마 진체": ["cheonma", SKIN_BLOOD, "HYEOLMA"],
  "선대 천마 위극": ["cheonma", SKIN_SHADOW, "WI GEUK"], "갑주 혈강시": ["cheolsan", SKIN_IRON, "ARMORED GANGSI"],
};
function look(name: string): Look | null {
  const n = name.replace(/\(.*\)/, "").trim();
  if (LOOK_EXACT[n]) return LOOK_EXACT[n];
  if (LOOK[n]) return LOOK[n];
  let best: Look | null = null, bl = 0;
  for (const k in LOOK) if (n.includes(k) && k.length > bl) { best = LOOK[k]; bl = k.length; }
  return best;
}
const SEVEN = ["단우", "철산", "무영", "설화", "흑림", "홍련", "천마"];

// stages: 0 산문, 1 대나무 숲, 2 객잔, 3 눈 덮인 산, 4 폭포 (the new stages borrow these, recoloured)
type Bg = [number, number];
const STAGE_OF: [string, Bg][] = [
  ["십만대산 산문", [0, TINT_NONE]], ["천마신교 회랑", [0, TINT_TORCH]], ["혈천제단", [0, TINT_BLOOD]], ["천마전", [0, TINT_DARK]],
  ["맹주전", [2, TINT_TORCH]], ["붉은 지하", [2, TINT_BLOOD]], ["독초 정원", [1, TINT_VIOLET]],
  ["대나무", [1, TINT_NONE]], ["객잔", [2, TINT_NONE]], ["눈", [3, TINT_NONE]], ["폭포", [4, TINT_NONE]], ["산문", [0, TINT_NONE]],
];
const VARIANT: [string, number][] = [
  ["흑백", TINT_MONO], ["붉은", TINT_BLOOD], ["불탄", TINT_BURNT], ["횃불", TINT_TORCH], ["어두운", TINT_DARK], ["전당포", TINT_DARK],
  ["정원", TINT_VIOLET], ["밤", TINT_NIGHT],
];
const PLACE_OF: [RegExp, Bg][] = [
  [/검은 화면/, [0, TINT_BLACK]], [/제단/, [0, TINT_BLOOD]], [/지하|옥|비고|수로/, [2, TINT_BLOOD]],
  [/서고|서재|뒷방|전당포/, [2, TINT_DARK]], [/객잔|취선루|홍엽관|하오문|기루|객사|맹주|무림맹|연회|약재 거리|살막/, [2, TINT_NONE]],
  [/대나무|죽림|초막|협곡|무덤|약원|정원/, [1, TINT_NONE]], [/눈|설령|별원|아미/, [3, TINT_NONE]],
  [/폭포|나루|황하|강|흑풍곡|수문|배/, [4, TINT_NONE]],
  [/산문|십만대산|천마전|회랑|군기고|서하역|수레간|마구간|역참|소림|나한당|숭산|장경각|산길|장터|청풍촌|마을|산채|남궁|합비|광장|폐사찰|대문/, [0, TINT_NONE]],
];
function stageOf(name: string, variant: string): Bg {
  let bg: Bg = [0, TINT_NONE];
  for (const [k, v] of STAGE_OF) if (name.includes(k)) { bg = [v[0], v[1]]; break; }
  for (const [k, t] of VARIANT) if (variant.includes(k)) { bg[1] = t; break; }
  return bg;
}
function placeOf(text: string): Bg | null {
  for (const [re, v] of PLACE_OF) if (re.test(text)) {
    const bg: Bg = [v[0], v[1]];
    if (bg[1] === TINT_NONE) {
      if (/흑백/.test(text)) bg[1] = TINT_MONO;
      else if (/밤/.test(text)) bg[1] = TINT_NIGHT;
      else if (/새벽/.test(text)) bg[1] = TINT_DAWN;
      else if (/해 질 녘|저녁/.test(text)) bg[1] = TINT_DUSK;
    }
    return bg;
  }
  return null;
}

// ---------------------------------------------------------------- progress (account or this browser)

interface Save { done: Record<string, number>; clues: Record<string, string[]> }
let S: Save = { done: {}, clues: {} };
const LS = "pixelmurim.story";
const ALL = new URLSearchParams(location.search).has("storyall");     // testing: every route open

function loadSave(): void {
  let raw: unknown = null;
  if (Account.loggedIn()) raw = Account.saveData().story;
  else try { raw = JSON.parse(localStorage.getItem(LS) || "null"); } catch { raw = null; }
  const r = (raw ?? {}) as Partial<Save>;
  S = { done: { ...(r.done ?? {}) }, clues: { ...(r.clues ?? {}) } };
}
function writeSave(): void {
  if (Account.loggedIn()) { Account.store({ story: S }); return; }
  try { localStorage.setItem(LS, JSON.stringify(S)); } catch { /* private mode */ }
}
const doneOf = (r: Route) => S.done[r.id] ?? 0;
const cleared = (id: string) => { const r = routes.find((x) => x.id === id); return !!r && doneOf(r) >= r.chapters.length; };
function routeOpen(k: number): boolean {
  if (ALL) return true;
  const id = routes[k].id;
  if (id === "prologue") return true;
  if (id === "cheonma") return SEVEN.slice(0, 6).every((_, i) => cleared(routes[1 + i].id));
  if (id === "finale") return cleared("cheonma");
  return cleared("prologue");
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
function addClue(text: string): void {
  const body = text.replace(/^단서[^:]*:\s*/, "");
  const parts = body.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/).map((p) => p.trim()).filter((p) => p);
  for (const p of parts) {
    const n = p[0];
    if (!CIRCLED.includes(n)) continue;
    const t = p.slice(1).trim();
    const list = S.clues[n] ?? (S.clues[n] = []);
    if (!list.includes(t)) list.push(t);
  }
}

// ---------------------------------------------------------------- screens

const V_ROUTES = 0, V_CHAPTERS = 1, V_BOOK = 2, V_PLAY = 3, V_PICK = 4, V_LOST = 5, V_FIELD = 6;
let mField = false;
let mView = V_ROUTES, mSel = 0, mChSel = 0, mT = 0, mMsg = "", mMsgT = 0, mBookSel = 0;
let mRoute = 0, mChap = 0;

const cBox = RGB(14, 11, 22), cGold = RGB(240, 196, 96), cText = RGB(244, 236, 222), cDim = RGB(140, 128, 160),
  cNarr = RGB(186, 204, 226), cLock = RGB(84, 76, 100);

/** From the title menu (SINGLE PLAYER > STORY). */
export function open(): void {
  loadSave();
  if (!routes.length) { mMsg = "스토리 데이터를 불러오지 못했습니다"; mMsgT = 80; }
  mView = V_ROUTES; mT = 0;
  if (!routeOpen(mSel)) mSel = 0;
  G.GameState = GS_STORY;
}

function menuRows(): { label: string; open: boolean; done: boolean }[] {
  const rows = routes.map((r, k) => ({ label: r.title.replace(/「.*$/, "").trim() + "  " + (r.title.match(/「.*」/)?.[0] ?? ""), open: routeOpen(k), done: doneOf(r) >= r.chapters.length }));
  rows.push({ label: "단서 수첩", open: true, done: false });
  return rows;
}

export function tick(): void {
  mT++;
  if (mMsgT > 0) mMsgT--;
  switch (mView) {
    case V_ROUTES: routesTick(); break;
    case V_CHAPTERS: chaptersTick(); break;
    case V_BOOK: if (K.isPressed(K.BTN_HP) || K.isPressed(K.BTN_QUIT) || K.isPressed(K.BTN_LP)) mView = V_ROUTES;
      if (K.isPressed(K.BTN_UP)) mBookSel = (mBookSel + 9) % 10;
      if (K.isPressed(K.BTN_DOWN)) mBookSel = (mBookSel + 1) % 10;
      break;
    case V_PLAY: playTick(); break;
    case V_PICK: pickTick(); break;
    case V_LOST: lostTick(); break;
    case V_FIELD: fieldTick(); break;
  }
}

export function render(): void {
  switch (mView) {
    case V_ROUTES: routesRender(); break;
    case V_CHAPTERS: chaptersRender(); break;
    case V_BOOK: bookRender(); break;
    case V_PLAY: playRender(); break;
    case V_PICK: pickRender(); break;
    case V_LOST: playRender(); lostRender(); break;
    case V_FIELD: Field.render(); if (mQuitT > 0) KF.draw("ESC 한 번 더 = 장 목록", R.PHYS_W - 16, 276, RGB(255, 170, 120), 2, 2); break;
  }
  if (mMsgT > 0) { R.shadeRect(0, 132, R.PHYS_W, 36, cBox, 0.9); KF.draw(mMsg, R.PHYS_W / 2, 140, cGold, 2, 1); }
}

function routesTick(): void {
  const rows = menuRows(), n = rows.length;
  if (K.isPressed(K.BTN_UP)) mSel = (mSel + n - 1) % n;
  if (K.isPressed(K.BTN_DOWN)) mSel = (mSel + 1) % n;
  if (K.isPressed(K.BTN_HP) || K.isPressed(K.BTN_QUIT)) { G.GameState = GS_MENU; return; }
  if (!K.isPressed(K.BTN_LP)) return;
  if (mSel === n - 1) { mView = V_BOOK; return; }
  if (!rows[mSel].open) { mMsg = lockReason(mSel); mMsgT = 50; return; }
  mRoute = mSel; mChSel = Math.min(doneOf(routes[mRoute]), routes[mRoute].chapters.length - 1);
  if (routes[mRoute].chapters.length === 1) { beginChapter(0); return; }
  mView = V_CHAPTERS;
}
function lockReason(k: number): string {
  const id = routes[k].id;
  if (id === "cheonma") return "여섯 사람의 이야기를 모두 마치면 열립니다";
  if (id === "finale") return "천마 편을 마치면 열립니다";
  return "서장을 먼저 보세요";
}

function panelBg(): void {
  R.physRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(12, 10, 20));
  R.physRect(0, 0, R.PHYS_W, 34, RGB(22, 16, 30));
  R.physRect(0, 34, R.PHYS_W, 2, RGB(150, 110, 50));
}

function routesRender(): void {
  R.beginFrame(true);
  panelBg();
  KF.draw("스토리  「혈월」", 18, 8, cGold, 2);
  const rows = menuRows();
  for (let k = 0; k < rows.length; k++) {
    const y = 44 + k * 23, on = k === mSel, r = rows[k];
    if (on) { R.physRect(10, y - 3, 300, 23, RGB(46, 32, 22)); R.physRect(10, y - 3, 3, 23, cGold); }
    const c = !r.open ? cLock : on ? RGB(255, 238, 190) : RGB(196, 186, 210);
    KF.draw(r.open ? r.label : r.label.replace(/「.*」/, "") + "  (잠김)", 22, y, c, 2);
    if (r.done) KF.draw("★", 296, y, RGB(120, 220, 140), 2, 2);
  }
  if (mSel < routes.length) {
    const rt = routes[mSel], who = rt.owner ? look(rt.owner) : null;
    if (who && rows[mSel].open) Screens.drawBigView(who[0], 160, true, 110, SCREEN_W - 1);
    const d = doneOf(rt), n = rt.chapters.length;
    KF.draw(rows[mSel].open ? (d >= n ? "완료" : d > 0 ? d + " / " + n + " 장" : "처음부터") : "잠김", R.PHYS_W - 20, 44, cDim, 2, 2);
  } else {
    const n = Object.keys(S.clues).length;
    KF.draw("모은 단서 " + n + " / 10", R.PHYS_W - 20, 44, cDim, 2, 2);
  }
  Font.drawText("UP DOWN = SELECT   A = OK   S = BACK", SCREEN_W / 2, 93, RGB(110, 100, 130), 1, 1);
}

function chaptersTick(): void {
  const rt = routes[mRoute], n = rt.chapters.length, open = ALL ? n - 1 : Math.min(doneOf(rt), n - 1);
  if (K.isPressed(K.BTN_UP)) mChSel = (mChSel + n - 1) % n;
  if (K.isPressed(K.BTN_DOWN)) mChSel = (mChSel + 1) % n;
  if (K.isPressed(K.BTN_HP) || K.isPressed(K.BTN_QUIT)) { mView = V_ROUTES; return; }
  if (!K.isPressed(K.BTN_LP)) return;
  if (mChSel > open) { mMsg = "앞 장을 먼저 마치세요"; mMsgT = 40; return; }
  beginChapter(mChSel);
}

function chaptersRender(): void {
  R.beginFrame(true);
  panelBg();
  const rt = routes[mRoute], n = rt.chapters.length, d = doneOf(rt), open = ALL ? n - 1 : Math.min(d, n - 1);
  KF.draw(rt.title, 18, 8, cGold, 2);
  for (let k = 0; k < n; k++) {
    const y = 46 + k * 26, on = k === mChSel, ch = rt.chapters[k];
    if (on) { R.physRect(10, y - 4, 330, 25, RGB(46, 32, 22)); R.physRect(10, y - 4, 3, 25, cGold); }
    const c = k > open ? cLock : on ? RGB(255, 238, 190) : RGB(196, 186, 210);
    KF.draw(k > open ? ch.title.replace(/「.*」/, "「 ? 」") : ch.title, 22, y, c, 2);
    if (k < d) KF.draw("★", 326, y, RGB(120, 220, 140), 2, 2);
  }
  const ch = rt.chapters[mChSel];
  if (mChSel <= open) {
    const lines = KF.wrap(ch.place || "", 210, 2);
    lines.forEach((l, i) => KF.draw(l, 352, 48 + i * 24, cDim, 2));
    if (ch.fight) KF.draw(ch.fight.tag ? "태그 대전" : "대전", 352, 48 + lines.length * 24 + 10, RGB(255, 140, 110), 2);
  }
  Font.drawText("UP DOWN = SELECT   A = PLAY   S = BACK", SCREEN_W / 2, 93, RGB(110, 100, 130), 1, 1);
}

function bookRender(): void {
  R.beginFrame(true);
  panelBg();
  KF.draw("단서 수첩", 18, 8, cGold, 2);
  for (let k = 0; k < 10; k++) {
    const n = CIRCLED[k], got = S.clues[n], y = 46 + k * 24, on = k === mBookSel;
    if (on) { R.physRect(10, y - 4, 112, 23, RGB(46, 32, 22)); R.physRect(10, y - 4, 3, 23, cGold); }
    KF.draw(n + (got ? "  " + got.length + "줄" : "  ???"), 22, y, got ? (on ? RGB(255, 238, 190) : RGB(196, 186, 210)) : cLock, 2);
  }
  const got = S.clues[CIRCLED[mBookSel]];
  let y = 46;
  if (!got) KF.draw("아직 모르는 단서입니다.", 140, y, cLock, 2);
  else for (const t of got) {
    for (const l of KF.wrap(t, 420, 2)) { if (y < 270) KF.draw(l, 140, y, cText, 2); y += 22; }
    y += 8;
  }
  Font.drawText("UP DOWN = SELECT   S = BACK", SCREEN_W / 2, 93, RGB(110, 100, 130), 1, 1);
}

// ---------------------------------------------------------------- scene player

interface Actor { name: string; look: Look; side: number; order: number }
let mSec: "pre" | "post" | "lose" = "pre", mEv = 0, mPage: string[] = [], mPageAt = 0, mShown = 0;
let mWho = "", mDir = "", mKind = "", mTitleT = 0, mBanner = "", mBannerT = 0, mQuitT = 0;
let mCast: Actor[] = [], mOrder = 0, mBg: Bg = [0, TINT_NONE], mMono = false;
let mFight = 0, mTeam: string[] = [], mPicked: number[] = [], mPickSel = 0, mLostSel = 0;
const BOX_Y = 214, BOX_H = 82, TEXT_X = 30, TEXT_W = 496, LINES = 3;

const route = () => routes[mRoute];
const chapter = () => route().chapters[mChap];

function setBg(bg: Bg): void {
  mBg = bg;
  R.setStage(bg[0]);
  R.tintStage(mMono && bg[1] !== TINT_BLACK ? TINT_MONO : bg[1]);
}

function beginChapter(k: number): void {
  Field.stop();
  mField = !!PLAYS[routes[mRoute].id]?.[k];
  mChap = k; mView = V_PLAY; mSec = "pre"; mEv = 0; mTitleT = 0; mFight = 0;
  mCast = []; mOrder = 0; mPage = []; mBanner = ""; mBannerT = 0;
  const ch = chapter();
  mMono = /흑백/.test(ch.place);
  mTeam = ch.fight?.team.length ? ch.fight.team.slice() : route().owner ? [route().owner!] : [];
  let bg: Bg | null = ch.fight ? stageOf(ch.fight.stage, ch.fight.variant) : placeOf(ch.place);
  if (!bg && k > 0) bg = mBg;
  if (route().id === "prologue") bg = [0, TINT_BLOOD];
  setBg(bg ?? [0, TINT_NONE]);
  if (route().owner) addActor(route().owner!);
  for (const t of mTeam) addActor(t);
}

function ally(name: string): boolean {
  const n = name.replace(/\(.*\)/, "").trim();
  return mTeam.some((t) => n === t || look(n) === look(t)) || n === route().owner;
}

function addActor(name: string): void {
  const lk = look(name);
  if (!lk) return;
  const key = name.replace(/\(.*\)/, "").trim();
  const have = mCast.find((a) => a.look === lk || a.name === key);
  if (have) { have.order = ++mOrder; return; }
  const side = ally(key) ? 0 : 1;
  const same = mCast.filter((a) => a.side === side);
  if (same.length >= 3) {
    const drop = same.filter((a) => a.name !== route().owner).sort((a, b) => a.order - b.order)[0];
    mCast = mCast.filter((a) => a !== drop);
  }
  mCast.push({ name: key, look: lk, side, order: ++mOrder });
}

function events(): Ev[] {
  const ch = chapter();
  if (mSec !== "lose") return ch[mSec];
  const says = ch.lose.filter((e) => e[0] === "say");
  if (says.length <= 2) return ch.lose;
  const mine = says.filter((e) => mTeam.includes(e[1]));          // finale: the line of the partner you chose
  return mine.length ? [mine[0]] : [says[0]];
}

function showEvent(): boolean {
  const list = events();
  while (mEv < list.length) {
    const e = list[mEv];
    mWho = ""; mDir = ""; mKind = e[0];
    if (e[0] === "sec") {
      const bg = placeOf(e[1]);
      if (bg) setBg(route().id === "prologue" ? [bg[0], TINT_BLOOD] : bg);
      mCast = []; mBanner = e[1]; mBannerT = 60; mEv++; continue;
    }
    if (e[0] === "pick") { mEv++; mView = V_PICK; mPicked = []; mPickSel = 0; return true; }
    if (e[0] === "cut") {
      const head = e[1].split(/[.。]/)[0];
      if (/흑백/.test(head)) mMono = true;
      if (/색이 돌아|흑백이 걷히/.test(e[1])) { mMono = false; setBg(mBg); }
      if (head.length <= 14) {
        const ch = chapter();
        let bg = placeOf(head);
        if (bg && ch.fight && ch.place.includes(head)) bg = stageOf(ch.fight.stage, ch.fight.variant);   // the fight's own place
        else if (bg && bg[1] === TINT_NONE) bg[1] = placeOf(ch.place)?.[1] ?? TINT_NONE;                 // the chapter's time of day
        if (bg) { setBg(route().id === "prologue" ? [bg[0], TINT_BLOOD] : bg); if (head !== "흑백") mCast = mCast.filter((a) => a.name === route().owner && !/검은 화면/.test(head)); }
      }
      if (mMono) setBg(mBg);
      page(e[1]);
      return true;
    }
    if (e[0] === "say") {
      mWho = e[1]; mDir = e[3] ?? "";
      if (mWho !== "해설" && !mWho.startsWith("?")) addActor(mWho);
      page(e[2] || "……");
      return true;
    }
    if (e[0] === "clue") { addClue(e[1]); writeSave(); mWho = "단서"; page(e[1].replace(/^단서\s*/, "")); return true; }
    if (e[0] === "clear") { mWho = ""; mKind = "clear"; page(e[1]); return true; }
    mEv++;
  }
  return false;
}

function page(text: string): void {
  const lines = KF.wrap((mDir ? "(" + mDir + ")\n" : "") + text, TEXT_W, 2);
  mPage = lines; mPageAt = 0; mShown = 0;
}
const pageLines = () => mPage.slice(mPageAt, mPageAt + LINES);
const pageLen = () => pageLines().join("").length;

function advance(): void {
  if (mShown < pageLen()) { mShown = 9999; return; }
  if (mPageAt + LINES < mPage.length) { mPageAt += LINES; mShown = 0; return; }
  mEv++;
  nextStep();
}

function nextStep(): void {
  if (showEvent()) return;
  const ch = chapter();
  if (mSec === "pre" && ch.fight) { startFight(); return; }
  if (mSec === "lose") { mView = V_LOST; mLostSel = 0; return; }
  chapterDone();
}

function skipSection(): void {
  const list = events();
  for (; mEv < list.length; mEv++) {
    const e = list[mEv];
    if (e[0] === "clue") addClue(e[1]);
    if (e[0] === "pick") { mEv++; mView = V_PICK; mPicked = []; mPickSel = 0; writeSave(); return; }
  }
  writeSave();
  mPage = [];
  nextStep();
}

const fieldHost: Field.Host = {
  events: (sec, a, b) => (chapter() as unknown as Record<string, Ev[]>)[sec].slice(a, b + 1),
  look: (n) => look(n),
  clue: (t) => { addClue(t); writeSave(); },
  fight: (o) => { mFight = 0; mLevelSaved = G.CpuLevel; if (o) G.CpuLevel = 0; mFightOverride = o ? { raw: "", opp: o.opp, seq: 1, tag: false, team: [], pick: false, stage: o.stage ?? chapter().fight?.stage ?? "산문", variant: o.variant ?? chapter().fight?.variant ?? "" } : null; startFight(); },
  done: () => chapterDone(),
  cutscene: (sec, a) => {
    mField = false; mView = V_PLAY; mSec = sec as "pre" | "post" | "lose"; mEv = a; mTitleT = 40; mPage = [];
    if (route().id === "prologue") setBg([0, TINT_BLOOD]);
    nextStep();
  },
};

function fieldTick(): void {
  if (mQuitT > 0) mQuitT--;
  if (K.isPressed(K.BTN_QUIT)) {
    if (mQuitT > 0) { Field.stop(); mView = route().chapters.length > 1 ? V_CHAPTERS : V_ROUTES; mChSel = mChap; return; }
    mQuitT = 50;
  }
  Field.tick();
}

function chapterDone(): void {
  const rt = route();
  S.done[rt.id] = Math.max(doneOf(rt), mChap + 1);
  writeSave();
  if (mChap + 1 < rt.chapters.length) { beginChapter(mChap + 1); return; }
  mView = rt.chapters.length > 1 ? V_CHAPTERS : V_ROUTES;
  mChSel = rt.chapters.length - 1;
  mMsg = rt.id === "finale" ? "혈월 · 끝" : rt.title.replace(/「.*$/, "").trim() + " 완료"; mMsgT = 90;
}

function playTick(): void {
  if (mBannerT > 0) mBannerT--;
  if (mQuitT > 0) mQuitT--;
  if (K.isPressed(K.BTN_QUIT)) {
    if (mQuitT > 0) { mView = route().chapters.length > 1 ? V_CHAPTERS : V_ROUTES; mChSel = mChap; return; }
    mQuitT = 50;
  }
  if (mTitleT < 40) {                           // chapter title card
    mTitleT++;
    if (mField && !FM.ready()) { mTitleT = Math.min(mTitleT, 39); return; }    // the scene pictures are still downloading
    if (mTitleT >= 40 || (mTitleT > 6 && K.isPressed(K.BTN_LP))) {
      mTitleT = 40; mEv = 0;
      if (mField) { mView = V_FIELD; Field.begin(fieldHost, PLAYS[route().id][mChap]); return; }
      nextStep();
    }
    return;
  }
  if (!mPage.length) return;
  mShown += 2;
  if (K.isPressed(K.BTN_LP)) advance();
  else if (K.isPressed(K.BTN_HK)) skipSection();
}

function drawActors(): void {
  const t = Screens.menuTick();
  for (const back of [true, false]) for (let side = 0; side <= 1; side++) {
    const list = mCast.filter((a) => a.side === side);
    list.forEach((a, i) => {
      const isBack = i > 0;
      if (isBack !== back) return;
      const x = side === 0 ? [48, 26, 70][i] : [144, 166, 122][i];
      const y = isBack ? GROUND_Y - 5 : GROUND_Y;
      const speaking = mWho && look(mWho) === a.look;
      const skin = a.look[1] | (isBack && !speaking ? SKIN_DIM : 0);
      const id = animFrame(animId(a.look[0] + ".idle"), t + i * 7);
      R.drawSprite(id, x, y, side === 1, -1, skin);
    });
  }
}

function playRender(): void {
  R.beginFrame(false);
  const ch = chapter();
  if (mTitleT < 40) {
    R.physRect(0, 0, R.PHYS_W, R.PHYS_H, RGB(6, 5, 10));
    if (route().title !== ch.title) KF.draw(route().title, R.PHYS_W / 2, 92, cDim, 2, 1);
    KF.draw(ch.title, R.PHYS_W / 2, 124, cGold, 3, 1);
    if (ch.place) KF.wrap(ch.place, 500, 2).forEach((l, i) => KF.draw(l, R.PHYS_W / 2, 176 + i * 24, cNarr, 2, 1));
    if (mField && !FM.ready() && mTitleT >= 39) KF.draw("불러오는 중…", R.PHYS_W / 2, 260, cDim, 2, 1);
    return;
  }
  if (mBg[1] !== TINT_BLACK) drawActors();
  if (mBannerT > 0 && mBanner) {
    R.shadeRect(0, 12, KF.width(mBanner, 2) + 40, 30, cBox, 0.8);
    KF.draw(mBanner, 20, 16, cGold, 2);
  }
  if (!mPage.length) return;
  R.shadeRect(12, BOX_Y, R.PHYS_W - 24, BOX_H, cBox, 0.86);
  R.physRect(12, BOX_Y, R.PHYS_W - 24, 2, RGB(150, 110, 50));
  if (mWho && mWho !== "해설") {
    const nm = mWho === "단서" ? "단서" : mWho;
    const w = KF.width(nm, 2) + 28;
    R.physRect(22, BOX_Y - 24, w, 24, RGB(46, 32, 22));
    R.physRect(22, BOX_Y - 24, w, 2, cGold);
    KF.draw(nm, 36, BOX_Y - 20, cGold, 2);
  }
  let left = mShown;
  const lines = pageLines();
  for (let k = 0; k < lines.length; k++) {
    const isDir = mDir && mPageAt + k === 0;
    const c = mKind === "cut" ? cNarr : mKind === "clear" || mWho === "단서" ? cGold : isDir ? cDim : mWho === "해설" ? cNarr : cText;
    const s = [...lines[k]].slice(0, Math.max(0, left)).join("");
    left -= [...lines[k]].length;
    KF.draw(s, TEXT_X, BOX_Y + 8 + k * 24, c, 2);
  }
  if (mShown >= pageLen() && Math.trunc(mT / 6) % 2 === 0) KF.draw("▼", R.PHYS_W - 34, BOX_Y + BOX_H - 22, cGold, 2);
  if (mQuitT > 0) KF.draw("ESC 한 번 더 = 장 목록", R.PHYS_W - 16, 8, RGB(255, 170, 120), 2, 2);
  else Font.drawText("A = NEXT   X = SKIP   ESC = EXIT", SCREEN_W - 2, 1, RGB(170, 160, 190), 1, 2);
}

// ---------------------------------------------------------------- fights

let mFightOverride: Fight | null = null, mLevelSaved = 1;            // a field encounter (underlings) instead of the chapter's fight
const curFight = () => mFightOverride ?? chapter().fight!;

function startFight(): void {
  const f = curFight();
  const opp = f.opp;
  const bg = stageOf(f.stage, f.variant);
  const team = mTeam.length ? mTeam : [route().owner ?? "단우"];
  const me = team.map((n) => look(n) ?? LOOK.단우);
  let foe: Look[];
  if (f.tag) foe = opp.length >= 2 ? [look(opp[0]) ?? LOOK.교도, look(opp[1]) ?? LOOK.교도] : [look(opp[0]) ?? LOOK.교도, look(opp[0]) ?? LOOK.교도];
  else {
    const order = f.seq > 1 ? Array(f.seq).fill(opp[0]) : opp;
    foe = [look(order[Math.min(mFight, order.length - 1)]) ?? LOOK.교도];
  }
  G.Multi = false; G.WatchMode = false; G.HumanIndex = 0; G.StoryFight = true;
  G.StageIndex = bg[0];
  G.P1Char = me[0][0]; G.P2Char = foe[0][0];
  G.Skins[0] = me[0][1]; G.Skins[1] = foe[0][1];
  G.Labels[0] = me[0][2]; G.Labels[1] = foe[0][2];
  if (f.tag || f.pick) {
    G.GameMode = MODE_TAG;
    const m2 = me[1] ?? me[0], f2 = foe[1] ?? foe[0];
    G.P1Char2 = m2[0]; G.P2Char2 = f2[0];
    G.Skins[2] = m2[1]; G.Skins[3] = f2[1]; G.Labels[2] = m2[2]; G.Labels[3] = f2[2];
  } else G.GameMode = MODE_VSCPU;
  startMatch();
  R.tintStage(bg[1]);
}

const fightCount = () => { const f = curFight(); return f.tag || f.pick ? 1 : f.seq > 1 ? f.seq : f.opp.length; };

/** End of a story fight (Match calls this after the last round). */
export function matchOver(won: boolean): void {
  G.StoryFight = false;
  G.GameState = GS_STORY;
  mView = V_PLAY;
  setBg(mBg);
  if (won) {
    mFight++;
    if (mFight < fightCount()) { G.StoryFight = true; startFight(); return; }
    if (mField) { mView = V_FIELD; mFightOverride = null; G.CpuLevel = mLevelSaved; Field.afterFight(); return; }
    mSec = "post"; mEv = 0; mPage = [];
    const ch = chapter();
    if (ch.fight) setBg(stageOf(ch.fight.stage, ch.fight.variant));
    nextStep();
  } else { mSec = "lose"; mEv = 0; mPage = []; nextStep(); }
}

/** Pause menu during a story fight: back to the chapter list (true) or to the title (false). */
export function leaveFight(toList: boolean): void {
  G.StoryFight = false;
  if (!toList) return;
  G.GameState = GS_STORY;
  mView = route().chapters.length > 1 ? V_CHAPTERS : V_ROUTES;
  mChSel = mChap;
}

function lostTick(): void {
  if (K.isPressed(K.BTN_UP) || K.isPressed(K.BTN_DOWN)) mLostSel = 1 - mLostSel;
  if (!K.isPressed(K.BTN_LP)) return;
  if (mLostSel === 0) { mFight = 0; mView = V_PLAY; startFight(); }
  else { Field.stop(); mView = route().chapters.length > 1 ? V_CHAPTERS : V_ROUTES; mChSel = mChap; }
}
function lostRender(): void {
  const items = ["다시 싸운다", "장 목록으로"];
  R.shadeRect(188, 96, 200, 84, cBox, 0.92);
  items.forEach((s, k) => {
    if (k === mLostSel) R.physRect(198, 106 + k * 34, 180, 28, RGB(60, 40, 22));
    KF.draw(s, R.PHYS_W / 2, 110 + k * 34, k === mLostSel ? RGB(255, 238, 190) : cDim, 2, 1);
  });
}

// finale: choose two of the seven for the last fight against Baek Mujin
function pickTick(): void {
  if (K.isPressed(K.BTN_LEFT)) mPickSel = (mPickSel + 6) % 7;
  if (K.isPressed(K.BTN_RIGHT)) mPickSel = (mPickSel + 1) % 7;
  if (K.isPressed(K.BTN_HP) && mPicked.length) mPicked.pop();
  if (!K.isPressed(K.BTN_LP) || mPicked.includes(mPickSel)) return;
  mPicked.push(mPickSel);
  if (mPicked.length === 2) {
    mTeam = mPicked.map((k) => SEVEN[k]);
    mCast = []; for (const t of mTeam) addActor(t);
    mView = V_PLAY; nextStep();
  }
}
function pickRender(): void {
  R.beginFrame(true);
  KF.draw("함께 싸울 두 사람을 고르세요", R.PHYS_W / 2, 20, cGold, 2, 1);
  for (let k = 0; k < 7; k++) {
    const x = 14 + k * 26, lk = look(SEVEN[k])!;
    const on = k === mPickSel, n = mPicked.indexOf(k);
    R.fillRect(x - 11, 22, 23, 66, on ? RGB(60, 40, 22) : RGB(20, 16, 28));
    if (on) R.drawRectOutline(x - 11, 22, 23, 66, cGold);
    R.drawSprite(animFrame(animId(lk[0] + ".idle"), Screens.menuTick()), x, 80, false, -1, n >= 0 ? 0 : SKIN_DIM);
    KF.draw(SEVEN[k], x * PX, 82 * PX, n >= 0 ? cGold : on ? cText : cDim, 2, 1);
    if (n >= 0) KF.draw(String(n + 1), x * PX, 24 * PX, cGold, 2, 1);
  }
  Font.drawText("LEFT RIGHT = SELECT   A = PICK   S = UNDO", SCREEN_W / 2, 93, RGB(110, 100, 130), 1, 1);
}

/** Tests: jump straight into a chapter. */
export function debugPlay(routeId: string, k: number): void {
  loadSave(); G.GameState = GS_STORY;
  mRoute = Math.max(0, routes.findIndex((r) => r.id === routeId));
  beginChapter(k);
}
export const debugView = () => ({ view: mView, sec: mSec, ev: mEv, who: mWho, kind: mKind, page: mPage.join("/"), cast: mCast.map((a) => a.name + a.side), fight: mFight });
export const fieldDebug = () => Field.debug();
export const fieldKill = () => Field.debugKill();
export const fieldWarp = (x: number) => Field.debugWarp(x);

// Port of Online.bas (server modes only: a browser cannot open UDP ports). The game server pairs the
// players (quick match / room code) and relays every message between them over a secure WebSocket.
// Host = left fighter (0). Lobby: both pick a tag team, the host picks the stage, the fight starts.
import * as R from "./renderer";
import { SCREEN_W, SCREEN_H } from "./renderer";
import * as Font from "./font";
import * as K from "./input";
import { D } from "./data";
import * as Lockstep from "./lockstep";
import * as Match from "./match";
import { MP_MATCHEND } from "./match";
import { F, hashMix, setControl } from "./fighter";
import * as Screens from "./screens";
import * as Arcade from "./arcade";
import { G, GS_MENU, GS_ONLINE, MODE_TAG, startMatch } from "./game";
import { RGB, clng } from "./util";
import * as Account from "./account";
import * as AccountForm from "./accountform";

const OS_ACCOUNT = 11;
const OS_OFF = 0, OS_LOBBY = 3, OS_FIGHT = 4, OS_RESULT = 5, OS_ERROR = 6, OS_CONNECT = 7, OS_ROOMWAIT = 8, OS_QUEUE = 9, OS_RANKING = 10;
const ACT_QUICK = 1, ACT_ROOM = 2, ACT_JOINROOM = 3, ACT_TOP = 4, ACT_CASUAL = 5;
const SRV_PROTO = "PW1";
const GAME_BUILD = 20261120;              // bump whenever fighting code changes: both players must match
export const DEFAULT_SERVER = "wss://pixelmurim.duckdns.org/";
const ROSTER_ON = 7, SILENT_LIMIT = 200;

let mState = OS_OFF, mHost = false, mT = 0, mSilent = 0, mMsg = "";
let mMySlot = 0, mMyReady = false, mPeerSlot = 1, mPeerReady = false, mMyStep = 0, mPeerStep = 0;
const mMyPick = [0, 1], mPeerPick = [1, 0];
let mStage = 0, mStageChoosing = false, mRtt = -1, mDelay = 3, mStartMsg = "", mHeardInput = false, mResultT = 0;
let mAction = 0, mRoomCode = "", mMatchId = 0, mRanked = false, mOppName = "", mOppRating = 0;
let mRating = 1000, mGames = 0, mRatingDelta = "", mGameNo = 0, mTopN = 0, mMyRank = 0;
const mTopName: string[] = [], mTopRating: number[] = [];
let mName = "", mToken = "", mCasual = false, mRankErr = false, mFormOpen = false, mTopGot = false, mHelloSent = false;
let ws: WebSocket | null = null;
const inbox: string[] = [];

export const active = () => mState !== OS_OFF;
export const isHost = () => mHost;

// ---------------------------------------------------------------- start / stop

export const beginQuickMatch = () => beginServer(ACT_CASUAL, "");     // friendly: anyone, all fighters open
export const beginRankGame = () => beginServer(ACT_QUICK, "");
export const beginRoomCreate = () => beginServer(ACT_ROOM, "");
export const beginRoomJoin = (code: string) => beginServer(ACT_JOINROOM, code);
export const beginRanking = () => beginServer(ACT_TOP, "");

/** CREATE ACCOUNT screen: ranking (top 10 + mine) and A = create account / log in / log out. */
export function beginAccount(): void {
  reset();
  mAction = ACT_TOP;
  mName = Account.name(); mToken = Account.serverToken();
  mRankErr = false; mTopGot = false; mHelloSent = false;
  openSocket();
  setState(OS_ACCOUNT);
}

function openSocket(): void {
  try { ws = new WebSocket(serverUrl()); } catch { ws = null; mRankErr = true; return; }
  ws.onmessage = (e) => { if (typeof e.data === "string") inbox.push(e.data); };
  ws.onclose = () => {
    if (mState === OS_ACCOUNT) { mRankErr = mTopN === 0; return; }
    if (mState !== OS_OFF && mState !== OS_ERROR) fail("CONNECTION LOST", "THE SERVER CLOSED THE CONNECTION");
  };
  ws.onerror = () => {
    if (mState === OS_ACCOUNT) mRankErr = true;
    else if (mState === OS_CONNECT) fail("SERVER NOT RESPONDING", "CANNOT REACH THE GAME SERVER");
  };
}

function serverUrl(): string {
  const q = new URLSearchParams(location.search).get("server");
  return q || DEFAULT_SERVER;
}

function beginServer(action: number, code: string): void {
  reset();
  if (!Account.loggedIn()) { mState = OS_OFF; G.GameState = GS_MENU; return; }
  mName = Account.name(); mToken = Account.serverToken();
  mAction = action;
  mCasual = action === ACT_CASUAL;
  mRoomCode = code.trim().toUpperCase();
  mHost = false;
  setState(OS_CONNECT);
  openSocket();
}

export function leave(): void {
  if (mState !== OS_OFF) send("LEAVE");
  Lockstep.finish();
  closeSocket();
  mState = OS_OFF;
  G.GameState = GS_MENU;
}

function closeSocket(): void {
  if (ws) { ws.onclose = null; ws.onerror = null; try { ws.close(); } catch { /* already closed */ } }
  ws = null;
  inbox.length = 0;
}

function reset(): void {
  Lockstep.finish();
  closeSocket();
  mMsg = ""; mMySlot = 0; mMyReady = false; mPeerSlot = 1; mPeerReady = false;
  mMyStep = 0; mPeerStep = 0; mMyPick[0] = 0; mMyPick[1] = 1; mPeerPick[0] = 1; mPeerPick[1] = 0;
  mStage = 0; mStageChoosing = false; mRtt = -1; mDelay = 3; mStartMsg = ""; mHeardInput = false; mSilent = 0;
  mAction = 0; mRoomCode = ""; mMatchId = 0; mRanked = false; mOppName = ""; mOppRating = 0;
  mRatingDelta = ""; mGameNo = 0; mTopN = 0; mMyRank = 0; mCasual = false;
}

function setState(s: number): void {
  mState = s; mT = 0;
  if (s !== OS_FIGHT) G.GameState = GS_ONLINE;
}

function fail(title: string, detail: string): void {
  if (mState !== OS_OFF) send("LEAVE");
  Lockstep.finish();
  closeSocket();
  mMsg = title + "|" + detail.toUpperCase();
  mState = OS_ERROR; mT = 0;
  G.GameState = GS_ONLINE;
}

function send(msg: string): void {
  if (ws && ws.readyState === WebSocket.OPEN && msg) ws.send(msg);
}

/** Build number plus a checksum of the move data: different copies refuse to start instead of desyncing. */
export function buildTag(): string {
  let h = GAME_BUILD;
  for (let k = 0; k < D.MvCount; k++) {
    h = hashMix(h, D.MvStartup[k] + 37 * D.MvActive[k] + 1009 * D.MvRecovery[k]);
    h = hashMix(h, D.MvDamage[k] + 31 * D.MvHitstun[k] + 997 * D.MvBlockstun[k]);
    h = hashMix(h, D.MvHbX[k] + 7 * D.MvHbY[k] + 101 * D.MvHbW[k] + 1013 * D.MvHbH[k]);
    h = hashMix(h, D.MvType[k] + 17 * D.MvLevel[k] + 409 * D.MvCost[k]);
    h = hashMix(h, clng(D.MvP1[k] * 10) + 503 * clng(D.MvP2[k] * 10));
  }
  return GAME_BUILD + "-" + (clng(h) >>> 0).toString(16).toUpperCase();
}

// ---------------------------------------------------------------- every game tick

export function pump(): void {
  mT++; mSilent++;
  if (mState === OS_FIGHT || mState === OS_RESULT) Lockstep.tickHeard();
  let n = 0;
  while (inbox.length > 0 && n++ < 64) {
    const msg = inbox.shift()!.trim();
    const p = msg.split(" ");
    if (!p[0]) continue;
    mSilent = 0;
    handle(p, msg);
    if (mState === OS_OFF || mState === OS_ERROR) return;
  }
  if (mSilent > SILENT_LIMIT && mState !== OS_CONNECT && mState !== OS_ERROR && mState !== OS_OFF) {
    if (mState === OS_LOBBY || mState === OS_FIGHT || mState === OS_RESULT) fail("CONNECTION LOST", "NO DATA FOR 10 SECONDS");
    else fail("SERVER NOT RESPONDING", "NO ANSWER FOR 10 SECONDS");
  }
}

function handle(p: string[], raw: string): void {
  if (handleServer(p)) return;
  switch (p[0]) {
    case "PICK":
      if (p.length >= 3 && mState === OS_LOBBY) {
        if (p.length >= 5) {
          mPeerSlot = clampSlot(+p[1]); mPeerPick[0] = clampSlot(+p[2]); mPeerPick[1] = clampSlot(+p[3]);
          mPeerStep = +p[4]; mPeerReady = mPeerStep >= 2;
        }
        if (p.length < 6 || p[5] !== buildTag()) fail("UPDATE NEEDED", "YOUR GAME VERSIONS DIFFER|BOTH RELOAD THE PAGE");
      }
      break;
    case "STAGE": if (p.length >= 2 && !mHost) mStage = (+p[1] || 0) % D.StageCount; break;
    case "PING": if (p.length >= 2) send("PONG " + p[1]); break;
    case "PONG": if (p.length >= 2) noteRtt(+p[1]); break;
    case "START":
      if (!mHost && p.length >= 7 && (mState === OS_LOBBY || mState === OS_RESULT))
        startFight(clampSlot(+p[1]), clampSlot(+p[2]), clampSlot(+p[3]), clampSlot(+p[4]), +p[5], +p[6]);
      break;
    case "BYE": fail("OPPONENT LEFT", ""); break;
    case "I": case "H":
      if (mState === OS_FIGHT || mState === OS_RESULT) {
        if (p[0] === "I") mHeardInput = true;
        Lockstep.receive(raw);
      }
      break;
  }
}

/** Messages from the game server itself (everything else is the partner's, relayed). */
function handleServer(p: string[]): boolean {
  switch (p[0]) {
    case "WELCOME":
      if ((mState !== OS_CONNECT && mState !== OS_ACCOUNT) || p.length < 4) return true;
      mRating = +p[2]; mGames = +p[3];
      if (mState === OS_ACCOUNT) { send("TOP"); return true; }
      if (mAction === ACT_QUICK) { send("QUEUE"); setState(OS_QUEUE); }
      else if (mAction === ACT_CASUAL) { send("QUEUE CASUAL"); setState(OS_QUEUE); }
      else if (mAction === ACT_ROOM) { send("ROOM"); setState(OS_ROOMWAIT); }
      else if (mAction === ACT_JOINROOM) { send("JOINROOM " + mRoomCode); setState(OS_ROOMWAIT); }
      else { send("TOP"); setState(OS_RANKING); }
      return true;
    case "ROOMCODE": if (p.length >= 2) mRoomCode = p[1]; return true;
    case "QUEUED": case "KEPT": return true;
    case "NOROOM": fail("NO SUCH ROOM", "CHECK THE CODE " + mRoomCode); return true;
    case "ERROR":
      if (mState === OS_ACCOUNT) { mRankErr = mTopN === 0; return true; }
      if (p.length >= 2) {
        if (p[1] === "VERSION") fail("UPDATE THE GAME", "THE SERVER RUNS A NEWER VERSION|RELOAD THE PAGE");
        else fail("SERVER REFUSED", p[1]);
      }
      return true;
    case "MATCHED":
      if (p.length < 6) return true;
      mMatchId = +p[1]; mHost = p[2] === "0"; mRanked = p[3] === "1";
      mOppName = p[4]; mOppRating = +p[5];
      mGameNo = 0; mRatingDelta = ""; mMyReady = false; mPeerReady = false; mStageChoosing = false;
      mMyStep = 0; mPeerStep = 0; mPeerSlot = mMySlot === 1 ? 0 : 1;
      setState(OS_LOBBY);
      return true;
    case "RATING": if (p.length >= 3) { mRating = +p[1]; mRatingDelta = p[2]; mGames++; } return true;
    case "TOP": {
      if (p.length < 2) return true;
      mTopN = Math.min(10, +p[1]); mTopGot = true;
      for (let k = 0; k < mTopN; k++) if (3 + k * 2 < p.length) { mTopName[k] = p[2 + k * 2]; mTopRating[k] = +p[3 + k * 2]; }
      for (let k = 2; k < p.length - 1; k++)
        if (p[k] === "ME" && k + 3 < p.length) { mMyRank = +p[k + 1]; mRating = +p[k + 2]; mGames = +p[k + 3]; }
      return true;
    }
  }
  return false;
}

function noteRtt(sentMs: number): void {
  const r = (performance.now() % 1e9) - sentMs;
  if (r < 0 || r > 5000) return;
  mRtt = mRtt < 0 ? r : mRtt * 0.8 + r * 0.2;
}

/** Lobby / waiting screens: input and periodic messages (GS_ONLINE). */
export function lobbyTick(): void {
  const back = () => K.isPressed(K.BTN_QUIT) || K.isPressed(K.BTN_HP);
  if (mState !== OS_ERROR && mState !== OS_ACCOUNT && mT % 40 === 20) send("KEEP");
  switch (mState) {
    case OS_ACCOUNT: accountTick(); break;
    case OS_CONNECT:
      if (ws && ws.readyState === WebSocket.OPEN && mT % 10 === 1) send("HELLO " + SRV_PROTO + " " + mName + " " + mToken);
      if (mT > SILENT_LIMIT) fail("SERVER NOT RESPONDING", "CANNOT REACH THE GAME SERVER");
      if (back()) leave();
      break;
    case OS_ROOMWAIT: case OS_QUEUE: if (back()) leave(); break;
    case OS_RANKING:
      if (mT % 100 === 0) send("TOP");
      if (mT > 5 && (K.isPressed(K.BTN_LP) || back())) leave();
      break;
    case OS_LOBBY:
      lobbyInput();
      if (mState !== OS_LOBBY) break;
      if (mT % 5 === 1) send("PICK " + mMySlot + " " + mMyPick[0] + " " + mMyPick[1] + " " + mMyStep + " " + buildTag());
      if (mT % 10 === 3) send("PING " + Math.floor(performance.now() % 1e9));
      if (mHost && mStageChoosing && mT % 10 === 5) send("STAGE " + mStage);
      break;
    case OS_RESULT:
      mResultT++;
      sendFightPackets();
      if (mResultT === 1 || mResultT === 6 || mResultT === 11) send("RESULT " + mMatchId + " " + mGameNo + " " + Match.matchWinner());
      if (mResultT >= (mRanked ? 80 : 60)) {
        Lockstep.finish();
        mMyReady = false; mPeerReady = false; mStageChoosing = false; mMyStep = 0; mPeerStep = 0; mMySlot = mMyPick[0];
        setState(OS_LOBBY);
      }
      break;
    case OS_ERROR:
      if (mT > 10 && (K.isPressed(K.BTN_LP) || back())) { mState = OS_OFF; G.GameState = GS_MENU; }
      break;
  }
}

function accountTick(): void {
  if (mFormOpen) return;
  if (ws && ws.readyState === WebSocket.OPEN && (!mHelloSent || mT % 100 === 0)) {
    mHelloSent = true;
    if (Account.loggedIn()) send("HELLO " + SRV_PROTO + " " + Account.name() + " " + Account.serverToken());
    else send("TOP");
  }
  if (K.isPressed(K.BTN_QUIT) || K.isPressed(K.BTN_HP)) { leave(); G.GameState = GS_MENU; Screens.openOnlineMenu(); return; }
  const form = (mode: "create" | "login") => {
    mFormOpen = true;
    AccountForm.open(mode).then((ok) => {
      mFormOpen = false;
      if (ok) { mName = Account.name(); mToken = Account.serverToken(); mHelloSent = false; }   // re-login to the server: my rank
    });
  };
  if (Account.loggedIn()) {
    if (K.isPressed(K.BTN_LK)) { Account.logOut(); mName = ""; mMyRank = 0; mHelloSent = false; }
  } else if (K.isPressed(K.BTN_LP)) form("create");
  else if (K.isPressed(K.BTN_LK)) form("login");
}

function lobbyInput(): void {
  Screens.tickMenu();
  if (K.isPressed(K.BTN_QUIT)) { leave(); return; }
  if (mStageChoosing) {
    if (K.isPressed(K.BTN_LEFT)) mStage = (mStage + D.StageCount - 1) % D.StageCount;
    if (K.isPressed(K.BTN_RIGHT)) mStage = (mStage + 1) % D.StageCount;
    if (K.isPressed(K.BTN_HP)) { mStageChoosing = false; mMyReady = false; mMyStep = 1; }
    if (K.isPressed(K.BTN_LP)) { hostStart(); return; }
    if (!mPeerReady) mStageChoosing = false;
    return;
  }
  if (mMyStep < 2) {
    const n = openCount();
    let k = mMySlot >= n ? 0 : mMySlot;
    if (K.isPressed(K.BTN_LEFT)) k = (k + n - 1) % n;
    if (K.isPressed(K.BTN_RIGHT)) k = (k + 1) % n;
    if (K.isPressed(K.BTN_UP) || K.isPressed(K.BTN_DOWN)) { k = (k + 4) % 8; if (k >= n) k -= 4; }
    mMySlot = k;
    if (K.isPressed(K.BTN_LP) && slotOpen(k) && !(mMyStep === 1 && k === mMyPick[0])) { mMyPick[mMyStep] = k; mMyStep++; }
    else if (K.isPressed(K.BTN_HP) && mMyStep > 0) mMyStep--;
  } else if (K.isPressed(K.BTN_HP)) mMyStep = 1;
  mMyReady = mMyStep >= 2;
  if (mHost && mMyReady && mPeerReady) mStageChoosing = true;
}

const openCount = () => (mCasual || Arcade.bossUnlocked() ? ROSTER_ON : ROSTER_ON - 1);
const clampSlot = (k: number) => (k >= 0 && k < ROSTER_ON ? k : 0);
const slotOpen = (k: number) => k < 6 || mCasual || Arcade.bossUnlocked();

function gridPos(k: number): [number, number] {
  if (k < 4) return [64 + k * 16, 22];
  const below = openCount() - 4;
  return [64 + (4 - below) * 8 + (k - 4) * 16, 44];
}

function hostStart(): void {
  mDelay = mRtt < 0 ? 3 : Math.max(2, Math.min(6, Math.floor(mRtt / 50) + 2));
  mStartMsg = "START " + mMyPick[0] + " " + mMyPick[1] + " " + mPeerPick[0] + " " + mPeerPick[1] + " " + mStage + " " + mDelay;
  send(mStartMsg);
  startFight(mMyPick[0], mMyPick[1], mPeerPick[0], mPeerPick[1], mStage, mDelay);
}

function startFight(h1: number, h2: number, g1: number, g2: number, stage: number, delay: number): void {
  G.P1Char = Screens.rosterPrefix(h1); G.P1Char2 = Screens.rosterPrefix(h2);
  G.P2Char = Screens.rosterPrefix(g1); G.P2Char2 = Screens.rosterPrefix(g2);
  G.StageIndex = (stage || 0) % D.StageCount;
  G.GameMode = MODE_TAG; G.Multi = false; G.WatchMode = false;
  startMatch(0);
  setControl(mHost ? 0 : 1);
  mDelay = delay; mHeardInput = false; mResultT = 0;
  Lockstep.begin(mHost ? 0 : 1, delay);
  setState(OS_FIGHT);
}

// ---------------------------------------------------------------- during the fight

export function sendFightPackets(): void {
  if (!Lockstep.active()) return;
  send(Lockstep.outPacket());
  send(Lockstep.outHash());
  if (mHost && !mHeardInput && mT % 10 === 0 && mStartMsg) send(mStartMsg);
}

export function afterFrame(): void {
  if (mState !== OS_FIGHT) return;
  if (Lockstep.desyncFrame() >= 0) {
    fail("SYNC ERROR", "THE TWO GAMES DIFFER FROM FRAME " + Lockstep.desyncFrame() + "|" + Lockstep.desyncDetail());
    return;
  }
  if (Match.phase() === MP_MATCHEND && Match.phaseTicks() >= 50) {
    mState = OS_RESULT; mResultT = 0; mGameNo++; mRatingDelta = "";
    G.GameState = GS_ONLINE;
  }
}

export function renderOverlay(): void {
  if (Lockstep.frame() < 80) {
    const t = mRtt >= 0 ? "PING " + Math.round(mRtt) + "MS  DELAY " + mDelay : "DELAY " + mDelay;
    Font.drawText(t, SCREEN_W / 2, 93, RGB(120, 110, 140), 1, 1);
  }
  if (Lockstep.ticksSinceHeard() > 10) Font.drawBig("WAITING FOR OPPONENT", SCREEN_W / 2, 44, RGB(255, 236, 190), 1);
}

// ---------------------------------------------------------------- screens

const cGold = RGB(240, 190, 80), cDim = RGB(130, 120, 150), cHint = RGB(110, 100, 130), cHi = RGB(255, 236, 190);

export function render(): void {
  const cx = SCREEN_W / 2, blink = Math.trunc(mT / 10) % 2 === 0;
  R.beginFrame(true);
  R.fillRect(0, 0, SCREEN_W, SCREEN_H, RGB(12, 10, 22));
  switch (mState) {
    case OS_CONNECT:
      Font.drawBig("ONLINE", cx, 4, cGold, 1);
      if (blink) Font.drawText("CONNECTING TO THE SERVER...", cx, 44, cHi, 1, 1);
      Font.drawText("S = CANCEL", cx, 92, cHint, 1, 1);
      break;
    case OS_ROOMWAIT:
      if (mAction === ACT_JOINROOM) {
        Font.drawBig("JOIN ROOM", cx, 4, cGold, 1);
        Font.drawText("JOINING ROOM", cx, 30, cDim, 1, 1);
        Font.drawBig(mRoomCode, cx, 40, RGB(255, 240, 210), 3);
      } else {
        Font.drawBig("ROOM", cx, 4, cGold, 1);
        Font.drawText("TELL YOUR FRIEND THIS CODE", cx, 24, cDim, 1, 1);
        if (mRoomCode) Font.drawBig(mRoomCode, cx, 36, RGB(255, 240, 210), 3);
        Font.drawText("ONLINE > ROOM CODE > JOIN ROOM", cx, 62, cDim, 1, 1);
        if (blink) Font.drawText("WAITING FOR YOUR FRIEND...", cx, 74, cHi, 1, 1);
      }
      Font.drawText("S = CANCEL", cx, 92, cHint, 1, 1);
      break;
    case OS_QUEUE:
      Font.drawBig(mCasual ? "QUICK MATCH" : "RANK GAME", cx, 4, cGold, 1);
      Font.drawText(mCasual ? mName + "  FRIENDLY MATCH" : mName + "  RATING " + mRating, cx, 26, RGB(200, 190, 210), 1, 1);
      if (blink) Font.drawText("SEARCHING FOR AN OPPONENT...", cx, 44, cHi, 1, 1);
      Font.drawText(Math.trunc(mT / 20) + " S", cx, 56, cDim, 1, 1);
      Font.drawText("S = CANCEL", cx, 92, cHint, 1, 1);
      break;
    case OS_RANKING: rankingRender(); break;
    case OS_ACCOUNT: accountRender(); break;
    case OS_LOBBY: lobbyRender(); break;
    case OS_RESULT:
      Font.drawBig("MATCH OVER", cx, 34, RGB(255, 204, 92), 2);
      if (mRanked) {
        if (mRatingDelta) Font.drawBig("RATING " + mRating + " (" + mRatingDelta + ")", cx, 54, mRatingDelta[0] === "-" ? RGB(255, 110, 90) : RGB(120, 230, 140), 1);
        else Font.drawText("SENDING RESULT...", cx, 56, cDim, 1, 1);
      }
      Font.drawText("BACK TO FIGHTER SELECT...", cx, 70, cDim, 1, 1);
      break;
    case OS_ERROR: {
      const p = mMsg.split("|");
      Font.drawBig(p[0], cx, 30, RGB(255, 90, 70), 1);
      for (let k = 1; k < Math.min(p.length, 4); k++) Font.drawText(p[k], cx, 36 + k * 10, RGB(200, 190, 210), 1, 1);
      Font.drawText("A = MENU", cx, 92, cHint, 1, 1);
      break;
    }
  }
  R.flush();
}

function accountRender(): void {
  const cx = SCREEN_W / 2;
  Font.drawBig("RANKING", cx, 2, cGold, 1);
  if (mTopN === 0) Font.drawText(mTopGot ? "NO RANKED GAMES YET" : mRankErr || mT > 100 ? "RANKING UNAVAILABLE (SERVER OFFLINE)" : "LOADING...", cx, 36, cDim, 1, 1);
  for (let k = 0; k < mTopN; k++) {
    const y = 14 + k * 6, c = Account.loggedIn() && mTopName[k] === Account.name() ? RGB(255, 236, 150) : RGB(210, 200, 220);
    Font.drawText(String(k + 1), 60, y, cDim, 1, 2);
    Font.drawText(mTopName[k], 66, y, c);
    Font.drawText(String(mTopRating[k]), 132, y, c, 1, 2);
  }
  R.fillRect(20, 76, SCREEN_W - 40, 1, RGB(60, 52, 76));
  if (Account.loggedIn()) {
    const rank = mMyRank > 0 ? "RANK " + mMyRank + "  " : "";
    Font.drawText("YOU  " + Account.name() + "  " + rank + mRating, cx, 80, RGB(255, 236, 150), 1, 1);
    Font.drawText("Z = LOG OUT   S = BACK", cx, 92, cHint, 1, 1);
  } else if (!Account.configured()) {
    Font.drawText("ACCOUNTS ARE NOT SET UP YET", cx, 80, RGB(255, 140, 90), 1, 1);
    Font.drawText("S = BACK", cx, 92, cHint, 1, 1);
  } else {
    if (Math.trunc(mT / 10) % 2 === 0) Font.drawText("A = CREATE ACCOUNT", cx, 80, cHi, 1, 1);
    Font.drawText("Z = LOG IN   S = BACK", cx, 92, cHint, 1, 1);
  }
}

function rankingRender(): void {
  const cx = SCREEN_W / 2;
  Font.drawBig("RANKING", cx, 3, cGold, 1);
  if (mTopN === 0) Font.drawText("NO RANKED GAMES YET", cx, 40, cDim, 1, 1);
  for (let k = 0; k < mTopN; k++) {
    const y = 16 + k * 7, c = mTopName[k] === mName ? RGB(255, 236, 150) : RGB(210, 200, 220);
    Font.drawText(String(k + 1), 56, y, cDim, 1, 2);
    Font.drawText(mTopName[k], 62, y, c);
    Font.drawText(String(mTopRating[k]), 136, y, c, 1, 2);
  }
  if (mMyRank > 0) Font.drawText("YOU  RANK " + mMyRank + "  " + mName + "  " + mRating, cx, 86, RGB(255, 236, 150), 1, 1);
  else Font.drawText("YOU  " + mName + "  " + mRating + "  (PLAY A RANKED GAME)", cx, 86, RGB(200, 190, 210), 1, 1);
  Font.drawText("A = BACK", cx, 93, cHint, 1, 1);
}

const shownSlot = (mine: boolean) => (mine ? (mMyStep === 0 ? mMySlot : mMyPick[0]) : mPeerStep === 0 ? mPeerSlot : mPeerPick[0]);

function teamLine(host: boolean): string {
  const mine = host === mHost;
  const stp = mine ? mMyStep : mPeerStep, b = mine ? mMyPick[1] : mPeerPick[1], cur = mine ? mMySlot : mPeerSlot;
  return stp === 0 ? "" : stp === 1 ? "+ " + Screens.rosterName(cur) + "?" : "+ " + Screens.rosterName(b) + " READY";
}

function lobbyRender(): void {
  const cx = SCREEN_W / 2, blink = Math.trunc(mT / 5) % 2 === 0;
  if (mStageChoosing) { Screens.drawStagePage(mStage, "LEFT RIGHT = SELECT  A = FIGHT  S = BACK", true); return; }
  if (!mHost && mMyReady && mPeerReady) { Screens.drawStagePage(mStage, "THE HOST IS CHOOSING THE STAGE  S = BACK", false); return; }
  R.fillRect(0, 10, 64, 90, RGB(14, 20, 40)); R.fillRect(128, 10, 64, 90, RGB(40, 14, 18));
  R.fillRect(63, 10, 1, 90, RGB(90, 170, 255)); R.fillRect(128, 10, 1, 90, RGB(255, 90, 80));
  Font.drawBig(mRanked ? "RANKED MATCH" : mCasual ? "FRIENDLY MATCH" : "ONLINE VERSUS", cx, 2, cGold, 1);
  Font.drawText(mHost ? mName : mOppName, 3, 13, RGB(90, 170, 255));
  Font.drawText(mHost ? mOppName : mName, SCREEN_W - 3, 13, RGB(255, 90, 80), 1, 2);
  if (mRanked) {
    Font.drawText(String(mHost ? mRating : mOppRating), 3, 19, cDim);
    Font.drawText(String(mHost ? mOppRating : mRating), SCREEN_W - 3, 19, cDim, 1, 2);
  }
  const me = shownSlot(true), other = shownSlot(false);
  Screens.drawBigView(Screens.rosterPrefix(mHost ? me : other), 32, false, 0, 63);
  Screens.drawBigView(Screens.rosterPrefix(mHost ? other : me), 160, true, 129, SCREEN_W - 1, me === other);
  Font.drawText(teamLine(mHost), 3, 25, cHi);
  Font.drawText(teamLine(!mHost), SCREEN_W - 3, 25, cHi, 1, 2);
  for (let k = 0; k < openCount(); k++) {
    const [x, y] = gridPos(k);
    Screens.drawPortraitAt(k, x, y, 15);
    let c = RGB(70, 60, 90);
    if (k === mPeerSlot) c = RGB(255, 90, 80);
    if ((mMyStep >= 1 && k === mMyPick[0]) || (mMyStep >= 2 && k === mMyPick[1])) c = RGB(180, 140, 60);
    if (k === mMySlot && (blink || mMyReady)) c = cGold;
    R.drawRectOutline(x, y, 15, 20, c);
    if (k === mMySlot) R.drawRectOutline(x - 1, y - 1, 17, 22, c);
  }
  Font.drawBig(Screens.rosterName(mMySlot), cx, 68, RGB(255, 240, 210), 1);
  if (mMyStep < 2) Font.drawText("PICK FIGHTER " + (mMyStep + 1) + " OF 2", cx, 78, RGB(200, 190, 210), 1, 1);
  if (mMyReady && mPeerReady) {
    Font.drawText("HOST: " + D.StageName[mStage], cx, 78, cHi, 1, 1);
    Font.drawText("HOST IS CHOOSING THE STAGE", cx, 93, RGB(150, 140, 170), 1, 1);
  } else if (mMyReady) {
    Font.drawText("WAITING FOR OPPONENT", cx, 78, cHi, 1, 1);
    Font.drawText("S = CHANGE", cx, 93, RGB(150, 140, 170), 1, 1);
  } else Font.drawText(mMyStep === 1 ? "A = OK  S = BACK" : "A = OK  ESC = LEAVE", cx, 93, RGB(150, 140, 170), 1, 1);
  if (mRtt >= 0) Font.drawText("PING " + Math.round(mRtt) + "MS", cx, 86, cHint, 1, 1);
}

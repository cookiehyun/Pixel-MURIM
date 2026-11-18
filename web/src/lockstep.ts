// Port of Lockstep.bas: deterministic lockstep with input delay. Both peers exchange only their raw
// key bits per tick; tick N runs only when both inputs for N are known.
//   I <first frame> <ack> <hex4> ...   local inputs for frames first, first+1, ...
//   H <frame> <hash> <detail>          state hash after running <frame>
import { F, feedRaw, stateHash } from "./fighter";
import * as Tag from "./tag";
import * as Match from "./match";
import * as Combat from "./combat";

const BUF = 256, WINDOW = 8;
export const HASH_EVERY = 20;

let mOn = false, mLocal = 0, mDelay = 3, mFrame = 0, mNextLocal = 0, mRemoteNeed = 0, mRemoteAck = 0;
const mIn = [new Array<number>(BUF).fill(0), new Array<number>(BUF).fill(0)];
const mHas = [new Array<number>(BUF).fill(-1), new Array<number>(BUF).fill(-1)];
const mMyHash = new Array<number>(BUF).fill(0), mMyHashF = new Array<number>(BUF).fill(-1);
const mTheirHash = new Array<number>(BUF).fill(0), mTheirHashF = new Array<number>(BUF).fill(-1);
const mMyDet = new Array<string>(BUF).fill(""), mTheirDet = new Array<string>(BUF).fill("");
let mDesyncMine = "", mDesyncTheirs = "", mHashOut = "", mDesyncFrame = -1, mStalls = 0, mLastHeard = 0, mPendPress = 0;

export function begin(localIndex: number, delay: number): void {
  mOn = true; mLocal = localIndex;
  mDelay = Math.max(1, Math.min(10, delay));
  mFrame = 0; mRemoteAck = 0;
  mDesyncMine = ""; mDesyncTheirs = ""; mDesyncFrame = -1; mStalls = 0; mLastHeard = 0; mHashOut = ""; mPendPress = 0;
  for (let s = 0; s <= 1; s++) { mHas[s].fill(-1); mIn[s].fill(0); }
  mMyHashF.fill(-1); mTheirHashF.fill(-1); mMyDet.fill(""); mTheirDet.fill("");
  for (let k = 0; k < mDelay; k++) { store(mLocal, k, 0); store(1 - mLocal, k, 0); }
  mNextLocal = mDelay; mRemoteNeed = mDelay;
}

export function finish(): void { mOn = false; }
export const active = () => mOn;
export const localIndex = () => mLocal;
export const frame = () => mFrame;
export const delay = () => mDelay;
export const stalls = () => mStalls;
export const desyncFrame = () => mDesyncFrame;
export const desyncDetail = () => "ME " + mDesyncMine + "|PEER " + mDesyncTheirs;
export const ticksSinceHeard = () => mLastHeard;

function store(side: number, f: number, raw: number): void { mIn[side][f % BUF] = raw; mHas[side][f % BUF] = f; }
const known = (side: number, f: number) => mHas[side][f % BUF] === f;

/** Local keys sampled this tick, used for frame + delay. While stalled, taps are kept for later. */
export function captureLocal(raw: number): void {
  if (!mOn) return;
  if (mNextLocal > mFrame + mDelay) { mPendPress |= raw & 0x10f0; return; }
  store(mLocal, mNextLocal, raw | mPendPress);
  mPendPress = 0;
  mNextLocal++;
}

export const ready = () => mOn && known(0, mFrame) && known(1, mFrame);
export function noteStall(): void { mStalls++; }
export function tickHeard(): void { mLastHeard++; }

export function feedFrame(): void {
  feedRaw(0, mIn[0][mFrame % BUF]);
  feedRaw(1, mIn[1][mFrame % BUF]);
}

export const currentRaw = (side: number) => mIn[side][mFrame % BUF];

export function stateDetail(): string {
  let s = "";
  const n = Tag.active() ? 3 : 1;
  for (let i = 0; i <= n; i++) {
    s += F[i].prefix.slice(0, 2) + F[i].health;
    if (i < 2) s += "X" + Math.round(F[i].x) + "S" + F[i].state;
    s += ",";
  }
  return s + "P" + Match.phase() + "T" + Match.phaseTicks() + "H" + Combat.C.HitStop + "F" + Combat.C.SuperFreeze;
}

export function endFrame(): void {
  if (mFrame % HASH_EVERY === 0) {
    const k = mFrame % BUF;
    mMyHash[k] = stateHash(); mMyHashF[k] = mFrame; mMyDet[k] = stateDetail();
    mHashOut = "H " + mFrame + " " + mMyHash[k] + " " + mMyDet[k];
    compareHash(mFrame);
  }
  mFrame++;
}

function compareHash(f: number): void {
  const k = f % BUF;
  if (mMyHashF[k] === f && mTheirHashF[k] === f && mMyHash[k] !== mTheirHash[k] && mDesyncFrame < 0) {
    mDesyncFrame = f; mDesyncMine = mMyDet[k]; mDesyncTheirs = mTheirDet[k];
  }
}

export function outPacket(): string {
  if (!mOn) return "";
  let f0 = Math.max(0, mNextLocal - WINDOW, mRemoteAck);
  if (f0 >= mNextLocal) return "I " + mNextLocal + " " + mRemoteNeed;
  let s = "I " + f0 + " " + mRemoteNeed;
  for (; f0 < mNextLocal; f0++) s += " " + mIn[mLocal][f0 % BUF].toString(16).toUpperCase().padStart(4, "0");
  return s;
}

export function outHash(): string { const s = mHashOut; mHashOut = ""; return s; }

export function receive(pkt: string): void {
  if (!mOn || pkt.length < 3) return;
  const p = pkt.split(" ");
  mLastHeard = 0;
  const rs = 1 - mLocal;
  if (p[0] === "I") {
    const f0 = +p[1];
    if (+p[2] > mRemoteAck) mRemoteAck = +p[2];
    for (let k = 3; k < p.length; k++) {
      const f = f0 + k - 3;
      if (f >= mFrame && f < mFrame + BUF - 16 && !known(rs, f)) store(rs, f, parseInt(p[k], 16) || 0);
    }
    while (known(rs, mRemoteNeed)) mRemoteNeed++;
  } else if (p[0] === "H") {
    const f = +p[1], k = f % BUF;
    mTheirHash[k] = +p[2]; mTheirHashF[k] = f; mTheirDet[k] = p.length >= 4 ? p[3] : "?";
    compareHash(f);
  }
}

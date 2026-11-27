// Port of KeyInput.bas for the browser: keyboard (Windows virtual-key codes, like the Excel version)
// plus on-screen touch buttons that press the same logical buttons.

export const BTN_LEFT = 0, BTN_RIGHT = 1, BTN_UP = 2, BTN_DOWN = 3, BTN_LP = 4, BTN_HP = 5, BTN_LK = 6, BTN_HK = 7;
export const BTN_QUIT = 8, BTN_SWAP = 9, BTN_DBG_HIT = 10, BTN_DBG_DOWN = 11, BTN_DBG_DUMMY = 12, BTN_DBG_BOX = 13;
export const BTN_TAG = 14, BTN_M1 = 15, BTN_M2 = 24, BTN_COUNT = 33;

const vk = new Array<number>(BTN_COUNT).fill(0);
const cur = new Array<boolean>(BTN_COUNT).fill(false);
const prev = new Array<boolean>(BTN_COUNT).fill(false);
const keyDown = new Set<number>();
const keyLatch = new Set<number>();            // pressed since the last poll (taps shorter than a tick)
const touchDown = new Array<boolean>(BTN_COUNT).fill(false);
const touchLatch = new Array<boolean>(BTN_COUNT).fill(false);
// RAF can owe several 60 Hz steps. Replay each physical edge at the first
// simulation deadline following the DOM event, including down/up between polls.
type Edge = { time: number; code: number; down: boolean; touch: boolean };
const pending: Edge[] = [];
const sampledKeys = new Set<number>(), sampledTouch = new Set<number>();

function record(code: number, down: boolean, timestamp: number, touch = false): void {
  // RAF deadlines and modern DOM event timestamps are relative to timeOrigin.
  // Older browsers can report epoch milliseconds instead.
  const time = timestamp >= performance.timeOrigin ? timestamp - performance.timeOrigin : timestamp;
  const edge = {time, code, down, touch};
  // Keyboard and pointer tasks may arrive out of timestamp order. Preserve
  // delivery order on ties and keep a future edge from hiding an older one.
  let i = pending.length;
  while (i > 0 && pending[i - 1].time > time) i--;
  pending.splice(i, 0, edge);
}

function clearKeys(timestamp = performance.now()): void {
  for (const code of keyDown) record(code, false, timestamp);
  keyDown.clear();
}

let lastKey = 0;
let focusLost = false;
let suspended = false;                         // a text form is open: keys go to it, not the game

export function setSuspended(v: boolean): void { suspended = v; clearKeys(); keyLatch.clear(); }

export function init(): void {
  vk[BTN_LEFT] = 0x25; vk[BTN_UP] = 0x26; vk[BTN_RIGHT] = 0x27; vk[BTN_DOWN] = 0x28;
  vk[BTN_LP] = 0x41; vk[BTN_HP] = 0x53; vk[BTN_LK] = 0x5a; vk[BTN_HK] = 0x58;
  vk[BTN_QUIT] = 0x1b; vk[BTN_SWAP] = 0x09; vk[BTN_DBG_HIT] = 0x48; vk[BTN_DBG_DOWN] = 0x4a;
  vk[BTN_DBG_DUMMY] = 0x44; vk[BTN_DBG_BOX] = 0x70; vk[BTN_TAG] = 0x43;
  window.addEventListener("keydown", (e) => {
    if (suspended) return;
    if (e.keyCode === 9 || e.keyCode === 0x70 || (e.keyCode >= 0x25 && e.keyCode <= 0x28) || e.keyCode === 32) e.preventDefault();
    if (!keyDown.has(e.keyCode)) { record(e.keyCode, true, e.timeStamp); keyLatch.add(e.keyCode); lastKey = e.keyCode; }
    keyDown.add(e.keyCode);
  });
  window.addEventListener("keyup", (e) => { if (keyDown.delete(e.keyCode)) record(e.keyCode, false, e.timeStamp); });
  window.addEventListener("blur", (e) => { clearKeys(e.timeStamp); focusLost = true; });
}

export function setVK(b: number, code: number): void { vk[b] = code; }
export function getVK(b: number): number { return vk[b]; }

/** Key config: the key that went down since the previous call (0 = none). */
export function scanKey(): number {
  const k = lastKey;
  lastKey = 0;
  return k;
}

/** Button index of a logical control (0..8) in key set ks (0 single player, 1 / 2 multiplayer). */
export function keyOf(ks: number, logical: number): number {
  return ks === 1 ? BTN_M1 + logical : ks === 2 ? BTN_M2 + logical : logical;
}

const edges = new Array<boolean>(BTN_COUNT).fill(false);

export function poll(fast = false, deadline = Infinity): void {
  // Reuse the legacy latches at 20 Hz. Maintain the sampled state across
  // menu/fight transitions without carrying old button presses into a match.
  if (fast) {
    keyLatch.clear();
    touchLatch.fill(false);
  }
  // A late edge belongs to the next unprocessed step. Never rewind a frame;
  // removing the consumed prefix prevents replay on the following step.
  let used = 0;
  while (used < pending.length && (!fast || pending[used].time <= deadline + 1e-6)) {
    const edge = pending[used++];
    const held = edge.touch ? sampledTouch : sampledKeys;
    if (edge.down) {
      held.add(edge.code);
      if (fast && edge.touch) touchLatch[edge.code] = true;
      if (fast && !edge.touch) keyLatch.add(edge.code);
    } else held.delete(edge.code);
  }
  if (used) pending.splice(0, used);
  for (let i = 0; i < BTN_COUNT; i++) {
    prev[i] = cur[i];
    const held = fast ? sampledKeys.has(vk[i]) || sampledTouch.has(i) : keyDown.has(vk[i]) || touchDown[i];
    const latched = keyLatch.has(vk[i]) || touchLatch[i];
    cur[i] = held || latched;
    edges[i] = cur[i] && (!prev[i] || (fast && latched));
    touchLatch[i] = false;
  }
  keyLatch.clear();
}

export function consumeFocusLost(): boolean {
  const f = focusLost;
  focusLost = false;
  return f;
}

export const isDown = (b: number) => cur[b];
export const isPressed = (b: number) => edges[b];

/** Touch controls: hold / release a logical button (also latched so a quick tap is never lost). */
export function touch(b: number, down: boolean, timestamp: number): void {
  if (down !== touchDown[b]) record(b, down, timestamp, true);
  if (down && !touchDown[b]) touchLatch[b] = true;
  touchDown[b] = down;
}

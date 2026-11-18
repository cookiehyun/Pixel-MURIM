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
let lastKey = 0;
let focusLost = false;

export function init(): void {
  vk[BTN_LEFT] = 0x25; vk[BTN_UP] = 0x26; vk[BTN_RIGHT] = 0x27; vk[BTN_DOWN] = 0x28;
  vk[BTN_LP] = 0x41; vk[BTN_HP] = 0x53; vk[BTN_LK] = 0x5a; vk[BTN_HK] = 0x58;
  vk[BTN_QUIT] = 0x1b; vk[BTN_SWAP] = 0x09; vk[BTN_DBG_HIT] = 0x48; vk[BTN_DBG_DOWN] = 0x4a;
  vk[BTN_DBG_DUMMY] = 0x44; vk[BTN_DBG_BOX] = 0x70; vk[BTN_TAG] = 0x43;
  window.addEventListener("keydown", (e) => {
    if (e.keyCode === 9 || e.keyCode === 0x70 || (e.keyCode >= 0x25 && e.keyCode <= 0x28) || e.keyCode === 32) e.preventDefault();
    if (!keyDown.has(e.keyCode)) { keyLatch.add(e.keyCode); lastKey = e.keyCode; }
    keyDown.add(e.keyCode);
  });
  window.addEventListener("keyup", (e) => keyDown.delete(e.keyCode));
  window.addEventListener("blur", () => { keyDown.clear(); focusLost = true; });
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

export function poll(): void {
  for (let i = 0; i < BTN_COUNT; i++) {
    prev[i] = cur[i];
    cur[i] = keyDown.has(vk[i]) || keyLatch.has(vk[i]) || touchDown[i] || touchLatch[i];
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
export const isPressed = (b: number) => cur[b] && !prev[b];

/** Touch controls: hold / release a logical button (also latched so a quick tap is never lost). */
export function touch(b: number, down: boolean): void {
  if (down && !touchDown[b]) touchLatch[b] = true;
  touchDown[b] = down;
}

import { loadAll, D, moveId } from "./data";
import * as Account from "./account";
import * as K from "./input";
import * as R from "./renderer";
import { gameInit, gameTick, gameRender, G, startMatch, MODE_TRAINING } from "./game";
import * as Fighter from "./fighter";
import { C } from "./combat";
import { setupTouch } from "./touch";
import * as KF from "./kfont";
import * as Story from "./story";
import * as FM from "./fieldmap";

const TICK_MS = 50;                    // 20 ticks per second, like the Excel version

async function main(): Promise<void> {
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  // the big story pictures load in the background; the story waits for them only when it needs them
  FM.preload();
  await Promise.all([loadAll(), KF.load(), Story.load(), Account.init()]);
  K.init();
  R.init(canvas);
  gameInit();
  setupTouch();
  (window as unknown as Record<string, unknown>).__pm = { G, F: Fighter.F, C, startMatch, MODE_TRAINING, debugStart: Fighter.debugStart, tick: gameTick, render: gameRender, setDummy: Fighter.setDummy, story: Story, D, moveId };
  document.getElementById("loading")?.remove();
  let acc = 0, last = performance.now();
  const frame = (now: number) => {
    acc += Math.min(250, now - last);
    last = now;
    let ran = false;
    while (acc >= TICK_MS) { gameTick(); acc -= TICK_MS; ran = true; }
    if (ran) gameRender();
    requestAnimationFrame(frame);
  };
  gameRender();
  requestAnimationFrame(frame);
}

main().catch((e) => {
  const el = document.getElementById("loading");
  if (el) el.textContent = "LOAD ERROR: " + e;
  console.error(e);
});

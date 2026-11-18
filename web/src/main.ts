import { loadAll } from "./data";
import * as K from "./input";
import * as R from "./renderer";
import { gameInit, gameTick, gameRender } from "./game";
import { setupTouch } from "./touch";

const TICK_MS = 50;                    // 20 ticks per second, like the Excel version

async function main(): Promise<void> {
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  await loadAll();
  K.init();
  R.init(canvas);
  gameInit();
  setupTouch();
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

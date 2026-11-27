import { loadAll, D, moveId } from "./data";
import * as Account from "./account";
import * as K from "./input";
import * as R from "./renderer";
import { gameInit, gameTick, stepMs, gameRender, G, startMatch, MODE_TRAINING } from "./game";
import * as Fighter from "./fighter";
import * as combat from "./combat";
import * as tag from "./tag";
import * as arcade from "./arcade";
import * as lockstep from "./lockstep";
import * as projectile from "./projectile";
import { setupTouch } from "./touch";
import * as KF from "./kfont";
import * as Story from "./story";
import * as FM from "./fieldmap";

// Debug scripts historically advance 50 ms per call. Use the same steps as RAF.
function debugTick(): void {
  const count = Math.round(50 / stepMs());
  for (let i = 0; i < count; i++) {
    gameTick();
    if (stepMs() === 50) break;
  }
}

async function main(): Promise<void> {
  const canvas = document.getElementById("screen") as HTMLCanvasElement;
  // the big story pictures load in the background; the story waits for them only when it needs them
  FM.preload();
  await Promise.all([loadAll(), KF.load(), Story.load(), Account.init()]);
  K.init();
  R.init(canvas);
  gameInit();
  setupTouch();
  (window as unknown as Record<string, unknown>).__pm = { G, F: Fighter.F, C: combat.C, fighter: Fighter, combat, tag, arcade, lockstep, projectile, startMatch, MODE_TRAINING, debugStart: Fighter.debugStart, tick: debugTick, render: gameRender, setDummy: Fighter.setDummy, story: Story, D, moveId };
  document.getElementById("loading")?.remove();
  let acc = 0, last = performance.now();
  const frame = (now: number) => {
    acc += Math.min(250, now - last);
    last = now;
    let ran = false;
    while (acc + 1e-8 >= stepMs()) {
      const elapsed = stepMs();
      acc = Math.max(0, acc - elapsed);
      gameTick(now - acc);
      ran = true;
      // After a browser stall, present this footstep before advancing the formation again.
      if (acc >= 50 && Story.presentingMarch()) { acc %= 50; break; }
    }
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

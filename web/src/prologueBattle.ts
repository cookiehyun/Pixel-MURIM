// The rock/sand boundary in blood_battlefield is at y=82. Every actor shares
// one of the three horizontal ground lines below it, including both duelists.
import * as R from "./renderer";
import * as FX from "./fx";
import { D, spriteId } from "./data";
import type { Look } from "./field";
import { RGB } from "./util";

const rear = { y: 83, zoom: 1 };
const middle = { y: 89, zoom: 1.65 };
const front = { y: 96, zoom: 2 };
type Lane = typeof front;
const bossX = 177;
const strikeAt = 88;
const commandAt = 12;
const releaseAt = commandAt + 10;
const stride = (tick: number, period: number) => Math.floor(tick / period) % 2;
const travel = (x: number) => Math.round((bossX - x) / 6);
const phase = (t: number, i: number) => (t + 11 * i) % (35 + i % 4 * 4);

// A monk's shipped run has his knees bent and fists up. Let monks advance and
// evade while armed guards use the game's sword strikes, guards and knockdowns.
const bouts = [
  { x: 51,  lane: middle, monk: true,  delay: 7, dir: -1 },
  { x: 108, lane: middle, monk: false, delay: 4, dir: -1 },
  { x: 153, lane: middle, monk: false, delay: -1, dir: 1 },
  { x: 11,  lane: front,  monk: true,  delay: -1, dir: 1 },
  { x: 68,  lane: front,  monk: false, delay: 8, dir: 1 },
  { x: 129, lane: front,  monk: true,  delay: 0, dir: 1 },
];
type Bout = typeof bouts[number];

// One scale per body, across all poses. Compare uncovered head, shoulder-to-hip
// and shin against the guard's 40 px neutral body; swords and hoods extend above it.
const cultistScale = 1.22, monkScale = 1.27, gangsiScale = 1.08;
function draw(name: string, x: number, lane: Lane, left: boolean, bodyScale = 1, skin = 0, tint = -1): void {
  R.drawSprite(spriteId(name), Math.round(x), lane.y, left, tint, skin, bodyScale * lane.zoom);
}

function ranks(origin: number, t: number, guard: Look): void {
  for (const start of [-4, 44, 91, 139]) {
    for (let i = 0; i < 7; i++) {
      const b = phase(t + start + 20, i);
      const enemy = i % 2 === 1;
      const name = enemy ? "sd_cultist." + (b < 13 ? "atk_0" : "idle_0") :
        i % 4 ? "sd_monk.run_" + stride(t + i, 7) : guard[0] + (b < 16 ? ".guard" : ".idle_0");
      draw(name, origin + start + i * 4.7 + Math.sin((i * 11 + t) / 13), rear, enemy,
        enemy ? cultistScale : i % 4 ? monkScale : 1, 0, enemy ? RGB(46, 25, 30) : RGB(57, 37, 42));
    }
  }
}

function gap(lane: Lane): number { return lane === front ? 17 : 14; }
export function battleContacts(origin: number, t: number): void {
  bouts.forEach(({x, lane, dir, monk}, i) => {
    if (t >= strikeAt + travel(x)) return;
    const beat = phase(t, i);
    if ((!monk && beat === 9) || beat === 23)
      FX.spawn(origin + x + dir * gap(lane) / 2, lane.y - Math.round(6.5 * lane.zoom),
        beat === 23 && !monk ? FX.FX_BLOCK : FX.FX_HIT);
  });
}

const garnet = RGB(105, 18, 33), red = RGB(163, 35, 43), ember = RGB(202, 58, 47);
// Draw broken coils behind and in front separately. The far arc stays visible
// as the chest rises, while the near arc only crosses the lower body.
function coils(x: number, lane: Lane, age: number, height: number, width: number, strength: number, near: boolean): void {
  const cx = Math.round(x) * R.PX, base = (lane.y + 1) * R.PX;
  for (let j = 0; j < 2; j++) {
    for (let k = 0; k < 64; k++) {
      const u = k / 63, angle = age * .115 + j * Math.PI + u * 6.9;
      const depth = Math.sin(angle);
      if ((depth >= 0) !== near || (near && u > .77)) continue;
      const radius = width * (1 - .38 * u) * strength;
      const px = cx + Math.cos(angle) * radius;
      const py = base - 2 - u * height * strength + depth * 3;
      const thick = Math.sin(Math.PI * u) * strength;
      R.physRect(Math.round(px), Math.round(py), 2 + Math.round(2 * thick), 1 + Math.round(3 * thick),
        near ? (k > 20 && k < 33 ? ember : red) : garnet);
    }
  }
}

// Reuse the fighting game's ground-centered blood wave. Its six silhouettes
// already expand, curl up, and dissolve. Keep its foot anchor on the affected lane.
function groundWave(x: number, lane: Lane, age: number, size: number): void {
  if (age < 0 || age >= 30) return;
  draw("hyeolma.wave_" + Math.floor(age / 5), x, lane, false, size);
}

function drawMaster(origin: number, t: number, revival: boolean): void {
  if (!revival && t < 32) return;
  const entering = revival ? 0 : Math.max(0, 58 - t);
  const x = origin + bossX + entering, age = t - (revival ? commandAt : strikeAt);
  const pose = age >= 0 ? "sp_a" : entering ? "walk_" + (1 + stride(t, 6) * 2) : "idle_" + stride(t, 10);
  const strength = Math.max(0, Math.min(1, (age + 1) / 6, (88 - age) / 24));
  if (strength) {
    groundWave(x, middle, age % 32, .84 * strength);
    coils(x, middle, age, 62, 35, strength, false);
  }
  draw("hyeolma." + pose, x, middle, true);
  if (strength) coils(x, middle, age, 62, 35, strength, true);
}

// Moving crest joins the master's planted feet to each group before it reacts.
function groundPulse(origin: number, lane: Lane, age: number): void {
  if (age < 0 || age > 32) return;
  const x = origin + bossX - age * 6;
  for (let i = 0; i < 25; i++) {
    const lift = Math.sin(i / 24 * Math.PI) * (lane === front ? 3 : 2);
    R.fillRect(x + i * .7, lane.y - 1 - lift, 2, 1, i < 6 ? ember : i < 14 ? red : garnet);
  }
}

function ally(actor: Bout, guard: Look, pose: string, x: number, left: boolean): void {
  const name = actor.monk ? "sd_monk" : guard[0];
  draw(name + "." + pose, x, actor.lane, left, actor.monk ? monkScale : 1, actor.monk ? 0 : guard[1]);
}

function fallen(actor: Bout, guard: Look, x: number): void {
  ally(actor, guard, actor.monk ? "lie_down" : "down_1", x, actor.monk ? actor.dir < 0 : actor.dir > 0);
}

// Holds at ground contact and on the planted knee are longer than each
// transfer of weight. The intermediate frames articulate the same game pixels.
const riseTiming: [number, string][] = [
  [20, "0"], [23, "0a"], [25, "0b"], [30, "1"], [33, "1a"], [36, "1b"],
  [42, "2"], [45, "2a"], [48, "2b"], [54, "3"], [57, "3a"], [60, "3b"],
  [65, "4"], [68, "4a"], [72, "4b"],
];

function resurrection(actor: Bout, guard: Look, x: number, age: number): void {
  const lane = actor.lane;
  // Bodies facing either direction rise into the same facing used for their pursuit.
  const left = actor.dir > 0;
  const stage = age < 21 ? 0 : age < 31 ? 1 : age < 45 ? 2 : age < 58 ? 3 : 4;
  const walking = age >= 72, progress = Math.max(0, age - 72);
  const foot = x + (left ? -1 : 1) * progress * .49;
  const strength = Math.max(0, Math.min(1, (age + 1) / 10, (80 - age) / 16));
  const height = (age < 9 ? 5 : [7, 10, 16, 23, 29][stage]) * lane.zoom;
  if (strength) {
    groundWave(x, lane, age, .59);
    coils(x, lane, age, height, 19 * lane.zoom, strength, false);
  }
  if (age < 13) {
    fallen(actor, guard, x);
  } else {
    const step = [0, 1, 2, 1][Math.floor(progress / 6) % 4];
    const frame = walking ? "walk_" + step : "rise_" + riseTiming.find(([until]) => age < until)![1];
    draw("sd_gangsi." + frame, foot, lane, left, gangsiScale);
    if (walking) {
      const id = spriteId("sd_gangsi." + frame), scale = lane.zoom * gangsiScale;
      const dx = (step ? 15 : 16) - D.SprAX[id];
      R.physRect(Math.round(foot) * R.PX + Math.round((left ? -dx : dx) * scale),
        (lane.y + 1) * R.PX + Math.round((11 - D.SprAY[id] - 1) * scale), 3, 2, ember);
    }
  }
  if (strength) coils(x, lane, age, height, 19 * lane.zoom, strength, true);
}

function skirmish(actor: Bout, i: number, origin: number, t: number, revival: boolean, guard: Look): void {
  const {x, lane, monk, dir, delay} = actor, wx = origin + x;
  const beat = phase(t, i), recoil = t - strikeAt - travel(x);
  const enemyFrame = revival || recoil >= 0 ? "idle_0" :
    beat >= 15 && beat < 22 ? "atk_0" : beat >= 22 && beat < 28 ? "atk_1" : beat >= 9 && beat < 13 && !monk ? "hit" : "idle_0";
  const enemyX = wx + dir * (gap(lane) - (enemyFrame === "atk_1" ? 3 : 0));
  draw("sd_cultist." + enemyFrame, enemyX, lane, dir > 0, cultistScale);
  if (revival && delay >= 0) {
    resurrection(actor, guard, wx - dir * 4, t - releaseAt - travel(x) - delay);
  } else if (revival) {
    const flee = Math.max(0, t - 104 - i * 2), escape = x > 140 ? 1 : -1;
    ally(actor, guard, monk ? "run_" + stride(t + i, 5) : flee ? "walk_" + stride(t, 4) * 2 : "guard",
      wx - dir * 4 + escape * flee * .88, flee ? escape < 0 : dir < 0);
  } else if (recoil >= 7 && delay >= 0) {
    fallen(actor, guard, wx - dir * 4);
  } else {
    const pose = monk ? "run_" + stride(t + i, 5) : recoil >= 0 ? "hit_0" :
      beat < 6 ? "lp_0" : beat < 13 ? "lp_1" : beat < 27 ? "guard" : "idle_0";
    const shift = recoil >= 0 ? -Math.min(4, recoil) : beat < 13 ? 2 : beat < 27 ? -2 : 0;
    ally(actor, guard, pose, wx + dir * shift, dir < 0);
  }
}

export function drawBloodBattle(origin: number, t: number, revival: boolean, guard: Look): void {
  const age = t - (revival ? commandAt : strikeAt);
  const shadow = revival ? 1 : Math.max(0, Math.min(1, age / 20));
  for (let y = 54; y < R.SCREEN_H; y += 3) {
    const opacity = Math.min(1, (y - 54) / 24) * (.09 + .18 * shadow);
    R.shadeRect(0, y * R.PX, R.PHYS_W, 3 * R.PX, RGB(30, 14, 19), opacity);
  }
  ranks(origin, t, guard);
  for (const lane of [middle, front]) {
    groundPulse(origin, lane, revival ? t - releaseAt : age);
    if (lane === middle) drawMaster(origin, t, revival);
    bouts.forEach((bout, i) => {
      if (bout.lane === lane) skirmish(bout, i, origin, t, revival, guard);
    });
  }
}

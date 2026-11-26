// The three living defenders, the three acolytes and the three bodies are
// separate casts. Their final positions carry into the march.
import * as R from "./renderer";
import * as FX from "./fx";
import { D, spriteId } from "./data";
import { RGB } from "./util";

const rear = { y: 83, zoom: 1 };
const middle = { y: 89, zoom: 1.65 };
const front = { y: 96, zoom: 2 };
type Lane = typeof front;
export type BattleCut = "warClash" | "warSummon" | "warRise" | "warRout" | "warSecondRise" | "warMarch";
export function isBattleCut(kind: string): kind is BattleCut {
  return ["warClash", "warSummon", "warRise", "warRout", "warSecondRise", "warMarch"].includes(kind);
}
const stride = (t: number, period: number) => Math.floor(t / period) % 2;
function slide(from: number, to: number, t: number, start: number, end: number): number {
  const u = Math.max(0, Math.min(1, (t - start) / (end - start)));
  return from + (to - from) * u;
}
function draw(name: string, x: number, lane: Lane, left = false, scale = 1, tint = -1): void {
  R.drawSprite(spriteId(name), Math.round(x), lane.y, left, tint, 0, scale * lane.zoom);
}

const defenders = [
  { sheet: "sd_monk", scale: 1.27, lane: front, opening: 25, line: 18, fallenX: 23, delay: 40, marchEnd: 9, down: "lie_up" },
  { sheet: "sd_sect_sword", scale: 1, lane: middle, opening: 78, line: 46, fallenX: 37, delay: 28, marchEnd: 19, down: "down_1" },
  { sheet: "sd_sect_fist", scale: 1, lane: front, opening: 130, line: 68, fallenX: 59, delay: 16, marchEnd: 44, down: "down_1" },
];
const acolytes = [
  { lane: front, opening: 43, line: 91, contact: 95, muster: 105, marchEnd: 85 },
  { lane: middle, opening: 96, line: 122, contact: 51, muster: 71, marchEnd: 55 },
  { lane: front, opening: 148, line: 154, contact: 149, muster: 153, marchEnd: 121 },
];
const corpses = [
  { lane: front, x: 103, contact: 25, muster: 50, marchEnd: 28, delay: 17, body: "sd_monk.lie_down", scale: 1.27, left: false },
  { lane: front, x: 135, contact: 76, muster: 87, marchEnd: 67, delay: 8, body: "sd_sect_sword.down_1", scale: 1, left: true },
  { lane: middle, x: 164, contact: 120, muster: 124, marchEnd: 101, delay: 0, body: "sd_sect_fist.down_1", scale: 1, left: true },
];
const castX = 180;
const insertX = (worldX: number) => 22 + (worldX - 86) * 1.46;
const beat = (t: number, i: number) => (t + i * 11) % (37 + i * 3);

export function battleContacts(origin: number, cut: BattleCut, t: number): void {
  if (cut === "warClash") {
    defenders.forEach((d, i) => {
      const b = beat(t, i);
      if (b === 9 || b === 25) FX.spawn(origin + d.opening + 9, d.lane.y - 13, b === 9 ? FX.FX_HIT : FX.FX_BLOCK);
    });
  }
  if (cut === "warRout") {
    if (t === 50) FX.spawn(origin + 44, middle.y - 13, FX.FX_SLASH);
    if (t === 62) FX.spawn(origin + 65, front.y - 12, FX.FX_HIT);
  }
}

function clash(origin: number, lane: Lane, t: number): void {
  defenders.forEach((d, i) => {
    if (lane !== d.lane) return;
    const b = beat(t, i);
    const pose = i === 0 ? "run_" + stride(t, 5) :
      b < 6 ? "lp_0" : b < 13 ? "lp_1" : b < 29 ? "guard" : "idle_0";
    draw(d.sheet + "." + pose, origin + d.opening + (b < 13 ? 3 : b < 29 ? -2 : 0), lane, false, d.scale);
    const enemy = b < 13 ? "hit" : b < 21 ? "atk_0" : b < 28 ? "atk_1" : "idle_0";
    draw("sd_blood_acolyte." + enemy, origin + acolytes[i].opening - (enemy === "atk_1" ? 4 : 0), lane, true, 1.22);
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

const riseTiming: [number, string][] = [
  [20, "0"], [23, "0a"], [25, "0b"], [30, "1"], [33, "1a"], [36, "1b"],
  [42, "2"], [45, "2a"], [48, "2b"], [54, "3"], [57, "3a"], [60, "3b"],
  [65, "4"], [68, "4a"], [72, "4b"],
];

function motes(x: number, lane: Lane, t: number, width: number): void {
  for (let k = 0; k < 8; k++) {
    const p = (t + k * 7) % 29;
    const dx = Math.sin(k * 2.8 + p * .14) * width * (1 - p / 42);
    R.fillRect(x + dx, lane.y - 1 - p * .65, k % 3 ? 1 : 2, 1, k % 3 ? red : ember);
  }
}

function master(x: number, t: number, casting: boolean): void {
  const active = casting && t >= 9;
  if (active) {
    groundWave(x, middle, (t - 9) % 32, .92);
    coils(x, middle, t, 61, 37, 1, false);
  }
  draw("hyeolma." + (active ? "sp_a" : "idle_" + stride(t, 10)), x, middle, true);
  if (active) {
    coils(x, middle, t, 61, 37, 1, true);
    motes(x, middle, t, 14);
  }
}

function risen(x: number, lane: Lane, frame: string): void {
  const key = "sd_gangsi." + frame;
  draw(key, x, lane, true, 1.08);
  if (frame.startsWith("walk")) {
    const id = spriteId(key), z = lane.zoom * 1.08;
    const dx = D.SprAX[id] - (frame === "walk_0" ? 16 : 15);
    R.physRect(Math.round(x) * R.PX + Math.round(dx * z),
      (lane.y + 1) * R.PX + Math.round((10 - D.SprAY[id]) * z), 3, 2, ember);
  }
}

function ritualBody(x: number, lane: Lane, body: string, scale: number, left: boolean,
                    t: number, delay: number, waking: boolean, onset = 1): void {
  const age = t - delay;
  const charge = waking ? 1 : Math.max(0, Math.min(1, (age - 14) / 14));
  const strength = onset * (waking ? Math.max(0, Math.min(1, (83 - age) / 16)) : charge);
  const height = lane.zoom * (waking ? slide(7, 30, age, 17, 60) : 7);
  if (strength) {
    groundWave(x, lane, waking ? age : age - 13, .7);
    coils(x, lane, t, height, 18 * lane.zoom, strength, false);
  }
  if (!waking || age < 12) draw(body, x, lane, left, scale);
  else if (age < 72) {
    const [, pose] = riseTiming.find(([until]) => age < until)!;
    risen(x, lane, "rise_" + pose);
  } else risen(x, lane, "walk_0");
  if (strength) {
    coils(x, lane, t, height, 18 * lane.zoom, strength, true);
    motes(x, lane, t + delay, 10 * strength);
  }
}

// Measured in world pixels. The same distance drives footfalls until each rank stops.
function march(t: number, rank: number, start: number, end: number, ghoul: boolean, lane: Lane, origin: number): void {
  const distance = Math.min(start - end, t * .4 * (.94 + .025 * (rank % 6)));
  const moving = distance < start - end;
  const x = origin + start - distance;
  if (ghoul) {
    const frame = moving ? [0, 1, 2, 1][Math.floor(distance / 4 + rank * .67) % 4] : 0;
    risen(x, lane, "walk_" + frame);
  } else {
    const stepping = moving && Math.floor(distance / 3.5 + rank * .36) % 2;
    draw("sd_blood_acolyte." + (stepping ? "walk_0" : "idle_0"), x, lane, true, 1.22);
  }
}

function secondRiteAndMarch(origin: number, lane: Lane, cut: BattleCut, t: number): void {
  const marching = cut === "warMarch";
  // The victors make room as the new bodies stir, still facing the fallen.
  acolytes.forEach((c, i) => {
    if (lane !== c.lane) return;
    if (marching) return march(t, i * 2, c.muster, c.marchEnd, false, lane, origin);
    const x = slide(c.contact, c.muster, t, 9, 48);
    const step = x < c.muster && Math.floor((x - c.contact) / 3.5) % 2;
    draw("sd_blood_acolyte." + (step ? "walk_0" : "idle_0"), origin + x, lane, true, 1.22);
  });
  corpses.forEach((c, i) => {
    if (lane !== c.lane) return;
    if (marching) return march(t, i * 2 + 1, c.muster, c.marchEnd, true, lane, origin);
    const start = c.contact + (i === 0 ? 5 : 0); // the first ghoul dragged the monk before dropping him
    const x = slide(start, c.muster, t, 9, 48);
    const frame = x < c.muster ? [0, 1, 2, 1][Math.floor((x - start) / 4) % 4] : 0;
    risen(origin + x, lane, "walk_" + frame);
  });
  defenders.forEach((d, i) => {
    if (lane !== d.lane) return;
    if (marching) return march(t, 6 + i, d.fallenX, d.marchEnd, true, lane, origin);
    const age = t - d.delay;
    ritualBody(origin + d.fallenX, lane, d.sheet + "." + d.down, d.scale, false,
      t, d.delay, true, Math.max(0, Math.min(1, age / 10)));
  });
}

function reversal(origin: number, lane: Lane, t: number): void {
  const attack = Math.min(t, 80);
  defenders.forEach((d, i) => {
    if (d.lane !== lane) return;
    let x = d.line, pose: string;
    if (i === 0) {
      // Held upright between the corpse's hands, then dropped.
      pose = attack < 60 ? "run_" + (attack < 40 ? stride(t, 5) : 0) : d.down;
      x = slide(x, d.fallenX, attack, 40, 59);
    } else if (i === 1) {
      pose = attack < 50 ? "guard" : attack < 60 ? "hit_0" : d.down;
      x = slide(x, d.fallenX, attack, 50, 62);
    } else {
      pose = attack < 62 ? "guard" : attack < 80 ? "hit_0" : d.down;
      x = slide(x, d.fallenX, attack, 62, 79);
    }
    draw(d.sheet + "." + pose, origin + x, lane, false, d.scale);
  });
  acolytes.forEach((c, i) => {
    if (lane !== c.lane) return;
    const start = 8 + i * 3, stop = i === 1 ? 49 : 58;
    const x = slide(c.line, c.contact, attack, start, stop);
    let pose = attack > start && attack < stop ? "walk_0" : "idle_0";
    if (i === 1 && attack >= 42 && attack < 60) pose = attack < 50 ? "atk_0" : "atk_1";
    draw("sd_blood_acolyte." + pose, origin + x, lane, true, 1.22);
  });
  corpses.forEach((c, i) => {
    if (lane !== c.lane) return;
    const stop = [40, 60, 64][i];
    const drag = i === 0 ? slide(0, 5, attack, 40, 59) : 0;
    const x = slide(c.x, c.contact, attack, 6 + i * 4, stop) + drag;
    let pose = attack < stop ? "walk_" + [0, 1, 2, 1][Math.floor(t / 6) % 4] : "walk_0";
    if (attack < 80 && attack >= stop && attack < stop + 20) pose = i === 0 ? "stab" : i === 1 ? "atk_1" : "guard";
    risen(origin + x, lane, pose);
  });
}

export function drawBloodBattle(origin: number, cut: BattleCut, t: number): void {
  // Tiny figures stay on the distant rock/sand boundary, behind every speaking cut.
  const aftermath = cut === "warMarch" || cut === "warSecondRise";
  const rearTick = aftermath ? 80 : cut === "warRout" ? Math.min(t, 80) : t;
  for (const group of [13, 65, 117]) {
    for (let i = 0; i < 5; i++)
      draw(i % 2 ? "sd_blood_acolyte.atk_0" : "sd_monk.run_" + stride(rearTick + i, 8),
        origin + group + i * 5, rear, !!(i % 2), .65, RGB(53, 27, 31));
  }
  const insert = cut === "warSummon" || cut === "warRise";
  if (cut !== "warClash") master(origin + (insert ? insertX(castX) : castX), cut === "warRise" ? t + 60 : t, (insert && t < 110) || (cut === "warSecondRise" && t < 121));
  for (const lane of [middle, front]) {
    if (cut === "warClash") clash(origin, lane, t);
    else if (insert) {
      if (cut === "warSummon" && t >= 13 && t < 38) {
        const tip = insertX(castX) - (t - 13) * 6;
        for (let k = 0; k < 17; k++)
          R.fillRect(origin + tip + k, lane.y - 1 - Math.sin(k * .2) * 2, 2, 1, k < 5 ? ember : red);
      }
      for (const c of corpses) {
        if (c.lane === lane) ritualBody(origin + insertX(c.x), lane, c.body, c.scale, c.left, t, c.delay, cut === "warRise");
      }
    } else if (aftermath) secondRiteAndMarch(origin, lane, cut, t);
    else reversal(origin, lane, t);
  }
}

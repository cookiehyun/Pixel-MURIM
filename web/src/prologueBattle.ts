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
  { sheet: "sd_monk", scale: 1.27, lane: front, opening: 25, line: 83, fallenX: 98, delay: 40, marchEnd: 82, down: "lie_up" },
  { sheet: "sd_sect_sword", scale: 1, lane: middle, opening: 78, line: 119, fallenX: 126, delay: 28, marchEnd: 102, down: "down_1" },
  { sheet: "sd_sect_fist", scale: 1, lane: front, opening: 130, line: 154, fallenX: 150, delay: 16, marchEnd: 116, down: "down_1" },
];
const acolytes = [
  { lane: front, opening: 43, line: 41, contact: 86, strike: 46, left: false, marchEnd: 62 },
  { lane: middle, opening: 96, line: 69, contact: 113, strike: 50, left: false, marchEnd: 94 },
  { lane: front, opening: 148, line: 175, contact: 163, strike: 64, left: true, marchEnd: 140 },
];
const corpses = [
  { lane: front, x: 103, contact: 102, stand: 53, marchEnd: 24, delay: 17, body: "sd_monk.lie_down", scale: 1.27, left: false },
  { lane: front, x: 135, contact: 131, stand: 72, marchEnd: 45, delay: 8, body: "sd_sect_sword.down_1", scale: 1, left: true },
  { lane: middle, x: 164, contact: 161, stand: 139, marchEnd: 126, delay: 0, body: "sd_sect_fist.down_1", scale: 1, left: true },
];
// The standing swordsman body is 40 art pixels tall. Hyeolma is 41 × 1.65
// on screen; these two scales keep the hooded troops within 88–92% of him.
function acolyte(pose: string, x: number, lane: Lane, left: boolean, smooth = false): void {
  R.drawSprite(spriteId("sd_blood_acolyte." + pose), smooth ? x : Math.round(x), lane.y, left, -1, 0, lane === front ? 1.54 : 1.50);
}
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
    acolytes.forEach((c, i) => {
      if (t === c.strike) FX.spawn(origin + c.contact + (c.left ? -13 : 13), defenders[i].lane.y - 13,
        i === 1 ? FX.FX_SLASH : FX.FX_HIT);
    });
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
    acolyte(enemy, origin + acolytes[i].opening - (enemy === "atk_1" ? 4 : 0), lane, true);
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

function risen(x: number, lane: Lane, frame: string, marching = false): void {
  const key = "sd_gangsi." + frame;
  const id = spriteId(key), z = lane.zoom * 1.08;
  // The heads of walk_1/2 sit one art texel ahead of walk_0 relative to the foot anchor.
  const center = marching ? x + (frame === "walk_0" ? 0 : z / R.PX) : Math.round(x);
  R.drawSprite(id, center, lane.y, true, -1, 0, z);
  if (frame.startsWith("walk")) {
    const dx = D.SprAX[id] - (frame === "walk_0" ? 16 : 15);
    R.physRect(Math.round(center * R.PX) + Math.round(dx * z),
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
  const age = Math.max(0, t - rank % 5);
  const ramp = 12, speed = .4 * (.94 + .025 * (rank % 6));
  const travel = start - end;
  const distance = Math.min(travel, speed * (age < ramp ? age * age / (2 * ramp) : age - ramp / 2));
  const x = origin + start - distance;
  // Complete whole strides so both endpoints share the standing frame.
  const cycles = Math.max(1, Math.round(travel / (ghoul ? 16 : 8)));
  const phase = distance / travel * cycles;
  if (ghoul) risen(x, lane, "walk_" + [0, 1, 2, 1][Math.floor(phase * 4) % 4], true);
  else acolyte(distance > 0 && distance < travel ? "walk_" + Math.floor(phase * 2) % 2 : "idle_0", x, lane, true, true);
}

function aftermathRanks(origin: number, lane: Lane, cut: BattleCut, t: number): void {
  const marching = cut === "warMarch";
  // The two ranks hold the exact places where the attack ended.
  acolytes.forEach((c, i) => {
    if (lane !== c.lane) return;
    if (marching) march(t, i * 2, c.contact, c.marchEnd, false, lane, origin);
    else acolyte("idle_0", origin + c.contact, lane, true);
  });
  corpses.forEach((c, i) => {
    if (lane !== c.lane) return;
    if (marching) march(t, i * 2 + 1, c.stand, c.marchEnd, true, lane, origin);
    else risen(origin + c.stand, lane, "walk_0");
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
  defenders.forEach((d, i) => {
    if (d.lane !== lane) return;
    let x = d.line, pose: string;
    if (i === 0) {
      // The monk is driven into the ghoul's grasp and struck while held.
      pose = t < 60 ? "run_" + (t < 40 ? stride(t, 5) : 0) : d.down;
      x = slide(x, d.fallenX, t, 12, 40);
    } else {
      const impact = acolytes[i].strike;
      pose = t < impact ? "guard" : t < (i === 1 ? 60 : 80) ? "hit_0" : d.down;
      x = slide(x, d.fallenX, t, impact, impact + 9);
    }
    draw(d.sheet + "." + pose, origin + x, lane, false, d.scale);
  });
  acolytes.forEach((c, i) => {
    if (lane !== c.lane) return;
    const start = 5 + i * 3;
    const x = slide(c.line, c.contact, t, start, c.strike);
    let pose = "idle_0";
    if (t >= c.strike - 7 && t < c.strike + 9)
      pose = t < c.strike ? "atk_0" : "atk_1";
    else if (t > start && t < c.strike)
      pose = "walk_" + (Math.floor(Math.abs(x - c.line) / 4) % 2);
    acolyte(pose, origin + x, lane, t >= c.strike + 12 || c.left);
  });
  corpses.forEach((c, i) => {
    if (lane !== c.lane) return;
    const contactTick = [39, 45, 57][i];
    const release = contactTick + 12;
    const contactX = slide(c.x, c.contact, t, 5, contactTick);
    const x = slide(contactX, c.stand, t, release, 80);
    let pose = "walk_0";
    if (t >= contactTick && t < release) pose = i === 0 ? "stab" : "atk_1";
    else if (t < 80) pose = "walk_" + [0, 1, 2, 1][Math.floor((c.x - x) / 4) % 4];
    risen(origin + x, lane, pose);
  });
}

export function drawBloodBattle(origin: number, cut: BattleCut, t: number): void {
  // Tiny figures stay on the distant rock/sand boundary, behind every speaking cut.
  const aftermath = cut === "warMarch" || cut === "warSecondRise";
  const rearTick = aftermath ? 80 : cut === "warRout" ? Math.min(t, 80) : t;
  for (const group of [13, 65, 117]) {
    for (let i = 0; i < 5; i++) {
      const hooded = i % 2 === 1;
      const pose = hooded ? "sd_blood_acolyte.atk_" + stride(rearTick + group + i * 3, 11)
        : "sd_monk.run_" + stride(rearTick + i, 8);
      draw(pose, origin + group + i * 5, rear, hooded, hooded ? .49 : .65, RGB(53, 27, 31));
    }
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
    } else if (cut === "warRout" && t >= 80) aftermathRanks(origin, lane, cut, 0);
    else if (aftermath) aftermathRanks(origin, lane, cut, t);
    else reversal(origin, lane, t);
  }
}

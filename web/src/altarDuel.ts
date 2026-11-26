// The historical alliance at the blood altar. Positions are in fighter-art pixels.
// Each move starts at the previous move's endpoint; hit recoil and leaps land on the same floor.
import { spriteId } from "./data";
import { drawAltarSwordArt, drawBloodArms, drawDrainStream, drawPalmAt, skySwordFrame } from "./fighter";
import * as R from "./renderer";
import { RGB } from "./util";
import type { FieldMap } from "./fieldmap";

const SCALE = 2, FLOOR = 237, ROOM_ZOOM = .74;
export const ALTAR_DEATH_LINE = 408;
// tick, poses (one frame every three ticks), optional travel endpoint, duration and arc height
type Cue = [number, string, number?, number?, number?];
const lord: Cue[] = [
  [0, "idle"], [3, "walk_0 walk_1 dash", 150, 13], [16, "thrust_0", 164, 4],
  [20, "thrust_1", 179, 4], [29, "thrust_0", 187, 5], [35, "hit_0"],
  [43, "hit_1"], [59, "hit_0"], [72, "hit_1 down_0", 141, 12, 16],
  [84, "crouch"], [92, "idle"], [101, "walk_0 walk_1 dash", 171, 10],
  [111, "gw_0 gw_1"], [120, "gw_hit"], [125, "gc_0 gc_1 gc_2", 178, 4],
  [137, "guard"], [155, "cguard"], [173, "thrust_0 thrust_1", 182, 5],
  [182, "guard"], [188, "thrust_0 thrust_1", 184, 5], [199, "guard"],
  [224, "gw_0"], [242, "hit_0 hit_1 down_0", 126, 15, 12], [257, "crouch"],
  [268, "gw_0"], [281, "idle"], [291, "bs_0 bs_1 bs_2"],
  [305, "bs_3"], [316, "bs_4"], [350, "guard"],
  [380, "hp_3"], [388, "intro"],
];
const demon: Cue[] = [
  [0, "idle"], [43, "walk_0 walk_1 dash", 111, 16], [59, "palm_0", 128, 7],
  [66, "palm_1", 144, 6], [77, "palm_0"], [86, "bdash", 130, 10, 4],
  [96, "guard"], [125, "idle"], [135, "draw_0"],
  [142, "idle"], [145, "dash", 161, 6], [151, "jump jp", 226, 13, 41],
  [164, "palm_0"], [171, "palm_1", 225, 3], [179, "guard"],
  [192, "bdash", 238, 8, 3], [203, "guard"],
  [215, "dash", 229, 6], [221, "hp_0 hp_a hp_1 hp_2 hp_3"], [237, "guard"],
  [242, "hit_0 hit_1 down_0", 252, 15, 20], [257, "down_0 down_1"],
];
const blood: Cue[] = [
  [0, "idle"], [20, "guard"], [26, "dash", 167, 8],
  [34, "throw_0 throw_1"], [72, "hit_0 hit_1", 210, 7, 3], [84, "guard"],
  [101, "arm_0 arm_1"], [115, "arm_2 arm_3 arm_4 arm_5"], [128, "hit_0 hit_1", 206, 5],
  [138, "guard"], [170, "hit_1"], [178, "hit_0"],
  [182, "hp_p hp_0"], [191, "hit_0 hit_1"], [198, "su_0 su_1 su_2 su_3 su_4"],
  [215, "idle"], [225, "hit_0 hit_1"], [232, "sp_a"],
  [249, "idle"], [269, "walk_0 walk_1 walk_2 walk_3", 183, 12], [281, "hp_p hp_0"],
  [292, "chit"], [301, "hp_p"], [310, "hit_0"],
  [316, "hit_1"], [322, "chit"], [341, "hit_1"],
  [356, "kneel"], [378, "fall"],
];

function actor(track: Cue[], start: number, t: number, phase = 0) {
  let x = start;
  for (let i = 0; i < track.length; i++) {
    const [at, poses, to = x, dur = 1, arc = 0] = track[i];
    if (i + 1 < track.length && t >= track[i + 1][0]) { x = to; continue; }
    const age = t - at, u = Math.min(1, age / dur);
    const frames = poses.split(" ");
    const pose = poses === "idle" ? "idle_" + (Math.floor((age + phase) / 9) % 2)
      : frames[Math.min(frames.length - 1, Math.floor(age / 3))];
    return { x: Math.round(x + (to - x) * u), up: Math.round(4 * arc * u * (1 - u)), pose };
  }
  throw new Error("Empty altar actor track");
}

let room: Int32Array | undefined;
function drawRoom(img: NonNullable<FieldMap["img"]>) {
  // A fixed widescreen aperture preserves square pixels and both braziers. No recrop on impact.
  if (!room) {
    const zoom = ROOM_ZOOM, w = R.PHYS_W, h = R.PHYS_H;
    const left = (img.w - w / zoom) / 2, top = Math.round((h - img.h * zoom) / 2);
    room = new Int32Array(w * h);
    for (let y = top; y < h - top; y++) {
      const row = Math.floor((y - top) / zoom) * img.w;
      for (let x = 0; x < w; x++) room[y * w + x] = img.pix[row + Math.floor(left + x / zoom)];
    }
  }
  R.blitPhys(room, R.PHYS_W, R.PHYS_H, 0);
}
type Actor = ReturnType<typeof actor>;
function px(a: Actor) { return Math.round(a.x * SCALE / R.PX) * R.PX; }
function sprite(name: string, x: number, up: number, left: boolean) {
  R.drawSprite(spriteId(name), Math.round(x * SCALE / R.PX), Math.round((FLOOR - up * SCALE) / R.PX) - 1, left, -1, false, SCALE);
}

function debris(t: number) {
  for (let i = 0; i < 18; i++) {
    const age = t - 363 - i % 7 * 3;
    if (age < 0 || age > 26) continue;
    const x = [126, 289, 441][i % 3] + i * 17 % 41;
    const y = Math.min(FLOOR - 2, 50 + i % 3 * 15 + age * age * .46);
    const dust = y >= FLOOR - 2, dx = dust ? (age - 19) * (i % 3 - 1) : 0;
    R.shadeRect(x + dx, y, i % 4 === 0 ? 4 : 2, 2, i % 2 ? RGB(122, 87, 70) : RGB(170, 140, 108), (27 - age) / 29);
  }
}

export function drawAltarStandoff(img: NonNullable<FieldMap["img"]>, t: number): void {
  drawRoom(img);
  const idle = (phase: number) => ".idle_" + Math.floor((t + phase) / 9) % 2;
  sprite("cheonma" + idle(6), 41, 0, false);
  sprite("baekmujin" + idle(0), 95, 0, false);
  sprite("hyeolma" + idle(3), 205, 0, true);
}

export function drawAltarDuel(img: NonNullable<FieldMap["img"]>, t: number): void {
  drawRoom(img);
  const leader = actor(lord, 95, t), swordsman = actor(demon, 41, t, 6), boss = actor(blood, 205, t, 3);
  const armed = t >= 142, fromRight = t >= 164;
  const bloodLeft = !(t >= 34 && t < 72 || t >= 164 && t < 176 || t >= 221 && t < 231);
  sprite((armed ? "cheonmasw." : "cheonma.") + swordsman.pose, swordsman.x, swordsman.up, fromRight);
  // The golden wall and its answering blade intercept the blood claw in the foreground.
  const parry = t >= 111 && t < 137;
  if (!parry) sprite("baekmujin." + leader.pose, leader.x, leader.up, t >= 35 && t < 79);
  const pose = spriteId("hyeolma." + boss.pose);
  if (t >= 215 && t < 360) {
    R.drawFightArt(px(boss), FLOOR, SCALE, (x, y) => {
      drawBloodArms(x, y, bloodLeft ? -1 : 1, pose, t);
      R.drawRageHi(pose, x, y, bloodLeft, t, true);
      R.drawSprite(pose, x, y, bloodLeft);
      R.tintHi(pose, x, y, bloodLeft, RGB(156, 18, 44), .24);
    });
  } else sprite("hyeolma." + boss.pose, boss.x, boss.up, bloodLeft);
  if (parry) sprite("baekmujin." + leader.pose, leader.x, leader.up, false);
  if (t >= 38 && t < 72) R.drawFightArt(px(boss), FLOOR, SCALE, (x, y) =>
    drawDrainStream(x, y, 1, x + leader.x - boss.x, y - leader.up, t - 38));
  if (t >= 67 && t <= 75) R.drawFightArt(px(swordsman), FLOOR, SCALE, (x, y) => drawPalmAt(x, y, 1, t < 75));
  if (t >= 171 && t < 177) R.drawFightArt(px(swordsman), FLOOR, SCALE, (x, y) => drawAltarSwordArt("slash", x, y, -1, t - 171));
  if (t >= 235 && t < 247) sprite("hyeolma.wave_" + Math.floor((t - 235) / 2), boss.x, 0, true);
  const blade = skySwordFrame(t - 305, true);
  if (blade >= 0) sprite("baekmujin.fall_" + blade, boss.x, 0, false);
  debris(t);
  // A descending blade enters through the top of the aperture.
  R.physRect(0, 0, R.PHYS_W, Math.round((R.PHYS_H - img.h * ROOM_ZOOM) / 2), 0);
}

// The stone groove and scar in the stationary 576px hand painting. The stain accumulates in place.
export function drawScarSeep(t: number): void {
  const groove = [[208, 246], [219, 241], [231, 235], [244, 230], [254, 226], [258, 224]];
  let i = 0;
  for (let j = 1; j < groove.length; j++) {
    const [x, y] = groove[j - 1], [ex, ey] = groove[j];
    for (let dx = 0; dx < ex - x; dx++, i++) {
      const wet = Math.max(0, Math.min(1, (t - 15 - i * .72) / 16));
      if (wet) R.shadeRect(x + dx, y + Math.round((ey - y) * dx / (ex - x)), 1, 1 + (i % 6 === 0 ? 1 : 0), RGB(76, 11, 19), wet * .55);
    }
  }
  const stain = Math.max(0, Math.min(1, (t - 47) / 20));
  for (const [x, y] of [[268, 202], [269, 201], [270, 200], [271, 199], [272, 199], [273, 198], [274, 197]])
    R.shadeRect(x, y, 2, 1, RGB(77, 14, 20), stain * .42);
}

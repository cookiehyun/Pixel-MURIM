// The historical alliance at the blood altar. Positions are in fighter-art pixels.
// Each move starts at the previous move's endpoint; hit recoil and leaps land on the same floor.
import { spriteId } from "./data";
import { drawAltarSwordArt, drawBloodArms, drawDrainStream, drawPalmAt, skySwordFrame } from "./fighter";
import * as R from "./renderer";
import { RGB } from "./util";
import type { FieldMap } from "./fieldmap";

const SCALE = 2, FLOOR = 237, ROOM_ZOOM = .74;
export const ALTAR_DEATH_LINE = 294;
// tick, poses (one frame every three ticks), optional travel endpoint, duration and arc height
type Cue = [number, string, number?, number?, number?];
const lord: Cue[] = [
  [0, "idle"], [3, "walk_0 walk_1 dash", 150, 13], [16, "thrust_0", 164, 4],
  [20, "thrust_1", 179, 4], [29, "thrust_0", 187, 5], [35, "hit_0"],
  [43, "hit_1"], [59, "hit_0"], [72, "hit_1 down_0", 141, 12, 16],
  [84, "crouch"], [91, "walk_0 walk_1 walk_2 walk_3", 176, 16],
  [107, "guard"], [122, "cguard"], [139, "hit_0 hit_1", 137, 13, 8],
  [152, "crouch"], [161, "guard"], [177, "idle"], [184, "bs_0 bs_1 bs_2"],
  [196, "bs_3"], [207, "bs_4"], [241, "guard"], [268, "hp_3"], [276, "intro"],
];
const demon: Cue[] = [
  [0, "idle"], [43, "walk_0 walk_1 dash", 111, 16], [59, "palm_0", 128, 7],
  [66, "palm_1", 144, 6], [77, "palm_0"], [86, "guard"], [101, "draw_0"],
  [108, "dash", 163, 9], [117, "palm_0"], [123, "palm_1", 166, 3], [132, "guard"],
  [139, "hit_0 hit_1", 97, 14, 12], [153, "chit"], [157, "cguard"],
];
const blood: Cue[] = [
  [0, "idle"], [20, "guard"], [26, "dash", 167, 8],
  [34, "throw_0 throw_1"], [72, "hit_0 hit_1", 190, 8, 3],
  [84, "su_0 su_1 su_2 su_3 su_4"], [101, "idle"], [124, "hit_0 hit_1"],
  [132, "sp_a"], [148, "idle"], [156, "walk_0 walk_1 walk_2 walk_3", 166, 13],
  [169, "hp_p hp_0"], [177, "chit"], [193, "hp_p"], [201, "hit_0"],
  [207, "hit_1"], [213, "chit"], [232, "hit_1"], [246, "kneel"], [267, "fall"],
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
    const age = t - 245 - i % 7 * 3;
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
  const armed = t >= 108, bloodLeft = !(t >= 34 && t < 72);
  if (!armed) sprite("cheonma." + swordsman.pose, swordsman.x, swordsman.up, false);
  sprite("baekmujin." + leader.pose, leader.x, leader.up, t >= 35 && t < 79);
  if (armed) sprite("cheonmasw." + swordsman.pose, swordsman.x, swordsman.up, false);
  const pose = spriteId("hyeolma." + boss.pose);
  if (t >= 101 && t < 242) {
    R.drawFightArt(px(boss), FLOOR, SCALE, (x, y) => {
      drawBloodArms(x, y, bloodLeft ? -1 : 1, pose, t);
      R.drawRageHi(pose, x, y, bloodLeft, t, true);
      R.drawSprite(pose, x, y, bloodLeft);
      R.tintHi(pose, x, y, bloodLeft, RGB(156, 18, 44), .24);
    });
  } else sprite("hyeolma." + boss.pose, boss.x, boss.up, bloodLeft);
  if (t >= 38 && t < 72) R.drawFightArt(px(boss), FLOOR, SCALE, (x, y) =>
    drawDrainStream(x, y, 1, x + leader.x - boss.x, y - leader.up, t - 38));
  if (t >= 67 && t <= 75) R.drawFightArt(px(swordsman), FLOOR, SCALE, (x, y) => drawPalmAt(x, y, 1, t < 75));
  if (t >= 123 && t < 129) R.drawFightArt(px(swordsman), FLOOR, SCALE, (x, y) => drawAltarSwordArt("slash", x, y, 1, t - 123));
  if (t >= 133 && t < 145) sprite("hyeolma.wave_" + Math.floor((t - 133) / 2), boss.x, 0, true);
  const blade = skySwordFrame(t - 196, true);
  if (blade >= 0) sprite("baekmujin.fall_" + blade, boss.x, 0, false);
  debris(t);
  // A descending blade enters through the top of the aperture.
  R.physRect(0, 0, R.PHYS_W, Math.round((R.PHYS_H - img.h * ROOM_ZOOM) / 2), 0);
}

// Physical pixels on the fixed hand painting. The first path follows the stone
// channel up to the index nail; the narrow last segment follows the finger crease.
const seepPath = [[112,297], [139,287], [157,277], [170,271], [185,264], [205,255],
  [221,248], [239,240], [251,233], [255,226], [258,222], [260,217],
  [263,211], [266,205], [269,200], [273,198]];
// These branches follow the index knuckle, tendons on the back of the hand and
// the exposed wrist. Sample the original skin rather than drawing over the cuff.
const veins = [
  { at: 0, path: [[272,198],[279,191],[283,185],[288,182],[294,173],[301,170],[313,170],[325,165],[332,164],[344,158],[355,161],[368,158],[380,162],[393,159],[406,162],[416,159],[421,163]] },
  { at: 4, path: [[313,170],[320,172],[326,168],[337,168],[344,164],[355,161]] },
  { at: 6, path: [[332,164],[339,171],[350,168],[358,173],[371,168],[380,162]] },
  { at: 8, path: [[358,173],[365,177],[377,175],[384,179],[391,173],[404,172],[412,166],[421,169],[429,172]] },
  { at: 9, path: [[368,158],[374,154],[385,156],[393,153],[401,155]] },
  { at: 10, path: [[380,162],[388,165],[391,173]] },
  { at: 12, path: [[404,172],[411,178],[423,176],[430,181],[435,179]] },
];
function drawHandVeins(t: number, img: NonNullable<FieldMap["img"]>): void {
  const age = t - 66;
  if (age < 0 || age >= 27) return;
  const opacity = Math.min(1, (27-age)/9);
  const color = age >= 15 && age < 19 ? RGB(195, 28, 36) : RGB(123, 12, 24);
  for (const {at, path} of veins) {
    const progress = Math.min(1, (age-at) / (at === 0 ? 15 : 5));
    for (let i=1; i<path.length && i-1 < progress*(path.length-1); i++) {
      const [x,y] = path[i-1], [ex,ey] = path[i], n = Math.max(Math.abs(ex-x), Math.abs(ey-y));
      const end = Math.min(1, progress*(path.length-1) - (i-1));
      for (let j=0; j<n*end; j++) {
        const sx=Math.round(x+(ex-x)*j/n), sy=Math.round(y+(ey-y)*j/n);
        for (let k=0;k<(at===0 ? 2 : 1);k++) {
          const skin = img.pix[(sy+k)*img.w+sx];
          if ((skin&255)>95 && (skin>>8&255)>54 && (skin>>16&255)>56)
            R.shadeRect(sx,sy+k,1,1,color,opacity*(k ? .58 : .91));
        }
      }
    }
  }
}
export const SCAR_SEEP_END = 104;
export function drawScarSeep(t: number, img: NonNullable<FieldMap["img"]>): void {
  drawHandVeins(t, img);
  if (t <= 0 || t >= 86) return;
  const flow = Math.min(1, t / 70);
  const head = flow * (seepPath.length - 1);
  const tail = Math.max(0, (t - 20) / 65) * (seepPath.length - 1);
  const fade = Math.min(1, (86 - t) / 14);
  for (let i = 1; i < seepPath.length; i++) {
    const [x,y] = seepPath[i-1], [ex,ey] = seepPath[i];
    const length = Math.max(ex-x, y-ey);
    for (let j = 0; j < length; j++) {
      const u = j / length, along = i - 1 + u;
      if (along > head || along < tail) continue;
      const lead = Math.max(0, 1 - (head - along) / 1.4);
      const wet = Math.min(1, .25 + (along - tail)) * fade;
      const xx = Math.round(x + (ex-x)*u), yy = Math.round(y + (ey-y)*u);
      const width = i < 9 ? 4 : i < 11 ? 3 : 2;
      R.shadeRect(xx, yy, 2, width, RGB(58, 6, 14), wet);
      R.shadeRect(xx, yy, 2, width - 1, RGB(104, 13, 24), wet * (.54 + .46 * lead));
      if (lead > .35 || (i % 3 === 1 && u < .43))
        R.shadeRect(xx, yy, 1, 1, RGB(135, 24, 31), wet * (.45 + .45 * lead));
    }
  }
}

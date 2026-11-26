// Staged groups on the blood battlefield. All coordinates are feet in field-world pixels.
import * as R from "./renderer";
import * as FX from "./fx";
import { spriteId } from "./data";
import { RGB } from "./util";

const warriors = [
  { name: "sd_muyeong", idle: "stand", ready: "atk_0", strike: "atk_1", guard: "guard", hit: "hit", down: "lie", walk: ["walk_0", "walk_1"] },
  { name: "danwoo", idle: "idle_0", ready: "lp_0", strike: "lp_1", guard: "guard", hit: "hit_0", down: "down_1", walk: ["walk_0", "walk_2"] },
  { name: "cheolsan", idle: "idle_0", ready: "lp_0", strike: "lp_1", guard: "guard", hit: "hit_0", down: "down_1", walk: ["walk_0", "walk_2"] },
  { name: "sd_jinmu", idle: "stand", ready: "point", strike: "slash", guard: "stand", hit: "point", down: "lie", walk: ["stand", "point"] },
];
const cult = [
  { name: "sd_cultist", idle: "idle_0", ready: "atk_0", strike: "atk_1", guard: "torch" },
  { name: "sd_yacha", idle: "stand", ready: "atk_0", strike: "slash", guard: "guard" },
  { name: "sd_heuksa", idle: "idle", ready: "atk_0", strike: "atk_1", guard: "guard" },
];
// Costume the borrowed bodies as anonymous sect troops in the historical scene.
const costumes: Record<string, number> = { danwoo: R.SKIN_IRON, cheolsan: R.SKIN_SHADOW, sd_yacha: R.SKIN_CULT };
// In depth order. A non-negative delay assigns this casualty a place in the revival.
const lines = [
  { x: 14, y: 62, ally: 2, foe: 0, delay: -1 },
  { x: 83, y: 62, ally: 3, foe: 1, delay: 13 },
  { x: 124, y: 70, ally: 1, foe: 0, delay: 0 },
  { x: 48, y: 76, ally: 0, foe: 2, delay: 26 },
  { x: 89, y: 84, ally: 2, foe: 0, delay: -1 },
  { x: 20, y: 94, ally: 1, foe: 1, delay: -1 },
  { x: 144, y: 95, ally: 0, foe: 2, delay: 8 },
];
const handOpens = 88;
const arrival = (x: number) => handOpens + Math.round((165 - x) / 6);
const phase = (t: number, i: number) => (t + i * 13) % (36 + (i % 4) * 4);
const step = (t: number, period: number) => Math.floor(t / period) % 2;

function actor(name: string, frame: string, x: number, y: number, left = false, tint = -1): void {
  R.drawSprite(spriteId(name + "." + frame), Math.round(x), y, left, tint, tint < 0 ? costumes[name] : 0);
}

export function battleContacts(origin: number, t: number): void {
  lines.forEach(({ x, y }, i) => {
    if (t >= arrival(x)) return;
    const beat = phase(t, i);
    if (beat === 8 || beat === 24) {
      FX.spawn(origin + x + 6, y - 15, beat === 24 ? FX.FX_BLOCK : (i % 3 ? FX.FX_HIT : FX.FX_SLASH));
    }
  });
}

function rearRanks(origin: number, t: number): void {
  R.setHiScale(1);
  const clusters = [4, 35, 82, 118, 154];
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < clusters.length; c++) {
      for (let k = 0; k < 4; k++) {
        const i = row * 20 + c * 4 + k;
        const beat = phase(t, i);
        const sheet = k % 2 ? cult[(i + row) % 3] : warriors[(i + c) % 4];
        const x = origin + clusters[c] + row * 5 + k * 6 + Math.sin((t + i * 9) / 12) * 1.5;
        const y = 48 + row * 8 + ((i * 7 + c) % 5);
        actor(sheet.name, beat < 10 ? sheet.strike : beat < 20 ? sheet.guard : sheet.idle, x, y, k % 2 === 1,
          row ? RGB(45, 25, 35) : RGB(70, 45, 53));
      }
    }
  }
}

// Two broken, tapered ribbons spiral around the body. Draw the far half before the sprite.
function windingQi(x: number, y: number, age: number, front: boolean): void {
  if (age < 0 || age >= 88) return;
  const strength = Math.min(1, (age + 1) / 16, (88 - age) / 16);
  for (let strand = 0; strand < 2; strand++) {
    for (let i = 0; i < 42; i++) {
      const u = i / 41, angle = age * .11 + strand * Math.PI + u * 6.1;
      if ((Math.sin(angle) > 0) !== front) continue;
      const radius = (14 - 6 * u) * strength;
      const px = x + Math.cos(angle) * radius;
      const py = y - 2 - u * Math.min(23, 6 + age * .27) + Math.sin(angle) * 2;
      const color = front && i > 11 && i < 31 ? RGB(151, 26, 40) : RGB(84, 13, 27);
      R.physRect(Math.round(px * R.PX), Math.round(py * R.PX), 3, i > 7 && i < 34 ? 3 : 1, color);
    }
  }
}

function rising(x: number, y: number, age: number, sheet: typeof warriors[number]): void {
  if (age < 12) {
    actor(sheet.name, sheet.down, x, y);
    windingQi(x, y, age, true);
    return;
  }
  windingQi(x, y, age, false);
  const stage = age < 25 ? 0 : age < 39 ? 1 : age < 55 ? 2 : age < 69 ? 3 : 4;
  const walking = age >= 84;
  const stride = [0, 1, 2, 1][Math.floor(Math.max(0, age - 84) / 7) % 4];
  const frame = walking ? "walk_" + stride : "rise_" + stage;
  const foot = Math.round(x - Math.max(0, age - 84) * .52);
  const id = spriteId("sd_gangsi." + frame);
  R.drawSprite(id, foot, y, true);
  if (stage === 4) {
    // Camera sees the near eye. Match its art pixel after mirroring each torso anchor.
    const eye = walking && stride !== 0 ? 15 : 16;
    const [px, py] = R.hiArtOrigin(id, foot, y, true, eye, 11);
    R.physRect(px, py, 3, 2, RGB(213, 37, 43));
  }
  windingQi(x, y, age, true);
}

export function drawBloodBattle(origin: number, t: number, revive: boolean): void {
  // Let the fires recede as his hand opens. Leave the moon above the haze.
  const dusk = revive ? 1 : Math.min(1, Math.max(0, (t - handOpens) / 30));
  for (let band = 0; band < 8; band++) {
    R.shadeRect(0, (36 + band * 8) * R.PX, R.PHYS_W, 8 * R.PX,
      RGB(27, 14, 25), Math.min(1, (band + 1) / 4) * (.11 + dusk * .24));
  }
  rearRanks(origin, revive ? t + 145 : t);
  R.setHiScale(2); // Field SD, including the 41 px fighter artwork used for the Blood Demon.
  if (revive || t >= 33) {
    const entrance = revive ? 0 : Math.max(0, 60 - t);
    const x = origin + 170 + entrance;
    const hand = revive ? t >= 7 : t >= handOpens;
    actor("hyeolma", hand ? "sp_a" : entrance ? "walk_" + step(t, 6) : "idle_" + step(t, 12), x, 61, true);
    if (hand && !revive && t < handOpens + 30) {
      const distance = (t - handOpens) * 6;
      for (let i = 0; i < 37; i++) {
        const u = i / 36, px = x - 12 - distance * (1 - .24 * u) + i * .3;
        const py = 48 + distance * .19 - Math.sin(u * 4) * 3;
        R.fillRect(px, py, 2, 1, i < 18 ? RGB(155, 31, 46) : RGB(88, 14, 31));
      }
    }
  }
  lines.forEach(({ x, y, ally, foe, delay }, i) => {
    const a = warriors[ally], b = cult[foe];
    const beat = phase(t, i), wx = origin + x, recoil = t - arrival(x);
    const enemyPose = beat < 12 ? b.guard : beat < 20 ? b.ready : beat < 28 ? b.strike : b.idle;
    actor(b.name, revive || recoil >= 0 ? b.idle : enemyPose, wx + 14 + (beat < 12 || revive ? 1 : -1), y - 1, true);
    if (revive && delay >= 0) {
      rising(wx - 3, y, t - 8 - delay, a);
    } else if (revive) {
      const flee = Math.max(0, t - (93 + i * 3));
      actor(a.name, flee ? a.walk[step(t + i, 4)] : a.guard, wx - 8 - flee * 1.02, y, flee > 0);
    } else if (recoil >= 0) {
      const pose = recoil < 7 ? a.hit : delay >= 0 ? a.down : a.guard;
      actor(a.name, pose, wx - Math.min(delay >= 0 ? 3 : 8, recoil), y);
    } else {
      const pose = beat < 7 ? a.ready : beat < 13 ? a.strike : beat < 19 ? a.idle : beat < 28 ? a.guard : a.idle;
      actor(a.name, pose, wx + (pose === a.strike ? 3 : pose === a.guard ? -2 : 0), y);
    }
  });
  R.setHiScale(0);
}

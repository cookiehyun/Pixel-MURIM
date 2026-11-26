// Coordinates in this sequence are physical pixels on the 576 × 300 canvas.
import * as R from "./renderer";
import { spriteId } from "./data";
import { RGB } from "./util";
import type { FieldMap } from "./fieldmap";

type Picture = NonNullable<FieldMap["img"]>;
export const TOWN_ZOOM = .68;
const wellFoot = [169, 220];
// Center of the lowest stone course in each original 900 × 300 painting.
const wells: Record<string, [number, number]> = {
  postwar_ruins: [277, 258], postwar_rebuild: [277, 258], luoyang_market: [268, 259],
};

export function townPanorama(name: string, src: Picture) {
  const well = wells[name];
  if (!well) return;
  const dx = wellFoot[0] - well[0] * TOWN_ZOOM, dy = wellFoot[1] - well[1] * TOWN_ZOOM;
  const w = R.PHYS_W, h = R.PHYS_H, pix = new Int32Array(w * h);
  // The clearing and foundations emerge first, followed by walls, roofs and skyline.
  const delay = new Uint8Array(w * h);
  for (let y = 46; y < 247; y++) {
    const row = Math.floor((y - dy) / TOWN_ZOOM) * src.w;
    for (let x = 0; x < w; x++) {
      const i = y*w+x;
      pix[i] = src.pix[row + Math.floor((x - dx) / TOWN_ZOOM)];
      const elevation = Math.max(0, Math.min(1, (220-y) / 105));
      delay[i] = Math.round(255 * (.32*elevation + .16*Math.abs(Math.sin((x-50)/110))));
    }
  }
  return { image: { w, h, pix }, dx, dy, delay };
}

// Two residents bring a beam from the clearing to the timber frame, set it
// down, then walk on past the building. The delivered timber stays in place.
export function drawTimberCrew(t: number, opacity: number): void {
  const travel = Math.max(0, Math.min(1, (t - 6) / 40));
  const depart = Math.max(0, Math.min(1, (t - 55) / 37));
  const x = -36 + 88 * travel - 77 * depart, floor = 225;
  const walking = travel > 0 && travel < 1 || depart > 0 && depart < 1;
  if (t < 93) {
    for (const phase of [0, 1]) {
      const pose = walking ? "run_" + (Math.floor((t + phase * 4) / 6) % 2) : "stand";
      R.drawSprite(spriteId("sd_villager." + pose), (x + phase * 20) / R.PX, floor / R.PX - 1, depart > 0, -1, 0, 1.12);
    }
  }
  const beamX = Math.round(-40 + 88 * travel);
  const beamY = 209 + Math.round(13 * Math.max(0, Math.min(1, (t - 46) / 8)));
  R.shadeRect(beamX, beamY, 31, 4, RGB(66, 42, 31), opacity);
  R.shadeRect(beamX + 1, beamY, 29, 1, RGB(157, 116, 71), opacity);
  R.shadeRect(beamX + 4, beamY + 2, 18, 1, RGB(109, 72, 46), opacity);
}

// Nail beds and knuckles face the viewer. The last row cuts across the back
// of the hand at the fixed waterline, even while the pose is held.
const wellHand = [
  "         ...",
  "        .sns.",
  "        .nkns.    ...",
  "       .sshks.   .sns.",
  "       .sskks.  .snkns.",
  " .n..   .skk.   .sshks.",
  " nsns.  .kks.    .skk.",
  ".shks.  .kks.    .kkk.   ...",
  ".skks.  .kks.   .skk.    .ns.",
  " .skk. .skk.    .kkk.   .nkns.",
  " .skks..sk..   .skk.    .shks.",
  " .sk.s..s.k.   .kkk.   .skks.",
  " .s.ks..sskk. .s.ks.  .skkks.",
  "  .skks.sskk. .sk..  .skkks.",
  "  .skks..skkk..skk. .s.kk..",
  "  .skkks.sskkksskk. .ss..",
  "  .sskkk.s.s..s.....s..s.",
  "   .s.k...s.ss.s.sss.sss.",
  "   .s..ssksssskssskksss.",
  "    ..sskkksskkksskkss.",
  "    ..sssskkkskkkskkss.",
  "     .ssssskkkskss....",
];
const wetSkin: Record<string, number> = {
  ".": RGB(41, 47, 52), s: RGB(125, 136, 131), k: RGB(177, 185, 173),
  n: RGB(201, 205, 194), h: RGB(222, 223, 210),
};
const riseStart = 108, riseTicks = 40, holdTicks = 30;
export const WELL_CUT = riseStart + riseTicks + holdTicks;
export function drawSubmergedHand(t: number, x: number, waterY: number): void {
  if (t < riseStart || t >= WELL_CUT) return;
  const p = Math.min(1, (t - riseStart) / riseTicks);
  const visible = Math.floor(wellHand.length * p * p * (3 - 2 * p));
  for (let row = 0; row < visible; row++) {
    for (let col = 0; col < wellHand[row].length; col++) {
      const color = wetSkin[wellHand[row][col]];
      if (color) R.shadeRect(x + col, waterY - visible + row, 1, 1, color, row === visible - 1 ? .62 : 1);
    }
  }
}

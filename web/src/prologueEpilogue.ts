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

// Only the distal tips break the surface. Drawing through a fixed waterline
// hides the lower phalanges even on the final frame before the cut to black.
const fingertips = [
  "      ss           ", "    snnns          ", "    nllnks         ", "   snllnks         ",
  "   snnnkks     ss  ", "   skkkkks   snnns ", "  skkkkkss   nllnks", "  skssskks  snllnks",
  "  skkkkks   sknnkks", " skkkkks    skkkkss", " sksssk   skssskks ", " skkkks   skkkkkss ",
];
const wetSkin: Record<string, number> = {
  n: RGB(125, 137, 135), l: RGB(168, 175, 161), k: RGB(111, 127, 123), s: RGB(67, 80, 85),
};
export const WELL_CUT = 116;
export function drawSubmergedTips(t: number, cx: number, cy: number): void {
  const age = t - (WELL_CUT - 7);
  if (age < 0 || t >= WELL_CUT) return;
  const visible = Math.min(fingertips.length, 1 + 2*age);
  for (let y = 0; y < visible; y++) {
    for (let x = 0; x < fingertips[y].length; x++) {
      const color = wetSkin[fingertips[y][x]];
      if (color) R.shadeRect(cx + x, cy + y - visible, 1, 1, color, y === visible-1 ? .48 : .88);
    }
  }
}

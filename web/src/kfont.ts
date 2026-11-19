// Korean pixel text (Galmuri9 by Lee Minseo, SIL OFL 1.1): the glyphs the story uses, extracted by
// tools/story_build.py into data/kfont.txt. Drawn in screen pixels (576 x 300), `scale` pixels per font dot.
import * as R from "./renderer";
import { RGB } from "./util";

interface Glyph { adv: number; w: number; h: number; xo: number; yo: number; rows: number[] }
const glyphs = new Map<number, Glyph>();
const ASCENT = 11;
export const LINE = 12;                         // font dots per line

export async function load(): Promise<void> {
  const r = await fetch("kfont.txt");
  if (!r.ok) return;
  for (const l of (await r.text()).split("\n")) {
    if (!l || l[0] === "#") continue;
    const p = l.split(" ");
    const rows = p[6] ? p[6].split(",").map((h) => parseInt(h, 16)) : [];
    const w = +p[2];
    const bits = Math.ceil(w / 8) * 8;
    glyphs.set(+p[0], { adv: +p[1], w, h: +p[3], xo: +p[4], yo: +p[5], rows: rows.map((v) => v << (32 - bits) >>> 0) });
  }
}

const glyph = (ch: string) => glyphs.get(ch.codePointAt(0)!) ?? glyphs.get(63);

export function width(s: string, scale = 2): number {
  let w = 0;
  for (const ch of s) w += (glyph(ch)?.adv ?? 6) * scale;
  return w;
}

/** Text with its top-left at screen pixel (x, y); align 0 left, 1 center, 2 right. A dark shadow below-right. */
export function draw(s: string, x: number, y: number, color: number, scale = 2, align = 0, shadow = RGB(10, 8, 16)): void {
  if (align) x -= Math.trunc(width(s, scale) / (align === 1 ? 2 : 1));
  for (let layer = shadow < 0 ? 1 : 0; layer <= 1; layer++) {
    const c = layer === 0 ? shadow : color, d = layer === 0 ? Math.max(1, scale >> 1) : 0;
    let cx = x;
    for (const ch of s) {
      const g = glyph(ch);
      if (!g) { cx += 6 * scale; continue; }
      const top = y + (ASCENT - g.h - g.yo) * scale;
      for (let r = 0; r < g.h; r++) {
        const bits = g.rows[r];
        if (!bits) continue;
        for (let b = 0; b < g.w; b++) if (bits & (0x80000000 >>> b)) R.block(cx + (g.xo + b) * scale + d, top + r * scale + d, c, scale);
      }
      cx += g.adv * scale;
    }
  }
}

/** Break text into lines no wider than maxW screen pixels (at spaces when possible; keeps given line breaks). */
export function wrap(text: string, maxW: number, scale = 2): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const t = line ? line + " " + word : word;
      if (width(t, scale) <= maxW) { line = t; continue; }
      if (line) out.push(line);
      line = "";
      let piece = "";
      for (const ch of word) {                    // a single word too long: break inside it
        if (width(piece + ch, scale) > maxW) { out.push(piece); piece = ""; }
        piece += ch;
      }
      line = piece;
    }
    out.push(line);
  }
  return out;
}

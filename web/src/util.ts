// Helpers that reproduce VBA number semantics used by the original game code.

/** VBA RGB(): red in the low byte (colors stay in this form everywhere; the renderer converts). */
export function RGB(r: number, g: number, b: number): number {
  return (clng(r) & 255) | ((clng(g) & 255) << 8) | ((clng(b) & 255) << 16);
}

/** VBA CLng(): round half to even. */
export function clng(x: number): number {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** VBA Int(): floor. */
export const vint = Math.floor;

/** VBA a \ b on whole numbers (truncates toward zero). */
export function idiv(a: number, b: number): number {
  return Math.trunc(clng(a) / clng(b));
}

/** VBA a Mod b (operands rounded, sign follows the dividend). */
export function mod(a: number, b: number): number {
  return clng(a) % clng(b);
}

export function iif<T>(c: boolean, a: T, b: T): T {
  return c ? a : b;
}

/** Deterministic random numbers (VBA Rnd replacement, seedable for the CPU). */
let seed = 12345;
export function randomize(s: number): void {
  seed = (s >>> 0) || 12345;
}
export function rnd(): number {
  seed = (seed * 1103515245 + 12345) >>> 0;
  return ((seed >>> 8) & 0xffffff) / 0x1000000;
}

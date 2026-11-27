// Durations and velocities in the game data use 50 ms ticks. Use integer
// subframe arithmetic so countdowns hit zero exactly at both simulation rates.
export const LEGACY_MS = 50;
export const FIGHT_STEPS = 3;
export function advanceTicks(ticks: number, steps: number, frames: number): number {
  return (Math.round(ticks * steps) + frames) / steps;
}

// Training observations use elapsed fight frames (including hitstop). Move
// phase lengths use unfrozen simulation frames. Keep both clocks explicit.
import type { MoveFrames } from "./data";
import { FIGHT_STEPS } from "./combatTime";
import { F, attackFrame, hitRects, inRecovery, ST_ATTACK, ST_GUARD, ST_HIT, ST_DOWN, ST_IDLE, ST_CROUCH, ST_WALK } from "./fighter";

interface Observation {
  side: number; move: string; inputAt: number; started: number; timing: MoveFrames;
  firstActive?: number; contactFrame?: number; distance?: number;
  result: string; advantage?: number; wakeup?: boolean; attackerFree?: number; defenderFree?: number;
}
let clock = 0, live = false;
let latest: Observation | undefined;
let cancel: { from: string; to: string; frame: number; advantage?: number } | undefined;
export const report = () => ({latest, cancel});
export function reset(): void { clock = 0; live = false; latest = undefined; cancel = undefined; }
export function tick(): void { clock++; }

export function attackStarted(side: number, move: string, timing: MoveFrames | undefined, chained: boolean, bufferAge: number): void {
  cancel = chained && live && latest
    ? {from: latest.move, to: move, frame: clock - latest.inputAt + 1, advantage: latest.advantage} : undefined;
  live = !!timing;
  if (timing) latest = {side, move, timing, inputAt: clock - bufferAge, started: clock, result: "pending"};
}

export function observeBoxes(): void {
  const r = latest;
  if (!live || !r) return;
  if (F[r.side].state !== ST_ATTACK) {
    if (r.result === "pending") r.result = "interrupted";
    live = false;
    return;
  }
  if (r.firstActive === undefined && hitRects(r.side).length) r.firstActive = clock - r.inputAt + 1;
  if (r.result === "pending" && inRecovery(r.side)) r.result = "whiff";
}

// For a knockdown the wake-up input can change the actual duration.
export function observeWakeup(): void {
  const r = latest;
  if (!r?.wakeup) return;
  const a = F[r.side], d = F[1-r.side];
  if (a.state === ST_IDLE || a.state === ST_CROUCH || a.state === ST_WALK) r.attackerFree ??= clock;
  if (d.state === ST_IDLE || d.state === ST_CROUCH || d.state === ST_WALK) r.defenderFree ??= clock;
  if (r.attackerFree !== undefined && r.defenderFree !== undefined) {
    r.advantage = r.defenderFree - r.attackerFree;
    r.wakeup = false;
  }
}

export function contact(side: number): void {
  const r = latest;
  if (!live || !r || r.side !== side || r.contactFrame !== undefined) return;
  const a = F[side], d = F[1-side];
  r.result = a.contact;
  r.contactFrame = clock - r.inputAt + 1;
  r.distance = Math.abs(a.x - d.x);
  if (d.state === ST_HIT || d.state === ST_GUARD) {
    // Both players wait through the same hitstop and can start their next
    // ordinary action one frame after the last frame of recovery or stun.
    const last = r.timing.startup + r.timing.active + r.timing.recovery;
    r.advantage = Math.round(d.stun * FIGHT_STEPS) - (last - attackFrame(side));
  } else if (d.state === ST_DOWN && d.health > 0) r.wakeup = true;
}

// On-screen buttons for phones: each element with data-btn presses that logical button while touched.
import * as K from "./input";

export function setupTouch(): void {
  const pad = document.getElementById("touch");
  if (!pad) return;
  const held = new Map<number, number[]>();       // pointerId -> buttons it holds
  const setFor = (id: number, btns: number[], time: number) => {
    for (const b of held.get(id) ?? []) if (!btns.includes(b)) K.touch(b, false, time);
    for (const b of btns) K.touch(b, true, time);
    held.set(id, btns);
  };
  const btnsAt = (x: number, y: number): number[] => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const t = el?.closest("[data-btn]") as HTMLElement | null;
    return t ? t.dataset.btn!.split(",").map(Number) : [];
  };
  const down = (e: PointerEvent) => { e.preventDefault(); setFor(e.pointerId, btnsAt(e.clientX, e.clientY), e.timeStamp); };
  const move = (e: PointerEvent) => { if (held.has(e.pointerId)) { e.preventDefault(); setFor(e.pointerId, btnsAt(e.clientX, e.clientY), e.timeStamp); } };
  const up = (e: PointerEvent) => { setFor(e.pointerId, [], e.timeStamp); held.delete(e.pointerId); };
  pad.addEventListener("pointerdown", down);
  pad.addEventListener("pointermove", move);
  pad.addEventListener("pointerup", up);
  pad.addEventListener("pointercancel", up);
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
}

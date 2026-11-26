// Plays the story prologue start to end in the built web game (vite preview on :4173) and prints the step log.
// Usage (from web/): npx vite build && (npx vite preview --port 4173 --strictPort &) ; node ../tools/harness/web/prologue_run.js
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  p.on('console', msg => { if (msg.type() === 'error') errs.push(msg.text()); });
  await p.goto('http://localhost:4173/?sb=http://127.0.0.1:9&sbkey=x'); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const pm = window.__pm, log = [];
    const press = (c) => { window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: c })); pm.tick(); window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: c })); pm.tick(); };
    pm.story.debugPlay('prologue', 0);
    let last = '';
    for (let i = 0; i < 20000; i++) {
      const v = pm.story.debugView(); const d = JSON.parse(pm.story.fieldDebug());
      const s = v.view + '|' + d.step + '|' + d.t;
      if (s !== last && (v.view !== 6 || d.t === 'cutscene' || d.t === 'end')) { log.push(i + ' ' + s + ' ' + v.page.slice(0, 15)); last = s; }
      if (v.view === 0) break;
      if (d.t === 'quest' && v.view === 6) { const q = pm.story.playSteps('prologue', 0)[d.step]; pm.story.fieldWarp(Number(q.x ?? 300)); }
      for (let k = 0; k < 2; k++) pm.tick();
      press(0x41);
    }
    const save = JSON.parse(localStorage.getItem('pixelmurim.story') || '{}');
    const returnedToMenu = pm.story.debugView().view === 0;
    const opened = [];
    if (returnedToMenu) {
      for (let route = 0; route < 6; route++) {
        press(0x28); press(0x41); // Enter each personal route through the regular menu.
        opened.push(pm.story.debugView().view === 1);
        press(0x53);
      }
    }
    log.push('done ' + JSON.stringify(save));
    return { log, save, returnedToMenu, opened };
  });
  await b.close();
  console.log(r.log.slice(-12).join('\n'));
  assert.equal(r.returnedToMenu, true, 'Prologue did not finish');
  assert.equal(r.save.done?.prologue, 1);
  assert.deepEqual(r.opened, Array(6).fill(true), 'A personal route is still locked');
  assert.deepEqual(errs, []);
  console.log('6 personal routes opened, 0 browser errors');
})();

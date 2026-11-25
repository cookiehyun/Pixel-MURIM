// Training-mode screenshots of one fighter (sp1, parry/counter, super) against Danwoo, plus state dumps.
// Usage: node tools/harness/web/training_shots.js <out dir> [char]   (vite preview must be running on :4173)
const { chromium } = require('playwright');
const CHAR = process.argv[3] || 'baekmujin';
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 576, height: 300 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:4173/?sb=http://127.0.0.1:9&sbkey=x'); await p.waitForTimeout(2500);
  await p.evaluate((CHAR) => { const pm = window.__pm, G = pm.G; G.P1Char = CHAR; G.P2Char = 'danwoo'; G.StageIndex = 1; G.GameMode = pm.MODE_TRAINING; G.Multi = false; G.HumanIndex = 0; G.FieldStage = null; pm.startMatch(); pm.setDummy(1); for (let i = 0; i < 100; i++) pm.tick(); }, CHAR);
  const ticks = (n) => p.evaluate((n) => { for (let i = 0; i < n; i++) window.__pm.tick(); }, n);
  const seq = async (dirs, btn) => p.evaluate(([dirs, btn]) => {
    const pm = window.__pm; const kd = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: c })), ku = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: c }));
    const map = { 2: [0x28], 3: [0x28, 0x27], 6: [0x27], 4: [0x25], 1: [0x28, 0x25] };
    for (const dd of dirs) { for (const c of map[dd]) kd(c); pm.tick(); pm.tick(); for (const c of map[dd]) ku(c); }
    if (btn) { kd(btn); pm.tick(); ku(btn); }
  }, [dirs, btn]);
  const st = () => p.evaluate(() => { const F = window.__pm.F, D = window.__pm.D; return [F[0].state, F[0].mv, F[0].stTick, F[1].health, F[1].state, F[0].health]; });
  const shot = async (nm) => { await p.evaluate(() => window.__pm.render()); await p.screenshot({ path: `${out}/${nm}.png`, clip: { x: 60, y: 100, width: 360, height: 190 } }); };
  const near = () => p.evaluate(() => { const F = window.__pm.F; F[1].x = F[0].x + 24; });
  // sp1 thrust
  await near(); await seq([2, 3, 6], 0x41); await ticks(5); await shot('a_thrust'); console.log('thrust', await st()); await ticks(40);
  // parry: 624P, then P2 hits with hp
  await near(); const h0 = (await st())[3];
  await seq([6, 2, 4], 0x41); await ticks(3); await shot('b_parry');
  await p.evaluate(() => { window.__pm.F[1].bufAtk = 1; }); 
  for (let k = 0; k < 8; k++) { await ticks(1); const s = await st(); console.log('parry', k, s); if (k == 4) await shot('c_counter' + k); }
  await ticks(4); await shot('d_counter'); console.log('after', await st(), 'dmg', h0 - (await st())[3]);
  await ticks(40);
  // super
  await p.evaluate(() => { const F = window.__pm.F; F[0].meter = 1000; F[1].x = F[0].x + 40; });
  await seq([2, 6, 2, 6], 0x41);
  for (const t of [6, 6, 6, 6, 6, 6, 6]) { await ticks(t); await shot('e_super' + (await st())[2]); }
  console.log(errs); await b.close();
})();

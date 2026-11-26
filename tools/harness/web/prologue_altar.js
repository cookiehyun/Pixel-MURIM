// Run against vite preview on :4173. An optional directory receives native-resolution canvas captures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [], out = process.argv[2];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://localhost:4173/?sb=http://127.0.0.1:9&sbkey=x');
    await page.waitForFunction(() => !!window.__pm?.story);
    for (const hold of [false, true]) {
      await page.evaluate(() => __pm.story.debugPlay('prologue', 0));
      await page.waitForFunction(() => __pm.story.debugView().view === 6);
      const r = await page.evaluate(({ hold, save }) => {
        const pm = window.__pm, steps = pm.story.playSteps('prologue', 0);
        const wait = steps.findIndex(s => s.kind === 'altarDuel') + 1;
        const hand = steps.findIndex(s => s.kind === 'scarSeep') + 1;
        const flags = steps.findIndex(s => s.map === 'two_flags');
        const frames = { 25:'C', 63:'thrust', 95:'drain', 112:'rescue', 160:'wall', 169:'counter',
          214:'sword', 296:'frenzy', 321:'three-cuts', 362:'wave', 371:'knockback', 380:'down',
          434:'sky-swords', 448:'three-blades', 460:'burst', 484:'kneel', 520:'fallen' };
        const screen = document.querySelector('#screen'), ctx = screen.getContext('2d');
        const shots = {}, lines = [], durations = [], timings = [];
        function snap(name) { if (save && name) shots[name] = screen.toDataURL().split(',')[1]; }
        const poseStrip = () => ctx.getImageData(0, 125, 576, 130).data;
        let previous = -1, age = 0, ticks = 0, handTicks = 0, reached = false, tableau;
        for (let n = 0; n < 4500; n++) {
          const d = JSON.parse(pm.story.fieldDebug());
          age = previous === d.step ? age + 1 : 0;
          previous = d.step;
          if (d.step > flags) { reached = true; break; }
          const line = d.step > wait && d.step < hand && d.talk;
          if (d.step === wait || d.step === hand || line) {
            const start = performance.now(); pm.render(); timings.push(performance.now()-start);
          }
          if (d.step === wait) {
            if (d.talk) throw Error('Dialogue interrupted the duel');
            ticks++;
            snap(frames[age]);
          }
          if (line) {
            if (!age) { lines.push(steps[d.step].text); durations.push(0); }
            durations[durations.length-1]++;
            if (age === 1 && !tableau) tableau = poseStrip();
            if (age > 2 && !poseStrip().every((v, i) => v === tableau[i])) throw Error('Death tableau moved');
            if (age === 24) snap(lines.length === 1 ? 'death' : 'belief');
          }
          if (d.step === hand) {
            handTicks++;
            if (d.talk) throw Error('Hand has narration');
            if (age === 68) snap('hand');
          }
          // In the second run, read both lines without input for six seconds each.
          const press = !(hold && line && age < 120) && n % 2 === 0;
          window.dispatchEvent(new KeyboardEvent(press ? 'keydown' : 'keyup', { keyCode:65 }));
          pm.tick();
        }
        timings.sort((a,b) => a-b);
        return { ticks, handTicks, reached, durations, lines, shots, p95:timings[Math.floor(timings.length*.95)] };
      }, { hold, save: !!out && hold });
      const { shots, ...stats } = r;
      assert.ok(r.reached && r.ticks === 529 && r.handTicks === 76);
      assert.deepEqual(r.lines, ['혈마는 죽었다.', '사람들은 혈월의 밤이 끝났다고 믿었다.']);
      assert.ok(r.durations.every(n => hold ? n >= 120 : n >= 2 && n < 6));
      if (out && hold) {
        fs.mkdirSync(out, { recursive: true });
        for (const [name, data] of Object.entries(shots)) fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));
      }
      console.log(hold ? 'No input at prompts' : 'Rapid A', stats);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

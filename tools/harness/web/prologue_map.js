// Run against vite preview on :4173. Compare the actual canvas to the unburnt map.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://localhost:4173/?sb=http://127.0.0.1:9&sbkey=x');
    await page.waitForFunction(() => !!window.__pm?.story);
    for (const hold of [false, true]) {
      await page.evaluate(() => __pm.story.debugPlay('prologue', 0));
      await page.waitForFunction(() => __pm.story.debugView().view === 6);
      const result = await page.evaluate(async hold => {
        const pm = window.__pm, steps = pm.story.playSteps('prologue', 0);
        const map = steps.findIndex(s => s.map === 'scroll_map');
        const burn = steps.findIndex(s => s.kind === 'mapBurn');
        const altar = steps.findIndex(s => s.map === 'blood_altar');
        const first = '중원의 수많은 문파가 무너졌고,', second = '무림맹과 마교는 혈교를 막기 위해 손을 잡았다.';
        const screen = document.querySelector('#screen'), ctx = screen.getContext('2d');
        const ref = new OffscreenCanvas(screen.width, screen.height).getContext('2d');
        const bitmap = await createImageBitmap(await (await fetch('maps/scroll_map.png')).blob());
        ref.drawImage(bitmap, 0, 0); bitmap.close();
        const pixels = c => new Uint32Array(c.getImageData(0, 0, screen.width, screen.height).data.buffer);
        const original = pixels(ref), holes = new Set(), lines = [], renderMs = [];
        let age = -1, pageAge = 0, last = -1, clean = 0, silentBlack = 0, reached = false;
        const lost = {}, reading = {};
        for (let tick = 0; tick < 3400; tick++) {
          const d = JSON.parse(pm.story.fieldDebug()), s = steps[d.step];
          pageAge = d.step === last ? pageAge + 1 : 0;
          last = d.step;
          if (d.step > altar) { reached = true; break; }
          if (d.step > map && d.step < altar && (d.step > burn || pageAge > 0) && d.cam !== 0) throw Error('Map camera moved');
          if (d.step > burn) age++;
          if (d.talk && d.step > map) reading[s.text] = pageAge;
          if (s.t === 'say' && d.step > map && pageAge === 0) {
            lines.push(s.text);
            if (s.text === second && silentBlack < 18) throw Error('Alliance line before the black hold');
          }
          if (d.step > map && d.step < altar) {
            const before = performance.now();
            pm.render();
            if (age >= 0 && age < 207) renderMs.push(performance.now() - before);
            if (age < 0 || age % 5 === 0 || (!d.talk && age >= 205) || s.text === second) {
              const rgba = pixels(ctx);
              if (age < 0 && rgba.every((v,i) => v === original[i])) clean++;
              if (age >= 0) {
                let n = 0;
                // The dialogue box occupies the top 90 rows. Sample within the paper.
                for (let y = 98; y < 280; y += 4) for (let x = 60; x < 514; x += 4) {
                  const i = y * screen.width + x;
                  if (rgba[i] === 0xff000000 && original[i] !== rgba[i]) holes.add(i);
                  if (holes.has(i) && rgba[i] === original[i]) throw Error('Burned paper returned at ' + i);
                  if (rgba[i] !== original[i]) n++;
                }
                if ([20, 60, 100, 145].includes(age)) lost[age] = n;
                if (!d.talk && rgba.every(v => v === 0xff000000)) silentBlack++;
                if (age >= 206 && !rgba.subarray(90 * screen.width).every(v => v === 0xff000000))
                  throw Error('Finished burn should stay completely dark beneath the dialogue');
              }
            }
          }
          const holdFor = s.text === first ? 320 : 120;
          const wait = hold && d.step > map && d.talk && pageAge < holdFor;
          window.dispatchEvent(new KeyboardEvent(!wait && tick % 2 === 0 ? 'keydown' : 'keyup', { keyCode: 65 }));
          pm.tick();
        }
        renderMs.sort((a, b) => a - b);
        return { reached, lines, clean, lost, reading, silentBlack, p95: renderMs[Math.floor(renderMs.length * .95)], max: renderMs.at(-1) };
      }, hold);
      assert.ok(result.reached && result.clean >= 20);
      assert.deepEqual(result.lines, ['중원의 수많은 문파가 무너졌고,', '무림맹과 마교는 혈교를 막기 위해 손을 잡았다.']);
      if (hold) assert.ok(Object.values(result.reading)[0] >= 320 && Object.values(result.reading)[1] >= 120);
      const counts = Object.values(result.lost);
      assert.ok(counts.length === 4 && counts.every((v,i) => v > (counts[i-1] || 0)));
      console.log(hold ? 'Held A prompts' : 'Rapid A', result);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

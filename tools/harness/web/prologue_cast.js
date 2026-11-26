// Inspect the built game's actual canvas at the three held tableaux. A missing
// or occluded body must fail even if the chapter and its unlock still finish.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:4173/?sb=http://127.0.0.1:9&sbkey=x');
    await page.waitForFunction(() => !!window.__pm?.story);
    await page.evaluate(() => window.__pm.story.debugPlay('prologue', 0));
    await page.waitForFunction(() => window.__pm.story.debugView().view === 6);
    const results = await page.evaluate(() => {
      const pm = window.__pm, data = pm.D, story = pm.story;
      const steps = story.playSteps('prologue', 0);
      const results = {};
      const samples = {
        warSummon: [
          ['sd_monk.lie_down', 47, 96, 2.54, false],
          ['sd_sect_sword.down_1', 94, 96, 2, true],
          ['sd_sect_fist.down_1', 136, 89, 1.65, true],
        ],
        warRise: [
          ['sd_gangsi.walk_0', 47, 96, 2.16, true],
          ['sd_gangsi.walk_0', 94, 96, 2.16, true],
          ['sd_gangsi.walk_0', 136, 89, 1.782, true],
        ],
        warHold: [
          ['sd_gangsi.walk_0', 30, 96, 2.16, true],
          ['sd_gangsi.walk_0', 76, 96, 2.16, true],
          ['sd_gangsi.walk_0', 120, 89, 1.782, true],
          ['sd_blood_acolyte.idle_0', 95, 96, 2.44, true],
          ['sd_blood_acolyte.idle_0', 51, 89, 2.013, true],
          ['sd_blood_acolyte.idle_0', 149, 96, 2.44, true],
        ],
      };
      const ctx = document.querySelector('#screen').getContext('2d');
      for (let tick = 0; tick < 4000; tick++) {
        const d = JSON.parse(story.fieldDebug());
        const cut = steps[d.step - 2]?.kind;
        if (d.t === 'say' && samples[cut] && !results[cut]) {
          pm.render();
          const screen = ctx.getImageData(0, 0, 576, 300).data;
          results[cut] = samples[cut].map(([name, x, y, scale, left]) => {
            const id = data.SprName.indexOf(name), width = data.SprW[id];
            let total = 0, matches = 0;
            for (let row = 0; row < data.SprH[id]; row++) {
              for (let col = 0; col < width; col++) {
                const color = data.SprPix[data.SprOff[id] + row * width + col];
                if (color < 0) continue;
                const px = x * 3 + Math.round((left ? -1 : 1) * (col - data.SprAX[id]) * scale);
                const py = (y + 1) * 3 + Math.round((row - data.SprAY[id] - 1) * scale);
                const offset = 4 * (px + py * 576);
                const actual = screen[offset] | screen[offset + 1] << 8 | screen[offset + 2] << 16;
                total++;
                if (actual === color) matches++;
              }
            }
            return { name, x, match: Math.round(100 * matches / total) };
          });
          if (cut === 'warHold') break;
        }
        if (tick % 4 === 0) window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 65 }));
        if (tick % 4 === 1) window.dispatchEvent(new KeyboardEvent('keyup', { keyCode: 65 }));
        pm.tick();
      }
      return results;
    });
    assert.deepEqual(Object.keys(results), ['warSummon', 'warRise', 'warHold']);
    for (const [cut, actors] of Object.entries(results)) {
      console.log(cut, actors);
      for (const actor of actors) assert.ok(actor.match >= 75, 'Missing ' + actor.name + ' at x=' + actor.x);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

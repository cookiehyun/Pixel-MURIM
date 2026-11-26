// Inspect the built game's actual canvas during the timed prologue. A missing
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
      const actors = {}, black = {}, lines = [];
      let lastStep = -1, activeCut, age = 0;
      const fallen = [
        ['sd_monk.lie_up', 23, 96, 2.54, false],
        ['sd_sect_sword.down_1', 37, 89, 1.65, false],
        ['sd_sect_fist.down_1', 59, 96, 2, false],
      ];
      const samples = {
        'warSummon/48': [
          ['sd_monk.lie_down', 47, 96, 2.54, false],
          ['sd_sect_sword.down_1', 94, 96, 2, true],
          ['sd_sect_fist.down_1', 136, 89, 1.65, true],
        ],
        'warRise/100': [
          ['sd_gangsi.walk_0', 47, 96, 2.16, true],
          ['sd_gangsi.walk_0', 94, 96, 2.16, true],
          ['sd_gangsi.walk_0', 136, 89, 1.782, true],
        ],
        'warRout/80': fallen,
        'warRout/99': [
          ...fallen,
          ['sd_gangsi.walk_0', 30, 96, 2.16, true],
          ['sd_gangsi.walk_0', 76, 96, 2.16, true],
          ['sd_gangsi.walk_0', 120, 89, 1.782, true],
          ['sd_blood_acolyte.idle_0', 95, 96, 2.44, true],
          ['sd_blood_acolyte.idle_0', 51, 89, 2.013, true],
          ['sd_blood_acolyte.idle_0', 149, 96, 2.44, true],
        ],
        'warMarch/24': [
          ['sd_gangsi.walk_2', 21, 96, 2.16, true],
          ['sd_gangsi.walk_1', 66, 96, 2.16, true],
          ['sd_gangsi.walk_1', 110, 89, 1.782, true],
          ['sd_blood_acolyte.idle_0', 86, 96, 2.44, true],
          ['sd_blood_acolyte.walk_0', 41, 89, 2.013, true],
          ['sd_blood_acolyte.idle_0', 139, 96, 2.44, true],
        ],
        'warMarch/74': [
          ...fallen,
          ['sd_gangsi.walk_1', 1, 96, 2.16, true],
          ['sd_gangsi.walk_0', 46, 96, 2.16, true],
          ['sd_gangsi.walk_2', 88, 89, 1.782, true],
          ['sd_blood_acolyte.walk_0', 67, 96, 2.44, true],
          ['sd_blood_acolyte.walk_0', 22, 89, 2.013, true],
          ['sd_blood_acolyte.idle_0', 118, 96, 2.44, true],
        ],
      };
      const ctx = document.querySelector('#screen').getContext('2d');
      for (let tick = 0; tick < 4000; tick++) {
        const d = JSON.parse(story.fieldDebug());
        const step = steps[d.step];
        if (steps[d.step - 1]?.kind === 'scrollfire') break;
        const cut = steps.slice(0, d.step).findLast(s => s.id === 'war')?.kind;
        age = cut === activeCut ? age + 1 : 0;
        activeCut = cut;
        if (step.t === 'say' && d.step !== lastStep) lines.push(step.text);
        lastStep = d.step;
        if (cut === 'warRout' && (d.talk || (age > 0 && d.cam !== 60))) throw Error('Final battle interrupted ' + JSON.stringify(d));
        if (cut === 'warMarch' && d.cam !== 60) throw Error('March camera moved');
        if (step.t === 'map' && step.blackTicks) {
          pm.render();
          const pixels = new Uint32Array(ctx.getImageData(0, 0, 576, 300).data.buffer);
          if (pixels.every(p => (p & 0xffffff) === 0)) black[step.map] = (black[step.map] || 0) + 1;
        }
        const key = cut + '/' + age;
        if (samples[key]) {
          pm.render();
          const screen = ctx.getImageData(0, 0, 576, 300).data;
          actors[key] = samples[key].map(([name, x, y, scale, left]) => {
            const id = data.SprName.indexOf(name), width = data.SprW[id];
            let total = 0, matches = 0;
            for (let row = 0; row < data.SprH[id]; row++) {
              for (let col = 0; col < width; col++) {
                const color = data.SprPix[data.SprOff[id] + row * width + col];
                if (color < 0) continue;
                const px = x * 3 + Math.round((left ? -1 : 1) * (col - data.SprAX[id]) * scale);
                const py = (y + 1) * 3 + Math.round((row - data.SprAY[id] - 1) * scale);
                if (px < 0 || px >= 576 || py < 0 || py >= 300) continue;
                const offset = 4 * (px + py * 576);
                const actual = screen[offset] | screen[offset + 1] << 8 | screen[offset + 2] << 16;
                total++;
                if (actual === color) matches++;
              }
            }
            return { name, x, match: Math.round(100 * matches / total) };
          });
        }
        pm.tick();
      }
      return { actors, black, lines };
    });
    assert.deepEqual(results.lines, [
      '백 년 전, 중원의 하늘에 붉은 달이 떠올랐다.',
      '그리고 그날 밤, 혈교가 모습을 드러냈다.',
      '그들의 교주, 혈마.',
      '쓰러진 자들마저 그의 군세가 되었고,\n죽은 자들은 다시 일어났다.',
      '혈월의 밤, 중원은 피와 공포로 뒤덮였다.',
    ]);
    assert.deepEqual(results.black, { blood_battlefield: 20, scroll_map: 3 });
    assert.deepEqual(Object.keys(results.actors), ['warSummon/48', 'warRise/100', 'warRout/80', 'warRout/99', 'warMarch/24', 'warMarch/74']);
    for (const [cut, actors] of Object.entries(results.actors)) {
      console.log(cut, actors);
      for (const actor of actors) {
        // Marching feet pass in front of the fallen sword and fist fighters.
        const underfoot = cut.startsWith('warRout/') || cut.startsWith('warMarch/');
        const minimum = underfoot && actor.name.endsWith('.down_1') ? 40 : 75;
        assert.ok(actor.match >= minimum, 'Missing ' + actor.name + ' at x=' + actor.x);
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

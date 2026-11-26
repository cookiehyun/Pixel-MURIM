// Inspect the built game's actual canvas during the playable prologue. A missing
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
      const stopped = [
        ['sd_gangsi.walk_0', 9, 96, 2.16, true],
        ['sd_gangsi.walk_0', 19, 89, 1.782, true],
        ['sd_gangsi.walk_0', 44, 96, 2.16, true],
        ['sd_gangsi.walk_0', 28, 96, 2.16, true],
        ['sd_gangsi.walk_0', 67, 96, 2.16, true],
        ['sd_gangsi.walk_0', 101, 89, 1.782, true],
        ['sd_blood_acolyte.idle_0', 85, 96, 2.44, true],
        ['sd_blood_acolyte.idle_0', 55, 89, 2.013, true],
        ['sd_blood_acolyte.idle_0', 121, 96, 2.44, true],
      ];
      const samples = {
        'warClash/31': [['sd_blood_acolyte.hit', 148, 96, 2.44, true]],
        'warClash/47': [['sd_blood_acolyte.atk_1', 144, 96, 2.44, true]],
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
        'warSecondRise/82': [
          ['sd_gangsi.rise_2a', 23, 96, 2.16, true],
          ['sd_gangsi.rise_3a', 37, 89, 1.782, true],
          ['sd_gangsi.rise_4a', 59, 96, 2.16, true],
        ],
        'warSecondRise/127': [
          ['sd_gangsi.walk_0', 23, 96, 2.16, true],
          ['sd_gangsi.walk_0', 37, 89, 1.782, true],
          ['sd_gangsi.walk_0', 59, 96, 2.16, true],
        ],
        'warMarch/24': [
          ['sd_gangsi.walk_2', 41, 96, 2.16, true],
          ['sd_gangsi.walk_0', 77, 96, 2.16, true],
          ['sd_gangsi.walk_1', 114, 89, 1.782, true],
          ['sd_gangsi.walk_2', 14, 96, 2.16, true],
          ['sd_gangsi.walk_1', 28, 89, 1.782, true],
          ['sd_gangsi.walk_1', 49, 96, 2.16, true],
          ['sd_blood_acolyte.idle_0', 96, 96, 2.44, true],
          ['sd_blood_acolyte.walk_0', 61, 89, 2.013, true],
          ['sd_blood_acolyte.idle_0', 143, 96, 2.44, true],
        ],
        'warMarch/100': stopped,
        'warMarch/300': stopped,
      };
      const ctx = document.querySelector('#screen').getContext('2d');
      function promptVisible() {
        pm.render();
        const ink = ctx.getImageData(522, 65, 20, 25).data;
        for (let i = 0; i < ink.length; i += 4) {
          if (ink[i] === 170 && ink[i + 1] === 160 && ink[i + 2] === 190) return true;
        }
        return false;
      }
      let lineAge = 0;
      for (let tick = 0; tick < 4000; tick++) {
        const d = JSON.parse(story.fieldDebug());
        const step = steps[d.step];
        if (steps[d.step - 1]?.t === 'cam' && steps[d.step - 2]?.map === 'scroll_map') break;
        const cut = steps.slice(0, d.step).findLast(s => s.id === 'war')?.kind;
        age = cut === activeCut ? age + 1 : 0;
        activeCut = cut;
        if (step.text === '후세는 그날을 혈월의 밤이라 불렀다.' && (cut !== 'warRise' || age < 110))
          throw Error('Naming line appeared before the first three ghouls stood up');
        if (step.t === 'say' && d.step !== lastStep) lines.push(step.text);
        lineAge = d.step === lastStep ? lineAge + 1 : 0;
        lastStep = d.step;
        if (d.talk && lineAge <= 1 && promptVisible() !== (lineAge === 1)) {
          throw Error('First A should reveal the current line and its prompt');
        }
        // Keep the final line open for 15 seconds; rapidly confirm the other lines.
        const readFor = cut === 'warMarch' ? 301 : cut === 'warClash' ? 72 : 2;
        const confirm = d.talk && (lineAge === 0 || lineAge >= readFor);
        const mashDuringRise = !d.talk && cut === 'warSecondRise' && age < 120 && tick % 2 === 0;
        const press = confirm || mashDuringRise;
        window.dispatchEvent(new KeyboardEvent(press ? 'keydown' : 'keyup', { keyCode: 65 }));
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
      '후세는 그날을 혈월의 밤이라 불렀다.',
      '혈월의 밤, 중원은 피와 공포로 뒤덮였다.',
    ]);
    assert.deepEqual(results.black, { blood_battlefield: 20, scroll_map: 3 });
    assert.deepEqual(Object.keys(results.actors), [
      'warClash/31', 'warClash/47', 'warSummon/48', 'warRise/100', 'warRout/80', 'warRout/99', 'warSecondRise/82',
      'warSecondRise/127', 'warMarch/24', 'warMarch/100', 'warMarch/300',
    ]);
    for (const [cut, actors] of Object.entries(results.actors)) {
      console.log(cut, actors);
      for (const actor of actors) {
        // Standing victors partly cover the two defenders on the ground.
        const underfoot = cut.startsWith('warRout/');
        const minimum = underfoot && actor.name.endsWith('.down_1') ? 40 : 75;
        assert.ok(actor.match >= minimum, 'Missing ' + actor.name + ' at x=' + actor.x);
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

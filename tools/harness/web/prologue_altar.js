// Optional argument receives native-resolution captures, including normal and skipped end states.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const errors = [], out = process.argv[2];
    let ending;
    for (const skipAt of [null, 1, 55, 225, 321]) {
      const page = await browser.newPage();
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto('http://localhost:4173/?sb=http://127.0.0.1:9&sbkey=x');
      await page.waitForFunction(() => !!window.__pm?.story);
      await page.evaluate(() => __pm.story.debugPlay('prologue', 0));
      await page.waitForFunction(() => __pm.story.debugView().view === 6);
      const r = await page.evaluate(({ skipAt, save }) => {
        const pm = window.__pm, steps = pm.story.playSteps('prologue', 0);
        const fight = steps.findIndex(s => s.kind === 'altarDuel') + 1;
        const hand = steps.findIndex(s => s.kind === 'scarSeep') + 1;
        const debug = () => JSON.parse(pm.story.fieldDebug());
        const key = down => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {keyCode:65}));
        function advance(n, down) { key(down); for (let i=0; i<n; i++) pm.tick(); }
        const cv = document.querySelector('#screen'), ctx = cv.getContext('2d'), shots = {};
        const snap = name => { pm.render(); if (save) shots[name] = cv.toDataURL().split(',')[1]; };
        const body = () => { pm.render(); return ctx.getImageData(0,100,576,200).data; };
        const same = (a,b) => a.every((v,i) => v === b[i]);
        const skipPrompt = () => {
          pm.render();
          const strip = ctx.getImageData(510,270,66,30).data;
          for(let i=0; i<strip.length; i+=4) if(strip[i]===232 && strip[i+1]===215 && strip[i+2]===178) return true;
          return false;
        };
        function requireState(ok, why) { if (!ok) throw Error(why + ' ' + pm.story.fieldDebug()); }
        let i=0;
        while(debug().step < fight-2 && i<4000) advance(1, i++%2===0);
        requireState(debug().talk && steps[debug().step].text === '정마연합은 혈교의 본단까지 진격했다.', 'Standoff missing');
        advance(19,false);
        const idle = body(); advance(180,false);
        requireState(same(idle,body()) && !skipPrompt(), 'Standoff ran into combat while reading');
        snap('standoff');
        advance(1,true);
        requireState(debug().step === fight && skipPrompt(), 'Dialogue edge skipped the fight');
        const frames = {25:'thrust',55:'drain',72:'rescue',120:'wall',129:'counter',173:'sword',221:'frenzy',227:'wound',242:'wave',257:'down',317:'blades',342:'burst',364:'kneel',401:'fallen'};
        let age=0;
        while(debug().step===fight && age<450) {
          if(frames[age] && skipAt===null) snap(frames[age]);
          // Keep the standoff key down until the requested release. Holding alone must never skip.
          if(skipAt!==null && age===skipAt-1) advance(1,false);
          else advance(1,true);
          age++;
        }
        requireState(debug().step===fight+1 && debug().talk && !skipPrompt(), 'Missing separate death dialogue');
        const frame=body();
        advance(125,true);
        requireState(debug().step===fight+1 && same(frame,body()), 'Held key advanced dialogue or changed the tableau');
        snap(skipAt===null?'normal-end':'skip-end');
        // Advancing the death line leads to the hand, where the revised second line follows the omen.
        advance(1,false); advance(1,true); advance(1,false);
        for(i=0;i<200 && debug().step!==hand+1;i++) advance(1,false);
        requireState(debug().step===hand+1 && debug().talk && steps[hand+1].text==='사람들은 혈월의 밤이 끝났다고 생각했다.', 'Hand line misplaced');
        // Exercise rapid presses through the epilogue and compare the persistent story outcome.
        for(i=0;i<4000 && pm.story.debugView().view!==0;i++) advance(1,i%2===0);
        const state=JSON.parse(localStorage.getItem('pixelmurim.story'));
        requireState(state.done.prologue===1 && pm.story.debugView().view===0,'Prologue did not finish');
        // Compare every unoccluded scene pixel, including the area where the SKIP prompt lived.
        const bytes=new Uint8Array(frame.buffer);
        let encoded='';
        for(let pos=0;pos<bytes.length;pos+=8192) encoded+=String.fromCharCode(...bytes.subarray(pos,pos+8192));
        return {age, ending:btoa(encoded), state, shots};
      },{skipAt,save:!!out && (skipAt===null || skipAt===55)});
      assert.equal(r.age,skipAt===null?408:skipAt+1);
      if (!ending) ending = [r.ending,r.state];
      else assert.ok(ending[0]===r.ending && JSON.stringify(ending[1])===JSON.stringify(r.state),'Skipped ending differs from natural completion');
      if (out) {
        fs.mkdirSync(out,{recursive:true});
        for (const [name,data] of Object.entries(r.shots)) fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));
      }
      console.log('skipAt',skipAt,'combat ticks',r.age,'prologue complete'); await page.close();
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});

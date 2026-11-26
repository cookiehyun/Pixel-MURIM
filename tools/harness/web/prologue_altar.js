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
    for (const skipAt of [null, 1, 55, 113, 210]) {
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
        requireState(debug().talk && steps[debug().step].text === '그리고 정마연합은 혈교의 본단까지 진격했다.', 'Standoff missing');
        advance(19,false);
        const idle = body(); advance(180,false);
        requireState(same(idle,body()) && !skipPrompt(), 'Standoff ran into combat while reading');
        snap('standoff');
        advance(1,true);
        requireState(debug().step === fight && skipPrompt(), 'Dialogue edge skipped the fight');
        const frames = {25:'thrust',55:'drain',72:'rescue',102:'frenzy',108:'draw',124:'wound',139:'wave',157:'cguard',177:'stagger',208:'blades',233:'burst',249:'kneel',285:'fallen'};
        let age=0;
        while(debug().step===fight && age<450) {
          if(frames[age] && skipAt===null) snap(frames[age]);
          // Keep the standoff key down until the requested release. Holding alone must never skip.
          if(skipAt!==null && age===skipAt-1) advance(1,false);
          else advance(1,true);
          age++;
        }
        requireState(debug().step===fight+1 && debug().talk && !skipPrompt(), 'Missing separate death dialogue');
        // Match the armed crouching guard itself, including mirrored orientation errors.
        const frame=body(), data=pm.D, guard=data.SprName.indexOf('cheonmasw.cguard');
        let matched=0, opaque=0;
        for(let y=0;y<data.SprH[guard];y++) for(let x=0;x<data.SprW[guard];x++) {
          const color=data.SprPix[data.SprOff[guard]+y*data.SprW[guard]+x];
          if(color<0) continue;
          const sx=195+(x-data.SprAX[guard])*2, sy=237+(y-data.SprAY[guard]-1)*2;
          const offset=((sy-100)*576+sx)*4;
          const actual=frame[offset]|frame[offset+1]<<8|frame[offset+2]<<16;
          if(actual===color) matched++;
          opaque++;
        }
        requireState(matched/opaque>.98,'Missing sword crouch guard at the landing');
        advance(125,true);
        requireState(debug().step===fight+1 && same(frame,body()), 'Held key advanced dialogue or changed the tableau');
        snap(skipAt===null?'normal-end':'skip-end');
        // Advancing the death line leads to the hand, where the omen waits for a second, separate confirmation.
        advance(1,false); advance(1,true); advance(1,false);
        const handLine=steps.findIndex(s=>s.text==='그렇게 사람들은 혈월의 밤이 끝났다고 생각했다.');
        for(i=0;i<100 && debug().step!==handLine;i++) advance(1,false);
        requireState(debug().step===handLine && debug().talk, 'Hand line missing');
        const dry=new Uint32Array(body().buffer);
        advance(1,true); // Reveal the complete sentence.
        for(i=0;i<180;i++) {
          requireState(debug().talk && !debug().props.some(p=>p.kind==='scarSeep'), 'Omen began during narration');
          if(i%12===0) requireState(same(dry,new Uint32Array(body().buffer)), 'Hand changed while reading');
          advance(1,false);
        }
        advance(1,true);
        requireState(!debug().talk && debug().step===hand && debug().props.some(p=>p.kind==='scarSeep' && p.t===0),'Omen did not start on confirmation');
        let previousTip=0, changes=0, reachedScar=false, veinFirst=0, veinLast=0, reachedWrist=false, quiet=0;
        for(i=0;i<180 && debug().step===hand;i++) {
          advance(1,false);
          if(skipAt!==null || debug().step!==hand) continue;
          const age=debug().props.find(p=>p.kind==='scarSeep').t;
          const visible=new Uint32Array(body().buffer);
          let count=0,tip=0;
          for(let j=0;j<visible.length;j++) {
            if(visible[j]===dry[j]) continue;
            const x=j%576, y=100+Math.floor(j/576);
            if (age>=66 && x>=272 && y<=199) {
              const skin=dry[j];
              requireState(age<93 && x<=436 && y>=151 && (skin&255)>95 && (skin>>8&255)>54 && (skin>>16&255)>56, 'Vein outside the skin');
              if (!veinFirst) veinFirst=age;
              veinLast=age;
              if (x>=427) reachedWrist=true;
              continue;
            }
            requireState(x>=112 && x<=275 && y>=197 && y<300,'Hand moved outside the blood channel');
            tip=Math.max(tip,x); count++;
          }
          if(count) {
            requireState((age>=66 || tip>=previousTip) && age<86,'Flow reversed or repeated');
            previousTip=tip; changes++;
            if(tip>=270) reachedScar=true;
          }
          if(age>=93) {
            requireState(same(dry,visible),'Omen repeated before fade');
            quiet++;
          }
        }
        if(skipAt===null) {
          requireState(veinFirst>=66 && veinLast<93 && reachedWrist,'Missing one-shot vein spread');
          requireState(changes>=70 && reachedScar && quiet>=10,'Flow or final stillness missing');
        }
        requireState(steps[debug().step].map==='two_flags','Hand did not fade automatically');
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
      assert.equal(r.age,skipAt===null?294:skipAt+1);
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

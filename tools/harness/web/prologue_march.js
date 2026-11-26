// Track the nine sprites from the rendered atlas pixels on every simulation tick.
// Pass a CSV filename to preserve both input paths for frame-by-frame review.
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    let first;
    const csv = ['input,cut,tick,unit,lane,world_x,screen_sprite_anchor_x,frame,matched_percent'];
    for (const mode of ['rapid','hold','stall']) {
      await page.evaluate(() => __pm.story.debugPlay('prologue',0));
      await page.waitForFunction(() => __pm.story.debugView().view === 6);
      const result = await page.evaluate(async mode => {
        const pm = window.__pm, data = pm.D, debug = () => JSON.parse(pm.story.fieldDebug());
        const key = down => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {keyCode:65}));
        const war = () => debug().props.find(q => q.kind.startsWith('war'));
        const ctx = document.querySelector('#screen').getContext('2d');
        // For each pose, sample nontransparent texels in its native size, mapped to the fixed lane.
        const units = [[86,96],[113,89],[163,96],[53,96],[72,96],[139,89],[98,96],[126,89],[150,96]].map(([x,lane],i) => {
          const ghoul = i >= 3, scale = ghoul ? (lane === 96 ? 2.16 : 1.782) : (lane === 96 ? 1.54 : 1.5);
          const sheet = ghoul ? 'sd_gangsi' : 'sd_blood_acolyte';
          const frames = (ghoul ? ['walk_0','walk_1','walk_2'] : ['idle_0','walk_0','walk_1']).map(name => {
            const id = data.SprName.indexOf(sheet+'.'+name), samples = [];
            for(let y=0;y<data.SprH[id];y++) for(let x=0;x<data.SprW[id];x++) {
              const color = data.SprPix[data.SprOff[id]+y*data.SprW[id]+x];
              if(color < 0) continue;
              const sx = Math.round((data.SprAX[id]-x)*scale);
              const sy = (lane+1)*3+Math.round((y-data.SprAY[id]-1)*scale);
              samples.push([sx+576*sy,color]);
              const right=Math.round((data.SprAX[id]-x+1)*scale)-1;
              if(right>sx) samples.push([right+576*sy,color]);
            }
            return {name, samples, artOffset:ghoul && name !== 'walk_0' ? Math.round(scale) : 0};
          });
          return {name:sheet+'-'+(i%3+1)+(i>=6?'-new':''),lane,start:x*3,center:x*3,frames};
        });
        let i=0;
        for(;i<4000;i++) {
          const q=war();
          if(q?.kind==='warSecondRise' && q.t===122) break;
          key(i%2===0);pm.tick();
        }
        if(i===4000) throw Error('Could not enter march');
        key(false);
        if(mode==='stall') {
          for(i=0;i<50;i++) pm.tick();
          await new Promise(requestAnimationFrame);
          const start=war().t, now=performance.now();
          // Simulate one blocked browser frame, long enough for four simulation ticks.
          while(performance.now()-now<225) { /* deliberate test-only long task */ }
          await new Promise(requestAnimationFrame);
          const advanced=war().t-start;
          if(advanced!==1) throw Error('Frame after browser stall jumped '+advanced+' ticks');
          return {advanced};
        }
        const rows=[], poses=[];
        let sawPrompt=false, fadeAge=-1;
        for(i=0;i<400;i++) {
          const d=debug(), q=war();
          if(!q) break;
          const march=q.kind==='warMarch';
          if(d.t==='map') {
            if(fadeAge<0) fadeAge=q.t;
            if(fadeAge<112) throw Error('Premature fade at '+fadeAge);
          }
          if(d.t!=='map' || q.t===112) {
            pm.render();
            const colors=new Uint32Array(ctx.getImageData(0,0,576,300).data.buffer);
            const shifts=[];
            for(const u of units) {
              let best={score:-1};
              // Search near the last observed position, without consulting the march trajectory or phase.
              for(const frame of u.frames) for(let center=u.center-4;center<=u.center+4;center++) {
                const anchor=center+frame.artOffset;
                let hits=0;
                for(const [offset,color] of frame.samples) if((colors[anchor+offset]&0xffffff)===color) hits++;
                const score=hits/frame.samples.length;
                if(score>best.score) best={score,center,anchor,name:frame.name};
              }
              if(best.score<.75 || best.center>u.center || u.center-best.center>1)
                throw Error(JSON.stringify({cut:q.kind,t:q.t,unit:u.name,last:u.center,best}));
              u.center=best.center;
              shifts.push(u.start-u.center);
              const row=[q.kind,q.t,u.name,u.lane,+(u.center/3).toFixed(3),best.anchor,best.name,Math.round(best.score*100)];
              rows.push(row.join(','));
              if(!march || q.t<=112) poses.push(row.join(','));
            }
            if(new Set(shifts).size!==1 || (!march && shifts[0]!==0) || (march && q.t>=112 && shifts[0]!==54))
              throw Error('Formation changed: '+shifts+' at '+q.t);
            if(march && d.talk && !sawPrompt) {
              if(q.t!==24) throw Error('Unexpected first narration tick '+q.t);
              sawPrompt=true;
            }
          }
          key(march && (mode==='rapid' || q.t>220) && i%2===0);
          pm.tick();
        }
        if(!sawPrompt || fadeAge<112 || (mode==='hold' && fadeAge<=220)) throw Error('Missing march or fade');
        return {rows,poses,fadeAge};
      },mode);
      if(mode==='stall') { console.log('225 ms browser stall advanced',result.advanced,'tick'); continue; }
      if(!first) first=result.poses; else assert.deepEqual(first,result.poses);
      csv.push(...result.rows.map(row=>mode+','+row));
      console.log(mode,result.rows.length,'sprite observations, fade tick',result.fadeAge);
    }
    if(process.argv[2]) fs.writeFileSync(process.argv[2],csv.join('\n')+'\n');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

// Hold presentation until the browser has delivered real CDP inputs. Only
// the RAF driver is controlled; DOM timestamps and performance.now stay native.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const {writeFileSync} = require('node:fs');
const {join} = require('node:path');
const phase = process.argv[2];
assert.ok(['before','after'].includes(phase));

async function trial(browser, kind, buttons, late = false) {
  const page = await browser.newPage({hasTouch:true});
  try {
    const cdp = await page.context().newCDPSession(page);
    await page.addInitScript(() => {
      window.requestAnimationFrame = cb => { window.display = cb; return 1; };
    });
    await page.goto((process.env.GAME_URL || 'http://127.0.0.1:4190') + '/?sb=http://127.0.0.1:9&sbkey=x');
    await page.waitForFunction(() => window.__pm, null, {polling:50});
    const {epoch,x,y} = await page.evaluate(({kind,late}) => {
      const pm = window.__pm;
      Object.assign(pm.G,{GameMode:pm.MODE_TRAINING,P1Char:'danwoo',P2Char:'danwoo'});
      pm.startMatch(7); pm.setDummy(1);
      const btn = document.querySelector('[data-btn="4"]').getBoundingClientRect();
      // Warm-up callback more than 250 ms after initialization: the loop's
      // catch-up cap is exactly 15 fight steps, leaving zero fractional debt.
      const start = performance.now()+400;
      const out = window.result = {events:[],samples:[],hits:[],blockMs:0};
      const types = kind==='key' ? ['keydown','keyup'] : ['pointerdown','pointerup'];
      for (const type of types) addEventListener(type, e => out.events.push({
        type, button:e.key || e.target.closest('[data-btn]')?.textContent,
        trusted:e.isTrusted, sourceMs:e.timeStamp-start, deliveredMs:performance.now()-start
      }),true);
      setTimeout(() => {
        const blocked=performance.now();
        window.display(start);
        const [a,d]=pm.F;
        a.x=90; d.x=105;
        let press=a.inPress, hp=d.health, frame=0;
        Object.defineProperty(a,'inPress',{get:()=>press,set:value=>{
          frame++; press=value;
          out.samples.push({frame,mask:value});
        }});
        Object.defineProperty(d,'health',{get:()=>hp,set:value=>{
          if(value<hp) out.hits.push({frame,damage:hp-value});
          hp=value;
        }});
        while(performance.now()<start+63) {}
        out.blockMs=performance.now()-blocked;
        if(late) window.display(start+2000/60); // F1 and F2 committed before handlers run
      },Math.max(0,start-performance.now()));
      window.finishTrial=() => {
        window.display(start+5000/60); // consume the backlog together
        for(let f=6;f<=90;f++) window.display(start+f*1000/60);
        return out;
      };
      return {epoch:performance.timeOrigin+start,x:btn.x+btn.width/2,y:btn.y+btn.height/2};
    },{kind,late});
    const sends=[];
    for (const [i,button] of buttons.entries()) {
      for (const down of [true,false]) {
        const when = epoch+8+17*i+(down?0:3);
        await new Promise(resolve=>setTimeout(resolve,Math.max(0,when-Date.now())));
        const timestamp=when/1000;
        sends.push(kind==='key' ? cdp.send('Input.dispatchKeyEvent',{
          type:down?'rawKeyDown':'keyUp',key:button.toLowerCase(),code:'Key'+button,
          windowsVirtualKeyCode:button.charCodeAt(0),timestamp
        }) : cdp.send('Input.dispatchTouchEvent',{
          type:down?'touchStart':'touchEnd',touchPoints:down?[{x,y,id:1}]:[],timestamp
        }));
      }
    }
    await Promise.all(sends);
    await page.waitForFunction(n=>window.result.events.length===n,buttons.length*2,{polling:10,timeout:3000});
    const {events,samples,hits,blockMs} = await page.evaluate(()=>window.finishTrial());
    assert.equal(samples.length,90);
    assert.ok(blockMs>=55 && blockMs<=70,'block duration '+blockMs);
    for(const [i,e] of events.entries()) {
      const expected=8+17*Math.floor(i/2)+3*(i%2);
      assert.ok(e.trusted && Math.abs(e.sourceMs-expected)<1 && e.deliveredMs>56,JSON.stringify(e));
    }
    const inputs=samples.filter(s=>s.mask);
    const expected=late ? [{frame:3,mask:1}] : buttons.map((b,i)=>({frame:i+1,mask:b==='A'?1:2}));
    if(phase==='after') assert.deepEqual(inputs,expected);
    else if(kind==='key' && !late) assert.deepEqual(inputs,[{frame:4,mask:buttons.includes('S')?3:1}]);
    return {kind,buttons,late,blockMs,events,inputs,hits};
  } finally { await page.close(); }
}

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium'});
  try {
    const rows=[];
    for(const args of [['key',['A','S']],['key',['A','A']],['touch',['A','A']],['key',['A'],true]]) {
      const row=await trial(browser,...args);
      rows.push(row); console.log(row.kind,row.buttons,row.inputs,row.hits);
    }
    writeFileSync(join(__dirname,phase+'.json'),JSON.stringify(rows,null,2)+'\n');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

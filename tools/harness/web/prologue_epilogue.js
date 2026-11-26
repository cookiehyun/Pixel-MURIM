// Run against vite preview on :4173. Optional directory for native-size screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(), errors=[];
    page.on('pageerror', e=>errors.push(String(e)));
    page.on('console', m=>{if(m.type()==='error') errors.push(m.text());});
    await page.goto('http://localhost:4173/?sb=http://127.0.0.1:9&sbkey=x');
    await page.waitForFunction(()=>window.__pm?.story);
    await page.evaluate(()=>__pm.story.debugPlay('prologue',0));
    await page.waitForFunction(()=>__pm.story.debugView().view===6);
    const result = await page.evaluate(async save => {
      const pm=window.__pm,steps=pm.story.playSteps('prologue',0);
      const ctx=document.querySelector('#screen').getContext('2d'), shots={}, lines=[], checked=[];
      const src={};
      for(const name of ['postwar_ruins','postwar_rebuild','luoyang_market']) {
        const bmp=await createImageBitmap(await (await fetch('maps/'+name+'.png')).blob());
        const ref=new OffscreenCanvas(bmp.width,bmp.height).getContext('2d');
        ref.drawImage(bmp,0,0);
        src[name]=new Uint32Array(ref.getImageData(0,0,bmp.width,bmp.height).data.buffer);bmp.close();
      }
      const pixels=()=>{pm.render();return new Uint32Array(ctx.getImageData(0,0,576,300).data.buffer);};
      const shot=name=>{ pm.render(); if(save) shots[name]=ctx.canvas.toDataURL().split(',')[1]; };
      let last=-1, stepAge=0, firstWave, extra=0, started=false, black=false, title=false;
      for(let tick=0;tick<5000;tick++) {
        const d=JSON.parse(pm.story.fieldDebug()), step=steps[d.step], cut=d.props.at(-1);
        if(pm.story.debugView().view!==6) break;
        stepAge=d.step===last?stepAge+1:0;
        if(step.text?.startsWith('마침내 천마')) started=true;
        if(started && d.talk && d.step!==last) lines.push(step.text);
        last=d.step;
        if(cut?.kind==='scarSeep' && cut.t===106) shot('veins');
        const name=steps.slice(0,d.step).findLast(s=>s.map)?.map;
        if(src[name] && !checked.includes(name) && step.t==='wait' && stepAge===Math.min(step.n-2,60) && stepAge>=40) {
          const colors=pixels(), wx=name==='luoyang_market'?268:277, wy=name==='luoyang_market'?259:258;
          // Check the well and landmarks on BOTH sides of the former central crop.
          for(const [x,y] of [[164,211],[170,202],[174,216],[30,119],[535,151],[558,190]]) {
            const sourceX=Math.floor((x-(169-wx*.68))/.68), sourceY=Math.floor((y-(220-wy*.68))/.68);
            if(colors[x+576*y]!==src[name][sourceX+900*sourceY]) throw Error('Unregistered '+name+' at '+x+','+y);
          }
          if(d.cam!==0) throw Error('Panorama camera moved');
          checked.push(name);shot(name);
        }
        if(cut?.kind==='timberCrew' && cut.t===32) shot('carpenters');
        if(cut?.kind==='ripple' && cut.t===45) firstWave=pixels();
        if(cut?.kind==='ripple' && cut.t===115) {
          const second=pixels();
          for(let i=0;i<second.length;i++) if(firstWave[i]!==second[i]){
            const x=i%576,y=Math.floor(i/576);
            if(x<262 || x>280 || y<225 || y>236) throw Error('Extra body outside fingertip patch');
            extra++;
          }
          shot('fingertips');
        }
        if(cut?.kind==='black' && cut.t===0) black=pixels().every(p=>(p&0xffffff)===0);
        if(step.t==='title' && stepAge===68) {
          const c=pixels(), ink=0xb4d2e6;
          title=step.text==='서장\n「혈월의 밤」 끝' && [[208,234],[236,261]].every(([y,z])=>
            c.subarray(576*y,576*z).some(p=>(p&0xffffff)===ink));
          shot('end');
        }
        const press=d.talk ? stepAge>=4 && stepAge%2===0 : step.t==='title' ? stepAge>=72 && tick%2===0 : tick%2===0;
        window.dispatchEvent(new KeyboardEvent(press?'keydown':'keyup',{keyCode:65})); pm.tick();
      }
      return {lines,checked,extra,black,title,shots};
    },!!process.argv[2]);
    assert.deepEqual(result.lines,['마침내 천마와 무림맹주는 힘을 합쳐 혈마를 무찔렀다.','그렇게 사람들은 혈월의 밤이 끝났다고 생각했다.','전쟁이 끝나자 정과 마는 다시 각자의 길을 걸었고,','혈월의 밤도 하나의 전설이 되어 서서히 잊혀 갔다.']);
    assert.deepEqual(result.checked,['postwar_ruins','postwar_rebuild','luoyang_market']);
    assert.ok(result.extra>20 && result.extra<145 && result.black && result.title,JSON.stringify({...result,shots:undefined}));
    if(process.argv[2]) {
      fs.mkdirSync(process.argv[2],{recursive:true});
      for(const [name,data] of Object.entries(result.shots)) fs.writeFileSync(path.join(process.argv[2],name+'.png'),Buffer.from(data,'base64'));
    }
    assert.deepEqual(errors,[]);
    console.log('Four manual lines, three aligned panoramas,',result.extra,'fingertip pixels, immediate blackout and two-line title; no console errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

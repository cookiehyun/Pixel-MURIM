// Vite dev, Playwright + system Chromium. Give the opponent a second real
// keyboard mapping in the test page; keep the original single-player modes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const phase = process.argv[2];

async function setupPage(browser, mode) {
  const page=await browser.newPage();
  await page.route('**/src/game.ts*',async route=>{
    const response=await route.fetch(), source=await response.text();
    const dummy='Fighter.feedDummy(i, pulse)';
    assert.ok(source.includes(dummy));
    await route.fulfill({response,body:source.replace(dummy,'Fighter.feedHuman(i, 2)')});
  });
  await page.route('**/src/combat.ts*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+'\nexport const testCombo = side => mCombo[side];'});
  });
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto((process.env.GAME_URL || 'http://127.0.0.1:4190')+'/?sb=http://127.0.0.1:9&sbkey=x');
  await page.waitForFunction(()=>window.__pm,null,{polling:50});
  await page.evaluate(async mode=>{
    const load=name=>import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/'+name+'.ts').name);
    const {gameTick}=await load('game'), K=await load('input'), R=await load('renderer');
    const pm=window.__pm,{G,F,D,fighter,combat}=pm,[a,d]=F;
    const key=(code,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{keyCode:code}));
    const press=code=>{key(code,true);key(code,false);};
    const menu=code=>{press(code);pm.tick();pm.tick();};
    const ticks=n=>{for(let i=0;i<n;i++) gameTick();};
    menu(65);
    for(let i=0;i<{training:3,arcade:1,tag:2}[mode];i++) menu(40);
    menu(65);menu(65);
    if(mode==='arcade') {
      menu(65);
      for(let i=0;i<5;i++){ticks(75);pm.arcade.matchOver(true);}
      ticks(75);
    } else {
      menu(37);menu(65);
      if(mode==='tag'){menu(37);menu(37);menu(65);menu(39);menu(65);menu(65);}
      menu(65);
    }
    if(G.GameMode!=={training:0,arcade:3,tag:4}[mode] || G.Multi || G.GameState!==1) throw Error('menu route '+mode);
    K.setVK(K.keyOf(2,2),79); // O = opponent jump; N/L = left/right
    K.setVK(K.keyOf(2,0),78); K.setVK(K.keyOf(2,1),76);
    let frame,ground,row,record,images,probe;
    const round=n=>+n.toFixed(3);
    function begin({face,setup,tag=false,capture=false,thirdProbe=false}) {
      for(const code of [40,83,88,79,78,76]) key(code,false);
      pm.startMatch(17);pm.setDummy(fighter.DUMMY_IDLE);ticks(180);
      if(tag){press(67);ticks(75);}
      if(pm.tag.active() && pm.tag.tagCount(0)!==Number(tag)) throw Error('tag swap');
      if(!a.onGround || a.prefix!=='danwoo' || d.prefix!=='danwoo') throw Error('mirror');
      ground=a.footY;
      a.x=90;d.x=a.x+face*(setup==='seed'?6:12);a.facing=face;d.facing=-face;
      if(setup==='seed') Object.assign(d,{state:fighter.ST_JUMP,footY:ground-22,onGround:false,vy:0});
      frame=0;record=capture;images=[];probe=thirdProbe;
      row={setup,face,tag,inputs:[],starts:[],hits:[],landing:null,escape:false,exposedAfterFollow:0};
    }
    function advance(end) {
      while(frame<end){
        frame++;
        const hp=d.health, wasAir=!d.onGround, prev=a.state;
        gameTick();
        if(a.inPress) row.inputs.push({frame,mask:a.inPress,dir:a.inDir});
        if(d.inDir>=7 && !row.jumpInput) row.jumpInput=frame;
        if(a.state===fighter.ST_ATTACK && prev!==a.state)
          row.starts.push({frame,move:a.mv===pm.moveId('danwoo.chp')?'chp':a.mv===pm.moveId('danwoo.hk')?'hk':'other'});
        if(hp>d.health) row.hits.push({frame,move:row.starts.at(-1)?.move,damage:hp-d.health,
          distance:round(Math.abs(a.x-d.x)),height:round(ground-d.footY),vx:round(d.vx),vy:round(d.vy),
          combo:combat.testCombo(0),sprite:D.SprName[fighter.currentSprite(1)]});
        if(hp>d.health && fighter.canAirFollow?.(1)) {
          const mask=R.spriteMask(fighter.currentSprite(1),Math.round(d.x),Math.round(d.footY),d.facing<0);
          row.posePixels=mask.size;
          for(const b of fighter.hurtRects(1)) for(let y=b.y;y<b.y+b.h;y++) for(let x=b.x;x<b.x+b.w;x++)
            if(!mask.delete(x+1024*y)) throw Error('hurt region outside or duplicating visible pose');
          if(mask.size || !row.posePixels) throw Error('incomplete airborne hurt region');
        }
        if(probe && hp>d.health && row.hits.length===2) {
          // Isolate target invulnerability from the attacker's own hit latch
          // and recovery. Present a fresh active HK directly over a painted
          // cell of the falling pose and run the actual collision resolver.
          const box=fighter.hitRects(0)[0], x=a.x, y=a.footY;
          const pixels=R.spriteMask(fighter.currentSprite(1),Math.round(d.x),Math.round(d.footY),d.facing<0);
          const cell=pixels.values().next().value;
          a.x+=cell%1024-box.x; a.footY+=Math.floor(cell/1024)-box.y;
          if(!fighter.hitRects(0).some(b=>fighter.intersection(b,{x:cell%1024,y:Math.floor(cell/1024),w:1,h:1})))
            throw Error('third attack did not overlap the falling sprite');
          const saved=a.struckGroups;
          a.struckGroups=[];a.hasHit=false;
          const targetHP=d.health;
          combat.resolve(3);
          row.thirdProbe={frame,damage:targetHP-d.health,combo:combat.testCombo(0),hurtRects:fighter.hurtRects(1).length};
          a.x=x;a.footY=y;a.hasHit=true;a.struckGroups=saved;
        }
        if(row.hits.length && !row.landing){
          if(wasAir && d.onGround) row.landing={frame,distance:round(Math.abs(a.x-d.x)),state:d.state};
          if(!row.defenceInput && (d.inDir===4 || d.inDir===8) && row.hits[0].frame<frame)
            row.defenceInput={frame,dir:d.inDir};
          if(d.state===fighter.ST_JUMP || d.state===fighter.ST_GUARD) row.escape=true;
          if(row.hits.length===2 && fighter.hurtRects(1).length) row.exposedAfterFollow++;
        }
        if(record && frame%2===1){
          pm.render(); images.push(document.querySelector('#screen').toDataURL().split(',')[1]);
        }
      }
    }
    function schedule(config){
      const {face,setup,x,defend}=config, upper=setup==='seed'?1:3;
      const inputs=[];
      const tap=(f,k)=>inputs.push([f,k,true],[f,k,false]);
      if(setup==='jump') tap(1,79);
      inputs.push([upper,40,true]);tap(upper,83);inputs.push([upper+1,40,false]);
      if(x) tap(x,88);
      if(defend){
        const back=face===1?76:78;
        const button=defend==='guard'?back:79;
        inputs.push([upper+10,button,true],[upper+68,button,false]);
      }
      return inputs.sort((a,b)=>a[0]-b[0]);
    }
    function trial(config) {
      begin(config);
      for(const [f,k,down] of schedule(config)){advance(f-1);key(k,down);}
      advance(120);
      return row;
    }
    window.verifier={begin,advance,schedule,trial,result:()=>row,images:()=>images};
  },mode);
  return page;
}

// Use Chromium's keyboard for the canonical trials; tick up to each input
// boundary so host scheduling cannot move an event into the next fight frame.
async function nativeTrial(page, config) {
  const actions=await page.evaluate(c=>{verifier.begin(c);return verifier.schedule(c);},config);
  const names={40:'ArrowDown',79:'o',78:'n',76:'l',83:'s',88:'x',73:'i',85:'u'};
  for(const [frame,key,down] of actions){
    await page.evaluate(end=>verifier.advance(end),frame-1);
    await page.keyboard[down?'down':'up'](names[key]);
  }
  return page.evaluate(()=>{verifier.advance(120);return verifier.result();});
}

async function saveGif(page,output){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'murim-3a-'));
  const images=await page.evaluate(()=>verifier.images());
  images.forEach((img,i)=>fs.writeFileSync(path.join(dir,String(i).padStart(3,'0')+'.png'),Buffer.from(img,'base64')));
  execFileSync('ffmpeg',['-v','error','-y','-framerate','30','-i',path.join(dir,'%03d.png'),'-filter_complex',
    'split[a][b];[a]palettegen[p];[b][p]paletteuse','-loop','0',output]);
}

async function main(){
  assert.ok(['before','after'].includes(phase));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
  const results=[],errors=[];
  try {
    for(const mode of ['training','arcade','tag']){
      const page=await setupPage(browser,mode);
      page.on('pageerror',e=>errors.push(e.message));
      for(const tag of mode==='tag'?[false,true]:[false]) for(const face of [1,-1]) for(const setup of ['seed','jump']){
        const config={face,tag,setup};
        const scan=await page.evaluate(c=>{
          const successes=[];
          for(let x=1;x<=115;x++){
            if(verifier.trial({...c,x}).hits.length===2) successes.push(x);
          }
          return successes;
        },config);
        const x=setup==='seed'?56:58; // first unbuffered action after uppercut recovery
        const capture=phase==='after' && mode==='training' && face===1 && setup==='jump';
        const combo=await nativeTrial(page,{...config,x,capture});
        if(capture){
          await saveGif(page,path.join(__dirname,'jump-combo.gif'));
        }
        const noX=await nativeTrial(page,config);
        const late=await nativeTrial(page,{...config,x:setup==='seed'?62:60});
        const guard=await nativeTrial(page,{...config,x,defend:'guard'});
        const jump=await nativeTrial(page,{...config,x,defend:'jump'});
        const probe=phase==='after'?await page.evaluate(c=>verifier.trial(c).thirdProbe,{...config,x,thirdProbe:true}):undefined;
        results.push({mode,...config,window:scan,combo,noX,late,guard,jump,probe});
      }
      await page.close();
    }
    assert.deepEqual(errors,[]);
    const original=phase==='after'?JSON.parse(fs.readFileSync(path.join(__dirname,'before.json'),'utf8')):[];
    for(const r of results){
      assert.equal(r.noX.hits.length,1);
      assert.equal(r.noX.hits[0].damage,80);
      assert.ok(r.noX.landing && r.combo.landing);
      assert.deepEqual(r.combo.starts.map(s=>s.move),['chp','hk']);
      assert.deepEqual(r.late.starts.map(s=>s.move),['chp','hk']);
      assert.equal(r.combo.hits[0].frame,r.setup==='jump'?12:10);
      if(r.setup==='jump') assert.equal(r.combo.jumpInput,1);
      if(phase==='before'){assert.equal(r.window.length,0);continue;}
      const old=original.find(b=>b.mode===r.mode && b.tag===r.tag && b.face===r.face && b.setup===r.setup);
      assert.deepEqual(r.combo.inputs,old.combo.inputs);
      assert.deepEqual(r.combo.starts,old.combo.starts);
      assert.equal(r.noX.landing.frame,old.noX.landing.frame);
      for(const field of ['frame','height','distance','damage','vy'])
        assert.equal(r.combo.hits[0][field],old.combo.hits[0][field]);
      const lo=r.setup==='seed'?41:43, hi=r.setup==='seed'?61:59;
      assert.deepEqual(r.window,Array.from({length:hi-lo+1},(_,i)=>lo+i));
      assert.equal(r.combo.hits[0].vx,0.55*r.face);
      assert.ok(r.combo.posePixels>0);
      assert.ok(r.combo.hits.every(h=>h.height>0));
      assert.equal(r.probe.damage,0);assert.equal(r.probe.combo,2);assert.equal(r.probe.hurtRects,0);
      assert.deepEqual(r.combo.hits.map(h=>[h.damage,h.combo]),[[80,1],[100,2]]);
      for(const [defence,dir] of [[r.guard,4],[r.jump,8]]) {
        assert.deepEqual(defence.hits,r.combo.hits);
        assert.equal(defence.escape,false);
        assert.equal(defence.defenceInput.dir,dir);
        assert.ok(defence.defenceInput.frame<defence.hits[1].frame);
      }
      assert.equal(r.late.hits.length,1);
      assert.equal(r.combo.exposedAfterFollow,0);
      assert.ok(r.combo.landing.frame>r.combo.hits[1].frame);
    }
    fs.writeFileSync(path.join(__dirname,phase+'.json'),JSON.stringify(results,null,2)+'\n');
    console.log(phase,results.length,'mode / setup / direction combinations passed');
  } finally {await browser.close();}
}
module.exports={setupPage,nativeTrial,saveGif};
if(require.main===module) main().catch(e=>{console.error(e);process.exitCode=1;});

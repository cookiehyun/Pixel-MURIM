// Reuse 3A's menu routes, independent keyboard controller, per-frame combat
// sampling, painted-pixel probe and GIF recorder. Only the opening inputs differ.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {setupPage,nativeTrial,saveGif} = require('../combat-phase3a/verify.cjs');
const phase = process.argv[2];

async function installScenario(page) {
  await page.evaluate(async()=>{
    const air=window.verifier;
    const {F,fighter}=window.__pm, [attacker,defender]=F;
    const inputURL=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/input.ts').name;
    const K=await import(inputURL);
    K.setVK(K.keyOf(2,7),73); // I = opponent X
    K.setVK(K.keyOf(2,4),85); // U = opponent A
    let f=0, hp=defender.health, damageEvents;
    // Observe state when damage is applied, before applyHit changes the pose.
    Object.defineProperty(defender,'health',{configurable:true,get:()=>hp,set:n=>{
      if(damageEvents && n<hp) damageEvents.push({frame:f,ground: defender.onGround,
        startup:fighter.inStartup(1),active:fighter.inActive(1),result:attacker.contact});
      hp=n;
    }});
    function begin(c){
      damageEvents=undefined;
      air.begin({...c,setup:'ground'});
      // At 16px the jab is already active and out of range when the uppercut connects.
      if(c.opening==='active') defender.x=attacker.x+16*c.face;
      if(c.opening==='ko') defender.health=100;
      f=0; damageEvents=[];
      Object.assign(air.result(),{opening:c.opening??'counter',opponentPresses:[],damageEvents});
    }
    function schedule(c){
      const events=[];
      const tap=(f,k)=>events.push([f,k,true],[f,k,false]);
      events.push([1,40,true]);tap(1,83);events.push([2,40,false]);
      const back=c.face===1?76:78;
      switch(c.opening){
        case 'normal': break;
        case 'guard': events.push([1,back,true],[30,back,false]); break;
        case 'active': tap(4,85); break;
        default: tap(7,73);
      }
      if(c.x) tap(c.x,88);
      if(c.defend){
        const k=c.defend==='jump'?79:back;
        events.push([14,k,true],[70,k,false]);
      }
      return events.sort((a,b)=>a[0]-b[0]);
    }
    function advance(end){
      while(f<end){
        air.advance(++f);
        const row=air.result();
        if(defender.inPress) row.opponentPresses.push({frame:f,mask:defender.inPress});
        if(!row.first && ['guard','hit','counter'].includes(attacker.contact)){
          row.first={frame:f,result:attacker.contact,ground:defender.onGround,
            canFollow:fighter.canAirFollow(1),hp:defender.health};
        }
      }
    }
    function trial(c){
      begin(c);
      for(const [time,keyCode,down] of schedule(c)){
        advance(time-1);
        dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{keyCode}));
      }
      advance(120);
      return air.result();
    }
    window.verifier={...air,begin,advance,schedule,trial};
  });
}

async function main(){
  assert.ok(['before','after'].includes(phase));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
  const rows=[];
  try{
    for(const mode of ['training','arcade','tag']){
      const page=await setupPage(browser,mode), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await installScenario(page);
      for(const tag of mode==='tag'?[false,true]:[false]) for(const face of [1,-1]){
        const config={face,tag};
        const scan=await page.evaluate(c=>{
          const success=[];
          for(let x=1;x<=120;x++){
            const r=verifier.trial({...c,x});
            if(r.hits.length===2 && r.hits[1].combo===2 && !r.damageEvents[1].ground) success.push(x);
          }
          return success;
        },config);
        const capture=phase==='after' && mode==='training' && face===1;
        const combo=await nativeTrial(page,{...config,x:56,capture});
        if(capture) await saveGif(page,path.join(__dirname,'ground-counter.gif'));
        const r={mode,tag,face,window:scan,combo};
        for(const opening of ['normal','guard','active','ko']) r[opening]=await nativeTrial(page,{...config,opening});
        for(const defend of ['jump','guard']) r['hold_'+defend]=await nativeTrial(page,{...config,x:56,defend});
        r.noX=await nativeTrial(page,config);
        if(scan.length){
          r.early=await nativeTrial(page,{...config,x:scan[0]-1});
          r.firstSuccess=await nativeTrial(page,{...config,x:scan[0]});
          r.lastSuccess=await nativeTrial(page,{...config,x:scan.at(-1)});
          r.late=await nativeTrial(page,{...config,x:scan.at(-1)+1});
          r.probe=await page.evaluate(c=>verifier.trial({...c,x:56,thirdProbe:true}).thirdProbe,config);
        }
        rows.push(r);
      }
      assert.deepEqual(errors,[]);
      await page.close();
    }
    const baseline=phase==='after'?JSON.parse(fs.readFileSync(path.join(__dirname,'before.json'))):[];
    for(const r of rows){
      assert.deepEqual(r.combo.opponentPresses,[{frame:7,mask:8}]);
      const first=r.combo.hits[0];
      assert.equal(first.frame,13);assert.equal(first.damage,100);
      assert.equal(r.combo.first.result,'counter');
      assert.equal(r.noX.hits.length,1);
      assert.equal(r.normal.hits[0].damage,80);assert.ok(r.normal.first.ground);
      assert.equal(r.guard.first.result,'guard');assert.equal(r.guard.hits.length,0);
      assert.ok(r.active.damageEvents[0].active);assert.equal(r.active.hits[0].damage,80);
      assert.ok(r.active.first.ground);
      assert.equal(r.ko.first.hp,0);assert.equal(r.ko.first.canFollow,false);
      if(phase==='before'){
        assert.ok(r.combo.first.ground);assert.equal(r.window.length,0);continue;
      }
      const old=baseline.find(b=>b.mode===r.mode && b.tag===r.tag && b.face===r.face);
      for(const opening of ['normal','guard','active','ko']) assert.deepEqual(r[opening],old[opening]);
      assert.deepEqual(r.combo.inputs,old.combo.inputs);
      assert.deepEqual(r.window,Array.from({length:22},(_,i)=>41+i));
      assert.deepEqual(r.combo.damageEvents.map(e=>[e.ground,e.startup,e.result]),
        [[true,true,'counter'],[false,false,'air']]);
      assert.ok(r.combo.first.canFollow);
      assert.equal(first.vx,r.face*0.55);assert.equal(first.vy,-4.5);
      assert.deepEqual(r.combo.hits.map(h=>[h.frame,h.damage,h.combo]),[[13,100,1],[68,100,2]]);
      assert.equal(r.combo.landing.frame,88);
      assert.equal(r.combo.landing.state,7); // ST_DOWN
      for(const edge of [r.firstSuccess,r.lastSuccess]) assert.equal(edge.hits[1].combo,2);
      assert.deepEqual(r.combo.starts.map(s=>s.frame),[1,56]);
      assert.equal(r.noX.landing.frame,76);
      assert.equal(r.combo.exposedAfterFollow,0);
      assert.deepEqual(r.early.starts.map(s=>s.move),['chp']);
      assert.deepEqual(r.late.starts.map(s=>s.move),['chp','hk']);
      for(const [defence,dir] of [[r.hold_guard,4],[r.hold_jump,8]]){
        assert.deepEqual(defence.hits,r.combo.hits);
        assert.equal(defence.defenceInput.dir,dir);assert.equal(defence.escape,false);
      }
      assert.equal(r.early.hits.length,1);assert.equal(r.late.hits.length,1);
      assert.equal(r.probe.damage,0);assert.equal(r.probe.combo,2);assert.equal(r.probe.hurtRects,0);
    }
    fs.writeFileSync(path.join(__dirname,phase+'.json'),JSON.stringify(rows,null,2)+'\n');
    console.log(phase,rows.length,'mode / direction combinations passed');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

// Run against Vite dev. Each call to gameTick drives the actual 60 Hz fight
// update, including DOM input polling. No tests write to move or fighter clocks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const baseline = process.argv[2] === 'baseline';

async function run(page, shifted) {
  if (shifted) await page.route('**/combat-profiles.json', async route => {
    const response=await route.fetch();
    const data=await response.json();
    data.danwoo.frames.lp.startup++;
    await route.fulfill({response,json:data});
  });
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto((process.env.GAME_URL || 'http://127.0.0.1:4190')+'/?sb=http://127.0.0.1:9&sbkey=x');
  await page.waitForFunction(()=>window.__pm,null,{polling:50});
  return page.evaluate(async ({shifted,baseline})=>{
    const pm=window.__pm, {fighter:Ftr,F,G}=pm;
    const loaded=name=>performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/'+name+'.ts').name;
    const {gameTick}=await import(loaded('game'));
    const report=baseline ? ()=>({}) : (await import(loaded('trainingFrames'))).report;
    const buttons={lp:65,hp:83,hk:88,chp:83,lk:90};
    const key=(code,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{keyCode:code}));
    const tap=code=>{key(code,true); key(code,false);};
    function setup(face,distance,guard) {
      Object.assign(G,{GameMode:pm.MODE_TRAINING,P1Char:'danwoo',P2Char:'danwoo',HumanIndex:0,Multi:false});
      pm.startMatch(17); pm.setDummy(guard?Ftr.DUMMY_GUARD:Ftr.DUMMY_IDLE);
      F[0].x=90; F[1].x=90+face*distance;
      F[0].facing=face; F[1].facing=-face;
    }
    function attempt({move,face,distance,guard=false,jumpSide,follow,punish}) {
      setup(face,distance,guard);
      const active=[],contacts=[],jumps=[],starts=[];
      let frame=0, jumpHeld=false, result, cancel, attackerRecovered, physical, punishInput;
      const targetId=pm.moveId('danwoo.'+move);
      for(frame=1;frame<=100;frame++) {
        if(frame===1) {
          if(move==='chp') key(40,true);
          tap(buttons[move]);
        }
        if(frame===2 && move==='chp') key(40,false);
        if(physical && !jumpHeld && jumpSide!==undefined) {
          Ftr.setControl(jumpSide); key(38,true); jumpHeld=true;
        }
        if(follow && physical?.frame===frame-1) tap(buttons[follow]);
        if(punish && physical?.frame===frame-1) {
          Ftr.setControl(1); pm.setDummy(Ftr.DUMMY_IDLE);
        }
        if(punish && physical && !punishInput && F[1].state===Ftr.ST_GUARD && F[1].stun===0 && !pm.C.HitStop) {
          punishInput=frame; tap(buttons[punish]);
        }
        const previous=F.slice(0,2).map(f=>({state:f.state,mv:f.mv,t:f.stTick,sub:f.subframe,hp:f.health}));
        gameTick();
        for(const [i,f] of F.slice(0,2).entries()) {
          const p=previous[i];
          if(f.state===Ftr.ST_ATTACK && (p.state!==Ftr.ST_ATTACK || (f.stTick===0 && f.subframe===0 && (p.t!==0 || p.sub!==0 || p.mv!==f.mv))))
            starts.push({side:i,frame,move:f.mv});
          if(f.state===Ftr.ST_JUMP && p.state!==Ftr.ST_JUMP) jumps.push({side:i,frame});
          if(f.health<p.hp) contacts.push({attacker:1-i,frame,damage:p.hp-f.health,defenderPreviousState:p.state});
        }
        if(F[0].state===Ftr.ST_ATTACK && F[0].mv===targetId && Ftr.hitRects(0).length) active.push(frame);
        if(previous[0].state===Ftr.ST_ATTACK && [Ftr.ST_IDLE,Ftr.ST_CROUCH].includes(F[0].state)) attackerRecovered??=frame;
        if(!physical && F[0].state===Ftr.ST_ATTACK && ['guard','hit'].includes(F[0].contact)) {
          physical={frame,distance:Math.abs(F[0].x-F[1].x),outcome:F[0].contact};
        }
        if(!baseline && move==='chp' && distance===18 && face===1 && jumpSide===0 && physical?.frame===frame) {
          pm.render();
          window.frameCapture=document.querySelector('#screen').toDataURL().split(',')[1];
        }
        const obs=report();
        if(obs.latest?.move===move && (!result?.contactFrame || obs.latest.started===result.started)) result={...obs.latest};
        if(obs.cancel) cancel={...obs.cancel};
      }
      if(jumpHeld) { key(38,false); gameTick(); }
      return {move,face,distance,guard,jumpSide,follow,punish,firstBox:active[0],contacts,jumps,starts,
        attackerRecovered,physical,punishInput,result,cancel,finalObservation:report().latest,finalResult:report().latest?.result};
    }
    if(shifted) return attempt({move:'lp',face:1,distance:12});
    const rows=[],combos=[],punishes=[],whiffs=[];
    for(const face of [1,-1]) {
      for(const [move,distance] of [['lp',12],['hk',12],['chp',12],['chp',18]]) {
        for(const guard of (distance===18?[false]:[false,true])) {
          for(const jumpSide of [0,1]) rows.push(attempt({move,distance,face,guard,jumpSide}));
        }
      }
      for(const [distance,follow] of [[12,'lp'],[15,'lp'],[15,'hp']])
        combos.push(attempt({move:'lp',distance,face,follow}));
      for(const punish of ['lp','hp','lk']) punishes.push(attempt({move:'chp',distance:12,face,guard:true,punish}));
      for(const [move,distance] of [['lp',16],['hk',29],['chp',19]]) whiffs.push(attempt({move,distance,face}));
    }
    return {rows,combos,punishes,whiffs};
  },{shifted,baseline});
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium'});
  try {
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    const base=await run(page,false);
    assert.deepEqual(errors,[]);
    // Keep the unmodified engine measurements separate from the training HUD.
    function measured(r) {
      const {result,cancel,finalResult,finalObservation,...physical}=r;
      return physical;
    }
    const actual=Object.fromEntries(Object.entries(base).map(([name,rows])=>[name,rows.map(measured)]));
    const reference=path.join(__dirname,'2168026.json');
    if(baseline) {
      fs.writeFileSync(reference,JSON.stringify(actual,null,2)+'\n');
      return;
    }
    assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(fs.readFileSync(reference,'utf8')));
    const shifted=await run(await browser.newPage(),true);
    for(let i=0;i<base.rows.length;i+=2) {
      const [a,d]=base.rows.slice(i,i+2);
      const first={lp:7,hk:13,chp:10}[a.move];
      const advantage=a.distance===18?0:({lp:[3,-3],hk:[6,-3],chp:[-3,-12]}[a.move][Number(a.guard)]);
      for(const r of [a,d]) {
        assert.equal(r.firstBox,first);
        assert.equal(r.result.firstActive,first);
        assert.equal(r.result.contactFrame,r.distance===18?13:first);
        assert.equal(r.result.result,r.guard?'guard':'hit');
        assert.equal(r.result.advantage,advantage);
        assert.equal(r.result.distance,r.physical.distance);
        assert.equal(r.result.contactFrame,r.physical.frame);
      }
      const free=r=>r.jumps.find(j=>j.side===r.jumpSide).frame;
      assert.equal(free(d)-free(a),advantage);
    }
    for(const r of base.combos) {
      assert.equal(r.starts.length,2);
      assert.equal(r.cancel.frame,r.starts[1].frame);
      if(r.follow==='lp') {
        const secondInput=r.physical.frame+1;
        assert.equal(r.finalObservation.inputAt,secondInput);
        assert.equal(secondInput+r.finalObservation.firstActive-1,r.starts[1].frame+6);
      }
      assert.deepEqual(r.contacts.map(c=>c.damage),r.follow==='hp'?[30,90]:r.distance===12?[30,30]:[30]);
      if(r.distance===15 && r.follow==='lp') assert.equal(r.finalResult,'whiff');
    }
    for(const r of base.punishes) {
      const retaliate=r.starts.find(s=>s.side===1);
      const guard=base.rows.find(s=>s.move==='chp' && s.distance===12 && s.guard && s.face===r.face && s.jumpSide===1);
      assert.equal(retaliate.frame,guard.jumps[0].frame);
      assert.equal(r.punishInput,retaliate.frame);
      if(r.punish==='lp') assert.equal(r.contacts.length,0);
      else {
        assert.equal(r.contacts.length,1);
        assert.equal(r.contacts[0].attacker,1);
        assert.equal(r.contacts[0].defenderPreviousState,4);
        assert.ok(r.contacts[0].frame<guard.attackerRecovered);
      }
    }
    for(const r of base.whiffs) {assert.equal(r.result.result,'whiff');assert.equal(r.contacts.length,0);}
    assert.equal(shifted.firstBox,base.rows[0].firstBox+1);
    assert.equal(shifted.contacts[0].frame,base.rows[0].contacts[0].frame+1);
    fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({...base,shifted},null,2)+'\n');
    fs.writeFileSync(path.join(__dirname,'training-chp-18.png'),Buffer.from(await page.evaluate(()=>window.frameCapture),'base64'));
    console.log('28 follow-up action trials, 6 chains, 6 punish trials, 6 whiffs, +1F data override passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

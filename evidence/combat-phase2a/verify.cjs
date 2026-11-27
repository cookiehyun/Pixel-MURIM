// Run against Vite dev. Drive the production RAF callback on an exact virtual
// display clock. Only the private timer and CPU snapshot reads are instrumented.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const phase3a = process.argv[2] === 'after-3a';
const phase = phase3a ? 'after' : process.argv[2];
assert.ok(['before', 'after'].includes(phase));
(async () => {
  const after = phase === 'after';
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/chromium'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const [file, read] of [['cpu', 'sMv[1][viewIdx(1)]'], ['match', 'mTime']]) {
      await page.route('**/src/' + file + '.ts*', async route => {
        const response = await route.fetch();
        await route.fulfill({response, body: await response.text() + '\nwindow.read_' + file + ' = () => ' + read + ';'});
      });
    }
    await page.addInitScript(() => {
      let frame = 0, next;
      performance.now = () => frame * 1000 / 60;
      window.requestAnimationFrame = cb => { next = cb; return 1; };
      window.skipDisplay = () => { frame++; };
      window.advance = (count = 1) => {
        for (let i = 0; i < count; i++) { frame++; next(performance.now() + 1e-8); }
      };
    });
    const report = {};
    for (const mode of ['training','arcade','tag']) {
      await page.goto((process.env.GAME_URL || 'http://127.0.0.1:4190') + '/?sb=http://127.0.0.1:9&sbkey=x');
      await page.waitForFunction(() => window.__pm, null, {polling: 100});
      report[mode] = await page.evaluate(({mode,phase}) => {
        const pm = window.__pm, {G,F,fighter,combat} = pm;
        const key = (type, keyCode) => {
          const event = new KeyboardEvent(type, {keyCode});
          // Synthetic inputs share this harness's virtual RAF time origin.
          Object.defineProperty(event, 'timeStamp', {value: performance.now()});
          window.dispatchEvent(event);
        };
        const tap = code => { key('keydown',code); advance(3); key('keyup',code); advance(3); };
        tap(65);
        for (let i=0; i<{arcade:1,tag:2,training:3}[mode]; i++) tap(40);
        tap(65); tap(65);
        if (mode === 'arcade') {
          tap(65);
          for (let i=0; i<5; i++) { advance(210); pm.arcade.matchOver(true); }
          advance(210);
        } else {
          tap(37); tap(65);
          if (mode === 'tag') { tap(37); tap(37); tap(65); tap(39); tap(65); tap(65); }
          tap(65);
        }
        pm.setDummy(1); advance(300);
        if (G.GameState !== 1 || G.Multi || G.GameMode !== {training:0,arcade:3,tag:4}[mode]) throw Error('menu route');
        const unit = frame => ({frame, ms:+(frame*1000/60).toFixed(3), oldTicks:+(frame/3).toFixed(3)});
        function reset(distance, face, air) {
          fighter.resetRound(); combat.init();
          F[0].x=90; F[1].x=90+face*distance; F[0].facing=face; F[1].facing=-face;
          if (air) Object.assign(F[1],{state:fighter.ST_JUMP,footY:F[0].footY-22,onGround:false,vy:0});
        }
        function strike(move, distance, face, air, offset=1) {
          reset(distance,face,air);
          const [a,d]=F, events={}, presses=[], hits=[];
          const inputEdges=[], startX=d.x;
          let lastAttack=false, starts=0, damage=0, pushAtRecovery;
          let frozenFrames=0;
          const code={lp:65,hk:88,chp:83}[move];
          for(let frame=1;frame<=(air ? 180 : 90);frame++) {
            if(frame===offset) {
              if(move==='chp') key('keydown',40);
              key('keydown',code); key('keyup',code);
            }
            const history=a.histPos, hp=d.health;
            advance();
            if (history!==a.histPos && a.inPress) inputEdges.push({frame, mask:a.inPress});
            if (pm.C.HitStop>0) frozenFrames++;
            if(a.state===fighter.ST_ATTACK && !lastAttack) { starts++; presses.push(frame); }
            lastAttack=a.state===fighter.ST_ATTACK;
            if(lastAttack && a.mv!==pm.moveId('danwoo.'+move)) throw Error('wrong attack');
            if(lastAttack && fighter.inActive(0) && !events.active) events.active=unit(frame);
            if(d.health<hp) {
              events.hit ??= unit(frame); damage+=hp-d.health; hits.push(frame);
            }
            if(presses.length && !lastAttack && !events.attackerReady) events.attackerReady=unit(frame);
            if(events.hit && d.state===fighter.ST_IDLE && !events.defenderReady) {
              events.defenderReady=unit(frame); pushAtRecovery=+(d.x-startX).toFixed(4);
            }
          }
          if(move==='chp') key('keyup',40);
          advance(6);
          return {move,distance,face,air,offset,starts,presses,inputEdges,hits,damage,hitstop:unit(frozenFrames),pushAtRecovery,events};
        }
        const result={};
        for(const stage of mode==='tag'?['beforeTag','afterTag']:['fight']) {
          if(stage==='afterTag') { reset(48,1,false); tap(67); advance(120); }
          if(F[0].prefix!=='danwoo' || F[1].prefix!=='danwoo' || (stage==='afterTag' && pm.tag.tagCount(0)!==1)) throw Error('mirror setup');
          result[stage]=[];
          for(const face of [1,-1]) for(const [move,dist,air] of [
            ['lp',15,false],['lp',16,false],['hk',28,false],['hk',29,false],
            ['chp',18,false],['chp',19,false],['chp',6,true]
          ]) result[stage].push(strike(move,dist,face,air,3));
        }
        if(mode==='training') {
          result.tapOffsets=[1,2].map(offset=>strike('lp',15,1,false,offset));
          result.batchedDisplay=[0,1].map(skipped=>{
            reset(15,1,false);
            const edges=[], a=F[0], hp=F[1].health;
            let polls=0, bits=a.inPress;
            Object.defineProperty(a,'inPress',{configurable:true,get:()=>bits,set:value=>{
              polls++; bits=value;
              if(value) edges.push(polls);
            }});
            // The browser delivers one display callback at 50 ms. Insert the
            // down/up pair halfway through either the first or second interval.
            for(let i=0;i<skipped;i++) skipDisplay();
            const clock=performance.now;
            performance.now=()=>clock()+1000/120;
            key('keydown',65); key('keyup',65);
            performance.now=clock;
            for(let i=skipped;i<2;i++) skipDisplay();
            advance();
            let hit;
            for(let f=4;f<=90;f++) { advance(); if(!hit && F[1].health<hp) hit=f; }
            Object.defineProperty(a,'inPress',{configurable:true,writable:true,value:bits});
            return {eventMs:+((skipped+0.5)*1000/60).toFixed(3),inputPolls:edges,firstHit:unit(hit)};
          });
        }
        reset(66,1,false);
        const x=F[0].x, timer=read_match();
        key('keydown',39); advance(30); key('keyup',39);
        result.walk={time:unit(30),dx:F[0].x-x,timerElapsed:timer-read_match()};
        if(mode==='training') {
          advance(3); reset(66,1,false);
          const ground=F[0].footY;
          advance(2); key('keydown',38); key('keydown',39); advance();
          key('keyup',38); key('keyup',39);
          let apex=ground, landing;
          for(let frame=1;frame<=90;frame++) {
            advance(); apex=Math.min(apex,F[0].footY);
            if(F[0].onGround && !landing) landing=unit(frame);
          }
          result.jump={landing,dx:+(F[0].x-90).toFixed(4),height:+(ground-apex).toFixed(4)};
          result.cpu=[];
          for(const level of [0,1,2]) {
            G.CpuLevel=level; pm.startMatch(11); pm.setDummy(0); advance(90);
            reset(48,1,false);
            // Hold a known, long-lived opponent move in the observation ring.
            Object.assign(F[0],{state:fighter.ST_ATTACK,mv:pm.moveId('danwoo.hk'),stTick:0});
            let seen=0;
            for(let i=1;i<=30;i++) { advance(); if(read_cpu()===F[0].mv && !seen) seen=i; }
            if(!seen) throw Error('CPU never observed move');
            result.cpu.push({level,firstVisible:unit(seen)});
          }
        }
        return result;
      }, {mode,phase});
    }
    assert.deepEqual(errors,[]);
    for (const [mode,stages] of Object.entries(report)) {
      for (const row of [...(stages.fight||[]),...(stages.beforeTag||[]),...(stages.afterTag||[])]) {
        assert.equal(row.starts,1,JSON.stringify(row));
        assert.equal(row.inputEdges.length,1);
        assert.equal(row.hits.length,row.damage ? 1 : 0);
        assert.equal(row.damage,({15:30,28:100,18:80,6:80}[row.distance]||0),JSON.stringify({mode,row}));
      }
    }
    const [a,b]=report.training.tapOffsets;
    for (const row of [a,b]) {
      assert.equal(row.starts,1,JSON.stringify(row)); assert.equal(row.inputEdges.length,1); assert.equal(row.hits.length,1);
      assert.equal(row.inputEdges[0].frame,row.presses[0]);
    }
    for (const stages of Object.values(report)) assert.ok(Math.abs(stages.walk.dx-20)<1e-6);
    assert.equal(report.arcade.walk.timerElapsed,10); assert.equal(report.tag.walk.timerElapsed,10);
    assert.deepEqual(report.training.cpu.map(s=>s.firstVisible.ms),[400,250,150]);
    const batched=report.training.batchedDisplay;
    assert.deepEqual(batched.map(row=>row.inputPolls),after ? [[1],[2]] : [[1],[1]]);
    assert.deepEqual(batched.map(row=>row.firstHit.frame),after ? [7,8] : [9,9]);
    if(after) {
      const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'before.json'),'utf8'));
      for(const mode of Object.keys(report)) {
        for(const stage of (mode==='tag'?['beforeTag','afterTag']:['fight'])) {
          report[mode][stage].forEach((row,i)=>{
            const old=baseline[mode][stage][i];
            // Phase 3A only retunes the airborne uppercut's horizontal push.
            if(phase3a && old.air && old.move==='chp') old.pushAtRecovery /= 4;
            for(const field of ['move','distance','face','air','damage','events','hitstop','pushAtRecovery'])
              assert.deepEqual(row[field],old[field],mode+' '+stage+' '+row.move+' '+field);
          });
        }
      }
      assert.deepEqual(report.training.jump.landing,baseline.training.jump.landing);
      assert.equal(report.training.jump.dx,baseline.training.jump.dx);
    }
    for(const k of ['active','hit']) assert.equal(b.events[k].frame-a.events[k].frame,phase==='after'?1:0);
    assert.equal(b.presses[0]-a.presses[0],phase==='after'?1:0);
    const output=phase3a?'../combat-phase3a/2a-regression.json':phase+'.json';
    fs.writeFileSync(path.join(__dirname, output), JSON.stringify(report,null,2)+'\n');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

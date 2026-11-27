// Give the training dummy a second keyboard in the test page so both sides
// can send independent DOM inputs without enabling multiplayer.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function run() {
  const phase = process.argv[2];
  assert.ok(['before','after'].includes(phase));
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/chromium'});
  try {
    const page = await browser.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/src/game.ts*',async route=>{
      const response=await route.fetch(), body=await response.text();
      const original='Fighter.feedDummy(i, pulse)';
      assert.ok(body.includes(original));
      await route.fulfill({response,body:body.replace(original,'Fighter.feedHuman(i, 2)')});
    });
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await page.goto((process.env.GAME_URL || 'http://127.0.0.1:4190')+'/?sb=http://127.0.0.1:9&sbkey=x');
    await page.waitForFunction(()=>window.__pm,null,{polling:50});
    const rows=await page.evaluate(async()=>{
      const load=name=>import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/'+name+'.ts').name);
      const {gameTick}=await load('game'), {report}=await load('trainingFrames'), K=await load('input');
      const {F,G,fighter,combat,startMatch,MODE_TRAINING}=window.__pm;
      const human={lp:65,hk:88,up:38}, other={lp:85,hk:73,up:79};
      for(const [btn,key] of [[4,other.lp],[7,other.hk],[2,other.up]]) K.setVK(K.keyOf(2,btn),key);
      const key=(code,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{keyCode:code}));
      const rows=[];
      for(const heavy of [null,0,1]) for(const control of [0,1]) for(const face of [1,-1]) {
        Object.assign(G,{HumanIndex:control,GameMode:MODE_TRAINING,P1Char:'danwoo',P2Char:'danwoo',Multi:false});
        startMatch(17); fighter.setDummy(fighter.DUMMY_IDLE);
        F[0].x=90; F[1].x=90+face*12; F[0].facing=face; F[1].facing=-face;
        const jump=[null,null], hits=[], inputs=[];
        let freeze=0, displayed;
        for(let frame=1;frame<=75;frame++) {
          for(const side of [0,1]) {
            const keys=side===control?human:other;
            if(frame===(heavy===null || side===heavy?1:7)) {
              const move=side===heavy?'hk':'lp';
              key(keys[move],true); key(keys[move],false);
              inputs.push({side,move,frame});
            }
            if(frame===(heavy===null?8:14)) key(keys.up,true);
          }
          const hp=F.slice(0,2).map(f=>f.health);
          if(combat.C.HitStop>0) freeze++;
          gameTick();
          for(const side of [0,1]) {
            if(hp[side]>F[side].health) hits.push({side,frame,lost:hp[side]-F[side].health});
            if(F[side].state===fighter.ST_JUMP) jump[side]??=frame;
          }
          if(hp.every((before, side)=>F[side].health<before)) displayed=report().latest.advantage;
        }
        for(const keys of [human,other]) key(keys.up,false);
        gameTick();
        rows.push({heavy,control,face,inputs,hits,freeze,jump,displayed,actual:jump[1-control]-jump[control]});
      }
      return rows;
    });
    assert.deepEqual(errors,[]);
    for(const r of rows) {
      const light=r.heavy===null, contact=light?7:13;
      assert.deepEqual(r.hits,[0,1].map(side=>({side,frame:contact,lost:!light && side!==r.heavy?100:30})));
      if(light) assert.deepEqual(r.jump,[35,35]);
      else if(phase==='after') assert.deepEqual(r.jump,r.heavy===0?[44,59]:[59,44]);
      assert.equal(r.actual,light?0:r.heavy===r.control?15:-15);
      assert.equal(r.freeze,light || (phase==='before' && r.heavy===0)?9:12);
      if(phase==='after') assert.equal(r.displayed,r.actual);
    }
    fs.writeFileSync(path.join(__dirname,phase+'.json'),JSON.stringify(rows,null,2)+'\n');
    console.log(phase,rows.length,'training trades verified');
  } finally {await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});

// node tools/harness/web/combat_boundaries.js before|after <output-directory>
// Baseline needs Vite dev. The patched game also supports a built preview via GAME_URL.
// Freeze requestAnimationFrame so every input and screenshot is tied to a simulation tick.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const [phase, out] = process.argv.slice(2);

async function main() {
  fs.mkdirSync(out, {recursive: true});
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    async function enter(mode) {
      await page.goto((process.env.GAME_URL || "http://127.0.0.1:4173") + "/?sb=http://127.0.0.1:9&sbkey=x");
      await page.waitForFunction(() => window.__pm, null, {polling: 100});
      await page.evaluate(async mode => {
        const pm = window.__pm;
        const fighter = pm.fighter ?? await import("/src/fighter.ts");
        const combat = pm.combat ?? await import("/src/combat.ts");
        const tap = keyCode => {
          for (const type of ["keydown","keyup"]) {
            window.dispatchEvent(new KeyboardEvent(type, {keyCode}));
            pm.tick();
          }
        };
        Object.assign(window, {fighter, combat, tap});
        tap(65);
        const menuRow = {arcade:1,tag:2,training:3}[mode];
        for(let i=0;i<menuRow;i++) tap(40);
        tap(65); tap(65);
        if (mode === "arcade") {
          tap(65);
          const arcade = pm.arcade;
          for(let i=0;i<5;i++) { for(let t=0;t<70;t++) pm.tick(); arcade.matchOver(true); }
          for(let t=0;t<70;t++) pm.tick();
        } else {
          tap(37); tap(65);
          if(mode === "tag") { tap(37); tap(37); tap(65); tap(39); tap(65); tap(65); }
          tap(65);
        }
        if (pm.G.GameMode !== {arcade:3,tag:4,training:0}[mode] || pm.G.Multi) throw Error(mode+" route");
        pm.setDummy(1);
        for (let i=0; i<100; i++) pm.tick();
        tap(112);
        if (pm.G.GameState !== 1 || pm.F[1].prefix !== "danwoo") throw Error("training menu");
        window.probe = (slot, distance, face, options = {}) => {
          const {F,D} = pm, [a,d] = F;
          fighter.resetRound(); combat.init();
          a.x = 90; d.x = a.x + distance * face; a.facing = face; d.facing = -face;
          const mv = a.moves[slot];
          Object.assign(a, {mv, state: fighter.ST_ATTACK, stTick: options.tick ?? D.MvStartup[mv], hasHit: false, struckGroups: [], hitCount: 0, crouch: slot>=4 && slot<=7});
          if(slot === fighter.MV_JP || slot === fighter.MV_JK) {
            a.onGround=false;
            a.footY-=8;
          }
          Object.assign(d, options.defender || {});
          if (options.shot) pm.render();
          const png = options.shot ? document.querySelector("#screen").toDataURL().split(",")[1] : undefined;
          const attacks = fighter.hitRects ? fighter.hitRects(0) : [fighter.hitRect(0)].filter(Boolean);
          const hurts = fighter.hurtRects ? fighter.hurtRects(1) : [fighter.hurtRect(1)].filter(Boolean);
          const hp = d.health;
          combat.resolve();
          return {outcome:a.contact, slot, distance, face, tick:a.stTick, attacks, hurts, damage:hp-d.health, contact:a.hasHit, png};
        };
      }, mode);
    }
    await enter("training");
    const report = [];
    for (const [slot,name] of [[0,"lp"],[3,"hk"]]) {
      const r = await page.evaluate(([s]) => probe(s,22,1,{shot:true}),[slot]);
      fs.writeFileSync(path.join(out,phase+"-"+name+".png"),Buffer.from(r.png,"base64")); delete r.png;
      report.push(r);
    }
    assert.equal(report[0].damage, phase === "before" ? 30 : 0);
    if (phase === "after") {
      const basics = await page.evaluate(() => {
        const rows = [];
        for (const slot of [0,1,2,3,4,5,6,7,8,9,14]) {
          const row = {slot};
          for(const face of [1,-1]) {
            let last = 0;
            for (let dist=1;dist<=40;dist++) if(probe(slot,dist,face).contact) last=dist;
            if (!last || !probe(slot,last,face).damage || probe(slot,last+1,face).damage) throw Error(JSON.stringify({slot,last,face,at:probe(slot,last,face),next:probe(slot,last+1,face)}));
            row[face] = last;
          }
          if(row[1]!==row[-1]) throw Error("mirror "+slot);
          rows.push(row);
        }
        return rows;
      });
      assert.equal(basics[0][1],15);
      assert.equal(basics[3][1],24);
      report.push({basics: basics.map(row => ({
        move:["lp","hp","lk","hk","clp","chp","clk","chk","jp","jk"][row.slot] || "ovh",
        attackerHeight:row.slot===8 || row.slot===9 ? 8 : 0,
        right:{lastHit:row[1],firstMiss:row[1]+1},left:{lastHit:row[-1],firstMiss:row[-1]+1}
      }))});
      const checks = await page.evaluate(() => {
        const pm = window.__pm, {F,D} = pm, [a,d] = F;
        const passed = [];
        function check(name, value) { if (!value) throw Error(name); passed.push(name); }
        for (const face of [1,-1]) {
          const crouched = {state:fighter.ST_CROUCH,crouch:true,stTick:5};
          const guard = {state:fighter.ST_GUARD,stTick:5};
          check("LP high evade "+face, !probe(0,12,face,{defender:crouched}).contact);
          check("HK above crouch "+face, !probe(3,22,face,{defender:crouched}).contact);
          check("mid standing guard "+face,probe(2,12,face,{defender:guard}).outcome==="guard");
          check("mid vs crouch guard "+face,probe(2,12,face,{defender:{...guard,crouch:true}}).damage===40);
          check("low crouch guard "+face,probe(6,12,face,{defender:{...guard,crouch:true}}).outcome==="guard");
          check("low vs standing guard "+face,probe(6,12,face,{defender:guard}).damage===30);
          check("startup empty "+face,probe(0,12,face,{tick:1}).attacks.length===0);
          check("recovery empty "+face,probe(0,12,face,{tick:4}).attacks.length===0);
          const r=probe(0,12,face);
          const parts=r.hurts.filter(h=>fighter.intersection(r.attacks[0],h)).length;
          a.stTick++; combat.resolve();
          check("one hit across parts and ticks "+face, parts>=2 && a.hitCount===1 && d.health===970);
          const testTrade = hp => {
            fighter.resetRound(); combat.init();
            Object.assign(a,{x:90,facing:face});
            Object.assign(d,{x:90+12*face,facing:-face});
            for(const f of [a,d]) Object.assign(f,{health:hp,state:fighter.ST_ATTACK,mv:f.moves[0],stTick:2});
            combat.resolve();
            return [a.health,d.health];
          };
          check("trade "+face, testTrade(1000).every(h=>h===970));
          check("double KO "+face, testTrade(30).every(h=>h===0));
          for(const side of [0,1]) {
            fighter.resetRound(); combat.init();
            const attacker=F[side], target=F[1-side];
            attacker.x=90; target.x=90+face*15; attacker.facing=face; target.facing=-face;
            pm.debugStart(side,0); attacker.stTick=2; combat.resolve();
            check("P"+(side+1)+" last pixel "+face,target.health===970);
          }
          const air=probe(5,6,face,{defender:{state:fighter.ST_JUMP,footY:70,onGround:false}});
          check("uppercut airborne "+face,air.outcome==="air" && air.damage===80);
          probe(0,22,face);
          const armReach = () => Math.max(...fighter.hurtRects(0).map(b=>face>0?b.x+b.w-1-a.x:a.x-b.x));
          const extended=armReach(); a.stTick=4;
          check("arm retracts "+face,armReach()<extended);
          const cell=fighter.worldBox(0,[7,-8,1,1]);
          check("one mirrored cell "+face,cell.x===a.x+face*7 && cell.y===a.footY-8);
          probe(0,22,face); a.x=face>0 ? 171 : 21; d.x=a.x+face*15;
          combat.resolve();
          check("wall "+face,d.health===970);
        }
        const reset=(who,foe="danwoo")=>{
          fighter.init(who,foe,0); combat.init(); pm.projectile.init(); fighter.setDummy(1);
          F[0].x=88; F[1].x=100;
        };
        reset("danwoo","baekmujin"); pm.debugStart(1,12); d.stTick=D.MvStartup[d.mv];
        pm.debugStart(0,0); a.stTick=2; combat.resolve();
        check("counter stance",d.health===d.maxHealth && a.contact==="parried");
        reset("danwoo"); a.bufAtk=fighter.MV_THROW; a.bufAge=4; fighter.update();
        check("grounded throw",d.state===fighter.ST_THROWN);
        reset("danwoo"); d.onGround=false; d.state=fighter.ST_JUMP; d.footY-=20;
        a.bufAtk=fighter.MV_THROW; a.bufAge=4; fighter.update();
        check("air throw excluded",d.state!==fighter.ST_THROWN);
        reset("sd_heuksa"); pm.projectile.spawn(0,pm.moveId("sd_heuksa.sp2")); pm.projectile.update();
        check("projectile vs authored hurtboxes",d.health<d.maxHealth && !pm.projectile.alive(0));
        reset("heukrim"); pm.debugStart(0,11);
        for(let t=0;t<6;t++) pm.tick();
        check("sword kit fallback",a.kit==="heukrimsw" && fighter.hurtRects(0).length===1);
        reset("seolhwa"); pm.debugStart(0,11);
        for(let t=0;t<30;t++) pm.tick();
        check("three rush hits",a.hitCount===3);
        reset("danwoo"); pm.G.StoryFight=true;
        check("story legacy",probe(0,22,1).damage===30);
        pm.G.StoryFight=false;
        pm.lockstep.begin(0,2);
        check("lockstep legacy",probe(0,22,1).damage===30);
        pm.lockstep.finish();
        return passed;
      });
      report.push({checks});
      for (const mode of ["training","arcade","tag"]) {
        if (mode!=="training") await enter(mode);
        for(const stage of mode==="tag"?["before tag","after tag"]:["fight"]) {
          if(stage==="after tag") {
            const count = await page.evaluate(async () => {
              const pm = window.__pm, tag = pm.tag;
              fighter.resetRound(); combat.init(); tap(67);
              if(pm.F[0].onGround || tag.tagCount(0)!==1) throw Error("tag entry");
              const entry = fighter.hurtRects(0);
              for(let t=0;t<40;t++) pm.tick();
              if(!pm.F[0].onGround) throw Error("tag landing");
              return {swaps:tag.tagCount(0),entry};
            });
            report.push(count);
          }
          for (const face of [1,-1]) {
            const last = basics[0][face];
            const results = await page.evaluate(([last,face]) => {
              const pm=window.__pm;
              return [last,last+1,22].map(distance=>{
                fighter.resetRound(); combat.init();
                pm.F[0].x=90; pm.F[1].x=90+face*distance;
                pm.F[0].facing=face; pm.F[1].facing=-face;
                const hp=pm.F[1].health;
                tap(65); for(let t=0;t<4;t++) pm.tick();
                return {distance,damage:hp-pm.F[1].health};
              });
            },[last,face]);
            assert.deepEqual(results.map(r=>r.damage),[30,0,0]);
            report.push({mode,stage,face,results});
          }
        }
      }
      const recordings = [];
      for(const local of [0,1]) {
        await enter("tag");
        recordings.push(await page.evaluate(local => {
          const pm=window.__pm, net=pm.lockstep, hashes=[];
          pm.G.Multi=true; pm.startMatch(137);
          net.begin(local,2);
          const raw=(side,t)=> t<75 ? 0 : t<90 ? (side===0 ? 2 : 1) :
            t%9===side ? 0x110 : 0;
          for(let t=0;t<130;t++) {
            net.captureLocal(raw(local,t));
            net.receive("I "+(t+2)+" 0 "+raw(1-local,t).toString(16));
            pm.tick();
            if(net.frame()!==t+1) throw Error("lockstep stalled");
            hashes.push(pm.fighter.stateHash());
          }
          net.finish();
          return hashes;
        },local));
      }
      assert.deepEqual(recordings[0],recordings[1]);
      report.push({lockstepFrames:recordings[0].length, finalHash:recordings[0].at(-1)});
    }
    fs.writeFileSync(path.join(out,phase+".json"),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
}
main().catch(e => {console.error(e);process.exitCode=1;});

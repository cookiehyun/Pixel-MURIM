// Run against a Vite preview. Capture before on b4b71c2, then after on the revised game.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const [phase, output] = process.argv.slice(2);
  assert.ok(["before", "after"].includes(phase));
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto((process.env.GAME_URL || "http://127.0.0.1:4173") + "/?sb=http://127.0.0.1:9&sbkey=x");
    await page.waitForFunction(() => window.__pm, null, {polling: 100});
    const report = await page.evaluate(phase => {
      const pm = window.__pm, {F, fighter, combat, D} = pm;
      Object.assign(pm.G,{GameMode:pm.MODE_TRAINING,P1Char:"danwoo",P2Char:"danwoo",HumanIndex:0,Multi:false});
      pm.startMatch(); pm.setDummy(1);
      for (let i=0; i<100; i++) pm.tick();
      const key = (type,keyCode) => window.dispatchEvent(new KeyboardEvent(type,{keyCode}));
      key("keydown",112); pm.tick(); key("keyup",112); pm.tick();
      if (!fighter.boxesShown()) throw Error("F1 overlay was not enabled");
      const scenarios = [], images = {};
      function attempt(move, distance, face, air = false, capture = false) {
        const [a,d] = F;
        fighter.resetRound(); combat.init();
        a.x=90; d.x=90+face*distance; a.facing=face; d.facing=-face;
        if (air) Object.assign(d,{state:fighter.ST_JUMP,footY:a.footY-22,onGround:false,vy:0});
        const button = {chp:83,lp:65,hk:88}[move];
        const inputDistance = Math.abs(d.x-a.x);
        if (move === "chp") key("keydown",40);
        key("keydown",button);
        const frames = [];
        const startHP = d.health;
        for (let t=0; t<24; t++) {
          const hp = d.health;
          pm.tick();
          if (t===0) key("keyup",button);
          if (a.state!==fighter.ST_ATTACK || a.mv!==pm.moveId("danwoo."+move)) throw Error("wrong input move: "+move);
          if (a.stTick >= D.MvStartup[a.mv]+D.MvActive[a.mv]) break;
          if (!fighter.inActive(0) || frames.at(-1)?.tick===a.stTick) continue;
          const attackBoxes = fighter.hitRects(0);
          const pose = fighter.currentSprite(0);
          if (phase === "after" && move === "chp") {
            // Every attack region must include painted cells of the active SD fist.
            for (const box of attackBoxes) {
              let covered = 0;
              for (let y=box.y; y<box.y+box.h; y++) for (let x=box.x; x<box.x+box.w; x++) {
                const sx = (x-Math.round(a.x))*face+D.SprAX[pose];
                const sy = y-Math.round(a.footY)+D.SprAY[pose];
                if (sx>=0 && sx<D.SprW[pose] && sy>=0 && sy<D.SprH[pose] &&
                    D.SprPix[D.SprOff[pose]+sy*D.SprW[pose]+sx]>=0) covered++;
              }
              if (covered===0) throw Error("attack outside painted fist");
            }
          }
          frames.push({
            tick:a.stTick, distance:Math.abs(a.x-d.x),
            centerPixels:Math.abs(Math.round(a.x)-Math.round(d.x)),
            sprite:D.SprName[pose], boxes:attackBoxes,
            damage:hp-d.health, result:a.contact, hits:a.hitCount
          });
          if (capture) {
            pm.render();
            images[phase+"-chp-"+distance+"-t"+a.stTick+".png"]=document.querySelector("#screen").toDataURL().split(",")[1];
          }
        }
        if (move==="chp") key("keyup",40);
        pm.tick();
        const damage=frames.reduce((sum,f)=>sum+f.damage,0);
        if (damage!==startHP-d.health) throw Error("damage outside recorded ticks");
        return {move,face,inputDistance,target:air?"air":"standing",frames,damage};
      }
      for (const face of [1,-1]) {
        const at12=attempt("chp",12,face,false,face===1);
        scenarios.push(at12);
        let last=null, miss=null;
        for (let dist=12; dist<=36; dist++) {
          const row=attempt("chp",dist,face,false,phase==="after" && face===1 && dist===19);
          if (row.damage) { last=row; miss=null; }
          else if (last && !miss) miss=row;
        }
        if (phase==="after" && (!last || !miss)) throw Error("grounded boundary missing");
        if (last) scenarios.push({...last,boundary:"last hit"},{...miss,boundary:"first miss"});
        scenarios.push(attempt("chp",6,face,true));
        for (const [move,dist] of [["lp",15],["lp",16],["hk",28],["hk",29]]) scenarios.push(attempt(move,dist,face));
      }
      return {scenarios,images};
    }, phase);
    for (const row of report.scenarios) {
      const expected = row.move==="lp" ? (row.inputDistance===15?30:0) :
        row.move==="hk" ? (row.inputDistance===28?100:0) :
        (row.target==="air" || (phase==="after" && row.boundary!=="first miss") ? 80 : 0);
      assert.equal(row.damage,expected,JSON.stringify(row));
      if (row.boundary) assert.equal(row.inputDistance,row.boundary==="last hit" ? 18 : 19);
      const hit = row.frames.find(f=>f.damage);
      if (row.move==="chp" && hit) {
        assert.equal(hit.tick,row.boundary==="last hit" ? 4 : 3);
        assert.equal(hit.distance,row.inputDistance);
      }
      assert.equal(row.frames.filter(f=>f.damage>0).length,expected ? 1 : 0);
      if (row.move==="chp") assert.deepEqual(row.frames.map(f=>f.tick),[3,4,5]);
    }
    assert.deepEqual(errors,[]);
    for (const [name,png] of Object.entries(report.images)) fs.writeFileSync(path.join(output,name),Buffer.from(png,"base64"));
    fs.writeFileSync(path.join(output,phase+".json"),JSON.stringify(report.scenarios,null,2)+"\n");
    for (const r of report.scenarios) console.log(r.face,r.move,r.target,r.inputDistance,r.frames.filter(f=>f.damage).map(f=>[f.tick,f.distance,f.damage]));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

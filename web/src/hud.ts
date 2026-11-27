import { G, MODE_TRAINING, profiledFight } from "./game";
import * as Training from "./trainingFrames";
// Port of Hud.bas: health bars with damage trail, names, gauges, combo counter, banners, KO.
import { F, METER_MAX, NAEGONG_MAX } from "./fighter";
import * as Tag from "./tag";
import * as Combat from "./combat";
import * as R from "./renderer";
import { SCREEN_W } from "./renderer";
import * as Font from "./font";
import { RGB } from "./util";

const BAR_W = 80, BAR_Y = 2, P1_X = 4, P2_X = 106, TRAIL_SPEED = 6, METER_W = 48, METER_Y = 96, NG_W = 36, NG_Y = 92;
const cBorder = RGB(16, 14, 24), cEmpty = RGB(48, 40, 56), cHp = RGB(244, 200, 72), cHpDark = RGB(200, 140, 40);
const cTrail = RGB(200, 48, 48), cLow = RGB(240, 90, 60), cMeter = RGB(80, 200, 230), cMeterFull = RGB(255, 240, 140);
const cNg = RGB(110, 220, 140), cNgLow = RGB(230, 80, 70), cRed = RGB(110, 30, 40);
let mTick = 0;

export function update(): void {
  mTick++;
  for (let i = 0; i <= 1; i++) {
    const f = F[i];
    if (f.trailDelay > 0) f.trailDelay--;
    else if (f.healthShown > f.health) f.healthShown = Math.max(f.health, f.healthShown - TRAIL_SPEED);
    else if (f.healthShown < f.health) f.healthShown = f.health;
  }
}

export function draw(): void {
  drawBar(0, P1_X, false);
  drawBar(1, P2_X, true);
  Font.drawText((F[0].label || F[0].prefix).toUpperCase(), P1_X + 1, 8, RGB(230, 230, 240));
  Font.drawText((F[1].label || F[1].prefix).toUpperCase(), P2_X + BAR_W + 1, 8, RGB(230, 230, 240), 1, 2);
  if (Tag.active()) { drawReserve(0, P1_X, false); drawReserve(1, P2_X, true); }
  drawMeter(0, P1_X, false);
  drawMeter(1, SCREEN_W - P1_X - METER_W - 2, true);
  drawNaegong(0, P1_X, false);
  drawNaegong(1, SCREEN_W - P1_X - NG_W - 2, true);
  if (Combat.comboCount(0) >= 2) Font.drawText(Combat.comboCount(0) + " HITS", P1_X + 1, 15, RGB(255, 220, 90));
  if (Combat.comboCount(1) >= 2) Font.drawText(Combat.comboCount(1) + " HITS", P2_X + BAR_W + 1, 15, RGB(255, 220, 90), 1, 2);
  const t = Combat.bannerText();
  if (t) {
    const owner = Combat.bannerOwner();
    if (owner === 0) Font.drawText(t, P1_X + 1, 22, RGB(255, 140, 70));
    else if (owner === 1) Font.drawText(t, P2_X + BAR_W + 1, 22, RGB(255, 140, 70), 1, 2);
    else Font.drawText(t, Math.trunc(SCREEN_W / 2), 22, RGB(150, 220, 255), 1, 1);
  }
  if (G.GameMode === MODE_TRAINING && profiledFight()) drawFrameData();
  if (Combat.isKO()) drawKO();
}

function drawFrameData(): void {
  const {latest: row, cancel} = Training.report();
  if (!row) return;
  const white = RGB(248, 244, 222);
  const active = row.firstActive === undefined ? "-" : row.firstActive + "F";
  const contact = row.contactFrame === undefined ? "" : " " + row.contactFrame + "F " + row.distance!.toFixed(1) + "PX";
  Font.drawText(row.move + " ACTIVE " + active + "  " + row.result + contact, 4, 29, white);
  const adv = row.advantage;
  const signed = (n: number) => (n > 0 ? "+" : "") + n + "F";
  if (adv !== undefined) Font.drawText("ADV " + signed(adv), 4, 36, white);
  if (cancel) {
    const normal = cancel.advantage === undefined ? "" : "  ADV " + signed(cancel.advantage);
    Font.drawText(cancel.from + " TO " + cancel.to + " CANCEL " + cancel.frame + "F" + normal, 4, 43, white);
  }
}

const ceilDiv = (a: number, b: number) => Math.trunc((a + b - 1) / b);

function drawBar(i: number, ox: number, fromRight: boolean): void {
  const f = F[i];
  const wHp = ceilDiv(BAR_W * f.health, f.maxHealth), wTrail = ceilDiv(BAR_W * Math.floor(f.healthShown), f.maxHealth);
  const top = f.health * 4 < f.maxHealth ? cLow : cHp;
  R.fillRect(ox, BAR_Y, BAR_W + 2, 4, cBorder);
  R.fillRect(ox + 1, BAR_Y + 1, BAR_W, 2, cEmpty);
  if (Tag.active()) {
    const wRed = ceilDiv(BAR_W * f.redCap, f.maxHealth);
    R.fillRect(fromRight ? ox + 1 + BAR_W - wRed : ox + 1, BAR_Y + 1, wRed, 2, cRed);
  }
  const x = (w: number) => (fromRight ? ox + 1 + BAR_W - w : ox + 1);
  R.fillRect(x(wTrail), BAR_Y + 1, wTrail, 2, cTrail);
  R.fillRect(x(wHp), BAR_Y + 1, wHp, 1, top);
  R.fillRect(x(wHp), BAR_Y + 2, wHp, 1, cHpDark);
}

function drawMeter(i: number, ox: number, fromRight: boolean): void {
  const w = Math.trunc((METER_W * F[i].meter) / METER_MAX), full = F[i].meter >= METER_MAX;
  R.fillRect(ox, METER_Y, METER_W + 2, 3, cBorder);
  R.fillRect(ox + 1, METER_Y + 1, METER_W, 1, cEmpty);
  const c = full && Math.trunc(mTick / 3) % 2 === 0 ? cMeterFull : cMeter;
  if (fromRight) {
    R.fillRect(ox + 1 + METER_W - w, METER_Y + 1, w, 1, c);
    if (full) Font.drawText("MAX", ox - 2, METER_Y - 2, cMeterFull, 1, 2);
  } else {
    R.fillRect(ox + 1, METER_Y + 1, w, 1, c);
    if (full) Font.drawText("MAX", ox + METER_W + 5, METER_Y - 2, cMeterFull);
  }
}

function drawReserve(side: number, ox: number, fromRight: boolean): void {
  const RW = 40, mx = Tag.reserveMax(side);
  const w = ceilDiv(RW * Tag.reserveHealth(side), mx), wr = ceilDiv(RW * Tag.reserveRed(side), mx);
  const c = Tag.reserveHealth(side) <= 0 ? RGB(90, 80, 100) : RGB(140, 130, 160);
  const nm = (F[2 + side].label || Tag.reservePrefix(side)).toUpperCase();
  if (fromRight) {
    R.fillRect(ox + 1 + BAR_W - RW - 1, BAR_Y + 4, RW + 2, 2, cBorder);
    R.fillRect(ox + 1 + BAR_W - wr, BAR_Y + 4, wr, 1, cRed);
    R.fillRect(ox + 1 + BAR_W - w, BAR_Y + 4, w, 1, cHpDark);
    Font.drawText(nm, ox + BAR_W - 44, 15, c, 1, 2);
  } else {
    R.fillRect(ox, BAR_Y + 4, RW + 2, 2, cBorder);
    R.fillRect(ox + 1, BAR_Y + 4, wr, 1, cRed);
    R.fillRect(ox + 1, BAR_Y + 4, w, 1, cHpDark);
    Font.drawText(nm, ox + 46, 15, c);
  }
}

function drawNaegong(i: number, ox: number, fromRight: boolean): void {
  const w = Math.trunc((NG_W * F[i].naegong) / NAEGONG_MAX);
  R.fillRect(ox, NG_Y, NG_W + 2, 3, cBorder);
  R.fillRect(ox + 1, NG_Y + 1, NG_W, 1, F[i].ngFlash > 0 && Math.trunc(mTick / 2) % 2 === 0 ? cNgLow : cEmpty);
  R.fillRect(fromRight ? ox + 1 + NG_W - w : ox + 1, NG_Y + 1, w, 1, cNg);
}

function drawKO(): void {
  const rows = ["10010 01110", "10100 10001", "11000 10001", "10100 10001", "10010 01110"];
  const ox = Math.trunc(SCREEN_W / 2) - 11, oy = 14;
  for (const pass of [0, 1])
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 11; x++)
        if (rows[y][x] === "1") {
          if (pass === 0) R.fillRect(ox + x * 2 - 1, oy + y * 2 - 1, 4, 4, cBorder);
          else R.fillRect(ox + x * 2, oy + y * 2, 2, 2, cLow);
        }
}

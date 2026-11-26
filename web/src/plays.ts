// Field chapters (walk, quests, field fights): per route id and chapter index, the list of steps that
// Field runs. Chapters without an entry play as plain cut scenes. Lines quoted with "ev" come from the
// script (docs/story/*.md, chapter sections pre / post); "say" adds a field-only line.
// Design notes per chapter: docs/story/play/.
import { WELL_CUT } from "./prologueEpilogue";
import type { Step } from "./field";
import { SCROLL_BURN_END } from "./scrollBurn";
import { SECOND_RISE_END } from "./prologueBattle";
import { ALTAR_DEATH_LINE, SCAR_SEEP_END } from "./altarDuel";
import type { BattleCut } from "./prologueBattle";

function warCut(kind: BattleCut, x = 60): Step {
  return { t: "prop", id: "war", kind, x };
}
function narration(text: string): Step {
  return { t: "say", who: "해설", text };
}
const 단우업음: [string, number, string] = ["sd_danwoo:carry", 0, "DANWOO"];
const 단우: [string, number, string] = ["sd_danwoo", 0, "DANWOO"];
const 아롱: [string, number, string] = ["sd_arong", 0, "ARONG"];
const 흑사: [string, number, string] = ["sd_heuksa", 0, "HEUKSA"];
const 교도SD: [string, number, string] = ["sd_cultist", 0, "CULTIST"];
const 흑림SD: [string, number, string] = ["sd_heukrim", 0, "HEUKRIM"];

export const PLAYS: Record<string, Record<number, Step[]>> = {
  prologue: {
    // 서장 「혈월의 밤」 (docs/story_new/00_prologue.md): a short cut scene, narration only, no lines between people.
    0: [
      // SCENE 01. 혈월의 밤 - a red moon rises out of the dark
      { t: "map", map: "blood_battlefield" },
      { t: "moon" },
      { t: "wait", n: 38 },
      narration("백 년 전, 중원의 하늘에 붉은 달이 떠올랐다."),
      { t: "map", map: "blood_battlefield", blackTicks: 20 },
      { t: "cam", x: 60 },
      warCut("warClash"),
      { t: "wait", n: 12 },
      narration("그리고 그날 밤, 혈교가 모습을 드러냈다."),
      { t: "map", map: "hyeolma_face" },
      { t: "cam", x: 0 },
      { t: "wait", n: 24 },
      narration("그들의 교주, 혈마."),
      { t: "map", map: "blood_battlefield" },
      { t: "cam", x: 96 },
      warCut("warSummon", 96),
      { t: "wait", n: 52 },
      warCut("warRise", 96),
      { t: "wait", n: 12 },
      narration("혈마의 손짓에 죽은 자들이 일어섰다.\n그들은 더 이상 인간이 아니었다."),
      { t: "wait", n: 110, sinceProp: "war" },
      narration("후세는 그날을 혈월의 밤이라 불렀다."),
      { t: "map", map: "blood_battlefield" },
      { t: "cam", x: 60 },
      warCut("warRout"),
      { t: "wait", n: 100 }, // Last defender falls on tick 80; hold the field for one second.
      warCut("warSecondRise"),
      { t: "wait", n: SECOND_RISE_END },
      warCut("warMarch"),
      { t: "wait", n: 6, sinceProp: "war" },
      narration("혈월의 밤, 중원은 피와 공포로 뒤덮였다."),
      // SCENE 02. 정마연합과 혈마의 최후
      { t: "map", map: "scroll_map", fadeTicks: 32, blackTicks: 3 },
      { t: "cam", x: 0 },
      { t: "wait", n: 32 }, // twelve-tick fade-in, then one full second of undisturbed map
      { t: "prop", id: "paper", kind: "mapBurn", x: 0 },
      { t: "wait", n: 66 },
      narration("중원의 수많은 문파가 무너졌고,"),
      { t: "wait", n: SCROLL_BURN_END, sinceProp: "paper" },
      { t: "wait", n: 18 },
      narration("무림맹과 마교는 혈교를 막기 위해 손을 잡았다."),
      // Historical alliance. The duel clock runs independently of dialogue and input.
      { t: "map", map: "blood_altar" },
      { t: "cam", x: 0 },
      { t: "prop", id: "altar", kind: "altarStandoff", x: 0 },
      { t: "wait", n: 16 },
      narration("그리고 정마연합은 혈교의 본단까지 진격했다."),
      { t: "prop", id: "altar", kind: "altarDuel", x: 0 },
      { t: "wait", n: ALTAR_DEATH_LINE, sinceProp: "altar", skipFrom: 0 },
      narration("마침내 천마와 무림맹주는 힘을 합쳐 혈마를 무찔렀다."),
      { t: "map", map: "hyeolma_hand", fadeTicks: 24, blackTicks: 6 },
      { t: "cam", x: 0 },
      { t: "wait", n: 23 },
      narration("그렇게 사람들은 혈월의 밤이 끝났다고 생각했다."),
      { t: "prop", id: "scar", kind: "scarSeep", x: 0 },
      { t: "wait", n: SCAR_SEEP_END, sinceProp: "scar" },
      // SCENE 04. 흘러간 백 년
      { t: "map", map: "two_flags", fadeTicks: 26, blackTicks: 8 },
      { t: "cam", x: 0 },
      { t: "wait", n: 30 },
      narration("전쟁이 끝나자 정과 마는 다시 각자의 길을 걸었고,"),
      { t: "map", map: "postwar_ruins" },
      { t: "cam", x: 0 },
      { t: "wait", n: 50 },
      { t: "swap", map: "postwar_rebuild", dissolveTicks: 52 },
      { t: "prop", id: "crew", kind: "timberCrew", x: 0 },
      { t: "wait", n: 98 },
      narration("혈월의 밤도 하나의 전설이 되어 서서히 잊혀 갔다."),
      // SCENE 05. 다시 움직이는 것 - Luoyang, the market by the monument, evening into night
      { t: "swap", map: "luoyang_market", dissolveTicks: 56 },
      { t: "wait", n: 56 },
      { t: "unprop", id: "crew" },
      { t: "caption", text: "백 년 후, 낙양." },
      { t: "spawn", id: "k1", look: ["sd_child", 0, ""], x: 60, face: 1 },
      { t: "spawn", id: "k2", look: ["sd_arong", 0, ""], x: 46, face: 1 },
      { t: "spawn", id: "v1", look: ["sd_villager", 0, ""], x: 190, face: -1 },
      { t: "spawn", id: "dog", look: ["sd_dog", 0, ""], x: 107, face: -1, pose: "sleep" },
      { t: "move", id: "k1", x: 170, speed: 1.2 }, { t: "move", id: "k2", x: 160, speed: 1.2 },
      { t: "wait", n: 60 },
      { t: "move", id: "v1", x: 330, speed: 0.8 }, { t: "move", id: "k1", x: 340, speed: 1.4 }, { t: "move", id: "k2", x: 330, speed: 1.4 },
      { t: "prop", id: "night", kind: "night", x: 0, y: 0 },
      { t: "wait", n: 140 },
      // the dog by the well lifts its head, turns to the well, growls
      { t: "pose", id: "dog", pose: "look_up" },
      { t: "wait", n: 30 },
      { t: "pose", id: "dog", pose: "stand" },
      { t: "wait", n: 20 },
      { t: "pose", id: "dog", pose: "growl" },
      { t: "wait", n: 40 },
      // into the well: nothing falls, the bucket hangs clear, yet the water rings - twice
      { t: "map", map: "well_down" },
      { t: "cam", x: 0 },
      { t: "prop", id: "rip", kind: "ripple", x: 96, y: 76 },
      { t: "wait", n: WELL_CUT, sinceProp: "rip" },
      { t: "prop", id: "dark", kind: "black", x: 0, y: 0 },
      { t: "wait", n: 40 },
      { t: "title", text: "서장\n「혈월의 밤」 끝" },
      { t: "end" },
    ],
  },

  danwoo: {
    // 1장 「잿더미」 청풍촌, the grey dawn after the blood moon (SD)
    0: [
      { t: "map", map: "cheongpung_dawn" },
      { t: "caption", text: "청풍촌 · 혈월 다음 날 새벽" },
      { t: "spawn", id: "chief", look: ["sd_chief", 0, ""], x: 36, face: 1 },
      { t: "spawn", id: "corpse", look: ["sd_cultist", 0, ""], x: 60, face: 1, pose: "lie" },
      { t: "spawn", id: "player", look: 단우, x: 166, face: 1, pose: "sit" },
      { t: "spawn", id: "arong", look: 아롱, x: 150, face: 1 },
      { t: "cam", follow: "player" },
      { t: "wait", n: 50 },
      { t: "narr", text: "아롱이 단우 곁에 붙어 서서 떨어지지 않는다." },
      { t: "pose", id: "player", pose: "idle" },
      { t: "follow", id: "arong", target: "player", gap: 14 },
      { t: "quest", text: "마을을 살펴보시오", goal: "inspect", id: "chief" },
      { t: "face", id: "player", to: "chief" },
      { t: "narr", text: "촌장이 검은 옷 사내의 소매를 죽을 힘을 다해 붙든 채 숨져 있다." },
      { t: "narr", text: "사내의 손목 안쪽에 붉은 매화 낙인. 맥이 없고, 몸이 쇠처럼 차다." },
      { t: "clue", text: "단서 획득: ① 촌장이 붙든 사내의 손목에 붉은 매화 낙인. 마교의 표식은 검은 불꽃이다." },
      { t: "ev", sec: "pre", a: 2 },
      // the old man in black walks in from the village entrance with three cultists
      { t: "spawn", id: "heuksa", look: 흑사, x: 330, face: -1 },
      { t: "spawn", id: "c1", look: 교도SD, x: 356, face: -1 },
      { t: "spawn", id: "c2", look: 교도SD, x: 382, face: -1 },
      { t: "spawn", id: "c3", look: 교도SD, x: 408, face: -1 },
      { t: "follow", id: "arong", target: "" },
      { t: "face", id: "player", to: "right" },
      { t: "cam", follow: "heuksa" },
      // the elder in front, his three men a step apart behind him, all at one pace
      { t: "move", id: "heuksa", x: 186, speed: 1 },
      { t: "move", id: "c1", x: 212, speed: 1 }, { t: "move", id: "c2", x: 238, speed: 1 }, { t: "move", id: "c3", x: 264, speed: 1, wait: true },
      { t: "cam", follow: "player" },
      { t: "ev", sec: "pre", a: 4, b: 8 },
      { t: "ev", sec: "pre", a: 9 },
      { t: "move", id: "arong", x: 12, run: true, wait: true },
      { t: "face", id: "arong", to: "right" },
      { t: "pose", id: "arong", pose: "cower" },
      { t: "pose", id: "heuksa", pose: "nod" },
      { t: "say", who: "흑사", text: "쳐라.", dir: "턱짓한다" },
      { t: "pose", id: "heuksa", pose: "idle" },
      { t: "move", id: "heuksa", x: 288 },
      { t: "move", id: "player", x: 120, wait: true },
      // the three cultists come at him together (one in front, one round the back)
      { t: "duel", foes: ["c1", "c2", "c3"], hp: 240, dmg: 50, text: "교도 셋을 쓰러뜨리시오" },   // arcade scale: Danwoo has 1000
      { t: "wait", n: 30 },
      { t: "face", id: "heuksa", to: "player" },
      { t: "pose", id: "heuksa", pose: "clap" },
      { t: "say", who: "흑사", text: "제법이군.", dir: "손뼉을 친다" },
      { t: "pose", id: "heuksa", pose: "idle" },
      { t: "say", who: "흑사", text: "이리 오시오, 소교주.\n내가 직접 모시지." },
      { t: "quest", text: "흑사에게 가시오", goal: "talk", id: "heuksa" },
      // the elder himself, on the spot, in the fight engine (the arcade's moves, timing and effects; SD art, this village behind)
      { t: "move", id: "heuksa", x: "player", dx: 40, speed: 1, wait: true },
      { t: "fight", foe: "heuksa" },
      { t: "face", id: "heuksa", to: "player" },
      { t: "pose", id: "heuksa", pose: "down" },                 // beaten: down on one knee
      { t: "ev", sec: "post", a: 0, b: 3 },
      { t: "vanish", id: "heuksa" },
      { t: "narr", text: "흑사가 연막을 터뜨리고 사라진다." },
      { t: "pose", id: "arong", pose: "idle" },
      { t: "move", id: "arong", x: "player", dx: 9, run: true, wait: true },
      { t: "face", id: "player", to: "left" },
      { t: "face", id: "arong", to: "left" },
      { t: "pose", id: "arong", pose: "grab" },                  // right behind him, holding the back of his sleeve
      { t: "narr", text: "단우가 서쪽 하늘을 오래 본다. 아롱이 다시 옷자락을 쥔다." },
      { t: "ev", sec: "post", a: 6 },
      { t: "pose", id: "arong", pose: "idle" },
      { t: "follow", id: "arong", target: "player", gap: 14 },
      { t: "quest", text: "서쪽 길로 나가시오", goal: "reach", x: 10, dir: -1 },
      { t: "end" },
    ],
  },
};

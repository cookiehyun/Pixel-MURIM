// Field chapters (walk, quests, field fights): per route id and chapter index, the list of steps that
// Field runs. Chapters without an entry play as plain cut scenes. Lines quoted with "ev" come from the
// script (docs/story/*.md, chapter sections pre / post); "say" adds a field-only line.
// Design notes per chapter: docs/story/play/.
import type { Step } from "./field";
import { SKIN_PALE, SKIN_CULT } from "./renderer";

const 교도: [string, number, string] = ["muyeong", SKIN_CULT, "CULTIST"];

export const PLAYS: Record<string, Record<number, Step[]>> = {
  danwoo: {
    // 1장 「잿더미」 청풍촌, the morning after
    0: [
      { t: "map", map: "cheongpung" },
      { t: "spawn", id: "player", look: "단우", x: 108, face: 1, pose: "crouch" },
      { t: "spawn", id: "arong", look: ["npc", 0, "ARONG"], x: 122, face: -1 },
      { t: "spawn", id: "chief", look: ["danwoo", SKIN_PALE, ""], x: 440, face: -1, pose: "down" },
      { t: "spawn", id: "corpse", look: 교도, x: 458, face: 1, pose: "down" },
      { t: "cam", follow: "player" },
      { t: "wait", n: 20 },
      { t: "ev", sec: "pre", a: 0 },
      { t: "pose", id: "player", pose: "idle" },
      { t: "follow", id: "arong", target: "player", gap: 16 },
      { t: "quest", text: "마을을 살펴보시오", goal: "inspect", id: "chief" },
      { t: "pose", id: "player", pose: "crouch" },
      { t: "ev", sec: "pre", a: 1 },
      { t: "clue", text: "단서 획득: ① 촌장이 붙든 사내의 손목에 붉은 매화 낙인. 마교의 표식은 검은 불꽃이다." },
      { t: "ev", sec: "pre", a: 2 },
      { t: "pose", id: "player", pose: "idle" },
      // the old man in black walks in from the village entrance with three cultists
      { t: "spawn", id: "heuksa", look: "흑사", x: 760, face: -1 },
      { t: "spawn", id: "c1", look: 교도, x: 784, face: -1, hp: 150 },
      { t: "spawn", id: "c2", look: 교도, x: 800, face: -1, hp: 150 },
      { t: "spawn", id: "c3", look: 교도, x: 816, face: -1, hp: 150 },
      { t: "face", id: "player", to: "right" },
      { t: "cam", follow: "heuksa" },
      { t: "move", id: "c1", x: 592 }, { t: "move", id: "c2", x: 610 }, { t: "move", id: "c3", x: 628 },
      { t: "move", id: "heuksa", x: 560, wait: true },
      { t: "ev", sec: "pre", a: 3 },
      { t: "cam", follow: "player" },
      { t: "ev", sec: "pre", a: 4, b: 8 },
      { t: "ev", sec: "pre", a: 9 },
      { t: "move", id: "arong", x: 400, run: true },
      { t: "say", who: "흑사", text: "쳐라.", dir: "턱짓한다" },
      { t: "move", id: "heuksa", x: 650 },
      { t: "hostile", ids: ["c1", "c2", "c3"] },
      { t: "quest", text: "교도 셋을 쓰러뜨리시오", goal: "kill", ids: ["c1", "c2", "c3"] },
      { t: "face", id: "heuksa", to: "player" },
      { t: "say", who: "흑사", text: "제법이군.", dir: "손뼉을 친다" },
      { t: "say", who: "흑사", text: "이리 오시오, 소교주.\n내가 직접 모시지." },
      { t: "quest", text: "흑사에게 가시오", goal: "talk", id: "heuksa" },
      { t: "fight" },
      { t: "pose", id: "heuksa", pose: "crouch" },
      { t: "ev", sec: "post", a: 0, b: 3 },
      { t: "vanish", id: "heuksa" },
      { t: "ev", sec: "post", a: 4 },
      { t: "move", id: "arong", x: "player", dx: -16, run: true, wait: true },
      { t: "face", id: "player", to: "left" },
      { t: "ev", sec: "post", a: 5, b: 6 },
      { t: "follow", id: "arong", target: "player", gap: 16 },
      { t: "quest", text: "서쪽 길로 나가시오", goal: "reach", x: 26, dir: -1 },
      { t: "end" },
    ],
  },
};

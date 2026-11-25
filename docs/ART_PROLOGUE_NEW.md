# 새 서장 「백 년의 밤」 그림 주문서

대본: `docs/story_new/00_prologue.md`. 대화 없이 해설과 화면으로 흐르는 짧은 컷신이다.
만드는 법은 지금 서장과 같다: **GPT가 배경 그림을 그리고, 게임이 그 위에 SD 인물을 올리고 움직인다.**
달·불티·물결·핏방울·지도 위 표식처럼 움직이는 것은 게임이 그린다(그림에는 넣지 않는다).

## 배경 받는 법

- 화풍 기준 첨부: 넓은 배경은 `web/data/maps/cheongpung_fire.png`, 클로즈업은 `web/data/maps/hairpin_closeup.png`.
- **넓은 배경 (3:1, 900×300 정도)**: 공통 문장
  ```
  Pixel art game background in the same style as the attached image. Very wide (3:1), strict flat side view for a side-scrolling game, no perspective, no people, no text. Ground line near the bottom (the bottom 15% is the floor people stand on).
  ```
- **클로즈업 (16:9)**: 공통 문장
  ```
  Pixel art close-up illustration in the same style as the attached image, 16:9, no people unless described, no text.
  ```

## 장면 → 그림

| 컷 | 화면 | 배경 | 인물 (SD) | 게임이 그리는 것 |
|---|---|---|---|---|
| 1 | 검은 화면에 붉은 달 | 없음 | | 붉은 달이 떠오름 (지금 서장의 달 연출) |
| 2 | 붉은 달 아래 전장, 혈마 등장 | **B1 혈월 전장** | 혈마, 교도, 무인 | 붉은 기운 |
| 2 | 혈마 얼굴 | **C1 혈마 얼굴** | | |
| 3 | 쓰러진 무인이 혈강시로 일어남 | B1 | 혈강시, 무인 | 붉은 기운, 색 바뀜 |
| 4 | 불타는 산문·쓰러지는 무인·찢긴 깃발 | 지금 그림 재사용: 남궁세가(namgung_fire), 청풍촌(cheongpung_fire) | | 빠르게 넘김 |
| 4~5 | 두루마리 지도, 불길이 번지고 두 깃발이 모임 | **C2 두루마리 지도** | | 불길·붉은 표식·깃발 |
| 5~7 | 혈교 본단 제단, 맹주·천마 대 혈마, 혈마 쓰러짐, 기둥 붕괴 | **B2 혈교 제단** | 혈마, 당시 맹주(백무진 그림), 당시 천마(천마 그림) | 섬광, 흔들림, 돌 부스러기 |
| 8 | 돌 틈의 오른손, 피 한 방울이 거슬러 흉터로 | **C3 혈마의 손** | | 핏방울 |
| 10 | 두 깃발이 갈라짐 | **C4 두 깃발** | | 천천히 이동 |
| 11 | 같은 자리에 백 년이 흐름 | **B3 → B4 → B5** (같은 구도 3장) | | 넘어가는 효과, 조명 |
| 12 | 저녁 장터 → 밤 | B5 | 아이들, 장사꾼 | 밤 색조 |
| 13 | 우물가의 개가 고개를 듦 | B5 | **개** | |
| 14 | 우물 안 물결 | **C5 우물 속** | | 둥근 물결 두 번 |
| 15 | 암전, 제목 「혈월」 | | | |

## 배경 프롬프트 (공통 문장 뒤에 붙임)

**B1 혈월 전장** (넓은 배경)
```
An ancient Chinese battlefield at night under a huge blood-red moon: a wide trampled plain, broken spears and swords stuck in the ground, torn banners of several different martial sects on fallen poles, a low rocky hill on the right side, burning fires far away, dark mountains behind, red sky.
```
**B2 혈교 제단** (넓은 배경)
```
The underground altar hall of a blood cult: a wide stone hall with tall dark-red stone pillars, a raised black stone altar on a dais in the middle with steps, carved grooves in the stone floor running from the altar like channels (empty, no liquid), red braziers burning, very dark, blood-red light.
```
**B3 옛 전장 (전쟁 직후)** (넓은 배경)
```
The same flat battlefield plain at dawn just after a war: ruined walls and broken stone, scorched earth, a few fallen banner poles, grey morning sky, no fire, quiet. A stone well on the left of center.
```
**B4 옛 전장 (몇십 년 뒤)** (넓은 배경, B3을 첨부하고 "same layout")
```
Same layout as the attached image, decades later: the ruins are gone, grass and young trees, two or three new wooden houses being built, the same stone well, a simple stone monument starting to stand in the middle, soft daylight.
```
**B5 낙양 장터와 전승비** (넓은 배경, B4를 첨부하고 "same layout")
```
Same layout as the attached image, a hundred years later: a busy Luoyang market street in the evening, tiled-roof shops with lanterns, wooden market stalls, a tall stone victory monument in the middle (blank, no letters), the same stone well with a wooden bucket on a rope, warm orange evening light, normal pale moon.
```
**C1 혈마 얼굴** (클로즈업, 첨부: 화풍 + 혈마 기준 그림 `docs/art/sd/src/206.webp`)
```
Close-up portrait of the man in the second image (the Blood Demon), from the chest up, facing right: pale thin face, sharp cheekbones, thin red eyes, faint smile, long straight black hair, dark crimson robe with black collar. Behind him a huge blood-red moon and dark red sky, red mist rising from his raised open right hand.
```
**C2 두루마리 지도** (클로즈업)
```
An old Chinese landscape map painted on a long unrolled paper scroll lying flat: mountains, rivers, forests, small walled towns and temples drawn in ink and faded colors, wooden scroll rods at both ends, aged yellow paper. No fire, no marks, no text.
```
**C3 혈마의 손** (클로즈업)
```
Close-up at ground level in a collapsed dark stone hall: between broken stone blocks lies a pale motionless right hand, palm down, with an old scar on the second knuckle of the index finger. A narrow carved groove in the stone floor runs toward the hand; dark blood lies in the groove, stopped. Dust in the air, dim red light.
```
**C4 두 깃발** (클로즈업)
```
Dawn on a hill road that splits into two paths: on the left path a white banner with a pale gold border on a tall pole, on the right path a black banner with a purple flame emblem on a tall pole, both leaning away from each other in the wind. Grey-pink dawn sky, mist in the valley.
```
**C5 우물 속** (클로즈업)
```
Looking straight down into an old stone well at night: round stone wall, a wooden bucket hanging on a rope above the water without touching it, dark still water in the center reflecting a pale normal moon.
```

## 인물

- **혈마**: 기준 그림 `src/206.webp`. 최종 보스이므로 다른 주인공과 같은 **대전용 동작 시트 7장**을 뽑는다. 서장 장면(손 내밀기, 흡수, 무릎 꿇기, 쓰러짐)은 그 동작으로 쓴다.
- **당시 맹주**: 백무진 그림(`src/205.webp`)을 그대로 쓴다. 백무진도 종장 보스라 대전용 시트 7장. 서장에서 검을 쓰므로 **검 든 4프레임 1장**을 따로 뽑는다(서기, 베기, 검을 붙잡힘, 뒤로 밀려남).
- **당시 천마**: 지금 천마 SD를 그대로 쓴다(대전 그림이 이미 있음).
- **교도·혈강시·무인·아이·장사꾼**: 지금 있는 스토리용 SD를 쓴다.
- **개**: 새로 4프레임 1장(엎드려 졸기, 고개 들기, 우물 쪽으로 몸 돌리기, 낮게 으르렁거리기).

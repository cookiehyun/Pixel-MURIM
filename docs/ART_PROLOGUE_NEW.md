# 새 서장 「백 년의 밤」 그림 주문서 (ChatGPT용)

각본: `docs/story_new/00_prologue.md` (축약판, 컷 1~15, 대화 없음).
비율: **2.9등신 SD** (기준 `docs/art/sd/src/134.webp` 단우, 키 40).
색 규칙: 빨강은 혈마, 당시 맹주는 흰색·강철청색, 당시 천마는 검정·짙은 보라. 이펙트는 SD 그림에 넣지 않습니다(코드로 붙임).

받은 그림은 `docs/art/sd/src/205.webp`부터 번호를 이어서 넣어 주세요.

| 받는 것 | 크기 | 게임에 넣는 도구 |
|---|---|---|
| 인물 설정 그림 (SD 4프레임, 배경 #FF00FF) | 2000×667 | `sd_split.py` → `pixelize.py` → `sd_add.py` |
| 배경 (옆모습, 사람 없음) | 2000×667 (3:1) | `bg_add.py` |
| 전체 화면 컷 (지도, 우물 안) | 1672×941 (16:9) | `bg_add.py` |

---

## 1. 인물 설정 그림 (3장)

첨부: `134.webp` 한 장. 아래 **공통 문장 + 인물 블록**을 이어 붙여 보냅니다. 인물마다 **새 대화창**.

### 공통 문장
```
Pixel art character model sheet in exactly the same style, pixel size and proportions as the attached chibi character (about 2.9 heads tall, thick dark outline, flat colors with 2-3 tones).
4 frames side by side in one wide image (3:1), all the same size, standing on the same ground line, evenly spaced, not overlapping.
Frames 1-3: strict side view facing right, full body. Frame 4: front view, full body.
Same head size and same clothes in every frame; only the pose changes.
Plain flat background color #FF00FF. No text, no numbers, no shadow on the ground, no effects, no glow.
The attached image is only the style and size reference. Do not draw that character. Draw this character instead:
```

### 1-1. 혈마 (키 41)
```
Character: the Blood Demon, master of a blood cult a hundred years ago. A man about 40, very slightly taller than the reference. Tall, thin, straight-backed.
Face: very pale grey-white gaunt face, hollow cheeks, thin dark eyebrows, calm cold narrow eyes with dark red irises, thin unsmiling mouth. Villain, not cute.
Hair: long straight black hair hanging loose past the shoulders. No topknot, no crown.
Clothes: long blood-red outer robe (#7A1020, shadows #4A0A14) reaching the ankles, black inner robe and black collar, wide black sash, long wide sleeves, black cloth shoes. A small red plum blossom emblem on the chest.
Mark: on his RIGHT hand, an old pale scar across the second knuckle, drawn as a clear light line. No weapon, no jewelry.
Frames: 1. standing idle, arms relaxed, hands half hidden in the sleeves 2. walking slowly 3. right hand stretched forward at chest height, palm open, fingers slightly spread, the scarred knuckle visible 4. front view, standing, hands at the sides.
```

### 1-2. 당시 무림맹주 (키 41)
```
Character: the Martial Alliance leader of a hundred years ago, a righteous swordsman around 50, same height as the reference. Broad shoulders, upright.
Face: square face, short black beard and moustache with a little grey, thick eyebrows, firm serious eyes.
Hair: black topknot held by a plain silver-grey hair crown.
Clothes: white long robe with steel-blue (#3A5A8A) collar and trim, a dark steel-blue sleeveless vest over it, simple worn dark leather shoulder guards, dark blue sash, grey trousers, black boots. Battle-worn, not luxurious, no gold.
Weapon: a straight double-edged jian sword with a plain silver guard, in the right hand.
Frames: 1. standing idle, sword held point-down at his side 2. walking, sword at the side 3. thrusting the sword forward hard, body leaning in 4. front view, standing, both hands resting on the sword pommel, point on the ground.
```

### 1-3. 당시 천마 (키 42)
```
Character: the Heavenly Demon, master of the demonic sect a hundred years ago, a powerful man around 50, a little taller and broader than the reference.
Face: sharp hard face, short black beard, an old scar across the left eyebrow, fierce eyes.
Hair: long black hair with grey streaks tied high at the back. No crown.
Clothes: heavy black long robe with a dark violet (#4A2A6A) inner layer and trim, silver-grey edging, a short black fur mantle over the shoulders, a violet black-flame emblem on the chest, black sash, black boots. No red.
Weapon: a broad single-edged dao saber, in the right hand.
Frames: 1. standing idle, saber held low 2. walking, saber low 3. a strong downward slash, the saber coming down 4. front view, standing, saber tip touching the ground.
```

### 이상할 때 (같은 창에서)
```
Keep exactly the same pixel size and head size as the attached reference (about 2.9 heads). Strict side view facing right in frames 1-3.
```
```
The background must be one flat color #FF00FF, nothing else.
```

---

## 2. 배경

첨부: `docs/art/sd/village_ref.webp` + `docs/art/sd/src/50.webp`(붉은 달 밤 화풍). 아래 공통 문장 뒤에 장면 문장을 붙입니다.

### 공통 문장
```
Pixel art game background in the same style as the attached images. Very wide 3:1 (like 2000x667), strict flat side view for a side-scrolling game, no perspective, no people, no animals, no text, no letters. The bottom 15% is flat ground where characters stand, running the full width.
```

### 2-1. 한 자리의 백 년 (L1~L6, **한 대화창에서 순서대로**)

전장(컷 2~3) → 백 년의 흐름(컷 11) → 현재 낙양 장터(컷 12~13)가 **같은 자리**입니다. 구도를 고정해 두면 그림을 바꾸는 것만으로 세월이 흐릅니다.

구도 (왼쪽 → 오른쪽, 가로 비율):
- 0~20%: 낮은 언덕
- 35~45%: **중심 자리** (전장에서는 갈라진 큰 바위 → 나중에 전승비)
- 62~72%: **우물 자리** (전장에서는 돌로 둘러싼 작은 샘 → 나중에 우물), 땅 위 앞쪽
- 80~100%: 오른쪽으로 빠지는 길, 먼 뒤편에 산과 성벽

**L1 혈월의 전장** (컷 2~3)
```
Layout, left to right: a low hill on the far left (0-20% of the width); a huge split boulder standing on the ground at 35-45%; a small old spring ringed with stones on the ground at 62-72%; a road leaving to the right at 80-100%, far mountains and a distant city wall in the background.
Scene: a battlefield at night under a huge blood-red moon (upper right). Scorched trampled ground, broken spears and swords stuck in the ground, torn sect banners of several colors (no letters) on broken poles, drifting smoke, a burning sect gate far away on the horizon, red haze. Keep the middle of the ground open for fighting figures.
```
**L2 전쟁 뒤** — 같은 창에서
```
Same place, exactly the same layout, horizon, hill, boulder and spring positions. Only change what is described: the morning after the war, grey overcast light, no moon. Burnt ground, rubble and broken weapons gathered into small piles, the banners gone, thin smoke.
```
**L3 풀과 나무**
```
Same place, exactly the same layout. Many years later, spring daylight: green grass covers the field, young trees on the hill, wild flowers. The split boulder is gone and a square stone base sits in its place. The spring is still ringed with stones.
```
**L4 집과 전승비**
```
Same place, exactly the same layout. Decades later, warm autumn daylight: a few tiled-roof houses stand in the background, a tall weathered stone war monument stands on the stone base (carved surface, no readable letters), a stone well with a wooden frame and a hanging bucket stands where the spring was, a dirt road.
```
**L5 낙양 장터, 저녁** (컷 11 끝, 컷 12)
```
Same place, exactly the same layout. Now a busy market street of the big city of Luoyang at dusk: rows of tiled-roof shops behind, wooden market stalls with cloth awnings and goods in front of them, paper lanterns lit, orange-purple dusk sky, an ordinary pale moon rising. The monument and the well stay exactly where they were, nothing blocks them.
```
**L6 장터, 밤** (컷 12 끝 ~ 13)
```
Same picture, exactly the same layout. Late night: the stalls are closed and covered with cloth, the lanterns are out except one, dark blue night, an ordinary pale white moon, empty quiet street.
```

### 2-2. 불타는 산문 (컷 4 몽타주, 새 창)
```
Scene: the mountain gate of a martial sect burning at night under a blood-red moon: a big gate building with a curved tiled roof on a stone platform with steps, stone walls on both sides, flames and black smoke, torn sect banners (no letters) falling, broken weapons on the stone yard in front.
```

### 2-3. 혈교 제단 (컷 5~8, 새 창에서 2장)
```
Scene: a vast underground altar hall of a blood cult carved in dark stone: a raised round stone altar in the exact center with three steps, thick stone pillars with hanging blood-red cloth on both sides, braziers with red fire, thin channels carved into the floor in rings around the altar glowing faintly dark red. Oppressive, ancient. Keep the floor on both sides of the altar open for figures.
```
같은 창에서:
```
Same place, exactly the same layout. Now collapsed: broken pillars, a fallen stone beam across the floor, piles of rubble and dust, the braziers knocked over and dark, the floor channels dark and dry, a little dim red light from above.
```

### 2-4. 갈라지는 길 (컷 10, 새 창)
```
Scene: a high mountain pass at dawn, dim grey-pink light. The ground in front is a flat rocky path across the whole width. Behind it, the land splits: on the left a road winds down into misty green plains with distant tiled roofs, on the right a road climbs toward dark jagged peaks with black cliffs. Two bent pines in the middle where the roads part.
```

---

## 3. 전체 화면 컷 (16:9)

첨부: `village_ref.webp`.

### 공통 문장
```
A single pixel art cutscene illustration for a wuxia story, in the same pixel style and palette feel as the attached image (crisp pixels, limited palette, dark outlines). 16:9 (like 1672x941), detailed (not chibi), no text, no letters, no watermark.
```

**M 두루마리 지도** (컷 4~5)
```
Top-down view of an old Chinese scroll map of the central plains painted on yellowed silk, rolled wooden ends on the left and right. Mountain ranges drawn in ink, winding rivers, small walled cities as tiny symbols, a dark mountain fortress in the west. No labels, no fire, no flags, no markers (they will be added in the game).
```

**W 우물 안** (컷 14)
```
Looking straight down into an old round stone well at night: mossy stone ring, a wooden bucket hanging on a rope just above the dark water, the reflection of an ordinary pale moon on the surface. Calm still water.
```
(물결은 코드로 번지게 합니다.)

---

## 나중에 (인물 설정 그림이 정해진 뒤)

- 컷 2 혈마 얼굴 클로즈업
- 컷 6 몽타주 3장: 검을 붙잡는 혈마의 손, 혈마의 팔을 치는 천마의 도, 합공
- 컷 8 무너진 돌 틈의 오른손과 되돌아가는 피 한 방울
- SD 동작: 혈교 교도와 무인(기존 그림 재사용), 혈강시로 일어나는 무인, 장터 아이들과 장사꾼, 개

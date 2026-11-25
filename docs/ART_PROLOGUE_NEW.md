# 새 서장 「백 년의 밤」 그림 주문서 (ChatGPT용)

각본: `docs/story_new/00_prologue.md` (컷 1~29). 옛 서장(청풍촌·소림·초막…)은 각 개인 편 1장으로 옮겨졌으므로 `ART_PROLOGUE.md`는 그쪽에서 계속 씁니다.
이 서장은 **조작 없는 컷신**입니다. 배경 위에서 SD 인물이 짧게 움직이는 장면 + 가까이 보여 주는 정지 컷 그림으로 만듭니다.

- 받는 순서: **① 새 인물 기준 그림(모델 시트) → ② 배경 → ③ SD 자세 → ④ 정지 컷**. 인물은 기준 그림이 먼저 정해져야 자세 그림의 얼굴·옷이 흔들리지 않습니다.
- 받은 그림은 지금처럼 `docs/art/sd/src/` 다음 번호(205부터)로 넣어 주시면 됩니다.
- 색 규칙: **빨강은 혈마 몫**, 천마신교는 보라·검정·은회색(지금 천마와 같은 계열).
- 이펙트(붉은 기운, 검광 등)는 SD 그림에 넣지 않습니다. 코드로 붙입니다. 정지 컷 그림에만 넣습니다.

---

## 0. 공통 문장

### SD 인물용 (매번 맨 앞, 첨부: `docs/art/sd/src/134.webp` 단우 기준 그림)
```
Pixel art sprite sheet in exactly the same style, pixel size and proportions as the attached chibi character (about 2.9 heads tall, thick dark outline, flat colors with 2-3 tones).
Draw the frames side by side in one wide image, all the same size, standing on the same ground line, evenly spaced, not overlapping.
Strict side view facing right, full body. Same head size and same clothes in every frame; only the pose changes.
Plain flat background color #FF00FF. No text, no numbers, no shadow on the ground, no effects.
The attached image is only the style and size reference. Do not draw that character. Draw this character instead:
```

### 새 인물 기준 그림(모델 시트)용 — 공통 문장 뒤에
```
Model sheet, 4 frames: 1. standing idle 2. walking 3. a typical action pose 4. standing, seen from the front.
```

### 배경용 (첨부: 구도 없이 `docs/art/sd/village_ref.webp` 한 장)
```
Pixel art game background in the same style as the attached image. Very wide (2:1), strict flat side view for a side-scrolling game, no perspective, no people, no text. Ground line near the bottom (the bottom 15% is the floor people stand on).
```

### 정지 컷 그림용 (첨부: `village_ref.webp`)
```
A single pixel art cutscene illustration for a wuxia story, in the same pixel style and palette feel as the attached image (crisp pixels, limited palette, dark outlines). 16:9, cinematic framing, no text, no letters, no watermark.
```

### 이상할 때 (같은 대화창에서)
```
Keep exactly the same pixel size and head size as the attached reference. Strict side view, facing right.
```
```
The background must be one flat color #FF00FF, nothing else.
```

---

## 1. 새 인물 기준 그림 (키는 HEIGHTS.md 기준 픽셀)

| 번호 | 이름 | 키 | 공통 문장 뒤에 붙일 인물 설명 |
|---|---|---|---|
| M1 | **혈마** (백 년 전 혈교 교주) | 41 | `Character: the Blood Demon, cult master of a blood cult 100 years ago, about 40, tall and thin, very pale white gaunt face, calm cold eyes, long straight black hair hanging loose to the back, deep blood-red robe with black inner layers and a black sash, long sleeves, a small red plum blossom mark on the collar. An old scar across the second knuckle of his right hand (draw it clearly as a pale line on the hand). Empty hands.` |
| M2 | **초대 무림맹주** | 41 | `Character: the first leader of the Martial Alliance, a righteous swordsman about 45, black topknot with a plain iron hair crown, short black beard, firm tired face, dusty white robe with steel-blue trim over light armor on the shoulders, blue sash, straight jian sword. Battle-worn, not luxurious.` |
| M3 | **당시 천마** (백 년 전 천마신교 교주) | 41 | `Character: the Heavenly Demon of 100 years ago, demonic sect master about 45, broad shoulders, sharp scarred face with a short black beard, long black hair tied high, heavy dark violet robe with black and silver-grey trim, a black flame emblem on the chest, black boots, a broad single-edged dao saber. Proud and wary.` |
| M4 | **정파 무인** (여러 명, 색만 바꿔 씀) | 39 | `Character: a righteous sect fighter in a war, young man, plain cloth topknot band, grey-blue martial robe with a torn sleeve, leg wraps, a spear.` |
| M5 | **문파 대표** (사당 장면) | 39 | `Character: an old sect elder, about 65, grey topknot, long grey beard, dark brown formal robe, holding a broken sword in both hands.` |
| M6 | **마교 무사** | 39 | `Character: a demonic sect soldier, black and dark violet clothes, black head cloth, a small black flame emblem on the chest, a broad saber.` |
| M7 | **장사꾼** (현재 낙양) | 38 | `Character: a market vendor, plump middle-aged man, cloth headband, beige jacket with rolled sleeves, apron.` |
| M8 | **장터 아이들** | 26 | `Characters: two small village children about 8, one boy with a tiny topknot in a brown jacket, one girl with braided hair in a faded pink jacket. Draw both in each frame pair.` |
| M9 | **개** | 14 | `Character: a skinny yellow village dog, short fur, pointed ears, curled tail. Animal, four legs, side view.` |

이미 기준 그림이 있는 인물(SD만 필요): 혈강시 `docs/art/cast/gangsi.png`, 혈교 교도 `cultist.png`, 피난민 `villager.png`.
이들은 SD 인물 공통 문장 대신 아래 문장을 쓰고 **134.webp + 해당 cast 그림** 두 장을 첨부합니다.
```
Use the first image for the chibi style and size. The second image shows this character's design (colors, hair, clothes): draw that character in the chibi style.
```

---

## 2. 배경 (10곳)

| 번호 | 장소 (컷) | 배경 공통 문장 뒤에 |
|---|---|---|
| B1 | 성문 안, 혈월 (컷 1~3, 11) | `Inside the gate of a walled Chinese town at night under a huge blood-red moon. A tall wooden city gate on the left, half broken, propped with broken spears. Stone street, a hand cart, torn banners of several different sects (different colors, no letters) hanging from poles, smoke, red sky.` ※ 하늘·성벽(뒤)과 길(앞, 하늘은 #FF00FF) **두 장** |
| B2 | 언덕 위 전장 (컷 4, 8) | `A battlefield on a low hill at night under a blood-red moon: trampled grass, dust clouds, broken spears and fallen banners stuck in the ground, a rocky rise on the right where someone could stand above the battle. Red haze.` |
| B3 | 피난 다리 (컷 5) | `A narrow old wooden bridge over a dark river at night, the blood-red moon reflected in the water below, dark reeds, distant burning town glow on the horizon.` |
| B4 | 불 꺼진 사당 (컷 6, 8) | `Inside a dark old ancestral shrine at night: a long wooden table in the middle, a cold unlit altar with burnt-out candles behind, faded wooden pillars, a single shaft of moonlight from a side door. Empty, quiet, mournful.` |
| B5 | 산길 평지 (컷 9, 10) | `A small flat clearing on a mountain path at dawn-like dim red light: rocky cliffs on both sides, a few bent pines, mist below, two empty flag poles standing far apart (flags will be added separately).` |
| B6 | 혈교 본단 제단 (컷 12~15) | `A vast underground altar hall of a blood cult carved in dark stone: thick stone pillars with red cloth, a raised round stone altar in the center, thin channels carved in the floor in a ring pattern that faintly glow dark red, braziers with red fire. Oppressive, ancient.` |
| B6b | 무너진 제단 (컷 16~18) | B6와 같은 장문 + `Now collapsed: broken pillars, a fallen stone beam across the floor, piles of rubble, thick dust in the air, the floor channels dark and dry.` (**B6과 같은 대화창에서**, 구도 유지) |
| B7 | 옛 전장의 세월 (컷 22~23) | `A wide open plain that was an old battlefield, with a gentle hill. Version A: ruined, burnt ground with rubble and a half-built stone monument. ` → 같은 창에서 `Same place, same layout. Version B: golden grain fields, the stone monument finished.` → `Version C: a busy market street of stalls and tiled-roof shops has grown around the same monument.` (**세 장, 같은 구도**) |
| B8 | 현재 낙양 장터, 저녁 (컷 24) | `A market street in the big city of Luoyang at dusk, ordinary pale moon rising: rows of stalls closing, lanterns, tiled-roof shops, and in the middle a tall old stone war monument with a weathered carved surface (no readable letters).` |
| B9 | 우물 골목, 밤 (컷 25) | `A quiet back alley of Luoyang at night, ordinary pale moonlight: an old stone well with a wooden frame and a hanging bucket on a rope on the right side, clay walls, a closed wooden door, a sleeping corner by the wall.` |

---

## 3. SD 자세 (한 장에 4프레임)

| 장 | 인물 | 컷 | 4프레임 (`Frames:` 뒤에 영어로) |
|---|---|---|---|
| P1 | 정파 무인 | 2·3 | `1. pushing a broken spear against a gate with both hands 2. standing guard with a spear 3. looking back over the shoulder, shouting 4. running` |
| P2 | 정파 무인 (전령) | 2 | `1. running in, out of breath 2. stopping, bent over panting 3. lying fallen on the ground 4. standing, wounded arm hanging` |
| P3 | 혈교 교도 | 3 | `1. lying face down 2. getting up slowly with a sword stuck in his chest 3. standing with the sword still in his chest, blank eyes 4. walking stiffly forward` |
| P4 | 혈강시 | 11 | `stiff walking with arms stretched forward, frames 1 to 4` |
| P5 | 피난민 | 2·5 | `1. pulling a hand cart 2. pulling a hand cart, step 2 3. walking with an old man leaning on him 4. carrying a child on the back, walking` |
| P6 | 혈마 | 4·12 | `1. standing still, hands behind the back 2. stretching one hand forward, palm open 3. looking down, chin slightly raised 4. walking slowly` |
| P7 | 혈마 | 13·15 | `1. gripping an enemy's sword blade with the right hand 2. turning sharply to the other side 3. falling to one knee, wounded 4. lying on his side on the ground, still` |
| P8 | 초대 맹주 | 7·8 | `1. lifting a long flag pole upright with both hands 2. standing, sword at the side, looking down at the table 3. turning his head, giving an order 4. walking` |
| P9 | 초대 맹주 | 9~14 | `1. standing armed, facing forward 2. lowering the sword tip 3. thrusting the sword forward hard 4. kneeling, holding his arm` |
| P10 | 당시 천마 | 9~14 | `1. standing armed with the saber, wary 2. touching the saber tip to the ground 3. a downward slash at a wrist 4. a forward thrust` |
| P11 | 맹주·천마 공용 | 10·16 | `1. the alliance leader turning around to walk away 2. the demonic sect master turning around to walk away 3. the alliance leader helping a wounded man walk, arm over his shoulder 4. the demonic sect master helping a wounded man walk` |
| P12 | 문파 대표 | 6 | `1. standing, placing a broken sword on a table 2. standing, head bowed 3. speaking with one hand raised 4. walking` |
| P13 | 마교 무사 | 11 | `1. standing guard with a saber 2. slashing 3. running 4. running, step 2` |
| P14 | 장사꾼 | 24 | `1. folding a stall cloth 2. handing coins over with one hand 3. waving someone away, "come back tomorrow" 4. walking with a bundle on the back` |
| P15 | 장터 아이들 | 24 | `1. two children running, step 1 2. running, step 2 3. chasing each other around 4. standing, laughing` |
| P16 | 개 | 25 | `1. lying asleep curled up 2. lifting the head, ears up 3. standing, turning toward the right, low and tense 4. standing, growling low, head down` |

---

## 4. 정지 컷 그림 (SD 아님, 9장)

| 번호 | 컷 | 정지 컷 공통 문장 뒤에 |
|---|---|---|
| C1 | 컷 1 | `Pitch black night sky, and in the center a huge blood-red moon slowly appearing behind thin dark clouds. Silhouette of a city wall at the very bottom.` |
| C2 | 컷 4 | `Close-up of the Blood Demon on a hill above a battle at night: very pale gaunt face, cold calm eyes, long loose black hair, blood-red robe, his right hand stretched toward the viewer with a thin red mist flowing into his wrist; an old pale scar on the second knuckle of the right hand. Dust and red moonlight behind him.` (M1 기준 그림 함께 첨부) |
| C3 | 컷 7 | `A long plain white cloth banner laid on a wooden table, a big ink brush held above it by a strong hand, several stone seals and an ink stone beside it, candlelight. The cloth is blank: no letters.` ※ 武林盟 글자는 제가 픽셀로 써 넣습니다 |
| C4 | 컷 13 | `Close-up: a pale right hand with a scar on the second knuckle gripping the blade of a straight sword; the sword holder's arm trembles as faint blue energy is being pulled out of it along the blade into the pale hand. Dark red light.` |
| C5 | 컷 14 | `Wide dramatic shot in an underground altar: two warriors strike from opposite sides at the same moment - a white-robed swordsman thrusting a straight sword from the left and a violet-robed demonic master driving a broad saber from the right - both blades piercing a tall pale man in a blood-red robe in the center. Silhouettes against red light, dust.` |
| C6 | 컷 17 | `Silent close-up in darkness: a pale right hand with an old scar on the second knuckle lying limp between fallen stones and rubble, a dark pool of blood on the stone floor beside it, a carved channel in the floor. Very dark, dust settling.` |
| C7 | 컷 18 | C6와 **같은 대화창, 같은 구도** + `Same picture, but now a single thin thread of blood flows backward up the slope of the channel into the fingertips, and one drop of blood is sinking into the skin next to the scar.` |
| C8 | 컷 20 | `Top-down view of a council table after a war: a map with boundary lines drawn in ink, a rope binding a prisoner's wrists with two hands pulling it in opposite directions, a list of names on paper with one name being crossed out by a brush.` |
| C9 | 컷 26·27 | `Looking straight down into an old stone well at night: a wooden bucket hanging on a rope just above the dark water, ordinary pale moonlight on the surface. Calm water.` → 같은 창에서 `Same picture, but now a single round ripple spreads from the center of the water surface, and the rope is slightly trembling.` (**두 장**) |

컷 19(암전)·컷 28(소리)·컷 29(제목 혈월)은 그림 없이 코드로 처리합니다.
깃발 두 장(무림맹·검은 불꽃)은 작게 들어가므로 제가 픽셀로 그립니다.

---

## 추천 순서

1. **M1 혈마 → M2 초대 맹주 → M3 당시 천마** 기준 그림 (서장의 얼굴 셋)
2. B1 성문(두 장) + P1·P5 → 1절을 먼저 돌려 보고 크기·화풍 확인
3. 나머지 배경 → SD 자세 → 정지 컷

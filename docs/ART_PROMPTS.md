# 캐릭터 외형 설정 + AI 그림 프롬프트

AI 그림 도구(Midjourney, ChatGPT 이미지, Leonardo 등)에 넣기 좋게 정리했습니다.
각 캐릭터마다 **① 한글 요약 → ② 영어 프롬프트(복사용)** 순서입니다.
지금 게임 속 모습은 `docs/preview/current_characters.png` (왼쪽부터 기본 자세, 공격, 기술, 승리).

## 사용 팁

1. **공통 스타일 문장을 모든 프롬프트 뒤에 붙이세요.** 그래야 캐릭터끼리 그림체가 맞습니다.
2. 한 캐릭터가 마음에 들게 나오면, 그 그림을 **참고 이미지(image reference / character reference)** 로 넣고 다른 자세를 뽑으세요. 같은 얼굴·옷이 유지됩니다.
3. 게임 스프라이트용은 "full body, side view, facing right, plain background" 가 중요합니다. 배경이 단색이어야 오려 쓰기 쉽습니다.
4. 지금 게임 그림의 **옷 색(HEX)** 을 같이 적어 두었습니다. 색을 맞추면 게임과 이어집니다.
5. AI 그림은 픽셀이 지저분하게 나오는 경우가 많습니다. 쓸 그림은 Aseprite 등에서 한 번 정리(축소 + 색 줄이기 + 테두리 다듬기)해야 합니다.

## 공통 스타일 (모든 프롬프트 끝에 붙이기)

```
detailed pixel art, 16-bit era fighting game style, crisp clean pixels, limited palette with hue-shifted shading (cool purple shadows, warm highlights), selective dark outlines, strong readable silhouette, wuxia martial arts fantasy setting inspired by Ming dynasty China and Joseon Korea, no text, no watermark
```

게임 스프라이트(캐릭터 한 명)용 추가 문장:

```
full body, side view, facing right, fighting stance, character sprite sheet style, plain flat background #4A5064
```

피해야 할 것(negative prompt 칸이 있으면):

```
blurry, anti-aliased smooth gradients, 3d render, photorealistic, anime screenshot, modern clothing, armor plates of western knights, text, logo, watermark, extra limbs, cropped feet
```

---

## 주인공 7명 (게임에 이미 있는 캐릭터)

### 1. 단우 (위단우) · 22세 · 남
- **외형:** 젊고 마른 체격. 검은 머리를 정수리에 틀어 올린 상투, 이마에 **붉은 머리띠**(끈이 뒤로 길게 휘날림). 웃음기 있는 얼굴.
- **옷:** **파란 무명 무복**(소매가 넉넉한 짧은 도포), 흰 깃·소매 끝단, 검은 허리띠, 짙은 회색 바지, 갈색 가죽 신. 떠돌이라 옷이 조금 해졌다.
- **무공/연출:** 청풍장 — **맑은 하늘색 바람 손바닥(장풍)**. 손에서 파란 바람 손바닥이 뻗어 나간다. 맨손.
- **분위기:** 가볍고 장난스러워 보이지만 눈빛은 단단하다. 마교 교주의 동생이라는 비밀.
- **게임 색:** 옷 파랑 `#2F6FB5` / 그림자 `#1F4A80`, 머리띠 `#C23B3B`, 바지 `#3B3F4F`, 신 `#4A3324`

```
young male wuxia martial artist, age 22, lean build, black hair tied in a topknot, long red headband with tails fluttering behind, cheerful confident face, faded blue cotton martial arts robe with white collar and cuffs, black cloth belt, dark grey trousers, brown leather boots, bare-handed palm strike releasing a glowing sky-blue wind palm, wanderer who chops firewood for meals
```

### 2. 철산 · 34세 · 남
- **외형:** **바위 같은 거구**의 소림 무승. 빡빡 깎은 머리, 굵은 눈썹, 두꺼운 목과 팔. 말이 없고 묵직한 표정.
- **옷:** **주황색 승복**(한쪽 어깨를 드러낸 가사 느낌), 짙은 붉은 허리띠, 목에 **나무 염주**, 정강이를 감은 **회색 행전**, 투박한 신.
- **무공/연출:** 잡기·메치기 전문(살생계 때문에 때려서 죽이지 않음). 금강파쇄(붙잡아 메치기), 철산고(어깨로 돌진). 궁극기 **금강분노** — 붉은 불꽃 오라와 빨간 눈의 광폭화.
- **분위기:** 무섭게 생겼지만 아이들이 좋아한다.
- **게임 색:** 승복 `#C4652A` / `#8D4420`, 허리띠 `#7A1F1F`, 염주 `#5A3A1E`, 행전 `#9A8F7C`

```
huge muscular shaolin warrior monk, age 34, shaved head, thick eyebrows, stern calm face, orange monk robe with one shoulder bare, dark red sash, wooden prayer beads around the neck, grey cloth leg wraps, heavy straw-and-leather shoes, grappling stance with open hands ready to grab, gentle giant who never kills
```

광폭화(금강분노) 버전 추가:
```
berserk rage mode, flushed red skin, glowing red eyes, crackling red and orange flame aura around the body, steam rising from the head
```

### 3. 무영 · 24세 · 남
- **외형:** 마르고 키 큰 검객. 긴 검은 머리를 뒤로 하나로 묶음(흰 끈). **감정 없는 차가운 얼굴**, 날카로운 눈.
- **옷:** **회청색(슬레이트) 무복**, 흰 허리띠·흰 깃, 짙은 바지, 갈색 신. 장식 없는 차림.
- **무기:** 곧은 **한손 장검**, 금빛 코등이, 붉은 수술.
- **무공/연출:** 무영검(쾌검·검기). 궁극기 **무영참공** — 한 번에 상대를 지나치고, 상대 주위 공간이 **유리처럼 갈라져(검은 틈) 깨진다**.
- **분위기:** 그림자 없는 검. 복수만 남은 사람.
- **게임 색:** 옷 `#4C5668` / `#343B4A`, 흰 띠 `#E6E4DA`, 칼날 `#DCE4EC`, 코등이 `#C9A040`, 수술 `#C23434`

```
tall lean wuxia swordsman, age 24, long black hair tied back with a white cord, expressionless cold face, sharp eyes, plain slate grey-blue martial robe with white sash and collar, dark trousers, brown boots, straight single-edged jian sword with gold guard and red tassel, quick-draw iaido-like stance, lonely avenger
```

### 4. 설화 · 19세 · 여
- **외형:** 작고 날렵한 체구. 검은 머리를 높이 묶고 **분홍 리본**. 표정이 크고 급한 성격이 드러나는 얼굴.
- **옷:** 아미파 속가 제자 — **흰 무복**(옅은 하늘빛 그림자), **파란 허리띠**, 밝은 회색 바지, 남색 신. 겨울 설산 느낌.
- **무공/연출:** 발차기 전문(연환비각, 선풍각, 설산비각). 궁극기 **낙화유수** — 하얀 분신이 뒤에서 함께 차고, 마지막에 **분홍 꽃잎**이 흩날린다.
- **분위기:** 밝고 씩씩, 동생(소연)을 잃고 다급하다.
- **게임 색:** 옷 `#EEF2F6` / `#BAC8D8`, 허리띠 `#4A8AC8`, 리본 `#E86A8A`, 신 `#2E4A78`

```
petite agile young female martial artist, age 19, Emei sect disciple, black hair in a high ponytail with a pink ribbon, lively determined face, white martial arts robe with pale icy blue shading, blue sash, light grey trousers, navy cloth shoes, high flying kick pose, pink plum petals swirling around her legs, snowy mountain sect
```

### 5. 흑림 · 29세 · 남
- **외형:** 살막 출신 암살자. **백발**(긴 머리를 한쪽으로 늘어뜨림), 마른 얼굴, 비꼬는 듯한 눈.
- **옷:** **짙은 보라·검정 야행복**, **자주색 허리띠**, 검은 바지, 검은 신. **허리춤에 칼집**(평소엔 맨손, 칼을 뽑으면 발도술).
- **무공/연출:** 귀영보(검은 연기와 함께 순간이동, 보랏빛 잔상), 녹색 독기 섞인 베기 궤적. 궁극기 천마강림.
- **분위기:** 돈 이야기만 하는 냉소적인 사람이지만 맡은 일은 끝까지 한다.
- **게임 색:** 옷 `#34283E` / `#201828`, 머리 `#F2F2F4`, 허리띠 `#8A2AA8`, 칼날 `#DCE4EC`, 독기 `#64C060`

```
cynical assassin, age 29, long white hair falling to one side, thin sharp face, smirk, dark purple-black night-stalker outfit, purple sash, black trousers and boots, short sword sheathed at the hip ready for a quick draw, purple shadow afterimages, faint green poison trail on the blade, mercenary killer
```

### 6. 홍련 (남궁련) · 22세 · 여
- **외형:** 기루 '홍엽관'의 무희. 검은 머리를 틀어 올리고 **꽃 장식·비녀**. 나긋한 미소, 단호한 눈.
- **옷:** **붉은 무희복**(넓은 소매), 금색 깃과 장식, 짙은 자줏빛 치마/바지.
- **무기:** **부채 두 자루**(붉은 바탕, 금 테두리). 던지면 돌아오는 부채.
- **무공/연출:** 부채춤처럼 싸움. 연화선, 궁극기 **홍련업화**(땅에서 솟는 불기둥, 붉은 연꽃).
- **분위기:** 남궁세가 가주의 서녀. 우아하지만 화가 나면 더 무섭다.
- **게임 색:** 옷 `#B8283A` / `#7E1828`, 금 `#E8B84A`, 하의 `#4A1A28`, 부채 `#E04050`

```
elegant female courtesan dancer warrior, age 22, black hair in an ornate updo with flower ornaments and a hairpin, graceful smile with steely eyes, flowing crimson dancer robe with wide sleeves, gold trim, dark wine-colored skirt, wielding two red folding war fans with gold edges, dance-like fighting pose, burning red lotus and fire pillar effects
```

### 7. 천마 (위천강) · 25세 · 남
- **외형:** 천마신교 교주. 차갑고 위엄 있는 얼굴, 웃지 않음. 긴 검은 머리, **금빛 관(작은 왕관)**.
- **옷:** **검붉은 교주 도포**(길고 무거운 옷자락), 금색 장식, 검은 허리띠, 검은 바지·신.
- **무공/연출:** 마공장(붉은 악마 손바닥), 흡성대법(붉은 구슬 기운을 빨아들임), 천마군림(붉은 폭발). 체력이 낮아지면 **붉은 기운이 몸을 감쌈(천마심공)**. 상징은 **검은 불꽃**.
- **분위기:** 단우의 형. 모두에게 원수 취급받지만 교를 고치려는 개혁가.
- **게임 색:** 도포 `#8E1820` / `#5A0E16`, 금 `#E8B848`, 허리띠 `#1A1418`, 눈빛 `#FF4030`

```
young demonic cult leader, age 25, cold majestic face, never smiling, long black hair with a small golden crown, long heavy dark crimson imperial robe with gold ornaments, black belt, black boots, open palm releasing a red demonic palm print, black flame motif, dark red aura, emperor of the Heavenly Demon Cult
```

---

## 조연·적 (아직 게임 그림 없음, 스토리 모드용)

### 백무진 (혈마) · 50대 · 남 — 최종 보스
- 무림맹주. **온화한 웃는 얼굴**, 단정한 흰 수염, **흰색·옅은 금색 맹주 도포**. 늘 백단향 연기. 정체는 혈교 후계자 — 본색을 드러내면 **붉은 매화 문양과 핏빛 기운**.
```
gentle smiling middle-aged martial alliance leader, age 55, neat white beard, immaculate white and pale gold robes, sandalwood incense smoke drifting around him, hidden villain; second version revealing blood cult power with red plum blossom motifs and blood-red aura
```

### 귀영호법 야차 · 40세 · 남
- 그림자 같은 **왼손잡이 검객**. 마른 몸, 흉터, 비웃는 입꼬리. **검은 도포**에 검은 불꽃 문양.
```
shadowy left-handed demonic cult swordsman, age 40, gaunt scarred face, mocking grin, black robes with black flame emblem, sword held in the left hand, smoky shadow effects
```

### 혈검호법 적운 · 60세 · 남
- **백발 노검객**, 길게 묶은 흰 머리와 흰 수염, 붉은 검집. 느긋하지만 날카로운 눈. 짙은 붉은 도포.
```
old master swordsman, age 60, long white hair and beard, calm sharp eyes, dark red robe, sword in a red scabbard, dignified and relaxed stance
```

### 철갑호법 금강귀 · 45세 · 남
- **쇠 갑옷을 입은 거한**. 투구는 없고 짧은 머리, 순박한 얼굴. 동양식 비늘 갑옷.
```
giant armored guardian, age 45, wearing heavy eastern iron lamellar armor, no helmet, short hair, honest simple face, huge fists, loyal bodyguard
```

### 독수호법 당청향 · 35세 · 여
- 사천당가 출신 독술사. 차가운 얼굴, **짙은 초록·검정 옷**, 허리에 약병과 침통.
```
cold female poison master, age 35, dark green and black outfit, pouches of medicine bottles and needles at the waist, faint green poison mist, calm emotionless face
```

### 백면 / 소연 · 15세 · 여
- **하얀 가면**을 쓴 소녀 자객(섭혼술에 걸림). 흰 옷, 아미파 발차기. 가면 아래로 설화와 같은 계열의 머리 장식(비녀 반쪽).
```
mind-controlled girl assassin, age 15, plain white mask covering the face, white outfit, Emei kicking stance, eerie and sad, half of a hairpin in her hair
```

### 남궁린 · 26세 · 남
- 남궁세가 적자, 무림맹 선봉대장. **단정한 청색·은색 무사복**, 장검, 굳은 표정.
```
noble young swordsman, age 26, heir of a great martial family, neat blue and silver uniform, longsword, stiff proud expression, alliance vanguard captain
```

### 혜공 방장 · 70대 · 남
- 소림 방장. 흰 눈썹이 길게 늘어진 노승, 붉은 가사, 염주, 자애로운 얼굴.
```
elderly shaolin abbot, age 75, long drooping white eyebrows, kind face, red kasaya robe over yellow, prayer beads
```

### 쥐영감 · 노인 · 남
- 하오문주. **쥐처럼 작은 노인**, 꾀죄죄한 옷, 장부를 끼고 있음, 영리한 눈.
```
tiny old information broker, rat-like sly face, shabby patched clothes, holding a thick ledger book, clever beady eyes
```

### 아롱 · 7세 · 여
- 단우가 구한 아이. 말을 못 함. **단우의 옷자락을 붙잡고** 있는 작은 아이, 단순한 무명옷.
```
small mute village girl, age 7, simple worn cotton clothes, clutching the hem of a young man's blue robe, shy big eyes
```

### 장로 혈사 · 흑사 · 남
- 반란파 장로 형제. **혈사는 붉은 옷, 흑사는 검은 옷**. 사나운 노인들.
```
two fierce old demonic cult elders, brothers, one in blood red robes and one in black robes, menacing poses
```

---

## 시작 화면 일러스트 프롬프트

```
key art for a wuxia pixel art fighting game title screen, dynamic group composition: a young martial artist with a red headband in a blue robe thrusting a glowing sky-blue wind palm toward the viewer in the center, a huge orange-robed shaolin monk charging on the left, a white-clad girl doing a flying kick above, a cold swordsman in slate grey drawing his sword on the right, behind them a blood-red moon inside a swirling purple demonic vortex over dark mountains and a pagoda temple, flying rock debris and dust, dramatic lighting, empty space on the right for the game logo, detailed pixel art, 16:9
```

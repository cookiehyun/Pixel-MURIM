# 단우 예전 그림 업그레이드 (ChatGPT용)

예전 단우 그림(옆모습, 굵은 픽셀)의 **느낌·자세·크기는 그대로** 두고, 명암과 디테일만 조금 올리는 작업입니다.
그림은 **14장**(한 장에 4프레임, 총 56프레임)이고, 파일은 `docs/art/danwoo_old/01.png ~ 14.png`입니다.

## 쓰는 법

1. ChatGPT에 **그 장의 그림 한 장만** 첨부합니다. 예: 03번이면 `03.png`
2. **공통 문장 + 그 장의 4줄**을 붙여 넣습니다.
3. 결과는 원래 그림과 **크기, 칸 위치가 같아야** 합니다. 제가 그 칸을 그대로 잘라 게임에 넣기 때문입니다.
4. 01번을 먼저 뽑아 Claude에게 보내 확인받으세요. 괜찮으면 나머지를 같은 방식으로 뽑습니다.
5. PNG로 저장해서 보내 주세요.

## 공통 문장 (매번 맨 앞에)

```
Edit the attached sprite sheet. It is pixel art shown at 10x zoom: every 10x10 square block is ONE pixel.
Keep EXACTLY the same: image size, the 4 figures' positions on the canvas, their poses, body proportions, height (about 38 pixels), the strict side profile view, and the flat background color #3D4559.
Only upgrade the rendering a little, staying chunky pixel art with the SAME pixel size (one block = 10x10, never smaller pixels):
- 3-tone shading on every color (light from the upper left), darker outline color per material instead of pure black
- a few one-pixel highlights
- small details: eye and eyebrow, red headband with a knot and two tails, thin white collar line and white cuffs, black belt with a knot, cloth folds at elbows and knees, boot soles
Same colors as now: blue robe, red headband, black hair, dark grey trousers, brown boots, skin.
Do not add effects that are not there, no text, no numbers, no watermark.
The 4 frames, left to right:
```

## 결과가 이상할 때 (같은 대화창에서)

자세나 위치가 바뀌었을 때:
```
Keep every figure exactly where it is with exactly the same pose and size as the attached image. Only add shading and small details.
```

픽셀이 잘게 쪼개지거나 부드러워졌을 때:
```
The pixels must stay as big as in the original: every 10x10 block is one pixel. No small pixels, no anti-aliasing.
```

---

## 14장 목록

**01 · 대기 · 앉기 · 점프**
```
1. idle fighting stance, fists up (breathing frame 1)
2. idle fighting stance (breathing frame 2, shoulders slightly lower)
3. crouching low, fists up
4. jumping, knees tucked up
```

**02 · 걷기**
```
1. walking forward, step 1
2. walking forward, step 2
3. walking forward, step 3
4. walking forward, step 4
```

**03 · 약펀치 · 강펀치 준비**
```
1. jab start: front fist pulled back slightly
2. jab: front arm fully extended, small motion arc at the fist
3. strong punch wind-up, step 1
4. strong punch wind-up, step 2: back fist cocked behind
```

**04 · 강펀치 · 막기**
```
1. strong punch: lunging forward, back arm thrown straight, small motion arc at the fist
2. strong punch follow-through
3. strong punch recovery, back toward the stance
4. standing block, forearms up in front of the face
```

**05 · 약발차기 · 강발차기 준비**
```
1. front kick start: knee raised
2. front kick: leg snapped forward at stomach height
3. high kick wind-up, step 1
4. high kick wind-up, step 2
```

**06 · 강발차기 · 앉아 막기**
```
1. high kick: leg kicked up at head height, with the light-blue kick arc
2. high kick follow-through
3. high kick recovery, foot coming down
4. crouching block
```

**07 · 앉아 공격**
```
1. crouching punch, front fist forward
2. crouching uppercut start, fist coiled low
3. rising uppercut, fist straight up above the head
4. crouching low kick along the floor
```

**08 · 다리 쓸기 · 점프 공격 · 대시**
```
1. crouching leg sweep, leg extended along the floor
2. jump punch in the air
3. jump kick in the air
4. dash forward, leaning forward
```

**09 · 맞기 · 뒤 대시**
```
1. hit in the face, head snapped back
2. hit in the stomach, bent forward
3. hit while crouching
4. back dash, hopping backward
```

**10 · 쓰러지기 · 구르기**
```
1. knocked down, flying backward in the air
2. lying flat on his back on the ground
3. rolling on the ground, step 1
4. rolling on the ground, step 2
```

**11 · 구르기 · 잡기**
```
1. rolling on the ground, step 3
2. rolling on the ground, step 4
3. throw: both hands reaching forward to grab
4. throw: lifting and twisting the opponent (opponent not drawn)
```

**12 · 필살기 1 장풍 · 중단 준비**
```
1. palm strike wind-up: palm drawn back
2. lunging palm strike: palm thrust forward, small blue wind arc at the palm
3. palm strike recovery
4. overhead wind-up: both fists raised high above the head
```

**13 · 필살기 2 회전 백피스트 · 중단 내려찍기**
```
1. spinning backfist wind-up
2. spinning, turning the back
3. spinning backfist: arm swung out wide
4. overhead chop: both fists slammed down, light-blue arc
```

**14 · 궁극기 · 등장 · 승리**
```
1. ultimate wind-up: palm raised high
2. slamming the palm into the ground, crouched low
3. round start pose
4. victory pose
```

---

## 참고 (Claude용)

- `docs/art/danwoo_old/layout.json`: 각 장의 칸(48×48), 바닥선(44행), 확대 배율(10), 칸에 들어간 스프라이트 이름입니다.
- 결과는 1/10로 줄인 뒤 칸별로 잘라서 기존 스프라이트를 같은 이름으로 바꿉니다. 기준점은 칸 가운데, 바닥선입니다.
- `*_1x.png`는 원래 크기(1픽셀 = 1칸) 그림입니다.

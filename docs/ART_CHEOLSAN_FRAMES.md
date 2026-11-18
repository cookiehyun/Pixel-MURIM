# 철산 애니메이션 프레임 주문서 (ChatGPT용)

총 **80프레임 = 그림 20장** (한 장에 4프레임). 단우 때와 같은 방식입니다.

## 준비

1. **첫 장(01 대기)만 뽑을 때 첨부:** `docs/preview/danwoo_reference_pixel.png`
   (단우 기준 그림입니다. 철산을 같은 **픽셀 크기와 화풍**으로 그리게 하려는 용도입니다. 단우를 그리면 안 되므로 공통 문장에 그렇게 적어 두었습니다.)
2. **01번 결과가 마음에 들면** 02번부터는 **철산 01번 결과를 기준 그림으로** 첨부합니다. 이게 가장 중요합니다. 모든 장이 같은 철산이 되게 합니다.
3. 01번을 먼저 Claude에게 보내 크기와 스타일을 확인받으세요.
4. 가능하면 **PNG로 저장**해서 보내 주세요(webp는 색이 뭉개집니다).

## 철산 외형 (참고)

- 바위 같은 거구의 소림 무승, 34세. 빡빡 깎은 머리, 굵은 눈썹, 두꺼운 목과 팔. 말이 없고 묵직한 표정.
- 주황색 승복(한쪽 어깨를 드러냄), 짙은 붉은 허리띠, 목에 큰 나무 염주, 정강이를 감은 회색 행전, 투박한 신.
- 때려서 죽이지 않으려고 **잡고 메치는** 무승. 손은 주먹보다 **펼친 손바닥**이 많습니다.
- 크기: 단우보다 **조금 크고(서 있을 때 약 60칸) 몸이 훨씬 넓게**.

## 공통 문장 (매번 맨 앞에, 그대로 복사)

```
Pixel art sprite only. Every pixel must be a clearly visible square block, like the attached image. No smooth shading, no gradients, no anti-aliasing, no painterly or blurry edges. Limited palette of about 24 colors with hard edges between them.
Use the attached image only as the style and scale reference (same chunky pixel size, same flat 2D side-view shading with 3 tones per color, same outline style, same plain background color #3D4559). If the attached image shows a different character, do not draw that character.
Character: Cheolsan, a huge muscular Shaolin warrior monk, age 34. Shaved head, thick black eyebrows, stern calm face, thick neck and arms. Orange monk robe (#C4652A, shadows #8D4420) worn with the right shoulder bare, dark red sash (#7A1F1F), a necklace of large wooden prayer beads (#5A3A1E), grey cloth leg wraps (#9A8F7C), heavy brown shoes. About 60 pixels tall when standing and much broader than a normal man. He grapples and throws; his hands are usually open palms.
Draw 4 consecutive animation frames of a 2D fighting game in one wide image (3:1). Strict side view, facing right, full body. All 4 figures at exactly the same scale, standing on the same ground line, evenly spaced, not overlapping. Head size, body proportions and clothes must stay identical in every frame - only the pose changes. No text, no numbers, no watermark.
Frames, left to right:
```

## 결과가 이상할 때 (같은 대화창에서 한 번 더)

```
This is not pixel art. Redraw the same 4 frames as true pixel art with big square pixels exactly like the attached reference.
```
```
Keep all 4 frames in strict side view at exactly the same size as the attached reference. Only the pose may change.
```

---

## 1. 기본 동작

**01 · 대기 (숨쉬기, 반복)**
```
1. wide heavy fighting stance, both open hands forward ready to grab, knees bent
2. same stance, shoulders slightly lower (breathing out)
3. same stance, shoulders lowest, knees a little more bent
4. same stance, shoulders rising back (breathing in)
```

**02 · 걷기 (반복)**
```
Heavy fighting game shuffle walk: feet stay low on the ground, knees never rise above shin height, upper body keeps the grabbing stance.
1. front foot sliding forward, wide low stance
2. back foot sliding forward along the ground, feet closer together
3. front foot sliding forward again, wide low stance
4. back foot sliding forward along the ground, feet closer together
```

**03 · 앉기 · 점프 시작**
```
1. half-crouch, bending the knees (going down)
2. full low crouch, open hands up, guarding
3. deep knee bend preparing to jump
4. jumping off the ground, heavy body rising, legs extended
```

**04 · 점프 공중 · 착지**
```
1. jump peak, knees tucked up, open hands forward
2. falling down, legs extending toward the ground
3. heavy landing, knees deeply bent, dust under the feet
4. standing back up into the grabbing stance
```

**05 · 대시**
```
1. dash forward: leaning forward, pushing off the back foot
2. dash forward: long low heavy stride
3. back dash: hopping backward, leaning back, hands up
4. back dash: landing backward on the back foot
```

## 2. 막기 · 맞기 · 쓰러지기

**06 · 막기 · 맞기**
```
1. standing block, both thick forearms crossed in front of the face
2. crouching block, low crouch with forearms crossed
3. getting hit in the face, head snapped back, stumbling
4. getting hit in the stomach, body bent forward
```

**07 · 쓰러지기**
```
1. crouching hit, flinching while crouched
2. knocked off the feet, flying backward in the air, arms flailing
3. hitting the ground on his back, bouncing
4. lying flat on his back on the ground
```

**08 · 일어나기 · 구르기**
```
1. getting up: sitting up from lying, one knee bent
2. getting up: on one knee, pushing up to stand
3. rolling on the ground: curled into a ball, back on the floor
4. rolling on the ground: curled ball rotated, feet over head
```

## 3. 일반 공격

**09 · 약손바닥 (잽) + 약발차기 준비**
```
1. quick palm strike: front open palm pulled back slightly
2. quick palm strike: front arm extended, open palm thrust forward at chest height
3. quick palm strike: arm pulling back to the stance
4. stomp kick start: front knee raised
```

**10 · 약발차기 마무리 + 강손바닥 준비**
```
1. stomp kick: front foot driven forward at knee height
2. stomp kick: foot pulling back
3. heavy double palm wind-up: both open palms pulled back to the hips, body twisted back
4. heavy double palm thrust: stepping forward, both open palms thrust forward together
```

**11 · 강손바닥 마무리 + 무릎차기**
```
1. double palm follow-through: body leaning forward, both arms extended
2. double palm recovery: pulling back to the stance
3. rising knee strike start: shifting weight onto the front foot
4. rising knee strike: back knee driven up to chest height, hands pulling down
```

**12 · 무릎차기 마무리 + 중단 내려찍기**
```
1. knee strike follow-through: knee still high, body leaning forward
2. knee strike recovery: foot landing, back to the stance
3. overhead smash wind-up: both hands clasped together and raised high above the head
4. overhead smash: clasped hands slammed down in front of him at chest height
```

**13 · 앉아 공격**
```
1. crouching palm: low crouch, front open palm thrust forward
2. crouching low kick: low crouch, front foot kicking along the floor
3. rising palm start: deep crouch, palm coiled low
4. rising palm: springing up, open palm thrust straight up above his head
```

**14 · 다리 쓸기 · 공중 공격**
```
1. leg sweep start: crouching, turning, one hand on the floor
2. leg sweep: back leg swept fully along the floor in a wide arc
3. jump attack: in the air, both open palms thrust forward and downward
4. jump attack: in the air, heavy knee driven forward and downward
```

**15 · 내려찍기 마무리 · 잡기**
```
1. recovery: standing back up into the grabbing stance
2. throw: both big hands reaching forward to grab the opponent by the collar
3. throw: lifting an (invisible) opponent high above his head with both arms straight up
4. throw: slamming the (invisible) opponent down into the ground in front of him, body bent forward, dust bursting
```

## 4. 필살기

**16 · 필살기 1 나한복마 (붙잡아 연타 후 메치기)**
```
Both hands hold an invisible opponent in front of him (do not draw the opponent).
1. lunging forward with both arms wide open to seize the opponent
2. holding the opponent's collar with the left hand, right palm pulled back for a strike
3. holding the opponent's collar with the left hand, right palm striking forward hard, impact sparks
4. lifting the opponent overhead with both arms, roaring
```

**17 · 필살기 2 철산고 (어깨 돌진)**
```
1. lowering his body, bracing the bare shoulder forward, back foot digging in
2. charging forward with the shoulder first, body almost horizontal, dust behind the feet
3. shoulder impact: full body slamming forward, shockwave lines in front of the shoulder
4. recovery: stopping, pulling back into the stance
```

**18 · 궁극기 금강분노 (광폭화)**
```
1. gathering rage: fists clenched at the sides, red and orange flames starting to rise around his body
2. roaring at the sky with both fists raised, glowing red eyes, a burst of red flame aura around the whole body
3. berserk stance: flushed red skin, glowing red eyes, crackling red-orange flame aura around the body, steam rising from the head
4. berserk stance, second flame frame: the flames flicker higher, embers flying
```

## 5. 등장 · 승리

**19 · 등장 (합장)**
```
1. standing upright, calm, prayer beads in one hand
2. pressing both palms together in front of the chest (Buddhist prayer)
3. bowing slightly with palms together
4. stepping into the wide grabbing stance
```

**20 · 승리**
```
1. victory: standing tall, palms together in prayer, eyes closed
2. victory: one hand raised in a blessing gesture, calm smile
3. victory: arms folded across the huge chest
4. victory: stamping one foot down hard, dust bursting
```

---

## 광폭화(금강분노) 중의 모습

광폭화 5초 동안의 붉은 피부, 빨간 눈, 불꽃 오라는 **모든 동작에 코드로 입힙니다.** 그래서 광폭화용으로 동작 그림을 따로 뽑을 필요는 없습니다. 18번은 광폭화를 시작하는 연출용입니다.

## 각 장이 게임에서 쓰이는 곳

| 장 | 게임 동작 |
|---|---|
| 01 | 대기 (4프레임 반복) |
| 02 | 걷기 (뒤로 걷기는 거꾸로 재생) |
| 03, 04 | 앉기, 점프 (도약·정점·낙하·착지) |
| 05 | 앞 대시, 뒤 대시 |
| 06, 07, 08 | 막기, 맞기, 쓰러짐, 일어나기, 낙법 구르기 |
| 09–12 | 약·강 손바닥, 밟기·무릎차기, 중단 내려찍기 (준비 → 타격 → 복귀) |
| 13, 14 | 앉아 손바닥·발차기·올려치기·다리 쓸기, 점프 공격 |
| 15 | 복귀, 잡기 (잡기 → 들어 올리기 → 메치기) |
| 16 | 필살기 1 나한복마 (잡기 → 연타 → 들어 올리기, 메치기는 15번 그림 사용) |
| 17 | 필살기 2 철산고 |
| 18 | 궁극기 금강분노 발동 |
| 19, 20 | 라운드 시작 등장, 승리 |

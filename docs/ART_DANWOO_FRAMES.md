# 단우 애니메이션 프레임 주문서 (ChatGPT용)

총 **80프레임 = 그림 20장** (한 장에 4프레임).

## 준비

1. **기준 그림:** `docs/preview/danwoo_reference_pixel.png` (게임에 들어간 단우 걷기 4장을 픽셀 칸 그대로 확대한 그림).
   **모든 장에 이 그림을 첨부**합니다. 칸이 뚜렷한 그림을 보여 줘야 ChatGPT도 픽셀로 그립니다.
2. 한 장마다: **공통 문장 + 그 장의 동작 4줄**을 붙여서 보냅니다.
3. **먼저 01번 한 장만** 뽑아서 Claude에게 보내 확인받으세요. 게임에 쓸 수 있는 수준이면 나머지를 같은 방식으로 뽑습니다.

## 공통 문장 (매번 맨 앞에, 그대로 복사)

```
Pixel art sprite only. Every pixel must be a clearly visible square block, like the attached image. No smooth shading, no gradients, no anti-aliasing, no painterly or blurry edges. Limited palette of about 24 colors with hard edges between them.
Use the attached image as the character and style reference: same character, same chunky pixel size (about 56 pixels tall when standing), same flat 2D side-view shading with 3 tones per color, same colors, same plain background color #3D4559.
Draw 4 consecutive animation frames of a 2D fighting game in one wide image (3:1). Strict side view, facing right, full body. All 4 figures at exactly the same scale, standing on the same ground line, evenly spaced, not overlapping. Head size, body proportions and clothes must stay identical in every frame - only the pose changes. No text, no numbers, no watermark.
Frames, left to right:
```

## 결과가 이상할 때 (같은 대화창에서 한 번 더)

부드러운 그림으로 나왔을 때:
```
This is not pixel art. Redraw the same 4 frames as true pixel art with big square pixels exactly like the attached reference.
```

각도나 크기가 들쭉날쭉할 때:
```
Keep all 4 frames in strict side view at exactly the same size as the attached reference. Only the pose may change.
```

## 받을 때 확인할 것

1. **픽셀 칸이 또렷한지.** 확대했을 때 네모 칸이 보여야 합니다. 번지면 위 문장으로 다시 요청하세요.
2. **4개 모두 같은 크기, 같은 옆모습인지.** 하나라도 3/4 각도이거나 머리 크기가 다르면 다시 뽑는 게 낫습니다.
3. 아주 잘 나온 장이 생기면, 그다음부터는 기준 그림과 함께 그 장도 첨부해도 좋습니다.
4. 받은 순서대로 파일 이름에 번호(01~20)만 붙여서 보내 주시면 됩니다.

---

## 1. 기본 동작

**01 · 대기 (숨쉬기, 반복)**
```
1. fighting stance, fists up, weight on both feet
2. same stance, shoulders slightly lower (breathing out)
3. same stance, shoulders lowest, knees slightly more bent
4. same stance, shoulders rising back (breathing in)
```

**02 · 앞으로 걷기 (반복)**
```
1. walking forward in fighting stance, front foot stepping forward
2. passing position, back foot lifted next to the front knee
3. back foot landing in front, wide step
4. passing position again, other foot lifted, fists up the whole time
```

**03 · 앉기 · 점프 시작**
```
1. half-crouch, bending the knees (going down)
2. full low crouch, fists up, guarding
3. deep knee bend preparing to jump
4. jumping off the ground, legs extended, rising
```

**04 · 점프 공중 · 착지**
```
1. jump peak, knees tucked up, fists up
2. falling down, legs extending toward the ground
3. landing, knees bent absorbing the impact
4. standing back up into fighting stance
```

**05 · 대시**
```
1. dash forward: leaning forward, pushing off the back foot
2. dash forward: long low stride, almost flying forward
3. back dash: hopping backward, leaning back, fists up
4. back dash: landing backward on the back foot
```

## 2. 막기 · 맞기 · 쓰러지기

**06 · 막기 · 맞기**
```
1. standing block, both forearms raised in front of the face
2. crouching block, low crouch with forearms up
3. getting hit in the face, head snapped back, stumbling
4. getting hit in the stomach, body bent forward in pain
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

**09 · 약펀치 (잽) + 약발차기 준비**
```
1. quick jab: front fist pulled back slightly, shoulder turning
2. quick jab: front arm fully extended in a straight punch
3. quick jab: arm pulling back to guard
4. front kick start: front knee raised high
```

**10 · 약발차기 마무리 + 강펀치 준비**
```
1. front kick: leg snapping fully forward at stomach height
2. front kick: leg retracting, knee still raised
3. strong punch wind-up: back fist cocked behind, body twisted back
4. strong punch: lunging forward, back arm thrown fully straight
```

**11 · 강펀치 마무리 + 돌려차기**
```
1. strong punch follow-through: body leaning far forward, arm extended
2. strong punch recovery: pulling back to stance
3. high roundhouse kick start: pivoting on the front foot, back knee rising
4. high roundhouse kick: leg extended horizontally at head height
```

**12 · 돌려차기 마무리 + 중단 내려찍기**
```
1. roundhouse follow-through: leg sweeping past, body turned
2. roundhouse recovery: kicking foot landing, back to stance
3. overhead chop wind-up: both fists clasped and raised high above the head
4. overhead chop: both clasped fists slammed downward in front of him
```

**13 · 앉아 공격**
```
1. crouching punch: low crouch, front fist extended straight forward
2. crouching low kick: low crouch, front leg poking forward along the floor
3. crouching uppercut start: deep crouch, fist coiled low
4. rising uppercut: springing up, fist thrust straight up above the head
```

**14 · 다리 쓸기 · 공중 공격**
```
1. leg sweep start: crouching, spinning, one hand on the floor
2. leg sweep: back leg swept fully along the floor in a wide arc
3. jump punch: in the air, knees tucked, fist thrust forward and downward
4. jump kick: in the air, one leg kicked forward and slightly downward
```

**15 · 내려찍기 마무리 · 잡기**
```
1. uppercut / overhead recovery: landing back into fighting stance
2. throw: both hands reaching forward to grab the opponent's collar
3. throw: pulling and twisting, turning his back, lifting
4. throw: hurling over the shoulder, body bent forward, arms swinging down
```

## 4. 필살기 (파란 바람 기운 = sky-blue wind qi)

**16 · 필살기 1 청풍장 (장풍 돌진)**
```
1. drawing the right palm back to the hip, faint sky-blue wind gathering in the palm
2. stepping into a deep forward lunge, palm starting to push forward
3. palm fully extended, a large glowing sky-blue wind palm blast bursting from the hand
4. recovery: palm still out, blue wind fading away, starting to pull back
```

**17 · 필살기 2 회전 백피스트 (가드 브레이크)**
```
1. turning his back to the opponent, winding up the spin
2. mid-spin, back facing the viewer, arm swinging out wide, blue trail
3. spinning backfist impact: arm fully extended sideways, fist glowing bright blue with a blue arc trail
4. recovery: finishing the spin, returning to stance
```

**18 · 궁극기 청풍진천 (땅에 장풍 내려찍기)**
```
1. gathering qi: both palms raised to the sky, glowing sky-blue wind swirling around him
2. leaping up slightly with the right palm raised high, huge blue glow
3. slamming the glowing palm down into the ground, a giant blue palm print hitting the floor
4. holding the slam pose low to the ground, blue shockwave and dust spreading on both sides
```

## 5. 등장 · 승리

**19 · 등장 (포권)**
```
1. standing upright, relaxed, headband fluttering
2. martial arts salute: right fist pressed into the left open palm in front of the chest
3. bowing slightly while holding the salute
4. stepping into fighting stance, fists up
```

**20 · 승리**
```
1. victory: standing tall, one fist resting at the hip, confident smile
2. victory: right fist raised to the sky
3. victory: arms folded across the chest, headband fluttering
4. victory: looking back over the shoulder with a grin, wiping his nose with a thumb
```

---

## 각 장이 게임에서 쓰이는 곳

| 장 | 게임 동작 |
|---|---|
| 01 | 대기 (4프레임 반복) |
| 02 | 걷기 앞으로 (뒤로 걷기는 거꾸로 재생) |
| 03, 04 | 앉기, 점프 (도약·정점·낙하·착지) |
| 05 | 앞 대시, 뒤 대시 |
| 06, 07, 08 | 막기, 맞기, 쓰러짐, 일어나기, 낙법 구르기 |
| 09–12 | 약·강 펀치, 약·강 발차기, 중단 내려찍기 (준비 → 타격 → 복귀) |
| 13, 14 | 앉아 펀치·발차기·어퍼컷·다리 쓸기, 점프 펀치·킥 |
| 15 | 복귀 프레임, 잡기 |
| 16, 17, 18 | 필살기 1, 필살기 2, 궁극기 |
| 19, 20 | 라운드 시작 등장, 승리 |

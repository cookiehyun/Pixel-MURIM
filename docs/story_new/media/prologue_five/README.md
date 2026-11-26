# 혈월의 밤 · 서장 전장

[마지막 전투부터 진군·암전·지도 전환까지 실제 속도 GIF](final-march.gif)

| 컷 | 장면 | 화면 |
|---|---|---|
| 1 | 황토색 수도승, 청색 검객, 녹색 권사가 붉은 두건 셋과 교전한다. | [교전](01-clash.png) |
| 2 | 전장 오른편에 누워 있던 시체 셋을 혈마가 깨운다. | [소환](02-command.png) |
| 3 | 혈마에게 가까운 몸부터 기운이 스며들고, 팔이 꿈틀하고, 눈에 불이 켜진 뒤 일어난다. | [기상 중](03-rising.png) · [세 구 모두 기립](03-three-awake.png) |
| 4 | 혈강시가 수도승을 붙잡아 끌고, 혈교도가 검객을 베고, 두 번째 혈강시가 권사를 쳐서 쓰러뜨린다. | [양 진영](04-formation.png) · [접전](04-reversal.png) · [세 무인이 쓰러진 뒤](final-fallen.png) |
| 5 | 약 1초의 정적 뒤 혈마가 다시 손을 뻗는다. 방금 쓰러진 셋이 차례로 혈강시가 된다. | [두 번째 기상](final-march.gif) |
| 6 | 혈강시 여섯과 혈교도 셋이 왼쪽으로 진군한다. 혈마는 오른쪽에 남는다. 마지막 해설을 A로 넘기면 암전한다. | [진군](final-march.png) |

## 실제 스프라이트

아래 파일은 모두 [게임의 SD 폴더](../../../../web/data/hi/sd/)에 있다. 전투 인물은 원래 피부색과 바닥 앵커를 유지한다. 원거리 실루엣에만 단색을 쓴다.

| 배역 | 런타임 폴더와 자세 |
|---|---|
| 혈교도 | `blood_acolyte/{idle_0,walk_0,atk_0,atk_1,hit}.png`. 기존 `cultist/`의 체형·칼날을 살리고 두건, 옷, 띠에 붉은색을 입혔다. |
| 수도승 | `monk/run_0.png`, `run_1.png`, `lie_up.png`, `lie_down.png`. |
| 일반 검객 | `sect_sword/{idle_0,lp_0,lp_1,guard,hit_0,down_1}.png`. 무영 대전 자산의 검술 자세에 청색 무복을 입혔다. |
| 일반 무림인 | `sect_fist/{idle_0,lp_0,lp_1,guard,hit_0,down_1,walk_0,walk_2}.png`. 단우 대전 자산의 맨손 자세에 녹색 무복과 황토색 머리띠를 입혔다. |
| 혈강시 | `gangsi/rise_0.png`부터 `rise_4b.png`까지 15장, `walk_0.png`부터 `walk_2.png`, `stab.png`, `atk_1.png`, `guard.png`. |
| 혈마 | `hyeolma_f/idle_0.png`, `idle_1.png`, `sp_a.png`. 지면 파장은 `hyeolma_fx/wave_0.png`~`wave_5.png`. |

[각본](../../00_prologue.md) · [컷별 인물 동선과 부활 이펙트](../../../../web/src/prologueBattle.ts) · [의상 제작 스크립트](../../../../tools/sd_blood_battle.py)

프로덕션 미리보기를 4173 포트에서 실행한 뒤 `node tools/harness/web/prologue_cast.js`로 A키 수동 진행, 암전 길이와 해설 순서를 확인하고, 부활 전후의 세 몸과 마지막 전투에서 쓰러진 무인 셋, 두 번째 기상 및 진군 중인 아홉 인물을 실제 캔버스 픽셀과 대조할 수 있다. `prologue_run.js`는 서장 완료와 여섯 개인 편 해금을 확인한다.

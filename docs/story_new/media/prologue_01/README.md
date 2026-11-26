# 서장 전장과 혈강시

[여섯 장면](formation.png) · [바닥선 확인](ground-lines.png) · [같은 바닥에서 체형 비교](proportions.png) · [전쟁 재생](battle.gif) · [기상과 추격 재생](rising.gif)

## 화면에서 사용한 자산

경로는 `web/data/hi/sd/` 기준이다. 게임은 `web/data/hi/manifest.txt`의 이름과 골반 아래 발 앵커를 읽고 atlas에서 해당 그림을 불러온다.

| 역할 | 게임에 등록된 PNG |
|---|---|
| 두건 교도 | `cultist/idle_0.png`, `atk_0.png`, `atk_1.png`, `hit.png` |
| 수도승 | `monk/run_0.png`, `run_1.png`, `lie_down.png`. 접근·회피·쓰러짐을 맡는다. |
| 일반 검객 | 스토리의 ‘무사’가 쓰는 무영 대전 몸체와 철회색 팔레트. `muyeong_f/idle_0.png`, `lp_0.png`, `lp_1.png`, `guard.png`, `hit_0.png`, `down_1.png`, `walk_0.png`, `walk_2.png` |
| 혈마 | `hyeolma_f/idle_0.png`, `idle_1.png`, `walk_1.png`, `walk_3.png`, `sp_a.png`. 발에서 퍼지는 파동은 `hyeolma_fx/wave_0.png`~`wave_5.png` |
| 혈강시 | `gangsi/walk_0.png`의 실제 픽셀에서 5자세와 사이 동작 10장을 만든다. `rise_0.png`~`rise_4b.png`에서 원래의 `walk_0.png`, `walk_1.png`, `walk_2.png`로 이어진다. |
| 백무진·천마 | 체형 비교에는 `baekmujin_f/idle_0.png`와 `cheonma_f/idle_0.png`를 사용했다. 두 사람은 뒤의 제단 장면에 등장한다. |

## 구도와 타이밍

- 후경 Y 83에는 실루엣 28명, 중경 Y 89와 전경 Y 96에는 각각 세 곳의 교전이 있다. 모든 좌표는 192×100 월드 기준이다. 중경 오른쪽 혈마의 발도 같은 선에 고정된다.
- 검객의 중립 자세와 교도·수도승·혈강시의 머리와 몸통을 비교해 캐릭터별로 배율 하나를 정했다. 달릴 때의 구부린 무릎과 머리 위로 든 검은 자세 그대로 그린다.
- [전장 코드](../../../../web/src/prologueBattle.ts)의 `drawMaster`에서 혈마가 양손을 펼친다. 10틱 뒤 `groundPulse`가 왼쪽으로 나가며, `resurrection`이 거리와 개체별 지연에 맞춰 몸 아래 파장, 몸 앞뒤의 기류, 기상, 추격을 진행한다.
- [기상 프레임 제작 코드](../../../../tools/sd_gangsi_rise.py)는 머리·몸통·팔·양다리 관절의 자세를 보간한다. 원본 243 시안은 이 경로에 들어가지 않는다.

TypeScript 및 Vite 빌드, Playwright 실제 속도 재생, 서장 전체 완료와 개인 편 여섯 개 진입을 확인했다. 렌더러에서 38개 자세 × 3개 지면 × 2개 방향으로 발 앵커에 닿는 마지막 화면 픽셀을 확인했다.

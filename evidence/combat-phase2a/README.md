# 대전 2A 시계 검증

기준은 `c6ab08a`다. `verify.cjs`는 Chromium에서 메뉴를 통해 트레이닝, ARCADE 여섯 번째 그림자전, 싱글 VS CPU에 들어간다. CPU 관찰 검사 외에는 상대를 정지시켜 단우 미러전의 입력 조건을 맞춘다. 태그 검사는 C 키로 교체하고 착지한 뒤 반복한다.

## 재실행

Node에서 Playwright를 불러올 수 있어야 한다. Linux Chromium 경로는 `CHROME_PATH`로 지정할 수 있다. 저장소 루트에서 다음 명령으로 개발 서버를 띄운다.

```sh
cd web
npm ci
npm run dev -- --host 127.0.0.1 --port 4190 --strictPort
```

별도 터미널에서 저장소 루트 기준으로 `node evidence/combat-phase2a/verify.cjs after`를 실행한다. 이 검사는 저장된 before.json과 프레임별 결과를 대조하고 after.json을 갱신한다. 기준 로그를 재생성하려면 `c6ab08a`의 web 디렉터리를 별도 위치에 준비해 같은 방식으로 4192 포트에서 실행한 뒤, 현재 체크아웃에서 아래 명령을 실행한다.

```sh
GAME_URL=http://127.0.0.1:4192 node evidence/combat-phase2a/verify.cjs before
```

테스트는 DOM 키 이벤트와 앱의 실제 RAF 콜백을 사용한다. 디스플레이 시각만 고정해 수치가 머신 부하에 따라 바뀌지 않게 했다. CPU 관찰 링과 라운드 타이머에는 Vite 응답에 읽기 전용 접근자를 덧붙인다. 시간 단위는 시뮬레이션 ms, 60Hz 프레임, 기존 50ms 틱이다. 아래 표는 각 시도 시작을 0ms로 잡고, 변경 전후 공통으로 3번째 표시 프레임(50ms)에 입력을 읽은 경우다. 행동 가능은 피격 또는 공격 상태에서 대기 상태로 돌아온 첫 프레임이다. 앉아 강손의 공격자는 앉기 상태로 돌아온다.

| 단우 기술과 입력 시 중심 거리 | 피해 | 첫 명중 | 공격자 복귀 | 방어자 복귀 | 히트스톱 |
|---|---:|---:|---:|---:|---:|
| 약손 15px | 30 | 150ms · 3틱 | 550ms · 11틱 | 600ms · 12틱 | 150ms |
| 강발 28px | 100 | 250ms · 5틱 | 900ms · 18틱 | 1000ms · 20틱 | 200ms |
| 앉아 강손 18px | 80 | 250ms · 5틱 | 950ms · 19틱 | 950ms · 19틱 | 200ms |
| 앉아 강손 대공 6px, 상대 발 22px 위 | 80 | 200ms · 4틱 | 950ms · 19틱 | 2250ms · 45틱 | 200ms |

네 전투 조건에서 양방향으로 위 명중과 약손 16px, 강발 29px, 앉아 강손 19px의 빗나감을 확인했다. 56개 경우 모두 거리·피해·명중·복귀·히트스톱 및 복귀 시점까지의 상대 변위가 기준과 일치했다.

## 입력 및 이동

- 같은 50ms 안에서 A를 눌렀다 뗐다. 기존에는 두 경우 모두 3프레임 인식, 9프레임 명중이었다. 변경 후에는 1→7프레임과 2→8프레임이다. 두 경우 모두 실제 입력 비트, 공격 시작, 체력 감소가 각각 한 번이다.
- RAF가 50ms에 한 번만 호출되는 경우도 검사했다. 8.333ms와 25ms에 들어온 탭을 각각 첫째·둘째 입력 샘플에서 처리했고, 첫 명중은 7·8프레임이었다.
- 단우는 500ms(10틱) 동안 20px 걸었다. 같은 구간에 라운드 타이머는 10틱 감소했다. 전방 점프의 수평 이동은 30.6px, 체공 시간은 850ms(17틱)였다. 최고점 관측 높이는 18px에서 18.0556px로 바뀌었다.
- CPU는 기존 주기로 관찰하고 판단한다. 첫 관찰 샘플부터 판단에 쓰이는 샘플까지 EASY/NORMAL/HARD 지연은 7/4/2틱(350/200/100ms)이다. 자극을 직전 샘플 직후에 넣은 실측에서는 다음 샘플까지의 1틱을 포함해 400/250/150ms였다.

## 공용 경로 회귀

`web`에서 `npm run build`로 TypeScript와 Vite를 검사하고 `npm run preview -- --port 4173 --strictPort`로 빌드 결과를 실행한다. 저장소 루트에서 아래 기존 검사를 실행할 수 있다.

```sh
CHROME_PATH=/usr/bin/chromium node tools/harness/web/combat_boundaries.js after /tmp/phase2a-boundaries
CHROME_PATH=/usr/bin/chromium node tools/harness/web/crouch_uppercut.js after /tmp/phase2a-uppercut
node tools/harness/web/prologue_run.js
```

서장 검사는 Playwright의 기본 Chromium을 사용한다. 이번 클라우드 검증에서는 설치된 시스템 Chromium을 사용했다. 서장 완료 후 개인편 6개가 열렸고 브라우저 오류는 0건이었다. 락스텝은 로컬에서 양측 입력을 재생해 130개 프레임 해시가 전부 일치했고, 최종 해시는 610093141이었다. 실제 원격 매칭은 검증 범위 밖이다.

# 게임 서버 준비: Oracle Cloud 무료 서버 (서울)

온라인 방 코드 대전과 랭크전(docs/ONLINE.md M3·M4)에 쓰는 서버를 만드는 순서입니다.
Oracle 화면 메뉴 이름은 바뀔 수 있습니다. 비슷한 이름을 찾으면 됩니다.

**중요:** 서버에 들어갈 때 쓰는 **비밀 키 파일(.key)과 비밀번호는 아무에게도(Claude 포함) 보내지 마세요.**
알려줄 것은 서버의 **공인 IP 주소**와 **서버 종류(Ampere / AMD)** 두 가지뿐입니다.

## 1. 가입 (처음 한 번)
1. https://www.oracle.com/cloud/free/ → **Start for free**.
2. **홈 리전(Home Region)** 고르기. 홈 리전은 나중에 바꿀 수 없고, 무료 서버는 홈 리전에서만 만들 수 있습니다.
   - 가입 화면에 서울(South Korea Central)이 없는 경우가 많습니다(Oracle FAQ: 가입 때 고를 수 있는 리전은 다를 수 있음).
   - 그러면 **South Korea North (Chuncheon, 춘천)**을 고릅니다. 국내라 게임 지연은 서울과 같습니다.
   - 춘천도 없으면 Japan Central (Osaka) 또는 Japan East (Tokyo) (왕복 30~40 ms, 게임에 지장 없음). 미국·유럽은 피합니다.
3. 카드 인증을 합니다(본인 확인용 소액 승인 후 취소, 무료 등급만 쓰면 요금이 나가지 않음).
4. 가입이 끝나면 계정은 **Always Free** 등급입니다. 유료 업그레이드를 누르지 않는 한 무료 자원만 쓸 수 있습니다.

## 2. 서버(인스턴스) 만들기
1. 왼쪽 위 메뉴 → **Compute → Instances → Create instance**.
2. Name: `pixel-murim`
3. **Image**: `Canonical Ubuntu 24.04` (Change image에서 고름)
4. **Shape** (Change shape): 이 게임 서버는 매우 가벼워서 가장 작은 무료 서버로 충분합니다.
   - **홈 리전이 춘천이면: VM.Standard.E2.1.Micro** (AMD, Always Free). 춘천에서는 무료 Ampere(A1)를 만들 수 없다고 알려져 있습니다.
   - 서울·일본이면: E2.1.Micro 또는 Ampere VM.Standard.A1.Flex (OCPU 1, 메모리 6 GB). A1은 "Out of host capacity"가 자주 나므로 E2.1.Micro가 더 쉽게 만들어집니다.
   - 어느 쪽이든 "Always Free-eligible" 표시가 있는지 확인합니다.
   - **"Out of host capacity"가 뜨면:** 폴트 도메인(Fault domain)을 지정하지 않고, 더 작은 크기로, 몇 분 뒤 다시 시도합니다. (한국 리전은 가용 도메인이 1개라 "다른 AD로 바꾸기"는 해당 없음)
5. **Networking**: "Create new virtual cloud network" + "Create new public subnet", **Assign a public IPv4 address: Yes**.
6. **Add SSH keys**: **Generate a key pair for me** → **Save private key** (예: `pixel-murim.key`)를 눌러 저장합니다.
   이 파일이 서버 열쇠입니다. 잃어버리면 서버에 못 들어갑니다. 안전한 곳에 보관하세요.
7. **Create**. 1~2분 뒤 상태가 **Running**이 되면 화면의 **Public IP address**를 적어 둡니다.

## 3. 게임 포트 열기 (두 곳)
서버에는 문이 두 겹 있습니다. 둘 다 UDP 47700을 열어야 합니다.

**(1) Oracle 쪽 방화벽 (Security List)**
1. 인스턴스 화면 → **Primary VNIC의 Subnet** 링크 → **Security Lists** → `Default Security List for ...`
2. **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: **UDP**
   - Destination Port Range: `47700`
   - Description: `pixel murim`
3. **Add Ingress Rules** 버튼으로 저장.

**(2) 서버 안의 방화벽 (Ubuntu)** — 4번에서 서버에 들어간 다음 실행합니다.
REJECT(모두 거부) 줄보다 **위**에 넣어야 합니다. 서버마다 기본 줄 수가 달라서, REJECT 줄 번호를 찾아 그 자리에 넣습니다.
```bash
sudo iptables -I INPUT $(sudo iptables -L INPUT --line-numbers | awk '/REJECT/{print $1; exit}') -p udp --dport 47700 -j ACCEPT
```
확인: 아래 결과에서 `udp dpt:47700` 줄이 `REJECT` 줄보다 위에 있어야 합니다.
```bash
sudo iptables -L INPUT -n --line-numbers
```
```bash
sudo netfilter-persistent save
```

## 4. 서버에 들어가기 (SSH)
**Mac** (터미널):
```bash
chmod 600 ~/Downloads/pixel-murim.key
```
```bash
ssh -i ~/Downloads/pixel-murim.key ubuntu@<공인 IP>
```

**Windows** (PowerShell):
```bash
ssh -i $HOME\Downloads\pixel-murim.key ubuntu@<공인 IP>
```
처음 접속할 때 `Are you sure you want to continue connecting?` → `yes`.

들어가지면 프롬프트가 `ubuntu@pixel-murim:~$` 처럼 바뀝니다. 여기서 3번 (2)를 실행합니다.

## 5. Claude에게 알려줄 것
- 공인 IP 주소 (예: `152.67.x.x`)
- 서버 종류: Ampere(A1) 인지 AMD(E2.1.Micro) 인지
- 아래 명령 결과 (서버 안에서):
```bash
uname -m && lsb_release -d
```

비밀 키 파일과 비밀번호는 보내지 마세요. 다음 단계(게임 서버 설치)는 Claude가 명령어를 정리해 드리고, 서버 안에서 사용자님이 붙여넣어 실행합니다.

## 무료로 유지하려면
- 화면에 "Upgrade to Pay As You Go"가 보여도 누르지 않습니다.
- **놀고 있는 서버는 회수될 수 있습니다.** 7일 동안 CPU·네트워크(A1은 메모리도) 사용률이 모두 20% 미만이면 Oracle이 Always Free 서버를 회수할 수 있다고 안내합니다. 게임 서버는 사람이 없을 때 거의 일을 하지 않아서 이 조건에 걸릴 수 있습니다.
  - 회수되면 서버를 다시 만들고 설치 명령을 다시 실행하면 됩니다(설치는 몇 분, 순위 기록은 백업을 받아 두면 복구 가능).
  - 자주 회수되면 서울에 있는 저가 유료 서버(월 5~7천 원 수준)로 옮기는 것을 고려합니다. 서버 프로그램은 그대로 씁니다.

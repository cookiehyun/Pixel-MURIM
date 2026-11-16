# 게임 서버 준비: Oracle Cloud 무료 서버 (서울)

온라인 방 코드 대전과 랭크전(docs/ONLINE.md M3·M4)에 쓰는 서버를 만드는 순서입니다.
Oracle 화면 메뉴 이름은 바뀔 수 있습니다. 비슷한 이름을 찾으면 됩니다.

**중요:** 서버에 들어갈 때 쓰는 **비밀 키 파일(.key)과 비밀번호는 아무에게도(Claude 포함) 보내지 마세요.**
알려줄 것은 서버의 **공인 IP 주소**와 **서버 종류(Ampere / AMD)** 두 가지뿐입니다.

## 1. 가입 (처음 한 번)
1. https://www.oracle.com/cloud/free/ → **Start for free**.
2. **홈 리전(Home Region)은 `South Korea Central (Seoul)`**로 고릅니다.
   - 홈 리전은 나중에 바꿀 수 없고, 무료 서버는 홈 리전에서만 만들 수 있습니다.
   - 한국에서 하는 게임이라 서울이어야 지연이 짧습니다.
3. 카드 인증을 합니다(본인 확인용 소액 승인 후 취소, 무료 등급만 쓰면 요금이 나가지 않음).
4. 가입이 끝나면 계정은 **Always Free** 등급입니다. 유료 업그레이드를 누르지 않는 한 무료 자원만 쓸 수 있습니다.

## 2. 서버(인스턴스) 만들기
1. 왼쪽 위 메뉴 → **Compute → Instances → Create instance**.
2. Name: `pixel-murim`
3. **Image**: `Canonical Ubuntu 24.04` (Change image에서 고름)
4. **Shape** (Change shape):
   - 1순위: **Ampere → VM.Standard.A1.Flex**, OCPU 1, 메모리 6 GB (Always Free)
   - "Out of capacity(자원 부족)"가 뜨면: **Specialty and previous generation → VM.Standard.E2.1.Micro** (AMD, Always Free)
   - 어느 쪽이든 "Always Free-eligible" 표시가 있는지 확인합니다.
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
```bash
sudo iptables -I INPUT 6 -p udp --dport 47700 -j ACCEPT
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
- Always Free 서버도 **오래(7일 이상) 거의 안 쓰면** Oracle이 회수할 수 있다는 안내가 있습니다. 게임 서버가 켜져 있으면 보통 괜찮지만, 회수 안내 메일이 오면 알려주세요.

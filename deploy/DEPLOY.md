# Oracle 무료 VM 배포 가이드 (클라임 프렌즈 대시보드)

## 사전 준비
- Oracle Cloud 계정 (https://cloud.oracle.com 에서 "Start for free")
- 본인 명의 신용/체크카드 (해외결제 가능 카드 권장 — 1달러 테스트 후 자동 취소)
- GitHub 저장소 (아래 1번 참고)

---

## 1. GitHub에 코드 올리기 (로컬 PC에서)
```bash
cd "클라이밍대시보드 폴더"
git remote add origin https://github.com/<내아이디>/climb-friends.git
git push -u origin master
```
- GitHub 가입 후 새 저장소 생성 (이름 예: climb-friends)
- `.gitignore` 덕분에 비밀 파일(.env, DB)은 자동 제외됨

## 2. Oracle VM 생성 (콘솔에서)
1. 좌측 메뉴 → Compute → Instances → Create Instance
2. 옵션 추천:
   - Image: **Ubuntu 22.04** (또는 24.04)
   - Shape: **Always Free eligible** 표시된 것 (VM.Standard.E2.1.Micro 가장 무난)
   - SSH 키: "Generate a key pair" → **개인키(.key) 파일은 꼭 내 PC에 저장!**
3. 생성 완료 후 **Public IP address** 메모 (예: 140.228.x.x)

## 3. Oracle 방화벽(보안목록) 오픈 — 콘솔에서 클릭
1. 인스턴스 화면 → Subnet 클릭 → Security List → Add Ingress Rules
2. 규칙 추가: Source CIDR `0.0.0.0/0`, Protocol `TCP`, Destination Port `8000`

## 4. VM 접속 & 설치 (PC에서)
```bash
ssh -i 내개인키.key ubuntu@<공인IP>
```
접속 후, 배포 키트의 스크립트를 붙여넣거나:
```bash
# 로컬 PC에서 파일 전송
scp -i 내개인키.key deploy/setup_vm.sh ubuntu@<공인IP>:~

# VM에서 실행
bash setup_vm.sh https://github.com/<내아이디>/climb-friends.git
```

## 5. 확인
- 브라우저에서 `http://<공인IP>:8000` 접속
- 관리자 키 확인: VM에서 `cat /opt/climbfriends/.env`

## 6. 코드 수정 후 재배포 (로컬에서)
```bash
git add . && git commit -m "수정" && git push
# VM에서:
ssh -i 내개인키.key ubuntu@<공인IP> "cd /opt/climbfriends && git pull && sudo systemctl restart climbdash"
```

## 문제 해결
| 증상 | 원인/해결 |
|---|---|
| 가입 거부됨 | 카드 바꿔서 재시도 or Railway(유료)로 전환 |
| 접속 안 됨 (응답 없음) | 3번 보안목록 확인 + VM 내 `sudo ufw status` 확인 |
| 502/서버 꺼짐 | `sudo systemctl status climbdash`로 로그 확인 |
| 무료 VM 생성 버튼 비활성 | 해당 리전 용량 부족 → 리전 다르게 시도 |

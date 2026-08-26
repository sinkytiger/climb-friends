#!/bin/bash
# 클라임 프렌즈 대시보드 - Oracle VM(Ubuntu) 원클릭 설치 스크립트
# 사용법: bash setup_vm.sh <깃허브저장소URL>
set -e

REPO_URL="$1"
if [ -z "$REPO_URL" ]; then
  echo "사용법: bash setup_vm.sh https://github.com/아이디/저장소.git"
  exit 1
fi

echo "[1/6] 시스템 패키지 설치"
sudo apt update -y
sudo apt install -y python3-venv python3-pip git

echo "[2/6] 코드 다운로드"
sudo rm -rf /opt/climbfriends
sudo git clone "$REPO_URL" /opt/climbfriends
sudo chown -R $USER:$USER /opt/climbfriends
cd /opt/climbfriends

echo "[3/6] 파이썬 의존성 설치"
python3 -m venv venv
./venv/bin/pip install -q -r requirements.txt

echo "[4/6] 관리자 키 생성 (.env)"
if [ ! -f .env ]; then
  echo "ADMIN_KEY=$(openssl rand -hex 12)" | tee .env
fi

echo "[5/6] 방화벽 오픈 (8000 포트)"
sudo ufw allow 8000/tcp || true

echo "[6/6] 상시 실행 서비스 등록"
sudo tee /etc/systemd/system/climbdash.service > /dev/null <<EOF
[Unit]
Description=Climb Friends Dashboard
After=network.target

[Service]
User=$USER
WorkingDirectory=/opt/climbfriends
ExecStart=/opt/climbfriends/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now climbdash

echo ""
echo "========================================"
echo "설치 완료! 접속 주소: http://$(curl -s ifconfig.me):8000"
echo "관리자 키 확인: cat /opt/climbfriends/.env"
echo "========================================"

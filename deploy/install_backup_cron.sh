#!/bin/bash
# 백업 크론 설치 (매일 새벽 4시) + 서버 시간대를 한국으로 설정
set -e

sudo timedatectl set-timezone Asia/Seoul
chmod +x /opt/climbfriends/deploy/backup_db.sh

CRON_LINE="0 4 * * * /opt/climbfriends/deploy/backup_db.sh >> /opt/climbfriends/backups/backup.log 2>&1"
mkdir -p /opt/climbfriends/backups

TMP=$(mktemp)
crontab -l 2>/dev/null | grep -v 'backup_db.sh' > "$TMP" || true
echo "$CRON_LINE" >> "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "=== 설치된 크론 ==="
crontab -l
echo "=== 서버 시간 ==="
date

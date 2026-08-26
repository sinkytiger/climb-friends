#!/bin/bash
# 대시보드 DB 백업 (매일 새벽 자동 실행)
set -e

APP_DIR=/opt/climbfriends
BACKUP_DIR=$APP_DIR/backups
DB=$APP_DIR/data/dashboard.db
STAMP=$(date +%Y-%m-%d_%H%M)

mkdir -p "$BACKUP_DIR"

# 서비스가 켜져 있어도 안전하게 복사 (sqlite 백업 API 사용)
python3 - <<EOF
import sqlite3
src = sqlite3.connect("$DB")
dst = sqlite3.connect("$BACKUP_DIR/dashboard-$STAMP.db")
with dst:
    src.backup(dst)
dst.close()
src.close()
EOF

# 14일 지난 백업 삭제
find "$BACKUP_DIR" -name 'dashboard-*.db' -mtime +14 -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') 백업 완료: dashboard-$STAMP.db"

"""SQLite 데이터베이스 초기화 및 시드"""
import json
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "dashboard.db"
GYMS_JSON = DATA_DIR / "gyms.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS chains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS gyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(chain_id, name)
);
CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain_id INTEGER NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(chain_id, level)
);
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    no_rank INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    gym_id INTEGER NOT NULL REFERENCES gyms(id),
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('join', 'out')),
    UNIQUE(event_id, member_id)
);
CREATE TABLE IF NOT EXISTS clear_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    grade_level INTEGER NOT NULL,
    log_date TEXT NOT NULL,
    count INTEGER NOT NULL
);
"""

DEMO_MEMBERS = ["김철수", "박민수", "이지은", "정우진", "최유진"]


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def seed(conn):
    data = json.loads(GYMS_JSON.read_text(encoding="utf-8"))
    for chain in data["chains"]:
        cur = conn.execute("INSERT INTO chains(name) VALUES (?)", (chain["name"],))
        chain_id = cur.lastrowid
        for level, grade_name in enumerate(chain.get("grades", []), start=1):
            conn.execute(
                "INSERT INTO grades(chain_id, level, name) VALUES (?, ?, ?)",
                (chain_id, level, grade_name),
            )
        for gym_name in chain.get("gyms", []):
            conn.execute(
                "INSERT INTO gyms(chain_id, name) VALUES (?, ?)", (chain_id, gym_name)
            )
    for name in DEMO_MEMBERS:
        conn.execute("INSERT OR IGNORE INTO members(name) VALUES (?)", (name,))
    conn.commit()


def init_db():
    DATA_DIR.mkdir(exist_ok=True)
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(members)")]
        if "no_rank" not in cols:
            conn.execute("ALTER TABLE members ADD COLUMN no_rank INTEGER NOT NULL DEFAULT 0")
            conn.commit()
        if conn.execute("SELECT COUNT(*) AS n FROM chains").fetchone()["n"] == 0:
            seed(conn)
    finally:
        conn.close()

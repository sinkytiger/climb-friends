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
    no_rank INTEGER NOT NULL DEFAULT 0,
    birth_date TEXT
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
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gym_id INTEGER NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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
    seed_restaurants(conn)


SEED_RESTAURANTS = [
    ("알레", "혜화점", "히메카츠", "일식 돈카츠", "", 37.5717418, 126.9977031, "https://naver.me/5pwZm2Yq"),
    ("알레", "혜화점", "고봉당 혜화대학로본점", "등갈비", "등갈비는 보통, 인절미구이가 댑악", 37.5829392, 127.0001425, "https://naver.me/GV2tYj49"),
    ("알레", "혜화점", "온혜화", "밀크티", "테이크아웃만 가능", 37.5826171, 127.0030740, "https://naver.me/FHlgzdUx"),
    ("알레", "혜화점", "솔트24 혜화본점", "크로와상", "", 37.5817126, 127.0041249, "https://naver.me/xq3aeAf3"),
    ("크래커", "상봉점", "제철실비 외대앞점", "장어덮밥", "", 37.5954837, 127.0611478, "https://naver.me/F3EAVkSn"),
    ("크래커", "상봉점", "소주관", "전 메뉴", "", 37.5943359, 127.0897561, "https://naver.me/GvW21yJI"),
    ("서울숲", "잠실점", "쭈꾸미도사 잠실새내점", "쭈곱새", "", 37.5107795, 127.0823010, "https://naver.me/Gxk126PX"),
    ("클라이밍파크", "강남점", "멘츠루 강남점", "츠케멘", "강남권 공용 추천", 37.5020414, 127.0268531, "https://naver.me/I55amOAC"),
    ("알레", "강동점", "예월수족발명가 예가족발", "족발", "거리는 있지만 가서 먹을 만한 믿음", 37.5330170, 127.1387827, "https://naver.me/xa52FRwO"),
    ("손상원", "강남점", "웨인스베이글스 강남역점", "베이글+샌드위치", "", 37.4919460, 127.0288535, "https://naver.me/5vcHFMYN"),
    ("클라이밍파크", "강남점", "자갈치양곱창", "한우곱창구이", "", 37.4944988, 127.0308697, "https://naver.me/xHgIutF2"),
    ("클라이밍파크", "강남점", "뼈탄집 강남역점", "삼겹살", "", 37.4952168, 127.0309779, "https://naver.me/FoENCipm"),
    ("클라이밍파크", "강남점", "찬란한아구 강남본점", "아구찜", "아구찜 초보자 전용", 37.4948778, 127.0303648, "https://naver.me/FxFtVV71"),
    ("손상원", "을지로점", "가쯔야 무교본점", "일식 돈까스", "", 37.56782, 126.9817366, "https://naver.me/FtTh658H"),
    ("손상원", "을지로점", "한성양꼬치 종각점", "양꼬치", "", 37.5695618, 126.9843029, "https://naver.me/Gq84BTBp"),
    ("서울숲", "구로점", "아건 구디역점", "인도 커리", "", 37.4836067, 126.9009031, "https://naver.me/GG7tBjQw"),
]


def seed_restaurants(conn):
    if conn.execute("SELECT COUNT(*) AS n FROM restaurants").fetchone()["n"] > 0:
        return
    for chain_name, gym_name, name, cat, memo, lat, lng, link in SEED_RESTAURANTS:
        row = conn.execute(
            "SELECT g.id FROM gyms g JOIN chains c ON c.id=g.chain_id WHERE c.name=? AND g.name=?",
            (chain_name, gym_name),
        ).fetchone()
        if not row:
            continue
        conn.execute(
            "INSERT INTO restaurants(gym_id, name, category, memo, lat, lng, link) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (row["id"], name, cat, memo, lat, lng, link),
        )
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
        if "birth_date" not in cols:
            conn.execute("ALTER TABLE members ADD COLUMN birth_date TEXT")
            conn.commit()
        if conn.execute("SELECT COUNT(*) AS n FROM chains").fetchone()["n"] == 0:
            seed(conn)
        if not conn.execute("SELECT 1 FROM chains WHERE name='기타'").fetchone():
            conn.execute("INSERT INTO chains(name) VALUES ('기타')")
            conn.commit()
        for chain in json.loads(GYMS_JSON.read_text(encoding="utf-8"))["chains"]:
            row = conn.execute("SELECT id FROM chains WHERE name=?", (chain["name"],)).fetchone()
            if not row:
                cur = conn.execute("INSERT INTO chains(name) VALUES (?)", (chain["name"],))
                chain_id = cur.lastrowid
                for level, grade_name in enumerate(chain.get("grades", []), start=1):
                    conn.execute("INSERT INTO grades(chain_id, level, name) VALUES (?, ?, ?)", (chain_id, level, grade_name))
                for gym_name in chain.get("gyms", []):
                    conn.execute("INSERT INTO gyms(chain_id, name) VALUES (?, ?)", (chain_id, gym_name))
                conn.commit()
            else:
                chain_id = row["id"]
                existing_grades = conn.execute("SELECT COUNT(*) AS n FROM grades WHERE chain_id=?", (chain_id,)).fetchone()["n"]
                if existing_grades == 0 and chain.get("grades"):
                    for level, grade_name in enumerate(chain.get("grades", []), start=1):
                        conn.execute("INSERT INTO grades(chain_id, level, name) VALUES (?, ?, ?)", (chain_id, level, grade_name))
                    conn.commit()
                for gym_name in chain.get("gyms", []):
                    if not conn.execute("SELECT 1 FROM gyms WHERE chain_id=? AND name=?", (chain_id, gym_name)).fetchone():
                        conn.execute("INSERT INTO gyms(chain_id, name) VALUES (?, ?)", (chain_id, gym_name))
                conn.commit()
        cols_r = [r["name"] for r in conn.execute("PRAGMA table_info(restaurants)")]
        if "link" not in cols_r:
            pass
        if conn.execute("SELECT COUNT(*) AS n FROM restaurants").fetchone()["n"] == 0:
            seed_restaurants(conn)
    finally:
        conn.close()

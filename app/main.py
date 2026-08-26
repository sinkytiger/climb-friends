"""클라임 프렌즈 대시보드 API 서버"""
from datetime import date, datetime, timedelta

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.db import BASE_DIR, get_conn, init_db

init_db()
app = FastAPI(title="Climb Friends Dashboard")


def load_admin_key():
    env_path = BASE_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("ADMIN_KEY="):
                return line.split("=", 1)[1].strip()
    return ""


ADMIN_KEY = load_admin_key()


def is_local_request(request: Request) -> bool:
    host = (request.headers.get("host") or "").lower()
    return host.startswith("localhost") or host.startswith("127.0.0.1")


def check_admin(request: Request, x_admin_key: str = Header(default="")):
    if is_local_request(request):
        return
    if ADMIN_KEY and x_admin_key == ADMIN_KEY:
        return
    raise HTTPException(status_code=403, detail="관리자만 수정할 수 있습니다")


class EventIn(BaseModel):
    title: str = ""
    gym_id: int
    event_date: str
    start_time: str = ""
    memo: str = ""


class RsvpIn(BaseModel):
    member_id: int
    status: str


class MemberIn(BaseModel):
    name: str


class ClearIn(BaseModel):
    member_id: int
    gym_id: int
    grade_level: int
    log_date: str
    count: int


def period_range(period: str):
    today = date.today()
    if period == "quarter":
        q_start_month = 3 * ((today.month - 1) // 3) + 1
        start = today.replace(month=q_start_month, day=1)
        if q_start_month == 10:
            nxt = date(start.year + 1, 1, 1)
        else:
            nxt = date(start.year, q_start_month + 3, 1)
        return start.isoformat(), (nxt - timedelta(days=1)).isoformat()
    return None, None


def valid_date(value: str) -> bool:
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


@app.get("/api/bootstrap")
def bootstrap():
    conn = get_conn()
    chains = []
    for c in conn.execute("SELECT id, name FROM chains ORDER BY id"):
        chains.append(
            {
                "id": c["id"],
                "name": c["name"],
                "grades": [
                    {"level": g["level"], "name": g["name"]}
                    for g in conn.execute(
                        "SELECT level, name FROM grades WHERE chain_id=? ORDER BY level",
                        (c["id"],),
                    )
                ],
                "gyms": [
                    {"id": g["id"], "name": g["name"]}
                    for g in conn.execute(
                        "SELECT id, name FROM gyms WHERE chain_id=? ORDER BY id",
                        (c["id"],),
                    )
                ],
            }
        )
    members = [
        dict(r)
        for r in conn.execute(
            "SELECT id, name, no_rank FROM members ORDER BY name COLLATE NOCASE"
        )
    ]
    return {"chains": chains, "members": members}


@app.get("/api/events")
def list_events(year: int, month: int):
    prefix = f"{year:04d}-{month:02d}%"
    conn = get_conn()
    events = [
        dict(r)
        for r in conn.execute(
            """
            SELECT e.id, e.title, e.event_date, e.start_time, e.memo,
                   g.id AS gym_id, g.name AS gym_name,
                   c.id AS chain_id, c.name AS chain_name
            FROM events e
            JOIN gyms g ON g.id = e.gym_id
            JOIN chains c ON c.id = g.chain_id
            WHERE e.event_date LIKE ?
            ORDER BY e.event_date, e.start_time
            """,
            (prefix,),
        )
    ]
    counts = {}
    if events:
        ids = [e["id"] for e in events]
        qmarks = ",".join("?" * len(ids))
        for r in conn.execute(
            f"SELECT event_id, COUNT(*) AS n FROM rsvps WHERE status='join' AND event_id IN ({qmarks}) GROUP BY event_id",
            ids,
        ):
            counts[r["event_id"]] = r["n"]
    for e in events:
        e["attendees"] = counts.get(e["id"], 0)
    return {"events": events}


@app.get("/api/events/upcoming")
def upcoming_events(limit: int = 50):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT e.id, e.title, e.event_date, e.start_time, e.gym_id,
               g.name AS gym_name, c.name AS chain_name
        FROM events e
        JOIN gyms g ON g.id = e.gym_id
        JOIN chains c ON c.id = g.chain_id
        WHERE e.event_date >= date('now', 'localtime')
        ORDER BY e.event_date, e.start_time
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        n = conn.execute(
            "SELECT COUNT(*) AS n FROM rsvps WHERE event_id=? AND status='join'",
            (r["id"],),
        ).fetchone()["n"]
        d["attendees"] = n
        out.append(d)
    return {"events": out}


@app.get("/api/events/{event_id}")
def event_detail(event_id: int):
    conn = get_conn()
    ev = conn.execute(
        """
        SELECT e.*, g.name AS gym_name, c.id AS chain_id, c.name AS chain_name
        FROM events e
        JOIN gyms g ON g.id = e.gym_id
        JOIN chains c ON c.id = g.chain_id
        WHERE e.id = ?
        """,
        (event_id,),
    ).fetchone()
    if not ev:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")
    attendees = [
        dict(r)
        for r in conn.execute(
            """
            SELECT m.id, m.name FROM rsvps r
            JOIN members m ON m.id = r.member_id
            WHERE r.event_id = ? AND r.status = 'join'
            ORDER BY r.id
            """,
            (event_id,),
        )
    ]
    return {"event": dict(ev), "attendees": attendees}


@app.post("/api/events", dependencies=[Depends(check_admin)])
def create_event(ev: EventIn):
    if not valid_date(ev.event_date):
        raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD 입니다")
    conn = get_conn()
    if not conn.execute("SELECT 1 FROM gyms WHERE id=?", (ev.gym_id,)).fetchone():
        raise HTTPException(status_code=400, detail="암장이 올바르지 않습니다")
    cur = conn.execute(
        "INSERT INTO events(title, gym_id, event_date, start_time, memo) VALUES (?, ?, ?, ?, ?)",
        (ev.title, ev.gym_id, ev.event_date, ev.start_time, ev.memo),
    )
    conn.commit()
    return {"id": cur.lastrowid}


@app.put("/api/events/{event_id}", dependencies=[Depends(check_admin)])
def update_event(event_id: int, ev: EventIn):
    if not valid_date(ev.event_date):
        raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD 입니다")
    conn = get_conn()
    if not conn.execute("SELECT 1 FROM events WHERE id=?", (event_id,)).fetchone():
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")
    conn.execute(
        "UPDATE events SET title=?, gym_id=?, event_date=?, start_time=?, memo=? WHERE id=?",
        (ev.title, ev.gym_id, ev.event_date, ev.start_time, ev.memo, event_id),
    )
    conn.commit()
    return {"ok": True}


@app.delete("/api/events/{event_id}", dependencies=[Depends(check_admin)])
def delete_event(event_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM events WHERE id=?", (event_id,))
    conn.commit()
    return {"ok": True}


@app.post("/api/events/{event_id}/rsvp")
def rsvp(event_id: int, body: RsvpIn):
    if body.status not in ("join", "out"):
        raise HTTPException(status_code=400, detail="status는 join 또는 out 이어야 합니다")
    conn = get_conn()
    if not conn.execute("SELECT 1 FROM events WHERE id=?", (event_id,)).fetchone():
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다")
    if not conn.execute("SELECT 1 FROM members WHERE id=?", (body.member_id,)).fetchone():
        raise HTTPException(status_code=400, detail="멤버가 올바르지 않습니다")
    conn.execute(
        """
        INSERT INTO rsvps(event_id, member_id, status) VALUES (?, ?, ?)
        ON CONFLICT(event_id, member_id) DO UPDATE SET status=excluded.status
        """,
        (event_id, body.member_id, body.status),
    )
    conn.commit()
    return {"ok": True}


@app.get("/api/members")
def list_members():
    conn = get_conn()
    return {
        "members": [
            dict(r)
            for r in conn.execute(
                "SELECT id, name, no_rank FROM members ORDER BY name COLLATE NOCASE"
            )
        ]
    }


@app.post("/api/members", dependencies=[Depends(check_admin)])
def add_member(body: MemberIn):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="이름을 입력하세요")
    conn = get_conn()
    try:
        cur = conn.execute("INSERT INTO members(name) VALUES (?)", (name,))
        conn.commit()
    except Exception:
        raise HTTPException(status_code=400, detail="이미 존재하는 이름입니다")
    return {"id": cur.lastrowid}


@app.delete("/api/members/{member_id}", dependencies=[Depends(check_admin)])
def delete_member(member_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM members WHERE id=?", (member_id,))
    conn.commit()
    return {"ok": True}


class RankOptIn(BaseModel):
    no_rank: bool


@app.put("/api/members/{member_id}/rank", dependencies=[Depends(check_admin)])
def set_member_rank(member_id: int, body: RankOptIn):
    conn = get_conn()
    if not conn.execute("SELECT 1 FROM members WHERE id=?", (member_id,)).fetchone():
        raise HTTPException(status_code=404, detail="멤버를 찾을 수 없습니다")
    conn.execute(
        "UPDATE members SET no_rank=? WHERE id=?",
        (1 if body.no_rank else 0, member_id),
    )
    conn.commit()
    return {"ok": True}


@app.post("/api/clears", dependencies=[Depends(check_admin)])
def add_clear(body: ClearIn):
    if not valid_date(body.log_date):
        raise HTTPException(status_code=400, detail="날짜 형식은 YYYY-MM-DD 입니다")
    if body.count <= 0:
        raise HTTPException(status_code=400, detail="개수는 1 이상이어야 합니다")
    conn = get_conn()
    gym = conn.execute("SELECT chain_id FROM gyms WHERE id=?", (body.gym_id,)).fetchone()
    if not gym:
        raise HTTPException(status_code=400, detail="암장이 올바르지 않습니다")
    max_level = conn.execute(
        "SELECT MAX(level) AS m FROM grades WHERE chain_id=?", (gym["chain_id"],)
    ).fetchone()["m"]
    if max_level is None:
        raise HTTPException(status_code=400, detail="이 체인에는 등급이 등록되어 있지 않습니다")
    if not (1 <= body.grade_level <= max_level):
        raise HTTPException(status_code=400, detail=f"등급은 1~{max_level} 사이여야 합니다")
    if not conn.execute("SELECT 1 FROM members WHERE id=?", (body.member_id,)).fetchone():
        raise HTTPException(status_code=400, detail="멤버가 올바르지 않습니다")
    conn.execute(
        "INSERT INTO clear_logs(member_id, gym_id, grade_level, log_date, count) VALUES (?, ?, ?, ?, ?)",
        (body.member_id, body.gym_id, body.grade_level, body.log_date, body.count),
    )
    conn.commit()
    return {"ok": True}


@app.get("/api/clears/recent")
def recent_clears(limit: int = 10):
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT l.id, l.log_date, l.grade_level, l.count,
               m.name AS member_name, g.name AS gym_name, c.name AS chain_name
        FROM clear_logs l
        JOIN members m ON m.id = l.member_id
        JOIN gyms g ON g.id = l.gym_id
        JOIN chains c ON c.id = g.chain_id
        ORDER BY l.id DESC LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return {"logs": [dict(r) for r in rows]}


def _period_params(period: str):
    s, e = period_range(period)
    if s and e:
        return f" AND l.log_date BETWEEN ? AND ? ", [s, e]
    return " ", []


@app.get("/api/rankings/clears")
def rank_clears(period: str = "all", chain_id: int | None = None):
    cond, params = _period_params(period)
    chain_cond, chain_params = (" AND g.chain_id=? ", [chain_id]) if chain_id else (" ", [])
    conn = get_conn()
    rows = conn.execute(
        f"""
        SELECT m.id, m.name, SUM(l.count) AS total
        FROM clear_logs l
        JOIN members m ON m.id = l.member_id
        JOIN gyms g ON g.id = l.gym_id
        WHERE m.no_rank = 0 {cond} {chain_cond}
        GROUP BY m.id ORDER BY total DESC LIMIT 10
        """,
        params + chain_params,
    ).fetchall()
    return {"rows": [dict(r) for r in rows]}


@app.get("/api/rankings/attendance")
def rank_attendance(period: str = "all"):
    s, e = period_range(period)
    sql = """
        SELECT m.id, m.name, COUNT(*) AS cnt
        FROM rsvps r
        JOIN members m ON m.id = r.member_id
        JOIN events e ON e.id = r.event_id
        WHERE r.status='join' AND m.no_rank = 0
    """
    params = []
    if s and e:
        sql += " AND e.event_date BETWEEN ? AND ? "
        params = [s, e]
    sql += " GROUP BY m.id ORDER BY cnt DESC LIMIT 10"
    conn = get_conn()
    return {"rows": [dict(r) for r in conn.execute(sql, params)]}


@app.get("/api/rankings/grades")
def rank_grades(chain_id: int, period: str = "all"):
    cond, params = _period_params(period)
    conn = get_conn()
    grades = [
        dict(r)
        for r in conn.execute(
            "SELECT level, name FROM grades WHERE chain_id=? ORDER BY level", (chain_id,)
        )
    ]
    if not grades:
        return {"grades": [], "rows": []}
    rows = conn.execute(
        f"""
        SELECT m.id AS mid, m.name, l.grade_level, SUM(l.count) AS cnt
        FROM clear_logs l
        JOIN members m ON m.id = l.member_id
        JOIN gyms g ON g.id = l.gym_id
        WHERE g.chain_id = ? AND m.no_rank = 0 {cond}
        GROUP BY m.id, l.grade_level
        """,
        [chain_id] + params,
    ).fetchall()
    by_member = {}
    for r in rows:
        d = by_member.setdefault(r["mid"], {"name": r["name"], "counts": {}})
        d["counts"][r["grade_level"]] = r["cnt"]
    out = []
    for mid, d in by_member.items():
        counts = [int(d["counts"].get(lv, 0)) for lv in range(1, len(grades) + 1)]
        out.append({"member_id": mid, "name": d["name"], "counts": counts})
    out.sort(key=lambda x: list(reversed(x["counts"])), reverse=True)
    return {"grades": grades, "rows": out}


@app.get("/")
def root():
    return RedirectResponse("/static/index.html")


app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

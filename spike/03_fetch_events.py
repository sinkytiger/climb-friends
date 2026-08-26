"""3단계: 캘린더별 일정 조회 (오픈채팅방 일정이 보이는지 최종 판정)"""
import json
from datetime import datetime, timedelta, timezone

from kakao_api import BASE_DIR, api_get, setup_stdout, unique_calendars


def iso_utc(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_local(value):
    try:
        return (
            datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            .astimezone()
            .strftime("%m-%d %H:%M")
        )
    except ValueError:
        return str(value)


def fmt_time(event):
    t = event.get("time", {}) or {}
    label = f"{to_local(t.get('start_at', '?'))} ~ {to_local(t.get('end_at', '?'))}"
    if t.get("all_day"):
        label += " [종일]"
    return label


def main():
    setup_stdout()
    dump_path = BASE_DIR / "calendars_dump.json"
    if not dump_path.exists():
        raise SystemExit("calendars_dump.json 이 없습니다. 먼저 2_캘린더목록.bat 을 실행해 주세요.")

    dump = json.loads(dump_path.read_text(encoding="utf-8"))
    calendars = unique_calendars(dump)

    now = datetime.now(timezone.utc)
    date_range = {
        "from": iso_utc(now - timedelta(days=7)),
        "to": iso_utc(now + timedelta(days=90)),
        "limit": 100,
    }

    summary, all_events = [], {}
    raw_by_calendar = {}
    for cal in calendars:
        try:
            data = api_get("/v2/api/calendar/events", {"calendar_ids": cal["id"], **date_range})
        except SystemExit as exc:
            summary.append((cal["name"], f"조회 오류: {exc}"))
            continue
        events = data.get("events", []) or []
        raw_by_calendar[cal["id"]] = data
        all_events[cal["name"]] = events
        summary.append((cal["name"], len(events)))

    (BASE_DIR / "events_dump.json").write_text(
        json.dumps(raw_by_calendar, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("=" * 72)
    print("<캘린더별 일정 수 (최근 7일 ~ 향후 90일)>")
    print("=" * 72)
    for name, count in summary:
        print(f"  {name}: {count}")

    for name, events in all_events.items():
        if not events:
            continue
        print(f"\n[{name}]")
        for ev in events[:10]:
            title = ev.get("title") or "(제목 없음)"
            line = f"  - {title} | {fmt_time(ev)}"
            location = (ev.get("location") or {}).get("name", "")
            if location:
                line += f" | 장소: {location}"
            print(line)
        if len(events) > 10:
            print(f"  ... 외 {len(events) - 10}건")

    print("\n<판정 가이드>")
    print("1) 오픈채팅방 이름의 캘린더에서 방금 등록한 일정이 보인다면 -> 연동 성공!")
    print("   백엔드 동기화 엔진(10분 주기 수집) 구현으로 넘어가면 됩니다.")
    print("2) 어떤 캘린더에도 안 보인다면 -> 플랜 B(관리자 직접 등록 등)로 우회 설계합니다.")


if __name__ == "__main__":
    main()

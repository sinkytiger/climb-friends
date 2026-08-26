"""2단계: 내 계정의 모든 캘린더 조회 (오픈채팅방 캘린더 후보 찾기)"""
import json

from kakao_api import BASE_DIR, api_get, setup_stdout, unique_calendars

DEFAULT_HINTS = ("기본", "생일", "default")


def main():
    setup_stdout()
    data = api_get("/v2/api/calendar/calendars")
    (BASE_DIR / "calendars_dump.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    calendars = unique_calendars(data)

    if not calendars:
        raise SystemExit("[실패] 캘린더를 하나도 못 찾았습니다. calendars_dump.json 을 열어 확인하세요.")

    print(f"총 {len(calendars)}개의 캘린더를 찾았습니다.\n")
    print("-" * 72)
    for idx, cal in enumerate(calendars, 1):
        tag = "(기본)" if any(h in str(cal["name"]) for h in DEFAULT_HINTS) else ""
        print(f"{idx:>2}. {cal['name']} {tag}")
        print(f"     id: {cal['id']}")
    print("-" * 72)

    if len(calendars) == 1:
        print("\n[주의] 기본 캘린더만 있습니다.")
        print("오픈채팅방 캘린더가 목록에 없다면 API 미노출 가능성이 큽니다.")
    else:
        print("\n[확인] 위 목록에서 오픈채팅방 이름과 같은 캘린더가 있는지 찾아보세요.")
    print("다음 단계: 채팅방에서 테스트 일정 1건 등록 후 -> 3_일정조회.bat 실행")


if __name__ == "__main__":
    main()

"""카카오 톡캘린더 API 공통 함수"""
import json
import sys
import time
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
TOKENS_PATH = BASE_DIR / "tokens.json"

AUTH_BASE = "https://kauth.kakao.com"
API_BASE = "https://kapi.kakao.com"


def setup_stdout():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def load_dotenv(path):
    values = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        values[name.strip()] = value.strip().strip('"').strip("'")
    return values


def load_config():
    env = load_dotenv(BASE_DIR / ".env")
    key = env.get("KAKAO_REST_API_KEY", "")
    redirect = env.get("KAKAO_REDIRECT_URI", "")
    if not key or "입력" in key:
        cfg = {}
        if CONFIG_PATH.exists():
            try:
                cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            except ValueError:
                pass
        key = key or str(cfg.get("rest_api_key", ""))
        redirect = redirect or str(cfg.get("redirect_uri", ""))
    if not key or "입력" in key:
        raise SystemExit("[실패] .env 의 KAKAO_REST_API_KEY 에 카카오 REST API 키를 입력해 주세요.")
    return {
        "rest_api_key": key,
        "redirect_uri": redirect or "http://localhost:8080/oauth",
        "client_secret": env.get("KAKAO_CLIENT_SECRET", ""),
    }


def load_tokens():
    if not TOKENS_PATH.exists():
        raise SystemExit("[실패] tokens.json 이 없습니다. 먼저 1_카카오로그인.bat 을 실행해 주세요.")
    return json.loads(TOKENS_PATH.read_text(encoding="utf-8"))


def save_tokens(tokens):
    tokens = dict(tokens)
    if "expires_in" in tokens:
        tokens["expires_at"] = int(time.time()) + int(tokens["expires_in"])
    TOKENS_PATH.write_text(json.dumps(tokens, ensure_ascii=False, indent=2), encoding="utf-8")


def request_new_tokens(config, grant_type, extra):
    payload = {"grant_type": grant_type, "client_id": config["rest_api_key"]}
    if config.get("client_secret"):
        payload["client_secret"] = config["client_secret"]
    payload.update(extra)
    res = requests.post(
        f"{AUTH_BASE}/oauth/token",
        headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
        data=payload,
        timeout=15,
    )
    try:
        body = res.json()
    except ValueError:
        body = {}
    if res.status_code != 200:
        hints = {
            "invalid_client": " -> REST API 키 확인, 또는 콘솔에서 클라이언트 시크릿 사용중이면 .env 의 KAKAO_CLIENT_SECRET 에 값을 넣으세요.",
            "invalid_grant": " -> 인가 코드가 만료되었습니다. 스크립트를 다시 실행하세요.",
            "KOE009": " -> Redirect URI 가 카카오 콘솔에 등록된 것과 다릅니다.",
            "KOE32019": " -> 앱의 카카오로그인이 비활성 상태입니다. 콘솔에서 ON 하세요.",
        }
        hint = hints.get(body.get("error", ""), "")
        raise SystemExit(f"[실패] 토큰 발급 오류 ({res.status_code}): {res.text[:300]}{hint}")
    return body


def refresh_access_token(config):
    tokens = load_tokens()
    new_tokens = request_new_tokens(
        config, "refresh_token", {"refresh_token": tokens["refresh_token"]}
    )
    merged = {**tokens, **new_tokens}
    save_tokens(merged)
    print("[OK] Access Token 자동 갱신 완료")
    return merged


def get_valid_access_token(config):
    tokens = load_tokens()
    if time.time() < float(tokens.get("expires_at", 0)) - 30:
        return tokens["access_token"]
    return refresh_access_token(config)["access_token"]


def api_get(path, params=None):
    config = load_config()
    token = get_valid_access_token(config)
    res = requests.get(
        f"{API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=20,
    )
    if res.status_code == 401:
        token = refresh_access_token(config)["access_token"]
        res = requests.get(
            f"{API_BASE}{path}",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=20,
        )
    if res.status_code != 200:
        raise SystemExit(f"[실패] API 오류 ({res.status_code}): {res.text[:300]}")
    return res.json()


def walk_collect(node, found):
    """JSON 어디 있든 id 와 name 을 가진 객체(=캘린더)를 모두 수집"""
    if isinstance(node, dict):
        if "id" in node and "name" in node:
            found.append(node)
        for value in node.values():
            walk_collect(value, found)
    elif isinstance(node, list):
        for value in node:
            walk_collect(value, found)


def unique_calendars(data):
    found, seen, result = [], set(), []
    walk_collect(data, found)
    for cal in found:
        if cal["id"] not in seen:
            seen.add(cal["id"])
            result.append(cal)
    return result

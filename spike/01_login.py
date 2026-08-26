"""1단계: 카카오 로그인 후 tokens.json 생성"""
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

from kakao_api import (
    AUTH_BASE,
    load_config,
    request_new_tokens,
    save_tokens,
    setup_stdout,
)


class CallbackHandler(BaseHTTPRequestHandler):
    query = None

    def do_GET(self):
        CallbackHandler.query = parse_qs(urlparse(self.path).query)
        ok = "error" not in CallbackHandler.query
        if ok:
            body = "<h2>로그인 성공! 이 창을 닫고 콘솔을 확인하세요.</h2>"
        else:
            desc = CallbackHandler.query.get("error_description", ["알 수 없는 오류"])[0]
            body = f"<h2>로그인 실패: {desc}</h2>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, *args):
        pass


def main():
    setup_stdout()
    config = load_config()
    port = urlparse(config["redirect_uri"]).port or 80

    auth_url = (
        f"{AUTH_BASE}/oauth/authorize?"
        + urlencode(
            {
                "response_type": "code",
                "client_id": config["rest_api_key"],
                "redirect_uri": config["redirect_uri"],
                "scope": "talk_calendar",
                "prompt": "consent",
            }
        )
    )

    try:
        server = HTTPServer(("127.0.0.1", port), CallbackHandler)
    except OSError:
        raise SystemExit(f"[실패] {port} 번 포트가 이미 사용 중입니다. 해당 프로그램을 종료하고 다시 실행하세요.")

    server.timeout = 1
    print("브라우저에서 카카오 로그인 창을 엽니다...")
    print("(브라우저가 안 열리면 아래 주소를 직접 복사해서 여세요)")
    print(auth_url)
    webbrowser.open(auth_url)
    print("\n로그인과 '톡캘린더' 동의를 완료하면 자동으로 진행됩니다...")

    deadline = time.time() + 600
    while CallbackHandler.query is None and time.time() < deadline:
        server.handle_request()
    server.server_close()

    if CallbackHandler.query is None:
        raise SystemExit("[실패] 10분 안에 로그인이 완료되지 않았습니다. 다시 실행해 주세요.")

    if "error" in CallbackHandler.query:
        desc = CallbackHandler.query.get("error_description", ["알 수 없는 오류"])[0]
        raise SystemExit(f"[실패] 로그인 거부됨: {desc}")

    code = CallbackHandler.query["code"][0]
    tokens = request_new_tokens(
        config, "authorization_code", {"code": code, "redirect_uri": config["redirect_uri"]}
    )
    save_tokens(tokens)
    print("\n[OK] 로그인 완료! tokens.json 저장했습니다.")
    print("다음 단계: 2_캘린더목록.bat 실행")


if __name__ == "__main__":
    main()

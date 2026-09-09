"""
main.py의 전역 예외 핸들러 테스트.

CORS가 모든 origin을 허용하는(allow_origins=["*"]) 공개 API이므로,
처리되지 않은 예외가 클라이언트에게 서버 내부 스택 트레이스(파일 경로,
호출 스택)를 그대로 노출하면 안 된다.
"""
import asyncio

from starlette.requests import Request

import main as main_mod


def test_unhandled_exception_handler_does_not_leak_stack_trace_to_client():
    # 회귀: 예전엔 응답 바디에 traceback.format_exc()의 전체 내용(이 저장소의
    # 절대 파일 경로, 호출 스택 등)을 그대로 실어 보냈다 — 여기서 재발을 잡는다.
    scope = {"type": "http", "method": "GET", "path": "/x", "headers": []}
    request = Request(scope)

    resp = asyncio.get_event_loop().run_until_complete(
        main_mod.unhandled_exception_handler(request, RuntimeError("forced failure for test"))
    )
    body = resp.body.decode()

    assert resp.status_code == 500
    assert "traceback" not in body.lower()
    assert "main.py" not in body       # 소스 파일 경로가 새면 안 됨
    assert "line " not in body.lower() # 스택 프레임 라인 정보가 새면 안 됨
    assert "RuntimeError" in body      # 예외 종류 정도는 알려줘도 무방

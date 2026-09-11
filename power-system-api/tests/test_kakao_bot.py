"""
카카오봇 웹훅 라우터(routers/kakao_bot.py) 단위/통합 테스트.

user_context는 모듈 전역 딕셔너리라 테스트끼리 서로 오염되지 않도록
각 테스트는 고유한 user_id를 쓰거나 clear_context로 정리한다.
"""
import pytest
from fastapi.testclient import TestClient

from main import app
from routers import kakao_bot
from routers.kakao_bot import (
    save_context, load_context, clear_context, merge_context,
    kakao_text, kakao_text_with_context_replies, kakao_image_response,
    _context_qr, RECALC_KEYWORDS, RESET_KEYWORDS,
)

client = TestClient(app)


def kakao_payload(utterance: str, user_id: str = "test-user") -> dict:
    return {"userRequest": {"utterance": utterance, "user": {"id": user_id}}}


@pytest.fixture(autouse=True)
def no_gemini_key(monkeypatch):
    """테스트 환경에 실제 API 키가 없다고 가정하고 명시적으로 고정 —
    로컬에 우연히 환경변수가 설정돼 있어도 네트워크 호출 없이 결정적으로 동작."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)


# ── 컨텍스트 저장소 ────────────────────────────────────────────────────────────
def test_save_and_load_context_roundtrip():
    clear_context("ctx-1")
    save_context("ctx-1", "cable", {"voltage_v": 380, "power_kw": 75})
    assert load_context("ctx-1") == {
        "query_type": "cable",
        "params": {"voltage_v": 380, "power_kw": 75},
    }


def test_load_context_missing_user_returns_empty_dict():
    clear_context("never-seen-user")
    assert load_context("never-seen-user") == {}


def test_save_context_drops_none_valued_params():
    clear_context("ctx-2")
    save_context("ctx-2", "cable", {"voltage_v": 380, "power_kw": None})
    assert "power_kw" not in load_context("ctx-2")["params"]


def test_clear_context_removes_user():
    save_context("ctx-3", "cable", {"voltage_v": 380})
    clear_context("ctx-3")
    assert load_context("ctx-3") == {}


def test_save_context_evicts_oldest_user_when_full(monkeypatch):
    """MAX_USERS를 채우면 가장 오래된 유저부터 밀려나야 한다 (메모리 무한 증가 방지)."""
    monkeypatch.setattr(kakao_bot, "user_context", {})
    monkeypatch.setattr(kakao_bot, "MAX_USERS", 2)

    save_context("old", "cable", {"voltage_v": 1})
    save_context("mid", "cable", {"voltage_v": 2})
    save_context("new", "cable", {"voltage_v": 3})   # 이 시점에 'old'가 밀려나야 함

    assert load_context("old") == {}
    assert load_context("mid") != {}
    assert load_context("new") != {}


# ── merge_context ─────────────────────────────────────────────────────────────
def test_merge_context_first_message_has_no_previous_context():
    clear_context("m-first")
    qtype, params = merge_context("m-first", "cable", {"voltage_v": 380, "power_kw": 75})
    assert qtype == "cable"
    assert params == {"voltage_v": 380, "power_kw": 75}


def test_merge_context_same_type_partial_update_keeps_old_values():
    clear_context("m-partial")
    save_context("m-partial", "cable", {
        "voltage_v": 380, "power_kw": 75, "distance_m": 150, "install_method": "duct",
    })
    qtype, params = merge_context("m-partial", "cable", {"install_method": "ground"})

    assert qtype == "cable"
    assert params["voltage_v"] == 380          # 이전 값 유지
    assert params["power_kw"] == 75            # 이전 값 유지
    assert params["install_method"] == "ground"  # 새 값으로 덮어씀


def test_merge_context_same_type_fresh_query_keeps_secondary_params_only():
    """같은 유형의 완전히 새로운 계산이면 거리 등 1차 값은 버리고,
    설치방법·역률 같은 부가 정보만 이어받는다."""
    clear_context("m-fresh")
    save_context("m-fresh", "cable", {
        "voltage_v": 380, "power_kw": 75, "distance_m": 999,
        "install_method": "ground", "power_factor": 0.9,
    })
    qtype, params = merge_context("m-fresh", "cable", {"voltage_v": 22900, "power_kw": 500})

    assert qtype == "cable"
    assert params["voltage_v"] == 22900
    assert params["power_kw"] == 500
    assert "distance_m" not in params            # 예전 거리값은 새 계산에 안 들고 옴
    assert params["install_method"] == "ground"  # 부가 정보는 유지
    assert params["power_factor"] == 0.9


def test_merge_context_topic_change_with_missing_required_does_not_reuse_old_type():
    """회귀 테스트: 케이블 얘기 중 "변압기 효율은?"처럼 유형이 바뀐 메시지에
    필수 파라미터가 없으면, 예전엔 완전히 무관한 이전 유형·파라미터로 조용히
    계산해버렸다(케이블 얘기하다 변압기를 물었는데 케이블 결과가 나옴).
    유형이 바뀌었다면 새 유형으로 넘어가되(파라미터 부족은 그 유형 자체의
    안내 문구가 처리하게) 예전 무관한 파라미터를 섞으면 안 된다."""
    clear_context("m-switch")
    save_context("m-switch", "cable", {
        "voltage_v": 380, "power_kw": 75, "distance_m": 150, "install_method": "duct",
    })
    qtype, params = merge_context("m-switch", "transformer", {"install_method": "duct", "phases": 3})

    assert qtype == "transformer"          # 케이블이 아니라 새로 감지된 유형이어야 함
    assert "voltage_v" not in params       # 케이블 전압이 변압기 계산에 섞이면 안 됨
    assert "distance_m" not in params


def test_merge_context_topic_change_with_complete_params_just_switches():
    clear_context("m-switch2")
    save_context("m-switch2", "cable", {"voltage_v": 380, "power_kw": 75})
    qtype, params = merge_context("m-switch2", "shortcircuit", {"voltage_v": 22900, "sc_mva": 1000})

    assert qtype == "shortcircuit"
    assert params == {"voltage_v": 22900, "sc_mva": 1000}


# ── 카카오 응답 포맷 ───────────────────────────────────────────────────────────
def test_kakao_text_default_quick_replies_present():
    resp = kakao_text("결과 텍스트")
    assert resp["template"]["outputs"] == [{"simpleText": {"text": "결과 텍스트"}}]
    assert len(resp["template"]["quickReplies"]) == 4


def test_kakao_text_custom_quick_replies_override_default():
    custom = [{"label": "x", "action": "message", "messageText": "y"}]
    resp = kakao_text("t", quick_replies=custom)
    assert resp["template"]["quickReplies"] == custom


def test_context_qr_known_type_includes_web_link_button():
    qr = _context_qr("cable")
    assert any(item.get("action") == "webLink" for item in qr)
    assert qr[0]["label"] == "거리 2배로"


def test_context_qr_unknown_type_falls_back_to_default():
    qr = _context_qr("motor")   # label_map에 없는 유형
    labels = [item["label"] for item in qr]
    assert "다시 계산" in labels
    assert "도움말" in labels


def test_kakao_text_with_context_replies_uses_type_specific_quick_replies():
    resp = kakao_text_with_context_replies("t", "shortcircuit")
    labels = [q["label"] for q in resp["template"]["quickReplies"]]
    assert "변압기 선정" in labels


# ── 차트 포함 응답 (kakao_image_response) ─────────────────────────────────────
def test_kakao_image_response_falls_back_to_text_when_chart_fails(monkeypatch):
    def boom(params):
        raise RuntimeError("차트 생성 실패 시뮬레이션")
    monkeypatch.setattr("services.chart.cable_chart", boom)

    resp = kakao_image_response("결과", "cable", {"voltage_v": 380, "power_kw": 75})
    outputs = resp["template"]["outputs"]
    assert outputs == [{"simpleText": {"text": "결과"}}]   # 이미지 없이 텍스트만


def test_kakao_image_response_includes_image_when_chart_succeeds(monkeypatch):
    monkeypatch.setattr("services.chart.cable_chart", lambda params: b"\x89PNG-fake-bytes")

    resp = kakao_image_response("결과", "cable", {"voltage_v": 380, "power_kw": 75})
    outputs = resp["template"]["outputs"]
    assert "simpleImage" in outputs[0]
    assert outputs[1] == {"simpleText": {"text": "결과"}}
    assert outputs[0]["simpleImage"]["imageUrl"].startswith("https://ai-poweranalysis.onrender.com/kakao/image/")


def test_kakao_image_response_no_chart_for_params_missing_required_fields():
    """차트를 그릴 만큼 파라미터가 안 갖춰졌으면(예: voltage_v 없음) 조용히 텍스트만."""
    resp = kakao_image_response("결과", "cable", {})
    assert resp["template"]["outputs"] == [{"simpleText": {"text": "결과"}}]


# ── 웹훅 엔드포인트 (엔드투엔드) ───────────────────────────────────────────────
def test_webhook_empty_utterance_returns_welcome():
    r = client.post("/kakao/webhook", json=kakao_payload(""))
    assert r.status_code == 200
    assert "PowerFlow 전기 계산 챗봇입니다" in r.json()["template"]["outputs"][0]["simpleText"]["text"]


def test_webhook_help_keyword_returns_help_text():
    r = client.post("/kakao/webhook", json=kakao_payload("도움말"))
    assert "케이블 선정" in r.json()["template"]["outputs"][0]["simpleText"]["text"]


def test_webhook_reset_keyword_clears_context():
    user = "webhook-reset-user"
    client.post("/kakao/webhook", json=kakao_payload("380V 75kW 거리 150m", user))
    assert load_context(user) != {}

    r = client.post("/kakao/webhook", json=kakao_payload("초기화", user))
    assert "초기화됐습니다" in r.json()["template"]["outputs"][0]["simpleText"]["text"]
    assert load_context(user) == {}


def test_webhook_full_cable_query_returns_calculation():
    user = "webhook-cable-user"
    clear_context(user)
    r = client.post("/kakao/webhook", json=kakao_payload("380V 75kW 거리 150m 전압강하 3%", user))
    text = r.json()["template"]["outputs"][-1]["simpleText"]["text"]
    assert "케이블 선정 결과" in text
    assert load_context(user)["query_type"] == "cable"


def test_webhook_recalc_without_history_prompts_for_input():
    user = "webhook-recalc-empty-user"
    clear_context(user)
    r = client.post("/kakao/webhook", json=kakao_payload("다시 계산해줘", user))
    assert "이전 계산 기록이 없습니다" in r.json()["template"]["outputs"][0]["simpleText"]["text"]


def test_webhook_recalc_with_history_reuses_same_context():
    user = "webhook-recalc-user"
    clear_context(user)
    client.post("/kakao/webhook", json=kakao_payload("380V 75kW 거리 150m 전압강하 3%", user))
    ctx_before = load_context(user)

    r = client.post("/kakao/webhook", json=kakao_payload("다시 계산해줘", user))
    assert r.status_code == 200
    assert load_context(user) == ctx_before   # 재계산은 컨텍스트를 바꾸지 않아야 함


def test_webhook_topic_switch_does_not_leak_previous_type_end_to_end():
    """merge_context 회귀 테스트의 엔드투엔드 버전 — 웹훅 레벨에서도 재현되는지 확인."""
    user = "webhook-switch-user"
    clear_context(user)
    client.post("/kakao/webhook", json=kakao_payload("380V 75kW 거리 150m", user))

    r = client.post("/kakao/webhook", json=kakao_payload("변압기 효율이 궁금해요", user))
    text = r.json()["template"]["outputs"][0]["simpleText"]["text"]
    assert "케이블" not in text
    assert load_context(user)["query_type"] == "transformer"


def test_webhook_image_message_without_gemini_key_reports_recognition_failure():
    user = "webhook-image-user"
    clear_context(user)
    r = client.post(
        "/kakao/webhook",
        json=kakao_payload("http://example.com/nameplate.jpg", user),
    )
    assert "명판 인식 실패" in r.json()["template"]["outputs"][0]["simpleText"]["text"]


def test_webhook_unexpected_exception_returns_friendly_error_not_500(monkeypatch):
    """파싱 단계에서 예상 못 한 예외가 나도 500을 그대로 던지지 말고
    사용자에게 안내 문구로 감싸 반환해야 한다."""
    def boom(text):
        raise RuntimeError("강제 오류")
    monkeypatch.setattr("routers.kakao_bot.smart_parse", boom)

    r = client.post("/kakao/webhook", json=kakao_payload("380V 75kW", "webhook-error-user"))
    assert r.status_code == 200
    assert "오류가 발생했습니다" in r.json()["template"]["outputs"][0]["simpleText"]["text"]


def test_webhook_health_reports_gemini_key_status():
    r = client.get("/kakao/health")
    body = r.json()
    assert body["status"] == "ok"
    assert body["gemini_key_set"] is False   # 이 테스트 환경엔 키가 없음(fixture로 보장)


def test_webhook_health_never_leaks_gemini_key_value(monkeypatch):
    """회귀: /kakao/health는 인증 없이 누구나 호출 가능한 공개 엔드포인트다 —
    예전엔 gemini_key_preview로 실제 키의 앞 6글자를 그대로 돌려줘서, 키가
    설정됐는지 여부를 넘어 진짜 비밀값 일부가 새고 있었다."""
    monkeypatch.setenv("GEMINI_API_KEY", "sk-super-secret-value-12345")

    r = client.get("/kakao/health")
    body = r.json()

    assert body["gemini_key_set"] is True
    assert "gemini_key_preview" not in body
    assert "sk-super-secret-value-12345" not in r.text
    assert "sk-supe" not in r.text   # 앞 6글자조차 응답에 없어야 함


@pytest.mark.parametrize("keyword", RECALC_KEYWORDS)
def test_all_recalc_keywords_trigger_recalc_path(keyword):
    user = f"recalc-kw-{hash(keyword)}"
    clear_context(user)
    client.post("/kakao/webhook", json=kakao_payload("380V 75kW 거리 150m", user))
    r = client.post("/kakao/webhook", json=kakao_payload(keyword, user))
    # 재계산 경로를 탔다면 새 조건 입력 안내가 아니라 실제 계산 결과가 나와야 함
    # (계산 성공 시 차트 이미지가 outputs[0]에 붙을 수 있어 텍스트는 항상 마지막 output)
    assert "이전 계산 기록이 없습니다" not in r.json()["template"]["outputs"][-1]["simpleText"]["text"]


@pytest.mark.parametrize("keyword", RESET_KEYWORDS)
def test_all_reset_keywords_clear_context(keyword):
    user = f"reset-kw-{hash(keyword)}"
    save_context(user, "cable", {"voltage_v": 380})
    client.post("/kakao/webhook", json=kakao_payload(keyword, user))
    assert load_context(user) == {}


# ── 콜백(비동기) 응답 경로 ─────────────────────────────────────────────────────
# 카카오 스킬에 "콜백 사용"이 켜져 있으면 요청에 userRequest.callbackUrl이
# 실려온다. Render 무료 티어 콜드 스타트·Gemini 호출이 5초를 넘겨도 카카오가
# 무응답 처리하지 않도록, 이 경우엔 즉시 useCallback 확인 응답만 보내고
# 실제 계산 결과는 백그라운드에서 그 URL로 별도 POST해야 한다.
def kakao_payload_with_callback(utterance: str, user_id: str, callback_url: str) -> dict:
    return {"userRequest": {"utterance": utterance, "user": {"id": user_id}, "callbackUrl": callback_url}}


class _FakeCallbackClient:
    """httpx.AsyncClient를 대신해 POST 호출을 기록만 하는 가짜 클라이언트."""
    calls: list[tuple[str, dict]] = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, **kwargs):
        _FakeCallbackClient.calls.append((url, json))

        class _Resp:
            status_code = 200
            text = "ok"
        return _Resp()


@pytest.fixture
def fake_callback_client(monkeypatch):
    _FakeCallbackClient.calls = []
    monkeypatch.setattr(kakao_bot.httpx, "AsyncClient", _FakeCallbackClient)
    return _FakeCallbackClient


def test_webhook_with_callback_url_acks_immediately(fake_callback_client):
    user = "callback-user-1"
    clear_context(user)
    r = client.post("/kakao/webhook", json=kakao_payload_with_callback(
        "380V 75kW 거리 150m 케이블 선정", user, "https://kapi.kakao.com/fake-callback-1",
    ))
    assert r.status_code == 200
    body = r.json()
    assert body["useCallback"] is True
    assert "template" not in body   # 즉시 응답은 확인용이지, 실제 계산 결과가 아니어야 함


def test_webhook_with_callback_url_posts_real_result_to_callback(fake_callback_client):
    # 회귀: 콜백 경로도 동기 경로(build_kakao_response)와 똑같은 계산 결과를
    # 만들어야 한다 — 그냥 확인 응답만 보내고 실제 결과를 빠뜨리면 안 됨.
    user = "callback-user-2"
    clear_context(user)
    client.post("/kakao/webhook", json=kakao_payload_with_callback(
        "22.9kV 계통 1000MVA 단락전류 계산", user, "https://kapi.kakao.com/fake-callback-2",
    ))

    assert len(fake_callback_client.calls) == 1
    url, sent_body = fake_callback_client.calls[0]
    assert url == "https://kapi.kakao.com/fake-callback-2"
    texts = [o["simpleText"]["text"] for o in sent_body["template"]["outputs"] if "simpleText" in o]
    assert any("Ik''" in t for t in texts)


def test_webhook_without_callback_url_stays_synchronous(fake_callback_client):
    """callbackUrl이 없으면(콜백 미설정 스킬) 예전처럼 즉시 계산 결과를 응답해야 하고,
    콜백 POST는 전혀 일어나지 않아야 한다."""
    user = "no-callback-user"
    clear_context(user)
    r = client.post("/kakao/webhook", json=kakao_payload("22.9kV 계통 1000MVA 단락전류 계산", user))

    assert "useCallback" not in r.json()
    texts = [o["simpleText"]["text"] for o in r.json()["template"]["outputs"] if "simpleText" in o]
    assert any("Ik''" in t for t in texts)
    assert fake_callback_client.calls == []


def test_webhook_callback_path_reports_friendly_error_on_exception(fake_callback_client, monkeypatch):
    """콜백 백그라운드 처리 중 예외가 나도, 아무 응답 없이 사라지는 대신
    친절한 오류 메시지를 callbackUrl로 보내야 한다."""
    def boom(*args, **kwargs):
        raise RuntimeError("forced failure for test")
    monkeypatch.setattr(kakao_bot, "smart_parse", boom)

    user = "callback-error-user"
    clear_context(user)
    client.post("/kakao/webhook", json=kakao_payload_with_callback(
        "380V 75kW", user, "https://kapi.kakao.com/fake-callback-3",
    ))

    assert len(fake_callback_client.calls) == 1
    _, sent_body = fake_callback_client.calls[0]
    assert "오류가 발생했습니다" in sent_body["template"]["outputs"][0]["simpleText"]["text"]

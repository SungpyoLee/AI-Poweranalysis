"""
카카오봇 명판 인식(services/vision.py) 단위 테스트.

Gemini Vision을 실제로 호출하는 recognize_nameplate()/download_image()는
네트워크·API 키가 필요해 단위 테스트 대상에서 제외한다. 대신 그 결과를
소비/가공하는 순수 함수(extract_image_url, nameplate_to_params,
format_nameplate_result)를 검증한다 — 카카오 오픈빌더 페이로드 구조가
버전마다 달라 이미지 URL을 못 찾는 문제가 과거 실제 장애로 있었던 부분.
"""
from services.vision import (
    extract_image_url,
    nameplate_to_params,
    format_nameplate_result,
)


# ── extract_image_url: 카카오 페이로드의 다양한 이미지 위치 ───────────────────
def test_extract_image_url_from_action_params():
    body = {"action": {"params": {"imageUrl": "http://example.com/x.jpg"}}}
    assert extract_image_url(body) == "http://example.com/x.jpg"


def test_extract_image_url_from_detail_params_dict_value():
    body = {"action": {"detailParams": {"sys.photo": {"value": "http://example.com/y.png"}}}}
    assert extract_image_url(body) == "http://example.com/y.png"


def test_extract_image_url_from_detail_params_plain_string():
    body = {"action": {"detailParams": {"image": "http://example.com/y2.png"}}}
    assert extract_image_url(body) == "http://example.com/y2.png"


def test_extract_image_url_from_user_request_media():
    body = {"userRequest": {"params": {"media": {"type": "image", "url": "http://cdn.example.com/z.jpg"}}}}
    assert extract_image_url(body) == "http://cdn.example.com/z.jpg"


def test_extract_image_url_from_user_request_params_direct():
    body = {"userRequest": {"params": {"secureImage": "http://example.com/w.jpg"}}}
    assert extract_image_url(body) == "http://example.com/w.jpg"


def test_extract_image_url_from_utterance_direct_link():
    body = {"userRequest": {"utterance": "http://example.com/direct.png"}}
    assert extract_image_url(body) == "http://example.com/direct.png"


def test_extract_image_url_recursive_fallback_by_extension():
    body = {"someWeirdKey": {"nested": ["irrelevant", "https://unknown.example/pic.webp"]}}
    assert extract_image_url(body) == "https://unknown.example/pic.webp"


def test_extract_image_url_recursive_fallback_by_kakao_domain():
    """확장자가 없어도 카카오 CDN 도메인이면 이미지로 간주해야 한다 (실제 카카오 응답이 이런 형태)."""
    body = {"foo": {"bar": "https://k.kakaocdn.net/dna/abcd1234"}}
    assert extract_image_url(body) == "https://k.kakaocdn.net/dna/abcd1234"


def test_extract_image_url_returns_none_when_no_image_present():
    body = {"userRequest": {"utterance": "그냥 텍스트 메시지입니다"}}
    assert extract_image_url(body) is None


def test_extract_image_url_prefers_action_params_over_later_branches():
    """여러 위치에 이미지 후보가 있으면 우선순위가 높은(문서상 가장 확실한) 위치를 써야 한다."""
    body = {
        "action": {"params": {"imageUrl": "http://priority.example/first.jpg"}},
        "userRequest": {"utterance": "http://should-not-be-used.example/second.jpg"},
    }
    assert extract_image_url(body) == "http://priority.example/first.jpg"


# ── nameplate_to_params: 인식 결과 → 계산 파라미터 변환 ───────────────────────
def test_nameplate_to_params_motor():
    data = {
        "equipment_type": "motor", "voltage_v": 6600, "power_kw": 500,
        "power_factor": 0.85, "efficiency": 0.94, "phases": 3,
    }
    query_type, params = nameplate_to_params(data)

    assert query_type == "motor"
    assert params == {
        "voltage_v": 6600, "power_kw": 500,
        "power_factor": 0.85, "efficiency": 0.94, "phases": 3,
    }


def test_nameplate_to_params_transformer_renames_kva_and_impedance_fields():
    data = {"equipment_type": "transformer", "sn_kva": 1000, "vk_percent": 6.0, "voltage_v": 22900}
    query_type, params = nameplate_to_params(data)

    assert query_type == "transformer"
    assert params["power_kva"] == 1000    # sn_kva → power_kva
    assert params["vk_pct"] == 6.0        # vk_percent → vk_pct
    assert params["voltage_v"] == 22900


def test_nameplate_to_params_unknown_equipment_defaults_to_cable():
    query_type, _ = nameplate_to_params({"equipment_type": "breaker"})
    assert query_type == "cable"


def test_nameplate_to_params_ignores_falsy_fields():
    """0이나 None처럼 falsy한 값은 '인식 안 됨'으로 취급해 파라미터에 넣지 않아야 한다."""
    data = {"equipment_type": "motor", "voltage_v": 380, "power_kw": 0, "efficiency": None}
    _, params = nameplate_to_params(data)
    assert "power_kw" not in params
    assert "efficiency" not in params


# ── format_nameplate_result: 사용자에게 보여줄 텍스트 ─────────────────────────
def test_format_nameplate_result_error_message():
    text = format_nameplate_result({"error": "GEMINI_API_KEY 미설정"})
    assert "명판 인식 실패" in text
    assert "GEMINI_API_KEY 미설정" in text


def test_format_nameplate_result_motor_converts_voltage_and_suggests_next_step():
    data = {
        "equipment_type": "motor", "name": "IE3-500", "voltage_v": 6600,
        "power_kw": 500, "current_a": 55.0,
    }
    text = format_nameplate_result(data)

    assert "전동기" in text
    assert "6.6kV" in text          # 1000V 이상은 kV로 변환
    assert "500.0kW" in text
    assert "케이블 선정" in text     # 다음 계산 제안이 붙어야 함


def test_format_nameplate_result_low_voltage_stays_in_volts():
    text = format_nameplate_result({"equipment_type": "motor", "voltage_v": 380, "power_kw": 75})
    assert "380V" in text
    assert "kV" not in text.split("380V")[0].split("\n")[-1]  # 380 자체가 kV로 변환되지 않아야 함


def test_format_nameplate_result_transformer_suggests_shortcircuit():
    data = {"equipment_type": "transformer", "sn_kva": 1000, "vk_percent": 6.0}
    text = format_nameplate_result(data)
    assert "변압기" in text
    assert "단락전류" in text

"""
카카오봇 자연어 파서(services/parser.py) 단위 테스트.

regex_parse/detect_query_type은 순수 함수라 그대로 검증한다. smart_parse는
필수 파라미터가 이미 갖춰지면 Gemini를 호출하지 않는다는 점, 그리고
GEMINI_API_KEY가 없을 때 Gemini 없이도 예외 없이 동작한다는 점을 검증한다
(테스트 환경에 실제 API 키가 없으므로 네트워크 호출 없이 결정적으로 동작).
"""
import pytest

from services.parser import (
    detect_query_type,
    regex_parse,
    smart_parse,
    gemini_parse,
    REQUIRED_BY_TYPE,
)


# ── 질의 유형 감지 ────────────────────────────────────────────────────────────
@pytest.mark.parametrize("text,expected", [
    ("380V 75kW 거리 150m 전압강하 3%", "cable"),
    ("22.9kV 계통 1000MVA 단락전류 계산", "shortcircuit"),
    ("100kW 전동기 5대 수용률 0.8 변압기 용량", "transformer"),
    ("총 부하 500kW 변압기 선정", "transformer"),
    ("6.6kV 500kVA OCR 정정값", "relay"),
    ("6.6kV 500kW 전동기 기동 전압강하", "motor"),
    ("380V 100kW 역률 0.75 목표 0.95 콘덴서", "capacitor"),
    ("500kW 전동기 DOL 기동 발전기 용량", "generator"),
    ("380V 75kW 전동기 MCCB 선정", "breaker"),
    ("아무 키워드도 없는 문장입니다", "cable"),   # 기본값
])
def test_detect_query_type(text, expected):
    assert detect_query_type(text) == expected


# ── 정규식 파라미터 추출 ──────────────────────────────────────────────────────
def test_regex_parse_voltage_kv_converts_to_v():
    assert regex_parse("22.9kV 단락전류")["voltage_v"] == 22900.0


def test_regex_parse_voltage_v_stays_as_is():
    assert regex_parse("380V 75kW")["voltage_v"] == 380.0


@pytest.mark.parametrize("text,field,expected", [
    ("500kVA OCR", "power_kva", 500.0),
    ("75kW 전동기", "power_kw", 75.0),
    ("2MW 발전기", "power_kw", 2000.0),   # MW → kW
    ("100HP 전동기", "power_kw", pytest.approx(74.6)),  # HP → kW (1HP=0.746kW)
])
def test_regex_parse_power_units(text, field, expected):
    result = regex_parse(text)
    assert result[field] == expected


def test_regex_parse_sc_mva_not_captured_as_power_kva():
    """회귀 테스트: 도움말에 나온 예시 문장 그대로.

    예전 버그: 용량 정규식이 MVA도 잡아버려서 "1000MVA"가 power_kva=1,000,000으로
    잘못 들어가고, sc_mva는 'power_kva not in result' 조건에 막혀 끝까지 비어있었다.
    그 결과 봇 자신의 도움말 예시조차 "변압기 1,000,000kVA 포함"이라는 말이 안 되는
    문구를 출력하며 단락전류를 잘못 계산했다.
    """
    result = regex_parse("22.9kV 계통 1000MVA 단락전류 계산")
    assert result["sc_mva"] == 1000.0
    assert "power_kva" not in result


def test_regex_parse_sc_mva_standalone():
    result = regex_parse("500 MVA 계통")
    assert result["sc_mva"] == 500.0
    assert "power_kva" not in result


def test_regex_parse_distance_km_converts_to_m():
    assert regex_parse("거리 1.5km")["distance_m"] == 1500.0


def test_regex_parse_distance_m():
    assert regex_parse("거리 150m")["distance_m"] == 150.0


def test_regex_parse_vdrop_limit_pct():
    assert regex_parse("전압강하 3%")["vdrop_limit_pct"] == 3.0


def test_regex_parse_power_factor():
    assert regex_parse("역률 0.9")["power_factor"] == 0.9


@pytest.mark.parametrize("text,expected", [
    ("효율 94%", 0.94),
    ("효율 0.94", 0.94),
])
def test_regex_parse_efficiency_normalizes_percent_to_fraction(text, expected):
    assert regex_parse(text)["efficiency"] == pytest.approx(expected)


def test_regex_parse_demand_factor_percent():
    assert regex_parse("수용률 80%")["demand_factor"] == pytest.approx(0.8)


def test_regex_parse_count():
    assert regex_parse("전동기 5대")["count"] == 5


@pytest.mark.parametrize("text,expected", [
    ("공중 트레이 설치", "air"),
    ("지중 매설", "ground"),
    ("특별한 언급 없음", "duct"),   # 기본값
])
def test_regex_parse_install_method(text, expected):
    assert regex_parse(text)["install_method"] == expected


@pytest.mark.parametrize("text,expected", [
    ("단상 220V", 1),
    ("380V 75kW", 3),   # 기본값: 3상
])
def test_regex_parse_phases(text, expected):
    assert regex_parse(text)["phases"] == expected


def test_regex_parse_target_pf():
    assert regex_parse("목표 역률 0.95로 개선")["target_pf"] == 0.95


@pytest.mark.parametrize("text,expected", [
    ("소프트스타터 기동", "soft_starter"),
    ("스타델타 기동", "star_delta"),
    ("VFD 인버터 기동", "vfd"),
    ("DOL 직입 기동", "dol"),
])
def test_regex_parse_start_method(text, expected):
    assert regex_parse(text)["start_method"] == expected


# ── smart_parse: 정규식 우선, 부족할 때만 Gemini 보완 ─────────────────────────
def test_smart_parse_skips_gemini_when_required_params_present(monkeypatch):
    """필수 파라미터가 정규식만으로 이미 충족되면 Gemini를 호출하지 않아야 한다
    (호출 여부를 직접 확인하기 위해 gemini_parse를 감시용 함수로 교체)."""
    called = {"count": 0}

    def spy(text):
        called["count"] += 1
        return {}

    monkeypatch.setattr("services.parser.gemini_parse", spy)

    query_type, params = smart_parse("380V 75kW 거리 150m 전압강하 3%")

    assert query_type == "cable"
    assert params["voltage_v"] == 380.0
    assert params["power_kw"] == 75.0
    assert called["count"] == 0


def test_smart_parse_calls_gemini_when_required_params_missing(monkeypatch):
    """필수 파라미터가 빠지면 Gemini로 보완을 시도해야 한다."""
    called = {"count": 0}

    def spy(text):
        called["count"] += 1
        return {"power_kw": 75.0}   # Gemini가 누락값을 채워줬다고 가정

    monkeypatch.setattr("services.parser.gemini_parse", spy)

    query_type, params = smart_parse("전동기 케이블 선정해줘")   # voltage_v/power_kw 없음

    assert called["count"] == 1
    assert params["power_kw"] == 75.0   # Gemini 보완값 반영


def test_smart_parse_regex_values_win_over_gemini_on_conflict(monkeypatch):
    """정규식이 이미 찾은 값은 Gemini 결과로 덮어써지면 안 된다 (정규식이 더 신뢰할 수 있는 소스)."""
    monkeypatch.setattr("services.parser.gemini_parse", lambda text: {"power_kw": 999.0})

    _, params = smart_parse("380V 75kW 케이블 선정")   # 정규식이 이미 power_kw=75 확보

    assert params["power_kw"] == 75.0


def test_smart_parse_no_crash_without_gemini_api_key(monkeypatch):
    """API 키가 없어도(무료 티어 미설정) 예외 없이 정규식 결과만으로 동작해야 한다."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    query_type, params = smart_parse("전동기 케이블 선정해줘")   # 필수값 누락 → gemini_parse 실호출 경로

    assert isinstance(params, dict)   # 예외 없이 dict를 반환하면 충분


def test_gemini_parse_returns_empty_dict_without_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert gemini_parse("아무 문장") == {}


def test_required_by_type_covers_every_dispatchable_query_type():
    """calculator.calculate()가 처리하는 모든 유형에 필수 파라미터 정의가 있어야
    smart_parse가 Gemini 호출 여부를 올바르게 판단할 수 있다."""
    from services.calculator import calculate  # noqa: F401 (존재 확인용 임포트)

    dispatchable = {"cable", "shortcircuit", "transformer", "relay",
                     "motor", "capacitor", "generator", "breaker"}
    assert dispatchable <= REQUIRED_BY_TYPE.keys()

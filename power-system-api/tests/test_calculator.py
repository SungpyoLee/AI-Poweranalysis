"""
카카오봇 계산 로직 단위 테스트.

기대값은 IEC 표준 공식(역률 삼각형, 기동kVA, MCCB/ACB 정격 배수)을
독립적으로 손·스크립트 계산해 검증한 값이다. calculate()가 반환하는
한국어 안내 문구가 아니라, calc_* 함수가 반환하는 숫자를 직접 검증해
문구를 바꿔도 깨지지 않고 계산이 틀리면 반드시 실패하게 한다.
"""
import math

import pytest

from services.calculator import (
    calc_cable,
    calc_shortcircuit,
    calc_transformer,
    calc_relay,
    calc_motor,
    calc_capacitor,
    calc_generator,
    calc_breaker,
    format_cable,
    format_shortcircuit,
    format_transformer,
    format_relay,
    format_motor,
    format_capacitor,
    format_generator,
    format_breaker,
)


# ── 역률개선 콘덴서 ───────────────────────────────────────────────────────────
def test_capacitor_100kw_085_to_095():
    r = calc_capacitor(power_kw=100, pf_cur=0.85, pf_tgt=0.95, voltage_v=380)

    assert r.q_req_kvar == pytest.approx(29.106, abs=0.01)
    assert r.selected_kvar == 30          # 표준 kVAR 목록 중 필요량 이상인 최소값
    assert r.pf_achieved == pytest.approx(0.9525, abs=0.001)
    assert r.i_before_a == pytest.approx(178.75, abs=0.05)
    assert r.i_after_a == pytest.approx(159.51, abs=0.05)
    assert r.i_after_a < r.i_before_a     # 콘덴서 투입 후 전류는 반드시 감소해야 함


def test_capacitor_selected_never_below_required():
    """표준 용량 선정값은 항상 이론상 필요 용량 이상이어야 한다 (미달이면 목표 역률 달성 불가)."""
    for pf_cur, pf_tgt, kw in [(0.7, 0.9, 250), (0.6, 0.95, 50), (0.88, 0.99, 800)]:
        r = calc_capacitor(power_kw=kw, pf_cur=pf_cur, pf_tgt=pf_tgt)
        assert r.selected_kvar >= r.q_req_kvar - 1e-6


def test_capacitor_format_guards_no_capacitor_needed():
    text = format_capacitor({"power_kw": 100, "power_factor": 0.97, "target_pf": 0.95})
    assert "불필요" in text


def test_capacitor_format_guards_missing_power():
    text = format_capacitor({})
    assert "입력해주세요" in text


# ── 비상발전기 용량 ───────────────────────────────────────────────────────────
def test_generator_500kw_dol():
    r = calc_generator(power_kw=500, pf=0.85, eff=0.94, start_method="dol")

    assert r.rated_kva == pytest.approx(625.78, abs=0.05)
    assert r.start_kva == pytest.approx(3754.69, abs=0.1)
    assert r.selected_kva == 4000
    assert r.selected_kw == pytest.approx(3200.0, abs=0.01)
    assert r.vdrop_pct == pytest.approx(48.42, abs=0.05)
    assert r.ok is False   # DOL 직입 기동은 25% 한도를 초과하는 것이 정상 — Y-Δ/VFD 검토 필요


def test_generator_100kw_soft_starter():
    r = calc_generator(power_kw=100, pf=0.85, eff=0.94, start_method="soft_starter")

    assert r.rated_kva == pytest.approx(125.16, abs=0.05)
    assert r.start_kva == pytest.approx(312.89, abs=0.05)
    assert r.selected_kva == 400


def test_generator_dol_needs_largest_genset():
    """START_METHOD의 기동전류 배수(dol=6.0)가 가장 크므로, 같은 전동기라면
    DOL 직입 기동이 다른 모든 감압 기동방식보다 큰(또는 같은) 발전기를 요구해야 한다."""
    kva_by_method = {
        method: calc_generator(power_kw=200, start_method=method).selected_kva
        for method in ("dol", "star_delta", "soft_starter", "vfd")
    }

    for method in ("star_delta", "soft_starter", "vfd"):
        assert kva_by_method[method] <= kva_by_method["dol"]


def test_generator_format_guards_missing_power():
    text = format_generator({})
    assert "입력해주세요" in text


# ── 차단기(MCCB/ACB/ELB) 선정 ─────────────────────────────────────────────────
def test_breaker_motor_75kw_380v():
    r = calc_breaker(voltage_v=380, power_kw=75, pf=0.85, eff=0.94, phases=3)

    assert r.i_fl_a == pytest.approx(142.62, abs=0.05)
    assert r.trip_min_a == pytest.approx(356.54, abs=0.1)
    assert r.selected_a == 400
    assert r.breaker_type == "MCCB"
    assert r.elb_a == 200


def test_breaker_feeder_500kva_380v():
    r = calc_breaker(voltage_v=380, power_kva=500, phases=3)

    assert r.i_fl_a == pytest.approx(759.67, abs=0.1)
    assert r.trip_min_a == pytest.approx(949.59, abs=0.1)
    assert r.selected_a == 1000
    assert r.breaker_type == "ACB"      # 1000A 이상은 ACB로 분류되어야 함


def test_breaker_selected_never_below_trip_minimum():
    """선정된 차단기 정격은 항상 최소 트립 전류 이상이어야 한다 (미달이면 정상 부하에서도 오동작)."""
    cases = [
        dict(voltage_v=380, power_kw=75),
        dict(voltage_v=380, power_kva=500),
        dict(voltage_v=6600, power_kw=500),
        dict(voltage_v=220, power_kw=15, phases=1),
    ]
    for kwargs in cases:
        r = calc_breaker(**kwargs)
        assert r.selected_a >= r.trip_min_a


def test_breaker_format_guards_missing_load():
    text = format_breaker({"voltage_v": 380})
    assert "입력해주세요" in text


# ── 케이블 선정 ───────────────────────────────────────────────────────────────
def test_cable_380v_75kw_150m():
    r = calc_cable(voltage_v=380, power_kw=75, distance_m=150, vdrop_limit_pct=3.0)

    assert r.full_load_a == pytest.approx(134.06, abs=0.05)
    assert r.size_mm2 == 70          # 허용전류만으로는 50mm²(137A)가 되지만
    assert r.vdrop_pct == pytest.approx(2.46, abs=0.02)   # 전압강하 3% 초과로 70mm²까지 승급
    assert r.ok is True


def test_cable_size_never_below_ampacity_requirement():
    """선정된 케이블의 허용전류는 항상 전부하전류 이상이어야 한다 (미달이면 과열·화재 위험)."""
    cases = [
        dict(voltage_v=380, power_kw=75, distance_m=50, install_method="air"),
        dict(voltage_v=380, power_kw=200, distance_m=300, install_method="ground"),
        dict(voltage_v=6600, power_kw=500, distance_m=1000, parallel=2),
    ]
    for kwargs in cases:
        r = calc_cable(**kwargs)
        assert r.ampacity_a >= r.full_load_a


def test_cable_flags_not_ok_when_distance_exceeds_every_size():
    """모든 표준 단면적으로도 전압강하 한도를 못 맞추면 ok=False로 명확히 표시해야 한다."""
    r = calc_cable(voltage_v=380, power_kw=75, distance_m=2000, vdrop_limit_pct=3.0)
    assert r.size_mm2 == 630   # 케이블표 최대 단면적까지 승급해도
    assert r.ok is False       # 여전히 한도 초과 — 병렬 케이블 검토가 필요함을 알려야 함


def test_cable_format_guards_missing_input():
    text = format_cable({})
    assert "입력해주세요" in text


# ── 단락전류 (IEC 60909) ──────────────────────────────────────────────────────
def test_shortcircuit_22_9kv_1000mva_no_transformer():
    """22.9kV 계통에서 단락용량 1000MVA면 Ik'' ≈ Sk/(√3·Vn) ≈ 25.2kA여야 한다.

    회귀 배경: 원래 코드는 이 값을 계산 후 실수로 다시 1000으로 나눠
    0.0252kA(약 25A)를 반환했다 — 실제 단락전류의 1/1000. 카카오봇이
    "단락전류 0.03kA"라고 안내하면 정상 부하전류보다도 작아 보여
    차단기를 심각하게 과소 선정하게 만들 수 있는 위험한 버그였다.
    이 테스트는 그 회귀를 다시 잡아낸다.
    """
    r = calc_shortcircuit(voltage_v=22900, sc_mva=1000)

    assert r.ikss_ka == pytest.approx(25.21, abs=0.05)
    assert r.ikss_ka > 1.0   # 최소한 정상 부하전류(수백 A) 수준은 넘어야 함
    assert r.sk_mva == pytest.approx(1000.0, abs=0.5)   # 변압기 미포함 시 입력 Sk와 일치해야 함
    assert r.tr_included is False


def test_shortcircuit_with_transformer_reduces_fault_current():
    r_no_tr = calc_shortcircuit(voltage_v=6600, sc_mva=500)
    r_with_tr = calc_shortcircuit(voltage_v=6600, sc_mva=500, tr_kva=1000, vk_pct=6.0)

    assert r_with_tr.tr_included is True
    # 변압기 임피던스가 직렬로 더해지므로 단락전류는 항상 감소해야 한다
    assert r_with_tr.ikss_ka < r_no_tr.ikss_ka
    assert r_with_tr.ikss_ka == pytest.approx(1.547, abs=0.01)


def test_shortcircuit_peak_current_exceeds_symmetrical():
    """비대칭 첨두전류 Ip는 항상 초기 대칭 단락전류 Ik''보다 커야 한다 (κ√2 > 1)."""
    r = calc_shortcircuit(voltage_v=22900, sc_mva=1000)
    assert r.ip_ka > r.ikss_ka


def test_shortcircuit_format_guards_missing_voltage():
    text = format_shortcircuit({})
    assert "입력해주세요" in text


# ── 변압기 용량 선정 ──────────────────────────────────────────────────────────
def test_transformer_100kw_x5_demand_08():
    r = calc_transformer(power_kw=100, count=5, pf=0.85, df=0.8)

    assert r.total_kva == pytest.approx(588.2, abs=0.1)
    assert r.required_kva == pytest.approx(470.6, abs=0.1)
    assert r.selected_kva == 500
    assert r.loading_pct == pytest.approx(94.1, abs=0.1)
    assert r.ok is False   # 80% 초과 — 상위 용량 검토 안내가 나가야 하는 케이스


def test_transformer_selected_never_below_required():
    """선정된 변압기 용량은 항상 필요 용량 이상이어야 한다 (미달이면 과부하 운전)."""
    for kw, count, df in [(50, 3, 0.7), (200, 10, 0.9), (10, 1, 1.0)]:
        r = calc_transformer(power_kw=kw, count=count, df=df)
        assert r.selected_kva >= r.required_kva


def test_transformer_format_guards_missing_load():
    text = format_transformer({})
    assert "입력해주세요" in text


# ── 과전류 계전기(OCR) 정정 ────────────────────────────────────────────────────
def test_relay_6_6kv_500kva():
    r = calc_relay(voltage_v=6600, kva=500)

    assert r.i_rated_a == pytest.approx(43.74, abs=0.05)
    assert r.pickup_lo_a == pytest.approx(54.67, abs=0.05)
    assert r.pickup_hi_a == pytest.approx(65.61, abs=0.05)
    # 픽업 하한(125%)은 항상 상한(150%)보다 작아야 한다
    assert r.pickup_lo_a < r.pickup_hi_a


def test_relay_format_guards_missing_load():
    text = format_relay({"voltage_v": 6600})
    assert "입력해주세요" in text


# ── 전동기 기동 전압강하 ──────────────────────────────────────────────────────
def test_motor_500kw_6_6kv_strong_grid():
    r = calc_motor(voltage_v=6600, power_kw=500, sc_mva=500)

    assert r.i_rated_a == pytest.approx(54.74, abs=0.05)
    assert r.i_start_a == pytest.approx(328.45, abs=0.05)
    assert r.vdrop_pct == pytest.approx(0.826, abs=0.01)
    assert r.ok is True   # 튼튼한 계통이라 15% 한도 이내


def test_motor_weak_grid_exceeds_vdrop_limit():
    """계통 용량이 작으면(약전계통) 같은 전동기라도 기동 전압강하가 커져 한도를 넘겨야 한다."""
    r = calc_motor(voltage_v=380, power_kw=200, sc_mva=5)

    assert r.vdrop_pct > 15
    assert r.ok is False


def test_motor_start_current_is_lrc_times_rated():
    r = calc_motor(voltage_v=380, power_kw=75, sc_mva=50, lrc=6.0)
    assert r.i_start_a == pytest.approx(r.i_rated_a * 6.0, rel=1e-9)


def test_motor_format_guards_missing_input():
    text = format_motor({})
    assert "입력해주세요" in text

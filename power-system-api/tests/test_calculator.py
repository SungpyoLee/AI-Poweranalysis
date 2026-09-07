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
    calc_capacitor,
    calc_generator,
    calc_breaker,
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

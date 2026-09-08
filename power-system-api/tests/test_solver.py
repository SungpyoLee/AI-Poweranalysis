"""
SLD 에디터의 pandapower 조류·단락계산 엔진(services/solver.py) 단위 테스트.

pandapower 자체의 Newton-Raphson/IEC 60909 수치해석은 널리 검증된 외부
라이브러리이므로 여기서 재검증하지 않는다. 대신 이 저장소가 직접 작성한
"글루 코드" — NetworkInput → pandapower net 변환(_build_network), 결과를
다시 우리 Pydantic 모델로 옮겨 담는 부분(특히 bus_id 매핑), 그리고
IEC 다주기 비대칭전류 공식(rms_asym_ka)처럼 pandapower가 대신 해주지
않는 이 저장소만의 계산 — 을 검증한다. 기대값은 근사식으로 독립 계산해
대조하거나(예: 단락점의 Sk''는 입력한 s_sc_max_mva와 정확히 같아야 함),
물리적으로 반드시 성립해야 하는 부등식(거리가 멀수록 단락전류가 작다 등)
으로 검증한다.
"""
import math

import pandapower as pp
import pytest

from models.network import NetworkInput, Bus, ExternalGrid, Load, Line
from services.solver import (
    run_loadflow,
    run_shortcircuit,
    run_shortcircuit_cycles,
    compute_xr_ratio,
    rms_asym_ka,
)


# ── 픽스처: 비연속 bus_id를 일부러 사용해 id 매핑 버그를 잡기 쉽게 한다 ──────
@pytest.fixture
def radial_two_bus():
    """외부계통(bus 100, 20kV) — 선로 — 부하(bus 200)."""
    return NetworkInput(
        name="radial",
        buses=[
            Bus(id=100, name="Source", vn_kv=20.0),
            Bus(id=200, name="Load Bus", vn_kv=20.0),
        ],
        external_grids=[
            ExternalGrid(bus_id=100, name="Grid", vm_pu=1.0,
                         s_sc_max_mva=1000, s_sc_min_mva=800, rx_max=0.1, rx_min=0.1),
        ],
        loads=[Load(bus_id=200, name="L1", p_mw=1.0, q_mvar=0.3)],
        lines=[
            Line(from_bus_id=100, to_bus_id=200, name="Line1", length_km=2.0,
                 r_ohm_per_km=0.32, x_ohm_per_km=0.35, c_nf_per_km=10, max_i_ka=0.4),
        ],
    )


@pytest.fixture
def single_grid_bus():
    """외부계통 하나만 있는 단일 모선 — 이 모선에서의 단락전류는
    다른 임피던스가 끼어들지 않으므로 입력한 s_sc_max_mva를 그대로 재현해야 한다."""
    return NetworkInput(
        name="single",
        buses=[Bus(id=1, name="Grid Bus", vn_kv=20.0)],
        external_grids=[
            ExternalGrid(bus_id=1, name="Grid", vm_pu=1.0,
                         s_sc_max_mva=1000, s_sc_min_mva=800, rx_max=0.1, rx_min=0.1),
        ],
    )


# ── 순수 함수: X/R 비율 계산 ──────────────────────────────────────────────────
def test_compute_xr_ratio_normal_division():
    assert compute_xr_ratio(rk_ohm=2.0, xk_ohm=20.0) == pytest.approx(10.0)


def test_compute_xr_ratio_zero_resistance_falls_back_to_20():
    """저항분이 사실상 0인 순수 리액턴스 경로 — 0으로 나누는 대신 20.0으로 근사."""
    assert compute_xr_ratio(rk_ohm=0.0, xk_ohm=999.0) == pytest.approx(20.0)


def test_compute_xr_ratio_clamped_to_iec_range():
    """IEC 60909 표가 제공하는 범위 [1, 100]을 벗어나면 clamp되어야 한다."""
    assert compute_xr_ratio(rk_ohm=1000.0, xk_ohm=1.0) == pytest.approx(1.0)     # 너무 작음 → 1
    assert compute_xr_ratio(rk_ohm=0.001, xk_ohm=1.0) == pytest.approx(100.0)    # 너무 큼 → 100


# ── 순수 함수: 다주기 비대칭 RMS 전류 ─────────────────────────────────────────
def test_rms_asym_ka_matches_iec_formula_independently():
    """I(t) = Ik''·sqrt(1 + 2·exp(-4π·n/(X/R))) — 구현과 별개로 손으로 재계산."""
    ikss, xr, n = 28.8675, 10.0, 3.0
    expected = ikss * math.sqrt(1.0 + 2.0 * math.exp(-4.0 * math.pi * n / xr))
    assert rms_asym_ka(ikss, xr, n) == pytest.approx(expected, rel=1e-9)


def test_rms_asym_ka_at_zero_cycles_is_sqrt3_times_ikss():
    """이론상 최대 비대칭계수는 √3 — 사이클=0(직류분 감쇠 전)일 때 재현되어야 한다."""
    ikss = 10.0
    assert rms_asym_ka(ikss, xr_ratio=50.0, n_cycles=0.0) == pytest.approx(ikss * math.sqrt(3), rel=1e-6)


def test_rms_asym_ka_decreases_monotonically_toward_ikss():
    """직류분은 시간이 지날수록 감쇠하므로, 사이클 수가 늘수록 Ik''에 점점 가까워져야 한다."""
    ikss, xr = 20.0, 15.0
    half   = rms_asym_ka(ikss, xr, 0.5)
    three  = rms_asym_ka(ikss, xr, 3.0)
    five   = rms_asym_ka(ikss, xr, 5.0)

    assert half > three > five > ikss
    # 사이클이 충분히 크면 이론상 Ik''로 수렴해야 한다
    assert rms_asym_ka(ikss, xr, 200.0) == pytest.approx(ikss, rel=1e-6)


# ── 조류계산 통합 테스트 ──────────────────────────────────────────────────────
def test_loadflow_bus_id_preserved_for_nonsequential_ids(radial_two_bus):
    """pandapower 내부 인덱스(0,1,...)가 아니라 사용자가 지정한 bus_id(100,200)가
    결과에 그대로 돌아와야 한다 — id_to_idx/idx_to_id 매핑이 틀리면 여기서 깨진다."""
    r = run_loadflow(radial_two_bus)
    assert r.converged is True

    by_id = {b.bus_id: b for b in r.buses}
    assert set(by_id.keys()) == {100, 200}
    assert by_id[100].name == "Source"
    assert by_id[200].name == "Load Bus"


def test_loadflow_source_bus_supplies_load_plus_losses(radial_two_bus):
    """외부계통 모선의 유효전력은 부하(1.0MW) + 선로손실만큼 '공급'(음수)해야 한다.
    독립 검증: 근사 손실식 P_loss ≈ (P²+Q²)/V² · R 로 직접 재계산해 대조."""
    r = run_loadflow(radial_two_bus)
    by_id = {b.bus_id: b for b in r.buses}

    source, load_bus = by_id[100], by_id[200]

    assert source.p_mw < 0          # 소비가 아니라 공급이므로 음수 관례
    assert load_bus.p_mw == pytest.approx(1.0, abs=1e-3)
    assert -source.p_mw == pytest.approx(1.0 + r.total_loss_mw, abs=1e-3)

    approx_loss = (1.0**2 + 0.3**2) / (20.0**2) * (0.32 * 2.0)
    assert r.total_loss_mw == pytest.approx(approx_loss, rel=0.2)

    # 부하가 걸린 쪽 전압은 공급단보다 낮아야 한다 (전압강하)
    assert load_bus.vm_pu < source.vm_pu


def test_loadflow_not_converged_returns_empty_result_without_raising(monkeypatch, radial_two_bus):
    """runpp가 수렴 실패를 던져도 예외를 전파하지 말고 converged=False로 감싸 반환해야 한다."""
    def fake_runpp(*args, **kwargs):
        raise pp.powerflow.LoadflowNotConverged("test forced non-convergence")

    monkeypatch.setattr(pp, "runpp", fake_runpp)

    r = run_loadflow(radial_two_bus)
    assert r.converged is False
    assert r.buses == []
    assert r.lines == []
    assert r.transformers == []


# ── 단락계산 통합 테스트 ──────────────────────────────────────────────────────
def test_shortcircuit_at_grid_bus_reproduces_input_capacity(single_grid_bus):
    """외부계통 바로 그 모선에서의 고장이라면, 다른 임피던스가 끼지 않으므로
    Sk''는 입력한 s_sc_max_mva(1000MVA)와 정확히 같아야 한다."""
    r = run_shortcircuit(single_grid_bus)
    assert len(r.buses) == 1
    assert r.buses[0].sk_mva == pytest.approx(1000.0, rel=1e-4)


def test_shortcircuit_current_drops_with_distance(radial_two_bus):
    """선로 임피던스가 직렬로 추가되면 단락전류는 반드시 감소해야 한다."""
    r = run_shortcircuit(radial_two_bus)
    by_id = {b.bus_id: b for b in r.buses}
    assert by_id[200].ikss_ka < by_id[100].ikss_ka


def test_shortcircuit_cycles_xr_ratio_matches_grid_rx_setting(radial_two_bus):
    """외부계통 바로 그 모선에서는(다른 임피던스 없음) X/R = 1/rx_ratio가
    정확히 성립해야 한다 — 여기서는 rx_max=rx_min=0.1이므로 X/R=10."""
    r = run_shortcircuit_cycles(radial_two_bus)
    by_id = {b.bus_id: b for b in r.buses}
    assert by_id[100].xr_ratio == pytest.approx(10.0, abs=0.05)


def test_shortcircuit_cycles_asymmetry_decreases_toward_ikss(radial_two_bus):
    r = run_shortcircuit_cycles(radial_two_bus)
    source = next(b for b in r.buses if b.bus_id == 100)

    assert source.ip_ka > source.ikss_ka                      # 첨두전류 > 대칭 초기전류
    assert source.i_half_cycle_ka > source.i_3cycle_ka > source.i_5cycle_ka >= source.ikss_ka

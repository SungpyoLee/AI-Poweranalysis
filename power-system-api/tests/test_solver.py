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

from models.network import NetworkInput, Bus, ExternalGrid, Load, Line, Motor, Transformer
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


# ── 프론트엔드-백엔드 계약 회귀 테스트 ─────────────────────────────────────────
# power-system-ui/src/utils/buildNetworkPayload.ts가 실제로 만들어 보내는
# JSON과 정확히 같은 모양의 딕셔너리. 예전엔 이 함수가 bus_id 대신 bus,
# p_mw 대신 p_kw, from_bus_id/to_bus_id 대신 from_bus/to_bus,
# hv_bus_id/lv_bus_id 대신 hv_bus/lv_bus를 보냈고 buses[].id도 아예 없었다
# — NetworkInput의 필수 필드라 FastAPI가 요청을 받자마자 422로 거부했다.
# 즉 Toolbar의 "API(서버)" 조류/단락계산 백엔드는 실제로는 한 번도
# 성공한 적이 없었다. 이 테스트는 그 계약이 실제로 맞물리는지 검증한다.
def test_network_input_accepts_actual_frontend_payload_shape():
    frontend_payload = {
        "name": "PowerFlow Network",
        "f_hz": 60,
        "buses": [
            {"id": 0, "name": "SRC", "vn_kv": 22.9, "type": "b", "in_service": True},
            {"id": 1, "name": "LOAD", "vn_kv": 22.9, "type": "b", "in_service": True},
        ],
        "external_grids": [
            {"bus_id": 0, "name": "Grid@SRC", "vm_pu": 1.0, "va_degree": 0},
        ],
        "generators": [],
        "motors": [
            {"name": "M1", "bus_id": 1, "pn_mech_mw": 0.5, "cos_phi": 0.85,
             "efficiency_percent": 92, "vn_kv": 0.4, "lrc_pu": 6.5, "scaling": 1.0},
        ],
        "loads": [
            {"name": "L1", "bus_id": 1, "p_mw": 0.12, "q_mvar": 0.06, "vn_kv": 22.9,
             "const_z_percent": 0, "const_i_percent": 0, "const_p_percent": 100,
             "scaling": 1.0, "in_service": True},
        ],
        "transformers": [],
        "lines": [
            {"name": "C1", "from_bus_id": 0, "to_bus_id": 1, "std_type": None, "length_km": 0.5,
             "r_ohm_per_km": 0.164, "x_ohm_per_km": 0.1, "c_nf_per_km": 0,
             "r0_ohm_per_km": 0.164, "x0_ohm_per_km": 0.1, "c0_nf_per_km": 0,
             "max_i_ka": 0.4, "parallel": 1, "in_service": True},
        ],
    }

    net_input = NetworkInput(**frontend_payload)   # 예전엔 여기서 ValidationError 발생
    result = run_loadflow(net_input)
    assert result.converged is True

    by_id = {b.bus_id: b for b in result.buses}
    # 모터(0.5MW 기계출력/92%효율 ≈ 0.543MW 전기입력) + 부하(0.12MW) 만큼
    # LOAD 버스가 소비해야 한다 — motors가 완전히 무시되던 예전엔 부하만큼만
    # (약 0.12MW) 잡혔다.
    assert by_id[1].p_mw > 0.5


def test_motor_electrical_draw_reflects_mechanical_power_over_efficiency():
    """모터만 매달린 버스 — 회귀: 예전엔 NetworkInput/solver 어느 쪽도 motors를
    다루지 않아 이 버스의 부하는 완전히 0으로 계산됐다."""
    net_input = NetworkInput(
        buses=[
            Bus(id=1, name="Grid", vn_kv=0.4),
            Bus(id=2, name="MotorBus", vn_kv=0.4),
        ],
        external_grids=[ExternalGrid(bus_id=1, s_sc_max_mva=1000, s_sc_min_mva=800)],
        lines=[Line(from_bus_id=1, to_bus_id=2, name="C1", length_km=0.05,
                     r_ohm_per_km=0.164, x_ohm_per_km=0.1, max_i_ka=1.0)],
        motors=[Motor(bus_id=2, name="M1", pn_mech_mw=0.1, cos_phi=0.85,
                       efficiency_percent=90, vn_kv=0.4)],
    )
    result = run_loadflow(net_input)
    assert result.converged is True

    motor_bus = next(b for b in result.buses if b.bus_id == 2)
    # 전기입력 ≈ 0.1/0.90 ≈ 0.1111MW — 손실 있는 케이블 건너므로 약간의 오차 허용
    assert motor_bus.p_mw == pytest.approx(0.1 / 0.90, rel=0.05)


def test_transformer_tap_position_shifts_lv_side_voltage():
    """HV측 OLTC에서 탭을 올리면(tap_pos ↑) HV측 권선 턴수가 늘어난 것으로
    취급되어 같은 HV 전압 대비 LV측 전압은 오히려 낮아져야 한다 — 프론트엔드
    ybus.ts가 세우는 것과 동일한 물리적 모델(회귀 시점에 pandapower로 직접
    조류계산해 이 방향을 실측 확인했다). 회귀: 예전엔 백엔드 Transformer
    모델에 탭 필드가 아예 없어 항상 중립 탭으로만 계산됐다."""
    def lv_voltage(tap_pos: float) -> float:
        net_input = NetworkInput(
            buses=[Bus(id=1, name="HV", vn_kv=22.9), Bus(id=2, name="LV", vn_kv=0.4)],
            external_grids=[ExternalGrid(bus_id=1, s_sc_max_mva=1000, s_sc_min_mva=800)],
            transformers=[Transformer(
                hv_bus_id=1, lv_bus_id=2, name="TR1", sn_mva=1.0,
                vn_hv_kv=22.9, vn_lv_kv=0.4, vk_percent=6, vkr_percent=1,
                tap_pos=tap_pos, tap_neutral=0, tap_min=-2, tap_max=2, tap_step_percent=2.5,
            )],
            loads=[Load(bus_id=2, name="L1", p_mw=0.1, q_mvar=0.03)],
        )
        r = run_loadflow(net_input)
        assert r.converged is True
        return next(b for b in r.buses if b.bus_id == 2).vm_pu

    assert lv_voltage(tap_pos=-2) > lv_voltage(tap_pos=0) > lv_voltage(tap_pos=2)

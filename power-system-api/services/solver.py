# pandapower는 scipy/pandas/networkx를 끌고 오는 무거운 임포트라(수백 ms ~ 수 초),
# 모듈 로드 시점(main.py가 라우터를 등록할 때)이 아니라 실제로 조류/단락계산을
# 호출하는 매 함수 안에서 지연 임포트한다 — Render 무료 티어처럼 콜드 스타트가
# 있는 환경에서, 카카오봇(services.calculator 등, pandapower를 쓰지 않음) 요청이
# 같은 프로세스에 함께 떠 있다는 이유만으로 이 임포트 비용을 덤으로 지불하지
# 않도록 하기 위함. sys.modules에 캐시되므로 두 번째 호출부터는 사실상 공짜다.
from __future__ import annotations

import numpy as np
from models.network import NetworkInput
from models.results import (
    LoadFlowResult, BusResult, LineResult, TransformerResult,
    ShortCircuitResult, BusScResult,
    MultiCycleScResult, BusCycleScResult,
)


def _build_network(data: NetworkInput) -> tuple["pp.pandapowerNet", dict[int, int]]:
    """NetworkInput → pandapower net 변환. bus_id → pp index 매핑도 반환."""
    import pandapower as pp
    net = pp.create_empty_network(name=data.name, f_hz=data.f_hz)

    id_to_idx: dict[int, int] = {}
    for bus in data.buses:
        idx = pp.create_bus(net, vn_kv=bus.vn_kv, name=bus.name, type=bus.type)
        id_to_idx[bus.id] = idx

    for eg in data.external_grids:
        pp.create_ext_grid(
            net,
            bus=id_to_idx[eg.bus_id],
            name=eg.name,
            vm_pu=eg.vm_pu,
            va_degree=eg.va_degree,
            s_sc_max_mva=eg.s_sc_max_mva,
            s_sc_min_mva=eg.s_sc_min_mva,
            rx_max=eg.rx_max,
            rx_min=eg.rx_min,
        )

    for load in data.loads:
        pp.create_load(
            net,
            bus=id_to_idx[load.bus_id],
            name=load.name,
            p_mw=load.p_mw,
            q_mvar=load.q_mvar,
        )

    for gen in data.generators:
        pp.create_gen(
            net,
            bus=id_to_idx[gen.bus_id],
            name=gen.name,
            p_mw=gen.p_mw,
            vm_pu=gen.vm_pu,
            max_q_mvar=gen.max_q_mvar,
            min_q_mvar=gen.min_q_mvar,
        )

    for motor in data.motors:
        pp.create_motor(
            net,
            bus=id_to_idx[motor.bus_id],
            pn_mech_mw=motor.pn_mech_mw,
            cos_phi=motor.cos_phi,
            name=motor.name,
            efficiency_percent=motor.efficiency_percent,
            scaling=motor.scaling,
            vn_kv=motor.vn_kv if motor.vn_kv is not None else np.nan,
            lrc_pu=motor.lrc_pu if motor.lrc_pu is not None else np.nan,
        )

    for line in data.lines:
        pp.create_line_from_parameters(
            net,
            from_bus=id_to_idx[line.from_bus_id],
            to_bus=id_to_idx[line.to_bus_id],
            name=line.name,
            length_km=line.length_km,
            r_ohm_per_km=line.r_ohm_per_km,
            x_ohm_per_km=line.x_ohm_per_km,
            c_nf_per_km=line.c_nf_per_km,
            max_i_ka=line.max_i_ka,
        )

    for trafo in data.transformers:
        # 탭 위치는 HV측 OLTC로 가정한다 (프론트엔드 로컬 엔진 ybus.ts와 동일한 관례).
        # tap_pos가 안 오면(None) pandapower 기본값(탭 미적용)을 그대로 쓴다.
        tap_kwargs = {}
        if trafo.tap_pos is not None:
            tap_kwargs = dict(
                tap_side="hv",
                tap_pos=trafo.tap_pos,
                tap_neutral=trafo.tap_neutral,
                tap_min=trafo.tap_min,
                tap_max=trafo.tap_max,
                tap_step_percent=trafo.tap_step_percent,
                # pandapower 3.0+는 tap_changer_type을 명시하지 않으면(NaN)
                # tap_pos가 실려 있어도 실제 조류계산에 반영하지 않는다 —
                # 이 필드 없이 배포했다면 tap 필드를 다 보내고도 항상 중립
                # 탭으로만 계산되는 조용한 회귀였을 것이다.
                tap_changer_type="Ratio",
            )
        pp.create_transformer_from_parameters(
            net,
            hv_bus=id_to_idx[trafo.hv_bus_id],
            lv_bus=id_to_idx[trafo.lv_bus_id],
            name=trafo.name,
            sn_mva=trafo.sn_mva,
            vn_hv_kv=trafo.vn_hv_kv,
            vn_lv_kv=trafo.vn_lv_kv,
            vk_percent=trafo.vk_percent,
            vkr_percent=trafo.vkr_percent,
            pfe_kw=trafo.pfe_kw,
            i0_percent=trafo.i0_percent,
            **tap_kwargs,
        )

    return net, id_to_idx


def run_loadflow(data: NetworkInput) -> LoadFlowResult:
    import pandapower as pp
    net, id_to_idx = _build_network(data)
    idx_to_id = {v: k for k, v in id_to_idx.items()}

    try:
        pp.runpp(net, algorithm="nr", numba=False)
    except pp.powerflow.LoadflowNotConverged:
        return LoadFlowResult(
            converged=False, buses=[], lines=[], transformers=[], total_loss_mw=0.0
        )

    bus_results = []
    for idx, row in net.res_bus.iterrows():
        bus_info = net.bus.loc[idx]
        bus_results.append(BusResult(
            bus_id=idx_to_id[idx],
            name=bus_info["name"],
            vm_pu=round(row["vm_pu"], 6),
            va_degree=round(row["va_degree"], 4),
            vm_kv=round(row["vm_pu"] * bus_info["vn_kv"], 4),
            p_mw=round(row["p_mw"], 4),
            q_mvar=round(row["q_mvar"], 4),
        ))

    line_results = []
    for idx, row in net.res_line.iterrows():
        line_info = net.line.loc[idx]
        line_results.append(LineResult(
            line_name=line_info["name"],
            from_bus=idx_to_id[int(line_info["from_bus"])],
            to_bus=idx_to_id[int(line_info["to_bus"])],
            p_from_mw=round(row["p_from_mw"], 4),
            q_from_mvar=round(row["q_from_mvar"], 4),
            p_to_mw=round(row["p_to_mw"], 4),
            q_to_mvar=round(row["q_to_mvar"], 4),
            i_from_ka=round(row["i_from_ka"], 6),
            loading_percent=round(row["loading_percent"], 2),
        ))

    trafo_results = []
    for idx, row in net.res_trafo.iterrows():
        trafo_info = net.trafo.loc[idx]
        trafo_results.append(TransformerResult(
            trafo_name=trafo_info["name"],
            hv_bus=idx_to_id[int(trafo_info["hv_bus"])],
            lv_bus=idx_to_id[int(trafo_info["lv_bus"])],
            p_hv_mw=round(row["p_hv_mw"], 4),
            q_hv_mvar=round(row["q_hv_mvar"], 4),
            p_lv_mw=round(row["p_lv_mw"], 4),
            q_lv_mvar=round(row["q_lv_mvar"], 4),
            loading_percent=round(row["loading_percent"], 2),
        ))

    total_loss = float(net.res_line["pl_mw"].sum() + net.res_trafo["pl_mw"].sum())

    return LoadFlowResult(
        converged=True,
        buses=bus_results,
        lines=line_results,
        transformers=trafo_results,
        total_loss_mw=round(total_loss, 4),
    )


def run_shortcircuit(data: NetworkInput) -> ShortCircuitResult:
    import pandapower.shortcircuit as sc
    net, id_to_idx = _build_network(data)
    idx_to_id = {v: k for k, v in id_to_idx.items()}

    sc.calc_sc(net, fault="3ph", case="max", ip=False, ith=False)

    bus_results = []
    for idx, row in net.res_bus_sc.iterrows():
        bus_info = net.bus.loc[idx]
        vn_kv = bus_info["vn_kv"]
        ikss = row["ikss_ka"]
        sk = round(np.sqrt(3) * vn_kv * ikss, 4)
        bus_results.append(BusScResult(
            bus_id=idx_to_id[idx],
            name=bus_info["name"],
            ikss_ka=round(ikss, 6),
            sk_mva=sk,
        ))

    return ShortCircuitResult(buses=bus_results)


def compute_xr_ratio(rk_ohm: float, xk_ohm: float) -> float:
    """단락점의 X/R 비율. R이 사실상 0이면(순수 리액턴스 경로) 20.0으로 근사하고,
    극단값은 IEC 60909가 표로 제공하는 범위인 [1, 100]으로 clamp한다."""
    xr = xk_ohm / rk_ohm if rk_ohm > 1e-9 else 20.0
    return max(1.0, min(xr, 100.0))


def rms_asym_ka(ikss_ka: float, xr_ratio: float, n_cycles: float) -> float:
    """IEC 60909 기반 n사이클 시점 비대칭 RMS 전류 [kA].
    I(t) = Ik'' * sqrt(1 + 2 * exp(-4π * n_cycles / (X/R)))
    직류분이 시간이 지나며 감쇠하므로, n_cycles가 커질수록 Ik''에 수렴한다.
    """
    return ikss_ka * np.sqrt(1.0 + 2.0 * np.exp(-4.0 * np.pi * n_cycles / xr_ratio))


def run_shortcircuit_cycles(data: NetworkInput) -> MultiCycleScResult:
    """3상 단락 다주기 해석 (1/2, 3, 5 사이클 비대칭 RMS 전류)."""
    import pandapower.shortcircuit as sc
    net, id_to_idx = _build_network(data)
    idx_to_id = {v: k for k, v in id_to_idx.items()}

    sc.calc_sc(net, fault="3ph", case="max", ip=True, ith=False)

    bus_results = []
    for idx, row in net.res_bus_sc.iterrows():
        bus_info = net.bus.loc[idx]
        vn_kv = float(bus_info["vn_kv"])
        ikss = float(row["ikss_ka"])
        ip   = float(row["ip_ka"])
        rk   = float(row["rk_ohm"])
        xk   = float(row["xk_ohm"])

        xr = compute_xr_ratio(rk, xk)
        sk = round(np.sqrt(3) * vn_kv * ikss, 4)

        bus_results.append(BusCycleScResult(
            bus_id=idx_to_id[idx],
            name=bus_info["name"],
            vn_kv=vn_kv,
            ikss_ka=round(ikss, 5),
            ip_ka=round(ip, 5),
            sk_mva=sk,
            xr_ratio=round(xr, 2),
            i_half_cycle_ka=round(rms_asym_ka(ikss, xr, 0.5), 5),
            i_3cycle_ka=round(rms_asym_ka(ikss, xr, 3.0), 5),
            i_5cycle_ka=round(rms_asym_ka(ikss, xr, 5.0), 5),
        ))

    return MultiCycleScResult(buses=bus_results)

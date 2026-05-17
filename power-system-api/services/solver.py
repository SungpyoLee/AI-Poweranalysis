import pandapower as pp
import pandapower.shortcircuit as sc
import numpy as np
from models.network import NetworkInput
from models.results import (
    LoadFlowResult, BusResult, LineResult, TransformerResult,
    ShortCircuitResult, BusScResult,
    MultiCycleScResult, BusCycleScResult,
)


def _build_network(data: NetworkInput) -> tuple[pp.pandapowerNet, dict[int, int]]:
    """NetworkInput → pandapower net 변환. bus_id → pp index 매핑도 반환."""
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
        )

    return net, id_to_idx


def run_loadflow(data: NetworkInput) -> LoadFlowResult:
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


def run_shortcircuit_cycles(data: NetworkInput) -> MultiCycleScResult:
    """3상 단락 다주기 해석 (1/2, 3, 5 사이클 비대칭 RMS 전류)."""
    net, id_to_idx = _build_network(data)
    idx_to_id = {v: k for k, v in id_to_idx.items()}

    sc.calc_sc(net, fault="3ph", case="max", ip=True, ith=False)

    def rms_asym(ikss: float, xr: float, n_cycles: float) -> float:
        """IEC 60909 기반 n사이클 시점 비대칭 RMS 전류 [kA].
        I(t) = Ik'' * sqrt(1 + 2 * exp(-4π * n_cycles / (X/R)))
        """
        return ikss * np.sqrt(1.0 + 2.0 * np.exp(-4.0 * np.pi * n_cycles / xr))

    bus_results = []
    for idx, row in net.res_bus_sc.iterrows():
        bus_info = net.bus.loc[idx]
        vn_kv = float(bus_info["vn_kv"])
        ikss = float(row["ikss_ka"])
        ip   = float(row["ip_ka"])
        rk   = float(row["rk_ohm"])
        xk   = float(row["xk_ohm"])

        xr = xk / rk if rk > 1e-9 else 20.0
        xr = max(1.0, min(xr, 100.0))

        sk = round(np.sqrt(3) * vn_kv * ikss, 4)

        bus_results.append(BusCycleScResult(
            bus_id=idx_to_id[idx],
            name=bus_info["name"],
            vn_kv=vn_kv,
            ikss_ka=round(ikss, 5),
            ip_ka=round(ip, 5),
            sk_mva=sk,
            xr_ratio=round(xr, 2),
            i_half_cycle_ka=round(rms_asym(ikss, xr, 0.5), 5),
            i_3cycle_ka=round(rms_asym(ikss, xr, 3.0), 5),
            i_5cycle_ka=round(rms_asym(ikss, xr, 5.0), 5),
        ))

    return MultiCycleScResult(buses=bus_results)

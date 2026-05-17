from pydantic import BaseModel
from typing import Optional  # noqa: F401


class BusResult(BaseModel):
    bus_id: int
    name: str
    vm_pu: float           # 전압 크기 [pu]
    va_degree: float       # 전압 위상 [deg]
    vm_kv: float           # 전압 크기 [kV]
    p_mw: float            # 유효전력 주입 [MW]
    q_mvar: float          # 무효전력 주입 [MVAr]


class LineResult(BaseModel):
    line_name: str
    from_bus: int
    to_bus: int
    p_from_mw: float
    q_from_mvar: float
    p_to_mw: float
    q_to_mvar: float
    i_from_ka: float       # 전류 [kA]
    loading_percent: float # 부하율 [%]


class TransformerResult(BaseModel):
    trafo_name: str
    hv_bus: int
    lv_bus: int
    p_hv_mw: float
    q_hv_mvar: float
    p_lv_mw: float
    q_lv_mvar: float
    loading_percent: float


class LoadFlowResult(BaseModel):
    converged: bool
    buses: list[BusResult]
    lines: list[LineResult]
    transformers: list[TransformerResult]
    total_loss_mw: float


class BusScResult(BaseModel):
    bus_id: int
    name: str
    ikss_ka: float         # 초기 단락전류 [kA]
    sk_mva: float          # 단락용량 [MVA]
    rk_ohm: Optional[float] = None
    xk_ohm: Optional[float] = None


class ShortCircuitResult(BaseModel):
    buses: list[BusScResult]


class BusCycleScResult(BaseModel):
    bus_id: int
    name: str
    vn_kv: float
    ikss_ka: float          # 초기 대칭 단락전류 (RMS) [kA]
    ip_ka: float            # 첨두 단락전류 (피크) [kA]
    sk_mva: float           # 단락용량 [MVA]
    xr_ratio: float         # X/R 비율
    i_half_cycle_ka: float  # 1/2 사이클 비대칭 RMS [kA]
    i_3cycle_ka: float      # 3 사이클 비대칭 RMS [kA]
    i_5cycle_ka: float      # 5 사이클 비대칭 RMS [kA]


class MultiCycleScResult(BaseModel):
    buses: list[BusCycleScResult]

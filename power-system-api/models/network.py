from pydantic import BaseModel, Field
from typing import Optional


class Bus(BaseModel):
    id: int
    name: str
    vn_kv: float = Field(..., description="공칭전압 [kV]")
    type: str = Field("b", description="b=모선, n=노드, aux=보조")


class ExternalGrid(BaseModel):
    bus_id: int
    name: str = "외부계통"
    vm_pu: float = Field(1.0, description="전압 크기 [pu]")
    va_degree: float = Field(0.0, description="전압 위상 [deg]")
    s_sc_max_mva: float = Field(1000.0, description="최대 단락용량 [MVA]")
    s_sc_min_mva: float = Field(800.0, description="최소 단락용량 [MVA]")
    rx_max: float = Field(0.1, description="최대 R/X 비율")
    rx_min: float = Field(0.1, description="최소 R/X 비율")


class Load(BaseModel):
    bus_id: int
    name: str
    p_mw: float = Field(..., description="유효전력 [MW]")
    q_mvar: float = Field(0.0, description="무효전력 [MVAr]")


class Generator(BaseModel):
    bus_id: int
    name: str
    p_mw: float = Field(..., description="출력 유효전력 [MW]")
    vm_pu: float = Field(1.0, description="전압 설정값 [pu]")
    max_q_mvar: float = Field(999.0)
    min_q_mvar: float = Field(-999.0)


class Line(BaseModel):
    from_bus_id: int
    to_bus_id: int
    name: str
    length_km: float
    r_ohm_per_km: float = Field(..., description="저항 [Ω/km]")
    x_ohm_per_km: float = Field(..., description="리액턴스 [Ω/km]")
    c_nf_per_km: float = Field(0.0, description="정전용량 [nF/km]")
    max_i_ka: float = Field(1.0, description="최대전류 [kA]")


class Transformer(BaseModel):
    hv_bus_id: int
    lv_bus_id: int
    name: str
    sn_mva: float = Field(..., description="정격용량 [MVA]")
    vn_hv_kv: float = Field(..., description="1차측 공칭전압 [kV]")
    vn_lv_kv: float = Field(..., description="2차측 공칭전압 [kV]")
    vk_percent: float = Field(..., description="임피던스전압 [%]")
    vkr_percent: float = Field(1.0, description="저항분 임피던스전압 [%]")
    pfe_kw: float = Field(0.0, description="철손 [kW]")
    i0_percent: float = Field(0.0, description="여자전류 [%]")


class NetworkInput(BaseModel):
    name: str = "계통"
    f_hz: float = Field(60.0, description="계통 주파수 [Hz]")
    buses: list[Bus]
    external_grids: list[ExternalGrid]
    loads: list[Load] = []
    generators: list[Generator] = []
    lines: list[Line] = []
    transformers: list[Transformer] = []

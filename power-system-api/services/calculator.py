"""
전기 공학 계산 엔진
- 케이블 선정 (IEC 60364 / KS C IEC 60502)
- 단락전류 간이 계산 (IEC 60909)
- 변압기 용량 선정
- 과전류 계전기 정정
- 전동기 기동 전압강하
"""
import math
from dataclasses import dataclass


# ── CV XLPE 케이블 데이터 (IEC 60502, KS C IEC) ───────────────────────────────
# (단면적 mm², 허용전류_공중 A, 허용전류_덕트 A, 허용전류_지중 A, R Ω/km, X Ω/km)
CABLE_TABLE = [
    ( 2.5,  26,  22,  28, 7.41, 0.095),
    (   4,  35,  30,  38, 4.61, 0.095),
    (   6,  45,  38,  49, 3.08, 0.090),
    (  10,  61,  52,  67, 1.83, 0.088),
    (  16,  81,  70,  89, 1.15, 0.085),
    (  25, 106,  92, 116, 0.727, 0.082),
    (  35, 131, 113, 144, 0.524, 0.082),
    (  50, 158, 137, 175, 0.387, 0.080),
    (  70, 200, 173, 222, 0.268, 0.078),
    (  95, 241, 209, 269, 0.193, 0.076),
    ( 120, 278, 241, 310, 0.153, 0.075),
    ( 150, 318, 275, 356, 0.124, 0.075),
    ( 185, 362, 313, 405, 0.0991, 0.074),
    ( 240, 424, 367, 474, 0.0754, 0.073),
    ( 300, 486, 420, 543, 0.0601, 0.072),
    ( 400, 561, 485, 628, 0.0470, 0.071),
    ( 500, 632, 546, 708, 0.0366, 0.070),
    ( 630, 723, 626, 811, 0.0283, 0.069),
]

INSTALL_IDX = {'air': 1, 'duct': 2, 'ground': 3}

# 표준 변압기 용량 (kVA)
STD_TR_SIZES = [30, 50, 75, 100, 150, 200, 300, 500, 750, 1000,
                1500, 2000, 3000, 5000, 7500, 10000]


# ── 케이블 선정 ───────────────────────────────────────────────────────────────
@dataclass
class CableResult:
    size_mm2:        float
    ampacity_a:      float
    full_load_a:     float
    vdrop_pct:       float
    vdrop_limit_pct: float
    r_ohm_per_km:    float
    install_method:  str
    phases:          int
    ok:              bool
    message:         str


def calc_cable(
    voltage_v:      float,
    power_kw:       float,
    distance_m:     float = 100.0,
    power_factor:   float = 0.85,
    efficiency:     float = 1.0,
    vdrop_limit_pct:float = 3.0,
    install_method: str   = 'duct',
    phases:         int   = 3,
    parallel:       int   = 1,
) -> CableResult:
    """IEC 60364 케이블 선정"""
    pf  = max(power_factor, 0.01)
    eff = max(efficiency, 0.01)
    sin_phi = math.sqrt(max(1 - pf**2, 0))
    len_km  = distance_m / 1000
    col_idx = INSTALL_IDX.get(install_method, 2)

    # 전부하 전류
    if phases == 3:
        i_fl = (power_kw * 1000) / (math.sqrt(3) * voltage_v * pf * eff)
    else:
        i_fl = (power_kw * 1000) / (voltage_v * pf * eff)

    i_per_cable = i_fl / parallel

    # 허용전류로 1차 선정
    candidate = None
    for row in CABLE_TABLE:
        if row[col_idx] >= i_per_cable:
            candidate = row
            break

    if candidate is None:
        candidate = CABLE_TABLE[-1]

    # 전압강하 확인 → 초과 시 한 단계 올림
    def vdrop(row):
        r, x = row[4], row[5]
        if phases == 3:
            return (math.sqrt(3) * i_fl * (r * pf + x * sin_phi) * len_km / parallel) / voltage_v * 100
        else:
            return (2 * i_fl * (r * pf + x * sin_phi) * len_km / parallel) / voltage_v * 100

    vd = vdrop(candidate)
    idx = CABLE_TABLE.index(candidate)
    while vd > vdrop_limit_pct and idx < len(CABLE_TABLE) - 1:
        idx += 1
        candidate = CABLE_TABLE[idx]
        vd = vdrop(candidate)

    ok = vd <= vdrop_limit_pct

    install_names = {'air': '공중(트레이)', 'duct': '덕트', 'ground': '지중매설'}
    method_name   = install_names.get(install_method, install_method)
    parallel_str  = f" × {parallel}병렬" if parallel > 1 else ""

    return CableResult(
        size_mm2        = candidate[0],
        ampacity_a      = candidate[col_idx] * parallel,
        full_load_a     = i_fl,
        vdrop_pct       = round(vd, 2),
        vdrop_limit_pct = vdrop_limit_pct,
        r_ohm_per_km    = candidate[4],
        install_method  = method_name,
        phases          = phases,
        ok              = ok,
        message         = (
            f"CV {candidate[0]:.0f}mm²{parallel_str}\n"
            f"설치: {method_name} | 허용전류: {candidate[col_idx] * parallel:.0f}A\n"
            f"전부하전류: {i_fl:.1f}A | 전압강하: {vd:.2f}%"
            + (" ✅" if ok else f" ❌ (한도 {vdrop_limit_pct}% 초과)")
        ),
    )


def format_cable(p: dict) -> str:
    voltage_v = p.get('voltage_v')
    power_kw  = p.get('power_kw')
    if not voltage_v or not power_kw:
        return "⚠️ 전압(V/kV)과 용량(kW)을 입력해주세요.\n예) 380V 75kW 거리 150m 전압강하 3%"

    r = calc_cable(
        voltage_v       = voltage_v,
        power_kw        = power_kw,
        distance_m      = p.get('distance_m', 100),
        power_factor    = p.get('power_factor', 0.85),
        efficiency      = p.get('efficiency', 1.0),
        vdrop_limit_pct = p.get('vdrop_limit_pct', 3.0),
        install_method  = p.get('install_method', 'duct'),
        phases          = p.get('phases', 3),
        parallel        = p.get('parallel', 1),
    )

    vn_str = f"{voltage_v/1000:.1f}kV" if voltage_v >= 1000 else f"{voltage_v:.0f}V"
    phase_str = "3상" if r.phases == 3 else "단상"

    return (
        f"📋 케이블 선정 결과\n"
        f"{'─'*24}\n"
        f"계통: {phase_str} {vn_str} | 부하: {power_kw:.0f}kW\n"
        f"거리: {p.get('distance_m', 100):.0f}m | VD 한도: {r.vdrop_limit_pct}%\n"
        f"{'─'*24}\n"
        f"▶ {r.message}\n"
        f"{'─'*24}\n"
        f"IEC 60364 / KS C IEC 60502 기준\n"
        f"📱 상세 계통 해석 → power-system-ui.vercel.app"
    )


# ── 단락전류 간이 계산 (IEC 60909) ────────────────────────────────────────────
def format_shortcircuit(p: dict) -> str:
    voltage_v = p.get('voltage_v')
    if not voltage_v:
        return "⚠️ 계통 전압을 입력해주세요.\n예) 22.9kV 계통 단락용량 1000MVA 단락전류 계산"

    sc_mva = p.get('sc_mva', 1000)
    c_max  = 1.1
    vn_kv  = voltage_v / 1000

    # Thevenin 임피던스
    z_k = (c_max * vn_kv**2) / sc_mva  # Ω

    # 변압기 직렬 임피던스 (입력 있으면)
    tr_kva  = p.get('power_kva', 0) or (p.get('power_kw', 0) / 0.85 if p.get('power_kw') else 0)
    vk_pct  = p.get('vk_pct', 6.0)
    if tr_kva > 0:
        z_tr = (vk_pct / 100) * (vn_kv**2 / (tr_kva / 1000))
        z_total = z_k + z_tr
        tr_note = f"변압기 {tr_kva:.0f}kVA (vk={vk_pct}%) 포함"
    else:
        z_total = z_k
        tr_note = "변압기 미포함"

    i_base  = sc_mva * 1000 / (math.sqrt(3) * vn_kv)  # A
    ikss_ka = (c_max / z_total) * (vn_kv / math.sqrt(3)) / 1000
    # kappa ≈ 1.8 (보수적 근사, R/X=0.1 가정)
    kappa   = 1.8
    ip_ka   = kappa * math.sqrt(2) * ikss_ka

    return (
        f"⚡ 단락전류 계산 결과 (IEC 60909)\n"
        f"{'─'*24}\n"
        f"계통: {vn_kv:.1f}kV | 계통용량: {sc_mva:.0f}MVA\n"
        f"{tr_note}\n"
        f"{'─'*24}\n"
        f"▶ Ik'' (초기 대칭): {ikss_ka:.2f} kA\n"
        f"▶ Ip  (첨두전류): {ip_ka:.2f} kA\n"
        f"▶ Sk'' (단락용량): {ikss_ka * math.sqrt(3) * vn_kv:.1f} MVA\n"
        f"{'─'*24}\n"
        f"※ 간이 계산 (κ=1.8 가정)\n"
        f"📱 정밀 계산 → power-system-ui.vercel.app"
    )


# ── 변압기 용량 선정 ──────────────────────────────────────────────────────────
def format_transformer(p: dict) -> str:
    power_kw  = p.get('power_kw', 0)
    power_kva = p.get('power_kva', 0)
    pf        = p.get('power_factor', 0.85)
    df        = p.get('demand_factor', 0.8)
    count     = p.get('count', 1)

    total_kw  = power_kw * count if power_kw else 0
    total_kva = power_kva * count if power_kva else total_kw / max(pf, 0.01)

    if total_kva == 0:
        return "⚠️ 부하 용량을 입력해주세요.\n예) 100kW 전동기 5대 수용률 0.8 변압기 용량"

    required_kva = total_kva * df
    selected = next((s for s in STD_TR_SIZES if s >= required_kva), STD_TR_SIZES[-1])
    loading  = required_kva / selected * 100

    return (
        f"🔌 변압기 용량 선정\n"
        f"{'─'*24}\n"
        f"총 부하: {total_kva:.0f}kVA (수용률 {df*100:.0f}% 적용)\n"
        f"필요 용량: {required_kva:.0f}kVA\n"
        f"{'─'*24}\n"
        f"▶ 선정: {selected}kVA 변압기\n"
        f"▶ 부하율: {loading:.1f}%"
        + (" ✅" if loading <= 80 else " ⚠️ 80% 초과 — 상위 용량 검토") + "\n"
        f"{'─'*24}\n"
        f"📱 계통 해석 → power-system-ui.vercel.app"
    )


# ── 과전류 계전기 정정 (간이) ─────────────────────────────────────────────────
def format_relay(p: dict) -> str:
    voltage_v = p.get('voltage_v')
    power_kw  = p.get('power_kw', 0)
    power_kva = p.get('power_kva', 0)
    pf        = p.get('power_factor', 0.85)

    if not voltage_v:
        return "⚠️ 전압과 부하 용량을 입력해주세요.\n예) 6.6kV 500kVA 과전류 계전기 정정값"

    vn_kv = voltage_v / 1000
    kva   = power_kva or (power_kw / max(pf, 0.01))
    if kva == 0:
        return "⚠️ 부하 용량(kW 또는 kVA)을 입력해주세요."

    i_rated = kva / (math.sqrt(3) * vn_kv)  # A (1차측)

    # 픽업 전류: 정격의 125~150%
    pickup_lo = i_rated * 1.25
    pickup_hi = i_rated * 1.50

    # TMS (IEC Normal Inverse, TMS=0.3 기준): 동작시간 ≈ 0.5s @ 10× pickup
    tms_typical = 0.3

    return (
        f"🛡️ OCR 정정 참고값\n"
        f"{'─'*24}\n"
        f"계통: {vn_kv:.1f}kV | 부하: {kva:.0f}kVA\n"
        f"정격전류: {i_rated:.1f}A\n"
        f"{'─'*24}\n"
        f"▶ 픽업전류: {pickup_lo:.1f}A ~ {pickup_hi:.1f}A\n"
        f"  (정격의 125~150%)\n"
        f"▶ TMS: {tms_typical} (IEC Normal Inverse 기준)\n"
        f"  → 10× 배수에서 약 0.5초 동작\n"
        f"{'─'*24}\n"
        f"※ 보호협조 검토 필수\n"
        f"📱 TCC 차트 → power-system-ui.vercel.app"
    )


# ── 전동기 기동 전압강하 ──────────────────────────────────────────────────────
def format_motor(p: dict) -> str:
    voltage_v = p.get('voltage_v')
    power_kw  = p.get('power_kw')
    sc_mva    = p.get('sc_mva', 500)

    if not voltage_v or not power_kw:
        return "⚠️ 전압과 전동기 용량을 입력해주세요.\n예) 6.6kV 500kW 전동기 기동 전압강하"

    vn_kv   = voltage_v / 1000
    pf_run  = p.get('power_factor', 0.85)
    eff     = p.get('efficiency', 0.94)
    lrc     = 6.0  # 기동전류 배수 (DOL 기준)

    sm_mva  = power_kw / 1000 / (pf_run * eff)
    i_rated = sm_mva * 1000 / (math.sqrt(3) * vn_kv)
    i_start = i_rated * lrc

    # 기동 시 전압강하: ΔV/V = Istart × Zk / Vsys
    z_sys   = (1.1 * vn_kv**2) / sc_mva  # Ω
    vdrop   = (i_start * z_sys) / (vn_kv / math.sqrt(3) * 1000) * 100

    ok = vdrop <= 15  # 일반적 한도 15%

    return (
        f"⚙️ 전동기 기동 전압강하\n"
        f"{'─'*24}\n"
        f"전동기: {power_kw:.0f}kW / {vn_kv:.1f}kV (DOL 기동)\n"
        f"계통: {sc_mva:.0f}MVA\n"
        f"{'─'*24}\n"
        f"▶ 정격전류: {i_rated:.1f}A\n"
        f"▶ 기동전류: {i_start:.1f}A ({lrc:.0f}배)\n"
        f"▶ 기동 전압강하: {vdrop:.1f}%"
        + (" ✅" if ok else " ❌ 15% 초과 — Star-Delta/Soft-Starter 검토") + "\n"
        f"{'─'*24}\n"
        f"📱 상세 분석 → power-system-ui.vercel.app"
    )


# ── 통합 계산 디스패처 ────────────────────────────────────────────────────────
def calculate(query_type: str, params: dict) -> str:
    dispatch = {
        'cable':        format_cable,
        'shortcircuit': format_shortcircuit,
        'transformer':  format_transformer,
        'relay':        format_relay,
        'motor':        format_motor,
    }
    fn = dispatch.get(query_type, format_cable)
    return fn(params)

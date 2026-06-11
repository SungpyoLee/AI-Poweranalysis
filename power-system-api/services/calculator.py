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
    max_dist_m:      float = 0.0


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

    # 허용 최대 거리 역산
    r_c, x_c = candidate[4], candidate[5]
    z_eff = r_c * pf + x_c * sin_phi
    if z_eff > 0:
        if phases == 3:
            max_dist_m = (vdrop_limit_pct / 100 * voltage_v * parallel) / (math.sqrt(3) * i_fl * z_eff) * 1000
        else:
            max_dist_m = (vdrop_limit_pct / 100 * voltage_v * parallel) / (2 * i_fl * z_eff) * 1000
    else:
        max_dist_m = 99999.0

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
        max_dist_m      = round(max_dist_m, 0),
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

    vn_str    = f"{voltage_v/1000:.1f}kV" if voltage_v >= 1000 else f"{voltage_v:.0f}V"
    phase_str = "3상" if r.phases == 3 else "단상"
    parallel  = p.get('parallel', 1)

    # 병렬 제안 (VD 초과 시)
    parallel_note = ""
    if not r.ok:
        for np_ in range(2, 6):
            rp = calc_cable(
                voltage_v=voltage_v, power_kw=power_kw,
                distance_m=p.get('distance_m', 100),
                power_factor=p.get('power_factor', 0.85),
                efficiency=p.get('efficiency', 1.0),
                vdrop_limit_pct=r.vdrop_limit_pct,
                install_method=p.get('install_method', 'duct'),
                phases=p.get('phases', 3),
                parallel=np_,
            )
            if rp.ok:
                parallel_note = f"\n💡 {np_}병렬 시 VD: {rp.vdrop_pct:.2f}% ✅"
                break

    return (
        f"📋 케이블 선정 결과\n"
        f"{'─'*24}\n"
        f"계통: {phase_str} {vn_str} | 부하: {power_kw:.0f}kW\n"
        f"거리: {p.get('distance_m', 100):.0f}m | VD 한도: {r.vdrop_limit_pct}%\n"
        f"{'─'*24}\n"
        f"▶ {r.message}\n"
        f"허용거리: {r.max_dist_m:.0f}m (VD {r.vdrop_limit_pct}% 기준)"
        f"{parallel_note}\n"
        f"{'─'*24}\n"
        f"IEC 60364 / KS C IEC 60502 기준"
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


# ── 역률 개선 콘덴서 용량 ─────────────────────────────────────────────────────
STD_CAP_KVAR = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500, 600, 800, 1000]

def format_capacitor(p: dict) -> str:
    power_kw  = p.get('power_kw')
    pf_cur    = p.get('power_factor', 0.8)
    pf_tgt    = p.get('target_pf', 0.95)
    voltage_v = p.get('voltage_v', 380)

    if not power_kw:
        return "⚠️ 부하 용량(kW)을 입력해주세요.\n예) 380V 100kW 역률 0.75 목표 0.95 콘덴서"

    if pf_cur >= pf_tgt:
        return f"✅ 현재 역률 {pf_cur:.2f}가 목표 {pf_tgt:.2f} 이상입니다.\n콘덴서 불필요."

    tan1  = math.tan(math.acos(max(min(pf_cur, 0.9999), 0.01)))
    tan2  = math.tan(math.acos(max(min(pf_tgt, 0.9999), 0.01)))
    q_req = power_kw * (tan1 - tan2)

    selected = next((s for s in STD_CAP_KVAR if s >= q_req), STD_CAP_KVAR[-1])

    # 실제 선정 용량으로 달성 역률 역산
    q_act  = selected
    sin1   = math.sin(math.acos(max(min(pf_cur, 0.9999), 0.01)))
    kva_b  = power_kw / pf_cur
    q_load = kva_b * sin1
    q_new  = max(q_load - q_act, 0)
    kva_a  = math.sqrt(power_kw**2 + q_new**2)
    pf_ach = min(power_kw / kva_a, 1.0) if kva_a > 0 else 1.0

    vn_str  = f"{voltage_v/1000:.1f}kV" if voltage_v >= 1000 else f"{voltage_v:.0f}V"
    i_b = kva_b * 1000 / (math.sqrt(3) * voltage_v)
    i_a = kva_a * 1000 / (math.sqrt(3) * voltage_v)

    return (
        f"🔋 역률 개선 콘덴서 계산\n"
        f"{'─'*24}\n"
        f"부하: {power_kw:.0f}kW | {vn_str}\n"
        f"현재 역률: {pf_cur:.2f} → 목표: {pf_tgt:.2f}\n"
        f"{'─'*24}\n"
        f"▶ 필요 용량: {q_req:.1f}kVAR\n"
        f"▶ 선정: {selected}kVAR 콘덴서\n"
        f"{'─'*24}\n"
        f"달성 역률: {pf_ach:.3f}\n"
        f"전류 절감: {i_b:.1f}A → {i_a:.1f}A\n"
        f"  ({(i_b - i_a) / i_b * 100:.1f}% 감소)\n"
        f"{'─'*24}\n"
        f"※ 공진 주파수 검토 권장 (5·7차 고조파)"
    )


# ── 발전기 용량 선정 ──────────────────────────────────────────────────────────
STD_GEN_KVA = [30, 50, 75, 100, 150, 200, 250, 300, 400, 500,
               600, 750, 800, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000]

START_METHOD = {
    'dol':          (6.0, 'DOL(직입)'),
    'star_delta':   (2.0, 'Y-Δ 기동'),
    'soft_starter': (2.5, '소프트스타터'),
    'vfd':          (1.1, 'VFD(인버터)'),
}

def format_generator(p: dict) -> str:
    power_kw = p.get('power_kw')
    if not power_kw:
        return "⚠️ 전동기 용량(kW)을 입력해주세요.\n예) 500kW 전동기 DOL 기동 발전기 용량"

    pf       = p.get('power_factor', 0.85)
    eff      = p.get('efficiency', 0.94)
    method   = p.get('start_method', 'dol')
    lrc, method_name = START_METHOD.get(method, START_METHOD['dol'])

    # 전동기 정격 kVA, 기동 kVA
    rated_kva = power_kw / (pf * eff)
    start_kva = rated_kva * lrc

    # 발전기 선정: Xd''=0.25, 허용 전압강하 25% 기준
    # S_gen ≥ S_start × Xd'' / VD = S_start × 0.25 / 0.25 = S_start
    xd_pp    = 0.25
    vd_allow = 0.25
    gen_min  = start_kva * xd_pp / vd_allow  # = start_kva (이 기준에서)
    gen_min  = max(gen_min, rated_kva * 1.25)  # 최소 정격 부하의 125%

    selected = next((s for s in STD_GEN_KVA if s >= gen_min), STD_GEN_KVA[-1])
    gen_kw   = selected * 0.8  # pf=0.8 기준 출력 kW

    # 기동 시 전압강하 역산
    vd_act = start_kva / (start_kva + selected) * 100

    return (
        f"🏭 발전기 용량 선정\n"
        f"{'─'*24}\n"
        f"전동기: {power_kw:.0f}kW | {method_name}\n"
        f"기동전류 배수: {lrc:.1f}× | 정격 {rated_kva:.0f}kVA\n"
        f"{'─'*24}\n"
        f"기동 kVA: {start_kva:.0f}kVA\n"
        f"{'─'*24}\n"
        f"▶ 최소 발전기: {gen_min:.0f}kVA\n"
        f"▶ 선정: {selected}kVA ({gen_kw:.0f}kW) 발전기\n"
        f"기동 전압강하: {vd_act:.1f}%"
        + (" ✅" if vd_act <= 25 else " ⚠️ 25% 초과") + "\n"
        f"{'─'*24}\n"
        f"※ 운전 부하 포함 시 재검토 필요"
    )


# ── 차단기 정격 선정 ──────────────────────────────────────────────────────────
STD_MCCB = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125,
            160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250,
            1600, 2000, 2500, 3200, 4000]

def format_breaker(p: dict) -> str:
    voltage_v = p.get('voltage_v')
    power_kw  = p.get('power_kw', 0)
    power_kva = p.get('power_kva', 0)
    pf        = p.get('power_factor', 0.85)
    eff       = p.get('efficiency', 0.94)
    phases    = p.get('phases', 3)

    if not voltage_v:
        return "⚠️ 전압과 부하 용량을 입력해주세요.\n예) 380V 75kW 전동기 MCCB 선정"

    vn_str = f"{voltage_v/1000:.1f}kV" if voltage_v >= 1000 else f"{voltage_v:.0f}V"

    # 전부하 전류 계산
    if power_kw:
        if phases == 3:
            i_fl = power_kw * 1000 / (math.sqrt(3) * voltage_v * pf * eff)
        else:
            i_fl = power_kw * 1000 / (voltage_v * pf * eff)
        load_str = f"{power_kw:.0f}kW 전동기"
        factor, note = 2.5, "전동기 기동전류 250%"
    elif power_kva:
        if phases == 3:
            i_fl = power_kva * 1000 / (math.sqrt(3) * voltage_v)
        else:
            i_fl = power_kva * 1000 / voltage_v
        load_str = f"{power_kva:.0f}kVA"
        factor, note = 1.25, "피더 125%"
    else:
        return "⚠️ 부하 용량(kW 또는 kVA)을 입력해주세요."

    trip_min = i_fl * factor
    selected = next((s for s in STD_MCCB if s >= trip_min), STD_MCCB[-1])
    type_str = "ACB" if selected >= 1000 else "MCCB"

    # ELB (누전차단기) 정격
    elb = next((s for s in STD_MCCB if s >= i_fl * 1.25), STD_MCCB[-1])

    return (
        f"⚡ 차단기 선정 (IEC 60947-2)\n"
        f"{'─'*24}\n"
        f"계통: {vn_str} | 부하: {load_str}\n"
        f"전부하전류: {i_fl:.1f}A\n"
        f"{'─'*24}\n"
        f"▶ 최소 정격: {trip_min:.0f}A ({note})\n"
        f"▶ {type_str} 선정: {selected}A\n"
        f"{'─'*24}\n"
        f"ELB(누전차단기): {elb}A / 30mA\n"
        f"케이블 허용전류 ≥ {selected}A 확인\n"
        f"{'─'*24}\n"
        f"※ 차단용량(Ics) ≥ 계통 단락전류"
    )


# ── 통합 계산 디스패처 ────────────────────────────────────────────────────────
def calculate(query_type: str, params: dict) -> str:
    dispatch = {
        'cable':        format_cable,
        'shortcircuit': format_shortcircuit,
        'transformer':  format_transformer,
        'relay':        format_relay,
        'motor':        format_motor,
        'capacitor':    format_capacitor,
        'generator':    format_generator,
        'breaker':      format_breaker,
    }
    fn = dispatch.get(query_type, format_cable)
    return fn(params)

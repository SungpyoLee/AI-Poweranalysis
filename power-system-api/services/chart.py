"""
계산 결과 차트 이미지 생성 (matplotlib Agg — headless)
Render Linux 환경에서 Korean 폰트 미지원 → 영문/숫자 레이블 사용
"""
import matplotlib
matplotlib.use('Agg')

import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from io import BytesIO
import math

plt.rcParams.update({
    'font.family': 'DejaVu Sans',
    'font.size': 9,
    'figure.facecolor': 'white',
    'axes.facecolor': '#f8f9fa',
    'axes.spines.top': False,
    'axes.spines.right': False,
})

_OK   = '#28a745'
_WARN = '#ffc107'
_FAIL = '#dc3545'
_LIM  = '#fd7e14'
_HEAD = '#343a40'
_ROW1 = '#f8f9fa'
_ROW2 = 'white'


def _to_png(fig) -> bytes:
    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()


def cable_chart(params: dict) -> bytes:
    from services.calculator import calc_cable

    v       = params['voltage_v']
    pw      = params['power_kw']
    dist    = params.get('distance_m', 100)
    pf      = params.get('power_factor', 0.85)
    eff     = params.get('efficiency', 1.0)
    vdlim   = params.get('vdrop_limit_pct', 3.0)
    method  = params.get('install_method', 'duct')
    phases  = params.get('phases', 3)
    parallel= params.get('parallel', 1)

    r = calc_cable(voltage_v=v, power_kw=pw, distance_m=dist,
                   power_factor=pf, efficiency=eff, vdrop_limit_pct=vdlim,
                   install_method=method, phases=phases, parallel=parallel)

    vn_str = f"{v/1000:.1f}kV" if v >= 1000 else f"{v:.0f}V"
    pstr   = f"x{parallel}" if parallel > 1 else ""

    fig = plt.figure(figsize=(8, 4), facecolor='white')
    gs  = gridspec.GridSpec(1, 2, width_ratios=[1.5, 0.8], wspace=0.25,
                             left=0.02, right=0.98, top=0.88, bottom=0.12)

    # ── 결과 테이블 ───────────────────────────────────────────────────────────
    ax_t = fig.add_subplot(gs[0])
    ax_t.axis('off')

    rows = [
        ['System',     f"{phases}Φ  {vn_str}"],
        ['Load',       f"{pw:.0f} kW"],
        ['Distance',   f"{dist:.0f} m"],
        ['Install',    r.install_method],
        ['PF / Eff',   f"{pf:.2f} / {eff:.2f}"],
        ['VD Limit',   f"{vdlim:.1f} %"],
        ['──────',    '──────────'],
        ['Selected',   f"CV {r.size_mm2:.0f} mm²{pstr}"],
        ['Ampacity',   f"{r.ampacity_a:.0f} A"],
        ['Full-Load I',f"{r.full_load_a:.1f} A"],
        ['VD %',       f"{r.vdrop_pct:.2f} %"],
        ['Max Dist',   f"{r.max_dist_m:.0f} m"],
        ['Result',     '✓ PASS' if r.ok else '✗ FAIL'],
    ]

    cc = []
    for i, row in enumerate(rows):
        base = _ROW1 if i % 2 == 0 else _ROW2
        if row[0] == 'Result':
            v2 = '#d4edda' if r.ok else '#f8d7da'
        elif row[0] == 'Selected':
            v2 = '#d1ecf1'
        elif row[0] == '──────':
            v2 = '#e9ecef'
        else:
            v2 = base
        cc.append([base, v2])

    tbl = ax_t.table(cellText=rows, cellColours=cc,
                      cellLoc='left', loc='center', edges='open')
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(9)
    tbl.scale(1, 1.35)
    for (row, col), cell in tbl.get_celld().items():
        cell.set_edgecolor('#dee2e6')
        cell.set_linewidth(0.4)
        if col == 0:
            cell.set_text_props(fontweight='bold', color='#495057')

    ax_t.set_title('Cable Sizing  (IEC 60364)', fontsize=12,
                    fontweight='bold', pad=8, color=_HEAD)

    # ── VD% 가로 바 차트 ──────────────────────────────────────────────────────
    ax_v = fig.add_subplot(gs[1])
    color = _OK if r.ok else _FAIL
    max_x = max(r.vdrop_pct, vdlim) * 1.35 + 0.05

    ax_v.barh(0, r.vdrop_pct, color=color, height=0.45, zorder=3)
    ax_v.axvline(vdlim, color=_LIM, lw=2, linestyle='--', zorder=4,
                  label=f'Limit {vdlim:.1f}%')
    ax_v.set_xlim(0, max_x)
    ax_v.set_yticks([])
    ax_v.set_xlabel('Voltage Drop (%)')
    ax_v.legend(fontsize=8, loc='upper right')
    ax_v.text(r.vdrop_pct / 2, 0, f'{r.vdrop_pct:.2f}%',
              ha='center', va='center', fontsize=10,
              fontweight='bold', color='white', zorder=5)
    ax_v.set_title('VD Check', fontsize=11, fontweight='bold', pad=8)

    return _to_png(fig)


def sc_chart(params: dict) -> bytes:
    v      = params.get('voltage_v', 22900)
    sc_mva = params.get('sc_mva', 1000)
    vn_kv  = v / 1000
    c      = 1.1
    z_k    = (c * vn_kv**2) / sc_mva

    tr_kva = params.get('power_kva', 0) or (params.get('power_kw', 0) / 0.85 if params.get('power_kw') else 0)
    vk_pct = params.get('vk_pct', 6.0)
    if tr_kva > 0:
        z_tr    = (vk_pct / 100) * (vn_kv**2 / (tr_kva / 1000))
        z_total = z_k + z_tr
    else:
        z_total = z_k

    ikss_ka = (c / z_total) * (vn_kv / math.sqrt(3)) / 1000
    ip_ka   = 1.8 * math.sqrt(2) * ikss_ka
    sk_mva  = ikss_ka * math.sqrt(3) * vn_kv

    fig, ax = plt.subplots(figsize=(5.5, 3.5), facecolor='white')
    ax.set_facecolor(_ROW1)

    labels = ["Ik'' (kA)", "Ip (kA)", "Sk'' (MVA÷10)"]
    values = [ikss_ka, ip_ka, sk_mva / 10]
    actuals = [ikss_ka, ip_ka, sk_mva]
    units   = ['kA', 'kA', 'MVA']
    colors  = ['#3498db', '#e74c3c', '#2ecc71']

    bars = ax.barh(labels, values, color=colors, height=0.45)
    for bar, actual, unit in zip(bars, actuals, units):
        ax.text(bar.get_width() + max(values) * 0.02,
                bar.get_y() + bar.get_height() / 2,
                f'{actual:.2f} {unit}', va='center', fontsize=9, fontweight='bold')

    ax.set_xlabel('kA  (Sk scaled ÷10)')
    ax.set_xlim(0, max(values) * 1.4)
    ax.set_title(f"Short Circuit  {vn_kv:.1f} kV / {sc_mva:.0f} MVA  (IEC 60909)",
                  fontsize=11, fontweight='bold', pad=8, color=_HEAD)
    ax.tick_params(axis='y', length=0)

    return _to_png(fig)


def tr_chart(params: dict) -> bytes:
    pf    = params.get('power_factor', 0.85)
    df    = params.get('demand_factor', 0.8)
    count = params.get('count', 1)
    pw_kw = params.get('power_kw', 0)
    pw_kva= params.get('power_kva', 0)

    total_kva = pw_kva * count if pw_kva else (pw_kw * count / max(pf, 0.01))
    req_kva   = total_kva * df

    from services.calculator import STD_TR_SIZES
    selected = next((s for s in STD_TR_SIZES if s >= req_kva), STD_TR_SIZES[-1])
    loading  = req_kva / selected * 100

    ok_color = _OK if loading <= 80 else (_WARN if loading <= 100 else _FAIL)
    status   = 'OK' if loading <= 80 else ('CAUTION' if loading <= 100 else 'OVERLOAD')

    fig, ax = plt.subplots(figsize=(5, 4), facecolor='white',
                            subplot_kw=dict(aspect='equal'))

    ax.pie([loading, max(100 - loading, 0)],
           colors=[ok_color, '#dee2e6'],
           startangle=90, counterclock=False,
           wedgeprops=dict(width=0.42, edgecolor='white', linewidth=2))
    ax.text(0, 0, f'{loading:.0f}%\nLoad',
            ha='center', va='center', fontsize=17,
            fontweight='bold', color=ok_color)
    ax.set_title(f'Transformer  {selected} kVA  [{status}]',
                  fontsize=11, fontweight='bold', pad=10, color=_HEAD)

    return _to_png(fig)

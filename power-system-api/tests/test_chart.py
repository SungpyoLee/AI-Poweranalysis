"""
services/chart.py 단위 테스트.

matplotlib으로 그린 결과 자체(픽셀)를 검증하지 않는다. 대신 차트가 실제로
그리는 숫자가 계산기(services/calculator.py)의 정식 계산 함수가 내는 값과
일치하는지 — 특히 sc_chart()는 예전에 calc_shortcircuit()과 별개로 자체
공식을 복붙해 두고 있었고, 그 사본에 불필요한 "/1000"이 있어 Ik''/Ip/Sk''가
전부 실제 값의 1000분의 1로 표시됐다 — 를 검증한다.
"""
import pytest

from services.calculator import calc_shortcircuit
from services.chart import sc_chart


def _rendered_bar_labels(monkeypatch) -> list[str]:
    """sc_chart()가 그린 Figure를 PNG로 굽기 직전에 가로채, 막대 위에 적힌
    'x.xx unit' 텍스트 라벨들을 그대로 반환한다."""
    captured: list = []
    import services.chart as chart_mod

    def fake_to_png(fig):
        captured.append(fig)
        return b""

    monkeypatch.setattr(chart_mod, "_to_png", fake_to_png)
    sc_chart({"voltage_v": 22900, "sc_mva": 1000})

    fig = captured[0]
    ax = fig.axes[0]
    return [t.get_text() for t in ax.texts]


def test_sc_chart_bar_labels_match_calc_shortcircuit(monkeypatch):
    # 회귀: 예전엔 sc_chart 내부에서 ikss_ka를 다시 계산하면서 불필요한
    # "/1000"이 하나 더 있어, 여기서 나오는 라벨이 calc_shortcircuit()의
    # 실제 값(예: ~25.21 kA)이 아니라 그 1000분의 1(~0.03 kA)이었다.
    expected = calc_shortcircuit(voltage_v=22900, sc_mva=1000, tr_kva=0, vk_pct=6.0)
    labels = _rendered_bar_labels(monkeypatch)

    assert any(f"{expected.ikss_ka:.2f} kA" in t for t in labels), labels
    assert any(f"{expected.ip_ka:.2f} kA" in t for t in labels), labels
    assert any(f"{expected.sk_mva:.2f} MVA" in t for t in labels), labels

    # 예전 버그였다면 이 값들이 나왔을 것 — 혹시라도 되돌아오면 바로 잡아낸다.
    buggy_ikss = expected.ikss_ka / 1000
    assert not any(f"{buggy_ikss:.2f} kA" in t for t in labels), labels

"""
services/solver.py가 pandapower를 모듈 로드 시점이 아니라 실제 계산
함수 호출 시점에 지연 임포트하는지 확인한다.

pandapower는 scipy/pandas/networkx를 끌고 오는 무거운 임포트다. main.py는
loadflow/shortcircuit 라우터와 kakao_bot 라우터를 같은 프로세스에 함께
등록하므로, solver.py가 모듈 최상단에서 pandapower를 임포트하면 카카오봇
전용 요청(pandapower를 전혀 쓰지 않음)도 Render 무료 티어 콜드 스타트 시
이 임포트 비용을 덤으로 지불하게 된다.

이미 다른 테스트 파일들이 최상단에서 `import pandapower`를 하므로 같은
프로세스 안에서는 이 성질을 검증할 수 없다 — 별도 프로세스를 띄워 확인한다.
"""
import subprocess
import sys


def test_importing_solver_module_does_not_import_pandapower():
    code = (
        "import sys\n"
        "import services.solver\n"
        "assert not any(m == 'pandapower' or m.startswith('pandapower.') for m in sys.modules), "
        "'importing services.solver must not eagerly import pandapower'\n"
        "print('OK')\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stderr
    assert "OK" in result.stdout


def test_run_loadflow_still_works_after_lazy_import():
    """지연 임포트로 바꾼 뒤에도 실제 호출하면 정상적으로 pandapower가 로드되고 계산이 도는지 확인."""
    from models.network import Bus, ExternalGrid, NetworkInput
    from services.solver import run_loadflow

    net_input = NetworkInput(
        buses=[Bus(id=1, name="B1", vn_kv=22.9)],
        external_grids=[ExternalGrid(bus_id=1, s_sc_max_mva=1000, s_sc_min_mva=800)],
    )
    result = run_loadflow(net_input)
    assert result.converged is True

from fastapi import APIRouter, HTTPException
from models.network import NetworkInput
from models.results import ShortCircuitResult, MultiCycleScResult
from services.solver import run_shortcircuit, run_shortcircuit_cycles

router = APIRouter(prefix="/shortcircuit", tags=["단락계산"])


@router.post("/run", response_model=ShortCircuitResult, summary="3상 단락계산 실행")
def shortcircuit(data: NetworkInput):
    try:
        result = run_shortcircuit(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result


@router.post("/cycles", response_model=MultiCycleScResult, summary="3상 단락 다주기 해석 (1/2·3·5 사이클)")
def shortcircuit_cycles(data: NetworkInput):
    try:
        result = run_shortcircuit_cycles(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result

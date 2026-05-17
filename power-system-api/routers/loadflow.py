from fastapi import APIRouter, HTTPException
from models.network import NetworkInput
from models.results import LoadFlowResult
from services.solver import run_loadflow

router = APIRouter(prefix="/loadflow", tags=["조류계산"])


@router.post("/run", response_model=LoadFlowResult, summary="조류계산 실행")
def loadflow(data: NetworkInput):
    try:
        result = run_loadflow(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result

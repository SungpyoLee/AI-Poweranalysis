import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import loadflow, shortcircuit, kakao_bot

app = FastAPI(
    title="전력계통 해석 API",
    description="조류계산 및 단락계산을 제공하는 REST API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(loadflow.router)
app.include_router(shortcircuit.router)
app.include_router(kakao_bot.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    detail = f"{type(exc).__name__}: {exc}"
    tb = traceback.format_exc()
    print(f"[500] {request.url}\n{tb}")
    return JSONResponse(status_code=500, content={"detail": detail, "traceback": tb})


@app.get("/", tags=["상태"])
def root():
    return {"status": "ok", "message": "전력계통 해석 API 실행 중"}

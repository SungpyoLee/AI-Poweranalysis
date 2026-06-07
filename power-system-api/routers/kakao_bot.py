"""
카카오 i 오픈빌더 Webhook 라우터
POST /kakao/webhook  ← 카카오 서버에서 호출
"""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.parser import smart_parse
from services.calculator import calculate
import logging

router = APIRouter(prefix="/kakao", tags=["카카오봇"])
logger = logging.getLogger(__name__)

# ── 도움말 메시지 ─────────────────────────────────────────────────────────────
HELP_TEXT = """⚡ PowerFlow 전기 계산 챗봇

【케이블 선정】
예) 380V 75kW 거리 150m 전압강하 3%
예) 22.9kV 500kW 케이블 선정 역률 0.9

【단락전류 계산】
예) 22.9kV 계통 1000MVA 단락전류
예) 6.6kV 단락전류 계산

【변압기 용량 선정】
예) 100kW 전동기 5대 수용률 0.8 변압기
예) 총 부하 500kW 변압기 선정

【과전류 계전기 정정】
예) 6.6kV 500kVA OCR 정정값

【전동기 기동 전압강하】
예) 6.6kV 500kW 전동기 기동 전압강하

궁금한 내용을 자유롭게 입력하세요!
📱 상세 분석: power-system-ui.vercel.app"""

WELCOME_TEXT = """안녕하세요! ⚡
PowerFlow 전기 계산 챗봇입니다.

케이블 선정, 단락전류, 변압기 용량,
계전기 정정값을 바로 계산해드립니다.

'도움말'을 입력하시면 사용법을 안내해드립니다."""

# ── 카카오 응답 포맷터 ────────────────────────────────────────────────────────
def kakao_text(text: str) -> dict:
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"simpleText": {"text": text}}],
            "quickReplies": [
                {"label": "케이블 선정", "action": "message",
                 "messageText": "380V 75kW 거리 150m 전압강하 3% 케이블 선정"},
                {"label": "단락전류",   "action": "message",
                 "messageText": "22.9kV 계통 1000MVA 단락전류 계산"},
                {"label": "변압기 선정","action": "message",
                 "messageText": "100kW 전동기 5대 수용률 0.8 변압기 용량"},
                {"label": "도움말",     "action": "message",
                 "messageText": "도움말"},
            ],
        },
    }

# ── Webhook 엔드포인트 ────────────────────────────────────────────────────────
@router.post("/webhook")
async def kakao_webhook(request: Request):
    try:
        body = await request.json()
        user_text: str = body.get("userRequest", {}).get("utterance", "").strip()
        logger.info(f"[카카오봇] 입력: {user_text!r}")

        # 인사·도움말 처리
        if not user_text or user_text in ("처음으로", "시작", "start"):
            return JSONResponse(kakao_text(WELCOME_TEXT))

        if any(kw in user_text for kw in ("도움말", "help", "사용법", "?", "뭐", "기능")):
            return JSONResponse(kakao_text(HELP_TEXT))

        # 계산 실행
        query_type, params = smart_parse(user_text)
        logger.info(f"[카카오봇] 유형={query_type}, 파라미터={params}")

        answer = calculate(query_type, params)
        return JSONResponse(kakao_text(answer))

    except Exception as e:
        logger.error(f"[카카오봇] 오류: {e}", exc_info=True)
        return JSONResponse(kakao_text(
            "⚠️ 계산 중 오류가 발생했습니다.\n"
            "입력 형식을 확인해주세요.\n\n"
            "'도움말'을 입력하면 예시를 볼 수 있습니다."
        ))

# ── 헬스체크 (Render cold start 대비) ────────────────────────────────────────
@router.get("/health")
def health():
    return {"status": "ok", "service": "kakao-bot"}

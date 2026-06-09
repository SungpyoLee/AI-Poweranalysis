"""
카카오 i 오픈빌더 Webhook 라우터
POST /kakao/webhook  ← 카카오 서버에서 호출

대화 맥락 기억:
  user_context[user_id] = {"query_type": str, "params": dict}
  핵심 파라미터(전압·용량) 없는 메시지 → 이전 컨텍스트에 덮어씌움
  ex) "380V 75kW 150m" → 저장
      "거리 200m로 바꿔줘" → 전압·용량 유지, 거리만 변경
"""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.parser import smart_parse, REQUIRED_BY_TYPE
from services.calculator import calculate
import logging

router = APIRouter(prefix="/kakao", tags=["카카오봇"])
logger = logging.getLogger(__name__)

# ── 인메모리 컨텍스트 (서버 재시작 시 초기화, UptimeRobot으로 유지) ─────────
user_context: dict[str, dict] = {}
MAX_USERS = 2000  # 메모리 누수 방지

# ── 도움말 ────────────────────────────────────────────────────────────────────
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

💡 이전 계산 조건 유지하며 일부만 변경 가능
예) "거리 200m로 바꿔줘"
예) "역률 0.9로 변경"
예) "다시 계산해줘"

📱 상세 분석: power-system-ui.vercel.app"""

WELCOME_TEXT = """안녕하세요! ⚡
PowerFlow 전기 계산 챗봇입니다.

케이블 선정, 단락전류, 변압기 용량,
계전기 정정값을 바로 계산해드립니다.

이전 계산 조건을 기억하므로
일부만 바꿔서 재계산할 수 있습니다.

'도움말'을 입력하시면 예시를 볼 수 있습니다."""

# ── 컨텍스트 관리 ─────────────────────────────────────────────────────────────
def load_context(user_id: str) -> dict:
    return user_context.get(user_id, {})

def save_context(user_id: str, query_type: str, params: dict):
    if len(user_context) >= MAX_USERS:
        # 가장 오래된 유저 제거
        oldest = next(iter(user_context))
        del user_context[oldest]
    user_context[user_id] = {
        "query_type": query_type,
        "params": {k: v for k, v in params.items() if v is not None},
    }

def clear_context(user_id: str):
    user_context.pop(user_id, None)

def merge_context(
    user_id:   str,
    new_type:  str,
    new_params: dict,
) -> tuple[str, dict]:
    """
    새 파라미터와 이전 컨텍스트 병합.
    핵심 파라미터(전압·용량)가 새 메시지에 없으면 이전 값 유지.
    """
    ctx       = load_context(user_id)
    prev_type = ctx.get("query_type", new_type)
    prev_params = ctx.get("params", {})

    # 새 메시지에 핵심 파라미터가 있으면 → 새 쿼리로 판단
    required  = REQUIRED_BY_TYPE.get(new_type, ["voltage_v"])
    is_new_query = all(new_params.get(k) for k in required)

    if is_new_query:
        # 완전히 새 계산: 이전 컨텍스트 무시
        # install_method / phases 같은 부가 정보는 기존 것 유지
        base = {k: v for k, v in prev_params.items()
                if k in ("install_method", "phases", "power_factor", "efficiency")}
        merged = {**base, **new_params}
        return new_type, merged
    else:
        # 부분 변경: 이전 컨텍스트에 새 값 덮어씌움
        merged = {**prev_params, **{k: v for k, v in new_params.items() if v is not None}}
        return prev_type, merged

# ── 재계산 키워드 감지 ────────────────────────────────────────────────────────
RECALC_KEYWORDS = ["다시", "재계산", "다시계산", "recalc", "다시 계산"]
RESET_KEYWORDS  = ["초기화", "리셋", "새로", "처음부터", "reset"]

# ── 카카오 응답 포맷터 ────────────────────────────────────────────────────────
def kakao_text(text: str, quick_replies: list | None = None) -> dict:
    qr = quick_replies or [
        {"label": "케이블 선정",  "action": "message",
         "messageText": "380V 75kW 거리 150m 전압강하 3% 케이블 선정"},
        {"label": "단락전류",    "action": "message",
         "messageText": "22.9kV 계통 1000MVA 단락전류 계산"},
        {"label": "변압기 선정", "action": "message",
         "messageText": "100kW 전동기 5대 수용률 0.8 변압기 용량"},
        {"label": "도움말",      "action": "message",
         "messageText": "도움말"},
    ]
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"simpleText": {"text": text}}],
            "quickReplies": qr,
        },
    }

def kakao_text_with_context_replies(text: str, query_type: str) -> dict:
    """계산 완료 후 — 맥락 활용 빠른 버튼 표시"""
    label_map = {
        "cable":        [("거리 2배로",    "거리 바꿔줘"),
                         ("역률 0.9로",    "역률 0.9로 변경"),
                         ("지중 매설로",   "지중 매설로 변경"),
                         ("다시 계산",     "다시 계산해줘")],
        "shortcircuit": [("다시 계산",     "다시 계산해줘"),
                         ("케이블 선정",   "케이블 선정"),
                         ("변압기 선정",   "변압기 선정"),
                         ("도움말",        "도움말")],
        "transformer":  [("수용률 0.9로",  "수용률 0.9로 변경"),
                         ("다시 계산",     "다시 계산해줘"),
                         ("케이블 선정",   "케이블 선정"),
                         ("도움말",        "도움말")],
    }
    pairs = label_map.get(query_type, [
        ("다시 계산", "다시 계산해줘"),
        ("케이블 선정", "케이블 선정"),
        ("도움말", "도움말"),
    ])
    qr = [{"label": lbl, "action": "message", "messageText": msg}
          for lbl, msg in pairs]
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"simpleText": {"text": text}}],
            "quickReplies": qr,
        },
    }

# ── Webhook 엔드포인트 ────────────────────────────────────────────────────────
@router.post("/webhook")
async def kakao_webhook(request: Request):
    try:
        body      = await request.json()
        user_text: str = body.get("userRequest", {}).get("utterance", "").strip()
        user_id:   str = body.get("userRequest", {}).get("user", {}).get("id", "anonymous")

        logger.info(f"[카카오봇] user={user_id[:8]}… 입력: {user_text!r}")

        # ── 특수 명령 처리 ──────────────────────────────────────────────────
        if not user_text or user_text in ("처음으로", "시작", "start"):
            return JSONResponse(kakao_text(WELCOME_TEXT))

        if any(kw in user_text for kw in RESET_KEYWORDS):
            clear_context(user_id)
            return JSONResponse(kakao_text(
                "✅ 이전 계산 조건이 초기화됐습니다.\n새로운 조건을 입력해주세요."
            ))

        if any(kw in user_text for kw in ("도움말", "help", "사용법", "기능")):
            return JSONResponse(kakao_text(HELP_TEXT))

        # ── 재계산 명령 ──────────────────────────────────────────────────────
        if any(kw in user_text for kw in RECALC_KEYWORDS):
            ctx = load_context(user_id)
            if not ctx:
                return JSONResponse(kakao_text(
                    "이전 계산 기록이 없습니다.\n조건을 다시 입력해주세요.\n\n예) 380V 75kW 거리 150m"
                ))
            query_type = ctx["query_type"]
            params     = ctx["params"]
            logger.info(f"[카카오봇] 재계산: type={query_type}, params={params}")
            answer = calculate(query_type, params)
            return JSONResponse(kakao_text_with_context_replies(answer, query_type))

        # ── 파싱 + 컨텍스트 병합 ────────────────────────────────────────────
        raw_type, raw_params = smart_parse(user_text)
        query_type, params   = merge_context(user_id, raw_type, raw_params)

        logger.info(f"[카카오봇] 유형={query_type}, 병합파라미터={params}")

        # ── 계산 실행 ────────────────────────────────────────────────────────
        answer = calculate(query_type, params)

        # 계산 성공 시 컨텍스트 저장
        save_context(user_id, query_type, params)

        # 이전 컨텍스트가 있었으면 "이전 조건 유지" 안내 추가
        prev_ctx = load_context(user_id)
        ctx_note = ""
        if prev_ctx and any(k in prev_ctx.get("params", {}) for k in
                            ("voltage_v", "power_kw", "distance_m")):
            ctx_note = "\n\n💡 일부 조건만 바꿔 재계산하려면:\n예) \"거리 200m로 바꿔줘\""

        return JSONResponse(
            kakao_text_with_context_replies(answer + ctx_note, query_type)
        )

    except Exception as e:
        logger.error(f"[카카오봇] 오류: {e}", exc_info=True)
        return JSONResponse(kakao_text(
            "⚠️ 계산 중 오류가 발생했습니다.\n"
            "입력 형식을 확인해주세요.\n\n"
            "'도움말'을 입력하면 예시를 볼 수 있습니다."
        ))

# ── 헬스체크 ─────────────────────────────────────────────────────────────────
@router.get("/health")
def health():
    return {"status": "ok", "service": "kakao-bot", "users_in_memory": len(user_context)}

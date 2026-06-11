"""
카카오 i 오픈빌더 Webhook 라우터
POST /kakao/webhook  ← 카카오 서버에서 호출

대화 맥락 기억:
  user_context[user_id] = {"query_type": str, "params": dict}
  핵심 파라미터(전압·용량) 없는 메시지 → 이전 컨텍스트에 덮어씌움

명판 인식:
  이미지 수신 → Gemini Vision → 파라미터 추출 → 계산 제안
"""
import uuid
from collections import OrderedDict
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, Response
from services.parser import smart_parse, REQUIRED_BY_TYPE
from services.calculator import calculate
from services.vision import (
    extract_image_url, recognize_nameplate,
    nameplate_to_params, format_nameplate_result,
)
import logging

router = APIRouter(prefix="/kakao", tags=["카카오봇"])
logger = logging.getLogger(__name__)

# ── 인메모리 컨텍스트 (서버 재시작 시 초기화, UptimeRobot으로 유지) ─────────
user_context: dict[str, dict] = {}
MAX_USERS = 2000

# ── 차트 이미지 캐시 ──────────────────────────────────────────────────────────
_img_cache: OrderedDict[str, bytes] = OrderedDict()
MAX_IMAGES = 150

def _cache_image(data: bytes) -> str:
    uid = uuid.uuid4().hex[:12]
    _img_cache[uid] = data
    if len(_img_cache) > MAX_IMAGES:
        _img_cache.popitem(last=False)
    return uid

# ── 도움말 ────────────────────────────────────────────────────────────────────
HELP_TEXT = """⚡ PowerFlow 전기 계산 챗봇

【📷 명판 자동 인식】
전동기·변압기 명판 사진을 보내주세요
→ 파라미터 자동 추출 후 계산

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

_WEB_BTN = {"label": "🌐 웹앱 분석", "action": "webLink",
             "webLinkUrl": "https://power-system-ui.vercel.app"}

def _context_qr(query_type: str) -> list:
    label_map = {
        "cable":        [("거리 2배로",   "거리 바꿔줘"),
                         ("역률 0.9로",   "역률 0.9로 변경"),
                         ("지중 매설로",  "지중 매설로 변경"),
                         ("다시 계산",    "다시 계산해줘")],
        "shortcircuit": [("다시 계산",    "다시 계산해줘"),
                         ("케이블 선정",  "케이블 선정"),
                         ("변압기 선정",  "변압기 선정"),
                         ("도움말",       "도움말")],
        "transformer":  [("수용률 0.9로", "수용률 0.9로 변경"),
                         ("다시 계산",    "다시 계산해줘"),
                         ("케이블 선정",  "케이블 선정"),
                         ("도움말",       "도움말")],
    }
    pairs = label_map.get(query_type, [
        ("다시 계산", "다시 계산해줘"),
        ("케이블 선정", "케이블 선정"),
        ("도움말", "도움말"),
    ])
    qr = [{"label": lbl, "action": "message", "messageText": msg} for lbl, msg in pairs]
    qr.append(_WEB_BTN)
    return qr


def kakao_text_with_context_replies(text: str, query_type: str) -> dict:
    return {
        "version": "2.0",
        "template": {
            "outputs": [{"simpleText": {"text": text}}],
            "quickReplies": _context_qr(query_type),
        },
    }


def kakao_image_response(text: str, query_type: str, params: dict) -> dict:
    """차트 이미지 + 텍스트 복합 응답. 차트 실패 시 텍스트만 반환."""
    chart_bytes = None
    try:
        from services.chart import cable_chart, sc_chart, tr_chart
        if query_type == 'cable' and params.get('voltage_v') and params.get('power_kw'):
            chart_bytes = cable_chart(params)
        elif query_type == 'shortcircuit' and params.get('voltage_v'):
            chart_bytes = sc_chart(params)
        elif query_type == 'transformer' and (params.get('power_kw') or params.get('power_kva')):
            chart_bytes = tr_chart(params)
    except Exception as e:
        logger.warning(f"차트 생성 실패 (텍스트 응답으로 대체): {e}")

    qr = _context_qr(query_type)

    if chart_bytes:
        uid     = _cache_image(chart_bytes)
        img_url = f"https://ai-poweranalysis.onrender.com/kakao/image/{uid}"
        return {
            "version": "2.0",
            "template": {
                "outputs": [
                    {"simpleImage": {"imageUrl": img_url, "altText": "계산 결과 차트"}},
                    {"simpleText": {"text": text}},
                ],
                "quickReplies": qr,
            },
        }

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

        # ── 전체 payload 디버그 로그 (이미지 구조 파악용) ──────────────────
        import json as _json
        logger.info(f"[DEBUG PAYLOAD] {_json.dumps(body, ensure_ascii=False)}")

        # ── 이미지 수신 → 명판 인식 (텍스트 체크보다 먼저!) ──────────────
        image_url = extract_image_url(body)
        if image_url:
            logger.info(f"[카카오봇] 이미지 수신: {image_url[:60]}…")

            # 인식 진행 중 안내 (Gemini Vision 처리 시간 ~2초)
            data = await recognize_nameplate(image_url)

            if "error" in data:
                return JSONResponse(kakao_text(format_nameplate_result(data)))

            # 인식 결과 포맷팅
            result_text = format_nameplate_result(data)

            # 추출된 파라미터를 컨텍스트에 저장
            query_type, params = nameplate_to_params(data)
            if params:
                save_context(user_id, query_type, params)

            # 계산 유도 버튼
            qr = []
            if data.get("voltage_v") and data.get("power_kw"):
                qr.append({"label": "케이블 선정",
                           "action": "message", "messageText": "케이블 선정해줘"})
                qr.append({"label": "기동 전압강하",
                           "action": "message", "messageText": "기동 전압강하 계산해줘"})
            if data.get("sn_kva"):
                qr.append({"label": "단락전류 계산",
                           "action": "message", "messageText": "단락전류 계산해줘"})
            qr.append({"label": "도움말", "action": "message", "messageText": "도움말"})

            return JSONResponse(kakao_text(result_text, quick_replies=qr))

        # ── 텍스트 비어있으면 환영 메시지 ────────────────────────────────────
        if not user_text or user_text in ("처음으로", "시작", "start"):
            return JSONResponse(kakao_text(WELCOME_TEXT))

        if any(kw in user_text for kw in RESET_KEYWORDS):
            clear_context(user_id)
            return JSONResponse(kakao_text(
                "✅ 이전 계산 조건이 초기화됐습니다.\n새로운 조건을 입력해주세요."
            ))

        if any(kw in user_text for kw in ("도움말", "help", "사용법", "기능")):
            return JSONResponse(kakao_text(HELP_TEXT))

        # ── 명판 인식 요청 키워드 ───────────────────────────────────────────
        if any(kw in user_text for kw in ("명판", "사진", "찍었어", "이미지", "명판인식")):
            return JSONResponse(kakao_text(
                "📷 명판 사진을 바로 보내주세요!\n\n"
                "전동기·변압기 명판이 잘 보이게 찍어서\n"
                "카카오톡 채팅창에 올려주시면\n"
                "전기 파라미터를 자동으로 읽어드립니다.\n\n"
                "💡 잘 찍는 법:\n"
                "• 명판 전체가 프레임 안에 들어오게\n"
                "• 빛 반사 없는 각도로\n"
                "• 흐리지 않게 가까이서",
                quick_replies=[
                    {"label": "직접 입력할게요", "action": "message",
                     "messageText": "380V 75kW 거리 150m"},
                    {"label": "도움말", "action": "message", "messageText": "도움말"},
                ]
            ))

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
            return JSONResponse(kakao_image_response(answer, query_type, params))

        # ── 파싱 + 컨텍스트 병합 ────────────────────────────────────────────
        raw_type, raw_params = smart_parse(user_text)
        query_type, params   = merge_context(user_id, raw_type, raw_params)

        logger.info(f"[카카오봇] 유형={query_type}, 병합파라미터={params}")

        # ── 계산 실행 ────────────────────────────────────────────────────────
        answer = calculate(query_type, params)

        # 계산 성공 시 컨텍스트 저장
        save_context(user_id, query_type, params)

        return JSONResponse(kakao_image_response(answer, query_type, params))

    except Exception as e:
        logger.error(f"[카카오봇] 오류: {e}", exc_info=True)
        return JSONResponse(kakao_text(
            "⚠️ 계산 중 오류가 발생했습니다.\n"
            "입력 형식을 확인해주세요.\n\n"
            "'도움말'을 입력하면 예시를 볼 수 있습니다."
        ))

# ── 차트 이미지 서빙 ─────────────────────────────────────────────────────────
@router.get("/image/{uid}")
async def serve_image(uid: str):
    data = _img_cache.get(uid)
    if not data:
        raise HTTPException(status_code=404, detail="Image not found or expired")
    return Response(content=data, media_type="image/png")


# ── 헬스체크 ─────────────────────────────────────────────────────────────────
@router.get("/health")
def health():
    import os
    key = os.getenv("GEMINI_API_KEY", "")
    return {
        "status": "ok",
        "service": "kakao-bot",
        "users_in_memory": len(user_context),
        "gemini_key_set": bool(key),
        "gemini_key_preview": key[:6] + "..." if len(key) > 6 else "(empty)",
    }

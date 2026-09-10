"""
카카오 i 오픈빌더 Webhook 라우터
POST /kakao/webhook  ← 카카오 서버에서 호출

대화 맥락 기억:
  user_context[user_id] = {"query_type": str, "params": dict}
  핵심 파라미터(전압·용량) 없는 메시지 → 이전 컨텍스트에 덮어씌움

명판 인식:
  이미지 수신 → Gemini Vision → 파라미터 추출 → 계산 제안

콜백(비동기) 응답:
  카카오 스킬 서버는 5초 안에 응답해야 하는데, Render 무료 티어 콜드
  스타트 후 첫 요청이나 Gemini 호출·차트 렌더링이 겹치면 5초를 넘길 수
  있다 — 이 경우 카카오는 그냥 무응답 처리한다. 오픈빌더에서 해당
  스킬의 "콜백 사용"이 켜져 있으면 요청에 userRequest.callbackUrl이
  실려오는데, 그럴 때는 즉시 useCallback 응답으로 확인만 보내고
  실제 계산은 백그라운드에서 마친 뒤 그 결과를 callbackUrl로 별도
  POST한다. callbackUrl이 없으면(콜백 미설정) 예전과 동일하게 동기
  응답한다 — 동작 변화 없이 안전하게 켤 수 있다.
"""
import logging
import uuid
from collections import OrderedDict

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from services.calculator import calculate
from services.parser import REQUIRED_BY_TYPE, smart_parse
from services.vision import (
    extract_image_url, format_nameplate_result,
    nameplate_to_params, recognize_nameplate,
)

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
    핵심 파라미터(전압·용량)가 새 메시지에 없으면 이전 값 유지 — 단,
    유형 자체가 바뀌었다면(예: 케이블 얘기하다 "변압기 효율은?") 그건
    "이전 대화의 연속"이 아니라 새 주제이므로 예전 유형·파라미터로
    답하면 안 된다. 예전엔 이 구분이 없어서, 유형이 바뀐 메시지에
    필수값이 없으면 완전히 무관한 이전 유형·파라미터로 조용히
    계산해버리는 문제가 있었다.
    """
    ctx       = load_context(user_id)
    prev_type = ctx.get("query_type", new_type)
    prev_params = ctx.get("params", {})
    topic_changed = bool(ctx) and new_type != prev_type

    # 새 메시지에 핵심 파라미터가 있거나, 유형 자체가 바뀌었으면 → 새 쿼리로 판단
    required  = REQUIRED_BY_TYPE.get(new_type, ["voltage_v"])
    has_required = all(new_params.get(k) for k in required)
    is_new_query = has_required or topic_changed

    if is_new_query:
        # 완전히 새 계산: 이전 컨텍스트 무시.
        # 다만 같은 유형 안에서의 새 계산이라면 install_method / phases 같은
        # 부가 정보는 유지한다 — 유형이 바뀌었다면 그마저도 관련 없으므로 버린다.
        base = {} if topic_changed else {
            k: v for k, v in prev_params.items()
            if k in ("install_method", "phases", "power_factor", "efficiency")
        }
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

# ── 실제 응답 생성 (동기/콜백 두 경로가 공유) ─────────────────────────────────
async def build_kakao_response(body: dict, user_id: str, user_text: str) -> dict:
    # ── 전체 payload 디버그 로그 (이미지 구조 파악용) ──────────────────
    import json as _json
    logger.info(f"[DEBUG PAYLOAD] {_json.dumps(body, ensure_ascii=False)}")

    # ── 이미지 수신 → 명판 인식 (텍스트 체크보다 먼저!) ──────────────
    image_url = extract_image_url(body)
    if image_url:
        logger.info(f"[카카오봇] 이미지 수신: {image_url[:60]}…")

        data = await recognize_nameplate(image_url)

        if "error" in data:
            return kakao_text(format_nameplate_result(data))

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

        return kakao_text(result_text, quick_replies=qr)

    # ── 텍스트 비어있으면 환영 메시지 ────────────────────────────────────
    if not user_text or user_text in ("처음으로", "시작", "start"):
        return kakao_text(WELCOME_TEXT)

    if any(kw in user_text for kw in RESET_KEYWORDS):
        clear_context(user_id)
        return kakao_text(
            "✅ 이전 계산 조건이 초기화됐습니다.\n새로운 조건을 입력해주세요."
        )

    if any(kw in user_text for kw in ("도움말", "help", "사용법", "기능")):
        return kakao_text(HELP_TEXT)

    # ── 명판 인식 요청 키워드 ───────────────────────────────────────────
    if any(kw in user_text for kw in ("명판", "사진", "찍었어", "이미지", "명판인식")):
        return kakao_text(
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
        )

    # ── 재계산 명령 ──────────────────────────────────────────────────────
    if any(kw in user_text for kw in RECALC_KEYWORDS):
        ctx = load_context(user_id)
        if not ctx:
            return kakao_text(
                "이전 계산 기록이 없습니다.\n조건을 다시 입력해주세요.\n\n예) 380V 75kW 거리 150m"
            )
        query_type = ctx["query_type"]
        params     = ctx["params"]
        logger.info(f"[카카오봇] 재계산: type={query_type}, params={params}")
        answer = calculate(query_type, params)
        return kakao_image_response(answer, query_type, params)

    # ── 파싱 + 컨텍스트 병합 ────────────────────────────────────────────
    raw_type, raw_params = smart_parse(user_text)
    query_type, params   = merge_context(user_id, raw_type, raw_params)

    logger.info(f"[카카오봇] 유형={query_type}, 병합파라미터={params}")

    # ── 계산 실행 ────────────────────────────────────────────────────────
    answer = calculate(query_type, params)

    # 계산 성공 시 컨텍스트 저장
    save_context(user_id, query_type, params)

    return kakao_image_response(answer, query_type, params)


_ERROR_RESPONSE = kakao_text(
    "⚠️ 계산 중 오류가 발생했습니다.\n"
    "입력 형식을 확인해주세요.\n\n"
    "'도움말'을 입력하면 예시를 볼 수 있습니다."
)


async def _process_and_callback(body: dict, user_id: str, user_text: str, callback_url: str) -> None:
    """콜백 경로: 백그라운드에서 계산을 마친 뒤 결과를 callbackUrl로 POST."""
    try:
        result = await build_kakao_response(body, user_id, user_text)
    except Exception as e:
        logger.error(f"[카카오봇] 콜백 처리 오류: {e}", exc_info=True)
        result = _ERROR_RESPONSE
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(callback_url, json=result)
            if resp.status_code >= 300:
                logger.warning(f"[카카오봇] 콜백 응답 실패: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        logger.error(f"[카카오봇] 콜백 전송 실패: {e}")


# ── Webhook 엔드포인트 ────────────────────────────────────────────────────────
@router.post("/webhook")
async def kakao_webhook(request: Request, background_tasks: BackgroundTasks):
    try:
        body      = await request.json()
        user_text: str = body.get("userRequest", {}).get("utterance", "").strip()
        user_id:   str = body.get("userRequest", {}).get("user", {}).get("id", "anonymous")
        callback_url: str | None = body.get("userRequest", {}).get("callbackUrl")

        logger.info(f"[카카오봇] user={user_id[:8]}… 입력: {user_text!r} callback={bool(callback_url)}")

        if callback_url:
            # 콜백이 켜진 스킬 — 즉시 확인 응답만 보내고 실제 계산/응답 전송은
            # 백그라운드로 넘긴다. 콜드 스타트·Gemini 호출·차트 렌더링이
            # 5초를 넘겨도 카카오 쪽에서는 무응답 처리되지 않는다.
            background_tasks.add_task(_process_and_callback, body, user_id, user_text, callback_url)
            return JSONResponse({
                "version": "2.0",
                "useCallback": True,
                "data": {"text": "🔎 계산 중입니다… 잠시만 기다려주세요"},
            })

        # 콜백 미설정 스킬 — 예전과 동일한 동기 응답 (동작 변화 없음)
        result = await build_kakao_response(body, user_id, user_text)
        return JSONResponse(result)

    except Exception as e:
        logger.error(f"[카카오봇] 오류: {e}", exc_info=True)
        return JSONResponse(_ERROR_RESPONSE)

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
    # 인증 없이 누구나 호출 가능한 공개 엔드포인트이므로, 실제 키 값의 일부라도
    # 노출하면 안 된다 — 예전엔 gemini_key_preview로 키 앞 6글자를 그대로
    # 돌려줘서, 키가 설정돼 있다는 사실 확인 용도를 넘어 실제 비밀값 일부가
    # 새고 있었다. 설정 여부(불리언)만 알려준다.
    key = os.getenv("GEMINI_API_KEY", "")
    return {
        "status": "ok",
        "service": "kakao-bot",
        "users_in_memory": len(user_context),
        "gemini_key_set": bool(key),
    }

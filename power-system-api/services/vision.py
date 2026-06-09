"""
Gemini Vision 기반 전기 기기 명판 인식
- 전동기, 변압기, 차단기 명판에서 전기 파라미터 자동 추출
- Gemini 2.0 Flash 무료 티어 사용
"""
import os
import json
import logging
import httpx
from io import BytesIO

logger = logging.getLogger(__name__)

# ── 명판 인식 프롬프트 ────────────────────────────────────────────────────────
NAMEPLATE_PROMPT = """
이 이미지는 전기 기기(전동기, 변압기, 차단기 등)의 명판(nameplate)입니다.
보이는 모든 전기 파라미터를 읽어서 아래 JSON 형식으로 반환하세요.

출력 형식 (없으면 null):
{
  "equipment_type": "motor" 또는 "transformer" 또는 "breaker" 또는 "unknown",
  "name": "기기 모델명 또는 형식",
  "voltage_v": 정격전압(V, kV면 V로 변환),
  "power_kw": 정격출력(kW, HP면 kW로 변환 1HP=0.746kW),
  "current_a": 정격전류(A),
  "power_factor": 역률(0~1, 없으면 null),
  "efficiency": 효율(0~1, 없으면 null),
  "rpm": 정격회전수,
  "frequency_hz": 주파수(Hz),
  "phases": 상수(1 또는 3),
  "ip_rating": "IP44" 등 보호등급,
  "insulation_class": "F" 등 절연등급,
  "sn_kva": 변압기 용량(kVA),
  "vk_percent": 변압기 임피던스(%),
  "raw_text": "명판에서 읽은 원문 텍스트 전체"
}

단위 변환 규칙:
- kV → V (22.9kV → 22900)
- HP → kW (1HP = 0.746kW)
- % 역률/효율 → 소수 (85% → 0.85)
- kVA → 그대로 (변압기는 sn_kva 사용)

JSON만 출력하세요. 설명 없이.
"""

# ── 이미지 다운로드 ───────────────────────────────────────────────────────────
async def download_image(url: str) -> bytes | None:
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "image/*",
    }
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.content
            logger.warning(f"이미지 다운로드 실패: {resp.status_code} {url}")
            return None
    except Exception as e:
        logger.error(f"이미지 다운로드 오류: {e}")
        return None


# ── Gemini Vision 명판 인식 ───────────────────────────────────────────────────
async def recognize_nameplate(image_source: str | bytes) -> dict:
    """
    image_source: URL(str) 또는 이미지 바이트(bytes)
    Returns: 추출된 파라미터 dict
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"error": "GEMINI_API_KEY 미설정"}

    try:
        from google import genai
        from google.genai import types
        from PIL import Image

        client = genai.Client(api_key=api_key)

        # 이미지 로드
        if isinstance(image_source, str):
            img_bytes = await download_image(image_source)
            if not img_bytes:
                return {"error": "이미지를 다운로드할 수 없습니다"}
        else:
            img_bytes = image_source

        img = Image.open(BytesIO(img_bytes))

        response = await client.aio.models.generate_content(
            model="gemini-2.0-flash",
            contents=[NAMEPLATE_PROMPT, img],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        data = json.loads(response.text)

        # null 제거
        return {k: v for k, v in data.items() if v is not None}

    except Exception as e:
        logger.error(f"명판 인식 오류: {e}")
        return {"error": str(e)}


# ── 인식 결과 → 계산 파라미터 변환 ───────────────────────────────────────────
def nameplate_to_params(data: dict) -> tuple[str, dict]:
    """
    명판 인식 결과를 calculator.py의 파라미터 형식으로 변환.
    Returns: (query_type, params)
    """
    eq_type = data.get("equipment_type", "unknown")

    params: dict = {}

    if data.get("voltage_v"):    params["voltage_v"]    = data["voltage_v"]
    if data.get("power_kw"):     params["power_kw"]     = data["power_kw"]
    if data.get("power_factor"): params["power_factor"] = data["power_factor"]
    if data.get("efficiency"):   params["efficiency"]   = data["efficiency"]
    if data.get("sn_kva"):       params["power_kva"]    = data["sn_kva"]
    if data.get("vk_percent"):   params["vk_pct"]       = data["vk_percent"]
    if data.get("phases"):       params["phases"]       = data["phases"]

    if eq_type == "transformer":
        query_type = "transformer"
    elif eq_type == "motor":
        query_type = "motor"
    else:
        query_type = "cable"

    return query_type, params


# ── 카카오 webhook payload에서 이미지 URL 추출 ────────────────────────────────
def extract_image_url(body: dict) -> str | None:
    """
    카카오 i 오픈빌더가 이미지를 전달하는 다양한 위치를 순서대로 탐색.
    오픈빌더 버전/설정에 따라 위치가 달라지므로 모두 확인.
    """
    # 1. 오픈빌더 파라미터로 전달: action.params.imageUrl (커스텀 파라미터)
    params = body.get("action", {}).get("params", {})
    for key in ("imageUrl", "image", "photo", "secureImage", "sys.photo"):
        val = params.get(key)
        if val and isinstance(val, str) and val.startswith("http"):
            return val

    # 2. action.detailParams — sys_photo, image, photo
    detail = body.get("action", {}).get("detailParams", {})
    for key in ("imageUrl", "sys.photo", "sys_photo", "image", "photo"):
        val = detail.get(key)
        if val is None:
            continue
        if isinstance(val, dict):
            url = val.get("value") or val.get("origin") or val.get("url")
            if url and isinstance(url, str) and url.startswith("http"):
                return url
        if isinstance(val, str) and val.startswith("http"):
            return val

    # 3. userRequest.params.media (카카오 채널 미디어 타입)
    media = body.get("userRequest", {}).get("params", {}).get("media")
    if isinstance(media, dict) and media.get("type") == "image":
        url = media.get("url") or media.get("secureUrl")
        if url:
            return url

    # 4. userRequest.params 직접 탐색
    ur_params = body.get("userRequest", {}).get("params", {})
    for key in ("secureImage", "imageUrl", "image", "photo"):
        val = ur_params.get(key)
        if val and isinstance(val, str) and val.startswith("http"):
            return val

    # 5. utterance 자체가 이미지 URL인 경우
    utterance = body.get("userRequest", {}).get("utterance", "")
    if utterance.startswith("http") and any(
        ext in utterance.lower() for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif")
    ):
        return utterance

    # 6. body 전체에서 http 이미지 URL 재귀 탐색 (최후 수단)
    def find_image_url_recursive(obj, depth=0):
        if depth > 5:
            return None
        if isinstance(obj, str):
            if obj.startswith("http") and any(
                ext in obj.lower() for ext in (".jpg", ".jpeg", ".png", ".webp")
            ):
                return obj
            if "mud-kage.kakao.com" in obj or "kakaocdn" in obj:
                return obj
        elif isinstance(obj, dict):
            for v in obj.values():
                result = find_image_url_recursive(v, depth + 1)
                if result:
                    return result
        elif isinstance(obj, list):
            for item in obj:
                result = find_image_url_recursive(item, depth + 1)
                if result:
                    return result
        return None

    return find_image_url_recursive(body)


# ── 인식 결과 포맷팅 ──────────────────────────────────────────────────────────
def format_nameplate_result(data: dict) -> str:
    if "error" in data:
        return f"⚠️ 명판 인식 실패\n{data['error']}\n\n사진을 더 가까이서, 밝은 곳에서 다시 찍어주세요."

    eq_map = {"motor": "전동기", "transformer": "변압기",
              "breaker": "차단기", "unknown": "전기기기"}
    eq_name = eq_map.get(data.get("equipment_type", "unknown"), "전기기기")

    lines = [f"📷 명판 인식 완료 — {eq_name}", "─" * 24]

    if data.get("name"):        lines.append(f"모델: {data['name']}")
    if data.get("voltage_v"):
        v = data["voltage_v"]
        lines.append(f"정격전압: {v/1000:.1f}kV" if v >= 1000 else f"정격전압: {v:.0f}V")
    if data.get("power_kw"):    lines.append(f"정격출력: {data['power_kw']:.1f}kW")
    if data.get("sn_kva"):      lines.append(f"정격용량: {data['sn_kva']:.0f}kVA")
    if data.get("current_a"):   lines.append(f"정격전류: {data['current_a']:.1f}A")
    if data.get("power_factor"):lines.append(f"역률: {data['power_factor']:.2f}")
    if data.get("efficiency"):  lines.append(f"효율: {data['efficiency']*100:.1f}%")
    if data.get("rpm"):         lines.append(f"회전수: {data['rpm']:.0f}rpm")
    if data.get("frequency_hz"):lines.append(f"주파수: {data['frequency_hz']:.0f}Hz")
    if data.get("phases"):      lines.append(f"상수: {data['phases']}상")
    if data.get("ip_rating"):   lines.append(f"보호등급: {data['ip_rating']}")
    if data.get("insulation_class"): lines.append(f"절연등급: {data['insulation_class']}종")
    if data.get("vk_percent"):  lines.append(f"임피던스: {data['vk_percent']:.1f}%")

    lines.append("─" * 24)

    # 다음 계산 제안
    eq_type = data.get("equipment_type", "unknown")
    if eq_type == "motor" and data.get("voltage_v") and data.get("power_kw"):
        lines.append("👇 이 데이터로 계산:")
        lines.append("케이블 선정 / 기동 전압강하")
    elif eq_type == "transformer" and data.get("sn_kva"):
        lines.append("👇 이 데이터로 계산:")
        lines.append("단락전류 / 케이블 선정")

    return "\n".join(lines)

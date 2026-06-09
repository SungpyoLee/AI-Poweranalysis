"""
스마트 파라미터 파서
1차: 정규식 (무료, 즉시)
2차: Gemini Flash Free (자연어 표현 보완)
"""
import re
import os
import json
import logging

logger = logging.getLogger(__name__)

# ── 계산 유형 키워드 ──────────────────────────────────────────────────────────
QUERY_KEYWORDS = {
    'cable':       ['케이블', '전선', 'cable', 'cv', '단면적', '선정', '선로', '전압강하', 'vd', 'voltage drop'],
    'shortcircuit':['단락', '단락전류', '고장전류', 'ik', 'isc', 'short circuit', '사고전류', 'ikss'],
    'transformer': ['변압기', '변압', 'tr', 'transformer', '용량선정', 'mva'],
    'relay':       ['계전기', '보호', 'relay', 'ocr', 'tms', 'pickup', '정정', '과전류'],
    'motor':       ['전동기', '모터', 'motor', '기동', 'starting', 'dol', 'star-delta'],
}

def detect_query_type(text: str) -> str:
    text_lower = text.lower()
    for qtype, keywords in QUERY_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            return qtype
    return 'cable'  # 기본값: 케이블 선정

# ── 정규식 파서 ───────────────────────────────────────────────────────────────
def regex_parse(text: str) -> dict:
    result = {}

    # 전압: "380V", "22.9kV", "22.9 KV", "154kV"
    v = re.search(r'(\d+\.?\d*)\s*(kV|KV|kv|V)\b', text)
    if v:
        val, unit = float(v.group(1)), v.group(2)
        result['voltage_v'] = val * 1000 if unit.lower() == 'kv' else val

    # 용량: "75kW", "100KW", "500kVA", "2MVA", "100HP", "75 kw"
    p = re.search(r'(\d+\.?\d*)\s*(MVA|KVA|kVA|kW|KW|MW|HP|hp)\b', text)
    if p:
        val, unit = float(p.group(1)), p.group(2).upper()
        if unit == 'MVA':   result['power_kva'] = val * 1000
        elif unit in ('KVA','kVA'): result['power_kva'] = val
        elif unit == 'MW':  result['power_kw']  = val * 1000
        elif unit == 'HP':  result['power_kw']  = val * 0.746
        else:               result['power_kw']  = val

    # 거리: "150m", "1.5km", "200 m"
    d = re.search(r'(\d+\.?\d*)\s*(km|KM|m|M)\b', text)
    if d:
        val, unit = float(d.group(1)), d.group(2)
        result['distance_m'] = val * 1000 if unit.lower() == 'km' else val

    # 전압강하 한도: "3%", "5 %", "3퍼센트"
    vd = re.search(r'(\d+\.?\d*)\s*(?:%|퍼센트|percent)', text)
    if vd:
        result['vdrop_limit_pct'] = float(vd.group(1))

    # 역률: "역률 0.85", "PF 0.9", "pf=0.85"
    pf = re.search(r'(?:역률|pf|PF)\s*[=:은는]?\s*(0\.\d+)', text, re.IGNORECASE)
    if pf:
        result['power_factor'] = float(pf.group(1))

    # 효율: "효율 94%", "eta 0.94"
    eff = re.search(r'(?:효율|eta|efficiency)\s*[=:은는]?\s*(\d+\.?\d*)\s*%?', text, re.IGNORECASE)
    if eff:
        val = float(eff.group(1))
        result['efficiency'] = val / 100 if val > 1 else val

    # 수용률: "수용률 0.8", "demand factor 80%"
    df = re.search(r'(?:수용률|demand\s*factor)\s*[=:은는]?\s*(\d+\.?\d*)\s*%?', text, re.IGNORECASE)
    if df:
        val = float(df.group(1))
        result['demand_factor'] = val / 100 if val > 1 else val

    # 계통 단락용량: "1000MVA", "500 MVA 계통"
    sc = re.search(r'(\d+\.?\d*)\s*MVA\s*(?:계통|grid|system)?', text)
    if sc and 'power_kva' not in result:
        result['sc_mva'] = float(sc.group(1))

    # 부하 수: "3대", "5개"
    n = re.search(r'(\d+)\s*(?:대|개|units?|motors?)', text)
    if n:
        result['count'] = int(n.group(1))

    # 케이블 설치 방법: 공중/덕트/지중
    if re.search(r'공중|air|overhead|트레이|tray', text, re.IGNORECASE):
        result['install_method'] = 'air'
    elif re.search(r'지중|underground|매설|직매', text, re.IGNORECASE):
        result['install_method'] = 'ground'
    else:
        result['install_method'] = 'duct'  # 기본값: 덕트

    # 상수: 3상/단상
    if re.search(r'단상|1상|single\s*phase|1φ', text, re.IGNORECASE):
        result['phases'] = 1
    else:
        result['phases'] = 3  # 기본값: 3상

    return result


# ── Gemini Flash 보완 파서 ────────────────────────────────────────────────────
GEMINI_SYSTEM_PROMPT = """
당신은 전기공학 파라미터 추출기입니다.
사용자 메시지에서 전기 계산에 필요한 파라미터를 JSON으로 추출하세요.

출력 형식 (없는 항목은 null):
{
  "voltage_v": 전압(V 단위),
  "power_kw": 유효전력(kW),
  "power_kva": 피상전력(kVA),
  "distance_m": 거리(m),
  "vdrop_limit_pct": 전압강하 한도(%),
  "power_factor": 역률(0~1),
  "efficiency": 효율(0~1),
  "phases": 상수(1 또는 3),
  "install_method": 설치방법("air"/"duct"/"ground"),
  "sc_mva": 계통 단락용량(MVA),
  "count": 부하 수량
}

단위 변환 규칙:
- kV → V 변환 필수 (22.9kV → 22900)
- HP → kW 변환 (1HP = 0.746kW)
- MW → kW 변환
- % 효율/역률은 0~1로 변환 (85% → 0.85)

JSON만 출력, 설명 없이.
"""

def gemini_parse(text: str) -> dict:
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        logger.warning("GEMINI_API_KEY 미설정 — Gemini 파서 건너뜀")
        return {}

    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=GEMINI_SYSTEM_PROMPT + "\n\n사용자 입력: " + text,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        data = json.loads(response.text)
        return {k: v for k, v in data.items() if v is not None}
    except Exception as e:
        logger.error(f"Gemini 파서 오류: {e}")
        return {}


# ── 스마트 파서 (정규식 1차 + Gemini 2차) ────────────────────────────────────
REQUIRED_BY_TYPE = {
    'cable':        ['voltage_v', 'power_kw'],
    'shortcircuit': ['voltage_v'],
    'transformer':  ['power_kw', 'power_kva'],
    'relay':        ['voltage_v'],
    'motor':        ['voltage_v', 'power_kw'],
}

def smart_parse(text: str) -> tuple[str, dict]:
    """
    Returns: (query_type, params)
    """
    query_type = detect_query_type(text)
    params = regex_parse(text)

    # 필수 파라미터가 모두 있으면 Gemini 없이 바로 반환
    required = REQUIRED_BY_TYPE.get(query_type, ['voltage_v'])
    if all(params.get(k) for k in required):
        return query_type, params

    # 부족하면 Gemini로 보완
    gemini_result = gemini_parse(text)
    # 정규식 결과 우선, Gemini로 누락값 채움
    merged = {**gemini_result, **params}
    return query_type, merged

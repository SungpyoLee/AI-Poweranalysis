# PowerFlow Analyzer

전력계통 단선도(SLD) 편집 및 조류·단락 해석 웹 애플리케이션

**배포 주소:** https://ai-poweranalysis.vercel.app  
**API 서버:** https://ai-poweranalysis.onrender.com

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 18 + Vite + ReactFlow |
| 백엔드 | FastAPI + uvicorn |
| 전력 해석 | pandapower (IEC 60909) |
| 스타일 | Tailwind CSS + CSS Variables |
| 배포 | Vercel (프론트) + Render (백엔드) |
| 버전 관리 | GitHub |

---

## 주요 기능

- **단선도(SLD) 편집** — 모선, 변압기, 선로, 부하, 발전기, 차단기를 캔버스에 배치
- **조류계산 (Load Flow)** — pandapower Newton-Raphson, 각 모선 전압·위상 표시
- **단락계산 (Short-Circuit)** — IEC 60909 기준 Ik'', Sk 계산
- **다주기 단락계산 (SC Multi-Cycle)** — ½사이클, 3사이클, 5사이클, X/R 비율
- **회로차단기(CB) 심볼** — IEC 심볼, 투입/개방 상태 표시
- **자동 레이아웃** — BFS 트리 기반 모선 배치 알고리즘

---

## 프로젝트 구조

```
Poweranalysis/
├── power-system-api/          # FastAPI 백엔드
│   ├── main.py                # 앱 진입점, CORS 설정
│   ├── models/
│   │   ├── network.py         # 계통 입력 데이터 모델 (Pydantic)
│   │   └── results.py         # 계산 결과 모델
│   ├── routers/
│   │   ├── loadflow.py        # 조류계산 API 라우터
│   │   └── shortcircuit.py    # 단락계산 API 라우터
│   ├── services/
│   │   └── solver.py          # pandapower 래퍼
│   └── requirements.txt
│
└── power-system-ui/           # React 프론트엔드
    ├── src/
    │   ├── App.jsx            # 메인 컴포넌트, 상태 관리
    │   ├── api.js             # axios API 클라이언트
    │   ├── networkToFlow.js   # 계통 데이터 → ReactFlow 노드/엣지 변환
    │   ├── index.css          # ETAP 스타일 CSS 변수 및 클래스
    │   └── components/
    │       ├── NetworkDiagram.jsx   # ReactFlow 캔버스
    │       ├── Sidebar.jsx          # 요소 편집 패널
    │       ├── ResultsPanel.jsx     # 계산 결과 테이블
    │       ├── ElementModal.jsx     # 요소 추가 모달
    │       └── nodes/
    │           ├── BusNode.jsx          # 모선 (수평 바 스타일)
    │           ├── TransformerNode.jsx  # 변압기 (IEC 이중원)
    │           ├── LoadNode.jsx         # 부하 (IEC 삼각형)
    │           ├── GeneratorNode.jsx    # 발전기 (IEC 원+G)
    │           ├── ExternalGridNode.jsx # 외부계통 (IEC 격자)
    │           └── CBNode.jsx           # 차단기 (IEC 사각형+X)
    └── vite.config.js
```

---

## 개발 과정

### 1단계 — 기본 구조 구축

- FastAPI + pandapower 백엔드 설계
- Pydantic 모델로 계통 입력 데이터 정의 (모선, 변압기, 선로, 부하, 발전기, 외부계통)
- 조류계산(`/loadflow/run`), 단락계산(`/shortcircuit/run`, `/shortcircuit/cycles`) API 구현
- React + ReactFlow 기반 SLD 캔버스 구성
- 예제 154kV/22.9kV 배전계통 내장

### 2단계 — 트러블슈팅: IPv4/IPv6 프록시 문제

Windows + Node.js 18 이상 환경에서 `localhost`가 IPv6(`::1`)으로 해석되어 Vite 프록시가 IPv4 전용 uvicorn에 연결 실패하는 문제 발생.

**해결:** `vite.config.js`의 proxy 대상을 `localhost` → `127.0.0.1`로 명시.

```js
proxy: {
  '/loadflow':     'http://127.0.0.1:8000',
  '/shortcircuit': 'http://127.0.0.1:8000',
}
```

### 3단계 — UI 디자인: ETAP 스타일 적용

초기 다크 테마에서 ETAP 전력해석 소프트웨어 스타일로 전면 재설계:

- **캔버스**: 순백색 배경 + 연한 점 격자 (CAD 도면지 느낌)
- **모선 노드**: 카드형 박스 → 수평 바(busbar) 스타일로 변경
- **툴바**: 단순 버튼 → Office PowerRibbon 스타일 (아이콘+텍스트, 그룹 제목)
- **모든 심볼**: IEC 표준 전기 기호 (외부계통 격자, 변압기 이중원, 부하 삼각형, 발전기 원, 차단기 사각형)
- CSS 변수 기반 테마 시스템

### 4단계 — 단락계산 결과 시각화

모선 노드에 단락전류 수치 직접 표시:

- Ik'' (초기 대칭 단락전류), Sk (단락용량)
- 다주기: ½사이클, 3사이클, 5사이클 비대칭 전류, X/R 비율

### 5단계 — 회로차단기(CB) 추가

- IEC 차단기 심볼 노드 (`CBNode.jsx`) 구현
- 변압기 HV/LV 단자 및 선로에 CB 삽입
- BFS 트리 레이아웃 알고리즘으로 선 겹침 문제 해결
- `straight` 엣지 라우팅으로 배선 정리
- Sidebar / ElementModal에 차단기 UI 추가
- API 전송 시 `circuit_breakers` 필드 자동 제거 (백엔드 모델 호환)

### 6단계 — 배포

- GitHub 레포지토리 생성 및 코드 업로드
- **Vercel** — 프론트엔드 자동 배포 (GitHub 연동, push 시 자동 재배포)
- **Render** — FastAPI 백엔드 배포 (무료 티어)
- `VITE_API_URL` 환경변수로 프론트-백엔드 연결

---

## 로컬 실행 방법

**백엔드**
```bash
cd power-system-api
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**프론트엔드**
```bash
cd power-system-ui
npm install
npm run dev
# → http://localhost:3000
```

---

## API 명세

### POST `/loadflow/run`
조류계산 실행. 계통 데이터를 받아 각 모선의 전압·위상 및 선로·변압기 조류 반환.

### POST `/shortcircuit/run`
IEC 60909 단락계산. 각 모선의 Ik'', Sk 반환.

### POST `/shortcircuit/cycles`
다주기 단락계산. ½사이클, 3사이클, 5사이클 비대칭 전류 및 X/R 비율 반환.

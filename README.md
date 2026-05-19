# PowerFlow Analyzer

전력계통 단선도(SLD) 편집 및 조류·단락 해석 웹 애플리케이션

**배포 주소:** https://power-system-ui.vercel.app  
**API 서버:** https://ai-poweranalysis.onrender.com

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 18 + TypeScript + Vite + ReactFlow v11 |
| 백엔드 | FastAPI + uvicorn |
| 전력 해석 | pandapower (IEC 60909) |
| 배포 | Vercel (프론트) + Render (백엔드) |
| 버전 관리 | GitHub |

---

## 주요 기능

- **ETAP 스타일 단선도(SLD) 편집** — 모선, 변압기, 차단기, 전동기, 발전기를 캔버스에 드래그&드롭 배치
- **수직/수평 직각 라우팅** — 모든 연결선 대각선 없이 직각(ETAP/SKM 스타일)
- **Auto Layout** — 트리 DFS 알고리즘으로 ETAP 스타일 계층 구조 자동 배치
- **조류계산 (Load Flow)** — pandapower Newton-Raphson
- **단락계산 (Short-Circuit)** — IEC 60909 기준 Ik'', Sk 계산
- **속성 편집** — 우측 패널에서 각 장비 파라미터 실시간 수정

---

## 프로젝트 구조

```
Poweranalysis/
├── power-system-api/              # FastAPI 백엔드
│   ├── main.py
│   ├── models/
│   │   ├── network.py
│   │   └── results.py
│   ├── routers/
│   │   ├── loadflow.py
│   │   └── shortcircuit.py
│   ├── services/
│   │   └── solver.py
│   ├── requirements.txt
│   └── render.yaml                # Render 배포 설정
│
└── power-system-ui/               # React + TypeScript 프론트엔드
    ├── src/
    │   ├── main.jsx               # 앱 진입점
    │   ├── App.tsx                # 메인 컴포넌트, 상태 관리
    │   ├── api.js                 # axios API 클라이언트
    │   ├── types/
    │   │   └── index.ts           # TypeScript 타입 정의, 연결 규칙
    │   ├── nodes/                 # ReactFlow 커스텀 노드
    │   │   ├── BusNode.tsx        # 모선 (동적 폭, 슬롯 핸들)
    │   │   ├── TransformerNode.tsx # 변압기 (IEC 이중원)
    │   │   ├── BreakerNode.tsx    # 차단기 (IEC 사각형+X/개방)
    │   │   ├── MotorNode.tsx      # 전동기 (IEC 원+M)
    │   │   └── GeneratorNode.tsx  # 발전기 (IEC 원+G~)
    │   ├── edges/
    │   │   └── CableEdge.tsx      # 케이블 (직각 라우팅)
    │   ├── utils/
    │   │   └── etapLayout.ts      # ETAP 스타일 자동 레이아웃 엔진
    │   └── components/
    │       ├── Toolbar.tsx         # PowerRibbon 툴바
    │       ├── EquipmentPalette.tsx # 장비 팔레트 (드래그 소스)
    │       ├── PropertyPanel.tsx   # 속성 편집 패널
    │       └── SLDCanvas.tsx       # ReactFlow 캔버스 래퍼
    ├── tsconfig.json
    └── vite.config.js
```

---

## 개발 과정

### 1단계 — 기본 구조 구축

- FastAPI + pandapower 백엔드 설계
- Pydantic 모델로 계통 입력 데이터 정의 (모선, 변압기, 선로, 부하, 발전기, 외부계통)
- 조류계산(`/loadflow/run`), 단락계산(`/shortcircuit/run`) API 구현
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

### 3단계 — ETAP 스타일 UI 적용 (1차)

초기 다크 테마에서 ETAP 전력해석 소프트웨어 스타일로 재설계:

- 캔버스: 순백색 배경 + 연한 점 격자 (CAD 도면지 느낌)
- 모선 노드: 카드형 박스 → 수평 바(busbar) 스타일
- 툴바: Office PowerRibbon 스타일 (아이콘+텍스트, 그룹 제목)
- 모든 심볼: IEC 표준 전기 기호
- 단락전류 수치 모선 노드에 직접 표시

### 4단계 — 차단기 노드 추가

- IEC 차단기 심볼 (`CBNode`) 구현
- 투입(Closed)/개방(Open) 상태 표시
- 연결 규칙 유효성 검사

### 5단계 — 배포

- GitHub 레포지토리 생성 및 코드 업로드
- **Vercel** — 프론트엔드 자동 배포 (GitHub 연동, push 시 자동 재배포)
- **Render** — FastAPI 백엔드 배포 (무료 티어)
- `VITE_API_URL` 환경변수로 프론트-백엔드 연결

### 6단계 — TypeScript 전면 재작성 + ETAP Lite 아키텍처

기존 JSX 코드를 TypeScript + 새 아키텍처로 완전 재작성:

**설계 목표:** 실제 ETAP Lite처럼 동작하는 산업용 SLD 편집기

- **Left Palette** — 드래그&드롭으로 장비 배치 (Bus/Transformer/Breaker/Motor/Generator)
- **Center Canvas** — 흰색 SLD 캔버스, 20px 그리드 스냅, 무한 줌/팬
- **Right Properties** — 선택 장비의 속성 실시간 편집
- **Top Toolbar** — PowerRibbon 스타일, Load Flow / Short-Circuit 버튼

**핵심 구현:**
- `types/index.ts` — TypeScript 타입 및 장비별 연결 규칙 (`CONNECTION_RULES`)
- 커스텀 노드 5종 + 커스텀 엣지 1종 (케이블)
- `isValidConnection` 콜백으로 불법 연결 차단 (Bus-Bus 직결 불가 등)
- `ReactFlowProvider`로 `screenToFlowPosition` 드롭 위치 계산

**발견된 문제:** `App.jsx`와 `App.tsx`가 공존할 때 Vite가 `.jsx`를 먼저 해석해 새 파일이 무시됨 → `App.jsx` 삭제로 해결

### 7단계 — ETAP/SKM 스타일 계통 레이아웃 엔진

단순 드로잉 툴 형태에서 실제 ETAP 스타일로 완전 전환:

**요구사항:**
1. 모든 연결선 수직/수평만 사용, 대각선 금지
2. Bus는 수평 기준선
3. 장비는 Bus 중심선에 수직 연결
4. Auto Layout 적용 — 전체 트리 구조 자동 배치
5. Bus 길이는 연결 개수에 따라 자동 조정

**구현:**

`etapLayout.ts` — ETAP 레이아웃 알고리즘:
1. 최고 전압 버스를 루트로 DFS 트리 구성
2. 각 브랜치 폭(subtree width) 재귀 계산
3. 버스 슬롯 핸들을 자식 센터 X에 정확히 배치
4. 장비 센터 X = 버스 슬롯 X → 완전 수직 연결선 보장
5. 엣지별 `sourceHandle`/`targetHandle` 자동 할당

**예제 계통 (3계층 산업 플랜트):**
```
154kV Main Bus (Slack)
├── G-1 (발전기)
└── CB-T1 → TR-1 (154/22.9kV)
              └── 22.9kV Bus
                  ├── CB-1 → M-1 (2,000 kW)
                  ├── CB-2 → M-2 (1,500 kW)
                  └── CB-T2 → TR-2 (22.9/0.4kV)
                                └── 0.4kV MCC Bus
                                    ├── CB-3 → M-3 (75 kW)
                                    └── CB-4 → M-4 (45 kW)
```

**버스 노드 슬롯 핸들:**
- 자식 수에 따라 버스 폭 자동 계산
- 각 자식의 X 위치에 독립 핸들 생성 → 직각 탭 연결

**엣지 라우팅:**
- `getSmoothStepPath({ borderRadius: 0 })` → 날카로운 직각 꺾임 (ETAP 스타일)

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

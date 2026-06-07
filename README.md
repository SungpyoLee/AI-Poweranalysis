# PowerFlow Analyzer

산업 전력계통 설계·해석을 위한 오프라인 단선도(SLD) 에디터.

**배포 주소:** https://power-system-ui.vercel.app  
**API 서버:** https://ai-poweranalysis.onrender.com  
**최종 업데이트:** 2026-05-31

---

## 목차

1. [기술 스택](#기술-스택)
2. [빠른 시작](#빠른-시작)
3. [현재 구현된 기능](#현재-구현된-기능)
4. [파일 구조](#파일-구조)
5. [개발 과정](#개발-과정)
6. [API 명세](#api-명세)
7. [배포 정보](#배포-정보)
8. [트러블슈팅](#트러블슈팅)
9. [개발 규칙](#개발-규칙)

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트엔드 | React 18 + TypeScript + Vite 5 + ReactFlow v11 |
| 상태 관리 | Zustand |
| 백엔드 | FastAPI + uvicorn |
| 전력 해석 | pandapower (IEC 60909) |
| 배포 | Vercel (프론트) + Render (백엔드) |
| 권장 Node.js | v20 LTS (v24도 동작하나 일부 이슈 있음 — 트러블슈팅 참고) |

---

## 빠른 시작

### 프론트엔드 (개발 서버)

```bash
cd power-system-ui
npm install
npm run dev
# → http://localhost:3000
```

> **접속이 안 될 경우** → [트러블슈팅 — Windows 브라우저 localhost 접속 불가](#windows-브라우저에서-localhost-접속-불가) 참고

### 백엔드 (FastAPI)

```bash
cd power-system-api
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

> proxy 오류 방지를 위해 반드시 `127.0.0.1`로 실행할 것 (localhost 사용 금지)

### 프로덕션 빌드 서빙 (브라우저 접속 안 될 때 대안)

```bash
cd power-system-ui
npm run build
node serve.cjs      # → http://127.0.0.1:9000
```

---

## 현재 구현된 기능

### 1. SLD 캔버스
- 장비 팔레트에서 드래그 → 캔버스 배치
- 장비 핸들 클릭 → Cable 연결
- Auto Layout (ETAP 스타일 계층 배치)
- 그리드 스냅 20px
- MiniMap, Zoom Controls, Fit View

**노드 유형:** Bus · Transformer · Breaker · Motor · Generator · Load · MotorGroup

### 2. 해석 계산

| 기능 | 엔드포인트 |
|------|-----------|
| Load Flow (Local) | pandapower 직접 계산 |
| Load Flow (API) | POST /loadflow |
| Short-Circuit | POST /shortcircuit |
| N-1 Contingency | POST /contingency |
| Harmonics | POST /harmonics |
| Cable Sizing | POST /cablesizing |
| Arc Flash | POST /arcflash |
| PDF Export | 클라이언트 사이드 생성 |

### 3. 프로젝트 관리 (.pfa)
- New / Open / Save / Save As
- 자동 저장: 2초 디바운스 → localStorage
- 최근 파일 목록 (최대 5개)
- 세션 복원 배너

### 4. Motor Group 노드
- 복수 Motor 노드를 하나의 그룹 노드로 축약
- 더블클릭 → 우측 패널에서 상세 보기 (전동기 목록, 부하 합산)
- 우클릭 메뉴: 전동기 추가 / 상세 보기 / 그룹 해제

### 5. 데이터시트 임포트 위자드
- PDF 업로드 → pdfjs-dist 텍스트 추출 → tesseract.js OCR → 파라미터 자동 추출
- 변압기 / 전동기 / 차단기 파라미터 지원

### 6. Motor List 가져오기 (Excel → SLD 자동 작성)
- XLSX / XLS / CSV (최대 50MB) 업로드
- 컬럼 자동 매핑, MCC 그룹별 토폴로지 자동 생성
- 4단계 위자드

### 7. SLD 도면 가져오기 (OCR + Auto Draw)
- PDF / PNG / JPG 업로드 → OCR → 심볼 감지 → 캔버스 자동 배치
- 4단계 위자드

### 8. 도면 라이브러리
- 캔버스 도면 저장/불러오기 (localStorage, 최대 100개)
- 이름 검색, 복제, 삭제

### 9. UI 기능
- 패널 접기/펼치기 (좌측 장비 팔레트, 우측 속성 패널)
- Undo / Redo (Ctrl+Z / Ctrl+Y)
- 다중 선택 → 전압 일괄 변경 + 일괄 삭제
- Auto Recalculate (파라미터 변경 시 Load Flow 자동 재실행)
- 시작 화면 WelcomeScreen (최근 파일 목록 포함)
- 키보드 단축키 모달 (툴바 ? 버튼)

---

## 파일 구조

```
Poweranalysis/
├── README.md                          ← 이 파일 (통합 문서)
│
├── power-system-api/                  # FastAPI 백엔드
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
│   └── render.yaml
│
└── power-system-ui/                   # React + TypeScript 프론트엔드
    ├── serve.cjs                      # 브라우저 접속 불가 시 대안 서버
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── App.tsx                    # 루트 — 모든 핸들러·다이얼로그 통합
        ├── types/index.ts             # Equipment 유니온 타입 전체 정의
        │
        ├── store/
        │   ├── useEquipmentStore.ts   # 노드·엣지·선택·그룹 상태 + Undo/Redo
        │   ├── useAnalysisStore.ts    # 해석 결과·로딩 상태
        │   ├── useProjectStore.ts     # 프로젝트 메타·dirty·복원 배너
        │   └── useDiagramLibraryStore.ts
        │
        ├── hooks/
        │   ├── useAutoSave.ts
        │   └── usePdfExtract.ts
        │
        ├── import/                    # 가져오기 파이프라인
        │   ├── motorListParser.ts
        │   ├── motorNetworkBuilder.ts
        │   ├── pdfImporter.ts
        │   ├── ocr.ts
        │   ├── symbolDetector.ts
        │   └── graphBuilder.ts
        │
        ├── nodes/                     # ReactFlow 커스텀 노드
        │   ├── BusNode.tsx
        │   ├── TransformerNode.tsx
        │   ├── BreakerNode.tsx
        │   ├── MotorNode.tsx
        │   ├── GeneratorNode.tsx
        │   ├── LoadNode.tsx
        │   └── MotorGroupNode.tsx
        │
        ├── edges/
        │   └── CableEdge.tsx
        │
        ├── components/
        │   ├── Toolbar.tsx            # 리본 툴바
        │   ├── SLDCanvas.tsx          # ReactFlow 캔버스 래퍼
        │   ├── EquipmentPalette.tsx   # 좌측 드래그 팔레트
        │   ├── PropertyPanel.tsx      # 우측 속성 편집 패널
        │   ├── ResultsPanel.tsx       # 해석 결과 탭 패널
        │   ├── WelcomeScreen.tsx      # 시작 화면
        │   ├── MotorGroupPanel.tsx    # Motor Group 상세 패널
        │   └── ...기타 다이얼로그
        │
        └── utils/
            ├── projectIO.ts           # .pfa 파일 직렬화·localStorage
            ├── etapLayout.ts          # ETAP 스타일 자동 배치
            ├── buildNetworkPayload.ts
            ├── generatePDF.ts
            └── ...기타 유틸
```

---

## 개발 과정

### 1단계 — 기본 구조 구축
- FastAPI + pandapower 백엔드 설계
- 조류계산(`/loadflow/run`), 단락계산(`/shortcircuit/run`) API 구현
- React + ReactFlow 기반 SLD 캔버스 구성

### 2단계 — IPv4/IPv6 프록시 문제 해결
Windows + Node.js 18 이상에서 `localhost`가 IPv6으로 해석되어 Vite 프록시가 IPv4 전용 uvicorn에 연결 실패.  
→ `vite.config.js` proxy 대상을 `localhost` → `127.0.0.1`로 명시하여 해결.

### 3단계 — ETAP 스타일 UI 적용
- 캔버스: 순백색 + 점 격자 (CAD 도면지)
- 툴바: Office PowerRibbon 스타일
- 모든 심볼: IEC 표준 전기 기호

### 4단계 — 차단기 노드 추가
- IEC 차단기 심볼, 투입/개방 상태 표시
- 연결 규칙 유효성 검사

### 5단계 — 배포
- GitHub → Vercel (프론트) + Render (백엔드) 자동 배포

### 6단계 — TypeScript 전면 재작성 + ETAP Lite 아키텍처
- JSX → TypeScript + Zustand 상태관리 전면 재작성
- Left Palette / Center Canvas / Right Properties / Top Toolbar 구조
- `CONNECTION_RULES`로 불법 연결 차단

### 7단계 — ETAP/SKM 스타일 레이아웃 엔진
- `etapLayout.ts`: DFS 트리 기반 자동 배치
- `getSmoothStepPath({ borderRadius: 0 })` — 직각 꺾임 라우팅
- Bus 슬롯 핸들 자동 계산

### 8단계 — 기능 확장 (2026-05)
- Motor Group 노드 (여러 전동기 그룹화)
- Datasheet Import (PDF OCR → 파라미터 추출)
- Motor List Import (Excel → SLD 자동 생성)
- SLD 도면 가져오기 (OCR + Auto Draw)
- 도면 라이브러리, 탭 최적화, 보호협조 계산
- Undo/Redo, Auto Recalculate, MiniMap

### 9단계 — UI/UX 개선 (2026-05-31)
- WelcomeScreen (시작 화면, 최근 파일)
- 패널 접기/펼치기
- MotorGroupPanel → 우측 패널 인라인 도킹 (전체화면 오버레이 제거)
- Toolbar 재구성: 가져오기 그룹 분리, LF 버튼 단일화, 단축키 모달
- 다중 선택 전압 일괄 변경

---

## API 명세

### POST `/loadflow/run`
조류계산 실행. Newton-Raphson 방식. 각 모선의 전압·위상 및 선로·변압기 조류 반환.

### POST `/shortcircuit/run`
IEC 60909 단락계산. 각 모선의 Ik'', Sk 반환.

### POST `/contingency`
N-1 신뢰도 해석.

### POST `/harmonics`
고조파 해석.

### POST `/cablesizing`
케이블 굵기 선정.

---

## 배포 정보

| 항목 | 내용 |
|------|------|
| 프론트엔드 | Vercel — GitHub push 시 자동 재배포 |
| 백엔드 | Render — 무료 티어 (콜드 스타트 ~30초) |
| 환경변수 | `VITE_API_URL` — 프론트에서 API 주소 지정 |

---

## 트러블슈팅

### [초기 개발] Vite → FastAPI 프록시 ECONNREFUSED

**증상:** 예제 로드 후 조류계산/단락계산 버튼 눌러도 반응 없음.

**원인:** Node.js 17+ 에서 `localhost`가 IPv4(`127.0.0.1`) 대신 IPv6(`::1`)로 해석되어
Vite 프록시가 IPv4만 리슨하는 uvicorn에 연결 실패.

```
netstat 결과:
  uvicorn : 127.0.0.1:8000  (IPv4 only)
  Vite    : [::1]:3000       (IPv6)
```

**해결:** `vite.config.js` proxy 대상을 `127.0.0.1`로 명시.

```js
// vite.config.js
proxy: {
  '/loadflow':     'http://127.0.0.1:8000',   // ← localhost 사용 금지
  '/shortcircuit': 'http://127.0.0.1:8000',
}
```

**재발 방지:** Windows 환경에서 Vite proxy는 항상 `127.0.0.1` 사용. 또는 uvicorn을 `--host 0.0.0.0`으로 실행.

---

### [2026-05-31] Windows 브라우저에서 localhost 접속 불가

**증상:** `npm run dev` 실행 후 Edge/Chrome에서 `localhost:3000` 접속 불가.

**원인:** Vite dev 서버가 `[::1]`(IPv6 loopback)에만 바인딩되는 경우,
브라우저가 `localhost`를 `127.0.0.1`(IPv4)로 해석하면 연결 거부됨.

**해결 1 — vite.config.js에 host 고정 (영구 해결)**

```js
// vite.config.js
server: {
  port: 3000,
  host: '0.0.0.0',   // ← 추가
  proxy: { ... }
}
```

서버 재시작 후 터미널에 `Network: http://xxx.xxx.xxx.xxx:3000/` 줄이 뜨면 정상.

**해결 2 — 프로덕션 빌드 서빙 (브라우저 접속 불가 시 우회)**

```bash
npm run build
node serve.cjs      # → http://127.0.0.1:9000
```

> `serve.js`가 아닌 `serve.cjs`를 사용하는 이유:
> `package.json`에 `"type": "module"` 설정이 있어 `.js`는 ESM으로 처리됨.
> CommonJS `require()`를 사용하는 파일은 반드시 `.cjs` 확장자 사용.

**해결 3 — Windows 루프백 차단 해제 (Edge 특정 문제)**

관리자 cmd에서:
```
CheckNetIsolation LoopbackExempt -a -n="Microsoft.MicrosoftEdge_8wekyb3d8bbwe"
CheckNetIsolation LoopbackExempt -a -n="Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe"
```

---

### [2026-05-31] useCallback TDZ 에러로 화면 블랭크

**증상:** `npm run build` 후 브라우저 Console에서:
```
ReferenceError: Cannot access '...' before initialization
```
앱 화면이 완전히 흰 화면(blank).

**원인:** `useCallback`의 의존성 배열 `[handleXxx]`에 나열된 핸들러가
해당 `useCallback` 선언보다 **아래에** 정의되어 있을 때 발생하는 TDZ(Temporal Dead Zone) 에러.
개발 서버(`npm run dev`)에서는 증상이 없다가 프로덕션 빌드에서만 나타남.

**잘못된 예:**
```tsx
// ❌ handleNew가 아직 선언되지 않았는데 의존성 배열에 참조
const handleWelcomeNew = useCallback(() => {
  handleNew()
}, [handleNew])   // ← TDZ 에러

const handleNew = useCallback(() => { ... }, [])
```

**올바른 예:**
```tsx
// ✅ 의존하는 핸들러를 먼저 선언
const handleNew = useCallback(() => { ... }, [])

const handleWelcomeNew = useCallback(() => {
  handleNew()
}, [handleNew])   // ← 정상
```

**규칙:** `useCallback` 의존성 배열에 다른 핸들러가 들어간다면 그 핸들러는 반드시 **위에** 선언.

---

## 개발 규칙

### 서버 실행
- 백엔드 항상 `127.0.0.1:8000` 으로 실행 (`localhost` 금지)
- 프론트 `vite.config.js`의 proxy는 `http://127.0.0.1:8000` 고정

### CommonJS vs ESM
- `package.json`에 `"type": "module"` 설정됨
- `.js` 파일은 ESM으로 처리됨
- `require()`를 써야 한다면 파일 확장자를 `.cjs`로 저장

### React Hooks 선언 순서
- `useCallback` 의존성 배열에 다른 `useCallback`을 참조하면 반드시 의존 대상을 먼저 선언
- 새 핸들러 추가 시 App.tsx 내 선언 순서 주의

### 새 기능 추가 시 체크리스트
- [ ] TypeScript 타입 오류 확인: `npx tsc --noEmit`
- [ ] 프로덕션 빌드 확인: `npm run build`
- [ ] `serve.cjs`로 빌드 파일 서빙 후 브라우저 Console 에러 없는지 확인
- [ ] useCallback 의존성 배열 순서 확인

### 스크린샷 사용 규칙

UI 검토·개발 시 스크린샷을 캡처해 Claude에게 참고시킨 후, **작업 완료 즉시 삭제**한다.

```
캡처 → Claude 참고 → 삭제
```

- 루트 디렉토리(`c:\leesungpyo\AI\Poweranalysis\`)에 `.png` 파일이 남지 않도록 유지
- `design/`, `verify_*.png`, `ss_*.png`, `FINAL_*.png` 등 임시 캡처 파일은 작업 후 즉시 제거
- node_modules 내부 이미지는 삭제 대상 아님

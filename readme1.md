# 전력계통 해석 시스템 — 트러블슈팅 기록

## 문제 증상

`http://localhost:3000` 에서 **예제 로드** 후 **조류계산** 또는 **단락계산** 버튼을 눌러도 아무런 반응이 없음.

---

## 원인 분석

### 1단계 — 백엔드 정상 여부 확인

Python 직접 호출로 solver 자체는 정상임을 확인:

```python
from models.network import NetworkInput
from services.solver import run_loadflow

result = run_loadflow(net_input)
# → LOADFLOW OK: True  buses: 3
```

HTTP API도 직접 호출 시 정상 응답:

```bash
curl -X POST http://127.0.0.1:8000/loadflow/run ...
# → {"converged": true, "buses": [...]}
```

### 2단계 — 포트 점유 상태 확인

```
netstat -ano | grep ":8000"
TCP    127.0.0.1:8000   0.0.0.0:0   LISTENING   10976   ← IPv4 only

netstat -ano | grep ":3000"
TCP    [::1]:3000       [::]:0      LISTENING   24988   ← IPv6
```

### 3단계 — 근본 원인 파악

| 구성요소 | 주소 |
|----------|------|
| FastAPI (uvicorn) | `127.0.0.1:8000` (IPv4) |
| Vite dev server | `[::1]:3000` (IPv6) |

**Vite의 proxy 설정이 `http://localhost:8000`으로 되어 있었는데,**  
Windows + Node.js 17 이후 버전에서는 `localhost`가 IPv4(`127.0.0.1`) 대신  
**IPv6(`::1`)로 먼저 해석**된다.

uvicorn은 IPv4만 리슨하고 있었기 때문에 Vite 프록시가 `[::1]:8000`으로 연결을 시도하다 **ECONNREFUSED** 로 실패 → 프론트엔드에서 API 요청이 전달되지 않음.

---

## 해결 방법

### `vite.config.js` proxy 대상을 `127.0.0.1`로 명시

```js
// 수정 전
proxy: {
  '/loadflow':     'http://localhost:8000',
  '/shortcircuit': 'http://localhost:8000',
}

// 수정 후
proxy: {
  '/loadflow':     'http://127.0.0.1:8000',
  '/shortcircuit': 'http://127.0.0.1:8000',
}
```

### Vite 서버 재시작

기존 프로세스(포트 3000, 3001)를 종료하고 재시작:

```powershell
# PowerShell — 포트 점유 프로세스 강제 종료
Get-NetTCPConnection -LocalPort 3000,3001 | Select-Object -ExpandProperty OwningProcess |
  Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force }

# 재시작
cd power-system-ui
npm run dev
```

### 재시작 후 프록시 정상 확인

```bash
curl -X POST http://localhost:3000/loadflow/run ...
# → {"converged": true, ...}
```

---

## 추가 개선 사항

에러 메시지를 원인 불명 텍스트 대신 명확한 안내문으로 개선:

```js
// 수정 전
setError(e.response?.data?.detail ?? e.message)

// 수정 후
const msg = detail
  ? String(detail)
  : e.code === 'ERR_NETWORK' || e.message === 'Network Error'
  ? 'API 서버에 연결할 수 없습니다. uvicorn 백엔드(port 8000)가 실행 중인지 확인하세요.'
  : e.message
setError(msg)
```

---

## 재발 방지

Windows 환경에서 Vite proxy를 설정할 때는 `localhost` 대신 `127.0.0.1`을 사용할 것.  
백엔드를 모든 인터페이스에서 리슨하게 하려면 uvicorn 실행 시 `--host 0.0.0.0` 옵션을 사용하는 방법도 있다.

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

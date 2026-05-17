import { useState, useCallback, useEffect, useRef } from 'react'
import { applyNodeChanges, applyEdgeChanges } from 'reactflow'
import NetworkDiagram from './components/NetworkDiagram'
import Sidebar from './components/Sidebar'
import ResultsPanel from './components/ResultsPanel'
import ElementModal from './components/ElementModal'
import { runLoadflow, runShortcircuit, runShortcircuitCycles } from './api'
import { networkToFlow } from './networkToFlow'

const EXAMPLE_NETWORK = {
  name: '예제 배전계통 (154kV/22.9kV)',
  f_hz: 60.0,
  buses: [
    { id: 1, name: '154kV 주변전소',     vn_kv: 154.0, type: 'b' },
    { id: 2, name: '22.9kV 간선 모선',   vn_kv: 22.9,  type: 'b' },
    { id: 3, name: '22.9kV 분기 모선 A', vn_kv: 22.9,  type: 'b' },
    { id: 4, name: '22.9kV 분기 모선 B', vn_kv: 22.9,  type: 'b' },
    { id: 5, name: '22.9kV 말단 모선',   vn_kv: 22.9,  type: 'b' },
  ],
  external_grids: [
    { bus_id: 1, name: '한전 계통', vm_pu: 1.0, va_degree: 0.0,
      s_sc_max_mva: 2000, s_sc_min_mva: 1500, rx_max: 0.1, rx_min: 0.1 },
  ],
  loads: [
    { bus_id: 2, name: '부하-1',  p_mw: 3.0, q_mvar: 1.5 },
    { bus_id: 2, name: '부하-2',  p_mw: 2.0, q_mvar: 1.0 },
    { bus_id: 3, name: '부하-3',  p_mw: 2.0, q_mvar: 1.0 },
    { bus_id: 3, name: '부하-4',  p_mw: 1.5, q_mvar: 0.75 },
    { bus_id: 4, name: '부하-5',  p_mw: 1.5, q_mvar: 0.7 },
    { bus_id: 4, name: '부하-6',  p_mw: 2.0, q_mvar: 1.0 },
    { bus_id: 4, name: '부하-7',  p_mw: 1.0, q_mvar: 0.5 },
    { bus_id: 5, name: '부하-8',  p_mw: 1.0, q_mvar: 0.5 },
    { bus_id: 5, name: '부하-9',  p_mw: 1.5, q_mvar: 0.75 },
    { bus_id: 5, name: '부하-10', p_mw: 2.0, q_mvar: 1.0 },
  ],
  generators: [],
  lines: [
    { from_bus_id: 2, to_bus_id: 3, name: '선로-1 (간선→분기A)',
      length_km: 5.0, r_ohm_per_km: 0.164, x_ohm_per_km: 0.1, c_nf_per_km: 0.0, max_i_ka: 0.5 },
    { from_bus_id: 2, to_bus_id: 4, name: '선로-2 (간선→분기B)',
      length_km: 3.0, r_ohm_per_km: 0.164, x_ohm_per_km: 0.1, c_nf_per_km: 0.0, max_i_ka: 0.5 },
    { from_bus_id: 3, to_bus_id: 5, name: '선로-3 (분기A→말단)',
      length_km: 4.0, r_ohm_per_km: 0.164, x_ohm_per_km: 0.1, c_nf_per_km: 0.0, max_i_ka: 0.3 },
  ],
  transformers: [
    { hv_bus_id: 1, lv_bus_id: 2, name: 'TR-1 (154/22.9kV)',
      sn_mva: 30.0, vn_hv_kv: 154.0, vn_lv_kv: 22.9,
      vk_percent: 12.0, vkr_percent: 0.5, pfe_kw: 30.0, i0_percent: 0.1 },
  ],
  circuit_breakers: [
    { id: 'cb-t1-hv', name: 'CB-T1-HV', on: 'trafo', ref: 'TR-1 (154/22.9kV)', terminal: 'hv', is_closed: true },
    { id: 'cb-t1-lv', name: 'CB-T1-LV', on: 'trafo', ref: 'TR-1 (154/22.9kV)', terminal: 'lv', is_closed: true },
    { id: 'cb-f1',    name: 'CB-F1',    on: 'line',  ref: '선로-1 (간선→분기A)',                is_closed: true },
    { id: 'cb-f2',    name: 'CB-F2',    on: 'line',  ref: '선로-2 (간선→분기B)',                is_closed: true },
    { id: 'cb-f3',    name: 'CB-F3',    on: 'line',  ref: '선로-3 (분기A→말단)',                is_closed: true },
  ],
}

const EMPTY_NETWORK = {
  name: '신규 계통', f_hz: 60.0,
  buses: [], external_grids: [], loads: [], generators: [], lines: [], transformers: [],
  circuit_breakers: [],
}

function apiError(e) {
  if (e.code === 'ERR_NETWORK' || e.message === 'Network Error')
    return 'API 서버에 연결할 수 없습니다. uvicorn 백엔드(port 8000)가 실행 중인지 확인하세요.'
  const data = e.response?.data
  if (data) {
    const detail = data.detail
    if (detail) return Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : String(detail)
    if (typeof data === 'string' && data.length < 300) return data
  }
  return `[HTTP ${e.response?.status ?? '?'}] ${e.message}`
}

export default function App() {
  const [network, setNetwork] = useState(EMPTY_NETWORK)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [loadflowResult, setLoadflowResult] = useState(null)
  const [shortcircuitResult, setShortcircuitResult] = useState(null)
  const [cyclesResult, setCyclesResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingLabel, setLoadingLabel] = useState('')
  const [error, setError] = useState(null)
  const [activeModal, setActiveModal] = useState(null)
  const [resultTab, setResultTab] = useState('loadflow')
  const [showResults, setShowResults] = useState(false)
  const positionRef = useRef({})

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = networkToFlow(
      network, positionRef.current, loadflowResult, shortcircuitResult, cyclesResult
    )
    setNodes(newNodes)
    setEdges(newEdges)
  }, [network, loadflowResult, shortcircuitResult, cyclesResult])

  const onNodesChange = useCallback((changes) => {
    const safe = changes.filter((c) => c.type !== 'remove')
    safe.forEach((c) => {
      if (c.type === 'position' && c.position) positionRef.current[c.id] = c.position
    })
    setNodes((nds) => applyNodeChanges(safe, nds))
  }, [])

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes.filter((c) => c.type !== 'remove'), eds))
  }, [])

  const handleAddElement = useCallback((type, data) => {
    setNetwork((prev) => {
      const next = { ...prev }
      switch (type) {
        case '모선':       next.buses = [...prev.buses, { ...data, type: 'b' }]; break
        case '외부계통':   next.external_grids = [...prev.external_grids, data]; break
        case '부하':       next.loads = [...prev.loads, data]; break
        case '발전기':     next.generators = [...prev.generators, data]; break
        case '선로':       next.lines = [...prev.lines, data]; break
        case '변압기':     next.transformers = [...prev.transformers, data]; break
        case '차단기':     next.circuit_breakers = [...(prev.circuit_breakers || []), data]; break
      }
      return next
    })
    setLoadflowResult(null); setShortcircuitResult(null); setCyclesResult(null); setError(null)
  }, [])

  const handleRunLoadflow = async () => {
    if (network.buses.length === 0) return setError('모선을 먼저 추가하세요.')
    if (network.external_grids.length === 0) return setError('외부계통을 추가해야 합니다.')
    setLoading(true); setLoadingLabel('Load Flow'); setError(null)
    try {
      const result = await runLoadflow(network)
      setLoadflowResult(result); setShowResults(true); setResultTab('loadflow')
    } catch (e) { setError(apiError(e)) } finally { setLoading(false) }
  }

  const handleRunShortcircuit = async () => {
    if (network.buses.length === 0) return setError('모선을 먼저 추가하세요.')
    setLoading(true); setLoadingLabel('Short-Circuit'); setError(null)
    try {
      const result = await runShortcircuit(network)
      setShortcircuitResult(result); setShowResults(true); setResultTab('shortcircuit')
    } catch (e) { setError(apiError(e)) } finally { setLoading(false) }
  }

  const handleRunCycles = async () => {
    if (network.buses.length === 0) return setError('모선을 먼저 추가하세요.')
    setLoading(true); setLoadingLabel('SC Cycles'); setError(null)
    try {
      const result = await runShortcircuitCycles(network)
      setCyclesResult(result); setShowResults(true); setResultTab('cycles')
    } catch (e) { setError(apiError(e)) } finally { setLoading(false) }
  }

  const handleLoadExample = () => {
    positionRef.current = {}
    setNetwork(EXAMPLE_NETWORK)
    setLoadflowResult(null); setShortcircuitResult(null); setCyclesResult(null)
    setError(null); setShowResults(false)
  }

  const handleClear = () => {
    positionRef.current = {}
    setNetwork(EMPTY_NETWORK)
    setLoadflowResult(null); setShortcircuitResult(null); setCyclesResult(null)
    setError(null); setShowResults(false)
  }

  const nextBusId = network.buses.length > 0 ? Math.max(...network.buses.map((b) => b.id)) + 1 : 1
  const totalLoad = network.loads.reduce((s, l) => s + (l.p_mw || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif" }}>

      {/* ── Title bar (ETAP deep blue) ─────────────────────────── */}
      <div className="title-bar">
        {/* Logo area */}
        <svg width="20" height="20" viewBox="0 0 20 20" style={{ flexShrink: 0 }}>
          <circle cx="10" cy="10" r="9" fill="none" stroke="#60a0e8" strokeWidth="1.5"/>
          <path d="M4,10 h12 M10,4 v12" stroke="#60a0e8" strokeWidth="1.5"/>
          <circle cx="10" cy="10" r="3" fill="#60a0e8"/>
        </svg>
        <span className="title-bar-product">PowerFlow Analyzer</span>
        <span className="title-bar-sep" />
        <span className="title-bar-project">{network.name}</span>
        <span className="title-bar-spacer" />
        {loading && (
          <span style={{ fontSize: 10, color: '#f0c060', fontFamily: 'Consolas,monospace' }}>
            ◌ {loadingLabel} 실행 중…
          </span>
        )}
        {!loading && loadflowResult && (
          <span className={`badge ${loadflowResult.converged ? 'badge-ok' : 'badge-err'}`}>
            LF {loadflowResult.converged ? '수렴 ✓' : '미수렴 ✗'}
          </span>
        )}
        <span className="title-bar-sep" />
        <span className="title-bar-info">IEC 60909 · pandapower · 60 Hz</span>
      </div>

      {/* ── PowerRibbon ────────────────────────────────────────── */}
      <div className="ribbon">

        {/* ─ File group ─ */}
        <div className="rbn-group">
          <div className="rbn-row">
            <button onClick={handleLoadExample} className="rbn-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="3" width="10" height="14" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                <rect x="8" y="7" width="10" height="14" rx="1" fill="white" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11h4M11 14h4M11 17h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              예제 로드
            </button>
            <button onClick={handleClear} className="rbn-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 8l8 8M16 8L8 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              초기화
            </button>
          </div>
          <div className="rbn-gname">파 일</div>
        </div>

        <div className="rbn-div"/>

        {/* ─ Analysis group ─ */}
        <div className="rbn-group">
          <div className="rbn-row">
            <button
              onClick={handleRunLoadflow}
              disabled={loading}
              className={`rbn-btn rbn-btn-lf${loading && loadingLabel === 'Load Flow' ? ' rbn-btn-running' : ''}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M9.5 8.5l7 3.5-7 3.5V8.5z" fill="currentColor"/>
              </svg>
              {loading && loadingLabel === 'Load Flow' ? '계산 중…' : 'Load Flow'}
            </button>
            <button
              onClick={handleRunShortcircuit}
              disabled={loading}
              className={`rbn-btn rbn-btn-sc${loading && loadingLabel === 'Short-Circuit' ? ' rbn-btn-running' : ''}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              </svg>
              {loading && loadingLabel === 'Short-Circuit' ? '계산 중…' : 'Short-Circuit'}
            </button>
            <button
              onClick={handleRunCycles}
              disabled={loading}
              className={`rbn-btn rbn-btn-cy${loading && loadingLabel === 'SC Cycles' ? ' rbn-btn-running' : ''}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 12 Q5.5 6 8 12 Q10.5 18 13 12 Q15.5 6 18 12 Q20 16 21 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                <path d="M13 2L8 9h5l-1 5 5-6h-5l1-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" transform="translate(3,-1) scale(0.65)"/>
              </svg>
              {loading && loadingLabel === 'SC Cycles' ? '계산 중…' : 'SC Multi-Cycle'}
            </button>
          </div>
          <div className="rbn-gname">해 석 계 산</div>
        </div>

        {/* ─ View group (only when results exist) ─ */}
        {(loadflowResult || shortcircuitResult || cyclesResult) && (
          <>
            <div className="rbn-div"/>
            <div className="rbn-group">
              <div className="rbn-row">
                <button
                  onClick={() => setShowResults((v) => !v)}
                  className="rbn-btn"
                  style={showResults ? { background: 'rgba(200,225,255,0.7)', borderColor: '#6090c0' } : {}}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M3 8h18" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M7 12h10M7 15h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  {showResults ? '결과 닫기' : '결과 보기'}
                </button>
              </div>
              <div className="rbn-gname">보 기</div>
            </div>
          </>
        )}

        {/* ─ Right side: convergence badge + loading indicator ─ */}
        <div className="rbn-info">
          {loading && (
            <span style={{ fontSize: 10, color: '#7a5000', fontFamily: 'Consolas,monospace', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>◌</span>
              {loadingLabel} 계산 중…
            </span>
          )}
          {!loading && loadflowResult && (
            <span className={`badge ${loadflowResult.converged ? 'badge-ok' : 'badge-err'}`}>
              LF {loadflowResult.converged ? '수렴 ✓' : '미수렴 ✗'}
            </span>
          )}
        </div>
      </div>

      {/* ── Error bar ──────────────────────────────────────────── */}
      {error && (
        <div className="error-bar">
          <span className="error-bar-tag">ERROR</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#800000', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
        </div>
      )}

      {/* ── Main area ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar network={network} onAddElement={(type) => setActiveModal(type)} />
        <NetworkDiagram nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} />
        {showResults && (
          <ResultsPanel
            loadflowResult={loadflowResult}
            shortcircuitResult={shortcircuitResult}
            cyclesResult={cyclesResult}
            tab={resultTab}
            onTabChange={setResultTab}
            onClose={() => setShowResults(false)}
          />
        )}
      </div>

      {/* ── Status bar ─────────────────────────────────────────── */}
      <div className="status-bar">
        <div className="sb-cell"><span className="lbl">BUS</span><span className="val">{network.buses.length}</span></div>
        <div className="sb-cell"><span className="lbl">LINE</span><span className="val">{network.lines.length}</span></div>
        <div className="sb-cell"><span className="lbl">TRAFO</span><span className="val">{network.transformers.length}</span></div>
        <div className="sb-cell"><span className="lbl">CB</span><span className="val">{(network.circuit_breakers ?? []).length}</span></div>
        <div className="sb-cell"><span className="lbl">LOAD</span><span className="val">{network.loads.length}</span></div>
        <div className="sb-cell"><span className="lbl">GEN</span><span className="val">{network.generators.length}</span></div>
        {totalLoad > 0 && (
          <div className="sb-cell"><span className="lbl">ΣP</span><span className="val">{totalLoad.toFixed(2)} MW</span></div>
        )}
        {loadflowResult && (
          <div className="sb-cell"><span className="lbl">Loss</span><span className="val">{loadflowResult.total_loss_mw.toFixed(4)} MW</span></div>
        )}
        <div className="sb-spacer" />
        <div className="sb-right">Single-Line Diagram  |  IEC 60909  |  60 Hz</div>
      </div>

      {activeModal && (
        <ElementModal
          type={activeModal} network={network} nextBusId={nextBusId}
          onSubmit={handleAddElement} onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  )
}

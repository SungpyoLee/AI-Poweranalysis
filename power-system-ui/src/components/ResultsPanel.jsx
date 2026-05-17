function LoadBar({ value }) {
  const cls = value > 90 ? 'load-bar-fill-err' : value > 70 ? 'load-bar-fill-warn' : 'load-bar-fill-ok'
  const numCls = value > 90 ? 'err' : value > 70 ? 'warn' : 'ok'
  return (
    <div className="load-bar-wrap">
      <div className="load-bar-track">
        <div className={cls} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={numCls}>{value.toFixed(1)}%</span>
    </div>
  )
}

function SectionRow({ children }) {
  return (
    <tr className="section-row">
      <td colSpan={99}>{children}</td>
    </tr>
  )
}

function LoadflowResults({ result }) {
  if (!result) return null
  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: 'var(--chrome-panel2)', borderBottom: '1px solid var(--chrome-border)' }}>
        <span className={`badge ${result.converged ? 'badge-ok' : 'badge-err'}`}>
          {result.converged ? '✓  CONVERGED' : '✗  DIVERGED'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'Consolas,monospace' }}>
          Total Loss: <strong style={{ color: 'var(--text-primary)' }}>{result.total_loss_mw.toFixed(4)} MW</strong>
        </span>
      </div>

      <table className="eng-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Bus Name</th>
            <th>Vm [pu]</th>
            <th>Vm [kV]</th>
            <th>Va [°]</th>
          </tr>
        </thead>
        <tbody>
          <SectionRow>Bus Voltages</SectionRow>
          {result.buses.map((b) => {
            const cl = b.vm_pu < 0.95 ? 'err' : b.vm_pu > 1.05 ? 'warn' : 'ok'
            return (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td className={cl}>{b.vm_pu.toFixed(4)}</td>
                <td>{b.vm_kv.toFixed(2)}</td>
                <td>{b.va_degree >= 0 ? '+' : ''}{b.va_degree.toFixed(2)}</td>
              </tr>
            )
          })}

          {result.lines.length > 0 && (
            <>
              <SectionRow>Line Loading</SectionRow>
              {result.lines.map((l) => (
                <tr key={l.line_name}>
                  <td>{l.line_name}</td>
                  <td colSpan={2}><LoadBar value={l.loading_percent} /></td>
                  <td style={{ color: 'var(--text-mono)', fontFamily: 'Consolas,monospace' }}>{l.p_from_mw.toFixed(3)}</td>
                </tr>
              ))}
            </>
          )}

          {result.transformers.length > 0 && (
            <>
              <SectionRow>Transformer Loading</SectionRow>
              {result.transformers.map((t) => (
                <tr key={t.trafo_name}>
                  <td>{t.trafo_name}</td>
                  <td colSpan={2}><LoadBar value={t.loading_percent} /></td>
                  <td style={{ color: 'var(--text-mono)', fontFamily: 'Consolas,monospace' }}>{t.p_hv_mw.toFixed(3)}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ShortcircuitResults({ result }) {
  if (!result) return null
  return (
    <table className="eng-table">
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Bus Name</th>
          <th>Ik'' [kA]</th>
          <th>Sk [MVA]</th>
        </tr>
      </thead>
      <tbody>
        <SectionRow>3-Phase Fault — Initial Symmetrical (IEC 60909)</SectionRow>
        {result.buses.map((b) => (
          <tr key={b.name}>
            <td>{b.name}</td>
            <td className="err" style={{ fontWeight: 700 }}>{b.ikss_ka.toFixed(4)}</td>
            <td>{b.sk_mva.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function CyclesResults({ result }) {
  if (!result) return null
  return (
    <div>
      <div style={{ padding: '5px 8px', background: 'var(--chrome-panel2)', borderBottom: '1px solid var(--chrome-border)', fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'Consolas,monospace' }}>
        I(n) = Ik&Prime; × √(1 + 2·e<sup>−4πn/(X/R)</sup>)  — Asymmetrical RMS
      </div>
      <table className="eng-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Bus Name</th>
            <th>Ik'' [kA]</th>
            <th>X/R</th>
            <th style={{ color: '#900000' }}>½ cy</th>
            <th style={{ color: '#804000' }}>3 cy</th>
            <th style={{ color: '#706000' }}>5 cy</th>
          </tr>
        </thead>
        <tbody>
          <SectionRow>Multi-Cycle Asymmetrical Fault Current</SectionRow>
          {result.buses.map((b) => (
            <tr key={b.name}>
              <td>{b.name}</td>
              <td>{b.ikss_ka.toFixed(4)}</td>
              <td>{b.xr_ratio.toFixed(1)}</td>
              <td style={{ color: '#900000', fontWeight: 700 }}>{b.i_half_cycle_ka.toFixed(4)}</td>
              <td style={{ color: '#804000' }}>{b.i_3cycle_ka.toFixed(4)}</td>
              <td style={{ color: '#706000' }}>{b.i_5cycle_ka.toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, padding: '8px' }}>
        {[
          { label: '½ Cycle', sub: 'Instantaneous', color: '#900000', bg: '#fce8e8' },
          { label: '3 Cycles',   sub: 'Breaker Rating', color: '#804000', bg: '#fdf6e0' },
          { label: '5 Cycles',   sub: 'Relay Operate',  color: '#706000', bg: '#f8f8e0' },
        ].map(({ label, sub, color, bg }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${color}40`, borderTop: `3px solid ${color}`, padding: '5px 6px', borderRadius: 2 }}>
            <div style={{ color, fontWeight: 700, fontSize: 10 }}>{label}</div>
            <div style={{ color: 'var(--text-lo)', fontSize: 9, marginTop: 1 }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const TABS = [
  { id: 'loadflow',     label: 'Load Flow' },
  { id: 'shortcircuit', label: 'Short-Circuit' },
  { id: 'cycles',       label: 'SC Multi-Cycle' },
]

function Empty() {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-lo)', fontSize: 11, marginTop: 48, lineHeight: 2.4 }}>
      계산을 실행하면<br />결과가 여기에 표시됩니다
    </div>
  )
}

export default function ResultsPanel({ loadflowResult, shortcircuitResult, cyclesResult, tab, onTabChange, onClose }) {
  return (
    <div style={{
      width: 340,
      background: 'var(--chrome-panel)',
      borderLeft: '1px solid var(--chrome-border-d)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      boxShadow: '-2px 0 4px rgba(0,0,0,0.08)',
    }}>
      {/* Panel title */}
      <div className="panel-titlebar">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="1" width="10" height="10" rx="1" stroke="white" strokeWidth="1.2"/>
          <path d="M3 4h2M6 4h3M3 6h5M3 8h4M8 8h1" stroke="white" strokeWidth="1" strokeLinecap="round"/>
        </svg>
        해석 결과
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }} title="닫기">✕</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--chrome-border-d)', flexShrink: 0 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onTabChange(t.id)} className={`res-tab ${tab === t.id ? 'res-tab-active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafb' }}>
        {tab === 'loadflow'     && (loadflowResult     ? <LoadflowResults     result={loadflowResult} />     : <Empty />)}
        {tab === 'shortcircuit' && (shortcircuitResult ? <ShortcircuitResults result={shortcircuitResult} /> : <Empty />)}
        {tab === 'cycles'       && (cyclesResult       ? <CyclesResults       result={cyclesResult} />       : <Empty />)}
      </div>
    </div>
  )
}

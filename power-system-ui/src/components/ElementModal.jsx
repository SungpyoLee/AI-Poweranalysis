import { useState } from 'react'

const FIELDS = {
  모선: [
    { key: 'id', label: 'ID', type: 'number' },
    { key: 'name', label: '이름', type: 'text', placeholder: '예) 154kV 모선' },
    { key: 'vn_kv', label: '공칭전압 [kV]', type: 'number', placeholder: '예) 154' },
  ],
  외부계통: [
    { key: 'bus_id', label: '연결 모선', type: 'busselect' },
    { key: 'name', label: '이름', type: 'text', default: '외부계통' },
    { key: 'vm_pu', label: '전압 크기 [pu]', type: 'number', default: 1.0 },
    { key: 'va_degree', label: '전압 위상 [deg]', type: 'number', default: 0.0 },
    { key: 's_sc_max_mva', label: '최대 단락용량 [MVA]', type: 'number', default: 1000 },
    { key: 's_sc_min_mva', label: '최소 단락용량 [MVA]', type: 'number', default: 800 },
    { key: 'rx_max', label: 'R/X 최대', type: 'number', default: 0.1 },
    { key: 'rx_min', label: 'R/X 최소', type: 'number', default: 0.1 },
  ],
  부하: [
    { key: 'bus_id', label: '연결 모선', type: 'busselect' },
    { key: 'name', label: '이름', type: 'text', placeholder: '예) 부하 A' },
    { key: 'p_mw', label: '유효전력 [MW]', type: 'number' },
    { key: 'q_mvar', label: '무효전력 [MVAr]', type: 'number', default: 0 },
  ],
  발전기: [
    { key: 'bus_id', label: '연결 모선', type: 'busselect' },
    { key: 'name', label: '이름', type: 'text', placeholder: '예) G1' },
    { key: 'p_mw', label: '출력 [MW]', type: 'number' },
    { key: 'vm_pu', label: '전압 설정값 [pu]', type: 'number', default: 1.0 },
    { key: 'max_q_mvar', label: '최대 무효전력 [MVAr]', type: 'number', default: 999 },
    { key: 'min_q_mvar', label: '최소 무효전력 [MVAr]', type: 'number', default: -999 },
  ],
  선로: [
    { key: 'from_bus_id', label: '시작 모선', type: 'busselect' },
    { key: 'to_bus_id', label: '끝 모선', type: 'busselect' },
    { key: 'name', label: '이름', type: 'text', placeholder: '예) 22.9kV 선로-1' },
    { key: 'length_km', label: '길이 [km]', type: 'number' },
    { key: 'r_ohm_per_km', label: '저항 [Ω/km]', type: 'number', placeholder: '예) 0.1' },
    { key: 'x_ohm_per_km', label: '리액턴스 [Ω/km]', type: 'number', placeholder: '예) 0.1' },
    { key: 'c_nf_per_km', label: '정전용량 [nF/km]', type: 'number', default: 0 },
    { key: 'max_i_ka', label: '최대전류 [kA]', type: 'number', default: 1.0 },
  ],
  변압기: [
    { key: 'hv_bus_id', label: '1차측 (고압) 모선', type: 'busselect' },
    { key: 'lv_bus_id', label: '2차측 (저압) 모선', type: 'busselect' },
    { key: 'name', label: '이름', type: 'text', placeholder: '예) TR-1' },
    { key: 'sn_mva', label: '정격용량 [MVA]', type: 'number' },
    { key: 'vn_hv_kv', label: '1차측 공칭전압 [kV]', type: 'number' },
    { key: 'vn_lv_kv', label: '2차측 공칭전압 [kV]', type: 'number' },
    { key: 'vk_percent', label: '임피던스전압 [%]', type: 'number', placeholder: '예) 12.0' },
    { key: 'vkr_percent', label: '저항분 임피던스 [%]', type: 'number', default: 1.0 },
    { key: 'pfe_kw', label: '철손 [kW]', type: 'number', default: 0 },
    { key: 'i0_percent', label: '여자전류 [%]', type: 'number', default: 0 },
  ],
}

function getInitialForm(type, nextBusId, buses) {
  const fields = FIELDS[type] || []
  const form = {}
  fields.forEach((f) => {
    if (f.type === 'busselect') {
      form[f.key] = buses[0]?.id ?? ''
    } else if (f.key === 'id' && type === '모선') {
      form[f.key] = nextBusId
    } else {
      form[f.key] = f.default ?? ''
    }
  })
  return form
}

function parseValue(type, value) {
  if (type === 'number') return value === '' ? 0 : parseFloat(value)
  if (type === 'busselect') return parseInt(value, 10)
  return value
}

// ── Styles (ETAP light chrome) ──────────────────────────────────────────────
const s = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16,
  },
  modal: {
    background: '#d8dde4', border: '1px solid #8a9aaa',
    borderRadius: 2, width: 420, maxHeight: '85vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
    fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif",
  },
  titleBar: {
    background: 'linear-gradient(180deg, #1a3a6c 0%, #122a52 100%)',
    color: '#e0ecff', fontSize: 12, fontWeight: 600,
    padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8,
    letterSpacing: '0.04em',
  },
  body: { flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  label: { display: 'block', fontSize: 10, fontWeight: 600, color: '#3a5068', marginBottom: 3, letterSpacing: '0.04em', textTransform: 'uppercase' },
  input: {
    width: '100%', boxSizing: 'border-box',
    background: '#ffffff', border: '1px solid #8a9aaa', borderRadius: 1,
    padding: '4px 7px', fontSize: 12, color: '#0e1e30',
    fontFamily: "'Consolas','Courier New',monospace",
    outline: 'none',
  },
  select: {
    width: '100%', boxSizing: 'border-box',
    background: '#ffffff', border: '1px solid #8a9aaa', borderRadius: 1,
    padding: '4px 7px', fontSize: 12, color: '#0e1e30',
    fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif",
    outline: 'none',
  },
  footer: {
    padding: '8px 14px', borderTop: '1px solid #9aaabb',
    display: 'flex', gap: 6, background: '#cdd2d9',
  },
  btnOk: {
    flex: 1, padding: '5px 0', background: '#1a3a6c', color: '#e0ecff',
    border: '1px solid #0e2848', borderRadius: 1, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  btnCancel: {
    flex: 1, padding: '5px 0', background: '#d8dde4', color: '#1a3040',
    border: '1px solid #8a9aaa', borderRadius: 1, fontSize: 12, cursor: 'pointer',
  },
}

// ── Circuit-breaker form (separate component due to dynamic ref field) ───────
function CBForm({ network, onSubmit, onClose }) {
  const lines = network.lines ?? []
  const trafos = network.transformers ?? []
  const existingCbs = network.circuit_breakers ?? []

  const [on, setOn] = useState('line')
  const [ref, setRef] = useState(lines[0]?.name ?? trafos[0]?.name ?? '')
  const [terminal, setTerminal] = useState('hv')
  const [isClosed, setIsClosed] = useState(true)
  const [name, setName] = useState('')

  const refOptions = on === 'line'
    ? lines.map((l) => l.name)
    : trafos.map((t) => t.name)

  const handleOnChange = (val) => {
    setOn(val)
    const opts = val === 'line' ? lines : trafos
    setRef(opts[0]?.name ?? '')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const usedIds = existingCbs.map((c) => c.id)
    let cbId = `cb-${Date.now()}`
    while (usedIds.includes(cbId)) cbId += '_'
    const data = {
      id: cbId,
      name: name.trim() || cbId,
      on,
      ref,
      is_closed: isClosed,
      ...(on === 'trafo' ? { terminal } : {}),
    }
    onSubmit('차단기', data)
    onClose()
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.titleBar}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="3" width="10" height="8" rx="1" stroke="#60a0e8" strokeWidth="1.4"/>
            <line x1="4" y1="5" x2="10" y2="11" stroke="#60a0e8" strokeWidth="1.2"/>
            <line x1="10" y1="5" x2="4" y2="11" stroke="#60a0e8" strokeWidth="1.2"/>
          </svg>
          차단기 추가
        </div>
        <form onSubmit={handleSubmit}>
          <div style={s.body}>
            <div>
              <label style={s.label}>이름</label>
              <input style={s.input} type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예) CB-T1-HV" />
            </div>
            <div>
              <label style={s.label}>설치 위치</label>
              <select style={s.select} value={on} onChange={(e) => handleOnChange(e.target.value)}>
                <option value="line">선로 (Line)</option>
                <option value="trafo">변압기 (Transformer)</option>
              </select>
            </div>
            <div>
              <label style={s.label}>{on === 'line' ? '선로' : '변압기'} 선택</label>
              {refOptions.length === 0 ? (
                <div style={{ fontSize: 11, color: '#900000', padding: '4px 0' }}>
                  {on === 'line' ? '선로가 없습니다' : '변압기가 없습니다'}
                </div>
              ) : (
                <select style={s.select} value={ref} onChange={(e) => setRef(e.target.value)}>
                  {refOptions.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>
            {on === 'trafo' && (
              <div>
                <label style={s.label}>단자 (Terminal)</label>
                <select style={s.select} value={terminal} onChange={(e) => setTerminal(e.target.value)}>
                  <option value="hv">HV — 1차측 (고압)</option>
                  <option value="lv">LV — 2차측 (저압)</option>
                </select>
              </div>
            )}
            <div>
              <label style={s.label}>상태</label>
              <select style={s.select} value={isClosed ? 'closed' : 'open'} onChange={(e) => setIsClosed(e.target.value === 'closed')}>
                <option value="closed">투입 (Closed)</option>
                <option value="open">개방 (Open)</option>
              </select>
            </div>
          </div>
          <div style={s.footer}>
            <button type="submit" style={s.btnOk}>추가</button>
            <button type="button" style={s.btnCancel} onClick={onClose}>취소</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Generic modal ─────────────────────────────────────────────────────────────
export default function ElementModal({ type, network, nextBusId, onSubmit, onClose }) {
  if (type === '차단기') {
    return <CBForm network={network} onSubmit={onSubmit} onClose={onClose} />
  }

  const buses = network.buses
  const fields = FIELDS[type] || []
  const [form, setForm] = useState(() => getInitialForm(type, nextBusId, buses))

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = {}
    fields.forEach((f) => {
      data[f.key] = parseValue(f.type, form[f.key])
    })
    onSubmit(type, data)
    onClose()
  }

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.titleBar}>+ {type} 추가</div>
        <form onSubmit={handleSubmit}>
          <div style={s.body}>
            {fields.map((f) => (
              <div key={f.key}>
                <label style={s.label}>{f.label}</label>
                {f.type === 'busselect' ? (
                  <select
                    value={form[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    required
                    style={s.select}
                  >
                    {buses.length === 0 && <option value="">— 모선 없음 —</option>}
                    {buses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.vn_kv} kV)
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type}
                    step="any"
                    value={form[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder ?? ''}
                    required={f.type !== 'number' || f.default === undefined}
                    style={s.input}
                  />
                )}
              </div>
            ))}
          </div>
          <div style={s.footer}>
            <button type="submit" style={s.btnOk}>추가</button>
            <button type="button" style={s.btnCancel} onClick={onClose}>취소</button>
          </div>
        </form>
      </div>
    </div>
  )
}

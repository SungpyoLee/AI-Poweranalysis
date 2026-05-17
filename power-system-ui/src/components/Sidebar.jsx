const ELEMENT_DEFS = [
  { type: '모선',    icon: '▬', color: '#0050b0' },
  { type: '외부계통', icon: '∞', color: '#2040a0' },
  { type: '부하',    icon: '▽', color: '#7a3000' },
  { type: '발전기',  icon: 'G~', color: '#005a20' },
  { type: '선로',    icon: '──', color: '#203860' },
  { type: '변압기',  icon: '⊕',  color: '#5a1090' },
  { type: '차단기',  icon: '⊠',  color: '#1a3a5c' },
]

const SECTION_CFG = {
  '모선':    { color: '#0050b0', bg: '#e8f0fc' },
  '외부계통': { color: '#2040a0', bg: '#eaeef8' },
  '부하':    { color: '#7a3000', bg: '#fdf2ea' },
  '발전기':  { color: '#005a20', bg: '#e8f6ee' },
  '선로':    { color: '#203860', bg: '#edf2f8' },
  '변압기':  { color: '#5a1090', bg: '#f4eefa' },
  '차단기':  { color: '#1a3a5c', bg: '#edf1f8' },
}

function ElemItem({ label, sub, cfg }) {
  return (
    <div className="elem-item" style={{ borderLeft: `3px solid ${cfg.color}`, paddingLeft: 6 }}>
      <div className="elem-item-label">{label}</div>
      {sub && <div className="elem-item-sub">{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  const cfg = SECTION_CFG[title] ?? { color: '#3a5068', bg: '#f0f4f8' }
  return (
    <div>
      <div className="panel-section-hdr" style={{ color: cfg.color, borderLeft: `3px solid ${cfg.color}`, paddingLeft: 6, background: cfg.bg }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function Sidebar({ network, onAddElement }) {
  const { buses, external_grids, loads, generators, lines, transformers, circuit_breakers = [] } = network
  const busMap = Object.fromEntries(buses.map((b) => [b.id, b.name]))

  const isEmpty = buses.length === 0 && external_grids.length === 0 &&
    loads.length === 0 && generators.length === 0 && lines.length === 0 &&
    transformers.length === 0 && circuit_breakers.length === 0

  return (
    <div style={{
      width: 200,
      background: 'var(--chrome-panel)',
      borderRight: '1px solid var(--chrome-border-d)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
      boxShadow: '2px 0 4px rgba(0,0,0,0.08)',
    }}>
      {/* Panel title */}
      <div className="panel-titlebar">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="1" width="10" height="10" rx="1" stroke="white" strokeWidth="1.2"/>
          <path d="M3 4h6M3 6h6M3 8h4" stroke="white" strokeWidth="1" strokeLinecap="round"/>
        </svg>
        계통 편집기
      </div>

      {/* Add elements */}
      <div style={{ padding: '6px', borderBottom: '2px solid var(--chrome-border-d)', flexShrink: 0, background: 'var(--chrome-panel)' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-lo)', marginBottom: 4, paddingLeft: 2 }}>
          요소 삽입
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {ELEMENT_DEFS.map(({ type, icon, color }) => (
            <button
              key={type}
              onClick={() => onAddElement(type)}
              className="elem-btn"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.color = '' }}
            >
              <span className="elem-btn-icon" style={{ color }}>{icon}</span>
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Element tree */}
      <div style={{ padding: '4px 0 0', borderBottom: '1px solid var(--chrome-border)', flexShrink: 0, background: 'var(--chrome-panel2)' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-lo)', padding: '2px 8px 4px' }}>
          계통 구성 요소
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', background: '#f4f6fa' }}>
        {isEmpty && (
          <div style={{ textAlign: 'center', color: 'var(--text-lo)', fontSize: 11, marginTop: 28, lineHeight: 2 }}>
            요소를 추가하면<br />여기에 표시됩니다
          </div>
        )}

        {buses.length > 0 && (
          <Section title="모선">
            {buses.map((b) => (
              <ElemItem key={b.id} label={b.name} sub={`${b.vn_kv} kV  ·  ID ${b.id}`} cfg={SECTION_CFG['모선']} />
            ))}
          </Section>
        )}
        {external_grids.length > 0 && (
          <Section title="외부계통">
            {external_grids.map((eg, i) => (
              <ElemItem key={i} label={eg.name} sub={`→ ${busMap[eg.bus_id] ?? eg.bus_id}`} cfg={SECTION_CFG['외부계통']} />
            ))}
          </Section>
        )}
        {generators.length > 0 && (
          <Section title="발전기">
            {generators.map((g, i) => (
              <ElemItem key={i} label={g.name} sub={`${g.p_mw} MW  @  ${busMap[g.bus_id] ?? g.bus_id}`} cfg={SECTION_CFG['발전기']} />
            ))}
          </Section>
        )}
        {loads.length > 0 && (
          <Section title="부하">
            {loads.map((l, i) => (
              <ElemItem key={i} label={l.name} sub={`${l.p_mw} MW  @  ${busMap[l.bus_id] ?? l.bus_id}`} cfg={SECTION_CFG['부하']} />
            ))}
          </Section>
        )}
        {lines.length > 0 && (
          <Section title="선로">
            {lines.map((l, i) => (
              <ElemItem key={i} label={l.name}
                sub={`${busMap[l.from_bus_id] ?? l.from_bus_id} → ${busMap[l.to_bus_id] ?? l.to_bus_id}`}
                cfg={SECTION_CFG['선로']} />
            ))}
          </Section>
        )}
        {transformers.length > 0 && (
          <Section title="변압기">
            {transformers.map((t, i) => (
              <ElemItem key={i} label={t.name} sub={`${t.sn_mva} MVA  ·  Vk ${t.vk_percent}%`} cfg={SECTION_CFG['변압기']} />
            ))}
          </Section>
        )}
        {circuit_breakers.length > 0 && (
          <Section title="차단기">
            {circuit_breakers.map((cb, i) => (
              <ElemItem key={i} label={cb.name}
                sub={`${cb.on === 'trafo' ? '변압기' : '선로'} ${cb.ref}${cb.terminal ? ` (${cb.terminal.toUpperCase()})` : ''}  ·  ${cb.is_closed ? '투입' : '개방'}`}
                cfg={SECTION_CFG['차단기']} />
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}

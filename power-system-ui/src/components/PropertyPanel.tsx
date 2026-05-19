import { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData, EquipmentType,
  BusProperties, TransformerProperties, BreakerProperties,
  MotorProperties, GeneratorProperties, CableProperties,
} from '../types'

// ── Generic field row ─────────────────────────────────────────────────────────
function Field({
  label, value, unit, onChange, type = 'text',
}: {
  label: string
  value: string | number | boolean
  unit?: string
  type?: 'text' | 'number' | 'select'
  onChange: (val: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
      <label style={{
        width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0,
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}>
        {label}
      </label>
      <input
        type={type === 'number' ? 'number' : 'text'}
        step="any"
        value={String(value)}
        onChange={e => onChange(e.target.value)}
        style={{
          flex: 1, minWidth: 0,
          padding: '2px 5px',
          fontSize: 10.5,
          fontFamily: 'Consolas, monospace',
          background: '#ffffff',
          border: '1px solid #b0bcc8',
          borderRadius: 2,
          color: '#0a1a2a',
          outline: 'none',
        }}
        onFocus={e => { e.target.style.borderColor = '#1a3a8a' }}
        onBlur={e => { e.target.style.borderColor = '#b0bcc8' }}
      />
      {unit && (
        <span style={{ fontSize: 9.5, color: '#7a8898', fontFamily: 'Consolas, monospace', flexShrink: 0 }}>
          {unit}
        </span>
      )}
    </div>
  )
}

function BoolField({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
      <label style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        {label}
      </label>
      <select
        value={value ? 'closed' : 'open'}
        onChange={e => onChange(e.target.value === 'closed')}
        style={{
          flex: 1, padding: '2px 5px', fontSize: 10.5,
          background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a',
        }}
      >
        <option value="closed">Closed (투입)</option>
        <option value="open">Open (개방)</option>
      </select>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: '#7a8898',
        borderBottom: '1px solid #d0d8e0',
        paddingBottom: 3,
        marginBottom: 6,
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── Per-type property forms ──────────────────────────────────────────────────
function BusForm({ props, onChange }: { props: BusProperties; onChange: (p: BusProperties) => void }) {
  const u = (key: keyof BusProperties) => (val: string) => onChange({ ...props, [key]: key === 'vn_kv' ? parseFloat(val) : val })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={props.name} onChange={u('name')} />
      </Section>
      <Section title="Electrical">
        <Field label="Nominal Voltage" value={props.vn_kv} unit="kV" type="number" onChange={u('vn_kv')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <label style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial" }}>Bus Type</label>
          <select
            value={props.busType}
            onChange={e => onChange({ ...props, busType: e.target.value as BusProperties['busType'] })}
            style={{ flex: 1, padding: '2px 5px', fontSize: 10.5, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
          >
            <option value="PQ">PQ (Load Bus)</option>
            <option value="PV">PV (Generator Bus)</option>
            <option value="Slack">Slack (Reference)</option>
          </select>
        </div>
      </Section>
    </>
  )
}

function TransformerForm({ props, onChange }: { props: TransformerProperties; onChange: (p: TransformerProperties) => void }) {
  const u = (key: keyof TransformerProperties) => (val: string) => onChange({ ...props, [key]: key === 'name' ? val : parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={props.name} onChange={u('name')} />
      </Section>
      <Section title="Rating">
        <Field label="Rated Power"  value={props.sn_mva}    unit="MVA" type="number" onChange={u('sn_mva')} />
        <Field label="HV Voltage"   value={props.vn_hv_kv}  unit="kV"  type="number" onChange={u('vn_hv_kv')} />
        <Field label="LV Voltage"   value={props.vn_lv_kv}  unit="kV"  type="number" onChange={u('vn_lv_kv')} />
      </Section>
      <Section title="Impedance">
        <Field label="Vk%"    value={props.vk_percent} unit="%" type="number" onChange={u('vk_percent')} />
        <Field label="X/R"    value={props.xr_ratio}          type="number" onChange={u('xr_ratio')} />
      </Section>
    </>
  )
}

function BreakerForm({ props, onChange }: { props: BreakerProperties; onChange: (p: BreakerProperties) => void }) {
  const u = (key: keyof BreakerProperties) => (val: string) => onChange({ ...props, [key]: parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={props.name} onChange={v => onChange({ ...props, name: v })} />
      </Section>
      <Section title="Rating">
        <Field label="Rated Current"     value={props.rated_kA}    unit="kA" type="number" onChange={u('rated_kA')} />
        <Field label="Interrupt Capacity" value={props.interrupt_kA} unit="kA" type="number" onChange={u('interrupt_kA')} />
      </Section>
      <Section title="Status">
        <BoolField label="State" value={props.is_closed} onChange={v => onChange({ ...props, is_closed: v })} />
      </Section>
    </>
  )
}

function MotorForm({ props, onChange }: { props: MotorProperties; onChange: (p: MotorProperties) => void }) {
  const u = (key: keyof MotorProperties) => (val: string) => onChange({ ...props, [key]: key === 'name' ? val : parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={props.name} onChange={u('name')} />
      </Section>
      <Section title="Rating">
        <Field label="Power"      value={props.p_kw}      unit="kW" type="number" onChange={u('p_kw')} />
        <Field label="Voltage"    value={props.vn_kv}     unit="kV" type="number" onChange={u('vn_kv')} />
        <Field label="Power Factor" value={props.pf}              type="number" onChange={u('pf')} />
        <Field label="Efficiency" value={props.efficiency} unit="%" type="number" onChange={u('efficiency')} />
      </Section>
    </>
  )
}

function GeneratorForm({ props, onChange }: { props: GeneratorProperties; onChange: (p: GeneratorProperties) => void }) {
  const u = (key: keyof GeneratorProperties) => (val: string) => onChange({ ...props, [key]: key === 'name' ? val : parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={props.name} onChange={u('name')} />
      </Section>
      <Section title="Rating">
        <Field label="Active Power" value={props.p_mw}  unit="MW" type="number" onChange={u('p_mw')} />
        <Field label="Voltage"      value={props.vn_kv} unit="kV" type="number" onChange={u('vn_kv')} />
        <Field label="Power Factor" value={props.pf}             type="number" onChange={u('pf')} />
        <Field label="Vm setpoint"  value={props.vm_pu} unit="pu" type="number" onChange={u('vm_pu')} />
      </Section>
    </>
  )
}

function CableForm({ props, onChange }: { props: CableProperties; onChange: (p: CableProperties) => void }) {
  const u = (key: keyof CableProperties) => (val: string) => onChange({ ...props, [key]: key === 'name' ? val : parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={props.name} onChange={u('name')} />
      </Section>
      <Section title="Parameters">
        <Field label="Length"      value={props.length_km}      unit="km"    type="number" onChange={u('length_km')} />
        <Field label="Resistance"  value={props.r_ohm_per_km}   unit="Ω/km"  type="number" onChange={u('r_ohm_per_km')} />
        <Field label="Reactance"   value={props.x_ohm_per_km}   unit="Ω/km"  type="number" onChange={u('x_ohm_per_km')} />
        <Field label="Max Current" value={props.max_i_ka}        unit="kA"    type="number" onChange={u('max_i_ka')} />
      </Section>
    </>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  bus: '#1a3a8a', transformer: '#5a1090', breaker: '#1a4a1a',
  motor: '#5a3000', generator: '#003a50', cable: '#3a3a3a',
}

// ── Main panel ────────────────────────────────────────────────────────────────
interface Props {
  selectedNode: Node<NodeData> | null
  selectedEdge: Edge<EdgeData> | null
  onUpdateNode: (id: string, props: NodeData['props']) => void
  onUpdateEdge: (id: string, props: CableProperties) => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (id: string) => void
}

export default function PropertyPanel({
  selectedNode, selectedEdge, onUpdateNode, onUpdateEdge, onDeleteNode, onDeleteEdge,
}: Props) {
  const hasSelection = selectedNode || selectedEdge

  return (
    <aside style={{
      width: 260,
      background: '#f0f2f5',
      borderLeft: '1px solid #c8d0d8',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
    }}>
      {/* Panel header */}
      <div style={{
        padding: '8px 12px',
        background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
        color: '#e8f0ff',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
      }}>
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <rect x="1" y="1" width="11" height="11" rx="1" stroke="white" strokeWidth="1.2"/>
          <path d="M4 4h5M4 6.5h5M4 9h3" stroke="white" strokeWidth="1" strokeLinecap="round"/>
        </svg>
        Properties
      </div>

      {!hasSelection && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8898a8',
          fontSize: 11,
          padding: 20,
          textAlign: 'center',
          lineHeight: 2,
        }}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ marginBottom: 10 }}>
            <rect x="2" y="2" width="28" height="28" rx="2" stroke="#c8d0d8" strokeWidth="1.5" strokeDasharray="4 2"/>
            <path d="M11 16h10M16 11v10" stroke="#c8d0d8" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          장비를 클릭하면<br/>속성을 편집할 수 있습니다
        </div>
      )}

      {hasSelection && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>
          {/* Type badge + name */}
          {selectedNode && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  background: TYPE_COLOR[selectedNode.type ?? 'bus'] + '18',
                  color: TYPE_COLOR[selectedNode.type ?? 'bus'],
                  border: `1px solid ${TYPE_COLOR[selectedNode.type ?? 'bus']}40`,
                  borderRadius: 2,
                }}>
                  {selectedNode.type}
                </span>
                <button
                  onClick={() => onDeleteNode(selectedNode.id)}
                  style={{
                    background: 'none', border: '1px solid #e08080', borderRadius: 2,
                    color: '#900000', fontSize: 10, padding: '2px 8px', cursor: 'pointer',
                  }}
                >
                  삭제
                </button>
              </div>

              {selectedNode.type === 'bus' && (
                <BusForm
                  props={selectedNode.data.props as BusProperties}
                  onChange={p => onUpdateNode(selectedNode.id, p)}
                />
              )}
              {selectedNode.type === 'transformer' && (
                <TransformerForm
                  props={selectedNode.data.props as TransformerProperties}
                  onChange={p => onUpdateNode(selectedNode.id, p)}
                />
              )}
              {selectedNode.type === 'breaker' && (
                <BreakerForm
                  props={selectedNode.data.props as BreakerProperties}
                  onChange={p => onUpdateNode(selectedNode.id, p)}
                />
              )}
              {selectedNode.type === 'motor' && (
                <MotorForm
                  props={selectedNode.data.props as MotorProperties}
                  onChange={p => onUpdateNode(selectedNode.id, p)}
                />
              )}
              {selectedNode.type === 'generator' && (
                <GeneratorForm
                  props={selectedNode.data.props as GeneratorProperties}
                  onChange={p => onUpdateNode(selectedNode.id, p)}
                />
              )}
            </>
          )}

          {selectedEdge && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '2px 8px', background: '#3a3a3a18', color: '#3a3a3a',
                  border: '1px solid #3a3a3a40', borderRadius: 2,
                }}>
                  Cable
                </span>
                <button
                  onClick={() => onDeleteEdge(selectedEdge.id)}
                  style={{
                    background: 'none', border: '1px solid #e08080', borderRadius: 2,
                    color: '#900000', fontSize: 10, padding: '2px 8px', cursor: 'pointer',
                  }}
                >
                  삭제
                </button>
              </div>
              {selectedEdge.data && (
                <CableForm
                  props={selectedEdge.data.props}
                  onChange={p => onUpdateEdge(selectedEdge.id, p)}
                />
              )}
            </>
          )}
        </div>
      )}
    </aside>
  )
}

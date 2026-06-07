import { useState } from 'react'
import type {
  Equipment, Cable,
  Bus, Transformer, Breaker, Motor, Generator, Load, MotorGroup,
  RelayCurveType, EarthFaultRelay, SystemGrounding, HarmonicSource, HarmonicSourceType,
  ArcFlashEnclosureType, TransformerVectorGroup, DifferentialRelaySettings, CableInstallMethod,
} from '../types'
import { useEquipmentStore } from '../store/useEquipmentStore'
import LibraryModal from './LibraryModal'
import type { LibraryType } from '../library'
import { HARMONIC_PRESETS } from '../engine/harmonics'

const DEFAULT_HARMONIC: HarmonicSource = {
  enabled:     false,
  source_type: 'VFD',
  h5_percent:  25,
  h7_percent:  14,
  h11_percent: 9,
  h13_percent: 7,
  h17_percent: 4,
  h19_percent: 3,
  h23_percent: 2,
  h25_percent: 1.5,
}

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
        value={value ? 'true' : 'false'}
        onChange={e => onChange(e.target.value === 'true')}
        style={{
          flex: 1, padding: '2px 5px', fontSize: 10.5,
          background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a',
        }}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
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
function BusForm({ eq, onChange }: { eq: Bus; onChange: (e: Bus) => void }) {
  const numericKeys: (keyof Bus)[] = ['vn_kv', 'working_distance_mm', 'sc_mva', 'xr_ratio', 'x0r0_ratio']
  const u = (key: keyof Bus) => (val: string) =>
    onChange({ ...eq, [key]: numericKeys.includes(key) ? parseFloat(val) : val })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={eq.name} onChange={u('name')} />
        <Field label="TAG" value={eq.tag ?? ''} onChange={v => onChange({ ...eq, tag: v || undefined })} />
        <Field label="Description" value={eq.description} onChange={u('description')} />
        <BoolField label="In Service" value={eq.in_service} onChange={v => onChange({ ...eq, in_service: v })} />
      </Section>
      <Section title="Electrical">
        <Field label="Nominal Voltage" value={eq.vn_kv} unit="kV" type="number" onChange={u('vn_kv')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <label style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial" }}>Bus Type</label>
          <select
            value={eq.busType}
            onChange={e => onChange({ ...eq, busType: e.target.value as Bus['busType'] })}
            style={{ flex: 1, padding: '2px 5px', fontSize: 10.5, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
          >
            <option value="PQ">PQ (Load Bus)</option>
            <option value="PV">PV (Generator Bus)</option>
            <option value="Slack">Slack (Reference)</option>
          </select>
        </div>
      </Section>

      {eq.busType === 'Slack' && (
        <Section title="External Grid (IEC 60909 Thevenin Source)">
          <div style={{ background: '#fffbe8', border: '1px solid #e0c840', borderRadius: 2, padding: '4px 6px', marginBottom: 6, fontSize: 9.5, color: '#7a6000' }}>
            계통 임피던스 — 한전 공급 조건서 값 입력
          </div>
          <Field label="Grid Sk''" value={eq.sc_mva ?? 5000} unit="MVA" type="number" onChange={u('sc_mva')} />
          <Field label="X/R ratio"  value={eq.xr_ratio ?? 10}  type="number" onChange={u('xr_ratio')} />
          <Field label="X0/R0 ratio" value={eq.x0r0_ratio ?? (eq.xr_ratio ?? 10)} type="number" onChange={u('x0r0_ratio')} />
        </Section>
      )}

      <Section title="Arc Flash (IEEE 1584-2018)">
        <Field
          label="Working Dist."
          value={eq.working_distance_mm ?? 455}
          unit="mm"
          type="number"
          onChange={u('working_distance_mm')}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <label style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial" }}>
            Enclosure Type
          </label>
          <select
            value={eq.enclosure_type ?? 'MV_SWITCHGEAR'}
            onChange={e => onChange({ ...eq, enclosure_type: e.target.value as ArcFlashEnclosureType })}
            style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
          >
            <option value="OPEN_AIR">Open Air (야외 노출)</option>
            <option value="LV_SWITCHGEAR">LV Switchgear (≤1kV)</option>
            <option value="MCC">MCC (≤1kV)</option>
            <option value="MV_SWITCHGEAR">MV Switchgear (1–15kV)</option>
            <option value="HV_SWITCHGEAR">HV Switchgear (&gt;15kV)</option>
            <option value="CABLE">Cable Busway / Tray</option>
          </select>
        </div>
      </Section>
    </>
  )
}

function TransformerForm({ eq, onChange }: { eq: Transformer; onChange: (e: Transformer) => void }) {
  const strKeys: (keyof Transformer)[] = ['name', 'description', 'vector_group']
  const u = (key: keyof Transformer) => (val: string) =>
    onChange({ ...eq, [key]: strKeys.includes(key) ? val : parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={eq.name} onChange={u('name')} />
        <Field label="TAG" value={eq.tag ?? ''} onChange={v => onChange({ ...eq, tag: v || undefined })} />
        <Field label="Description" value={eq.description} onChange={u('description')} />
        <BoolField label="In Service" value={eq.in_service} onChange={v => onChange({ ...eq, in_service: v })} />
      </Section>
      <Section title="Rating">
        <Field label="Rated Power"  value={eq.sn_mva}    unit="MVA" type="number" onChange={u('sn_mva')} />
        <Field label="HV Voltage"   value={eq.vn_hv_kv}  unit="kV"  type="number" onChange={u('vn_hv_kv')} />
        <Field label="LV Voltage"   value={eq.vn_lv_kv}  unit="kV"  type="number" onChange={u('vn_lv_kv')} />
      </Section>
      <Section title="Vector Group (IEC 60076)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <label style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial" }}>
            Vector Group
          </label>
          <select
            value={eq.vector_group ?? 'Dyn11'}
            onChange={e => onChange({ ...eq, vector_group: e.target.value as TransformerVectorGroup })}
            style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
          >
            <optgroup label="산업용 표준 (Delta HV)">
              <option value="Dyn11">Dyn11 — △/YN (산업 표준)</option>
              <option value="Dyn1">Dyn1</option>
            </optgroup>
            <optgroup label="양측 접지 Y">
              <option value="YNyn0">YNyn0</option>
              <option value="YNyn11">YNyn11</option>
            </optgroup>
            <optgroup label="HV 접지, LV Delta">
              <option value="YNd11">YNd11</option>
              <option value="YNd1">YNd1</option>
            </optgroup>
            <optgroup label="기타">
              <option value="Yyn0">Yyn0</option>
              <option value="Yyn11">Yyn11</option>
              <option value="Dd0">Dd0</option>
              <option value="Yzn11">Yzn11</option>
            </optgroup>
          </select>
        </div>
        <div style={{ background: '#f0f4fa', border: '1px solid #c8d4e4', borderRadius: 2, padding: '4px 6px', fontSize: 9.5, color: '#4a5a6a' }}>
          {(() => {
            const vg = eq.vector_group ?? 'Dyn11'
            if (vg.startsWith('Dy') || vg.startsWith('Dd')) return '△ HV → 영상전류 차단 (1LG 계통측 전류 없음)'
            if (vg.startsWith('YN') || vg.includes('yn')) return 'YN → 영상전류 통과 (지락전류 흐름)'
            return '접지 방식 확인 필요'
          })()}
        </div>
      </Section>
      <Section title="Impedance (Positive Sequence)">
        <Field label="Vk%"          value={eq.vk_percent}  unit="%" type="number" onChange={u('vk_percent')} />
        <Field label="Vkr%"         value={eq.vkr_percent} unit="%" type="number" onChange={u('vkr_percent')} />
        <Field label="Iron Loss"    value={eq.pfe_kw}      unit="kW" type="number" onChange={u('pfe_kw')} />
        <Field label="No-load I%"   value={eq.i0_percent}  unit="%" type="number" onChange={u('i0_percent')} />
      </Section>
      <Section title="Zero-Sequence Impedance (비대칭 단락용)">
        <div style={{ background: '#fff8e8', border: '1px solid #e0c860', borderRadius: 2, padding: '4px 6px', marginBottom: 6, fontSize: 9.5, color: '#7a5a00' }}>
          1LG/2LG 고장계산에 필수. 시험성적서 Z0 항목 참조.
        </div>
        <Field label="Vk0%"   value={eq.vk0_percent  ?? eq.vk_percent}  unit="%" type="number"
          onChange={v => onChange({ ...eq, vk0_percent:  parseFloat(v) })} />
        <Field label="Vkr0%"  value={eq.vkr0_percent ?? eq.vkr_percent} unit="%" type="number"
          onChange={v => onChange({ ...eq, vkr0_percent: parseFloat(v) })} />
      </Section>
      <Section title="Tap Changer">
        <Field label="Tap Position" value={eq.tap_pos}          type="number" onChange={u('tap_pos')} />
        <Field label="Tap Neutral"  value={eq.tap_neutral}      type="number" onChange={u('tap_neutral')} />
        <Field label="Tap Min"      value={eq.tap_min}          type="number" onChange={u('tap_min')} />
        <Field label="Tap Max"      value={eq.tap_max}          type="number" onChange={u('tap_max')} />
        <Field label="Step Size"    value={eq.tap_step_percent} unit="%" type="number" onChange={u('tap_step_percent')} />
      </Section>
    </>
  )
}

function BreakerForm({ eq, onChange }: { eq: Breaker; onChange: (e: Breaker) => void }) {
  const busNodes = useEquipmentStore(s => s.nodes.filter(n => n.type === 'bus'))
  const u = (key: keyof Breaker) => (val: string) =>
    onChange({ ...eq, [key]: parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={eq.name} onChange={v => onChange({ ...eq, name: v })} />
        <Field label="TAG" value={eq.tag ?? ''} onChange={v => onChange({ ...eq, tag: v || undefined })} />
        <Field label="Description" value={eq.description} onChange={v => onChange({ ...eq, description: v })} />
        <BoolField label="In Service" value={eq.in_service} onChange={v => onChange({ ...eq, in_service: v })} />
      </Section>
      <Section title="Rating">
        <Field label="Rated Voltage"  value={eq.rated_kv}     unit="kV" type="number" onChange={u('rated_kv')} />
        <Field label="Rated Current"  value={eq.rated_kA}     unit="kA" type="number" onChange={u('rated_kA')} />
        <Field label="Interrupt kA"   value={eq.interrupt_kA} unit="kA" type="number" onChange={u('interrupt_kA')} />
      </Section>
      <Section title="Protection Coordination">
        <Field label="Breaking Cap."  value={eq.breaking_capacity_ka} unit="kA" type="number" onChange={u('breaking_capacity_ka')} />
        <Field label="Making Cap."    value={eq.making_capacity_ka}   unit="kA" type="number" onChange={u('making_capacity_ka')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <label style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial" }}>
            Protected Bus
          </label>
          <select
            value={eq.protectedBusId ?? ''}
            onChange={e => onChange({ ...eq, protectedBusId: e.target.value || undefined })}
            style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
          >
            <option value="">(auto — max Ik")</option>
            {busNodes.map(n => (
              <option key={n.id} value={n.id}>{n.data.equipment.name}</option>
            ))}
          </select>
        </div>
      </Section>
      <Section title="Status">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <label style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial" }}>State</label>
          <select
            value={eq.is_closed ? 'closed' : 'open'}
            onChange={e => onChange({ ...eq, is_closed: e.target.value === 'closed' })}
            style={{ flex: 1, padding: '2px 5px', fontSize: 10.5, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
          >
            <option value="closed">Closed (투입)</option>
            <option value="open">Open (개방)</option>
          </select>
        </div>
      </Section>
      <Section title="Relay 50/51 (IEC 60255 / ANSI C37.112)">
        {!eq.relay ? (
          <button
            onClick={() => onChange({
              ...eq,
              relay: { pickup_current_a: 200, time_dial: 0.1, inst_enabled: true, inst_pickup_a: 2000, curve_type: 'IEC_NORMAL_INVERSE' },
            })}
            style={{
              width: '100%', padding: '4px 8px', fontSize: 10, cursor: 'pointer',
              background: '#e8f0fa', border: '1px solid #7a9acc', borderRadius: 2,
              color: '#1a3a7a', fontFamily: "'Segoe UI', sans-serif",
            }}
          >+ Enable OCR (50/51)</button>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
              <span style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial" }}>Curve Type</span>
              <select
                value={eq.relay.curve_type}
                onChange={e => onChange({ ...eq, relay: { ...eq.relay!, curve_type: e.target.value as RelayCurveType } })}
                style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
              >
                <optgroup label="IEC 60255">
                  <option value="IEC_NORMAL_INVERSE">IEC Normal Inverse</option>
                  <option value="IEC_VERY_INVERSE">IEC Very Inverse</option>
                  <option value="IEC_EXTREMELY_INVERSE">IEC Extremely Inverse</option>
                </optgroup>
                <optgroup label="ANSI/IEEE C37.112">
                  <option value="ANSI_MODERATELY_INVERSE">ANSI Moderately Inverse</option>
                  <option value="ANSI_INVERSE">ANSI Inverse</option>
                  <option value="ANSI_VERY_INVERSE">ANSI Very Inverse</option>
                  <option value="ANSI_EXTREMELY_INVERSE">ANSI Extremely Inverse</option>
                  <option value="ANSI_SHORT_INVERSE">ANSI Short Inverse</option>
                </optgroup>
              </select>
            </div>
            <Field label="Pickup (A)" value={eq.relay.pickup_current_a} unit="A" type="number"
              onChange={v => onChange({ ...eq, relay: { ...eq.relay!, pickup_current_a: parseFloat(v) } })} />
            <Field label="Time Dial" value={eq.relay.time_dial} type="number"
              onChange={v => onChange({ ...eq, relay: { ...eq.relay!, time_dial: parseFloat(v) } })} />
            <BoolField label="Inst. Enable" value={eq.relay.inst_enabled}
              onChange={v => onChange({ ...eq, relay: { ...eq.relay!, inst_enabled: v } })} />
            {eq.relay.inst_enabled && (
              <Field label="Inst. Pickup" value={eq.relay.inst_pickup_a} unit="A" type="number"
                onChange={v => onChange({ ...eq, relay: { ...eq.relay!, inst_pickup_a: parseFloat(v) } })} />
            )}
            <button onClick={() => onChange({ ...eq, relay: undefined })}
              style={{ marginTop: 2, padding: '3px 8px', fontSize: 9.5, cursor: 'pointer', background: '#fde8e8', border: '1px solid #e08080', borderRadius: 2, color: '#8a0000', fontFamily: "'Segoe UI', sans-serif" }}>
              Remove
            </button>
          </>
        )}
      </Section>

      <Section title="Relay 51N / 접지 방식 (P2-5)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <span style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0 }}>Grounding</span>
          <select
            value={eq.grounding ?? 'SOLID'}
            onChange={e => onChange({ ...eq, grounding: e.target.value as SystemGrounding })}
            style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
          >
            <option value="SOLID">Solid (직접접지)</option>
            <option value="RESISTANCE">Resistance (저항접지)</option>
            <option value="REACTANCE">Reactance (리액턴스접지)</option>
            <option value="ISOLATED">Isolated (비접지)</option>
          </select>
        </div>
        {!eq.relay_51n ? (
          (eq.grounding ?? 'SOLID') !== 'ISOLATED' ? (
            <button
              onClick={() => onChange({
                ...eq,
                relay_51n: { pickup_current_a: 50, time_dial: 0.1, curve_type: 'IEC_NORMAL_INVERSE', inst_enabled: false, inst_pickup_a: 500 },
              })}
              style={{ width: '100%', padding: '4px 8px', fontSize: 10, cursor: 'pointer', background: '#e8f0fa', border: '1px solid #7a9acc', borderRadius: 2, color: '#1a3a7a', fontFamily: "'Segoe UI', sans-serif" }}
            >+ Enable 51N (지락 보호)</button>
          ) : (
            <div style={{ fontSize: 9.5, color: '#8a9aaa' }}>비접지 계통 — 51N 불필요</div>
          )
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
              <span style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0 }}>51N Curve</span>
              <select
                value={eq.relay_51n.curve_type}
                onChange={e => onChange({ ...eq, relay_51n: { ...eq.relay_51n!, curve_type: e.target.value as RelayCurveType } })}
                style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
              >
                <option value="IEC_NORMAL_INVERSE">IEC Normal Inverse</option>
                <option value="IEC_VERY_INVERSE">IEC Very Inverse</option>
                <option value="IEC_EXTREMELY_INVERSE">IEC Extremely Inverse</option>
                <option value="ANSI_VERY_INVERSE">ANSI Very Inverse</option>
                <option value="ANSI_EXTREMELY_INVERSE">ANSI Extremely Inverse</option>
              </select>
            </div>
            <Field label="51N Pickup (A)" value={eq.relay_51n.pickup_current_a} unit="A" type="number"
              onChange={v => onChange({ ...eq, relay_51n: { ...eq.relay_51n!, pickup_current_a: parseFloat(v) } })} />
            <Field label="51N TMS" value={eq.relay_51n.time_dial} type="number"
              onChange={v => onChange({ ...eq, relay_51n: { ...eq.relay_51n!, time_dial: parseFloat(v) } })} />
            <button onClick={() => onChange({ ...eq, relay_51n: undefined })}
              style={{ marginTop: 2, padding: '3px 8px', fontSize: 9.5, cursor: 'pointer', background: '#fde8e8', border: '1px solid #e08080', borderRadius: 2, color: '#8a0000', fontFamily: "'Segoe UI', sans-serif" }}>
              Remove 51N
            </button>
          </>
        )}
      </Section>

      <Section title="Relay 87T — 차동계전기 (IEC 60255-151 / IEEE C37.91)">
        {!eq.relay_87t ? (
          <button
            onClick={() => onChange({
              ...eq,
              relay_87t: { pickup_pct: 20, slope1_pct: 25, slope2_pct: 40, harmonic_restraint: true, harmonic_pct: 15 },
            })}
            style={{ width: '100%', padding: '4px 8px', fontSize: 10, cursor: 'pointer', background: '#f0e8fa', border: '1px solid #9a6acc', borderRadius: 2, color: '#4a0a7a', fontFamily: "'Segoe UI', sans-serif" }}
          >+ Enable 87T (차동 보호)</button>
        ) : (
          <>
            <div style={{ background: '#f8f0ff', border: '1px solid #c8a8e8', borderRadius: 2, padding: '4px 6px', marginBottom: 6, fontSize: 9.5, color: '#4a0a7a' }}>
              변압기 내부 고장 보호 — 주 보호 계전기
            </div>
            <Field label="Pickup (%In)"  value={eq.relay_87t.pickup_pct}  unit="%" type="number"
              onChange={v => onChange({ ...eq, relay_87t: { ...eq.relay_87t!, pickup_pct: parseFloat(v) } })} />
            <Field label="Slope 1 (%)"   value={eq.relay_87t.slope1_pct}  unit="%" type="number"
              onChange={v => onChange({ ...eq, relay_87t: { ...eq.relay_87t!, slope1_pct: parseFloat(v) } })} />
            <Field label="Slope 2 (%)"   value={eq.relay_87t.slope2_pct}  unit="%" type="number"
              onChange={v => onChange({ ...eq, relay_87t: { ...eq.relay_87t!, slope2_pct: parseFloat(v) } })} />
            <BoolField label="2nd Harmonic" value={eq.relay_87t.harmonic_restraint}
              onChange={v => onChange({ ...eq, relay_87t: { ...eq.relay_87t!, harmonic_restraint: v } })} />
            {eq.relay_87t.harmonic_restraint && (
              <Field label="Harmonic (%)" value={eq.relay_87t.harmonic_pct} unit="%" type="number"
                onChange={v => onChange({ ...eq, relay_87t: { ...eq.relay_87t!, harmonic_pct: parseFloat(v) } })} />
            )}
            <button onClick={() => onChange({ ...eq, relay_87t: undefined })}
              style={{ marginTop: 2, padding: '3px 8px', fontSize: 9.5, cursor: 'pointer', background: '#fde8e8', border: '1px solid #e08080', borderRadius: 2, color: '#8a0000', fontFamily: "'Segoe UI', sans-serif" }}>
              Remove 87T
            </button>
          </>
        )}
      </Section>
    </>
  )
}

function HarmonicSourceForm({
  harmonic, onChange,
}: { harmonic: HarmonicSource; onChange: (h: HarmonicSource) => void }) {
  const applyPreset = (type: HarmonicSourceType) => {
    const preset = HARMONIC_PRESETS[type as string]
    if (preset) {
      onChange({ ...preset, enabled: harmonic.enabled, source_type: type })
    } else {
      onChange({ ...harmonic, source_type: type })
    }
  }
  return (
    <>
      <BoolField label="Enabled" value={harmonic.enabled}
        onChange={v => onChange({ ...harmonic, enabled: v })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        <span style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0, fontFamily: "'Segoe UI', Arial" }}>
          Source Type
        </span>
        <select
          value={harmonic.source_type}
          onChange={e => applyPreset(e.target.value as HarmonicSourceType)}
          style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
        >
          <option value="VFD">VFD</option>
          <option value="UPS">UPS</option>
          <option value="Rectifier">Rectifier</option>
          <option value="Inverter">Inverter</option>
          <option value="Custom">Custom</option>
        </select>
      </div>
      <Field label="h5 (%)"  value={harmonic.h5_percent}  unit="%" type="number"
        onChange={v => onChange({ ...harmonic, h5_percent:  parseFloat(v) || 0, source_type: 'Custom' })} />
      <Field label="h7 (%)"  value={harmonic.h7_percent}  unit="%" type="number"
        onChange={v => onChange({ ...harmonic, h7_percent:  parseFloat(v) || 0, source_type: 'Custom' })} />
      <Field label="h11 (%)" value={harmonic.h11_percent} unit="%" type="number"
        onChange={v => onChange({ ...harmonic, h11_percent: parseFloat(v) || 0, source_type: 'Custom' })} />
      <Field label="h13 (%)" value={harmonic.h13_percent} unit="%" type="number"
        onChange={v => onChange({ ...harmonic, h13_percent: parseFloat(v) || 0, source_type: 'Custom' })} />
      <Field label="h17 (%)" value={harmonic.h17_percent} unit="%" type="number"
        onChange={v => onChange({ ...harmonic, h17_percent: parseFloat(v) || 0, source_type: 'Custom' })} />
      <Field label="h19 (%)" value={harmonic.h19_percent} unit="%" type="number"
        onChange={v => onChange({ ...harmonic, h19_percent: parseFloat(v) || 0, source_type: 'Custom' })} />
      <Field label="h23 (%)" value={harmonic.h23_percent ?? 0} unit="%" type="number"
        onChange={v => onChange({ ...harmonic, h23_percent: parseFloat(v) || 0, source_type: 'Custom' })} />
      <Field label="h25 (%)" value={harmonic.h25_percent ?? 0} unit="%" type="number"
        onChange={v => onChange({ ...harmonic, h25_percent: parseFloat(v) || 0, source_type: 'Custom' })} />
    </>
  )
}

const STARTING_METHODS = ['DOL', 'Star-Delta', 'Soft-Starter', 'VFD'] as const

function MotorForm({ eq, onChange }: { eq: Motor; onChange: (e: Motor) => void }) {
  const u = (key: keyof Motor) => (val: string) =>
    onChange({ ...eq, [key]: key === 'name' || key === 'description' || key === 'starting_method' ? val : parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name"        value={eq.name}        onChange={u('name')} />
        <Field label="TAG" value={eq.tag ?? ''} onChange={v => onChange({ ...eq, tag: v || undefined })} />
        <Field label="Description" value={eq.description} onChange={u('description')} />
        <BoolField label="In Service" value={eq.in_service} onChange={v => onChange({ ...eq, in_service: v })} />
      </Section>
      <Section title="Rating">
        <Field label="Rated Power"  value={eq.rated_kw}    unit="kW" type="number" onChange={u('rated_kw')} />
        <Field label="Voltage"      value={eq.vn_kv}       unit="kV" type="number" onChange={u('vn_kv')} />
        <Field label="Efficiency"   value={eq.efficiency}  unit="%"  type="number" onChange={u('efficiency')} />
        <Field label="Power Factor" value={eq.power_factor}           type="number" onChange={u('power_factor')} />
      </Section>
      <Section title="Starting">
        <Field label="Is/In Ratio" value={eq.starting_current_multiple} type="number" onChange={u('starting_current_multiple')} />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0 }}>Method</span>
          <select
            value={eq.starting_method}
            onChange={e => onChange({ ...eq, starting_method: e.target.value as Motor['starting_method'] })}
            style={{
              flex: 1, fontSize: 10, fontFamily: 'Consolas, monospace',
              padding: '1px 4px', border: '1px solid #c0cad4', borderRadius: 2,
              background: '#fff', color: '#0a1828',
            }}
          >
            {STARTING_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </Section>
      <Section title="Harmonic Source (IEEE 519)">
        {!eq.harmonic ? (
          <button
            onClick={() => onChange({ ...eq, harmonic: DEFAULT_HARMONIC })}
            style={{
              width: '100%', padding: '4px 8px', fontSize: 10, cursor: 'pointer',
              background: '#e8f4ee', border: '1px solid #7abca0', borderRadius: 2,
              color: '#004a2a', fontFamily: "'Segoe UI', sans-serif",
            }}
          >
            + Enable Harmonic Source
          </button>
        ) : (
          <>
            <HarmonicSourceForm
              harmonic={eq.harmonic}
              onChange={h => onChange({ ...eq, harmonic: h })}
            />
            <button
              onClick={() => onChange({ ...eq, harmonic: undefined })}
              style={{
                marginTop: 4, padding: '3px 8px', fontSize: 9.5, cursor: 'pointer',
                background: '#fde8e8', border: '1px solid #e08080', borderRadius: 2,
                color: '#8a0000', fontFamily: "'Segoe UI', sans-serif",
              }}
            >
              Remove Harmonic Source
            </button>
          </>
        )}
      </Section>
    </>
  )
}

function GeneratorForm({ eq, onChange }: { eq: Generator; onChange: (e: Generator) => void }) {
  const u = (key: keyof Generator) => (val: string) =>
    onChange({ ...eq, [key]: key === 'name' || key === 'description' ? val : parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={eq.name} onChange={u('name')} />
        <Field label="TAG" value={eq.tag ?? ''} onChange={v => onChange({ ...eq, tag: v || undefined })} />
        <Field label="Description" value={eq.description} onChange={u('description')} />
        <BoolField label="In Service" value={eq.in_service} onChange={v => onChange({ ...eq, in_service: v })} />
      </Section>
      <Section title="Rating">
        <Field label="Rated MVA"    value={eq.sn_mva}  unit="MVA" type="number" onChange={u('sn_mva')} />
        <Field label="Active Power" value={eq.p_mw}    unit="MW"  type="number" onChange={u('p_mw')} />
        <Field label="Voltage"      value={eq.vn_kv}   unit="kV"  type="number" onChange={u('vn_kv')} />
        <Field label="Power Factor" value={eq.pf}                 type="number" onChange={u('pf')} />
        <Field label="Vm setpoint"  value={eq.vm_pu}   unit="pu"  type="number" onChange={u('vm_pu')} />
      </Section>
      <Section title="Q Limits">
        <Field label="Max Q" value={eq.max_q_mvar} unit="Mvar" type="number" onChange={u('max_q_mvar')} />
        <Field label="Min Q" value={eq.min_q_mvar} unit="Mvar" type="number" onChange={u('min_q_mvar')} />
      </Section>
      <Section title="Reactances — Positive Sequence (pu)">
        <Field label="Xd (sync)"    value={eq.xd_pu}       type="number" onChange={u('xd_pu')} />
        <Field label="Xd' (trans)"  value={eq.xd_prime_pu} type="number" onChange={u('xd_prime_pu')} />
        <Field label="Xd'' (subtrans)" value={eq.xdpp_pu}  type="number" onChange={u('xdpp_pu')} />
      </Section>
      <Section title="Reactances — Negative/Zero Sequence (pu)">
        <div style={{ background: '#f0f4fa', border: '1px solid #c8d4e4', borderRadius: 2, padding: '4px 6px', marginBottom: 6, fontSize: 9.5, color: '#4a5a6a' }}>
          비대칭 단락(1LG/2LG) 계산에 필요
        </div>
        <Field label="X2 (neg-seq)"  value={eq.x2_pu} type="number" onChange={u('x2_pu')} />
        <Field label="X0 (zero-seq)" value={eq.x0_pu} type="number" onChange={u('x0_pu')} />
        <Field label="cos φ rated"   value={eq.cos_phi_rated} type="number" onChange={u('cos_phi_rated')} />
      </Section>
    </>
  )
}

function LoadForm({ eq, onChange }: { eq: Load; onChange: (e: Load) => void }) {
  const u = (key: keyof Load) => (val: string) =>
    onChange({ ...eq, [key]: key === 'name' || key === 'description' ? val : parseFloat(val) })
  return (
    <>
      <Section title="Identification">
        <Field label="Name" value={eq.name} onChange={u('name')} />
        <Field label="TAG" value={eq.tag ?? ''} onChange={v => onChange({ ...eq, tag: v || undefined })} />
        <Field label="Description" value={eq.description} onChange={u('description')} />
        <BoolField label="In Service" value={eq.in_service} onChange={v => onChange({ ...eq, in_service: v })} />
      </Section>
      <Section title="Load">
        <Field label="Active Power"   value={eq.p_kw}   unit="kW"   type="number" onChange={u('p_kw')} />
        <Field label="Reactive Power" value={eq.q_kvar} unit="kvar" type="number" onChange={u('q_kvar')} />
        <Field label="Voltage"        value={eq.vn_kv}  unit="kV"   type="number" onChange={u('vn_kv')} />
        <Field label="Power Factor"   value={eq.pf}               type="number" onChange={u('pf')} />
        <Field label="Scaling"        value={eq.scaling}          type="number" onChange={u('scaling')} />
      </Section>
      <Section title="ZIP Model (%)">
        <Field label="Const Z%" value={eq.const_z_percent} unit="%" type="number" onChange={u('const_z_percent')} />
        <Field label="Const I%" value={eq.const_i_percent} unit="%" type="number" onChange={u('const_i_percent')} />
        <Field label="Const P%" value={eq.const_p_percent} unit="%" type="number" onChange={u('const_p_percent')} />
      </Section>
      <Section title="Harmonic Source (IEEE 519)">
        {!eq.harmonic ? (
          <button
            onClick={() => onChange({ ...eq, harmonic: DEFAULT_HARMONIC })}
            style={{
              width: '100%', padding: '4px 8px', fontSize: 10, cursor: 'pointer',
              background: '#e8f4ee', border: '1px solid #7abca0', borderRadius: 2,
              color: '#004a2a', fontFamily: "'Segoe UI', sans-serif",
            }}
          >
            + Enable Harmonic Source
          </button>
        ) : (
          <>
            <HarmonicSourceForm
              harmonic={eq.harmonic}
              onChange={h => onChange({ ...eq, harmonic: h })}
            />
            <button
              onClick={() => onChange({ ...eq, harmonic: undefined })}
              style={{
                marginTop: 4, padding: '3px 8px', fontSize: 9.5, cursor: 'pointer',
                background: '#fde8e8', border: '1px solid #e08080', borderRadius: 2,
                color: '#8a0000', fontFamily: "'Segoe UI', sans-serif",
              }}
            >
              Remove Harmonic Source
            </button>
          </>
        )}
      </Section>
    </>
  )
}

function CableForm({ cable, onChange }: { cable: Cable; onChange: (c: Cable) => void }) {
  const strKeys: (keyof Cable)[] = ['name', 'description', 'std_type', 'installation_method']
  const u = (key: keyof Cable) => (val: string) =>
    onChange({ ...cable, [key]: strKeys.includes(key) ? val : parseFloat(val) })

  const len_km  = (cable.length_m ?? 0) / 1000
  const r_total = (cable.r_ohm_per_km ?? 0) * len_km
  const x_total = (cable.x_ohm_per_km ?? 0) * len_km
  const showComputed = len_km > 0 && (r_total > 0 || x_total > 0)

  return (
    <>
      <Section title="Identification">
        <Field label="Name"      value={cable.name}     onChange={u('name')} />
        <Field label="Std Type"  value={cable.std_type} onChange={u('std_type')} />
        <BoolField label="In Service" value={cable.in_service} onChange={v => onChange({ ...cable, in_service: v })} />
      </Section>
      <Section title="Parameters">
        <Field label="Length"      value={cable.length_m}      unit="m"     type="number" onChange={u('length_m')} />
        <Field label="R1 (Ω/km)"  value={cable.r_ohm_per_km}  unit="Ω/km"  type="number" onChange={u('r_ohm_per_km')} />
        <Field label="X1 (Ω/km)"  value={cable.x_ohm_per_km}  unit="Ω/km"  type="number" onChange={u('x_ohm_per_km')} />
        <Field label="C1 (nF/km)" value={cable.c_nf_per_km}   unit="nF/km" type="number" onChange={u('c_nf_per_km')} />
        <Field label="R0 (Ω/km)"  value={cable.r0_ohm_per_km} unit="Ω/km"  type="number" onChange={u('r0_ohm_per_km')} />
        <Field label="X0 (Ω/km)"  value={cable.x0_ohm_per_km} unit="Ω/km"  type="number" onChange={u('x0_ohm_per_km')} />
          <Field label="Max Current" value={cable.max_i_ka}      unit="kA"    type="number" onChange={u('max_i_ka')} />
        <Field label="Parallel"    value={cable.parallel ?? 1} type="number" onChange={u('parallel')} />
      </Section>
      <Section title="IEC 60287 Derating (온도·그룹 보정)">
        <div style={{ background: '#f8f4ff', border: '1px solid #c8b8e4', borderRadius: 2, padding: '4px 6px', marginBottom: 6, fontSize: 9.5, color: '#4a2a7a' }}>
          보정계수 미입력 시 기본값 사용 (감소계수 없음)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          <label style={{ width: 110, fontSize: 10, color: '#4a5a6a', flexShrink: 0 }}>Install Method</label>
          <select
            value={cable.installation_method ?? 'IN_AIR'}
            onChange={e => onChange({ ...cable, installation_method: e.target.value as CableInstallMethod })}
            style={{ flex: 1, padding: '2px 5px', fontSize: 10, background: '#fff', border: '1px solid #b0bcc8', borderRadius: 2, color: '#0a1a2a' }}
          >
            <option value="IN_AIR">In Air (공기 중)</option>
            <option value="CLIPPED">Clipped (벽면 고정)</option>
            <option value="TRAY_SPACED">Tray Spaced (트레이 간격)</option>
            <option value="TRAY_TOUCHING">Tray Touching (트레이 밀착)</option>
            <option value="DUCT">In Duct (전선관)</option>
            <option value="DIRECT_BURIED">Direct Buried (직매)</option>
          </select>
        </div>
        <Field label="Ambient Temp" value={cable.ambient_temp_c ?? 40} unit="°C" type="number"
          onChange={v => onChange({ ...cable, ambient_temp_c: parseFloat(v) })} />
        <Field label="Ref. Temp (Tmax)" value={cable.ref_temp_c ?? 70} unit="°C" type="number"
          onChange={v => onChange({ ...cable, ref_temp_c: parseFloat(v) })} />
        <Field label="Grouping Factor" value={cable.grouping_factor ?? 1.0} type="number"
          onChange={v => onChange({ ...cable, grouping_factor: parseFloat(v) })} />
        {(() => {
          const Ta = cable.ambient_temp_c ?? 40
          const Tmax = cable.ref_temp_c ?? 70
          const Ct = Math.sqrt(Math.max((Tmax - Ta) / (Tmax - 30), 0))
          const Cg = cable.grouping_factor ?? 1.0
          const derated = Math.round(cable.max_i_ka * 1000 * Ct * Cg)
          return (
            <div style={{ background: '#f0f8ff', border: '1px solid #a0c0e0', borderRadius: 2, padding: '5px 8px', fontSize: 10, fontFamily: 'Consolas, monospace' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6a7a8a' }}>온도 보정계수 Ct</span>
                <span style={{ fontWeight: 700 }}>{Ct.toFixed(3)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6a7a8a' }}>보정 후 허용전류</span>
                <span style={{ fontWeight: 700, color: derated < cable.max_i_ka * 800 ? '#c00' : '#060' }}>{derated} A</span>
              </div>
            </div>
          )
        })()}
      </Section>
      {showComputed && (
        <Section title="계산값 (길이 × 단위값)">
          <div style={{
            background: '#f0f4fa', border: '1px solid #c8d4e4', borderRadius: 2,
            padding: '6px 8px', fontFamily: 'Consolas, monospace', fontSize: 10,
          }}>
            {[
              ['R_total', r_total.toFixed(4), 'Ω'],
              ['X_total', x_total.toFixed(4), 'Ω'],
              ['Z_total', Math.sqrt(r_total**2 + x_total**2).toFixed(4), 'Ω'],
              ['X/R',     r_total > 0 ? (x_total / r_total).toFixed(2) : '—', ''],
            ].map(([label, val, unit]) => (
              <div key={label as string} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '1px 0', color: '#2a3a4a',
              }}>
                <span style={{ color: '#6a7a8a' }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{val} <span style={{ color: '#8a9aaa', fontWeight: 400 }}>{unit}</span></span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────
// ── MotorGroup form ───────────────────────────────────────────────────────────
function MotorGroupForm({ eq, onChange }: { eq: MotorGroup; onChange: (e: MotorGroup) => void }) {
  const allNodes            = useEquipmentStore(s => s.nodes)
  const setActiveMotorGroup = useEquipmentStore(s => s.setActiveMotorGroup)
  const groupedCount = allNodes.filter(
    n => n.type === 'motor' && (n.data.equipment as Motor).groupId === eq.id
  ).length

  return (
    <>
      <Section title="기본 정보">
        <Field label="그룹명" value={eq.name}
          onChange={v => onChange({ ...eq, name: v })} />
        <Field label="설명" value={eq.description}
          onChange={v => onChange({ ...eq, description: v })} />
        <BoolField label="In Service" value={eq.in_service}
          onChange={v => onChange({ ...eq, in_service: v })} />
      </Section>
      <Section title="그룹 현황">
        <div style={{
          padding: '8px 10px', background: '#fff8f0',
          border: '1px solid #e8d0a0', borderRadius: 2,
          fontSize: 10, fontFamily: 'Consolas, monospace', lineHeight: 1.8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b4a20' }}>포함 전동기</span>
            <span style={{ fontWeight: 700, color: '#3a1400' }}>{groupedCount}대</span>
          </div>
        </div>
        <button
          onClick={() => setActiveMotorGroup(eq.id)}
          style={{
            width: '100%', padding: '5px 0', marginTop: 8,
            background: 'linear-gradient(to bottom, #a06010, #8a5000)',
            border: 'none', borderRadius: 2, color: '#ffe8c0',
            fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'Segoe UI', Arial, sans-serif",
          }}
        >
          전동기 목록 보기
        </button>
      </Section>
    </>
  )
}

const TYPE_COLOR: Record<string, string> = {
  bus: '#1a3a8a', transformer: '#5a1090', breaker: '#1a4a1a',
  motor: '#5a3000', generator: '#003a50', load: '#004a3a', cable: '#3a3a3a',
  motorGroup: '#8a5000',
}

// ── Load From Library button ──────────────────────────────────────────────────
function LibraryBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        width: '100%', padding: '4px 8px', marginBottom: 10,
        background: 'linear-gradient(to bottom, #eef2f8, #e4eaf4)',
        border: '1px solid #8aaac8', borderRadius: 2,
        fontSize: 9.5, fontWeight: 600, color: '#1a3a7a',
        cursor: 'pointer',
        fontFamily: "'Segoe UI', Arial, sans-serif",
        letterSpacing: '0.02em',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(to bottom, #dce6f4, #d0dced)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'linear-gradient(to bottom, #eef2f8, #e4eaf4)' }}
    >
      <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
        <rect x="1" y="2" width="4" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
        <rect x="6" y="1" width="4" height="11" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
        <rect x="11" y="3" width="1" height="9" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
      </svg>
      Load From Library
    </button>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function PropertyPanel({ onCollapse }: { onCollapse?: () => void } = {}) {
  const selectedNode   = useEquipmentStore(s => s.getSelectedNode())
  const selectedEdge   = useEquipmentStore(s => s.getSelectedEdge())
  const updateEquipment = useEquipmentStore(s => s.updateEquipment)
  const updateCable     = useEquipmentStore(s => s.updateCable)
  const deleteNode      = useEquipmentStore(s => s.deleteNode)
  const deleteEdge      = useEquipmentStore(s => s.deleteEdge)

  // ── Library modal state ───────────────────────────────────────────────────
  const [libraryType, setLibraryType] = useState<LibraryType | null>(null)

  const openLibrary  = (t: LibraryType) => setLibraryType(t)
  const closeLibrary = () => setLibraryType(null)

  const handleLibraryApply = (params: Record<string, unknown>) => {
    if (libraryType === 'cable' && selectedEdge) {
      updateCable(selectedEdge.id, { ...selectedEdge.data?.cable, ...params } as Cable)
    } else if (selectedNode) {
      updateEquipment(selectedNode.id, { ...selectedNode.data.equipment, ...params } as Equipment)
    }
    closeLibrary()
  }

  const hasSelection = selectedNode || selectedEdge

  return (
    <aside style={{
      width: '100%',
      background: '#f0f2f5',
      borderLeft: '1px solid #c8d0d8',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
    }}>
      {/* Panel header */}
      <div style={{
        padding: '8px 8px 8px 12px',
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
        <span style={{ flex: 1 }}>Properties</span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="패널 접기"
            style={{
              background: 'none', border: 'none', color: '#a0b8e0',
              cursor: 'pointer', padding: '2px 4px', borderRadius: 2,
              fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ffffff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#a0b8e0' }}
          >
            ›
          </button>
        )}
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
                  onClick={() => deleteNode(selectedNode.id)}
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
                  eq={selectedNode.data.equipment as Bus}
                  onChange={e => updateEquipment(selectedNode.id, e)}
                />
              )}
              {selectedNode.type === 'transformer' && (
                <>
                  <LibraryBtn onClick={() => openLibrary('transformer')} />
                  <TransformerForm
                    eq={selectedNode.data.equipment as Transformer}
                    onChange={e => updateEquipment(selectedNode.id, e)}
                  />
                </>
              )}
              {selectedNode.type === 'breaker' && (
                <>
                  <LibraryBtn onClick={() => openLibrary('breaker')} />
                  <BreakerForm
                    eq={selectedNode.data.equipment as Breaker}
                    onChange={e => updateEquipment(selectedNode.id, e)}
                  />
                </>
              )}
              {selectedNode.type === 'motor' && (
                <MotorForm
                  eq={selectedNode.data.equipment as Motor}
                  onChange={e => updateEquipment(selectedNode.id, e)}
                />
              )}
              {selectedNode.type === 'generator' && (
                <GeneratorForm
                  eq={selectedNode.data.equipment as Generator}
                  onChange={e => updateEquipment(selectedNode.id, e)}
                />
              )}
              {selectedNode.type === 'load' && (
                <LoadForm
                  eq={selectedNode.data.equipment as Load}
                  onChange={e => updateEquipment(selectedNode.id, e)}
                />
              )}
              {selectedNode.type === 'motorGroup' && (
                <MotorGroupForm
                  eq={selectedNode.data.equipment as MotorGroup}
                  onChange={e => updateEquipment(selectedNode.id, e)}
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
                  onClick={() => deleteEdge(selectedEdge.id)}
                  style={{
                    background: 'none', border: '1px solid #e08080', borderRadius: 2,
                    color: '#900000', fontSize: 10, padding: '2px 8px', cursor: 'pointer',
                  }}
                >
                  삭제
                </button>
              </div>
              {selectedEdge.data && (
                <>
                  <LibraryBtn onClick={() => openLibrary('cable')} />
                  <CableForm
                    cable={selectedEdge.data.cable}
                    onChange={c => updateCable(selectedEdge.id, c)}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Library modal ── */}
      {libraryType && (
        <LibraryModal
          type={libraryType}
          onApply={handleLibraryApply}
          onClose={closeLibrary}
        />
      )}
    </aside>
  )
}

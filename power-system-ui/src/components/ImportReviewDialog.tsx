/**
 * ImportReviewDialog — step 3 of DiagramImportDialog.
 * Shows detected equipment and connections; user can toggle items and fix types.
 */

import { useState } from 'react'
import type { DetectedSymbol, SymbolType } from '../import/symbolDetector'
import type { BuildResult } from '../import/graphBuilder'

const TYPE_OPTIONS: SymbolType[] = ['bus', 'transformer', 'transformer3w', 'breaker', 'motor', 'generator', 'load', 'capacitor', 'reactor']
const TYPE_KO: Record<SymbolType, string> = {
  bus: 'Bus', transformer: '변압기', transformer3w: '3권선변압기', breaker: '차단기',
  motor: '전동기', generator: '발전기', load: '부하', capacitor: '콘덴서', reactor: '리액터',
}
const TYPE_COLOR: Record<SymbolType, string> = {
  bus: '#1a3a7a', transformer: '#5a2800', transformer3w: '#7a3800', breaker: '#00507a',
  motor: '#3a006a', generator: '#005a00', load: '#6a4000', capacitor: '#005050', reactor: '#505000',
}

interface Props {
  symbols: DetectedSymbol[]
  graph:   BuildResult
  onImport: (symbols: DetectedSymbol[], graph: BuildResult) => void
  onBack:   () => void
}

export default function ImportReviewDialog({ symbols, graph, onImport, onBack }: Props) {
  const [checked, setChecked]   = useState<Set<string>>(() => new Set(symbols.map(s => s.id)))
  const [types,   setTypes]     = useState<Map<string, SymbolType>>(
    () => new Map(symbols.map(s => [s.id, s.type])),
  )
  const [edgeSet, setEdgeSet]   = useState<Set<string>>(() => new Set(graph.edges.map(e => e.id)))

  const toggleSym  = (id: string) => setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleEdge = (id: string) => setEdgeSet(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setType    = (id: string, t: SymbolType) => setTypes(prev => new Map(prev).set(id, t))
  const toggleAll  = () => {
    if (checked.size === symbols.length) setChecked(new Set())
    else setChecked(new Set(symbols.map(s => s.id)))
  }

  const handleImport = () => {
    const filteredSymbols = symbols
      .filter(s => checked.has(s.id))
      .map(s => ({ ...s, type: types.get(s.id) ?? s.type }))

    const filteredNodes = graph.nodes.filter(n => checked.has(n.id))
    const filteredEdges = graph.edges.filter(e =>
      edgeSet.has(e.id) && checked.has(e.source) && checked.has(e.target),
    )

    // Patch node types if user changed them
    const patchedNodes = filteredNodes.map(n => ({
      ...n,
      type: types.get(n.id) ?? n.type,
    }))

    onImport(filteredSymbols, { nodes: patchedNodes, edges: filteredEdges })
  }

  const activeCount = checked.size
  const activeEdges = graph.edges.filter(e =>
    edgeSet.has(e.id) && checked.has(e.source) && checked.has(e.target),
  ).length

  const labelFor = (id: string) => symbols.find(s => s.id === id)?.label ?? id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Summary bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 20px', background: '#f0f4f8', borderBottom: '1px solid #d0d8e4',
        fontSize: 9.5, fontFamily: "'Segoe UI', Arial, sans-serif",
      }}>
        <span style={{ color: '#1a3a7a', fontWeight: 700 }}>인식 결과 검토</span>
        <span style={{ color: '#4a5a7a' }}>
          장비 <b>{activeCount}</b>/{symbols.length}개 선택 &nbsp;·&nbsp; 연결 <b>{activeEdges}</b>개
        </span>
        <span style={{ marginLeft: 'auto', color: '#8a9aaa', fontSize: 9 }}>
          타입 수정 가능 · 불필요 항목 체크 해제
        </span>
      </div>

      {/* Equipment table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 0 6px', fontSize: 10, fontWeight: 700,
          color: '#2a3848', fontFamily: "'Segoe UI', Arial, sans-serif",
          borderBottom: '2px solid #c0ccd8',
        }}>
          <input
            type="checkbox"
            checked={checked.size === symbols.length}
            onChange={toggleAll}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ flex: 2 }}>장비 라벨</span>
          <span style={{ flex: 1 }}>타입</span>
          <span style={{ width: 60 }}>신뢰도</span>
          <span style={{ flex: 2, fontSize: 9 }}>파라미터</span>
        </div>

        {symbols.map(sym => {
          const isChecked = checked.has(sym.id)
          const curType   = types.get(sym.id) ?? sym.type
          const pEntries  = Object.entries(sym.params).slice(0, 3)

          return (
            <div key={sym.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 0', borderBottom: '1px solid #eef0f4',
              opacity: isChecked ? 1 : 0.4,
              fontFamily: 'Consolas, monospace',
            }}>
              <input
                type="checkbox" checked={isChecked}
                onChange={() => toggleSym(sym.id)}
                style={{ cursor: 'pointer', flexShrink: 0 }}
              />
              {/* Label */}
              <span style={{ flex: 2, fontSize: 10, fontWeight: 600, color: '#1a2838',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sym.label}
              </span>
              {/* Type selector */}
              <select
                value={curType}
                onChange={e => setType(sym.id, e.target.value as SymbolType)}
                style={{
                  flex: 1, fontSize: 9.5, padding: '2px 4px',
                  background: `${TYPE_COLOR[curType]}18`,
                  border: `1px solid ${TYPE_COLOR[curType]}60`,
                  borderRadius: 2, color: TYPE_COLOR[curType],
                  fontWeight: 700, cursor: 'pointer', outline: 'none',
                  fontFamily: "'Segoe UI', Arial, sans-serif",
                }}
              >
                {TYPE_OPTIONS.map(t => (
                  <option key={t} value={t}>{TYPE_KO[t]}</option>
                ))}
              </select>
              {/* Confidence */}
              <div style={{ width: 60, display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{
                  height: 4, flex: 1, background: '#e0e8f0', borderRadius: 2, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${Math.round(sym.confidence * 100)}%`,
                    background: sym.confidence > 0.7 ? '#1a9a4a'
                              : sym.confidence > 0.4 ? '#e0a000'
                              : '#c04040',
                  }} />
                </div>
                <span style={{ fontSize: 8, color: '#8a9aaa', minWidth: 22 }}>
                  {Math.round(sym.confidence * 100)}%
                </span>
              </div>
              {/* Params */}
              <div style={{ flex: 2, fontSize: 8.5, color: '#5a6a7a',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pEntries.length > 0
                  ? pEntries.map(([k, v]) => `${k}=${v}`).join(' · ')
                  : <span style={{ color: '#c0c8d4', fontStyle: 'italic' }}>—</span>
                }
              </div>
            </div>
          )
        })}
      </div>

      {/* Connections section */}
      {graph.edges.length > 0 && (
        <div style={{ padding: '0 20px', borderTop: '1px solid #d0d8e4', maxHeight: 160, overflowY: 'auto' }}>
          <div style={{
            fontSize: 9.5, fontWeight: 700, color: '#2a3848', padding: '8px 0 4px',
            fontFamily: "'Segoe UI', Arial, sans-serif",
          }}>
            감지된 연결 ({graph.edges.length}개)
          </div>
          {graph.edges.map(e => {
            const srcLabel = labelFor(e.source)
            const tgtLabel = labelFor(e.target)
            const active   = edgeSet.has(e.id) && checked.has(e.source) && checked.has(e.target)
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 0', opacity: active ? 1 : 0.4,
                fontFamily: 'Consolas, monospace', fontSize: 9.5,
              }}>
                <input
                  type="checkbox" checked={edgeSet.has(e.id)}
                  onChange={() => toggleEdge(e.id)} style={{ cursor: 'pointer' }}
                  disabled={!checked.has(e.source) || !checked.has(e.target)}
                />
                <span style={{ color: '#1a3a7a', fontWeight: 600 }}>{srcLabel}</span>
                <span style={{ color: '#8a9aaa' }}>→</span>
                <span style={{ color: '#2a5a00', fontWeight: 600 }}>{tgtLabel}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Action bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 20px 14px', borderTop: '1px solid #d0d8e0', flexShrink: 0,
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}>
        <button onClick={onBack} style={{
          padding: '5px 16px', fontSize: 10.5, cursor: 'pointer',
          background: '#e8ecf0', border: '1px solid #a0b0c0',
          borderRadius: 2, color: '#3a4a5a',
        }}>
          ← 이전
        </button>
        <button
          onClick={handleImport}
          disabled={activeCount === 0}
          style={{
            padding: '7px 24px', fontSize: 11, fontWeight: 700, cursor: activeCount > 0 ? 'pointer' : 'not-allowed',
            background: activeCount > 0 ? 'linear-gradient(to bottom, #1e3a7a, #152d60)' : '#9aa8b8',
            border: 'none', borderRadius: 3, color: '#fff', opacity: activeCount > 0 ? 1 : 0.6,
          }}
        >
          캔버스에 가져오기 ({activeCount}개)
        </button>
      </div>
    </div>
  )
}

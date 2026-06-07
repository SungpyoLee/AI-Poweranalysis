import { useState } from 'react'
import type { Motor, MotorGroup } from '../types'
import { useEquipmentStore } from '../store/useEquipmentStore'

interface Props {
  groupId: string
  onClose: () => void
}

export default function AddMotorsToGroupPanel({ groupId, onClose }: Props) {
  const allNodes        = useEquipmentStore(s => s.nodes)
  const addMotorsToGroup = useEquipmentStore(s => s.addMotorsToGroup)

  const groupNode = allNodes.find(n => n.id === groupId)
  const group     = groupNode?.data.equipment as MotorGroup | undefined

  // Ungrouped motors only (no groupId set or groupId undefined)
  const available = allNodes.filter(n =>
    n.type === 'motor' && !(n.data.equipment as Motor).groupId
  )

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAdd = () => {
    addMotorsToGroup(groupId, [...selected])
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9100,
      background: 'rgba(0,0,0,0.38)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#f4f6f8',
        border: '1px solid #8a9aaa',
        borderRadius: 3,
        boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
        width: 380, maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(to bottom, #8a5000, #6b3a00)',
          padding: '10px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#ffe8c0' }}>
              전동기 추가
            </span>
            {group && (
              <span style={{ fontSize: 9.5, color: '#c8a070', marginLeft: 8 }}>
                → {group.name}
              </span>
            )}
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#c8a070', cursor: 'pointer', fontSize: 16 }}>
            ✕
          </button>
        </div>

        {/* Motor list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {available.length === 0 ? (
            <div style={{
              padding: '28px 16px', textAlign: 'center',
              color: '#8a9aaa', fontSize: 11,
            }}>
              추가 가능한 전동기가 없습니다.
              <br />
              <span style={{ fontSize: 9.5, color: '#b0bcc8' }}>
                다른 그룹에 속하지 않은 전동기만 표시됩니다.
              </span>
            </div>
          ) : available.map((n, i) => {
            const m = n.data.equipment as Motor
            const checked = selected.has(n.id)
            return (
              <label
                key={n.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 16px',
                  borderBottom: i < available.length - 1 ? '1px solid #e8ecf0' : 'none',
                  background: checked ? '#fff8f0' : '#fff',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(n.id)}
                  style={{ width: 14, height: 14, accentColor: '#8a5000', cursor: 'pointer' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1a2838' }}>{m.name}</div>
                  <div style={{
                    fontSize: 9, color: '#8a9aaa',
                    fontFamily: 'Consolas, monospace', marginTop: 1,
                  }}>
                    {m.rated_kw} kW · {m.vn_kv} kV · PF {m.power_factor}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, color: checked ? '#8a5000' : '#c0c8d0',
                  fontWeight: checked ? 700 : 400,
                }}>
                  {checked ? '선택됨' : ''}
                </span>
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 16px 12px',
          borderTop: '1px solid #d0d8e0', flexShrink: 0,
        }}>
          <span style={{ fontSize: 9.5, color: '#8a9aaa', fontFamily: 'Consolas, monospace' }}>
            {selected.size > 0 ? `${selected.size}개 선택됨` : '전동기를 선택하세요'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose}
              style={{
                padding: '4px 14px', fontSize: 10.5, cursor: 'pointer',
                background: '#e8ecf0', border: '1px solid #a0b0c0',
                borderRadius: 2, color: '#3a4a5a',
              }}>
              취소
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              style={{
                padding: '4px 16px', fontSize: 10.5,
                cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
                background: selected.size > 0
                  ? 'linear-gradient(to bottom, #a06010, #8a5000)'
                  : '#c0b0a0',
                border: 'none', borderRadius: 2, color: '#fff', fontWeight: 700,
                opacity: selected.size > 0 ? 1 : 0.6,
              }}>
              추가
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

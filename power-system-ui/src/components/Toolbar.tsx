import { useState } from 'react'

interface Props {
  onLoadExample: () => void
  onClear: () => void
  onAutoLayout: () => void
  onRunLoadflow: () => void
  onRunLoadflowLocal: () => void
  onRunShortcircuit: () => void
  onRunContingency: () => void
  onRunHarmonics: () => void
  onRunCableSizing: () => void
  onExportPDF:      () => void
  onExportPNG:      () => void
  onRunAsymFault:   () => void
  onOpenTapOpt:     () => void
  onImportLoadSch:  () => void
  loading: boolean
  loadingLabel: string
  converged: boolean | null
  meta?: { iterationCount: number; maxMismatch: number; elapsedMs: number } | null
  nodeCount: number
  edgeCount: number
  hasResults: boolean
  // Project management
  projectName: string
  isDirty: boolean
  onNew:      () => void
  onOpen:     () => void
  onSave:     () => void
  onSaveAs:   () => void
  onRecent:   () => void
  onEditMeta: () => void
  // Datasheet
  onOpenDatasheet: () => void
  // SLD Import & Library
  onImportSLD:        () => void
  onOpenLibrary:      () => void
  // Motor List Import
  onImportMotorList:  () => void
  // #1 Undo/Redo
  onUndo:    () => void
  onRedo:    () => void
  canUndo:   boolean
  canRedo:   boolean
  // #13 Auto Recalculate
  autoRecalc:    boolean
  onAutoRecalc:  (v: boolean) => void
  // Keyboard shortcuts modal
  onShowShortcuts: () => void
}

function RibbonBtn({
  icon, label, onClick, disabled = false, color,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '4px 10px',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: 2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 9.5,
        color: disabled ? '#9aa8b8' : (color ?? '#1a2030'),
        fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
        minWidth: 48,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.1s, border-color 0.1s',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          const el = e.currentTarget
          el.style.background = 'rgba(255,255,255,0.7)'
          el.style.borderColor = '#8aaabb'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.background = 'transparent'
        el.style.borderColor = 'transparent'
      }}
    >
      {icon}
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 4px' }}>
      <div style={{ display: 'flex', gap: 1, alignItems: 'flex-start', flex: 1, paddingBottom: 3 }}>
        {children}
      </div>
      <div style={{
        fontSize: 8,
        color: '#6a7a8a',
        textAlign: 'center',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        borderTop: '1px solid #b0bcc8',
        padding: '2px 8px 3px',
      }}>
        {label}
      </div>
    </div>
  )
}

export default function Toolbar({
  onLoadExample, onClear, onAutoLayout,
  onRunLoadflow, onRunLoadflowLocal, onRunShortcircuit, onRunContingency, onRunHarmonics, onRunCableSizing, onExportPDF, onExportPNG,
  onRunAsymFault, onOpenTapOpt, onImportLoadSch,
  loading, loadingLabel, converged, meta, nodeCount, edgeCount, hasResults,
  projectName, isDirty, onNew, onOpen, onSave, onSaveAs, onRecent, onEditMeta,
  onOpenDatasheet, onImportSLD, onOpenLibrary, onImportMotorList,
  onUndo, onRedo, canUndo, canRedo,
  autoRecalc, onAutoRecalc,
  onShowShortcuts,
}: Props) {
  const [lfBackend, setLfBackend] = useState<'local' | 'api'>('local')
  const handleRunLF = () => lfBackend === 'local' ? onRunLoadflowLocal() : onRunLoadflow()
  const lfLoading = loading && (loadingLabel.includes('Local') || loadingLabel === 'Load Flow')
  return (
    <header style={{
      display: 'flex',
      alignItems: 'stretch',
      background: 'linear-gradient(to bottom, #e4e8ed 0%, #d8dde4 100%)',
      borderBottom: '2px solid #8a9aaa',
      flexShrink: 0,
      minHeight: 64,
      fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 16px 0 12px',
        borderRight: '1px solid #a8b4c0',
        background: 'linear-gradient(to bottom, #1e3a7a 0%, #152d60 100%)',
        minWidth: 160,
      }}>
        <svg width="22" height="22" viewBox="0 0 22 22">
          <circle cx="11" cy="11" r="10" fill="none" stroke="#60a0e8" strokeWidth="1.5"/>
          <path d="M4,11 h14 M11,4 v14" stroke="#60a0e8" strokeWidth="1.5"/>
          <circle cx="11" cy="11" r="3.5" fill="#60a0e8"/>
        </svg>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ffffff', letterSpacing: '0.04em' }}>
            PowerFlow
          </div>
          <div style={{ fontSize: 8.5, color: '#8ab0e8', letterSpacing: '0.06em' }}>
            ANALYZER
          </div>
        </div>
      </div>

      {/* Ribbon groups */}
      <div style={{ display: 'flex', alignItems: 'stretch', padding: '4px 4px 0' }}>

        <RibbonGroup label="프 로 젝 트">
          {/* Project name display */}
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '2px 8px 2px 4px',
            borderRight: '1px solid #c0ccd8',
            marginRight: 2,
            minWidth: 110, maxWidth: 160,
          }}>
            <div
              onClick={onEditMeta}
              title="프로젝트 속성 편집"
              style={{
                fontSize: 10.5, fontWeight: 700, color: isDirty ? '#5a3800' : '#1a2838',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                cursor: 'pointer',
                maxWidth: 150,
              }}
            >
              {isDirty ? '* ' : ''}{projectName}
            </div>
            <div style={{ fontSize: 8.5, color: '#8a9aaa', marginTop: 1 }}>
              {isDirty ? '저장되지 않음' : '저장됨'}
            </div>
          </div>

          <RibbonBtn
            onClick={onNew}
            label="새 프로젝트"
            color="#1a3a5a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="4" y="3" width="11" height="15" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M11 3v5h5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                <rect x="11" y="3" width="5" height="5" rx="0.5" fill="white"/>
                <path d="M13 11.5h4M15 9.5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onOpen}
            label="열기"
            color="#1a3a5a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3 7h5l2 2h9v10H3V7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M3 7V4h5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onSave}
            label="저장"
            color="#003a14"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="3" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="7" y="3" width="8" height="6" fill="currentColor" opacity="0.25"/>
                <rect x="5" y="13" width="12" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.1"/>
                <path d="M13 4.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onSaveAs}
            label="다른 이름"
            color="#003a14"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="3" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="6" y="3" width="7" height="5" fill="currentColor" opacity="0.25"/>
                <path d="M12 3.5v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                <path d="M14 15v4M12 17l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onRecent}
            label="최근 파일"
            color="#3a2a5a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M11 7v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <div style={{ width: 1, background: '#c0ccd8', margin: '6px 3px 10px' }} />
          <RibbonBtn
            onClick={onLoadExample}
            label="예제 로드"
            color="#5a3000"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9 7.5l7 3.5-7 3.5V7.5z" fill="currentColor"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onClear}
            label="초기화"
            color="#6a0000"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="3" width="16" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M7 7l8 8M15 7L7 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <RibbonGroup label="편 집">
          {/* #1 Undo */}
          <RibbonBtn
            onClick={onUndo}
            disabled={!canUndo}
            label="실행 취소"
            color="#3a1a5a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M5 9H14a5 5 0 0 1 0 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 9L8 6M5 9l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          {/* #1 Redo */}
          <RibbonBtn
            onClick={onRedo}
            disabled={!canRedo}
            label="다시 실행"
            color="#3a1a5a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M17 9H8a5 5 0 0 0 0 10h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 9l-3-3M17 9l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <RibbonGroup label="레 이 아 웃">
          <RibbonBtn
            onClick={onAutoLayout}
            label="Auto Layout"
            color="#003a5a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="2" y="2" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="7" y="9" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="2" y="16" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="13" y="16" width="7" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M5.5 6v3M10.5 6v3M10.5 13v3M16.5 13v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <RibbonGroup label="해 석 계 산">
          {/* Load Flow — single button with backend selector */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
              <button
                onClick={handleRunLF}
                disabled={loading || nodeCount === 0}
                title={lfBackend === 'local' ? 'pandapower 로컬 계산' : 'REST API 계산'}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '4px 8px 0',
                  background: 'transparent', border: '1px solid transparent', borderRadius: '2px 0 0 2px',
                  cursor: loading || nodeCount === 0 ? 'not-allowed' : 'pointer',
                  color: loading || nodeCount === 0 ? '#9aa8b8' : '#003d14',
                  opacity: loading || nodeCount === 0 ? 0.5 : 1,
                  minWidth: 48, fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif", fontSize: 9.5,
                }}
                onMouseEnter={e => { if (!loading && nodeCount > 0) { e.currentTarget.style.background = 'rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor = '#8aaabb' } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M9 7.5l7 3.5-7 3.5V7.5z" fill="currentColor"/>
                  {lfBackend === 'local' && <circle cx="17" cy="5" r="3" fill="#00aa44"/>}
                </svg>
                <span style={{ whiteSpace: 'nowrap' }}>
                  {lfLoading ? '계산 중…' : 'Load Flow'}
                </span>
              </button>
              {/* Backend toggle */}
              <button
                onClick={() => setLfBackend(b => b === 'local' ? 'api' : 'local')}
                title={`백엔드: ${lfBackend === 'local' ? 'LOCAL (pandapower)' : 'API (REST)'} — 클릭하여 전환`}
                style={{
                  padding: '3px 4px', background: lfBackend === 'local' ? '#e8f4ee' : '#e8eeff',
                  border: `1px solid ${lfBackend === 'local' ? '#80c080' : '#8090d0'}`,
                  borderRadius: '0 2px 2px 0', cursor: 'pointer',
                  fontSize: 7.5, fontWeight: 700, lineHeight: 1,
                  color: lfBackend === 'local' ? '#005020' : '#1a2080',
                  fontFamily: 'Consolas,monospace', alignSelf: 'flex-start', marginTop: 4,
                }}
              >
                {lfBackend === 'local' ? 'LOCAL' : 'API'}
              </button>
            </div>
          </div>
          <RibbonBtn
            onClick={onRunShortcircuit}
            disabled={loading || nodeCount === 0}
            label={loading && loadingLabel === 'Short-Circuit' ? '계산 중…' : 'Short-Circuit'}
            color="#4a0050"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M12 2L3 13h8l-1 7 9-11h-8l1-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onRunContingency}
            disabled={loading || nodeCount === 0}
            label={loading && loadingLabel === 'N-1 Contingency' ? '계산 중…' : 'N-1 Cont.'}
            color="#5a3000"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M11 7v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 5l3 3M17 5l-3 3M5 17l3-3M17 17l-3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onRunHarmonics}
            disabled={loading || nodeCount === 0}
            label={loading && loadingLabel === 'Harmonics' ? '계산 중…' : 'Harmonics'}
            color="#004a4a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M2 14 Q4 6 6 14 Q8 22 10 14 Q12 6 14 14 Q16 22 18 14 Q20 6 22 14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                <line x1="2" y1="14" x2="20" y2="14" stroke="currentColor" strokeWidth="0.7" strokeDasharray="2,2"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onRunCableSizing}
            disabled={loading || nodeCount === 0}
            label={loading && loadingLabel === 'Cable Sizing' ? '계산 중…' : 'Cable Sizing'}
            color="#1a3a6a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <line x1="2" y1="11" x2="20" y2="11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                <circle cx="6"  cy="11" r="2.2" fill="white" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="11" cy="11" r="2.2" fill="white" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="16" cy="11" r="2.2" fill="white" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M4 7h14M4 15h14" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2,2"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onRunAsymFault}
            disabled={loading || nodeCount === 0}
            label={loading && loadingLabel === 'Asym. Fault' ? '계산 중…' : 'Asym. Fault'}
            color="#4a0070"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 2L4 13h7l-2 7 9-11h-7l2-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M2 19h5M15 3h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2,1"/>
              </svg>
            }
          />
          <div style={{ width: 1, background: '#c0ccd8', margin: '6px 2px 10px' }} />
          {/* Auto Recalculate — moved from 편집 group */}
          <div
            onClick={() => onAutoRecalc(!autoRecalc)}
            title="파라미터 변경 시 Load Flow 자동 재계산 (700ms 디바운스)"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '4px 8px', cursor: 'pointer',
              fontSize: 9.5, color: autoRecalc ? '#005a00' : '#1a2030',
              fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
              minWidth: 44,
              border: `1px solid ${autoRecalc ? '#80c080' : 'transparent'}`,
              borderRadius: 2,
              background: autoRecalc ? '#f0faf0' : 'transparent',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="8" stroke={autoRecalc ? '#00aa44' : 'currentColor'} strokeWidth="1.4"/>
              <path d="M9 7.5l7 3.5-7 3.5V7.5z" fill={autoRecalc ? '#00aa44' : 'currentColor'}/>
              {autoRecalc && <circle cx="17" cy="5" r="3.5" fill="#00aa44" stroke="white" strokeWidth="1"/>}
            </svg>
            <span style={{ whiteSpace: 'nowrap', color: autoRecalc ? '#005a00' : undefined }}>
              {autoRecalc ? 'Auto ●' : 'Auto LF'}
            </span>
          </div>
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <RibbonGroup label="출 력">
          <RibbonBtn
            onClick={onExportPDF}
            disabled={!hasResults}
            label="Export PDF"
            color="#4a0020"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="2" width="11" height="14" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M14 2l4 4v14H7" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M14 2v4h4" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6 10.5h6M6 13h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                <path d="M11 17v3M9 18.5l2 1.5 2-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onExportPNG}
            disabled={nodeCount === 0}
            label="Export PNG"
            color="#003a50"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                {/* 캔버스 프레임 */}
                <rect x="2" y="2" width="18" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                {/* 이미지 심볼 (산 + 태양) */}
                <path d="M4 13l4-4 3 3 2-2 4 3" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round"/>
                <circle cx="15" cy="7" r="1.5" stroke="currentColor" strokeWidth="1"/>
                {/* 다운로드 화살표 */}
                <path d="M8 18h6M11 16v4M9 18l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <RibbonGroup label="가 져 오 기">
          <RibbonBtn
            onClick={onImportMotorList}
            label="Motor List"
            color="#005a20"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="2" y="2" width="12" height="16" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 6h6M5 9h6M5 12h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                <circle cx="17" cy="16" r="4" fill="#e8f8ee" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M15.2 16h3.6M17 14.2v3.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                <path d="M11 17h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                <path d="M13.5 15.5l1.5 1.5-1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onImportLoadSch}
            label="부하목록표"
            color="#2a5a00"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="2" y="2" width="13" height="17" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 7h7M5 10h7M5 13h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                <circle cx="17" cy="17" r="4.5" fill="#e8f8ee" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M15.5 17h3M17 15.5v3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onImportSLD}
            label="SLD 가져오기"
            color="#004a3a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="1" y="1" width="20" height="20" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M4 11h14M11 4v14" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                <circle cx="11" cy="7"  r="2" stroke="currentColor" strokeWidth="1"/>
                <circle cx="7"  cy="15" r="2" stroke="currentColor" strokeWidth="1"/>
                <circle cx="15" cy="15" r="2" stroke="currentColor" strokeWidth="1"/>
                <path d="M9 7h-5M11 7h7" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2,1"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onOpenDatasheet}
            label="데이터시트"
            color="#2a005a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="2" width="11" height="15" rx="1" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M10 2v5h5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                <rect x="10" y="2" width="5" height="5" rx="0.5" fill="white"/>
                <path d="M5 9h7M5 11.5h7M5 14h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                <circle cx="17" cy="17" r="4" fill="#e8eeff" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M15.5 17h3M17 15.5v3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <RibbonGroup label="도 구">
          <RibbonBtn
            onClick={onOpenLibrary}
            label="도면 라이브러리"
            color="#1a3a5a"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="2"  y="3" width="18" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                <rect x="5"  y="6" width="12" height="3"  rx="0.5" fill="currentColor" opacity="0.25"/>
                <rect x="5"  y="11" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.25"/>
                <rect x="5"  y="15" width="7"  height="2" rx="0.5" fill="currentColor" opacity="0.25"/>
              </svg>
            }
          />
          <RibbonBtn
            onClick={onOpenTapOpt}
            label="탭 최적화"
            color="#005a30"
            icon={
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M11 7v4M11 15v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="11" cy="11" r="2" fill="currentColor"/>
                <path d="M7.5 8.5L11 11l3.5-2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              </svg>
            }
          />
        </RibbonGroup>

        <div style={{ width: 1, background: '#a8b4c0', margin: '6px 3px 10px' }} />

        <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px' }}>
          <button
            onClick={onShowShortcuts}
            title="키보드 단축키 보기"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'rgba(255,255,255,0.6)', border: '1px solid #a8b4c0',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#4a5a7a',
              fontFamily: "'Segoe UI', Arial, sans-serif",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#1a3a7a'; e.currentTarget.style.color = '#1a3a7a' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = '#a8b4c0'; e.currentTarget.style.color = '#4a5a7a' }}
          >
            ?
          </button>
        </div>
      </div>

      {/* Right side: status */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px' }}>
        {loading && (
          <span style={{ fontSize: 10, color: '#7a5000', fontFamily: 'Consolas, monospace' }}>
            ◌ {loadingLabel}…
          </span>
        )}
        {!loading && converged !== null && (
          <div style={{ textAlign: 'right' }}>
            <span style={{
              padding: '2px 10px',
              fontSize: 10, fontWeight: 700, borderRadius: 2, border: '1px solid',
              background: converged ? '#e8f4ee' : '#fce8e8',
              borderColor: converged ? '#80c0a0' : '#e08080',
              color: converged ? '#006030' : '#8a0000',
              display: 'block', marginBottom: 2,
            }}>
              LF {converged ? '수렴 ✓' : '미수렴 ✗'}
            </span>
            {meta && (
              <span style={{ fontSize: 8.5, color: '#7a8898', fontFamily: 'Consolas, monospace' }}>
                {meta.iterationCount}iter · {meta.maxMismatch.toExponential(2)}pu · {meta.elapsedMs.toFixed(1)}ms
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 9.5, color: '#7a8898', fontFamily: 'Consolas, monospace', textAlign: 'right', lineHeight: 1.6 }}>
          <div>Nodes: {nodeCount}</div>
          <div>Cables: {edgeCount}</div>
        </div>
      </div>
    </header>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from 'reactflow'
import 'reactflow/dist/style.css'

import Toolbar from './components/Toolbar'
import EquipmentPalette from './components/EquipmentPalette'
import PropertyPanel from './components/PropertyPanel'
import ResultsPanel from './components/ResultsPanel'
import SLDCanvas from './components/SLDCanvas'
import ProjectDialog from './components/ProjectDialog'
import RecentProjectsPanel from './components/RecentProjectsPanel'
import MotorGroupPanel from './components/MotorGroupPanel'
import CanvasContextMenu from './components/CanvasContextMenu'
import AddMotorsToGroupPanel from './components/AddMotorsToGroupPanel'
import WelcomeScreen from './components/WelcomeScreen'
import DatasheetImportWizard from './components/DatasheetImportWizard'
import DiagramImportDialog  from './components/DiagramImportDialog'
import DiagramLibrary       from './components/DiagramLibrary'
import MotorListImportDialog from './components/MotorListImportDialog'
import TapOptimizerPanel from './components/TapOptimizerPanel'
import LoadScheduleImportDialog from './components/LoadScheduleImportDialog'
import ToastContainer from './components/ToastContainer'
import { useDiagramLibraryStore } from './store/useDiagramLibraryStore'

import BusNode from './nodes/BusNode'
import TransformerNode from './nodes/TransformerNode'
import ThreeWindingTransformerNode from './nodes/ThreeWindingTransformerNode'
import BreakerNode from './nodes/BreakerNode'
import MotorNode from './nodes/MotorNode'
import GeneratorNode from './nodes/GeneratorNode'
import LoadNode from './nodes/LoadNode'
import MotorGroupNode from './nodes/MotorGroupNode'
import CapacitorNode from './nodes/CapacitorNode'
import ReactorNode from './nodes/ReactorNode'
import CableEdge from './edges/CableEdge'

import type { Connection, NodeChange, EdgeChange } from 'reactflow'
import type { EquipmentType } from './types'
import { useEquipmentStore } from './store/useEquipmentStore'
import { useAnalysisStore } from './store/useAnalysisStore'
import { useProjectStore } from './store/useProjectStore'
import { useAutoSave } from './hooks/useAutoSave'
import { generatePDF } from './utils/generatePDF'
import { exportCanvasPNG, captureCanvasBase64 } from './utils/exportCanvas'
import { computeProtectionItems } from './utils/computeProtection'
import {
  type PFAFile,
  buildPFA, downloadPFA, readPFAFile, addToRecent, clearAutoSave, loadAutoSave,
  sanitizeFileName,
} from './utils/projectIO'

// ── ReactFlow node/edge type registries ──────────────────────────────────────
const NODE_TYPES = {
  bus:           BusNode,
  transformer:   TransformerNode,
  transformer3w: ThreeWindingTransformerNode,
  breaker:       BreakerNode,
  motor:         MotorNode,
  generator:     GeneratorNode,
  load:          LoadNode,
  motorGroup:    MotorGroupNode,
  capacitor:     CapacitorNode,
  reactor:       ReactorNode,
} as const

const EDGE_TYPES = {
  cable: CableEdge,
} as const

// ── App ──────────────────────────────────────────────────────────────────────
function AppInner() {
  // Equipment store
  const nodes            = useEquipmentStore(s => s.nodes)
  const edges            = useEquipmentStore(s => s.edges)
  const applyNodeChanges = useEquipmentStore(s => s.applyNodeChanges)
  const applyEdgeChanges = useEquipmentStore(s => s.applyEdgeChanges)
  const connectNodes     = useEquipmentStore(s => s.connectNodes)
  const selectNode       = useEquipmentStore(s => s.selectNode)
  const selectEdge       = useEquipmentStore(s => s.selectEdge)
  const clearSelection   = useEquipmentStore(s => s.clearSelection)
  const dropEquipment    = useEquipmentStore(s => s.dropEquipment)
  const loadExample      = useEquipmentStore(s => s.loadExample)
  const clear            = useEquipmentStore(s => s.clear)
  const applyETAPLayout  = useEquipmentStore(s => s.applyETAPLayout)
  const loadNetwork           = useEquipmentStore(s => s.loadNetwork)
  const groupMotors           = useEquipmentStore(s => s.groupMotors)
  const ungroupMotors         = useEquipmentStore(s => s.ungroupMotors)
  const setActiveMotorGroup   = useEquipmentStore(s => s.setActiveMotorGroup)
  const openContextMenu       = useEquipmentStore(s => s.openContextMenu)
  const closeContextMenu      = useEquipmentStore(s => s.closeContextMenu)
  const openGroupEditMenu     = useEquipmentStore(s => s.openGroupEditMenu)
  const closeGroupEditMenu    = useEquipmentStore(s => s.closeGroupEditMenu)
  const activeMotorGroupId    = useEquipmentStore(s => s.activeMotorGroupId)
  const contextMenu           = useEquipmentStore(s => s.contextMenu)
  const groupEditMenu         = useEquipmentStore(s => s.groupEditMenu)
  const getSelectedNode       = useEquipmentStore(s => s.getSelectedNode)
  const updateEquipment       = useEquipmentStore(s => s.updateEquipment)
  const importNodes           = useEquipmentStore(s => s.importNodes)
  // #1 Undo/Redo
  const undo     = useEquipmentStore(s => s.undo)
  const redo     = useEquipmentStore(s => s.redo)
  const canUndo  = useEquipmentStore(s => s.canUndo)
  const canRedo  = useEquipmentStore(s => s.canRedo)

  // Analysis store
  const loading           = useAnalysisStore(s => s.loading)
  const loadingLabel      = useAnalysisStore(s => s.loadingLabel)
  const loadflow          = useAnalysisStore(s => s.loadflow)
  const shortcircuit      = useAnalysisStore(s => s.shortcircuit)
  const arcFlash          = useAnalysisStore(s => s.arcFlash)
  const contingency       = useAnalysisStore(s => s.contingency)
  const harmonics         = useAnalysisStore(s => s.harmonics)
  const cableSizingResult = useAnalysisStore(s => s.cableSizing)
  const error             = useAnalysisStore(s => s.error)
  const runLoadflow       = useAnalysisStore(s => s.runLoadflow)
  const runLoadflowLocal  = useAnalysisStore(s => s.runLoadflowLocal)
  const runShortcircuit   = useAnalysisStore(s => s.runShortcircuit)
  const runContingency    = useAnalysisStore(s => s.runContingency)
  const runHarmonics      = useAnalysisStore(s => s.runHarmonics)
  const runCableSizing    = useAnalysisStore(s => s.runCableSizing)
  const runAsymFault      = useAnalysisStore(s => s.runAsymFault)
  const clearResults      = useAnalysisStore(s => s.clearResults)
  const setError          = useAnalysisStore(s => s.setError)
  const loadResults       = useAnalysisStore(s => s.loadResults)

  // Project store
  const meta               = useProjectStore(s => s.meta)
  const isDirty            = useProjectStore(s => s.isDirty)
  const currentFileName    = useProjectStore(s => s.currentFileName)
  const showRestoreBanner  = useProjectStore(s => s.showRestoreBanner)
  const setMeta            = useProjectStore(s => s.setMeta)
  const markSaved          = useProjectStore(s => s.markSaved)
  const loadMeta           = useProjectStore(s => s.loadMeta)
  const newProject         = useProjectStore(s => s.newProject)
  const checkRestoreBanner = useProjectStore(s => s.checkRestoreBanner)
  const dismissRestoreBanner = useProjectStore(s => s.dismissRestoreBanner)

  // Panel collapse state
  const [paletteCollapsed, setPaletteCollapsed] = useState(false)
  const [rightCollapsed,   setRightCollapsed]   = useState(false)

  // Welcome screen — shown when canvas is empty on first load
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const showWelcome = nodes.length === 0 && !welcomeDismissed && !showRestoreBanner

  // Keyboard shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false)

  // Dialog state
  const [showProjectDialog, setShowProjectDialog] = useState<'new' | 'edit' | null>(null)
  const [showRecentPanel, setShowRecentPanel]     = useState(false)
  const [groupNameInput, setGroupNameInput]       = useState<string | null>(null) // null = hidden
  const [addMotorsTargetId, setAddMotorsTargetId]     = useState<string | null>(null)
  const [showDatasheetWizard,  setShowDatasheetWizard]  = useState(false)
  const [showSLDImport,       setShowSLDImport]        = useState(false)
  const [showLibrary,         setShowLibrary]          = useState(false)
  const [showMotorListImport,  setShowMotorListImport]  = useState(false)
  const [showTapOpt,           setShowTapOpt]           = useState(false)
  const [showLoadSchedule,     setShowLoadSchedule]     = useState(false)

  // #5 ResultsPanel 높이 리사이즈
  const [resultsPanelH, setResultsPanelH] = useState(380)
  const resizingRef = useRef(false)

  // #13 Auto Recalculate
  const [autoRecalc, setAutoRecalc] = useState(false)
  const autoRecalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveLibraryTemplate = useDiagramLibraryStore(s => s.saveTemplate)
  const loadLibraryTemplate = useDiagramLibraryStore(s => s.overwriteTemplate)

  // Auto-save hook
  useAutoSave()

  // Check restore banner on mount
  useEffect(() => {
    checkRestoreBanner()
  }, [checkRestoreBanner])

  // #1 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo() }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // #5 ResultsPanel 리사이즈 핸들러
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    const startY = e.clientY
    const startH = resultsPanelH
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = startY - ev.clientY  // 위로 드래그 = 패널 높이 증가
      setResultsPanelH(Math.max(240, Math.min(620, startH + delta)))
    }
    const onUp = () => {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [resultsPanelH])

  // #13 Auto Recalculate — nodes/edges 변경 시 500ms 디바운스 LF 재실행
  useEffect(() => {
    if (!autoRecalc) return
    if (autoRecalcTimer.current) clearTimeout(autoRecalcTimer.current)
    autoRecalcTimer.current = setTimeout(() => {
      runLoadflowLocal()
    }, 700)
    return () => {
      if (autoRecalcTimer.current) clearTimeout(autoRecalcTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, autoRecalc])

  // ── Helper: confirm unsaved changes ────────────────────────────────────────
  const confirmDiscard = useCallback((): boolean => {
    if (!isDirty) return true
    return window.confirm('저장되지 않은 변경사항이 있습니다. 계속하시겠습니까?')
  }, [isDirty])

  // ── Palette drag ────────────────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.DragEvent, type: EquipmentType) => {
    e.dataTransfer.setData('application/reactflow', type)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  // ── Toolbar handlers ────────────────────────────────────────────────────────
  const handleLoadExample = useCallback(() => {
    loadExample()
    clearResults()
  }, [loadExample, clearResults])

  const handleClear = useCallback(() => {
    clear()
    clearResults()
  }, [clear, clearResults])

  const handleExportPDF = useCallback(async () => {
    const protectionItems  = computeProtectionItems(shortcircuit, nodes, edges)
    const sldImageBase64   = await captureCanvasBase64().catch(() => null)
    generatePDF({ nodes, edges, loadflow, shortcircuit, protectionItems, arcFlash, contingency, harmonics, cableSizing: cableSizingResult, meta, sldImageBase64: sldImageBase64 ?? undefined })
  }, [nodes, edges, loadflow, shortcircuit, arcFlash, contingency, harmonics, cableSizingResult, meta])

  const handleExportPNG = useCallback(() => {
    exportCanvasPNG(meta.name || 'SLD')
  }, [meta.name])

  // ── Bulk voltage change ─────────────────────────────────────────────────────
  const handleBulkVoltageChange = useCallback((nodeIds: string[], vn_kv: number) => {
    nodeIds.forEach(id => {
      const node = nodes.find(n => n.id === id)
      if (!node) return
      const eq = node.data.equipment as unknown as Record<string, unknown>
      if ('vn_kv' in eq) updateEquipment(id, { ...eq, vn_kv } as unknown as typeof node.data.equipment)
    })
  }, [nodes, updateEquipment])

  // ── Project: New ────────────────────────────────────────────────────────────
  const handleNew = useCallback(() => {
    setShowProjectDialog('new')
  }, [])

  // ── Project: Open ───────────────────────────────────────────────────────────
  const handleOpen = useCallback(async () => {
    if (!confirmDiscard()) return
    const result = await readPFAFile()
    if (!result) return
    if (!result.pfa) {
      setError(result.fileName)  // fileName holds error msg on parse failure
      return
    }
    const { pfa, fileName } = result
    loadNetwork(pfa.network.nodes, pfa.network.edges)
    loadMeta(pfa.meta, fileName)
    loadResults(pfa.results)
    clearAutoSave()
  }, [confirmDiscard, loadNetwork, loadMeta, loadResults, setError])

  // ── Project: Save ───────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    const fileName = currentFileName ?? sanitizeFileName(meta.name) + '.pfa'
    const pfa = buildPFA(meta, nodes, edges, {
      loadflow:     loadflow     ?? null,
      shortcircuit: shortcircuit ?? null,
      arcFlash:     arcFlash     ?? null,
      contingency:  contingency  ?? null,
      harmonics:    harmonics    ?? null,
      cableSizing:  cableSizingResult ?? null,
    })
    downloadPFA(pfa, fileName)
    addToRecent(pfa, fileName)
    markSaved(fileName)
    clearAutoSave()
  }, [currentFileName, meta, nodes, edges, loadflow, shortcircuit, arcFlash, contingency, harmonics, cableSizingResult, markSaved])

  // ── Project: Save As ────────────────────────────────────────────────────────
  const handleSaveAs = useCallback(() => {
    const pfa = buildPFA(meta, nodes, edges, {
      loadflow:     loadflow     ?? null,
      shortcircuit: shortcircuit ?? null,
      arcFlash:     arcFlash     ?? null,
      contingency:  contingency  ?? null,
      harmonics:    harmonics    ?? null,
      cableSizing:  cableSizingResult ?? null,
    })
    const fileName = sanitizeFileName(meta.name) + '.pfa'
    downloadPFA(pfa, fileName)
    addToRecent(pfa, fileName)
    markSaved(fileName)
    clearAutoSave()
  }, [meta, nodes, edges, loadflow, shortcircuit, arcFlash, contingency, harmonics, cableSizingResult, markSaved])

  // ── Project: Recent load ────────────────────────────────────────────────────
  const handleLoadRecent = useCallback((pfa: PFAFile, fileName: string) => {
    if (!confirmDiscard()) return
    loadNetwork(pfa.network.nodes, pfa.network.edges)
    loadMeta(pfa.meta, fileName)
    loadResults(pfa.results)
    clearAutoSave()
    setShowRecentPanel(false)
  }, [confirmDiscard, loadNetwork, loadMeta, loadResults])

  // ── Welcome screen action wrappers (반드시 handleNew/handleOpen/handleLoadRecent 뒤에 위치) ──
  const handleWelcomeNew = useCallback(() => {
    setWelcomeDismissed(true)
    handleNew()
  }, [handleNew])

  const handleWelcomeOpen = useCallback(async () => {
    setWelcomeDismissed(true)
    await handleOpen()
  }, [handleOpen])

  const handleWelcomeExample = useCallback(() => {
    setWelcomeDismissed(true)
    handleLoadExample()
  }, [handleLoadExample])

  const handleWelcomeLoadRecent = useCallback((pfa: PFAFile, fileName: string) => {
    setWelcomeDismissed(true)
    handleLoadRecent(pfa, fileName)
  }, [handleLoadRecent])

  // ── Project: Restore autosave ───────────────────────────────────────────────
  const handleRestore = useCallback(() => {
    const pfa = loadAutoSave()
    if (!pfa) return
    loadNetwork(pfa.network.nodes, pfa.network.edges)
    loadMeta(pfa.meta)
    loadResults(pfa.results)
    dismissRestoreBanner()
  }, [loadNetwork, loadMeta, loadResults, dismissRestoreBanner])

  // ── Project: Edit meta ──────────────────────────────────────────────────────
  const handleEditMeta = useCallback(() => {
    setShowProjectDialog('edit')
  }, [])

  // ── Motor Group: canvas callbacks ───────────────────────────────────────────
  const handleNodeDoubleClick = useCallback((nodeId: string, nodeType: string) => {
    if (nodeType === 'motorGroup') setActiveMotorGroup(nodeId)
  }, [setActiveMotorGroup])

  const handleNodeContextMenu = useCallback((
    nodeId: string,
    nodeType: string,
    pos: { x: number; y: number },
    selectedMotorIds: string[],
  ) => {
    if (nodeType === 'motorGroup') {
      openGroupEditMenu(nodeId, pos)
      return
    }
    if (selectedMotorIds.length > 0 &&
        selectedMotorIds.every(id => nodes.find(n => n.id === id)?.type === 'motor')) {
      openContextMenu(selectedMotorIds, pos)
    }
  }, [nodes, openContextMenu, openGroupEditMenu])

  const handleCreateGroup = useCallback((name: string) => {
    if (!contextMenu) return
    groupMotors(contextMenu.motorIds, name.trim() || 'Motor Group')
    setGroupNameInput(null)
  }, [contextMenu, groupMotors])

  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      gridTemplateColumns: `${paletteCollapsed ? 28 : 180}px 1fr ${rightCollapsed ? 28 : 260}px`,
      height: '100vh',
      overflow: 'hidden',
      fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
    }}>
      {/* ── Toolbar (full width) ─── */}
      <div style={{ gridColumn: '1 / -1' }}>
        <Toolbar
          onLoadExample={handleLoadExample}
          onClear={handleClear}
          onAutoLayout={applyETAPLayout}
          onRunLoadflow={runLoadflow}
          onRunLoadflowLocal={runLoadflowLocal}
          onRunShortcircuit={runShortcircuit}
          onRunContingency={runContingency}
          onRunHarmonics={runHarmonics}
          onRunCableSizing={runCableSizing}
          onRunAsymFault={runAsymFault}
          onOpenTapOpt={() => setShowTapOpt(true)}
          onImportLoadSch={() => setShowLoadSchedule(true)}
          onExportPDF={handleExportPDF}
          onExportPNG={handleExportPNG}
          loading={loading}
          loadingLabel={loadingLabel}
          converged={loadflow?.converged ?? null}
          meta={loadflow?.meta ?? null}
          nodeCount={nodes.length}
          edgeCount={edges.length}
          hasResults={!!(loadflow || shortcircuit)}
          projectName={meta.name}
          isDirty={isDirty}
          onNew={handleNew}
          onOpen={handleOpen}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onRecent={() => setShowRecentPanel(true)}
          onEditMeta={handleEditMeta}
          onOpenDatasheet={() => setShowDatasheetWizard(true)}
          onImportSLD={() => setShowSLDImport(true)}
          onOpenLibrary={() => setShowLibrary(true)}
          onImportMotorList={() => setShowMotorListImport(true)}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo()}
          canRedo={canRedo()}
          autoRecalc={autoRecalc}
          onAutoRecalc={setAutoRecalc}
          onShowShortcuts={() => setShowShortcuts(true)}
        />

        {/* Restore banner */}
        {showRestoreBanner && (
          <div style={{
            background: '#fffbe6', borderBottom: '1px solid #e0c840',
            padding: '5px 12px', fontSize: 10.5, color: '#5a4400',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ background: '#e0b000', color: '#fff', padding: '1px 6px', borderRadius: 1, fontSize: 10, fontWeight: 700 }}>
              AUTO SAVE
            </span>
            <span style={{ flex: 1 }}>이전 세션의 자동 저장 데이터가 있습니다. 복원하시겠습니까?</span>
            <button
              onClick={handleRestore}
              style={{
                padding: '3px 12px', fontSize: 10, cursor: 'pointer',
                background: 'linear-gradient(to bottom, #e8f0fa, #dce6f4)',
                border: '1px solid #8aaac8', borderRadius: 2,
                color: '#1a3a7a', fontWeight: 600,
              }}
            >
              복원
            </button>
            <button
              onClick={dismissRestoreBanner}
              style={{ background: 'none', border: 'none', color: '#8a7000', cursor: 'pointer', fontSize: 13 }}
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div style={{
            background: '#fce8e8', borderBottom: '1px solid #e09090',
            padding: '4px 12px', fontSize: 11, color: '#800000',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ background: '#c02020', color: '#fff', padding: '1px 6px', borderRadius: 1, fontSize: 10, fontWeight: 700 }}>
              ERROR
            </span>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#800000', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
        )}
      </div>

      {/* ── Equipment Palette ─── */}
      {paletteCollapsed ? (
        <div style={{
          width: 28, background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
          borderRight: '1px solid #3a5aaa',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 8, gap: 8,
        }}>
          <button
            onClick={() => setPaletteCollapsed(false)}
            title="패널 펼치기"
            style={{
              background: 'none', border: 'none', color: '#a0b8e0',
              cursor: 'pointer', fontSize: 14, padding: '2px',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#a0b8e0' }}
          >›</button>
          <div style={{
            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#6080b0', userSelect: 'none', marginTop: 4,
          }}>Equipment</div>
        </div>
      ) : (
        <EquipmentPalette onDragStart={onDragStart} onCollapse={() => setPaletteCollapsed(true)} />
      )}

      {/* ── Canvas + Welcome Screen overlay ─── */}
      <div style={{ position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <SLDCanvas
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={(changes: NodeChange[]) => applyNodeChanges(changes)}
          onEdgesChange={(changes: EdgeChange[]) => applyEdgeChanges(changes)}
          onConnect={(conn: Connection) => connectNodes(conn)}
          onNodeClick={(node) => selectNode(node.id)}
          onEdgeClick={(edge) => selectEdge(edge.id)}
          onPaneClick={clearSelection}
          onDropEquipment={dropEquipment}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeContextMenu={handleNodeContextMenu}
          onBulkVoltageChange={handleBulkVoltageChange}
        />
        {showWelcome && (
          <WelcomeScreen
            onNew={handleWelcomeNew}
            onOpen={handleWelcomeOpen}
            onLoadExample={handleWelcomeExample}
            onLoadRecent={handleWelcomeLoadRecent}
            onDismiss={() => setWelcomeDismissed(true)}
          />
        )}
      </div>

      {/* ── Right Panel (Properties / MotorGroup) ─── */}
      {rightCollapsed ? (
        <div style={{
          width: 28, background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
          borderLeft: '1px solid #3a5aaa',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 8, gap: 8,
        }}>
          <button
            onClick={() => setRightCollapsed(false)}
            title="패널 펼치기"
            style={{
              background: 'none', border: 'none', color: '#a0b8e0',
              cursor: 'pointer', fontSize: 14, padding: '2px',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#a0b8e0' }}
          >‹</button>
          <div style={{
            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#6080b0', userSelect: 'none', marginTop: 4,
          }}>{activeMotorGroupId ? 'Motor Group' : 'Properties'}</div>
        </div>
      ) : activeMotorGroupId ? (
        <MotorGroupPanel onCollapse={() => setRightCollapsed(true)} />
      ) : (
        <PropertyPanel onCollapse={() => setRightCollapsed(true)} />
      )}

      {/* ── Results Panel (full width, visible when results exist) ─── */}
      <ResultsPanel height={resultsPanelH} onResizeStart={handleResizeMouseDown} />

      {/* ── Status bar (full width) ─── */}
      <div style={{
        gridColumn: '1 / -1',
        display: 'flex',
        alignItems: 'center',
        height: 22,
        background: 'linear-gradient(to bottom, #c4ccd6 0%, #b4bec8 100%)',
        borderTop: '1px solid #8a9aaa',
        fontSize: 10,
        fontFamily: 'Consolas, monospace',
        color: '#4a5a6a',
        padding: '0 10px',
        gap: 0,
      }}>
        {[
          ['Buses',        nodes.filter(n => n.type === 'bus').length],
          ['Transformers', nodes.filter(n => n.type === 'transformer').length],
          ['Breakers',     nodes.filter(n => n.type === 'breaker').length],
          ['Motors',       nodes.filter(n => n.type === 'motor').length],
          ['Generators',   nodes.filter(n => n.type === 'generator').length],
          ['Loads',        nodes.filter(n => n.type === 'load').length],
          ['Cables',       edges.length],
        ].map(([label, val]) => (
          <div key={label as string} style={{ padding: '0 10px', borderRight: '1px solid #9aaabb', display: 'flex', gap: 5 }}>
            <span style={{ color: '#7a8898' }}>{label}</span>
            <span style={{ fontWeight: 600, color: '#1a2838' }}>{val}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: '#8a9aab' }}>
          IEC 60909 · Grid Snap {20}px · PowerFlow Analyzer
        </div>
      </div>

      {/* ── Project Dialog (new / edit) ─── */}
      {showProjectDialog && (
        <ProjectDialog
          mode={showProjectDialog}
          meta={meta}
          onConfirm={patch => {
            if (showProjectDialog === 'new') {
              if (!confirmDiscard()) { setShowProjectDialog(null); return }
              newProject(patch.name)
              setMeta(patch)
              clear()
              clearResults()
            } else {
              setMeta(patch)
            }
            setShowProjectDialog(null)
          }}
          onCancel={() => setShowProjectDialog(null)}
        />
      )}

      {/* ── Recent Projects Panel ─── */}
      {showRecentPanel && (
        <RecentProjectsPanel
          onLoad={handleLoadRecent}
          onClose={() => setShowRecentPanel(false)}
        />
      )}

      {/* ── Canvas context menu ─── */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.pos.x}
          y={contextMenu.pos.y}
          onClose={closeContextMenu}
          items={[
            {
              label: `전동기 ${contextMenu.motorIds.length}개 → 그룹 생성`,
              icon: (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="3.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.1"/>
                  <circle cx="9.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.1"/>
                  <path d="M6 4v5M3.5 6.5h6" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              ),
              disabled: contextMenu.motorIds.length < 2,
              onClick: () => setGroupNameInput('Motor Group'),
            },
          ]}
        />
      )}

      {/* ── MotorGroup right-click menu ─── */}
      {groupEditMenu && (
        <CanvasContextMenu
          x={groupEditMenu.pos.x}
          y={groupEditMenu.pos.y}
          onClose={closeGroupEditMenu}
          items={[
            {
              label: '전동기 추가...',
              icon: (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.1"/>
                  <path d="M6.5 4v5M4 6.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              ),
              onClick: () => { setAddMotorsTargetId(groupEditMenu.groupId) },
            },
            { label: '---', onClick: () => {} },
            {
              label: '상세 보기',
              icon: (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="1" width="11" height="11" rx="1" stroke="currentColor" strokeWidth="1.1"/>
                  <path d="M3 4h7M3 6.5h7M3 9h4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              ),
              onClick: () => setActiveMotorGroup(groupEditMenu.groupId),
            },
            {
              label: '그룹 해제',
              danger: true,
              icon: (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              ),
              onClick: () => ungroupMotors(groupEditMenu.groupId),
            },
          ]}
        />
      )}

      {/* ── SLD Import Wizard ─── */}
      {showSLDImport && (
        <DiagramImportDialog
          onClose={() => setShowSLDImport(false)}
          onImport={(newNodes, newEdges) => {
            importNodes(newNodes, newEdges)
            setShowSLDImport(false)
          }}
        />
      )}

      {/* ── Diagram Library ─── */}
      {showLibrary && (
        <DiagramLibrary
          onLoad={(libNodes, libEdges) => {
            if (!confirmDiscard()) return
            loadNetwork(libNodes, libEdges)
          }}
          onSaveCurrent={(name, desc) => {
            saveLibraryTemplate(name, desc, nodes, edges)
            setShowLibrary(false)
          }}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* ── Motor List Import Wizard ─── */}
      {showMotorListImport && (
        <MotorListImportDialog
          onClose={() => setShowMotorListImport(false)}
          onImport={(newNodes, newEdges, runLF) => {
            importNodes(newNodes, newEdges)
            setShowMotorListImport(false)
            if (runLF) {
              // 캔버스 상태가 업데이트된 후 실행 (한 프레임 뒤)
              setTimeout(() => runLoadflowLocal(), 120)
            }
          }}
        />
      )}

      {/* ── Datasheet Import Wizard ─── */}
      {showDatasheetWizard && (() => {
        const sel = getSelectedNode()
        const selectedEquipment = sel
          ? { id: sel.id, type: sel.type ?? '', equipment: sel.data.equipment }
          : null
        return (
          <DatasheetImportWizard
            onClose={() => setShowDatasheetWizard(false)}
            selectedEquipment={selectedEquipment}
            onApply={(nodeId, patch) => {
              const node = nodes.find(n => n.id === nodeId)
              if (!node) return
              updateEquipment(nodeId, { ...node.data.equipment, ...patch } as typeof node.data.equipment)
              setShowDatasheetWizard(false)
            }}
          />
        )
      })()}

      {/* ── Add motors to group panel ─── */}
      {addMotorsTargetId && (
        <AddMotorsToGroupPanel
          groupId={addMotorsTargetId}
          onClose={() => setAddMotorsTargetId(null)}
        />
      )}

      {/* ── Group name input dialog ─── */}
      {groupNameInput !== null && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9600,
          background: 'rgba(0,0,0,0.40)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={e => { if (e.target === e.currentTarget) setGroupNameInput(null) }}
        >
          <div style={{
            background: '#f4f6f8', border: '1px solid #8a9aaa', borderRadius: 3,
            boxShadow: '0 8px 28px rgba(0,0,0,0.25)', width: 320, overflow: 'hidden',
            fontFamily: "'Segoe UI', 'Malgun Gothic', Arial, sans-serif",
          }}>
            <div style={{
              background: 'linear-gradient(to bottom, #8a5000, #6b3a00)',
              padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#ffe8c0' }}>그룹 이름 입력</span>
              <button onClick={() => setGroupNameInput(null)}
                style={{ background: 'none', border: 'none', color: '#c8a070', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: '16px' }}>
              <input
                autoFocus
                value={groupNameInput}
                onChange={e => setGroupNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateGroup(groupNameInput)
                  if (e.key === 'Escape') setGroupNameInput(null)
                }}
                placeholder="예: MCC Panel A"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '6px 8px', fontSize: 11,
                  fontFamily: 'Consolas, monospace',
                  background: '#fff', border: '1px solid #b0bcc8',
                  borderRadius: 2, color: '#0a1a2a', outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = '#8a5000' }}
                onBlur={e => { e.target.style.borderColor = '#b0bcc8' }}
              />
              <div style={{ fontSize: 9, color: '#8a9aaa', marginTop: 4 }}>
                {contextMenu?.motorIds.length ?? 0}개 전동기가 그룹에 포함됩니다.
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 8, justifyContent: 'flex-end',
              padding: '0 16px 14px',
            }}>
              <button onClick={() => setGroupNameInput(null)}
                style={{
                  padding: '5px 16px', fontSize: 10.5, cursor: 'pointer',
                  background: '#e8ecf0', border: '1px solid #a0b0c0',
                  borderRadius: 2, color: '#3a4a5a',
                }}>
                취소
              </button>
              <button
                onClick={() => handleCreateGroup(groupNameInput)}
                disabled={!groupNameInput.trim()}
                style={{
                  padding: '5px 16px', fontSize: 10.5, cursor: 'pointer',
                  background: groupNameInput.trim() ? 'linear-gradient(to bottom, #8a5000, #6b3a00)' : '#c0b0a0',
                  border: 'none', borderRadius: 2, color: '#fff', fontWeight: 700,
                  opacity: groupNameInput.trim() ? 1 : 0.6,
                }}>
                그룹 생성
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Tap Optimizer ─── */}
      {showTapOpt && <TapOptimizerPanel onClose={() => setShowTapOpt(false)} />}

      {/* ── Load Schedule Import ─── */}
      {showLoadSchedule && (
        <LoadScheduleImportDialog
          onClose={() => setShowLoadSchedule(false)}
          onImport={(newNodes, newEdges) => {
            importNodes(newNodes, newEdges)
            setShowLoadSchedule(false)
          }}
        />
      )}

      {/* ── Keyboard Shortcuts Modal ─── */}
      {showShortcuts && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9800,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowShortcuts(false) }}
        >
          <div style={{
            background: '#f4f6f8', border: '1px solid #8a9aaa', borderRadius: 4,
            boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
            width: 400, overflow: 'hidden',
            fontFamily: "'Segoe UI','Malgun Gothic',Arial,sans-serif",
          }}>
            <div style={{
              background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
              padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>키보드 단축키</span>
              <button onClick={() => setShowShortcuts(false)}
                style={{ background: 'none', border: 'none', color: '#a0b8e0', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
            <div style={{ padding: '12px 16px' }}>
              {([
                ['Ctrl + Z',        '실행 취소'],
                ['Ctrl + Y / Ctrl + Shift + Z', '다시 실행'],
                ['Ctrl + S',        '저장'],
                ['Delete / Backspace', '선택 장비 삭제'],
                ['Ctrl + A',        '전체 선택'],
                ['Ctrl + 드래그',   '다중 선택 (Shift 드래그)'],
                ['Scroll',          '캔버스 줌 인/아웃'],
                ['Space + 드래그',  '캔버스 이동 (Pan)'],
                ['더블 클릭',       'Motor Group 상세 보기'],
                ['우클릭',          '컨텍스트 메뉴'],
              ] as [string, string][]).map(([key, desc]) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center',
                  padding: '5px 0', borderBottom: '1px solid #e8ecf0',
                }}>
                  <span style={{
                    width: 190, flexShrink: 0,
                    fontFamily: 'Consolas, monospace',
                    fontSize: 10, color: '#0a1a2a',
                    background: '#e8ecf4', border: '1px solid #c8d4e0',
                    borderRadius: 2, padding: '1px 6px',
                    display: 'inline-block',
                  }}>{key}</span>
                  <span style={{ fontSize: 10.5, color: '#3a4a5a', marginLeft: 10 }}>{desc}</span>
                </div>
              ))}
            </div>
            <div style={{
              padding: '8px 16px 10px', background: '#eaecf0',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button onClick={() => setShowShortcuts(false)} style={{
                padding: '4px 18px', fontSize: 10.5, cursor: 'pointer',
                background: 'linear-gradient(to bottom, #1e3a7a, #152d60)',
                border: 'none', borderRadius: 2, color: '#fff', fontWeight: 700,
              }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* #3 Toast 알림 컨테이너 */}
      <ToastContainer />
    </div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  )
}

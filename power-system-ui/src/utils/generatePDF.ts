/**
 * PDF Report Generator — PowerFlow Analyzer
 * Pure function: no React/store dependencies.
 * Uses jsPDF + jsPDF-AutoTable.
 *
 * Sections:
 *   1. Cover / Executive Summary
 *   2. Bus Load Flow Results
 *   3. Transformer Results
 *   4. Cable Results
 *   5. Short Circuit Results
 *   6. Protection Check Results
 */
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Node, Edge } from 'reactflow'
import type {
  NodeData, EdgeData, Bus, Transformer, Cable, Motor,
  LoadflowResults, ShortCircuitResults, ProtectionItem, ArcFlashResults, ArcFlashRiskLevel,
  ContingencyResults, HarmonicResults, CableSizingResults,
} from '../types'
import type { PFAMeta } from './projectIO'
import { computeRelayResults } from '../engine/protectionCoordination'
import { buildTCCData } from '../engine/tcc'

// ── Palette ──────────────────────────────────────────────────────────────────
const CLR = {
  navy:       [21,  45,  96]  as [number,number,number],
  white:      [255, 255, 255] as [number,number,number],
  lightGray:  [240, 243, 246] as [number,number,number],
  midGray:    [180, 190, 200] as [number,number,number],
  darkText:   [20,  30,  50]  as [number,number,number],
  subText:    [90,  105, 120] as [number,number,number],
  green:      [0,   90,  32]  as [number,number,number],
  greenBg:    [230, 244, 236] as [number,number,number],
  red:        [176, 32,  0]   as [number,number,number],
  redBg:      [253, 232, 232] as [number,number,number],
  amber:      [138, 90,  0]   as [number,number,number],
  amberBg:    [255, 245, 220] as [number,number,number],
  headerFill: [212, 218, 225] as [number,number,number],
  rowAlt:     [248, 250, 252] as [number,number,number],
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0') }

function timestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

function dateLabel(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function f(n: number | undefined, dec: number, unit = ''): string {
  if (n === undefined || n === null) return '—'
  return n.toFixed(dec) + (unit ? ' ' + unit : '')
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

// ── Page header/footer stamp ──────────────────────────────────────────────────
function stampPageHeaderFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const W = 210, M = 14

  // Top header bar
  doc.setFillColor(...CLR.navy)
  doc.rect(0, 0, W, 10, 'F')

  // Logo placeholder box
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...CLR.midGray)
  doc.rect(M, 1.5, 28, 7, 'FD')
  doc.setFontSize(6)
  doc.setTextColor(...CLR.midGray)
  doc.text('COMPANY LOGO', M + 14, 6.2, { align: 'center' })

  // Title in header
  doc.setFontSize(8)
  doc.setTextColor(...CLR.white)
  doc.text('PowerFlow Analyzer — Analysis Report', W / 2, 6.2, { align: 'center' })

  // Footer
  doc.setFontSize(7)
  doc.setTextColor(...CLR.subText)
  doc.setDrawColor(...CLR.midGray)
  doc.line(M, 285, W - M, 285)
  doc.text('IEC 60909 / IEC 62271  ·  PowerFlow Analyzer', M, 289)
  doc.text(`Page ${pageNum} / ${totalPages}`, W - M, 289, { align: 'right' })
}

// ── Section title ─────────────────────────────────────────────────────────────
function sectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...CLR.navy)
  doc.rect(14, y, 182, 6, 'F')
  doc.setFontSize(9)
  doc.setTextColor(...CLR.white)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 17, y + 4.2)
  doc.setFont('helvetica', 'normal')
  return y + 8
}

// ── Info row (key: value pairs) ───────────────────────────────────────────────
function infoRow(doc: jsPDF, pairs: [string, string, string?][], x: number, y: number): number {
  doc.setFontSize(8)
  let cx = x
  for (const [label, val, color] of pairs) {
    doc.setTextColor(...CLR.subText)
    doc.setFont('helvetica', 'normal')
    doc.text(label + ':', cx, y)
    doc.setFont('helvetica', 'bold')
    if (color === 'green')      doc.setTextColor(...CLR.green)
    else if (color === 'red')   doc.setTextColor(...CLR.red)
    else if (color === 'amber') doc.setTextColor(...CLR.amber)
    else                        doc.setTextColor(...CLR.darkText)
    doc.text(val, cx + doc.getTextWidth(label + ': ') + 1, y)
    cx += 62
  }
  doc.setTextColor(...CLR.darkText)
  return y + 6
}

// ── Executive Summary card ────────────────────────────────────────────────────
function drawExecutiveSummary(
  doc: jsPDF,
  startY: number,
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  loadflow: LoadflowResults | null,
  shortcircuit: ShortCircuitResults | null,
  protectionItems: ProtectionItem[],
): number {
  let y = sectionTitle(doc, 'Executive Summary', startY)

  // System composition row
  const busCount = nodes.filter(n => n.type === 'bus').length
  const trCount  = nodes.filter(n => n.type === 'transformer').length
  const cbCount  = nodes.filter(n => n.type === 'breaker').length
  const cableCount = edges.filter(e => !!e.data?.cable).length

  doc.setFontSize(8)
  doc.setTextColor(...CLR.subText)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `System: ${busCount} Buses  ·  ${trCount} Transformers  ·  ${cbCount} Breakers  ·  ${cableCount} Cables`,
    14, y + 1,
  )
  y += 7

  // Summary table (2 × 3 grid)
  const lf = loadflow
  const lfBuses = lf ? Object.values(lf.buses) : []
  const volViolations = lfBuses.filter(b => b.vm_pu < 0.95 || b.vm_pu > 1.05).length

  const trLoadings = lf
    ? Object.values(lf.transformers).map(t => t.loading_percent)
    : []
  const cableLoadings = lf
    ? Object.values(lf.lines).map(l => l.loading_percent)
    : []
  const maxTrLoading    = trLoadings.length    ? Math.max(...trLoadings)    : undefined
  const maxCableLoading = cableLoadings.length ? Math.max(...cableLoadings) : undefined

  const failCount = protectionItems.filter(p => !p.pass).length

  // Draw 6-cell summary grid
  const cells: { label: string; value: string; valueColor?: string; unit?: string }[] = [
    {
      label: 'Load Flow',
      value: lf ? (lf.converged ? 'Converged' : 'Not Converged') : 'Not Run',
      valueColor: lf ? (lf.converged ? 'green' : 'red') : undefined,
    },
    {
      label: 'Iterations',
      value: lf?.meta ? String(lf.meta.iterationCount) : '—',
    },
    {
      label: 'Bus Voltage Violations',
      value: lf ? String(volViolations) : '—',
      valueColor: volViolations > 0 ? 'red' : 'green',
    },
    {
      label: 'Protection FAIL Count',
      value: shortcircuit ? String(failCount) : '—',
      valueColor: failCount > 0 ? 'red' : 'green',
    },
    {
      label: 'Max Cable Loading',
      value: maxCableLoading !== undefined ? maxCableLoading.toFixed(1) + ' %' : '—',
      valueColor: maxCableLoading !== undefined && maxCableLoading > 100 ? 'red'
                : maxCableLoading !== undefined && maxCableLoading > 80  ? 'amber'
                : 'green',
    },
    {
      label: 'Max Transformer Loading',
      value: maxTrLoading !== undefined ? maxTrLoading.toFixed(1) + ' %' : '—',
      valueColor: maxTrLoading !== undefined && maxTrLoading > 100 ? 'red'
                : maxTrLoading !== undefined && maxTrLoading > 80  ? 'amber'
                : 'green',
    },
  ]

  const cellW = 60, cellH = 14, cols = 3
  const startX = 14

  cells.forEach((cell, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = startX + col * cellW
    const cy = y + row * (cellH + 2)

    doc.setFillColor(...CLR.lightGray)
    doc.setDrawColor(...CLR.midGray)
    doc.rect(cx, cy, cellW - 2, cellH, 'FD')

    doc.setFontSize(7)
    doc.setTextColor(...CLR.subText)
    doc.setFont('helvetica', 'normal')
    doc.text(cell.label, cx + 3, cy + 4.5)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    if (cell.valueColor === 'green')      doc.setTextColor(...CLR.green)
    else if (cell.valueColor === 'red')   doc.setTextColor(...CLR.red)
    else if (cell.valueColor === 'amber') doc.setTextColor(...CLR.amber)
    else                                  doc.setTextColor(...CLR.darkText)
    doc.text(cell.value, cx + 3, cy + 11)
  })

  doc.setTextColor(...CLR.darkText)
  doc.setFont('helvetica', 'normal')
  return y + 2 * (cellH + 2) + 6
}

// ── Main export ───────────────────────────────────────────────────────────────
export interface PDFPayload {
  nodes:           Node<NodeData>[]
  edges:           Edge<EdgeData>[]
  loadflow:        LoadflowResults | null
  shortcircuit:    ShortCircuitResults | null
  protectionItems: ProtectionItem[]
  arcFlash?:       ArcFlashResults | null
  contingency?:    ContingencyResults | null
  harmonics?:      HarmonicResults | null
  cableSizing?:    CableSizingResults | null
  meta?:           PFAMeta   // P1-5: EPC 문서 정보
  sldImageBase64?: string    // P2-6: SLD 도면 이미지 (html2canvas)
  coordMarginS?:   number    // P2-4: 협조 마진 (기본 0.3s)
}

export function generatePDF(payload: PDFPayload): void {
  const { nodes, edges, loadflow, shortcircuit, protectionItems, arcFlash, contingency, harmonics, cableSizing, meta, sldImageBase64, coordMarginS = 0.3 } = payload

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PAGE_W = 210
  const MARGIN  = 14
  const COL_W   = PAGE_W - MARGIN * 2

  // We'll do two passes: first pass builds, second stamps page numbers.
  // jsPDF-AutoTable tracks internal page, so we stamp after generation.

  // ── Page 1 cover ─────────────────────────────────────────────────────────
  // Header bar
  doc.setFillColor(...CLR.navy)
  doc.rect(0, 0, PAGE_W, 10, 'F')

  // Logo placeholder
  doc.setFillColor(...CLR.white)
  doc.setDrawColor(...CLR.midGray)
  doc.rect(MARGIN, 1.5, 28, 7, 'FD')
  doc.setFontSize(6)
  doc.setTextColor(...CLR.midGray)
  doc.text('COMPANY LOGO', MARGIN + 14, 6.2, { align: 'center' })

  doc.setFontSize(8)
  doc.setTextColor(...CLR.white)
  doc.text('PowerFlow Analyzer — Analysis Report', PAGE_W / 2, 6.2, { align: 'center' })

  // Cover title block
  let y = 20
  doc.setFontSize(18)
  doc.setTextColor(...CLR.navy)
  doc.setFont('helvetica', 'bold')
  doc.text('PowerFlow Analyzer', MARGIN, y)
  doc.setFontSize(13)
  doc.setTextColor(...CLR.subText)
  doc.setFont('helvetica', 'normal')
  doc.text('Electrical Power System Analysis Report', MARGIN, y + 8)
  doc.setFontSize(9)
  doc.setTextColor(...CLR.darkText)
  doc.text(meta?.name ?? 'Untitled Project', MARGIN, y + 16)

  // Thin rule
  doc.setDrawColor(...CLR.midGray)
  doc.line(MARGIN, y + 21, PAGE_W - MARGIN, y + 21)
  y += 26

  // P1-5: 문서 정보 테이블
  if (meta) {
    const infoData: [string, string][] = [
      ['Project No.',  meta.projectNumber || '—'],
      ['Document No.', meta.docNumber     || '—'],
      ['Revision',     meta.revision      || '—'],
      ['Client',       meta.client        || '—'],
      ['Engineer',     meta.engineer      || '—'],
      ['Checker',      meta.checker       || '—'],
      ['Approver',     meta.approver      || '—'],
      ['Date',         dateLabel()],
      ['Frequency',    `${meta.frequency_hz ?? 60} Hz`],
    ]
    const mid = MARGIN + COL_W / 2 + 4
    doc.setFontSize(7.5)
    infoData.forEach(([label, value], i) => {
      const row_y = y + i * 6
      doc.setTextColor(...CLR.subText)
      doc.setFont('helvetica', 'normal')
      doc.text(label + ':', MARGIN, row_y)
      doc.setTextColor(...CLR.darkText)
      doc.setFont('helvetica', 'bold')
      doc.text(value, MARGIN + 28, row_y)
      // description column
      if (i === 0 && meta.description) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...CLR.subText)
        doc.text('Description:', mid, row_y)
        doc.setTextColor(...CLR.darkText)
        const lines = doc.splitTextToSize(meta.description, COL_W / 2 - 8)
        doc.text(lines.slice(0, 3), mid + 22, row_y)
      }
    })
    doc.setDrawColor(...CLR.midGray)
    doc.line(MARGIN, y + infoData.length * 6 + 1, PAGE_W - MARGIN, y + infoData.length * 6 + 1)
    y += infoData.length * 6 + 6

    // P2-7: 개정 이력 표
    const history = meta.revisionHistory ?? []
    if (history.length > 0) {
      y = sectionTitle(doc, 'Revision History', y)
      autoTable(doc, {
        startY: y,
        head:   [['Rev.', 'Date', 'Author', 'Description']],
        body:   history.map(r => [
          r.rev,
          r.date ? new Date(r.date).toLocaleDateString('ko-KR') : '—',
          r.author || '—',
          r.description || '—',
        ]),
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 7.5, cellPadding: 1.8, font: 'helvetica', textColor: CLR.darkText },
        headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: CLR.rowAlt },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 26 },
          2: { cellWidth: 28 },
          3: { cellWidth: 'auto' },
        },
      })
      y = (doc as any).lastAutoTable.finalY + 6
    }
  }

  // Executive Summary
  y = drawExecutiveSummary(doc, y, nodes, edges, loadflow, shortcircuit, protectionItems)
  y += 4

  // ── 계산 조건 (Calculation Basis) ───────────────────────────────────────────
  if (y > 220) { doc.addPage(); y = 16 }
  y = sectionTitle(doc, 'Calculation Basis & Standards', y)

  const calcBasisRows: [string, string][][] = [
    [
      ['Load Flow Method',       'Newton-Raphson (full AC, flat start)'],
      ['Tolerance',              '1 × 10⁻⁶ pu,  max 50 iterations'],
    ],
    [
      ['Short Circuit Standard', 'IEC 60909-0:2016 (3-phase balanced)'],
      ['Voltage Factor c_max',   '1.10  (HV/MV)  /  1.05  (LV)'],
    ],
    [
      ['Voltage Factor c_min',   '1.00  (HV/MV)  /  0.95  (LV)'],
      ['Base MVA',               `${100} MVA  (S_base for p.u. system)`],
    ],
    [
      ['System Frequency',       `${meta?.frequency_hz ?? 60} Hz`],
      ['Transformer Model',      'IEC 60076  ·  K_T correction applied'],
    ],
    [
      ['Generator Model',        'IEC 60909-0 §4.3.1  ·  K_G correction applied'],
      ['Motor Contribution',     'IEC 60909-0 §4.3.4  ·  Xm = Sbase/Sm × 1/LRC'],
    ],
    [
      ['Arc Flash Method',       'IEEE 1584-2018 Enhanced (representative constants)'],
      ['Arc Flash Note',         'Independent verification required before PPE selection'],
    ],
    [
      ['Protection Coordination','IEC 60255-151  ·  ANSI/IEEE C37.112'],
      ['Cable Sizing',           'IEC 60364-5-52  ·  3-check: Ampacity / ΔV / SC Withstand'],
    ],
    [
      ['Harmonic Standard',      'IEEE 519-2014  ·  Orders: 5, 7, 11, 13, 17, 19'],
      ['ZIP Load Model',         'Voltage-dependent: Z·V² + I·V + P  (IEC 60038)'],
    ],
    [
      ['N-1 Contingency',        'Single outage of each transformer / cable / breaker / generator'],
      ['Software',               'PowerFlow Analyzer  ·  v1.0  ·  2026-05-31'],
    ],
  ]

  doc.setFontSize(7.5)
  calcBasisRows.forEach(([left, right]) => {
    const lx = MARGIN, rx = MARGIN + COL_W / 2 + 2
    doc.setTextColor(...CLR.subText)
    doc.setFont('helvetica', 'normal')
    doc.text(left[0] + ':', lx, y)
    doc.setTextColor(...CLR.darkText)
    doc.setFont('helvetica', 'bold')
    doc.text(left[1], lx + 44, y)

    doc.setTextColor(...CLR.subText)
    doc.setFont('helvetica', 'normal')
    doc.text(right[0] + ':', rx, y)
    doc.setTextColor(...CLR.darkText)
    doc.setFont('helvetica', 'bold')
    doc.text(right[1], rx + 44, y)

    y += 5.5
  })

  // Disclaimer box
  y += 2
  doc.setDrawColor(...CLR.amber)
  doc.setFillColor(255, 250, 230)
  doc.rect(MARGIN, y, COL_W, 12, 'FD')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CLR.amber)
  doc.text('DISCLAIMER', MARGIN + 2, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 56, 0)
  const disclaimer = 'All results are based on the data entered by the user. ' +
    'Arc Flash incident energy values use representative empirical constants and must be independently verified by a ' +
    'qualified electrical engineer before use in PPE selection or safety labelling (IEEE 1584-2018 §Annex B). ' +
    'This software does not replace professional engineering judgement.'
  const lines = doc.splitTextToSize(disclaimer, COL_W - 6)
  doc.text(lines.slice(0, 2), MARGIN + 2, y + 8)
  y += 16

  // ── P2-6: SLD 도면 ────────────────────────────────────────────────────────────
  if (sldImageBase64) {
    if (y > 180) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, 'Single Line Diagram (SLD)', y)
    const imgW = COL_W
    const imgH = Math.min(100, imgW * 0.55)
    try {
      doc.addImage(sldImageBase64, 'PNG', MARGIN, y, imgW, imgH)
      doc.setDrawColor(...CLR.midGray)
      doc.rect(MARGIN, y, imgW, imgH)
    } catch { /* ignore */ }
    y += imgH + 6
  }

  // ── Bus Load Flow Results ─────────────────────────────────────────────────
  if (loadflow) {
    y = sectionTitle(doc, 'Bus Load Flow Results', y)

    const busNodes = nodes.filter(n => n.type === 'bus')
    const busHead  = [['Bus', 'kV', 'V (pu)', 'Angle (°)', 'P (MW)', 'Q (Mvar)', 'Ik" (kA)']]
    const busBody  = busNodes.map(n => {
      const busEq = n.data.equipment as Bus
      const lf    = loadflow.buses[n.id]
      const sc    = shortcircuit?.buses[n.id]
      return [
        busEq.name,
        String(busEq.vn_kv),
        lf ? f(lf.vm_pu, 4) : '—',
        lf ? f(lf.va_degree, 3) : '—',
        lf ? f(lf.p_mw, 3) : '—',
        lf ? f(lf.q_mvar, 3) : '—',
        (sc && sc.ikss_ka > 0) ? f(sc.ikss_ka, 3) : '—',
      ]
    })

    autoTable(doc, {
      startY: y,
      head:   busHead,
      body:   busBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: {
        fontSize: 7.5, cellPadding: 1.8,
        font: 'helvetica', textColor: CLR.darkText,
      },
      headStyles: {
        fillColor: CLR.headerFill, textColor: CLR.darkText,
        fontStyle: 'bold', fontSize: 7.5,
      },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { halign: 'right', cellWidth: 16 },
        2: { halign: 'right', cellWidth: 22 },
        3: { halign: 'right', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 22 },
        6: { halign: 'right', cellWidth: 20 },
      },
      // Voltage cell highlighting
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const busNode  = busNodes[data.row.index]
          const lf       = loadflow.buses[busNode?.id ?? '']
          if (lf) {
            if (lf.vm_pu < 0.95 || lf.vm_pu > 1.05) {
              data.cell.styles.textColor = CLR.red
              data.cell.styles.fillColor = CLR.redBg
              data.cell.styles.fontStyle = 'bold'
            } else if (lf.vm_pu < 0.98) {
              data.cell.styles.textColor = CLR.amber
              data.cell.styles.fillColor = CLR.amberBg
            }
          }
        }
      },
    })

    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Transformer Results ───────────────────────────────────────────────────
  if (loadflow) {
    const trNodes = nodes.filter(n => n.type === 'transformer')
    if (trNodes.length > 0) {
      // Start new page if too close to bottom
      if (y > 230) { doc.addPage(); y = 16 }
      y = sectionTitle(doc, 'Transformer Results', y)

      const trHead = [['Transformer', 'Loading (%)', 'P_HV (MW)', 'Q_HV (Mvar)', 'P_LV (MW)', 'Loss (kW)']]
      const trBody = trNodes.map(n => {
        const lf = loadflow.transformers[n.id]
        return [
          n.data.equipment.name,
          lf ? f(lf.loading_percent, 1) : '—',
          lf ? f(lf.p_hv_mw, 3) : '—',
          lf ? f(lf.q_hv_mvar, 3) : '—',
          lf ? f(lf.p_lv_mw, 3) : '—',
          lf ? f(lf.pl_mw * 1000, 2) : '—',
        ]
      })

      autoTable(doc, {
        startY: y,
        head: trHead, body: trBody,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 7.5, cellPadding: 1.8, font: 'helvetica', textColor: CLR.darkText },
        headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: CLR.rowAlt },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { halign: 'right' }, 2: { halign: 'right' },
          3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }
  }

  // ── Cable Results ─────────────────────────────────────────────────────────
  if (loadflow) {
    const cableEdges = edges.filter(e => !!e.data?.cable)
    if (cableEdges.length > 0) {
      if (y > 230) { doc.addPage(); y = 16 }
      y = sectionTitle(doc, 'Cable Results', y)

      const cHead = [['Cable', 'I (A)', 'Loading (%)', 'ΔV (%)', 'P_from (MW)', 'P_to (MW)']]
      const cBody = cableEdges.map(e => {
        const cable = e.data!.cable as Cable
        const lf    = loadflow.lines[e.id]
        return [
          cable.name,
          lf ? f(lf.i_ka * 1000, 1) : '—',
          lf ? f(lf.loading_percent, 1) : '—',
          lf ? f(lf.vdrop_percent, 3) : '—',
          lf ? f(lf.p_from_mw, 3) : '—',
          lf ? f(lf.p_to_mw, 3) : '—',
        ]
      })

      autoTable(doc, {
        startY: y,
        head: cHead, body: cBody,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 7.5, cellPadding: 1.8, font: 'helvetica', textColor: CLR.darkText },
        headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: CLR.rowAlt },
        columnStyles: {
          0: { cellWidth: 38 },
          1: { halign: 'right' }, 2: { halign: 'right' },
          3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        },
      })
      y = (doc as any).lastAutoTable.finalY + 8
    }
  }

  // ── Short Circuit Results ─────────────────────────────────────────────────
  if (shortcircuit) {
    // Force new page for SC section
    doc.addPage()
    y = 16

    y = sectionTitle(doc, 'Short Circuit Results  (IEC 60909 · 3-phase balanced · c = 1.1)', y)

    const scNodes = nodes.filter(n => n.type === 'bus')
    const scHead  = [['Bus', 'kV', 'Ik" (kA)', 'Ip (kA)', 'Sk" (MVA)', 'Ib (kA)', `Ith (kA)\ntf=0.5s`]]
    const scBody  = scNodes.map(n => {
      const busEq = n.data.equipment as Bus
      const sc    = shortcircuit.buses[n.id]
      return [
        busEq.name,
        String(busEq.vn_kv),
        (sc && sc.ikss_ka  > 0) ? f(sc.ikss_ka,  3) : '—',
        (sc && sc.ip_ka    > 0) ? f(sc.ip_ka,    3) : '—',
        (sc && sc.skss_mva > 0) ? f(sc.skss_mva, 1) : '—',
        (sc && sc.ib_ka    > 0) ? f(sc.ib_ka,    3) : '—',
        (sc && (sc.ith_ka ?? 0) > 0) ? f(sc.ith_ka, 3) : '—',
      ]
    })

    autoTable(doc, {
      startY: y,
      head: scHead, body: scBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 1.8, font: 'helvetica', textColor: CLR.darkText },
      headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { halign: 'right', cellWidth: 15 },
        2: { halign: 'right', cellWidth: 21 },
        3: { halign: 'right', cellWidth: 21 },
        4: { halign: 'right', cellWidth: 24 },
        5: { halign: 'right', cellWidth: 21 },
        6: { halign: 'right', cellWidth: 22 },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ── Protection Check Results ───────────────────────────────────────────────
  if (shortcircuit && protectionItems.length > 0) {
    if (y > 220) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, 'Protection Coordination Results  (IEC 62271-100)', y)

    const pHead = [[
      'Device', 'Bus', 'kV',
      'Ik" (kA)', 'Ip (kA)',
      'Breaking (kA)', 'Making (kA)',
      'Brk Margin (%)', 'Mk Margin (%)',
      'Status',
    ]]
    const pBody = protectionItems.map(item => [
      item.breakerName,
      item.busName,
      String(item.busVn_kv),
      f(item.ikss_ka, 3),
      f(item.ip_ka, 3),
      f(item.breaking_capacity_ka, 1),
      f(item.making_capacity_ka, 1),
      f(item.breaking_margin_percent, 1),
      f(item.making_margin_percent, 1),
      item.pass ? 'PASS' : 'FAIL',
    ])

    autoTable(doc, {
      startY: y,
      head: pHead, body: pBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7, cellPadding: 1.6, font: 'helvetica', textColor: CLR.darkText },
      headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 20 },
        2: { halign: 'right', cellWidth: 13 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 17 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 19 },
        7: { halign: 'right', cellWidth: 19 },
        8: { halign: 'right', cellWidth: 17 },
        9: { halign: 'center', cellWidth: 13 },
      },
      // FAIL row full-row red; PASS status cell green; margin coloring
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const item = protectionItems[data.row.index]
        if (!item) return

        // Entire row red for FAIL
        if (!item.pass) {
          data.cell.styles.fillColor = CLR.redBg
          data.cell.styles.textColor = CLR.red
        }

        // Status cell bold color
        if (data.column.index === 9) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = item.pass ? CLR.green : CLR.red
          if (item.pass) data.cell.styles.fillColor = CLR.greenBg
        }

        // Breaking margin color (if PASS row)
        if (item.pass && data.column.index === 7) {
          const m = item.breaking_margin_percent
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = m > 20 ? CLR.green : m >= 0 ? CLR.amber : CLR.red
        }
        // Making margin color (if PASS row)
        if (item.pass && data.column.index === 8) {
          const m = item.making_margin_percent
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = m > 20 ? CLR.green : m >= 0 ? CLR.amber : CLR.red
        }
      },
    })
  }

  // ── Protection Coordination (Relay) ──────────────────────────────────────
  const relayResults = computeRelayResults(shortcircuit, nodes, edges, coordMarginS)
  if (relayResults.length > 0) {
    if (y > 220) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, `Protection Coordination  (IEC 60255)  ·  Margin threshold ${coordMarginS.toFixed(2)} s`, y)

    const CURVE_LABELS: Record<string, string> = {
      IEC_NORMAL_INVERSE:    'Normal Inv.',
      IEC_VERY_INVERSE:      'Very Inv.',
      IEC_EXTREMELY_INVERSE: 'Extr. Inv.',
    }

    const rHead = [[
      'Breaker', 'Bus', 'Ik" (kA)', 'Curve', 'Pickup (A)', 'TMS',
      'Trip (s)', 'Inst', 'Margin (s)', 'Status',
    ]]
    const rBody = relayResults.map(r => [
      r.breakerName,
      r.busName,
      f(r.fault_current_ka, 3),
      CURVE_LABELS[r.curve_type] ?? r.curve_type,
      String(r.pickup_current_a),
      f(r.time_dial, 2),
      r.relay_operating_time_s === 0 ? 'INST' : f(r.relay_operating_time_s, 3),
      r.inst_trip ? 'Yes' : 'No',
      isFinite(r.coordination_margin_s) ? f(r.coordination_margin_s, 3) : '—',
      r.pass ? 'PASS' : 'FAIL',
    ])

    autoTable(doc, {
      startY: y,
      head: rHead, body: rBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7, cellPadding: 1.6, font: 'helvetica', textColor: CLR.darkText },
      headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 18 },
        2: { halign: 'right', cellWidth: 18 },
        3: { cellWidth: 18 },
        4: { halign: 'right', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 13 },
        6: { halign: 'right', cellWidth: 18 },
        7: { halign: 'center', cellWidth: 12 },
        8: { halign: 'right', cellWidth: 18 },
        9: { halign: 'center', cellWidth: 13 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const r = relayResults[data.row.index]
        if (!r) return
        if (!r.pass) {
          data.cell.styles.fillColor = CLR.redBg
          data.cell.styles.textColor = CLR.red
        }
        if (data.column.index === 9) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = r.pass ? CLR.green : CLR.red
          data.cell.styles.fillColor = r.pass ? CLR.greenBg : CLR.redBg
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── TCC Coordination Viewer ───────────────────────────────────────────────
  if (relayResults.length > 0) {
    if (y > 198) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, 'TCC Coordination Viewer  (IEC 60255 time-current characteristics)', y)

    const tccData = buildTCCData(relayResults, nodes)
    const CX0 = MARGIN + 12
    const CW  = 126
    const CH  = 72
    const CY0 = y

    const pdfCx = (I: number) =>
      CX0 + (Math.log10(I / tccData.xMin) / Math.log10(tccData.xMax / tccData.xMin)) * CW
    const pdfCy = (t: number) =>
      CY0 + CH - (Math.log10(t / tccData.yMin) / Math.log10(tccData.yMax / tccData.yMin)) * CH

    // Background
    doc.setFillColor(250, 251, 252)
    doc.setDrawColor(192, 200, 208)
    doc.setLineWidth(0.3)
    doc.rect(CX0, CY0, CW, CH, 'FD')

    // X grid
    for (let exp = Math.floor(Math.log10(tccData.xMin)); exp <= Math.ceil(Math.log10(tccData.xMax)); exp++) {
      for (const mult of [1, 2, 3, 5]) {
        const val = Math.pow(10, exp) * mult
        if (val < tccData.xMin * 0.9999 || val > tccData.xMax * 1.0001) continue
        const gx = pdfCx(val)
        const major = mult === 1
        doc.setDrawColor(major ? 192 : 220, major ? 200 : 226, major ? 208 : 232)
        doc.setLineWidth(major ? 0.15 : 0.07)
        doc.line(gx, CY0, gx, CY0 + CH)
        if (major) {
          doc.setFontSize(5)
          doc.setTextColor(...CLR.subText)
          const label = val >= 1000 ? `${val / 1000}k` : String(val)
          doc.text(label, gx, CY0 + CH + 5, { align: 'center' })
        }
      }
    }

    // Y grid
    for (let exp = Math.floor(Math.log10(tccData.yMin)); exp <= Math.ceil(Math.log10(tccData.yMax)); exp++) {
      for (const mult of [1, 2, 5]) {
        const val = Math.pow(10, exp) * mult
        if (val < tccData.yMin * 0.9999 || val > tccData.yMax * 1.0001) continue
        const gy = pdfCy(val)
        const major = mult === 1
        doc.setDrawColor(major ? 192 : 220, major ? 200 : 226, major ? 208 : 232)
        doc.setLineWidth(major ? 0.15 : 0.07)
        doc.line(CX0, gy, CX0 + CW, gy)
        if (major) {
          doc.setFontSize(5)
          doc.setTextColor(...CLR.subText)
          doc.text(val < 1 ? val.toString() : String(val), CX0 - 1, gy + 1.5, { align: 'right' })
        }
      }
    }

    // Axis labels
    doc.setFontSize(5.5)
    doc.setTextColor(...CLR.darkText)
    doc.setFont('helvetica', 'bold')
    doc.text('Current (A)', CX0 + CW / 2, CY0 + CH + 10, { align: 'center' })
    doc.text('t (s)', CX0 - 9, CY0 + 4)
    doc.setFont('helvetica', 'normal')

    // Fault current lines (dashed)
    for (const fl of tccData.faultLines) {
      const fx = pdfCx(fl.current_a)
      if (fx < CX0 || fx > CX0 + CW) continue
      doc.setDrawColor(192, 64, 0)
      doc.setLineWidth(0.3)
      let yy = CY0
      while (yy < CY0 + CH) {
        doc.line(fx, yy, fx, Math.min(yy + 1.5, CY0 + CH))
        yy += 2.5
      }
      doc.setFontSize(4.5)
      doc.setTextColor(192, 64, 0)
      doc.text(fl.label, fx + 0.5, CY0 + 5)
    }

    // Relay curves
    for (const curve of tccData.curves) {
      const [cr, cg, cb] = hexToRgb(curve.color)
      doc.setDrawColor(cr, cg, cb)
      doc.setLineWidth(0.5)
      const pts = curve.points
      for (let i = 1; i < pts.length; i++) {
        const x1 = pdfCx(pts[i - 1].x), py1 = pdfCy(pts[i - 1].y)
        const x2 = pdfCx(pts[i].x),     py2 = pdfCy(pts[i].y)
        if (x1 < CX0 - 0.1 || x1 > CX0 + CW + 0.1) continue
        if (py1 < CY0 - 0.1 || py1 > CY0 + CH + 0.1) continue
        if (x2 < CX0 - 0.1 || x2 > CX0 + CW + 0.1) continue
        if (py2 < CY0 - 0.1 || py2 > CY0 + CH + 0.1) continue
        doc.line(x1, py1, x2, py2)
      }
      // Instantaneous cliff
      if (curve.instSegment) {
        const [p1, p2] = curve.instSegment
        const ix = pdfCx(p1.x)
        if (ix >= CX0 && ix <= CX0 + CW) {
          doc.setLineWidth(0.9)
          doc.line(ix, Math.max(pdfCy(p1.y), CY0), ix, Math.min(pdfCy(p2.y), CY0 + CH))
        }
      }
    }

    // Legend (right of chart)
    const LX = CX0 + CW + 5
    tccData.curves.forEach((curve, i) => {
      const ly = CY0 + 5 + i * 12
      const [lr, lg, lb] = hexToRgb(curve.color)
      doc.setDrawColor(lr, lg, lb)
      doc.setLineWidth(0.8)
      doc.line(LX, ly + 2, LX + 7, ly + 2)
      doc.setFontSize(6)
      doc.setTextColor(...CLR.darkText)
      doc.setFont('helvetica', 'bold')
      doc.text(curve.breakerName, LX + 9, ly + 3)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.5)
      doc.setTextColor(...CLR.subText)
      doc.text(`${curve.busName} · ${curve.pickup_a}A`, LX + 9, ly + 7.5)
    })

    y = CY0 + CH + 16
  }

  // ── Motor Starting Results ────────────────────────────────────────────────
  const motorStartNodes = nodes.filter(n => n.type === 'motor')
  const motorStarts = loadflow?.motorStarts
  if (loadflow && motorStarts && motorStartNodes.length > 0) {
    if (y > 220) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, 'Motor Starting Analysis', y)

    const msHead = [[
      'Motor', 'Method',
      'Irated (A)', 'Istart (A)', 'Start MVA',
      'Voltage (pu)', 'Drop (%)', 'Status',
    ]]
    const msBody = motorStartNodes.map(n => {
      const mEq = n.data.equipment as Motor
      const sr  = motorStarts[n.id]
      const v   = sr?.terminal_voltage_pu
      const status = v === undefined ? '—'
        : v >= 0.85 ? 'PASS'
        : v >= 0.80 ? 'WARNING'
        : 'FAIL'
      return [
        mEq.name,
        mEq.starting_method,
        sr ? f(sr.running_current_a, 1) : '—',
        sr ? f(sr.start_current_a, 1)   : '—',
        sr ? f(sr.start_mva, 3)          : '—',
        sr ? f(sr.terminal_voltage_pu, 4): '—',
        sr ? f(sr.voltage_drop_percent, 2): '—',
        status,
      ]
    })

    autoTable(doc, {
      startY: y,
      head: msHead, body: msBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 1.8, font: 'helvetica', textColor: CLR.darkText },
      headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 24 },
        2: { halign: 'right', cellWidth: 22 },
        3: { halign: 'right', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 24 },
        6: { halign: 'right', cellWidth: 17 },
        7: { halign: 'center', cellWidth: 14 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const sr = motorStarts[motorStartNodes[data.row.index]?.id ?? '']
        if (!sr) return
        const v = sr.terminal_voltage_pu
        if (v < 0.80) {
          data.cell.styles.fillColor = CLR.redBg
          data.cell.styles.textColor = CLR.red
        }
        if (data.column.index === 7) {
          data.cell.styles.fontStyle = 'bold'
          if (v >= 0.85) {
            data.cell.styles.textColor = CLR.green
            data.cell.styles.fillColor = CLR.greenBg
          } else if (v >= 0.80) {
            data.cell.styles.textColor = CLR.amber
            data.cell.styles.fillColor = CLR.amberBg
          } else {
            data.cell.styles.textColor = CLR.red
            data.cell.styles.fillColor = CLR.redBg
          }
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Arc Flash Analysis (IEEE 1584) ────────────────────────────────────────
  const arcItems = arcFlash ? Object.values(arcFlash.items) : []
  if (arcItems.length > 0) {
    if (y > 220) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, 'Arc Flash Analysis  (IEEE 1584  ·  simplified model)', y)

    const afHead = [[
      'Bus', 'kV', 'Ik" (kA)', 'Iarc (kA)', 't_clear (s)',
      'd (mm)', 'IE (cal/cm²)', 'AFB (m)', 'PPE Cat', 'Risk',
    ]]
    const afBody = arcItems.map(r => [
      r.busName,
      String(r.vn_kv),
      f(r.ikss_ka, 3),
      f(r.iarc_ka, 3),
      f(r.clearing_time_s, 3),
      String(r.working_distance_mm),
      f(r.incident_energy_cal, 2),
      f(r.arc_flash_boundary_m, 3),
      r.ppe_category === 5 ? 'Cat 4+' : `Cat ${r.ppe_category}`,
      r.risk_level,
    ])

    const riskClr = (risk: ArcFlashRiskLevel) => {
      switch (risk) {
        case 'LOW':     return { fg: CLR.green,  bg: CLR.greenBg }
        case 'MEDIUM':  return { fg: CLR.amber,  bg: CLR.amberBg }
        case 'HIGH':    return { fg: [176, 64, 0] as [number,number,number], bg: [255, 240, 224] as [number,number,number] }
        case 'EXTREME': return { fg: CLR.red,    bg: CLR.redBg }
      }
    }

    autoTable(doc, {
      startY: y,
      head: afHead, body: afBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7, cellPadding: 1.6, font: 'helvetica', textColor: CLR.darkText },
      headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { halign: 'right', cellWidth: 13 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 14 },
        6: { halign: 'right', cellWidth: 22 },
        7: { halign: 'right', cellWidth: 17 },
        8: { halign: 'center', cellWidth: 14 },
        9: { halign: 'center', cellWidth: 14 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const item = arcItems[data.row.index]
        if (!item) return
        const { fg, bg } = riskClr(item.risk_level)

        // HIGH and EXTREME: full row tinted
        if (item.risk_level === 'HIGH' || item.risk_level === 'EXTREME') {
          data.cell.styles.fillColor = bg
          data.cell.styles.textColor = fg
        }
        // Risk column always colored
        if (data.column.index === 9) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = fg
          data.cell.styles.fillColor = bg
        }
        // IE column colored by risk
        if (data.column.index === 6) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = fg
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── N-1 Contingency Analysis ─────────────────────────────────────────────
  const contCases = contingency?.cases ?? []
  if (contCases.length > 0) {
    if (y > 220) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, 'N-1 Contingency Analysis', y)

    // Summary line
    const pass    = contCases.filter(c => c.severity === 'PASS').length
    const warning = contCases.filter(c => c.severity === 'WARNING').length
    const fail    = contCases.filter(c => c.severity === 'FAIL').length
    doc.setFontSize(7.5)
    doc.setTextColor(...CLR.subText)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Total ${contCases.length} cases  ·  PASS ${pass}  ·  WARNING ${warning}  ·  FAIL ${fail}` +
      `  ·  V < 0.95 pu = Undervoltage  ·  Loading > 100% = Overload  ·  Island = FAIL`,
      MARGIN, y + 1,
    )
    y += 7

    const cHead = [[
      'Equipment', 'Type', 'Status', 'Min V (pu)', 'Max Load (%)', 'Islands', 'U/V Buses', 'Overloads',
    ]]
    const cBody = contCases.map(r => [
      r.equipmentName,
      r.equipmentType,
      r.severity,
      isNaN(r.minVoltagePu)      ? '—' : f(r.minVoltagePu, 4),
      isNaN(r.maxLoadingPercent) ? '—' : f(r.maxLoadingPercent, 1),
      String(r.islandedBuses.length),
      String(r.undervoltageBuses.length),
      String(r.overloadedTransformers.length + r.overloadedLines.length),
    ])

    autoTable(doc, {
      startY: y,
      head: cHead, body: cBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7.5, cellPadding: 1.8, font: 'helvetica', textColor: CLR.darkText },
      headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 20 },
        2: { halign: 'center', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 16 },
        6: { halign: 'right', cellWidth: 18 },
        7: { halign: 'right', cellWidth: 18 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const c = contCases[data.row.index]
        if (!c) return
        if (c.severity === 'FAIL') {
          data.cell.styles.fillColor = CLR.redBg
          data.cell.styles.textColor = CLR.red
        } else if (c.severity === 'WARNING') {
          data.cell.styles.fillColor = CLR.amberBg
          data.cell.styles.textColor = CLR.amber
        }
        if (data.column.index === 2) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor =
            c.severity === 'PASS' ? CLR.green
            : c.severity === 'WARNING' ? CLR.amber
            : CLR.red
          data.cell.styles.fillColor =
            c.severity === 'PASS' ? CLR.greenBg
            : c.severity === 'WARNING' ? CLR.amberBg
            : CLR.redBg
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Cable Sizing (IEC 60364) ─────────────────────────────────────────────
  const csItems = cableSizing ? Object.values(cableSizing.cables) : []
  if (csItems.length > 0) {
    if (y > 220) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, 'Cable Sizing  (IEC 60364  ·  Ampacity / Voltage Drop / SC Withstand)', y)

    const pass2    = csItems.filter(c => c.severity === 'PASS').length
    const warn2    = csItems.filter(c => c.severity === 'WARNING').length
    const fail2    = csItems.filter(c => c.severity === 'FAIL').length
    const worstDv  = Math.max(...csItems.map(c => c.voltageDropPercent))
    doc.setFontSize(7.5)
    doc.setTextColor(...CLR.subText)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Cables: ${csItems.length}  ·  PASS: ${pass2}  ·  WARNING: ${warn2}  ·  FAIL: ${fail2}` +
      `  ·  Worst ΔV: ${worstDv.toFixed(2)}%  ·  LV limit 3%  ·  MV/HV limit 5%`,
      MARGIN, y + 1,
    )
    y += 7

    const csHead = [[
      'Cable', 'Route', 'kV', 'I_load (A)', 'Ampacity (A)', 'ΔV (%)', 'Ik″ (kA)',
      'Exist (mm²)', 'Recommended', 'Status',
    ]]
    const csBody = csItems.map(c => [
      c.cableName,
      `${c.fromBus}→${c.toBus}`,
      String(c.vn_kv),
      f(c.loadCurrentA, 1),
      f(c.ampacityA, 0),
      f(c.voltageDropPercent, 2),
      c.shortCircuitKA > 0 ? f(c.shortCircuitKA, 3) : '—',
      String(c.existingMM2),
      c.recommendedModel,
      c.severity,
    ])

    autoTable(doc, {
      startY: y,
      head: csHead, body: csBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7, cellPadding: 1.6, font: 'helvetica', textColor: CLR.darkText },
      headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 28 },
        2: { halign: 'right', cellWidth: 11 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 20 },
        5: { halign: 'right', cellWidth: 14 },
        6: { halign: 'right', cellWidth: 16 },
        7: { halign: 'right', cellWidth: 18 },
        8: { cellWidth: 34 },
        9: { halign: 'center', cellWidth: 15 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const c = csItems[data.row.index]
        if (!c) return
        if (c.severity === 'FAIL') {
          data.cell.styles.fillColor = CLR.redBg
          data.cell.styles.textColor = CLR.red
        } else if (c.severity === 'WARNING') {
          data.cell.styles.fillColor = CLR.amberBg
          data.cell.styles.textColor = CLR.amber
        }
        if (data.column.index === 9) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor =
            c.severity === 'PASS' ? CLR.green
            : c.severity === 'WARNING' ? CLR.amber : CLR.red
          data.cell.styles.fillColor =
            c.severity === 'PASS' ? CLR.greenBg
            : c.severity === 'WARNING' ? CLR.amberBg : CLR.redBg
        }
        if (data.column.index === 5 && !c.passVoltageDrop) {
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── IEEE 519 Harmonic Analysis ───────────────────────────────────────────
  const harmBuses = harmonics ? Object.values(harmonics.buses) : []
  if (harmBuses.length > 0) {
    if (y > 220) { doc.addPage(); y = 16 }
    y = sectionTitle(doc, 'IEEE 519-2014 Harmonic Voltage Distortion Analysis', y)

    const passCount = harmBuses.filter(b => b.ieee519_pass).length
    const failCount2 = harmBuses.length - passCount
    const worstTHDv = Math.max(...harmBuses.map(b => b.thdv_percent))
    doc.setFontSize(7.5)
    doc.setTextColor(...CLR.subText)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Sources: ${harmonics!.sources.length}  ·  Buses: ${harmBuses.length}  ·  ` +
      `PASS: ${passCount}  ·  FAIL: ${failCount2}  ·  Worst THDv: ${worstTHDv.toFixed(2)}%`,
      MARGIN, y + 1,
    )
    y += 7

    const hHead = [[
      'Bus', 'kV', 'THDv (%)', 'h5 (%)', 'h7 (%)', 'h11 (%)', 'h13 (%)', 'h17 (%)', 'h19 (%)', 'Limit (%)', 'Status',
    ]]
    const hBody = harmBuses.map(b => [
      b.busName,
      String(b.vn_kv),
      f(b.thdv_percent, 2),
      f(b.distortion[5]  ?? 0, 2),
      f(b.distortion[7]  ?? 0, 2),
      f(b.distortion[11] ?? 0, 2),
      f(b.distortion[13] ?? 0, 2),
      f(b.distortion[17] ?? 0, 2),
      f(b.distortion[19] ?? 0, 2),
      String(b.ieee519_limit),
      b.ieee519_pass ? 'PASS' : 'FAIL',
    ])

    autoTable(doc, {
      startY: y,
      head: hHead, body: hBody,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 7, cellPadding: 1.6, font: 'helvetica', textColor: CLR.darkText },
      headStyles: { fillColor: CLR.headerFill, textColor: CLR.darkText, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: CLR.rowAlt },
      columnStyles: {
        0:  { cellWidth: 30 },
        1:  { halign: 'right', cellWidth: 12 },
        2:  { halign: 'right', cellWidth: 18 },
        3:  { halign: 'right', cellWidth: 14 },
        4:  { halign: 'right', cellWidth: 14 },
        5:  { halign: 'right', cellWidth: 14 },
        6:  { halign: 'right', cellWidth: 14 },
        7:  { halign: 'right', cellWidth: 14 },
        8:  { halign: 'right', cellWidth: 14 },
        9:  { halign: 'right', cellWidth: 16 },
        10: { halign: 'center', cellWidth: 14 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return
        const b = harmBuses[data.row.index]
        if (!b) return
        if (!b.ieee519_pass) {
          data.cell.styles.fillColor = CLR.redBg
          data.cell.styles.textColor = CLR.red
        } else if (b.thdv_percent > b.ieee519_limit * 0.6) {
          data.cell.styles.fillColor = CLR.amberBg
          data.cell.styles.textColor = CLR.amber
        }
        if (data.column.index === 2) {
          data.cell.styles.fontStyle = 'bold'
        }
        if (data.column.index === 10) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.textColor = b.ieee519_pass ? CLR.green : CLR.red
          data.cell.styles.fillColor = b.ieee519_pass ? CLR.greenBg : CLR.redBg
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Stamp header/footer on every page ─────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    stampPageHeaderFooter(doc, i, totalPages)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  doc.save(`ETAPLite_Report_${timestamp()}.pdf`)
}

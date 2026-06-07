import { useState, useCallback } from 'react'
import { normalizeText, meaningfulLength } from '../utils/datasheetNormalizer'

// Configure pdf.js worker (Vite resolves import.meta.url at build time)
let pdfWorkerConfigured = false
async function getPdfjsLib() {
  const pdfjsLib = await import('pdfjs-dist')
  if (!pdfWorkerConfigured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    pdfWorkerConfigured = true
  }
  return pdfjsLib
}

const OCR_THRESHOLD = 200   // chars — if less, trigger OCR
const RENDER_SCALE  = 2.0   // higher = better OCR, slower

export type ExtractionStatus = 'idle' | 'pdf' | 'ocr' | 'done' | 'error'
export type ExtractionMethod = 'pdf' | 'ocr' | null

export interface ExtractionState {
  status:          ExtractionStatus
  progress:        number         // 0–100
  progressMsg:     string
  rawText:         string
  normalizedText:  string
  method:          ExtractionMethod
  pageCount:       number
  charCount:       number
  error:           string | null
}

const INITIAL: ExtractionState = {
  status: 'idle', progress: 0, progressMsg: '',
  rawText: '', normalizedText: '',
  method: null, pageCount: 0, charCount: 0, error: null,
}

export function usePdfExtract() {
  const [state, setState] = useState<ExtractionState>(INITIAL)

  const patch = useCallback((partial: Partial<ExtractionState>) => {
    setState(s => ({ ...s, ...partial }))
  }, [])

  const extract = useCallback(async (file: File) => {
    patch({ ...INITIAL, status: 'pdf', progress: 2, progressMsg: 'PDF 로딩 중...' })

    try {
      const pdfjsLib = await getPdfjsLib()
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const numPages = pdf.numPages
      patch({ pageCount: numPages })

      // ── Step 1: Text layer extraction ────────────────────────────────────────
      let rawText = ''
      for (let i = 1; i <= numPages; i++) {
        const page    = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageStr = content.items
          .filter(item => 'str' in item)
          .map(item => (item as { str: string }).str)
          .join(' ')
        rawText += pageStr + '\n'
        patch({
          progress:    Math.round(2 + (i / numPages) * 45),
          progressMsg: `텍스트 레이어 추출 중… ${i}/${numPages}페이지`,
        })
      }

      // ── Step 2: OCR fallback if text layer is sparse ──────────────────────────
      if (meaningfulLength(rawText) < OCR_THRESHOLD) {
        patch({ status: 'ocr', progress: 50, progressMsg: 'OCR 엔진 초기화 중…' })

        const Tesseract = (await import('tesseract.js'))
        const worker = await Tesseract.createWorker('eng', 1, {
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') {
              patch({
                progress:    50 + Math.round(m.progress * 45),
                progressMsg: `OCR 인식 중… ${Math.round(m.progress * 100)}%`,
              })
            }
          },
        })

        rawText = ''
        for (let i = 1; i <= numPages; i++) {
          const page     = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: RENDER_SCALE })
          const canvas   = document.createElement('canvas')
          canvas.width   = viewport.width
          canvas.height  = viewport.height
          const ctx      = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise

          const { data: { text } } = await worker.recognize(canvas)
          rawText += text + '\n'
          patch({
            progress:    50 + Math.round((i / numPages) * 45),
            progressMsg: `OCR 처리 중… ${i}/${numPages}페이지`,
          })
        }
        await worker.terminate()

        const normalized = normalizeText(rawText)
        patch({
          status: 'done', progress: 100, progressMsg: '완료',
          rawText, normalizedText: normalized,
          method: 'ocr', charCount: normalized.length,
        })
      } else {
        const normalized = normalizeText(rawText)
        patch({
          status: 'done', progress: 100, progressMsg: '완료',
          rawText, normalizedText: normalized,
          method: 'pdf', charCount: normalized.length,
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      patch({ status: 'error', error: msg })
    }
  }, [patch])

  const reset = useCallback(() => setState(INITIAL), [])

  return { state, extract, reset }
}

/**
 * PDF and raster image → HTMLCanvasElement converter.
 * Reuses the pdfjs-dist worker already configured in usePdfExtract.ts.
 */

const MAX_DIMENSION = 3000   // cap to avoid OOM on very large images
const DEFAULT_SCALE = 2.0    // PDF render scale (higher = better OCR quality)

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

// ── PDF ────────────────────────────────────────────────────────────────────────

export async function getPdfPageCount(file: File): Promise<number> {
  const lib = await getPdfjsLib()
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise
  return pdf.numPages
}

export async function renderPdfPage(
  file: File,
  pageNum: number,
  scale = DEFAULT_SCALE,
): Promise<HTMLCanvasElement> {
  const lib = await getPdfjsLib()
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await pdf.getPage(pageNum)
  const vp = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width  = vp.width
  canvas.height = vp.height
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
  return canvas
}

export async function renderAllPdfPages(
  file: File,
  onProgress?: (done: number, total: number) => void,
  scale = DEFAULT_SCALE,
): Promise<HTMLCanvasElement[]> {
  const lib = await getPdfjsLib()
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise
  const n   = pdf.numPages
  const out: HTMLCanvasElement[] = []

  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i)
    const vp   = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width  = vp.width
    canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise
    out.push(canvas)
    onProgress?.(i, n)
  }
  return out
}

// ── Raster image ──────────────────────────────────────────────────────────────

export function imageFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
        const r = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h)
        w = Math.round(w * r)
        h = Math.round(h * r)
      }
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 로드 실패')) }
    img.src = url
  })
}

// ── Unified entry point ────────────────────────────────────────────────────────

export type FileType = 'pdf' | 'image'

export function getFileType(file: File): FileType {
  return file.type === 'application/pdf' ? 'pdf' : 'image'
}

/**
 * Returns all canvases for the file:
 *  - PDF  → one canvas per page
 *  - Image → single canvas
 */
export async function fileToCanvases(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<HTMLCanvasElement[]> {
  if (getFileType(file) === 'pdf') {
    return renderAllPdfPages(file, onProgress)
  }
  const canvas = await imageFileToCanvas(file)
  onProgress?.(1, 1)
  return [canvas]
}

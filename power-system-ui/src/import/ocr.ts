/**
 * Tesseract.js wrapper — extracts words with pixel-level bounding boxes.
 * Dynamically imported to keep the main bundle lean.
 */

export interface OcrBBox {
  x: number   // left
  y: number   // top
  w: number   // width
  h: number   // height
}

export interface OcrWord {
  text:       string
  confidence: number   // 0–100
  bbox:       OcrBBox
}

export interface OcrResult {
  words:       OcrWord[]
  fullText:    string
  imageWidth:  number
  imageHeight: number
}

export type OcrProgressCb = (pct: number, msg: string) => void

/**
 * Run OCR on a canvas and return word-level results with bounding boxes.
 * Words with confidence < 20 are filtered out.
 */
export async function extractWords(
  canvas: HTMLCanvasElement,
  onProgress?: OcrProgressCb,
): Promise<OcrResult> {
  const Tesseract = await import('tesseract.js')

  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(m.progress * 100)
        onProgress?.(pct, `OCR 인식 중… ${pct}%`)
      }
    },
  })

  try {
    const { data } = await worker.recognize(canvas)

    const words: OcrWord[] = data.words
      .filter(w => w.text.trim().length > 0 && w.confidence >= 20)
      .map(w => ({
        text:       w.text.trim(),
        confidence: w.confidence,
        bbox: {
          x: w.bbox.x0,
          y: w.bbox.y0,
          w: w.bbox.x1 - w.bbox.x0,
          h: w.bbox.y1 - w.bbox.y0,
        },
      }))

    return {
      words,
      fullText:    data.text,
      imageWidth:  canvas.width,
      imageHeight: canvas.height,
    }
  } finally {
    await worker.terminate()
  }
}

/**
 * Merge multiple OcrResults from different pages.
 * Stacks pages vertically with a gap so bbox coordinates don't overlap.
 */
export function mergeOcrResults(
  results: OcrResult[],
  pageGap = 40,
): OcrResult {
  let yOffset = 0
  const allWords: OcrWord[] = []
  let fullText = ''
  let maxWidth = 0

  for (const r of results) {
    for (const w of r.words) {
      allWords.push({ ...w, bbox: { ...w.bbox, y: w.bbox.y + yOffset } })
    }
    fullText   += r.fullText + '\n'
    maxWidth    = Math.max(maxWidth, r.imageWidth)
    yOffset    += r.imageHeight + pageGap
  }

  return {
    words:       allWords,
    fullText:    fullText.trim(),
    imageWidth:  maxWidth,
    imageHeight: yOffset,
  }
}

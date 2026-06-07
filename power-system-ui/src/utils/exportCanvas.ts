/**
 * exportCanvas.ts
 * SLD 캔버스를 PNG로 내보내기.
 *
 * ReactFlow는 CSS transform을 사용하므로 .react-flow 루트 요소를 타겟으로 삼아
 * html2canvas가 뷰포트 내 실제 렌더링 결과를 올바르게 캡처하도록 합니다.
 */

import html2canvas from 'html2canvas'

/** P2-6: SLD 캔버스를 base64 PNG 문자열로 반환 (PDF 삽입용). */
export async function captureCanvasBase64(): Promise<string | null> {
  const rfRoot = document.querySelector('.react-flow') as HTMLElement | null
  if (!rfRoot) return null
  try {
    const rect = rfRoot.getBoundingClientRect()
    const canvas = await html2canvas(rfRoot, {
      scale: 1.5, backgroundColor: '#ffffff', logging: false,
      useCORS: true, allowTaint: true,
      scrollX: -window.scrollX, scrollY: -window.scrollY,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      x: rect.left + window.scrollX, y: rect.top + window.scrollY,
      width: rect.width, height: rect.height,
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export async function exportCanvasPNG(projectName = 'SLD'): Promise<void> {
  // ReactFlow 루트 요소 — CSS transform이 적용된 viewport가 내부에 있음
  const rfRoot = document.querySelector('.react-flow') as HTMLElement | null
  if (!rfRoot) {
    console.warn('exportCanvasPNG: .react-flow element not found')
    return
  }

  const safe = projectName.replace(/[^\w\-가-힣]/g, '_').replace(/__+/g, '_') || 'SLD'

  try {
    const rect = rfRoot.getBoundingClientRect()

    const canvas = await html2canvas(rfRoot as HTMLElement, {
      scale:           2,
      backgroundColor: '#ffffff',
      logging:         false,
      useCORS:         true,
      allowTaint:      true,
      // 스크롤 오프셋 보정
      scrollX:         -window.scrollX,
      scrollY:         -window.scrollY,
      windowWidth:     document.documentElement.scrollWidth,
      windowHeight:    document.documentElement.scrollHeight,
      x:               rect.left  + window.scrollX,
      y:               rect.top   + window.scrollY,
      width:           rect.width,
      height:          rect.height,
    })

    const url = canvas.toDataURL('image/png')
    const a   = document.createElement('a')
    a.href     = url
    a.download = `${safe}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch (err) {
    console.error('exportCanvasPNG failed:', err)
  }
}

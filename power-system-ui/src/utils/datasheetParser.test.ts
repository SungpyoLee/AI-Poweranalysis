/**
 * datasheetParser.ts 단위 테스트.
 *
 * 정규식 추출 자체보다는, 추출한 값이 실제로 그 필드가 의미하는 물리량과
 * 일치하는 라벨을 달고 검토 UI(DatasheetImportWizard.tsx)에 표시되는지를
 * 검증한다 — 값은 맞아도 라벨이 다른 물리량을 가리키면 사용자가 착각한다.
 */
import { describe, it, expect } from 'vitest'
import { parseDatasheet } from './datasheetParser'

describe('parseDatasheet(breaker) — rated_kA 라벨', () => {
  it('회귀: rated_kA는 정격 "연속전류"(In)이지 단락전류가 아니다 — 라벨이 일치해야 한다', () => {
    // 예전 버그: rated_kA의 한글 라벨이 '정격단락전류'였다. 그런데 이 필드는
    // PropertyPanel.tsx/LibraryModal.tsx 어디서나 "Rated Current"(정격
    // 연속전류 In)로 쓰인다 — 실제 단락전류 관련 정격은 별도 필드
    // interrupt_kA("차단용량 Icu")다. 검토 테이블에 두 필드가 나란히
        // 뜨는데 하나는 "차단용량", 하나는 "단락전류"라고 되어 있으면
    // 사용자가 이 값도 단락 관련 정격인 것으로 착각하기 쉬웠다.
    const text = 'Rated Current In = 2000A, Icu = 40kA'
    const result = parseDatasheet(text, 'breaker')

    const ratedField = result.fields.find(f => f.key === 'rated_kA')!
    expect(ratedField.value).toBeCloseTo(2.0, 6)   // 2000A → 2.0kA (값 자체는 정상)
    expect(ratedField.label).not.toMatch(/단락/)    // "단락"이 들어간 라벨이면 안 됨
    expect(ratedField.label).not.toBe(result.fields.find(f => f.key === 'interrupt_kA')!.label)
  })
})

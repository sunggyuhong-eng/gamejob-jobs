import { describe, expect, it } from 'vitest'
import { PIPELINE_STAGES } from './types'

describe('채용 대시보드 전형 단계', () => {
  it('요청한 9개 진행 단계만 노출한다', () => {
    expect(PIPELINE_STAGES).toEqual([
      '온라인 과제', '코딩테스트', '역량검사', '면접', '1차 면접',
      '2차 면접', '면접합격', '처우단계', 'Offer',
    ])
    expect(PIPELINE_STAGES).not.toContain('Hired')
  })
})

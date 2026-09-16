import { describe, expect, it } from 'vitest'
import { compareSnapshots, companyGroupName, dataQuality, stableJobKey } from './analysis'
import type { CompanyGroups, Job, Snapshot } from './types'

const groups: CompanyGroups = { groups: { 크래프톤그룹: { members: ['크래프톤', '룬샷게임즈'] } } }
const job = (id:string, company='크래프톤', categories=['게임제작']):Job => ({ id, company, title:id, url:`https://www.gamejob.co.kr/job?GI_No=${id}`, categories, original_categories:[], career:'경력 3년', employment_type:'정규직', location:'서울', posted_at:null, deadline:null, always_open:false, logo_url:null, representative_game:null, collected_at:'now' })
const snapshot = (period:string, jobs:Job[]):Snapshot => ({ schema_version:1, period, collected_at:'now', is_sample:false, jobs })

describe('client comparison', () => {
  it('uses the gamejob number as stable id', () => expect(stableJobKey(job('123'))).toBe('gamejob:123'))
  it('compares new maintained and closed jobs', () => {
    const result = compareSnapshots(snapshot('2026-09', [job('2'), job('3')]), snapshot('2026-08', [job('1'), job('2')]), groups)
    expect([result.new_count, result.maintained_count, result.closed_count]).toEqual([1, 1, 1])
  })
  it('supports group aggregation without changing legal company names', () => {
    expect(companyGroupName('룬샷게임즈(크래프톤 계열회사)', groups)).toBe('크래프톤그룹')
    const result = compareSnapshots(snapshot('2026-09', [job('2', '룬샷게임즈')]), snapshot('2026-08', [job('1')]), groups)
    expect(result.by_company_group).toHaveLength(1)
  })
  it('reports overlapping classification quality separately', () => {
    const result = dataQuality(snapshot('2026-09', [job('1')]), { 게임제작: ['게임기획'] }, 1)
    expect(result.score).toBe(100)
    expect(result.reportMismatch).toBe(0)
  })
})

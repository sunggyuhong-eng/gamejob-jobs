import type { CompanyGroups, Job, Snapshot, StatRow } from './types'

export type ComparisonStats = {
  has_baseline: boolean
  total_open: number
  previous_total: number | null
  change: number | null
  change_rate: number | null
  new_count: number | null
  maintained_count: number | null
  closed_count: number | null
  new_ids: string[]
  maintained_ids: string[]
  closed_ids: string[]
  by_company: StatRow[]
  by_company_group: StatRow[]
  by_category: StatRow[]
  by_career: StatRow[]
  by_employment_type: StatRow[]
}

export function stableJobKey(job: Job) {
  const match = String(job.url || '').match(/[?&]GI_No=(\d+)/i)
  return match ? `gamejob:${match[1]}` : job.id
}

export function companyGroupName(name: string, config: CompanyGroups) {
  for (const [group, detail] of Object.entries(config.groups || {})) {
    if (detail.members.some(member => name === member || name.includes(member))) return group
  }
  return name
}

function careerBucket(value: string | null) {
  const text = (value || '').toLowerCase()
  if (!text) return '미확인'
  if (text.includes('신입') && text.includes('경력')) return '신입·경력'
  if (text.includes('신입')) return '신입'
  const year = Number(text.match(/\d+/)?.[0] || NaN)
  if (Number.isNaN(year)) return text.includes('경력') ? '경력(연차 미확인)' : '미확인'
  if (year <= 2) return '경력 1~2년'
  if (year <= 5) return '경력 3~5년'
  if (year <= 10) return '경력 6~10년'
  return '경력 11년 이상'
}

function deltaRows(current: Job[], previous: Job[], values: (job: Job) => string[]) {
  const count = (jobs: Job[]) => {
    const result: Record<string, number> = {}
    jobs.forEach(job => [...new Set(values(job).filter(Boolean))].forEach(value => { result[value] = (result[value] || 0) + 1 }))
    return result
  }
  const currentCounts = count(current), previousCounts = count(previous)
  return [...new Set([...Object.keys(currentCounts), ...Object.keys(previousCounts)])]
    .map(name => ({ name, current: currentCounts[name] || 0, previous: previousCounts[name] || 0, change: (currentCounts[name] || 0) - (previousCounts[name] || 0) }))
    .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name))
}

export function compareSnapshots(current: Snapshot, previous: Snapshot | undefined, groups: CompanyGroups): ComparisonStats {
  const currentJobs = current.jobs || []
  if (!previous) {
    return {
      has_baseline: false, total_open: currentJobs.length, previous_total: null, change: null, change_rate: null,
      new_count: null, maintained_count: null, closed_count: null, new_ids: [], maintained_ids: [], closed_ids: [],
      by_company: [], by_company_group: [], by_category: [], by_career: [], by_employment_type: [],
    }
  }
  const previousJobs = previous.jobs || []
  const currentMap = new Map(currentJobs.map(job => [stableJobKey(job), job]))
  const previousMap = new Map(previousJobs.map(job => [stableJobKey(job), job]))
  const currentIds = new Set(currentMap.keys()), previousIds = new Set(previousMap.keys())
  const newIds = [...currentIds].filter(id => !previousIds.has(id)).sort()
  const maintainedIds = [...currentIds].filter(id => previousIds.has(id)).sort()
  const closedIds = [...previousIds].filter(id => !currentIds.has(id)).sort()
  const change = currentMap.size - previousMap.size
  return {
    has_baseline: true,
    total_open: currentMap.size,
    previous_total: previousMap.size,
    change,
    change_rate: previousMap.size ? Math.round(change / previousMap.size * 1000) / 10 : null,
    new_count: newIds.length,
    maintained_count: maintainedIds.length,
    closed_count: closedIds.length,
    new_ids: newIds,
    maintained_ids: maintainedIds,
    closed_ids: closedIds,
    by_company: deltaRows(currentJobs, previousJobs, job => [job.company]),
    by_company_group: deltaRows(currentJobs, previousJobs, job => [companyGroupName(job.company, groups)]),
    by_category: deltaRows(currentJobs, previousJobs, job => job.job_major_categories?.length ? job.job_major_categories : job.categories),
    by_career: deltaRows(currentJobs, previousJobs, job => [careerBucket(job.career)]),
    by_employment_type: deltaRows(currentJobs, previousJobs, job => (job.employment_type || '미확인').split(',').map(value => value.trim())),
  }
}

export function dataQuality(snapshot: Snapshot, taxonomy: Record<string, string[]>, reportTotal?: number | null) {
  const jobs = snapshot.jobs || []
  const ids = jobs.map(stableJobKey)
  const duplicateIds = ids.length - new Set(ids).size
  const allowedSubs = new Set(Object.values(taxonomy).flat())
  const unknownSubs = [...new Set(jobs.flatMap(job => job.job_subcategories || job.original_categories || []).filter(value => !allowedSubs.has(value)))].sort()
  const missing = (get: (job: Job) => unknown) => jobs.filter(job => !get(job)).length
  const noCategory = jobs.filter(job => !(job.job_major_categories?.length || job.categories?.length)).length
  const otherCategory = jobs.filter(job => (job.job_major_categories || job.categories || []).includes('기타')).length
  const mismatch = reportTotal == null ? null : reportTotal - jobs.length
  const penalty = duplicateIds * 4 + noCategory * 2 + otherCategory + missing(job => job.company) * 2 + missing(job => job.location) * .15 + missing(job => job.career) * .15
  const score = Math.max(0, Math.round(100 - penalty / Math.max(1, jobs.length) * 100))
  return {
    score, duplicateIds, noCategory, otherCategory, unknownSubs,
    missingCompany: missing(job => job.company),
    missingLocation: missing(job => job.location),
    missingCareer: missing(job => job.career),
    missingEmployment: missing(job => job.employment_type),
    reportMismatch: mismatch,
  }
}

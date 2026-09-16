import type { CategoryHistory, CompanyGroups, History, Report, Snapshot, Status } from './types'

const requestVersion = Date.now().toString()
const asset = (path: string) => {
  const url = new URL(path, window.location.href.split('#')[0])
  url.searchParams.set('v', requestVersion)
  return url.toString()
}

async function load<T>(path:string): Promise<T> {
  const response = await fetch(asset(path), { cache: 'no-store' })
  if (!response.ok) throw new Error(`${path} 로드 실패 (${response.status})`)
  return response.json()
}

export async function loadAll() {
  const [snapshot, history, categoryHistory, report, status, companyGroups] = await Promise.all([
    load<Snapshot>('data/latest.json'), load<History>('data/history-summary.json'),
    load<CategoryHistory>('data/category-history.json'),
    load<Report>('data/reports/latest.json'), load<Status>('data/collection-status.json'),
    load<CompanyGroups>('data/company-groups.json')
  ])
  const periods = [...new Set(categoryHistory.periods.map(item => item.period))]
  const loadedSnapshots = await Promise.all(periods.map(async period => [period, await load<Snapshot>(`data/snapshots/${period}.json`)] as const))
  const snapshots = Object.fromEntries(loadedSnapshots)
  return { snapshot, history, categoryHistory, report, status, companyGroups, snapshots }
}

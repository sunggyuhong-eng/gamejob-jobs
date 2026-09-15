import type { CategoryHistory, History, Report, Snapshot, Status } from './types'

const asset = (path: string) => new URL(path, window.location.href.split('#')[0]).toString()

async function load<T>(path:string): Promise<T> {
  const response = await fetch(asset(path), { cache: 'no-store' })
  if (!response.ok) throw new Error(`${path} 로드 실패 (${response.status})`)
  return response.json()
}

export async function loadAll() {
  const [snapshot, history, categoryHistory, report, status] = await Promise.all([
    load<Snapshot>('data/latest.json'), load<History>('data/history-summary.json'),
    load<CategoryHistory>('data/category-history.json'),
    load<Report>('data/reports/latest.json'), load<Status>('data/collection-status.json')
  ])
  return { snapshot, history, categoryHistory, report, status }
}

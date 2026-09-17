import { useEffect, useId, useMemo, useState } from 'react'
import { NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight, BarChart3, BriefcaseBusiness, Building2, CalendarDays,
  CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock3, ExternalLink, FileText, LayoutDashboard,
  MapPin, Search, Sparkles, TrendingUp, UsersRound, Newspaper, AlertCircle, ShieldCheck, Download, Database,
} from 'lucide-react'
import { loadAll } from './data'
import { compareSnapshots, companyGroupName, dataQuality } from './analysis'
import { pageWindow } from './pagination'
import type { CategoryHistory, CompanyGroups, History, Job, Report, Snapshot, Status } from './types'

type Data = { snapshot: Snapshot; history: History; categoryHistory: CategoryHistory; report: Report; status: Status; companyGroups:CompanyGroups; snapshots:Record<string,Snapshot> }
const nav = [
  ['/', '대시보드', LayoutDashboard], ['/categories', '직무별', BarChart3], ['/companies', '회사별', Building2],
  ['/reports', '월간 리포트', FileText], ['/quality', '데이터 진단', ShieldCheck],
] as const

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { loadAll().then(setData).catch((e: Error) => setError(e.message)) }, [])
  if (error) return <Empty title="데이터를 불러오지 못했어요" text={error} />
  if (!data) return <div className="loader"><span /><b>채용 데이터를 불러오는 중이에요</b></div>
  return <div className="app">
    <Header data={data} />
    <main>
      <Routes>
        <Route path="/" element={<Dashboard data={data} />} />
        <Route path="/jobs" element={<Jobs data={data} />} />
        <Route path="/categories" element={<Categories data={data} />} />
        <Route path="/companies" element={<Companies data={data} />} />
        <Route path="/reports" element={<Reports data={data} />} />
        <Route path="/quality" element={<DataQuality data={data} />} />
      </Routes>
    </main>
    <footer className="site-footer"><span>데이터 {data.snapshot.period} · 리포트 스키마 v{data.report.report_schema_version || 1}{data.report.generated_at ? ` · GPT ${formatDateTime(data.report.generated_at)}` : ''}</span><b>© KONGSTUDIOS</b></footer>
    <MobileNav />
  </div>
}

function Header({ data }: { data: Data }) {
  return <header className="topbar"><div className="topbar-inner">
    <NavLink className="brand" to="/">게임잡 채용 데이터</NavLink>
    <nav className="desktop-nav">{nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
    <GlobalSearch />
    <div className="freshness"><i className={data.status.success ? 'ok' : ''} /><span>{formatDate(data.snapshot.collected_at)} 기준</span>{data.snapshot.is_sample && <b>예시</b>}</div>
  </div></header>
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  return <form className="global-search" onSubmit={event => { event.preventDefault(); if (query.trim()) navigate(`/jobs?q=${encodeURIComponent(query.trim())}`) }}>
    <Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="회사·공고·직무 검색" aria-label="전체 채용공고 검색" />
  </form>
}

function MobileNav() {
  return <nav className="mobile-nav">{nav.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'}><Icon size={20} /><span>{label}</span></NavLink>)}</nav>
}

function Dashboard({ data }: { data: Data }) {
  const jobs = data.snapshot.jobs
  const companies = new Set(jobs.map(j => j.company)).size
  const categories = countCategories(jobs)
  const topCategory = categories[0]
  const stats = data.report.statistics
  const companyRanks = Object.entries(groupBy(jobs, j => j.company))
    .map(([name, list]) => ({ name, count: list.length, description: list[0].representative_game }))
    .sort((a, b) => b.count - a.count)
  const recentJobs = [...jobs].sort((a, b) => (b.posted_at || '').localeCompare(a.posted_at || '')).slice(0, 6)
  const categoryMoves = movementRows(stats.by_category || [])
  const companyMoves = movementRows(stats.by_company || [])
  const upJobs = categoryMoves.filter(row => (row.change || 0) > 0).length
  const downJobs = categoryMoves.filter(row => (row.change || 0) < 0).length

  return <section className="dashboard">
    <div className="hero">
      <div className="hero-copy"><span className="eyebrow"><Sparkles size={14} /> GAME INDUSTRY TALENT SIGNAL</span><h1>게임업계 채용 흐름,<br /><em>쉽고 빠르게</em> 확인하세요</h1><p>게임잡의 공개 채용공고를 매일 모아 회사와 직무의 변화를 한눈에 보여드려요.</p><div className="hero-actions"><NavLink className="primary-button" to="/jobs">채용공고 살펴보기 <ArrowUpRight size={18} /></NavLink><span><CheckCircle2 size={16} /> {data.report.is_sample ? '예시 비교 데이터' : '실제 수집 데이터'}</span></div></div>
      <div className="hero-visual"><div className="pulse-card"><span>현재 채용 중</span><strong>{jobs.length.toLocaleString()}</strong><small>개의 게임업계 공고</small><div className="pulse-line"><i /><i /><i /><i /><i /><i /><i /></div><p><span /> 매일 오전 9시 업데이트</p></div><div className="floating-stat"><TrendingUp size={19} /><div><b>{topCategory?.name || '분류 없음'}</b><span>가장 많이 찾는 직무</span></div></div></div>
    </div>

    <div className={`status-strip${data.report.is_sample ? ' warning' : ''}`}><div><CheckCircle2 size={18} /><b>{data.report.is_sample ? '예시 데이터 비교 화면이에요' : data.status.success ? '데이터가 최신 상태예요' : '수집 상태를 확인해 주세요'}</b></div><span>{data.status.message || `마지막 정상 수집 ${formatDate(data.snapshot.collected_at)}`}</span></div>

    <section className="market-brief"><div><span>MONTHLY MARKET BRIEF</span><h2>{stats.change >= 0 ? '전월 대비 채용 공고가 확대됐어요' : '전월 대비 채용 공고가 감소했어요'}</h2><p>{data.report.comparison_label || '최근 비교 기간'} 기준 전체 공고는 <b>{fmtChange(stats.change)}</b> 변했습니다. 강세 직무 {upJobs}개, 약세 직무 {downJobs}개로 확인되며 회사·직무별 편차가 큽니다.</p></div><NavLink to="/reports">월간 분석 보기 <ChevronRight size={17} /></NavLink></section>

    <div className="section-heading"><div><span>MARKET SNAPSHOT</span><h2>지금 채용시장을 숫자로 볼까요?</h2></div><p>동일 공고는 고유번호를 기준으로 한 번만 집계해요.</p></div>
    <div className="kpis">
      <Kpi icon={BriefcaseBusiness} label="현재 오픈 공고" value={`${jobs.length.toLocaleString()}건`} sub={`전월 대비 ${fmtChange(stats.change)}`} primary />
      <Kpi icon={Sparkles} label="신규 공고" value={`${stats.new_count ?? '-'}건`} sub={data.report.comparison_label || '이번 공식 스냅샷'} />
      <Kpi icon={Clock3} label="종료 공고" value={`${stats.closed_count ?? '-'}건`} sub={data.report.baseline_period ? `${data.report.baseline_period} 기준` : '이전 공고 기준'} />
      <Kpi icon={UsersRound} label="채용 중인 회사" value={`${companies.toLocaleString()}개`} sub="회사명 중복 제거" />
      <Kpi icon={BarChart3} label="최다 채용 직무" value={topCategory?.name || '-'} sub={`${topCategory?.count.toLocaleString() || 0}건`} />
    </div>

    <div className="dashboard-grid market-grid">
      <Panel className="trend-panel" eyebrow="HIRING TREND" title="오픈 공고 추이"><Trend history={data.history} /></Panel>
      <Panel eyebrow="JOB MOMENTUM" title="직무 강세·약세"><DeltaBars rows={categoryMoves.slice(0, 8)} /></Panel>
      <Panel eyebrow="COMPANY MOVERS" title="회사별 변동"><DeltaBars rows={companyMoves.slice(0, 8)} /></Panel>
    </div>

    <div className="section-heading compact"><div><span>NEW OPENINGS</span><h2>최근 등록된 공고</h2></div><NavLink to="/jobs">전체 공고 보기 <ChevronRight size={17} /></NavLink></div>
    <JobCards jobs={recentJobs} />
  </section>
}

function Jobs({ data }: { data: Data }) {
  const jobs = data.snapshot.jobs
  const [params] = useSearchParams()
  const queryParam = params.get('q') || ''
  const [q, setQ] = useState(queryParam), [company, setCompany] = useState('')
  const [major, setMajor] = useState(params.get('major') || ''), [sub, setSub] = useState(params.get('sub') || '')
  const [career, setCareer] = useState(''), [location, setLocation] = useState(''), [employment, setEmployment] = useState('')
  const [sort, setSort] = useState('latest'), [page, setPage] = useState(1)
  const list = useMemo(() => jobs.filter(j =>
    (!q || `${j.title} ${j.company} ${majorCategories(j).join(' ')} ${subCategories(j).join(' ')}`.toLowerCase().includes(q.toLowerCase())) &&
    (!company || j.company === company) && (!major || majorCategories(j).includes(major)) && (!sub || subCategories(j).includes(sub)) &&
    (!career || j.career === career) && (!location || j.location === location) &&
    (!employment || splitValues(j.employment_type).includes(employment))
  ).sort((a, b) => sort === 'deadline'
    ? (a.deadline || '9999').localeCompare(b.deadline || '9999')
    : (b.posted_at || '').localeCompare(a.posted_at || '')), [jobs, q, company, major, sub, career, location, employment, sort])

  useEffect(() => setPage(1), [q, company, major, sub, career, location, employment, sort])
  useEffect(() => setQ(queryParam), [queryParam])
  useEffect(() => { if (sub && !jobs.some(j => (!major || majorCategories(j).includes(major)) && subCategories(j).includes(sub))) setSub('') }, [jobs, major, sub])
  const clear = () => { setQ(''); setCompany(''); setMajor(''); setSub(''); setCareer(''); setLocation(''); setEmployment('') }
  const hasFilter = Boolean(q || company || major || sub || career || location || employment)
  const pageSize = 40, pageCount = Math.max(1, Math.ceil(list.length / pageSize))
  const pagedJobs = list.slice((page - 1) * pageSize, page * pageSize)
  const availableSubs = jobs.filter(j => !major || majorCategories(j).includes(major)).flatMap(subCategories)
  return <section>
    <PageTitle eyebrow="OPEN POSITIONS" title="채용공고" description="원하는 회사와 직무를 빠르게 찾아보세요." count={list.length} />
    <div className="filter-card"><label className="search-box"><Search size={20} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="회사명, 공고명 또는 직무 검색" /></label><div className="filter-row"><Select value={company} set={setCompany} label="전체 회사" values={jobs.map(j => j.company)} /><Select value={major} set={setMajor} label="전체 대분류" values={jobs.flatMap(majorCategories)} /><Select value={sub} set={setSub} label="전체 소분류" values={availableSubs} /><Select value={career} set={setCareer} label="전체 경력" values={jobs.map(j => j.career)} /><Select value={location} set={setLocation} label="전체 지역" values={jobs.map(j => j.location)} /><Select value={employment} set={setEmployment} label="전체 고용형태" values={jobs.flatMap(j => splitValues(j.employment_type))} /><select value={sort} onChange={e => setSort(e.target.value)}><option value="latest">최신 등록순</option><option value="deadline">마감 임박순</option></select>{hasFilter && <button className="text-button" onClick={clear}>필터 초기화</button>}</div></div>
    <div className="result-head"><b>{list.length.toLocaleString()}개의 공고</b><div className="result-actions"><span>공고 제목을 누르면 게임잡 원문으로 이동해요.</span><button className="outline-button" onClick={() => downloadJobsCsv(list)}><Download size={14} /> CSV 다운로드</button></div></div>
    {list.length ? <><JobCards jobs={pagedJobs} detailed signals={jobSignals(data.report)} /><Pagination page={page} total={pageCount} setPage={setPage} /></> : <Empty title="조건에 맞는 공고가 없어요" text="검색어나 필터를 변경해 보세요." />}
  </section>
}

function Categories({ data }: { data: Data }) {
  const [params, setParams] = useSearchParams()
  const periods = Object.keys(data.snapshots).sort()
  const [baseline, setBaseline] = useState(periods.at(-2) || periods[0] || '')
  const [current, setCurrent] = useState(periods.at(-1) || data.snapshot.period.slice(0, 7))
  const [countMode, setCountMode] = useState<'unique'|'tags'>('unique')
  const currentSnapshot = data.snapshots[current] || data.snapshot
  const taxonomy = data.categoryHistory.taxonomy || {}
  const currentPeriod = data.categoryHistory.periods.find(item => item.period === current)
  const previousPeriod = data.categoryHistory.periods.find(item => item.period === baseline)
  const tagTotal = (period: CategoryHistory['periods'][number] | undefined, major: string) => {
    if (!period) return null
    const scoped = period.sub_by_major?.[major]
    if (scoped) return Object.values(scoped).reduce((sum, value) => sum + value, 0)
    return (taxonomy[major] || []).reduce((sum, name) => sum + (period.sub[name] || 0), 0)
  }
  const uniqueCounts = countCategories(currentSnapshot.jobs)
  const counts = uniqueCounts.map(item => ({
    ...item,
    count: countMode === 'unique' ? item.count : tagTotal(currentPeriod, item.name) ?? countSubCategoriesForMajor(currentSnapshot.jobs.filter(job => majorCategories(job).includes(item.name)), item.name, taxonomy).reduce((sum, row) => sum + row.count, 0),
  }))
  const selected = params.get('major') || counts[0]?.name || ''
  const selectedSub = params.get('sub') || ''
  const [subQuery, setSubQuery] = useState('')
  const [page, setPage] = useState(1)
  const majorJobs = selected ? currentSnapshot.jobs.filter(j => majorCategories(j).includes(selected)) : []
  const subCounts = countSubCategoriesForMajor(majorJobs, selected, taxonomy)
  const visibleSubs = subCounts.filter(item => item.name.toLowerCase().includes(subQuery.trim().toLowerCase()))
  const jobs = selectedSub ? majorJobs.filter(j => subCategoriesForMajor(j, selected, taxonomy).includes(selectedSub)) : majorJobs
  const pageSize = 40, pageCount = Math.max(1, Math.ceil(jobs.length / pageSize))
  const periodCount = (period: CategoryHistory['periods'][number], major: string) => selectedSub
    ? (period.sub_by_major?.[major]?.[selectedSub] ?? period.sub[selectedSub] ?? 0)
    : countMode === 'unique' ? (period.major[major] || 0) : (tagTotal(period, major) || 0)
  const trend = data.categoryHistory.periods.filter(item => item.period <= current).map(item => ({ month: item.period, total_open: periodCount(item, selected), new_count: null, closed_count: null }))
  const currentCount = currentPeriod ? periodCount(currentPeriod, selected) : selectedSub ? jobs.length : countMode === 'unique' ? majorJobs.length : subCounts.reduce((sum, item) => sum + item.count, 0)
  const previousCount = previousPeriod ? periodCount(previousPeriod, selected) : null
  const change = previousCount == null ? null : currentCount - previousCount
  const majorCurrent = currentPeriod?.major[selected] ?? majorJobs.length
  const majorPrevious = previousPeriod?.major[selected] ?? null
  const subCurrent = tagTotal(currentPeriod, selected) ?? subCounts.reduce((sum, item) => sum + item.count, 0)
  const subPrevious = tagTotal(previousPeriod, selected)
  const categoryChange = (kind: 'major' | 'sub', name: string, major = selected) => {
    if (!currentPeriod || !previousPeriod) return null
    if (kind === 'sub') return (currentPeriod.sub_by_major?.[major]?.[name] ?? currentPeriod.sub[name] ?? 0) - (previousPeriod.sub_by_major?.[major]?.[name] ?? previousPeriod.sub[name] ?? 0)
    return countMode === 'unique'
      ? (currentPeriod.major[name] || 0) - (previousPeriod.major[name] || 0)
      : (tagTotal(currentPeriod, name) || 0) - (tagTotal(previousPeriod, name) || 0)
  }
  const countUnit = countMode === 'tags' && !selectedSub ? '개' : '건'
  useEffect(() => { setPage(1); setSubQuery('') }, [selected, selectedSub, countMode])
  return <section className="category-page"><PageTitle eyebrow="JOB CATEGORY" title="직무별 채용" description="대분류에서 소분류를 선택하고 해당 직무의 변화와 공고를 확인하세요." />
    <div className="category-control-row"><ComparisonControl periods={periods} baseline={baseline} current={current} setBaseline={setBaseline} setCurrent={setCurrent} /><div className="count-mode-control"><span>대분류 집계</span><div className="segmented-control"><button className={countMode === 'unique' ? 'active' : ''} onClick={() => setCountMode('unique')}>고유 공고 기준</button><button className={countMode === 'tags' ? 'active' : ''} onClick={() => setCountMode('tags')}>직무 태그 기준</button></div></div></div>
    <div className="taxonomy-note"><b>{countMode === 'unique' ? '고유 공고 기준' : '직무 태그 기준'}</b><span>{countMode === 'unique' ? '한 공고를 대분류별 한 번만 집계합니다. 소분류는 복수 태그가 가능하므로 합계가 대분류와 다를 수 있습니다.' : '대분류 숫자를 소분류 태그의 합으로 표시합니다. 한 공고가 여러 직무에 포함되면 중복 집계됩니다.'}</span></div>
    <div className="category-browser">
      <aside className="major-rail"><div className="category-browser-title"><span>대분류 · {countMode === 'unique' ? '고유 공고' : '직무 태그'}</span><b>직무 선택</b></div><div className="major-list">{counts.map(x => { const delta = categoryChange('major', x.name); const previous = delta == null ? null : x.count - delta; const unit = countMode === 'unique' ? '건' : '개'; return <button className={selected === x.name ? 'active' : ''} onClick={() => setParams({ major: x.name })} key={x.name} title={`${x.name}: ${previous == null ? '비교 기준 없음' : `${previous.toLocaleString()} → `}${x.count.toLocaleString()}${unit}${delta == null ? '' : ` (${fmtChange(delta)})`}`}><span>{x.name}</span><span className="category-metric"><b>{x.count.toLocaleString()}{unit}</b><ChangeBadge value={delta} /></span></button> })}</div></aside>
      <div className="category-browser-content">
        <section className="subcategory-panel"><div className="category-browser-title"><span>소분류 · 중복 가능 태그</span><b>{selected} 세부 직무</b></div><label className="mini-search category-search"><Search size={17} /><input value={subQuery} onChange={event => setSubQuery(event.target.value)} placeholder="소분류 직무 검색" />{subQuery && <button onClick={() => setSubQuery('')} aria-label="검색어 지우기">×</button>}</label><div className="subcategory-list">{visibleSubs.map(x => { const delta = categoryChange('sub', x.name); const previous = delta == null ? null : x.count - delta; return <button className={selectedSub === x.name ? 'active' : ''} onClick={() => setParams({ major: selected, sub: x.name })} key={x.name} title={`${x.name} 직무 태그: ${previous == null ? '비교 기준 없음' : `${previous.toLocaleString()} → `}${x.count.toLocaleString()}개${delta == null ? '' : ` (${fmtChange(delta)})`}`}><span>{x.name}</span><span className="category-metric"><b>{x.count.toLocaleString()}개</b><ChangeBadge value={delta} /></span><ChevronRight size={16} /></button> })}{!visibleSubs.length && <p>검색 결과가 없습니다.</p>}</div><p className="category-overlap-note">각 숫자는 공고 수가 아니라 해당 공고에 붙은 직무 태그 수입니다.</p></section>
        <section className="category-trend-card"><div className="category-trend-head"><div><span>선택 직무 추이 · {selectedSub ? '소분류 공고' : countMode === 'unique' ? '고유 공고' : '직무 태그'}</span><h2>{selectedSub || selected}</h2></div><div><strong>{currentCount.toLocaleString()}{countUnit}</strong><small className={change != null && change < 0 ? 'down' : ''}>{change == null ? '비교 기준 없음' : `직전 기준일 대비 ${change > 0 ? '+' : ''}${change}${countUnit}`}</small></div></div><Trend history={{ months: trend }} /></section>
      </div>
    </div>
    <div className="category-reconciliation" aria-label={`${selected} 집계 단위 비교`}>
      <div><span>대분류 고유 공고</span><b>{majorPrevious == null ? '기준 없음' : majorPrevious.toLocaleString()} → {majorCurrent.toLocaleString()}건</b><ChangeBadge value={majorPrevious == null ? null : majorCurrent - majorPrevious} /></div>
      <div><span>소분류 태그 합계</span><b>{subPrevious == null ? '기준 없음' : subPrevious.toLocaleString()} → {subCurrent.toLocaleString()}개</b><ChangeBadge value={subPrevious == null ? null : subCurrent - subPrevious} /></div>
      <p>한 공고에 여러 소분류 태그가 붙을 수 있어 두 증감은 서로 같지 않을 수 있습니다. 예: 사운드 제작 -2, 대분류 고유 공고 -1은 서로 다른 집계 단위입니다.</p>
    </div>
    {selected && <><div className="section-heading compact"><div><span>SELECTED JOB</span><h2>{selectedSub || selected} 채용공고</h2></div><b>{jobs.length.toLocaleString()}건</b></div><JobCards jobs={jobs.slice((page - 1) * pageSize, page * pageSize)} detailed /><Pagination page={page} total={pageCount} setPage={setPage} /></>}
  </section>
}

function Companies({ data }: { data: Data }) {
  const periods = Object.keys(data.snapshots).sort()
  const [baseline, setBaseline] = useState(periods.at(-2) || periods[0] || '')
  const [current, setCurrent] = useState(periods.at(-1) || data.snapshot.period.slice(0, 7))
  const [mode, setMode] = useState<'legal'|'group'>('legal')
  const currentSnapshot = data.snapshots[current] || data.snapshot
  const previousSnapshot = data.snapshots[baseline]
  const comparison = compareSnapshots(currentSnapshot, previousSnapshot, data.companyGroups)
  const companyKey = (job:Job) => mode === 'group' ? companyGroupName(job.company, data.companyGroups) : job.company
  const companies = Object.entries(groupBy(currentSnapshot.jobs, companyKey)).sort((a, b) => b[1].length - a[1].length)
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const selectedCompany = companies.some(([name]) => name === selected) ? selected : companies[0]?.[0] || ''
  const filtered = companies.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
  const jobs = companies.find(x => x[0] === selectedCompany)?.[1] || []
  const profile = jobs[0]
  const rows = mode === 'group' ? comparison.by_company_group : comparison.by_company
  const companyChanges = new Map<string, number | null>(rows.map(row => [row.name, row.change]))
  const selectedChange = companyChanges.get(selectedCompany) ?? null
  const companyRow = rows.find(row => row.name === selectedCompany)
  const jobMix = countCategories(jobs).slice(0, 8)
  const memberNames = [...new Set(jobs.map(job => job.company))]
  const relatedNews = [...new Map(memberNames.flatMap(name => matchCompanyNews(name, data.report.news || [])).map(item => [item.url, item])).values()].slice(0, 5)
  const signals = current === data.report.current_period ? jobSignals(data.report) : {}
  return <section><PageTitle eyebrow="COMPANY DIRECTORY" title="회사별 채용" description="기업정보와 진행 중인 공고를 함께 확인하세요." count={companies.length} countLabel="개 회사" />
    <div className="directory-controls"><ComparisonControl periods={periods} baseline={baseline} current={current} setBaseline={setBaseline} setCurrent={setCurrent} /><div className="segmented-control" aria-label="회사 집계 기준"><button className={mode === 'legal' ? 'active' : ''} onClick={() => { setMode('legal'); setSelected('') }}>법인별</button><button className={mode === 'group' ? 'active' : ''} onClick={() => { setMode('group'); setSelected('') }}>그룹별</button></div></div>
    <div className="company-layout"><aside className="company-list"><label className="mini-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="회사 검색" /></label><div>{filtered.map(([name, items]) => <button onClick={() => setSelected(name)} className={name === selectedCompany ? 'active' : ''} key={name}><Logo name={name} url={items[0].logo_url} /><span><b>{name}</b><small>{mode === 'group' ? `${new Set(items.map(job => job.company)).size}개 법인·스튜디오` : items[0].representative_game || '대표게임 정보 없음'}</small></span><span className="company-list-metric"><strong>{items.length}</strong><ChangeBadge value={companyChanges.get(name) ?? null} /></span></button>)}</div></aside>
      {selectedCompany && <article className="company-detail"><div className="company-hero"><Logo name={selectedCompany} url={profile?.logo_url || null} /><div><span>{mode === 'group' ? 'COMPANY GROUP' : 'COMPANY PROFILE'}</span><h2>{selectedCompany}</h2><p>{mode === 'group' ? memberNames.join(' · ') : profile?.representative_game || '대표게임 정보 없음'}</p></div><div className="company-change"><small>{baseline} → {current}</small><ChangeBadge value={selectedChange} large /></div>{mode === 'legal' && profile?.company_url && <a className="outline-button" href={profile.company_url} target="_blank" rel="noreferrer">게임잡 기업정보 <ExternalLink size={15} /></a>}</div><div className="profile-grid"><Profile label={mode === 'group' ? '포함 법인' : '기업형태'} value={mode === 'group' ? `${memberNames.length}개` : profile?.company_type} /><Profile label="설립연도" value={mode === 'group' ? '그룹별 상이' : profile?.established_year} /><Profile label="사원수" value={mode === 'group' ? '법인별 상이' : profile?.employee_count} /><Profile label="진행 중인 공고" value={`${jobs.length}건`} highlight /><Profile wide label={mode === 'group' ? '포함 회사' : '대표게임'} value={mode === 'group' ? memberNames.join(', ') : profile?.representative_game} /><Profile wide label="주요사업" value={profile?.main_business} /></div>
      <div className="company-analysis-grid"><Panel eyebrow="HIRING MOMENTUM" title="채용 변화"><div className="company-kpi"><span>이전</span><b>{companyRow?.previous?.toLocaleString() ?? '-'}건</b><i /><span>현재</span><b>{companyRow?.current?.toLocaleString() ?? jobs.length.toLocaleString()}건</b></div><p>{selectedChange == null ? '비교 가능한 이전 데이터가 없습니다.' : `${baseline} 대비 ${fmtChange(selectedChange)} 변했습니다.`}</p></Panel><Panel eyebrow="JOB MIX" title="채용 직무 구성"><Bars rows={jobMix} /></Panel></div>
      <section className="company-news"><div className="section-heading compact"><div><span>NEWS SIGNAL</span><h2>관련 뉴스와 채용 시그널</h2></div></div>{relatedNews.length ? <NewsCards news={relatedNews} company={selectedCompany} change={selectedChange} /> : <Empty icon={Newspaper} title="연결된 뉴스가 없어요" text="확인된 뉴스가 없으므로 공고 변화의 원인을 추정하지 않습니다." />}</section>
      <div className="section-heading compact"><div><span>OPEN POSITIONS</span><h2>진행 중인 공고</h2></div><b>{jobs.length}건</b></div><JobCards jobs={jobs} detailed signals={signals} /></article>}
    </div>
  </section>
}

function Reports({ data }: { data: Data }) {
  const report = data.report
  const periods = Object.keys(data.snapshots).sort()
  const [baseline, setBaseline] = useState(report.baseline_period || periods.at(-2) || periods[0] || '')
  const [current, setCurrent] = useState(report.current_period || periods.at(-1) || data.snapshot.period.slice(0, 7))
  const officialPair = baseline === report.baseline_period && current === (report.current_period || report.period)
  const stats = compareSnapshots(data.snapshots[current] || data.snapshot, data.snapshots[baseline], data.companyGroups)
  const analysis = officialPair ? report.analysis : null
  const hasLegacyReport = officialPair && !analysis && report.status === 'complete' && Boolean(report.markdown)
  const hasReportContent = Boolean(analysis || hasLegacyReport)
  const jobMoves = movementRows(stats.by_category || [])
  const companyMoves = movementRows(stats.by_company || [])
  const careerMoves = movementRows(stats.by_career || [])
  const strongestJob = [...(stats.by_category || [])].filter(row => (row.change || 0) > 0).sort((a, b) => (b.change || 0) - (a.change || 0))[0]
  const strongestCompany = [...(stats.by_company || [])].filter(row => (row.change || 0) > 0).sort((a, b) => (b.change || 0) - (a.change || 0))[0]
  const emptyText = '이번 달 해설을 준비하고 있습니다. 통계와 그래프는 정상적으로 확인할 수 있습니다.'
  return <section><PageTitle eyebrow="MONTHLY INSIGHT" title="월간 리포트" description={`${current} 채용시장 분석을 확인하세요.`} />
    <ComparisonControl periods={periods} baseline={baseline} current={current} setBaseline={setBaseline} setCurrent={setCurrent} />
    <div className="report-hero"><div><FileText size={28} /><span>{!officialPair ? '선택 기간 통계 비교' : hasReportContent ? '분석 완료' : report.status === 'complete' ? '생성 결과 확인 필요' : '통계 공개 · 해설 준비 중'}</span><h2>{current.replace('-', '년 ')}월<br />게임업계 채용 리포트</h2><p>{analysis?.outlook || `${baseline} → ${current} 채용 변화를 비교합니다.`}</p>{officialPair && report.generated_at && <small className="report-generated">GPT 생성 {formatDateTime(report.generated_at)}</small>}</div><div className="report-downloads">{officialPair && report.pdf_path && <a className="primary-button" href={report.pdf_path} download><Download size={17} /> PDF 요약본</a>}{officialPair && report.markdown && <a className="outline-button light" href={`reports/${report.period}.md`} download>Markdown <ArrowUpRight size={16} /></a>}</div></div>
    {report.is_sample && <div className="status-strip warning">화면 검증용 예시 리포트입니다.</div>}
    {!officialPair && <div className="data-warning"><AlertCircle size={20} /><div><b>선택한 기간은 통계 비교 모드입니다.</b><p>GPT 시장 해설과 PDF 요약본은 최신 공식 비교 기간인 {report.comparison_label || `${report.baseline_period} → ${report.current_period}`}에만 제공됩니다.</p></div></div>}
    {analysis && <section className="monthly-conclusion"><div className="conclusion-main"><span>THIS MONTH'S VIEW</span><h2>이번 달의 결론</h2><p>{analysis.outlook}</p></div><div className="conclusion-points"><div><span>가장 강한 직무</span><b>{strongestJob?.name || '확인 필요'}</b><small>{strongestJob ? fmtChange(strongestJob.change) : '비교 데이터 없음'}</small></div><div><span>채용 확대 회사</span><b>{strongestCompany?.name || '확인 필요'}</b><small>{strongestCompany ? fmtChange(strongestCompany.change) : '비교 데이터 없음'}</small></div><div><span>다음 관찰 신호</span><b>{analysis.watchlist[0] || '다음 기간 데이터 확인'}</b></div></div></section>}
    <div className="report-kpis"><Kpi icon={BriefcaseBusiness} label="전체 공개 공고" value={`${(stats.total_open ?? 0).toLocaleString()}건`} sub={`전월 대비 ${fmtChange(stats.change)}`} primary /><Kpi icon={Sparkles} label="신규 공고" value={`${stats.new_count ?? '-'}건`} sub="이번 기간 새로 확인" /><Kpi icon={Clock3} label="종료 공고" value={`${stats.closed_count ?? '-'}건`} sub="이전 기간 대비 종료" /><Kpi icon={CheckCircle2} label="유지 공고" value={`${stats.maintained_count ?? '-'}건`} sub="두 기간 모두 확인" /></div>
    <div className="report-overview-grid"><Panel eyebrow="MARKET SIZE" title="전체 공고 비교"><ComparisonBars previous={stats.previous_total} current={stats.total_open} labels={[report.baseline_period || '이전 비교 데이터 없음', report.current_period || report.period]} /></Panel>{analysis ? <article className="analyst-summary"><span>ANALYST VIEW</span><h2>{analysis.outlook}</h2><p>{analysis.market_comment}</p><ul>{analysis.highlights.map(item => <li key={item}>{item}</li>)}</ul></article> : hasLegacyReport ? <article className="analyst-summary legacy"><span>ANALYST VIEW · 이전 형식</span><h2>생성된 시장 해설을 불러왔어요</h2><p>리포트 생성은 완료됐습니다. 아래에서 전체 해설을 확인할 수 있으며, 최신 구조로 다시 생성하면 카드형 분석으로 표시됩니다.</p></article> : report.status === 'complete' ? <Empty icon={AlertCircle} title="생성 결과 형식을 확인해 주세요" text="작업은 완료됐지만 해설 본문이 저장되지 않았습니다. 최신 Generate GPT Report - OpenAI 워크플로를 실행해 주세요." /> : <Empty icon={Sparkles} title="시장 해설을 준비하고 있어요" text={emptyText} />}</div>
    <div className="section-heading compact"><div><span>MOMENTUM CHARTS</span><h2>직무·회사·경력별 증감</h2></div><p>막대 길이는 전월 대비 변화량을 나타냅니다.</p></div>
    <div className="report-chart-grid"><Panel eyebrow="JOB MOMENTUM" title="직무 강세·약세"><DeltaBars rows={jobMoves.slice(0, 10)} /></Panel><Panel eyebrow="COMPANY MOVERS" title="회사별 주요 변동"><DeltaBars rows={companyMoves.slice(0, 10)} /></Panel><Panel eyebrow="CAREER MIX" title="경력별 변화"><DeltaBars rows={careerMoves.slice(0, 8)} /></Panel><Panel eyebrow="EMPLOYMENT MIX" title="고용형태 변화"><DeltaBars rows={movementRows(stats.by_employment_type || []).slice(0, 8)} /></Panel></div>
    {analysis ? <StructuredReport analysis={analysis} data={data} /> : null}
    {hasLegacyReport && report.markdown ? <Panel className="report-panel legacy-report" eyebrow="GENERATED REPORT" title="생성된 시장 해설"><article className="report"><ReportMarkdown markdown={report.markdown} /></article></Panel> : null}
    {officialPair && <ReportMethod report={report} />}
  </section>
}

function DataQuality({ data }: { data:Data }) {
  const quality = dataQuality(data.snapshot, data.categoryHistory.taxonomy || {}, data.report.statistics?.total_open)
  const periods = Object.keys(data.snapshots).sort()
  const failedSources = (data.status.sources || []).filter(source => source.status !== 'success')
  const groupRows = Object.entries(data.companyGroups.groups || {}).map(([name, detail]) => ({ name, members: detail.members.filter(member => data.snapshot.jobs.some(job => job.company.includes(member))) })).filter(row => row.members.length)
  const warnings = [
    quality.duplicateIds ? `중복 공고 ID ${quality.duplicateIds}건` : '',
    quality.noCategory ? `대분류 누락 ${quality.noCategory}건` : '',
    quality.otherCategory ? `기타 직무 분류 ${quality.otherCategory}건` : '',
    quality.reportMismatch ? `리포트와 최신 스냅샷 ${Math.abs(quality.reportMismatch)}건 차이` : '',
    failedSources.length ? `수집 실패·비활성 소스 ${failedSources.length}개` : '',
  ].filter(Boolean)
  return <section><PageTitle eyebrow="DATA RELIABILITY" title="데이터 품질 진단" description="채용 통계와 리포트가 어떤 상태인지 숫자로 확인하세요." />
    <div className="quality-hero"><div className={`quality-score ${quality.score >= 95 ? 'good' : quality.score >= 85 ? 'warn' : 'bad'}`}><span>DATA QUALITY SCORE</span><strong>{quality.score}</strong><small>/ 100</small></div><div><h2>{quality.score >= 95 ? '현재 데이터는 안정적이에요' : '확인이 필요한 데이터가 있어요'}</h2><p>중복, 분류 누락, 필드 완성도와 리포트 정합성을 기준으로 계산했습니다. 점수는 데이터 신뢰도 점검용이며 채용시장 자체의 품질을 의미하지 않습니다.</p></div></div>
    <div className="quality-grid"><QualityMetric label="중복 공고 ID" value={quality.duplicateIds} unit="건" ok={!quality.duplicateIds} /><QualityMetric label="대분류 누락" value={quality.noCategory} unit="건" ok={!quality.noCategory} /><QualityMetric label="기타 직무 분류" value={quality.otherCategory} unit="건" ok={!quality.otherCategory} /><QualityMetric label="지역 미확인" value={quality.missingLocation} unit="건" ok={!quality.missingLocation} /><QualityMetric label="경력 미확인" value={quality.missingCareer} unit="건" ok={!quality.missingCareer} /><QualityMetric label="고용형태 미확인" value={quality.missingEmployment} unit="건" ok={!quality.missingEmployment} /></div>
    <div className="quality-columns"><Panel eyebrow="AUTOMATED CHECK" title="자동 진단 결과">{warnings.length ? <ul className="quality-warnings">{warnings.map(item => <li key={item}><AlertCircle size={15} />{item}</li>)}</ul> : <div className="quality-ok"><CheckCircle2 size={24} /><div><b>중요한 정합성 오류가 없습니다.</b><p>최신 스냅샷과 리포트의 전체 공고 수도 일치합니다.</p></div></div>}<dl className="quality-details"><div><dt>최신 스냅샷</dt><dd>{data.snapshot.period} · {data.snapshot.jobs.length.toLocaleString()}건</dd></div><div><dt>보유 월간 데이터</dt><dd>{periods.length}개 · {periods.join(', ')}</dd></div><div><dt>수집 완료</dt><dd>{formatDateTime(data.status.finished_at)}</dd></div><div><dt>GPT 리포트</dt><dd>{data.report.status}{data.report.generated_at ? ` · ${formatDateTime(data.report.generated_at)}` : ''}</dd></div><div><dt>뉴스 근거</dt><dd>{(data.report.news || []).length.toLocaleString()}건</dd></div></dl></Panel>
      <Panel eyebrow="ENTITY NORMALIZATION" title="회사 그룹 매핑"><p className="panel-description">법인별 수치를 보존하면서 그룹 보기에서만 아래 명칭을 합산합니다.</p><div className="group-map-list">{groupRows.map(row => <div key={row.name}><b>{row.name}</b><span>{row.members.join(' · ')}</span></div>)}</div></Panel></div>
    {quality.unknownSubs.length ? <div className="data-warning"><AlertCircle size={20} /><div><b>분류표에 없는 소분류가 있습니다.</b><p>{quality.unknownSubs.join(', ')}</p></div></div> : null}
  </section>
}

function QualityMetric({ label, value, unit, ok }: {label:string;value:number;unit:string;ok:boolean}) {
  return <article className={`quality-metric${ok ? ' ok' : ''}`}><span>{label}</span><strong>{value.toLocaleString()}<small>{unit}</small></strong><b>{ok ? '정상' : '확인 필요'}</b></article>
}

function StructuredReport({ analysis, data }: { analysis: NonNullable<Report['analysis']>; data:Data }) {
  const jobs = new Map(data.snapshot.jobs.map(job => [job.id, job]))
  const news = new Map((data.report.news || []).map(item => [item.url, item]))
  const companyStats = new Map<string, {current:number;previous:number|null;change:number|null}>((data.report.statistics?.by_company || []).map((row:{name:string;current:number;previous:number|null;change:number|null}) => [row.name, row]))
  const evidenceCounts = ['직접 근거', '관련 가능성', '근거 부족'].map(level => ({ level, count: analysis.news_signals.filter(item => item.evidence_level === level).length }))
  return <>
    <div className="section-heading compact"><div><span>JOB SIGNAL</span><h2>직무별 애널리스트 해설</h2></div></div>
    <div className="insight-grid">{analysis.job_insights.map(item => <article className="insight-card" key={`${item.name}-${item.direction}`}><div><span>{item.name}</span><b className={item.direction === '강세' ? 'positive' : item.direction === '약세' ? 'negative' : 'neutral'}>{item.direction}</b></div><p>{item.comment}</p></article>)}</div>

    <div className="section-heading compact"><div><span>COMPANY MOMENTUM</span><h2>주요 회사 채용 변화</h2></div></div>
    <div className="company-insight-grid">{analysis.company_insights.map(item => {
      const stat = companyStats.get(item.name)
      const linkedJobs = item.job_ids.map(id => jobs.get(id)).filter(Boolean) as Job[]
      const linkedNews = item.news_urls.map(url => news.get(url)).filter(Boolean) as NonNullable<Report['news']>
      return <article className="company-insight-card" key={item.name}><header><div><span>{item.direction} · {item.evidence_level}</span><h3>{item.name}</h3></div><ChangeBadge value={stat?.change ?? null} large /></header><p>{item.comment}</p><div className="source-links">{linkedJobs.map(job => <a href={job.url} target="_blank" rel="noreferrer" key={job.id}><BriefcaseBusiness size={14} />{job.title}<ArrowUpRight size={13} /></a>)}{linkedNews.map(article => <a href={article.url} target="_blank" rel="noreferrer" key={article.url}><Newspaper size={14} />{article.title}<ArrowUpRight size={13} /></a>)}</div></article>
    })}</div>

    <div className="section-heading compact"><div><span>NEWS & HIRING SIGNAL</span><h2>뉴스와 채용 변화</h2></div><b>{analysis.news_signals.length}개 주요 신호</b></div>
    {analysis.news_signals.length ? <><div className="evidence-overview"><div><b>근거 강도</b><span>채용 발표처럼 직접 연결된 경우만 가장 높은 단계로 표시합니다.</span></div>{evidenceCounts.map(item => <div className={`evidence-count ${item.level === '직접 근거' ? 'confirmed' : item.level === '관련 가능성' ? 'possible' : 'weak'}`} key={item.level}><span>{item.level}</span><b>{item.count}건</b></div>)}</div><div className="signal-grid">{analysis.news_signals.map((signal, index) => <article className="signal-card" key={`${signal.company}-${index}`}><div><span>{signal.company || '업계'}</span><b className={`evidence ${signal.evidence_level === '직접 근거' ? 'confirmed' : signal.evidence_level === '관련 가능성' ? 'possible' : ''}`}>{signal.evidence_level}</b></div><h3>{signal.headline}</h3><p>{signal.comment}</p><EvidenceScale level={signal.evidence_level} /><div className="source-links">{signal.news_urls.map(url => { const article = news.get(url); return article ? <a href={url} target="_blank" rel="noreferrer" key={url}><Newspaper size={14} />{article.title}<ArrowUpRight size={13} /></a> : null })}</div></article>)}</div></> : <div className="data-warning"><AlertCircle size={20} /><div><b>채용 변화와 연결할 주요 뉴스가 없습니다.</b><p>근거가 부족한 원인은 추정하지 않습니다.</p></div></div>}

    <div className="report-bottom-grid"><article className="watch-card"><span>NEXT WATCHLIST</span><h2>다음 기간 관찰 포인트</h2><ol>{analysis.watchlist.map(item => <li key={item}>{item}</li>)}</ol></article><details className="limitations-card"><summary>데이터 한계와 해석 주의사항</summary><ul>{analysis.limitations.map(item => <li key={item}>{item}</li>)}</ul></details></div>
  </>
}

function EvidenceScale({ level }: { level:'직접 근거'|'관련 가능성'|'근거 부족' }) {
  const active = level === '직접 근거' ? 3 : level === '관련 가능성' ? 2 : 1
  return <div className={`evidence-scale level-${active}`} aria-label={`뉴스와 채용 연결 근거: ${level}`}><div>{['근거 부족', '관련 가능성', '직접 근거'].map((label, index) => <span className={index + 1 <= active ? 'active' : ''} key={label}><i />{label}</span>)}</div><p>{level === '직접 근거' ? '직접적인 채용 발표와 공고 변화가 일치합니다.' : level === '관련 가능성' ? '회사·프로젝트·시점이 연결되지만 인과는 확인되지 않았습니다.' : '같은 회사의 소식만으로 채용 변화의 원인을 판단하지 않습니다.'}</p></div>
}

function ReportMethod({ report }: { report: Report }) {
  const method = report.methodology
  if (!method) return null
  const e = method.evidence
  return <section className="method-card"><div className="method-heading"><div><span>ANALYSIS TRANSPARENCY</span><h2>분석 근거와 작성 기준</h2></div><b>프롬프트 {method.prompt_version}</b></div>
    <div className="evidence-grid"><div><span>비교 기간</span><b>{e.baseline_period || '기준 없음'} → {e.current_period || report.period}</b></div><div><span>오픈 공고</span><b>{e.previous_open_jobs?.toLocaleString() || '-'}건 → {e.current_open_jobs?.toLocaleString() || '-'}건</b></div><div><span>AI에 전달한 근거</span><b>공고 {e.job_examples_sent} · 뉴스 {e.news_sent_to_model}</b></div><div><span>뉴스 검토 범위</span><b>{e.news_date_from || '-'} ~ {e.news_date_to || '-'}</b></div></div>
    <p className="input-description">{method.input_description}</p><ul>{method.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
    <details><summary>GPT에 전달하는 전체 프롬프트 보기</summary><pre>{method.system_prompt}</pre></details>
  </section>
}

function ReportMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\bnull\b/gi, '비교 데이터 없음').replace(/\\([*|`#])/g, '$1').split('\n')
  const blocks: React.ReactNode[] = []
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim()
    if (line.startsWith('|') && lines[index + 1]?.trim().match(/^\|?[\s:|-]+\|?$/)) {
      const rows:string[][] = []
      const headers = splitTableRow(line)
      index += 2
      while (index < lines.length && lines[index].trim().startsWith('|')) rows.push(splitTableRow(lines[index++]))
      blocks.push(<div className="report-table-wrap" key={`table-${index}`}><table><thead><tr>{headers.map((cell, i) => <th key={i}>{renderInline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{renderInline(cell)}</td>)}</tr>)}</tbody></table></div>)
      continue
    }
    index += 1
    if (!line) continue
    const content = line.startsWith('### ') ? line.slice(4) : line.startsWith('## ') ? line.slice(3) : line.startsWith('# ') ? line.slice(2) : line.startsWith('> ') ? line.slice(2) : line.replace(/^[-*•]\s+/, '')
    const rendered = renderInline(content)
    if (line.startsWith('### ')) blocks.push(<h4 key={index}>{rendered}</h4>)
    else if (line.startsWith('## ')) blocks.push(<h3 key={index}>{rendered}</h3>)
    else if (line.startsWith('# ')) blocks.push(<h2 key={index}>{rendered}</h2>)
    else if (line.startsWith('> ')) blocks.push(<blockquote key={index}>{rendered}</blockquote>)
    else if (/^[-*•]\s+/.test(line)) blocks.push(<p className="report-bullet" key={index}>• {rendered}</p>)
    else blocks.push(<p key={index}>{rendered}</p>)
  }
  return <>{blocks}</>
}

function renderInline(text: string) {
  const pattern = /\[([^\]]+)]\((https?:\/\/[^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g
  const nodes: React.ReactNode[] = []
  let cursor = 0, match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    if (match[1]) nodes.push(<a href={match[2]} target="_blank" rel="noreferrer" key={`${match.index}-${match[2]}`}>{match[1]}</a>)
    else if (match[3]) nodes.push(<strong key={`strong-${match.index}`}>{match[3]}</strong>)
    else nodes.push(<code key={`code-${match.index}`}>{match[4]}</code>)
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function splitTableRow(line:string) { return line.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim()) }

function ComparisonControl({ periods, baseline, current, setBaseline, setCurrent }: {periods:string[];baseline:string;current:string;setBaseline:(value:string)=>void;setCurrent:(value:string)=>void}) {
  return <div className="comparison-control"><div><Database size={17} /><span>비교 기간</span></div><label><small>이전</small><select value={baseline} onChange={event => setBaseline(event.target.value)}>{periods.filter(period => period < current).map(period => <option key={period}>{period}</option>)}</select></label><i>→</i><label><small>현재</small><select value={current} onChange={event => setCurrent(event.target.value)}>{periods.filter(period => period > baseline).map(period => <option key={period}>{period}</option>)}</select></label><b>{baseline} 대비 {current}</b></div>
}

function PageTitle({ eyebrow, title, description, count, countLabel = '개 공고' }: { eyebrow: string; title: string; description: string; count?: number; countLabel?: string }) {
  return <div className="page-title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{count !== undefined && <div className="page-count"><strong>{count.toLocaleString()}</strong><span>{countLabel}</span></div>}</div>
}

function Kpi({ icon: Icon, label, value, sub, primary = false }: { icon: typeof BriefcaseBusiness; label: string; value: string; sub: string; primary?: boolean }) {
  return <div className={`kpi${primary ? ' primary' : ''}`}><div><span>{label}</span><Icon size={19} /></div><strong>{value}</strong><small>{sub}</small></div>
}

function Panel({ eyebrow, title, children, className = '' }: { eyebrow?: string; title?: string; children: React.ReactNode; className?: string }) {
  return <div className={`panel ${className}`}>{title && <div className="panel-title">{eyebrow && <span>{eyebrow}</span>}<h3>{title}</h3></div>}{children}</div>
}

function Trend({ history }: { history: History }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [range, setRange] = useState(6)
  const gradientId = `trend-fill-${useId().replace(/:/g, '')}`
  if (!history.months.length) return <Empty title="아직 추이 데이터가 없어요" text="다음 월간 스냅샷부터 변화가 표시돼요." />
  const months = history.months.slice(-Math.min(range, history.months.length))
  const values = months.map(row => row.total_open)
  const min = Math.min(...values), max = Math.max(...values), spread = Math.max(1, max - min)
  const floor = Math.max(0, min - spread * .35), ceiling = max + spread * .25
  const plotLeft = 58, plotRight = 730, plotWidth = plotRight - plotLeft
  const x = (index:number) => plotLeft + index * (plotWidth / Math.max(1, values.length - 1))
  const y = (value:number) => 22 + (ceiling - value) / Math.max(1, ceiling - floor) * 200
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  const area = `${plotLeft},222 ${points} ${x(values.length - 1)},222`
  const gridValues = [0, 1, 2, 3].map(index => Math.round(floor + (ceiling - floor) * index / 3)).reverse()
  const active = activeIndex == null ? null : months[activeIndex]
  const hitWidth = plotWidth / Math.max(1, values.length - 1)
  return <div className="trend-shell">{history.months.length > 3 && <div className="trend-range">{[3, 6, 12].filter(value => value <= history.months.length || value === 6).map(value => <button className={range === value ? 'active' : ''} onClick={() => { setRange(value); setActiveIndex(null) }} key={value}>{value}개월</button>)}</div>}<div className="chart interactive-chart" onMouseLeave={() => setActiveIndex(null)}><svg className="trend-svg" viewBox="0 0 760 270" preserveAspectRatio="xMidYMid meet" role="img" aria-label="월별 채용공고 추이"><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3182f6" stopOpacity=".3" /><stop offset="1" stopColor="#3182f6" stopOpacity="0" /></linearGradient></defs>{gridValues.map(value => <g key={value}><line x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)} /><text x="0" y={y(value) + 4}>{value.toLocaleString()}</text></g>)}<polygon points={area} fill={`url(#${gradientId})`} /><polyline points={points} /><g>{months.map((row, index) => <g key={row.month}><circle className={activeIndex === index ? 'active' : ''} cx={x(index)} cy={y(row.total_open)} r={activeIndex === index ? 7 : 5} /><text className="x-label" x={x(index)} y="252" textAnchor={index === 0 ? 'start' : index === months.length - 1 ? 'end' : 'middle'}>{row.month}</text><rect className="trend-hit-box" x={values.length === 1 ? plotLeft : Math.max(plotLeft, x(index) - hitWidth / 2)} y="0" width={values.length === 1 ? plotWidth : Math.min(hitWidth, plotRight - Math.max(plotLeft, x(index) - hitWidth / 2))} height="230" tabIndex={0} aria-label={`${row.month} 오픈 공고 ${row.total_open.toLocaleString()}건`} onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} onBlur={() => setActiveIndex(null)} /></g>)}</g>{activeIndex != null && <line className="trend-guide" x1={x(activeIndex)} x2={x(activeIndex)} y1="12" y2="222" />}</svg>{active && <div className={`chart-tooltip${activeIndex === 0 ? ' edge-left' : activeIndex === values.length - 1 ? ' edge-right' : ''}`} style={{ left: `${x(activeIndex!) / 760 * 100}%` }}><b>{active.month}</b><strong>오픈 공고 {active.total_open.toLocaleString()}건</strong>{active.new_count != null && <span>신규 {active.new_count.toLocaleString()}건</span>}{active.closed_count != null && <span>종료 {active.closed_count.toLocaleString()}건</span>}</div>}</div></div>
}

function RankList({ rows, to }: { rows: { name: string; count: number; description?: string | null }[]; to: string }) {
  return <div className="rank-list">{rows.map((row, i) => <NavLink to={to} key={row.name}><em>{i + 1}</em><span><b>{row.name}</b>{row.description && <small>{row.description}</small>}</span><strong>{row.count.toLocaleString()}</strong><ChevronRight size={16} /></NavLink>)}</div>
}

function Bars({ rows }: { rows: { name: string; count: number }[] }) {
  const max = rows[0]?.count || 1
  return <div className="bars">{rows.map(row => <div key={row.name}><span>{row.name}</span><div><i style={{ width: `${row.count / max * 100}%` }} /></div><b>{row.count.toLocaleString()}</b></div>)}</div>
}

function DeltaBars({ rows }: { rows: { name:string;change:number|null;current:number;previous:number|null }[] }) {
  const max = Math.max(1, ...rows.map(row => Math.abs(row.change || 0)))
  return <div className="delta-bars">{rows.map(row => <div className="tooltip-row" tabIndex={0} key={row.name}><span title={row.name}>{row.name}</span><div className="delta-track"><i className={(row.change || 0) >= 0 ? 'up' : 'down'} style={{ width: `${Math.max(3, Math.abs(row.change || 0) / max * 100)}%` }} /></div><ChangeBadge value={row.change} /><span className="bar-tooltip"><b>{row.name}</b><em>{row.previous == null ? '이전 기준 없음' : `${row.previous.toLocaleString()}건 → `}{row.current.toLocaleString()}건</em><strong>{fmtChange(row.change)}</strong></span></div>)}</div>
}

function ComparisonBars({ previous, current, labels }: { previous:number|null;current:number;labels:[string,string] }) {
  const max = Math.max(previous || 0, current || 0, 1)
  return <div className="comparison-bars">{[[labels[0], previous], [labels[1], current]].map(([label, value], index) => <div className="tooltip-row" tabIndex={0} key={String(label)}><span>{label}</span><div><i className={index ? 'current' : ''} style={{ width: `${Number(value || 0) / max * 100}%` }} /></div><b>{value == null ? '-' : Number(value).toLocaleString()}건</b><span className="bar-tooltip"><b>{label}</b><strong>{value == null ? '비교 데이터 없음' : `${Number(value).toLocaleString()}건`}</strong></span></div>)}</div>
}

function NewsCards({ news, company, change }: { news:NonNullable<Report['news']>;company?:string;change?:number|null }) {
  return <div className="news-grid">{news.map(item => <a className="news-card" href={item.url} target="_blank" rel="noreferrer" key={item.url}><div><span>{item.issue_type || '업계뉴스'}</span><time>{item.published_at || '날짜 미확인'}</time></div><h3>{item.title}</h3><p>{item.summary || '원문에서 자세한 내용을 확인하세요.'}</p>{company && <small>{company} 공고 {fmtChange(change ?? null)} · 뉴스와의 인과는 원문 확인 필요</small>}<b>{item.source} <ArrowUpRight size={14} /></b></a>)}</div>
}

function JobCards({ jobs, detailed = false, signals = {} }: { jobs: Job[]; detailed?: boolean; signals?:Record<string,string[]> }) {
  return <div className={`job-list${detailed ? ' detailed' : ''}`}>{jobs.map(job => <a className="job-card" href={job.url} target="_blank" rel="noreferrer" key={job.id}><div className="job-company"><Logo name={job.company} url={job.logo_url} /><span><b>{job.company}</b><small>{job.representative_game || '대표게임 정보 없음'}</small></span>{signals[job.id]?.length ? <div className="job-signals">{signals[job.id].map(signal => <em className={signal === '재게시' ? 'repost' : ''} key={signal}>{signal}</em>)}</div> : null}</div><div className="job-content"><h3>{job.title}</h3><div className="tags">{majorCategories(job).map(category => <span key={category}>{category}</span>)}{subCategories(job).slice(0, 3).map(category => <span className="subtag" key={category}>{category}</span>)}</div><div className="job-meta"><span><BriefcaseBusiness size={14} />{job.career || '경력 미확인'}</span><span><MapPin size={14} />{job.location || '지역 미확인'}</span><span><CalendarDays size={14} />{job.always_open ? '상시채용' : job.deadline || '마감일 미확인'}</span></div></div><span className="open-icon"><ArrowUpRight size={18} /></span></a>)}</div>
}

function Pagination({ page, total, setPage }: { page:number; total:number; setPage:(page:number)=>void }) {
  if (total <= 1) return null
  const pages = pageWindow(page, total)
  const move = (next:number) => { setPage(Math.max(1, Math.min(total, next))); window.scrollTo({ top: 180, behavior: 'smooth' }) }
  return <nav className="pagination" aria-label="공고 페이지 이동"><button onClick={() => move(1)} disabled={page === 1} aria-label="첫 페이지"><ChevronsLeft size={18} /></button><button onClick={() => move(page - 1)} disabled={page === 1} aria-label="이전 페이지"><ChevronLeft size={18} /></button>{pages.map(number => <button className={number === page ? 'active' : ''} onClick={() => move(number)} aria-current={number === page ? 'page' : undefined} key={number}>{number}</button>)}<button onClick={() => move(page + 1)} disabled={page === total} aria-label="다음 페이지"><ChevronRight size={18} /></button><button onClick={() => move(total)} disabled={page === total} aria-label="마지막 페이지"><ChevronsRight size={18} /></button><span>{page} / {total}</span></nav>
}

function Profile({ label, value, wide = false, highlight = false }: { label: string; value?: string | null; wide?: boolean; highlight?: boolean }) {
  return <div className={`${wide ? 'wide ' : ''}${highlight ? 'highlight' : ''}`}><span>{label}</span><b>{value || '정보 없음'}</b></div>
}

function ChangeBadge({ value, large = false }: { value:number|null; large?:boolean }) {
  if (value == null) return <span className={`change-badge neutral${large ? ' large' : ''}`}>기준 없음</span>
  if (value === 0) return <span className={`change-badge neutral${large ? ' large' : ''}`}>— 0</span>
  return <span className={`change-badge ${value > 0 ? 'up' : 'down'}${large ? ' large' : ''}`}>{value > 0 ? '▲' : '▼'} {Math.abs(value).toLocaleString()}</span>
}

function Select({ value, set, label, values }: { value: string; set: (value: string) => void; label: string; values: (string | null)[] }) {
  return <select value={value} onChange={e => set(e.target.value)}><option value="">{label}</option>{[...new Set(values.filter(Boolean) as string[])].sort().map(v => <option key={v}>{v}</option>)}</select>
}

function Logo({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false)
  return url && !failed ? <img className="logo" src={url.replaceAll('\\', '/')} alt={`${name} 로고`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className="logo fallback">{name.slice(0, 1)}</span>
}

function Empty({ title, text, icon: Icon }: { title: string; text: string; icon?: typeof FileText }) {
  return <div className="empty">{Icon && <span><Icon size={26} /></span>}<b>{title}</b><p>{text}</p></div>
}

function countCategories(jobs: Job[]) {
  const counts: Record<string, number> = {}
  jobs.forEach(job => majorCategories(job).forEach(category => { counts[category] = (counts[category] || 0) + 1 }))
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function countSubCategories(jobs: Job[]) {
  const counts: Record<string, number> = {}
  jobs.forEach(job => subCategories(job).forEach(category => { counts[category] = (counts[category] || 0) + 1 }))
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function countSubCategoriesForMajor(jobs:Job[], major:string, taxonomy:Record<string,string[]>) {
  const counts:Record<string,number> = {}
  jobs.forEach(job => subCategoriesForMajor(job, major, taxonomy).forEach(category => { counts[category] = (counts[category] || 0) + 1 }))
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function majorCategories(job: Job) { return job.job_major_categories?.length ? job.job_major_categories : job.categories }
function subCategories(job: Job) { return job.job_subcategories?.length ? job.job_subcategories : job.original_categories }
function subCategoriesForMajor(job:Job, major:string, taxonomy:Record<string,string[]>) {
  const allowed = new Set(taxonomy[major] || [])
  return subCategories(job).filter(value => allowed.has(value))
}

function movementRows(rows:{name:string;current:number;previous:number|null;change:number|null}[]) {
  return [...rows].filter(row => row.change != null).sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0))
}

function matchCompanyNews(company:string, news:NonNullable<Report['news']>) {
  const needle = company.replace(/\(주\)|㈜|주식회사|\s/g, '').toLowerCase()
  return news.filter(item => `${item.title} ${item.summary || ''} ${(item.companies || []).join(' ')}`.replace(/\s/g, '').toLowerCase().includes(needle))
}

function jobSignals(report:Report) {
  const result:Record<string,string[]> = {}
  for (const id of report.statistics?.new_ids || []) (result[id] ||= []).push('신규')
  for (const row of report.statistics?.reposted || []) (result[row.current_id] ||= []).push('재게시')
  return result
}

function splitValues(value:string|null) { return (value || '').split(',').map(item => item.trim()).filter(Boolean) }

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((result, item) => { (result[getKey(item)] ??= []).push(item); return result }, {})
}

function downloadJobsCsv(jobs:Job[]) {
  const safe = (value:unknown) => {
    const text = String(value ?? '').replaceAll('"', '""')
    const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text
    return `"${guarded}"`
  }
  const headers = ['공고 ID','회사','공고명','대분류','소분류','경력','고용형태','지역','등록일','마감일','URL']
  const rows = jobs.map(job => [job.id, job.company, job.title, majorCategories(job).join(' / '), subCategories(job).join(' / '), job.career, job.employment_type, job.location, job.posted_at, job.always_open ? '상시채용' : job.deadline, job.url])
  const csv = '\ufeff' + [headers, ...rows].map(row => row.map(safe).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `gamejob-openings-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function fmtChange(value: number | null) { return value == null ? '기준 없음' : `${value > 0 ? '+' : ''}${value.toLocaleString()}건` }
function formatDate(value: string) { return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) }
function formatDateTime(value: string) { return new Date(value).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

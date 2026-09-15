import { useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ArrowUpRight, BarChart3, BriefcaseBusiness, Building2, CalendarDays,
  CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock3, ExternalLink, FileText, LayoutDashboard,
  MapPin, Search, Sparkles, TrendingUp, UsersRound,
} from 'lucide-react'
import { loadAll } from './data'
import { pageWindow } from './pagination'
import type { CategoryHistory, History, Job, Report, Snapshot, Status } from './types'

type Data = { snapshot: Snapshot; history: History; categoryHistory: CategoryHistory; report: Report; status: Status }
const nav = [
  ['/', '대시보드', LayoutDashboard], ['/jobs', '채용공고', BriefcaseBusiness],
  ['/categories', '직무별', BarChart3], ['/companies', '회사별', Building2],
  ['/reports', '월간 리포트', FileText],
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
        <Route path="/jobs" element={<Jobs jobs={data.snapshot.jobs} />} />
        <Route path="/categories" element={<Categories data={data} />} />
        <Route path="/companies" element={<Companies data={data} />} />
        <Route path="/reports" element={<Reports report={data.report} />} />
      </Routes>
    </main>
    <footer className="site-footer">© KONGSTUDIOS. All rights reserved.</footer>
    <MobileNav />
  </div>
}

function Header({ data }: { data: Data }) {
  return <header className="topbar"><div className="topbar-inner">
    <NavLink className="brand" to="/">게임잡 채용 데이터</NavLink>
    <nav className="desktop-nav">{nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
    <div className="freshness"><i className={data.status.success ? 'ok' : ''} /><span>{formatDate(data.snapshot.collected_at)} 기준</span>{data.snapshot.is_sample && <b>예시</b>}</div>
  </div></header>
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

  return <section className="dashboard">
    <div className="hero">
      <div className="hero-copy"><span className="eyebrow"><Sparkles size={14} /> GAME INDUSTRY TALENT SIGNAL</span><h1>게임업계 채용 흐름,<br /><em>쉽고 빠르게</em> 확인하세요</h1><p>게임잡의 공개 채용공고를 매일 모아 회사와 직무의 변화를 한눈에 보여드려요.</p><div className="hero-actions"><NavLink className="primary-button" to="/jobs">채용공고 살펴보기 <ArrowUpRight size={18} /></NavLink><span><CheckCircle2 size={16} /> 실제 수집 데이터</span></div></div>
      <div className="hero-visual"><div className="pulse-card"><span>현재 채용 중</span><strong>{jobs.length.toLocaleString()}</strong><small>개의 게임업계 공고</small><div className="pulse-line"><i /><i /><i /><i /><i /><i /><i /></div><p><span /> 매일 오전 9시 업데이트</p></div><div className="floating-stat"><TrendingUp size={19} /><div><b>{topCategory?.name || '분류 없음'}</b><span>가장 많이 찾는 직무</span></div></div></div>
    </div>

    <div className="status-strip"><div><CheckCircle2 size={18} /><b>{data.status.success ? '데이터가 최신 상태예요' : '수집 상태를 확인해 주세요'}</b></div><span>{data.status.message || `마지막 정상 수집 ${formatDate(data.snapshot.collected_at)}`}</span></div>

    <div className="section-heading"><div><span>MARKET SNAPSHOT</span><h2>지금 채용시장을 숫자로 볼까요?</h2></div><p>동일 공고는 고유번호를 기준으로 한 번만 집계해요.</p></div>
    <div className="kpis">
      <Kpi icon={BriefcaseBusiness} label="현재 오픈 공고" value={`${jobs.length.toLocaleString()}건`} sub={`전월 대비 ${fmtChange(stats.change)}`} primary />
      <Kpi icon={Sparkles} label="신규 공고" value={`${stats.new_count ?? '-'}건`} sub={data.report.comparison_label || '이번 공식 스냅샷'} />
      <Kpi icon={Clock3} label="종료 공고" value={`${stats.closed_count ?? '-'}건`} sub={data.report.baseline_period ? `${data.report.baseline_period} 기준` : '이전 공고 기준'} />
      <Kpi icon={UsersRound} label="채용 중인 회사" value={`${companies.toLocaleString()}개`} sub="회사명 중복 제거" />
      <Kpi icon={BarChart3} label="최다 채용 직무" value={topCategory?.name || '-'} sub={`${topCategory?.count.toLocaleString() || 0}건`} />
    </div>

    <div className="dashboard-grid">
      <Panel className="trend-panel" eyebrow="HIRING TREND" title="오픈 공고 추이"><Trend history={data.history} /></Panel>
      <Panel eyebrow="TOP COMPANIES" title="채용이 활발한 회사"><RankList rows={companyRanks.slice(0, 8)} to="/companies" /></Panel>
      <Panel eyebrow="TOP JOBS" title="수요가 높은 직무"><RankList rows={categories.slice(0, 8)} to="/categories" /></Panel>
    </div>

    <div className="section-heading compact"><div><span>NEW OPENINGS</span><h2>최근 등록된 공고</h2></div><NavLink to="/jobs">전체 공고 보기 <ChevronRight size={17} /></NavLink></div>
    <JobCards jobs={recentJobs} />
  </section>
}

function Jobs({ jobs }: { jobs: Job[] }) {
  const [params] = useSearchParams()
  const [q, setQ] = useState(''), [company, setCompany] = useState('')
  const [major, setMajor] = useState(params.get('major') || ''), [sub, setSub] = useState(params.get('sub') || '')
  const [career, setCareer] = useState(''), [location, setLocation] = useState(''), [employment, setEmployment] = useState('')
  const [sort, setSort] = useState('latest'), [page, setPage] = useState(1)
  const list = useMemo(() => jobs.filter(j =>
    (!q || `${j.title} ${j.company} ${majorCategories(j).join(' ')} ${subCategories(j).join(' ')}`.toLowerCase().includes(q.toLowerCase())) &&
    (!company || j.company === company) && (!major || majorCategories(j).includes(major)) && (!sub || subCategories(j).includes(sub)) &&
    (!career || j.career === career) && (!location || j.location === location) &&
    (!employment || j.employment_type === employment)
  ).sort((a, b) => sort === 'deadline'
    ? (a.deadline || '9999').localeCompare(b.deadline || '9999')
    : (b.posted_at || '').localeCompare(a.posted_at || '')), [jobs, q, company, major, sub, career, location, employment, sort])

  useEffect(() => setPage(1), [q, company, major, sub, career, location, employment, sort])
  useEffect(() => { if (sub && !jobs.some(j => (!major || majorCategories(j).includes(major)) && subCategories(j).includes(sub))) setSub('') }, [jobs, major, sub])
  const clear = () => { setQ(''); setCompany(''); setMajor(''); setSub(''); setCareer(''); setLocation(''); setEmployment('') }
  const hasFilter = Boolean(q || company || major || sub || career || location || employment)
  const pageSize = 40, pageCount = Math.max(1, Math.ceil(list.length / pageSize))
  const pagedJobs = list.slice((page - 1) * pageSize, page * pageSize)
  const availableSubs = jobs.filter(j => !major || majorCategories(j).includes(major)).flatMap(subCategories)
  return <section>
    <PageTitle eyebrow="OPEN POSITIONS" title="채용공고" description="원하는 회사와 직무를 빠르게 찾아보세요." count={list.length} />
    <div className="filter-card"><label className="search-box"><Search size={20} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="회사명, 공고명 또는 직무 검색" /></label><div className="filter-row"><Select value={company} set={setCompany} label="전체 회사" values={jobs.map(j => j.company)} /><Select value={major} set={setMajor} label="전체 대분류" values={jobs.flatMap(majorCategories)} /><Select value={sub} set={setSub} label="전체 소분류" values={availableSubs} /><Select value={career} set={setCareer} label="전체 경력" values={jobs.map(j => j.career)} /><Select value={location} set={setLocation} label="전체 지역" values={jobs.map(j => j.location)} /><Select value={employment} set={setEmployment} label="전체 고용형태" values={jobs.map(j => j.employment_type)} /><select value={sort} onChange={e => setSort(e.target.value)}><option value="latest">최신 등록순</option><option value="deadline">마감 임박순</option></select>{hasFilter && <button className="text-button" onClick={clear}>필터 초기화</button>}</div></div>
    <div className="result-head"><b>{list.length.toLocaleString()}개의 공고</b><span>공고 제목을 누르면 게임잡 원문으로 이동해요.</span></div>
    {list.length ? <><JobCards jobs={pagedJobs} detailed /><Pagination page={page} total={pageCount} setPage={setPage} /></> : <Empty title="조건에 맞는 공고가 없어요" text="검색어나 필터를 변경해 보세요." />}
  </section>
}

function Categories({ data }: { data: Data }) {
  const [params, setParams] = useSearchParams()
  const counts = countCategories(data.snapshot.jobs)
  const selected = params.get('major') || counts[0]?.name || ''
  const selectedSub = params.get('sub') || ''
  const [subQuery, setSubQuery] = useState('')
  const [page, setPage] = useState(1)
  const majorJobs = selected ? data.snapshot.jobs.filter(j => majorCategories(j).includes(selected)) : []
  const subCounts = countSubCategories(majorJobs)
  const visibleSubs = subCounts.filter(item => item.name.toLowerCase().includes(subQuery.trim().toLowerCase()))
  const jobs = selectedSub ? majorJobs.filter(j => subCategories(j).includes(selectedSub)) : majorJobs
  const pageSize = 40, pageCount = Math.max(1, Math.ceil(jobs.length / pageSize))
  const trend = data.categoryHistory.periods.map(item => ({ month: item.period, total_open: (selectedSub ? item.sub[selectedSub] : item.major[selected]) || 0, new_count: null, closed_count: null }))
  const currentCount = trend.at(-1)?.total_open || jobs.length
  const previousCount = trend.length > 1 ? trend.at(-2)?.total_open ?? null : null
  const change = previousCount == null ? null : currentCount - previousCount
  const categoryChange = (kind: 'major' | 'sub', name: string) => {
    const periods = data.categoryHistory.periods
    if (periods.length < 2) return null
    return (periods.at(-1)?.[kind][name] || 0) - (periods.at(-2)?.[kind][name] || 0)
  }
  useEffect(() => { setPage(1); setSubQuery('') }, [selected, selectedSub])
  return <section className="category-page"><PageTitle eyebrow="JOB CATEGORY" title="직무별 채용" description="대분류에서 소분류를 선택하고 해당 직무의 변화와 공고를 확인하세요." />
    <div className="taxonomy-note"><b>게임잡 원문 기준</b><span>제목을 추측해 분류하지 않고 게임잡이 제공한 직무를 그대로 사용합니다.</span></div>
    <div className="category-browser">
      <aside className="major-rail"><div className="category-browser-title"><span>대분류</span><b>직무 선택</b></div><div className="major-list">{counts.map(x => <button className={selected === x.name ? 'active' : ''} onClick={() => setParams({ major: x.name })} key={x.name}><span>{x.name}</span><span className="category-metric"><b>{x.count.toLocaleString()}</b><ChangeBadge value={categoryChange('major', x.name)} /></span></button>)}</div></aside>
      <div className="category-browser-content">
        <section className="subcategory-panel"><div className="category-browser-title"><span>소분류</span><b>{selected}</b></div><label className="mini-search category-search"><Search size={17} /><input value={subQuery} onChange={event => setSubQuery(event.target.value)} placeholder="소분류 직무 검색" />{subQuery && <button onClick={() => setSubQuery('')} aria-label="검색어 지우기">×</button>}</label><div className="subcategory-list"><button className={!selectedSub ? 'active' : ''} onClick={() => setParams({ major: selected })}><span>전체 {selected}</span><span className="category-metric"><b>{majorJobs.length.toLocaleString()}건</b><ChangeBadge value={categoryChange('major', selected)} /></span><ChevronRight size={16} /></button>{visibleSubs.map(x => <button className={selectedSub === x.name ? 'active' : ''} onClick={() => setParams({ major: selected, sub: x.name })} key={x.name}><span>{x.name}</span><span className="category-metric"><b>{x.count.toLocaleString()}건</b><ChangeBadge value={categoryChange('sub', x.name)} /></span><ChevronRight size={16} /></button>)}{!visibleSubs.length && <p>검색 결과가 없습니다.</p>}</div></section>
        <section className="category-trend-card"><div className="category-trend-head"><div><span>선택 직무 추이</span><h2>{selectedSub || selected}</h2></div><div><strong>{currentCount.toLocaleString()}건</strong><small className={change != null && change < 0 ? 'down' : ''}>{change == null ? '비교 기준 없음' : `직전 기준일 대비 ${change > 0 ? '+' : ''}${change}건`}</small></div></div><Trend history={{ months: trend }} /></section>
      </div>
    </div>
    {selected && <><div className="section-heading compact"><div><span>SELECTED JOB</span><h2>{selectedSub || selected} 채용공고</h2></div><b>{jobs.length.toLocaleString()}건</b></div><JobCards jobs={jobs.slice((page - 1) * pageSize, page * pageSize)} detailed /><Pagination page={page} total={pageCount} setPage={setPage} /></>}
  </section>
}

function Companies({ data }: { data: Data }) {
  const companies = Object.entries(groupBy(data.snapshot.jobs, j => j.company)).sort((a, b) => b[1].length - a[1].length)
  const [selected, setSelected] = useState(companies[0]?.[0] || '')
  const [query, setQuery] = useState('')
  const filtered = companies.filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
  const jobs = companies.find(x => x[0] === selected)?.[1] || []
  const profile = jobs[0]
  const companyChanges = new Map<string, number | null>((data.report.statistics?.by_company || []).map((row: {name:string;change:number|null}) => [row.name, row.change]))
  const selectedChange = companyChanges.get(selected) ?? null
  return <section><PageTitle eyebrow="COMPANY DIRECTORY" title="회사별 채용" description="기업정보와 진행 중인 공고를 함께 확인하세요." count={companies.length} countLabel="개 회사" />
    <div className="company-layout"><aside className="company-list"><label className="mini-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="회사 검색" /></label><div>{filtered.map(([name, items]) => <button onClick={() => setSelected(name)} className={name === selected ? 'active' : ''} key={name}><Logo name={name} url={items[0].logo_url} /><span><b>{name}</b><small>{items[0].representative_game || '대표게임 정보 없음'}</small></span><span className="company-list-metric"><strong>{items.length}</strong><ChangeBadge value={companyChanges.get(name) ?? null} /></span></button>)}</div></aside>
      {selected && <article className="company-detail"><div className="company-hero"><Logo name={selected} url={profile?.logo_url || null} /><div><span>COMPANY PROFILE</span><h2>{selected}</h2><p>{profile?.representative_game || '대표게임 정보 없음'}</p></div><div className="company-change"><small>직전 기준 대비</small><ChangeBadge value={selectedChange} large /></div>{profile?.company_url && <a className="outline-button" href={profile.company_url} target="_blank" rel="noreferrer">게임잡 기업정보 <ExternalLink size={15} /></a>}</div><div className="profile-grid"><Profile label="기업형태" value={profile?.company_type} /><Profile label="설립연도" value={profile?.established_year} /><Profile label="사원수" value={profile?.employee_count} /><Profile label="진행 중인 공고" value={`${jobs.length}건`} highlight /><Profile wide label="대표게임" value={profile?.representative_game} /><Profile wide label="주요사업" value={profile?.main_business} /></div><div className="section-heading compact"><div><span>OPEN POSITIONS</span><h2>진행 중인 공고</h2></div><b>{jobs.length}건</b></div><JobCards jobs={jobs} detailed /></article>}
    </div>
  </section>
}

function Reports({ report }: { report: Report }) {
  const emptyText = report.status === 'pending_api_key'
    ? '운영자는 GitHub 저장소 Settings → Secrets and variables → Actions에 ANTHROPIC_API_KEY를 등록한 뒤 Manual Collection을 monthly, force=true로 실행해 주세요.'
    : (report.error || '분석 결과가 아직 없습니다.')
  return <section><PageTitle eyebrow="MONTHLY INSIGHT" title="월간 리포트" description={`${report.period} 채용시장 분석을 확인하세요.`} />
    <div className="report-hero"><div><FileText size={28} /><span>{report.status === 'complete' ? '분석 완료' : '생성 대기'}</span><h2>{report.period.replace('-', '년 ')}월<br />게임업계 채용 리포트</h2><p>{report.comparison_label ? `${report.comparison_label} 채용 변화와 ` : '채용 변화와 '}게임잡 업계 소식을 함께 검토해 변화 배경의 가능성을 분석해요.</p></div>{report.markdown && <a className="primary-button" href={`reports/${report.period}.md`} download>Markdown 다운로드 <ArrowUpRight size={18} /></a>}</div>
    {report.is_sample && <div className="status-strip warning">화면 검증용 예시 리포트입니다.</div>}
    <ReportMethod report={report} />
    {report.markdown ? <Panel className="report-panel"><article className="report"><ReportMarkdown markdown={report.markdown} /></article></Panel> : <Empty icon={Sparkles} title="AI 리포트 생성 대기 중이에요" text={emptyText} />}
  </section>
}

function ReportMethod({ report }: { report: Report }) {
  const method = report.methodology
  if (!method) return null
  const e = method.evidence
  return <section className="method-card"><div className="method-heading"><div><span>ANALYSIS TRANSPARENCY</span><h2>분석 근거와 작성 기준</h2></div><b>프롬프트 {method.prompt_version}</b></div>
    <div className="evidence-grid"><div><span>비교 기간</span><b>{e.baseline_period || '기준 없음'} → {e.current_period || report.period}</b></div><div><span>오픈 공고</span><b>{e.previous_open_jobs?.toLocaleString() || '-'}건 → {e.current_open_jobs?.toLocaleString() || '-'}건</b></div><div><span>AI에 전달한 근거</span><b>공고 {e.job_examples_sent} · 뉴스 {e.news_sent_to_model}</b></div><div><span>뉴스 검토 범위</span><b>{e.news_date_from || '-'} ~ {e.news_date_to || '-'}</b></div></div>
    <p className="input-description">{method.input_description}</p><ul>{method.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
    <details><summary>Claude에 전달하는 전체 프롬프트 보기</summary><pre>{method.system_prompt}</pre></details>
  </section>
}

function ReportMarkdown({ markdown }: { markdown: string }) {
  return <>{markdown.split('\n').map((line, index) => {
    const content = line.startsWith('## ') ? line.slice(3) : line.startsWith('# ') ? line.slice(2) : line.startsWith('> ') ? line.slice(2) : line.replace(/^[-*]\s+/, '')
    const rendered = inlineLinks(content)
    if (line.startsWith('## ')) return <h3 key={index}>{rendered}</h3>
    if (line.startsWith('# ')) return <h2 key={index}>{rendered}</h2>
    if (line.startsWith('> ')) return <blockquote key={index}>{rendered}</blockquote>
    if (/^[-*]\s+/.test(line)) return <p className="report-bullet" key={index}>• {rendered}</p>
    return <p key={index}>{rendered}</p>
  })}</>
}

function inlineLinks(text: string) {
  const pattern = /\[([^\]]+)]\((https?:\/\/[^)]+)\)/g
  const nodes: React.ReactNode[] = []
  let cursor = 0, match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    nodes.push(<a href={match[2]} target="_blank" rel="noreferrer" key={`${match.index}-${match[2]}`}>{match[1]}</a>)
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
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
  if (!history.months.length) return <Empty title="아직 추이 데이터가 없어요" text="다음 월간 스냅샷부터 변화가 표시돼요." />
  return <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history.months}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3182f6" stopOpacity={.3} /><stop offset="1" stopColor="#3182f6" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#eef0f3" vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#8b95a1', fontSize: 12 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: '#8b95a1', fontSize: 12 }} width={42} /><Tooltip contentStyle={{ border: 0, borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,.12)' }} /><Area type="monotone" dataKey="total_open" stroke="#3182f6" strokeWidth={3} fill="url(#trendFill)" /></AreaChart></ResponsiveContainer></div>
}

function RankList({ rows, to }: { rows: { name: string; count: number; description?: string | null }[]; to: string }) {
  return <div className="rank-list">{rows.map((row, i) => <NavLink to={to} key={row.name}><em>{i + 1}</em><span><b>{row.name}</b>{row.description && <small>{row.description}</small>}</span><strong>{row.count.toLocaleString()}</strong><ChevronRight size={16} /></NavLink>)}</div>
}

function Bars({ rows }: { rows: { name: string; count: number }[] }) {
  const max = rows[0]?.count || 1
  return <div className="bars">{rows.map(row => <div key={row.name}><span>{row.name}</span><div><i style={{ width: `${row.count / max * 100}%` }} /></div><b>{row.count.toLocaleString()}</b></div>)}</div>
}

function JobCards({ jobs, detailed = false }: { jobs: Job[]; detailed?: boolean }) {
  return <div className={`job-list${detailed ? ' detailed' : ''}`}>{jobs.map(job => <a className="job-card" href={job.url} target="_blank" rel="noreferrer" key={job.id}><div className="job-company"><Logo name={job.company} url={job.logo_url} /><span><b>{job.company}</b><small>{job.representative_game || '대표게임 정보 없음'}</small></span></div><div className="job-content"><h3>{job.title}</h3><div className="tags">{majorCategories(job).map(category => <span key={category}>{category}</span>)}{subCategories(job).slice(0, 3).map(category => <span className="subtag" key={category}>{category}</span>)}</div><div className="job-meta"><span><BriefcaseBusiness size={14} />{job.career || '경력 미확인'}</span><span><MapPin size={14} />{job.location || '지역 미확인'}</span><span><CalendarDays size={14} />{job.always_open ? '상시채용' : job.deadline || '마감일 미확인'}</span></div></div><span className="open-icon"><ArrowUpRight size={18} /></span></a>)}</div>
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

function majorCategories(job: Job) { return job.job_major_categories?.length ? job.job_major_categories : job.categories }
function subCategories(job: Job) { return job.job_subcategories?.length ? job.job_subcategories : job.original_categories }

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((result, item) => { (result[getKey(item)] ??= []).push(item); return result }, {})
}

function fmtChange(value: number | null) { return value == null ? '기준 없음' : `${value > 0 ? '+' : ''}${value.toLocaleString()}건` }
function formatDate(value: string) { return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) }

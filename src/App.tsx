import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BarChart3, BriefcaseBusiness, Check, ChevronRight, ClipboardCopy, Clock3, Eye, EyeOff, FileText, LockKeyhole, LogOut, RefreshCw, Search, Settings2, Target, UsersRound, X } from 'lucide-react'
import { api } from './api'
import { PIPELINE_STAGES, type DashboardData, type Opening, type PipelineStage } from './types'

type OpeningNote = {
  memo: string
  enabledStages: PipelineStage[]
}

const NOTE_PREFIX = 'kong-recruiting-note:'
const REPORT_ID = '__report__'
const AUTH_KEY = 'kong-recruiting-authenticated'
const PASSWORD_HASH = '5acc4f34e4cc64ca45390a50c9f84d960b49639390b75fc5eb46b542a90dac66'

function noteKey(openingId: string) { return `${NOTE_PREFIX}${openingId}` }
function isArtOpening(title: string) { return /art|아트|애니메|컨셉|원화|모델|ui|ux|이펙트|vfx/i.test(title) }
function isDevOpening(title: string) { return /software|engineer|developer|개발|엔지니어|프로그래머|클라이언트|서버|unity|유니티/i.test(title) }
function recommendedStages(opening: Opening): PipelineStage[] {
  const active = new Set(opening.candidates.map(candidate => candidate.stage))
  if (isArtOpening(opening.title)) active.add('온라인 과제')
  if (isDevOpening(opening.title)) active.add('코딩테스트')
  if (![...active].some(stage => stage.includes('면접'))) active.add('면접')
  return PIPELINE_STAGES.filter(stage => active.has(stage))
}
function loadNote(opening: Opening): OpeningNote {
  const fallback: OpeningNote = { memo: '', enabledStages: recommendedStages(opening) }
  try {
    const saved = localStorage.getItem(noteKey(opening.id))
    if (!saved) return fallback
    const parsed = JSON.parse(saved) as Partial<OpeningNote>
    return {
      memo: typeof parsed.memo === 'string' ? parsed.memo : '',
      enabledStages: Array.isArray(parsed.enabledStages) ? parsed.enabledStages.filter(stage => PIPELINE_STAGES.includes(stage)) : fallback.enabledStages,
    }
  } catch { return fallback }
}
function isNewOpening(opening: Opening) { return opening.isNew === true }
function stagesFor(opening: Opening, note: OpeningNote) {
  const stages = new Set(note.enabledStages)
  opening.candidates.forEach(candidate => stages.add(candidate.stage))
  return PIPELINE_STAGES.filter(stage => stages.has(stage))
}

function projectName(opening: Opening) {
  const saved = opening.project.trim()
  if (saved) {
    const normalized = saved.replace(/^Project\s+/i, '').trim()
    return /^(octopus|otps)$/i.test(normalized) ? 'OTPS' : normalized
  }
  const bracket = opening.title.match(/^\[([^\]]+)\]/)?.[1]?.trim()
  const normalized = bracket?.replace(/^Project\s+/i, '').trim()
  return normalized && /^(octopus|otps)$/i.test(normalized) ? 'OTPS' : normalized || '프로젝트 미지정'
}

function roleName(opening: Opening, project: string) {
  return opening.title
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(new RegExp(`^${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-–|:]?\\s*`, 'i'), '')
    .replace(/\s*모집\s*$/i, '')
    .trim() || opening.title
}

function stageStatus(opening: Opening) {
  if (!opening.candidates.length) return ['이력서 검토 중']
  const labels: Record<PipelineStage, string> = {
    '온라인 과제': '온라인 과제', '코딩테스트': '코딩 테스트', '역량검사': '역량 검사',
    '면접': '면접 예정자', '1차 면접': '1차 면접', '2차 면접': '2차 면접',
    '면접합격': '면접 합격', '처우단계': '처우 협의', 'Offer': '오퍼',
  }
  return PIPELINE_STAGES.flatMap(stage => {
    const stageCandidates = opening.candidates.filter(candidate => candidate.stage === stage)
    const count = stageCandidates.length
    if (!count) return []
    const suffix = stage === '면접' ? `${count}명` : `${count}명 진행 중`
    const offerDates = stage === 'Offer'
      ? stageCandidates.filter(candidate => candidate.hireDate).map(candidate => `${candidate.name}: ${candidate.hireDate} 입사 예정`)
      : []
    const offerDetail = offerDates.length ? ` (${offerDates.join(' · ')})` : ''
    return [`${labels[stage]} ${suffix}${offerDetail}`]
  })
}

function openingSituation(opening: Opening, note: OpeningNote) {
  const status = stageStatus(opening).join(' · ')
  if (!opening.candidates.length) return status
  const memo = note.memo.split('\n').map(line => line.trim()).filter(Boolean).join(' · ')
  return memo ? `${status} · ${memo}` : status
}

function visualWidth(value: string) {
  return Array.from(value).reduce((width, character) => width + (/[^\u0000-\u00ff]/.test(character) ? 2 : 1), 0)
}

function wrapTableCell(value: string, width: number) {
  const source = value.replace(/[`\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || '-'
  const lines: string[] = []
  let line = ''
  for (const character of Array.from(source)) {
    if (line && visualWidth(line + character) > width) {
      lines.push(line.trimEnd())
      line = ''
    }
    line += character
  }
  if (line || !lines.length) lines.push(line.trimEnd())
  return lines
}

function padTableCell(value: string, width: number) {
  return value + ' '.repeat(Math.max(0, width - visualWidth(value)))
}

function slackTable(openings: Opening[], notes: Map<string, OpeningNote>) {
  const widths = [12, 22, 7, 26, 38]
  const headers = ['프로젝트', '채용 직무', '목표 TO', '채용 배경', '현재 진행']
  const rows = openings.map(opening => {
    const project = projectName(opening)
    return [project, roleName(opening, project), opening.targetTo ? `${opening.targetTo}명` : '미입력', opening.reason.trim() || '미입력', openingSituation(opening, notes.get(opening.id)!)]
  })
  const renderRow = (cells: string[]) => cells.map((cell, index) => padTableCell(cell, widths[index])).join(' | ')
  const lines = [renderRow(headers), widths.map(width => '-'.repeat(width)).join('-+-')]
  rows.forEach(row => {
    const wrapped = row.map((cell, index) => wrapTableCell(cell, widths[index]))
    const height = Math.max(...wrapped.map(cell => cell.length))
    for (let line = 0; line < height; line += 1) {
      lines.push(renderRow(wrapped.map(cell => cell[line] || '')))
    }
    lines.push(widths.map(width => '-'.repeat(width)).join('-+-'))
  })
  return lines.join('\n')
}

function createSlackReport(openings: Opening[]) {
  const notes = new Map(openings.map(opening => [opening.id, loadNote(opening)]))
  const groups = new Map<string, Opening[]>()
  openings.forEach(opening => {
    const project = projectName(opening)
    groups.set(project, [...(groups.get(project) || []), opening])
  })
  const targetTo = openings.reduce((sum, opening) => sum + opening.targetTo, 0)
  const candidateCount = openings.reduce((sum, opening) => sum + opening.candidates.length, 0)
  const today = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date())
  const lines = [
    `*채용 진행 현황 | ${today}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `*전체 요약*  • 오픈 공고 \`${openings.length}개\`  • 목표 TO \`${targetTo ? `${targetTo}명` : '미입력'}\`  • 진행 지원자 \`${candidateCount}명\``,
    '',
  ]
  const sorted = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'ko'))
    .flatMap(([, projectOpenings]) => [...projectOpenings].sort((a, b) => a.title.localeCompare(b.title, 'ko')))
  lines.push('```', slackTable(sorted, notes), '```')
  return lines.join('\n').trim()
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function isAuthenticated() {
  try { return sessionStorage.getItem(AUTH_KEY) === 'true' }
  catch { return false }
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated)
  const unlock = () => {
    try { sessionStorage.setItem(AUTH_KEY, 'true') } catch { /* 세션 저장이 막혀도 현재 화면은 허용 */ }
    setAuthenticated(true)
  }
  const logout = () => {
    try { sessionStorage.removeItem(AUTH_KEY) } catch { /* ignore */ }
    setAuthenticated(false)
  }
  return authenticated ? <Dashboard onLogout={logout} /> : <LoginScreen onSuccess={unlock} />
}

function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password) { setError('비밀번호를 입력해 주세요.'); return }
    setChecking(true); setError('')
    try {
      if (await sha256(password) === PASSWORD_HASH) onSuccess()
      else { setError('비밀번호가 올바르지 않습니다.'); setPassword('') }
    } catch { setError('비밀번호를 확인하지 못했습니다. 다시 시도해 주세요.') }
    finally { setChecking(false) }
  }
  return <main className="login-shell"><section className="login-card"><img src={`${import.meta.env.BASE_URL}kong-studios-logo.png`} alt="KONG STUDIOS" /><span className="login-eyebrow">KONG STUDIOS KOREA</span><h1>채용 대시보드</h1><p>내부 채용 현황을 확인하려면 비밀번호를 입력해 주세요.</p><form onSubmit={submit}><label>비밀번호<div className={`password-field ${error ? 'invalid' : ''}`}><LockKeyhole size={18} /><input autoFocus autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => { setPassword(event.target.value); setError('') }} placeholder="비밀번호 입력" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <div className="login-error">{error}</div>}<button className="login-submit" type="submit" disabled={checking}>{checking ? '확인 중...' : '들어가기'}</button></form><small>브라우저 탭을 닫으면 다시 로그인이 필요합니다.</small></section></main>
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedId, setSelectedId] = useState(REPORT_ID)
  const [query, setQuery] = useState('')
  const [refreshNotice, setRefreshNotice] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    try {
      const deployed = await api.dashboard()
      let next = deployed
      try {
        next = await api.liveDashboard(deployed)
      } catch (liveError) {
        setRefreshNotice(`최신 시트를 불러오지 못해 마지막 배포 데이터를 표시합니다. ${liveError instanceof Error ? liveError.message : ''}`.trim())
        window.setTimeout(() => setRefreshNotice(''), 7000)
      }
      setData(next)
      setSelectedId(id => id === REPORT_ID || next.openings.some(x => x.id === id) ? id : REPORT_ID)
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  const syncNow = async () => {
    if (syncing) return
    setSyncing(true); setError(''); setRefreshNotice('시트에서 최신 데이터를 불러오고 있어요.')
    try {
      const next = await api.liveDashboard(data)
      setData(next)
      setSelectedId(id => id === REPORT_ID || next.openings.some(x => x.id === id) ? id : REPORT_ID)
      setRefreshNotice('최신 시트 데이터가 바로 반영됐어요.')
      window.setTimeout(() => setRefreshNotice(''), 4000)
    } catch (e) {
      setRefreshNotice(e instanceof Error ? e.message : '데이터 동기화를 시작하지 못했습니다.')
      window.setTimeout(() => setRefreshNotice(''), 6500)
    } finally {
      setSyncing(false)
    }
  }
  useEffect(() => { void load() }, [])
  const openings = useMemo(() => (data?.openings || []).filter(x => `${x.title} ${x.project}`.toLowerCase().includes(query.toLowerCase())), [data, query])
  const selected = data?.openings.find(x => x.id === selectedId) || null
  const goHome = () => setSelectedId(REPORT_ID)
  return <div className="shell"><header className="topbar"><button className="brand-home" onClick={goHome} aria-label="전체 채용 리포트로 이동"><img src={`${import.meta.env.BASE_URL}kong-studios-logo.png`} alt="KONG STUDIOS" /><span><b>채용 대시보드</b><small>콩스튜디오코리아</small></span></button><nav><button className={syncing ? 'sync-button syncing' : 'sync-button'} onClick={() => void syncNow()} disabled={loading || syncing} title="연동용 시트에서 최신 데이터를 읽어 현재 화면에 바로 반영합니다"><RefreshCw size={16} className={loading || syncing ? 'spin' : ''} /> {syncing ? '시트 불러오는 중' : loading ? '불러오는 중' : '데이터 다시 불러오기'}</button><button className="logout-button" onClick={onLogout}><LogOut size={16} /> 로그아웃</button></nav></header>
    <div className="workspace"><aside className="opening-sidebar"><div className="sidebar-title"><span>RECRUITING REPORT</span><button className="sidebar-home" onClick={goHome}>채용 현황</button></div><button className={`report-link ${selectedId === REPORT_ID ? 'active' : ''}`} onClick={goHome}><BarChart3 size={17} /><div><b>전체 채용 리포트</b></div><ChevronRight size={15} /></button><label className="search"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="공고·프로젝트 검색" />{query && <button onClick={() => setQuery('')}><X size={14} /></button>}</label><div className="opening-list">{openings.map(opening => <button key={opening.id} className={selectedId === opening.id ? 'active' : ''} onClick={() => setSelectedId(opening.id)}><span className="status-dot" /><div><b>{opening.title}{isNewOpening(opening) && <em className="new-badge">NEW</em>}</b><small>{projectName(opening)} · 진행 {opening.candidates.length}명</small></div><ChevronRight size={15} /></button>)}</div></aside>
      <main className="content">{error ? <ErrorState message={error} retry={load} /> : loading && !data ? <Loading label="채용 현황을 불러오는 중이에요" /> : selectedId === REPORT_ID && data ? <OverviewReport data={data} /> : selected ? <OpeningBoard opening={selected} /> : <EmptyState />}</main></div>
    {refreshNotice && <div className="toast">{refreshNotice}</div>}
    <footer><span>마지막 동기화 {data?.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</span><span>진행 지원자 {data?.candidateCount || 0}명</span></footer>
  </div>
}

function OverviewReport({ data }: { data: DashboardData }) {
  const [reportOpen, setReportOpen] = useState(false)
  const [reportText, setReportText] = useState('')
  const [copied, setCopied] = useState(false)
  const active = data.openings.filter(opening => opening.status === '진행중')
  const notes = new Map(active.map(opening => [opening.id, loadNote(opening)]))
  const candidates = active.flatMap(opening => opening.candidates)
  const targetTo = active.reduce((sum, opening) => sum + opening.targetTo, 0)
  const projects = new Map<string, Opening[]>()
  active.forEach(opening => {
    const project = projectName(opening)
    projects.set(project, [...(projects.get(project) || []), opening])
  })
  const openReport = () => { setReportText(createSlackReport(active)); setCopied(false); setReportOpen(true) }
  const copyReport = async () => {
    try { await navigator.clipboard.writeText(reportText) }
    catch { const area = document.querySelector<HTMLTextAreaElement>('.report-textarea'); area?.select(); document.execCommand('copy') }
    setCopied(true); window.setTimeout(() => setCopied(false), 2000)
  }
  return <section className="report-view"><div className="report-head"><div><span className="eyebrow">RECRUITING STATUS REPORT</span><h1>현재 채용 진행 리포트</h1></div><div className="report-actions"><div className="as-of"><FileText size={16} /><span>기준 시각<b>{data.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '-'}</b></span></div><button className="primary generate-report" onClick={openReport}><ClipboardCopy size={16} /> 리포트 생성하기</button></div></div>
    <div className="report-kpis"><Summary icon={BriefcaseBusiness} label="오픈 공고" value={`${active.length}개`} /><Summary icon={Target} label="목표 TO" value={targetTo ? `${targetTo}명` : '미입력'} /><Summary icon={UsersRound} label="진행 지원자" value={`${candidates.length}명`} /></div>
    <article className="project-overview"><header><div><span>PROJECT OVERVIEW</span><h2>채용 현황</h2></div></header><div className="project-status-table-wrap"><table className="project-status-table"><thead><tr><th>프로젝트</th><th>채용 직무</th><th>목표 TO</th><th>채용 배경</th><th>현재 진행</th></tr></thead><tbody>{Array.from(projects.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko')).flatMap(([project, projectOpenings]) => { const sorted = [...projectOpenings].sort((a, b) => a.title.localeCompare(b.title, 'ko')); const projectTargetTo = sorted.reduce((sum, opening) => sum + opening.targetTo, 0); return sorted.map((opening, index) => { const note = notes.get(opening.id)!; return <tr key={opening.id}>{index === 0 && <th className="project-cell" rowSpan={sorted.length}><span>{project}</span><small>({projectTargetTo}명)</small></th>}<td className="role-cell"><b>{roleName(opening, project)}</b>{isNewOpening(opening) && <em className="new-badge">NEW</em>}</td><td className="to-cell"><b>{opening.targetTo ? `${opening.targetTo}명` : '미입력'}</b></td><td className="reason-cell">{opening.reason.trim() || '미입력'}</td><td className="progress-cell"><b>{openingSituation(opening, note)}</b></td></tr> }) })}</tbody></table></div></article>
    {reportOpen && <div className="modal-backdrop" onMouseDown={() => setReportOpen(false)}><section className="modal report-modal" onMouseDown={e => e.stopPropagation()}><header><div><span>SLACK REPORT</span><h2>슬랙 표 형식 리포트</h2></div><button onClick={() => setReportOpen(false)}><X /></button></header><div className="report-guide"><b>복사해서 Slack에 바로 붙여 넣으세요</b><p>채용 현황과 같은 프로젝트·채용 직무·목표 TO·채용 배경·현재 진행 표가 고정폭 형식으로 유지됩니다.</p></div><label className="report-editor-label">보고 문구 미리보기<textarea className="report-textarea slack-table-preview" value={reportText} onChange={e => setReportText(e.target.value)} /></label><div className="modal-actions"><span className="copy-status">{copied ? 'Slack 표를 복사했습니다.' : ''}</span><button className="outline" onClick={() => setReportOpen(false)}>닫기</button><button className="primary" onClick={copyReport}><ClipboardCopy size={15} /> Slack 표 복사</button></div></section></div>}
  </section>
}

function OpeningBoard({ opening }: { opening: Opening }) {
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  const [note, setNote] = useState<OpeningNote>(() => loadNote(opening))
  const [form, setForm] = useState<OpeningNote>(() => loadNote(opening))
  useEffect(() => { const next = loadNote(opening); setNote(next); setForm(next); setEditing(false) }, [opening])
  const remaining = Math.max(0, opening.targetTo - opening.hiredCount)
  const visibleStages = stagesFor(opening, note)
  const save = () => {
    const next = { ...form, enabledStages: PIPELINE_STAGES.filter(stage => form.enabledStages.includes(stage)) }
    localStorage.setItem(noteKey(opening.id), JSON.stringify(next)); setNote(next); setEditing(false); setNotice('이 브라우저에 공고 설정을 저장했어요')
    window.setTimeout(() => setNotice(''), 2500)
  }
  const toggleStage = (stage: PipelineStage) => setForm(current => ({ ...current, enabledStages: current.enabledStages.includes(stage) ? current.enabledStages.filter(item => item !== stage) : [...current.enabledStages, stage] }))
  return <section className="opening-view"><div className="opening-head"><div><span className="eyebrow">ACTIVE OPENING{isNewOpening(opening) && <em className="new-badge head-badge">NEW</em>}</span><h1>{opening.title}</h1><p>{opening.project || '프로젝트 미지정'}</p></div><button className="outline" onClick={() => { setForm(note); setEditing(true) }}><Settings2 size={16} /> 전형·메모 편집</button></div>
    <div className="summary-grid"><Summary icon={Target} label="목표 TO" value={`${opening.targetTo}명`} /><Summary icon={Check} label="충원 완료" value={`${opening.hiredCount}명`} /><Summary icon={BriefcaseBusiness} label="잔여 TO" value={`${remaining}명`} accent /><Summary icon={UsersRound} label="진행 지원자" value={`${opening.candidates.length}명`} /></div>
    <div className="note-grid"><article className="reason-card"><span>채용 배경</span><p>{opening.reason || '채용 배경 미입력'}</p></article><article className="reason-card"><span>메모</span><p>{note.memo || '이 공고에 대한 메모를 입력해 주세요.'}</p></article></div>
    <div className="board-title"><div><span>HIRING PIPELINE</span><h2>전형 진행 현황</h2></div><p><Clock3 size={14} /> 선택한 전형과 실제 지원자가 있는 단계만 표시합니다.</p></div>
    <div className="kanban" style={{ gridTemplateColumns: `repeat(${Math.max(visibleStages.length, 1)}, 244px)` }}>{visibleStages.map(stage => { const candidates = opening.candidates.filter(x => x.stage === stage); return <section className="lane" key={stage}><header><b>{stage}</b><span>{candidates.length}</span></header><div className="lane-body">{candidates.map(candidate => <article className="candidate" key={candidate.id}><div className="candidate-name"><b>{candidate.name}</b>{candidate.stage === 'Offer' && candidate.hireDate && <strong className="hire-date">› {candidate.hireDate} 입사 예정</strong>}</div><small>{candidate.project || opening.project || '프로젝트 미지정'}</small></article>)}{!candidates.length && <div className="lane-empty">지원자 없음</div>}</div></section> })}</div>
    {notice && <div className="toast">{notice}</div>}
    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(false)}><section className="modal wide-modal" onMouseDown={e => e.stopPropagation()}><header><div><span>LOCAL OPENING SETTINGS</span><h2>전형·메모</h2></div><button onClick={() => setEditing(false)}><X /></button></header><p className="local-help">목표 TO와 채용 배경은 연동용 사본의 Dashboard_TO 탭에서 불러옵니다. 전형 설정과 메모만 현재 브라우저에 저장됩니다.</p><fieldset className="stage-selector"><legend>사용 전형</legend><p>직무에 맞는 단계만 선택하세요. 실제 지원자가 있는 단계는 선택을 해제해도 화면에 유지됩니다.</p><div>{PIPELINE_STAGES.map(stage => <label key={stage}><input type="checkbox" checked={form.enabledStages.includes(stage)} onChange={() => toggleStage(stage)} /><span>{stage}</span></label>)}</div></fieldset><label>메모<textarea rows={3} value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} /></label><div className="modal-actions"><button className="outline" onClick={() => setEditing(false)}>취소</button><button className="primary" onClick={save}>이 브라우저에 저장</button></div></section></div>}
  </section>
}

function Summary({ icon: Icon, label, value, accent = false }: { icon: typeof Target; label: string; value: string; accent?: boolean }) { return <article className={`summary ${accent ? 'accent' : ''}`}><Icon size={18} /><div><span>{label}</span><b>{value}</b></div></article> }
function Loading({ label }: { label: string }) { return <div className="state"><RefreshCw className="spin" /><b>{label}</b></div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="state"><b>데이터를 불러오지 못했어요</b><p>{message}</p><button onClick={retry}>다시 시도</button></div> }
function EmptyState() { return <div className="state"><BriefcaseBusiness /><b>표시할 공고가 없어요</b><p>GitHub Actions에서 데이터 동기화를 실행해 주세요.</p></div> }

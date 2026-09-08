/* Recruitment workspace: local candidate records and explicit event dates. */
const HR_KEY='kongs_recruitment_v1';
// The replacement owns search controls; skip the old view's initialization.
window.__myCompanyJobSearchSetupDone=true;
const HR_STAGES=['지원','서류 검토','1차 면접','2차 면접','처우 협의','입사 확정','불합격','지원 철회'];
const HR_TERMINAL=new Set(['입사 확정','불합격','지원 철회']);
let hrSelected='',hrFilter='open',hrQuery='';
function hrToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=t=>parts.find(p=>p.type===t).value;return `${get('year')}-${get('month')}-${get('day')}`;}
function hrValidDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
function hrDays(a,b){if(!hrValidDate(a)||!hrValidDate(b)||b<a)return null;return Math.round((Date.parse(b)-Date.parse(a))/86400000);}
function hrRead(){try{const d=JSON.parse(localStorage.getItem(HR_KEY)||'{"version":1,"jobs":{},"candidates":[]}');if(!hrValidate(d))throw Error();return d;}catch(e){throw new Error('저장 자료를 읽지 못했습니다. 기존 기록을 보호하기 위해 저장을 중단했습니다.');}}
function hrValidate(d){
 return !!d&&d.version===1&&d.jobs&&typeof d.jobs==='object'&&!Array.isArray(d.jobs)&&Array.isArray(d.candidates)&&
 Object.entries(d.jobs).every(([id,j])=>/^\d+$/.test(id)&&j&&typeof j.title==='string'&&typeof j.project==='string'&&(j.memo===undefined||typeof j.memo==='string')&&(j.categories===undefined||typeof j.categories==='string')&&['open','hold','closed'].includes(j.status)&&(!j.opened||hrValidDate(j.opened))&&(!j.closed||hrValidDate(j.closed))&&(!j.opened||!j.closed||j.closed>=j.opened))&&
 new Set(d.candidates.map(c=>c.id)).size===d.candidates.length&&d.candidates.every(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.memo==='string'&&typeof c.jobId==='string'&&/^\d+$/.test(c.jobId)&&Object.hasOwn(d.jobs,c.jobId)&&hrValidDate(c.applied)&&Array.isArray(c.history)&&c.history.length&&c.history.every((h,i)=>h&&HR_STAGES.includes(h.stage)&&hrValidDate(h.date)&&h.date>=c.applied&&(!i||h.date>=c.history[i-1].date)));
}
function hrWrite(d){if(!hrValidate(d))throw new Error('날짜와 입력 내용을 확인해주세요.');try{localStorage.setItem(HR_KEY,JSON.stringify(d));}catch(e){throw new Error('저장 공간이 부족하거나 저장이 차단됐습니다. 백업 후 다시 시도해주세요.');}}
function hrStage(c){return c.history.at(-1).stage;}
function hrMetrics(c,job,today=hrToday()){
 const accepted=c.history.find(h=>h.stage==='입사 확정');
 return {hire:accepted?hrDays(c.applied,accepted.date):null,fill:accepted&&job.opened?hrDays(job.opened,accepted.date):null,elapsed:hrDays(c.applied,HR_TERMINAL.has(hrStage(c))?c.history.at(-1).date:today),stageDays:HR_TERMINAL.has(hrStage(c))?null:hrDays(c.history.at(-1).date,today)};
}
function hrAverage(values){const valid=values.filter(v=>v!==null&&Number.isFinite(v));return valid.length?(valid.reduce((a,b)=>a+b,0)/valid.length).toFixed(1):null;}
function hrJobCatalog(d){
 const map=new Map();const archive=typeof monthlyArchive!=='undefined'&&monthlyArchive.length?monthlyArchive:snapshots;
 archive.forEach(s=>s.jobs.filter(j=>(j.company_name||'').includes('콩스튜디오')).forEach(j=>map.set(j.gi_no,j)));
 Object.entries(d.jobs).forEach(([id,j])=>{if(!map.has(id))map.set(id,{gi_no:id,title:j.title,company_name:'콩스튜디오',job_categories:j.categories||''});});
 const latest=archive.at(-1),observed=new Set((latest?.jobs||[]).filter(j=>(j.company_name||'').includes('콩스튜디오')).map(j=>j.gi_no));
 return [...map.values()].map(j=>{const note=getJobNote(j.gi_no),record=d.jobs[j.gi_no]||{};return {...j,project:record.project||note.project||autoDetectProject(j.title)||'미지정',opened:record.opened||'',closed:record.closed||'',status:record.status||(observed.has(j.gi_no)?'open':'unknown'),observed:observed.has(j.gi_no),memo:record.memo??note.toHistory??'',asof:latest?.date||''};});
}
function hrRemember(d,job){if(!d.jobs[job.gi_no])d.jobs[job.gi_no]={title:job.title,project:job.project,status:job.status==='unknown'?'hold':job.status,opened:job.opened,closed:job.closed,memo:job.memo,categories:job.job_categories||''};}
function hrRun(action){try{action();}catch(error){alert(error.message);}}
renderMyCompanyView=function(){hrRun(hrRender);};
function hrRender(){
 const d=hrRead(),jobs=hrJobCatalog(d),open=jobs.filter(j=>j.status==='open'),candidates=d.candidates;
 const active=candidates.filter(c=>!HR_TERMINAL.has(hrStage(c))),hired=candidates.filter(c=>hrStage(c)==='입사 확정');
 const hireTimes=hired.map(c=>hrMetrics(c,jobs.find(j=>j.gi_no===c.jobId)||{}).hire);
 const avg=hrAverage(hireTimes);
 const view=document.getElementById('view-mycompany');
 view.innerHTML=`<div class="hr-heading"><div><h2>콩스튜디오 채용</h2><p>프로젝트별 공고와 후보자 진행 현황</p></div><div class="hr-actions"><button id="hrExport" class="chip">기록 백업</button><label class="chip hr-import">백업 복원<input id="hrImport" type="file" accept=".json" hidden></label></div></div>
 <p class="hr-notice">공고 기준 ${escapeHtml(jobs[0]?.asof||'자료 없음')} · 시장 비교 월과 별개로 최신 수집 공고를 표시합니다. 오픈 상태는 수집 당시 기준이며 수동 수정할 수 있어요. 후보자·메모는 이 브라우저에만 저장되며 팀원과 자동 공유되지 않습니다.</p>
 <div class="hr-stats">${[['오픈 공고',open.length+'건'],['진행 후보자',active.length+'명'],['입사 확정',hired.length+'명'],['평균 지원→입사 확정',avg===null?'—':avg+'일']].map(([label,num])=>`<div class="stat-card"><div class="label">${label}</div><div class="num">${num}</div></div>`).join('')}</div>
 <section class="panel"><div class="panel-title">프로젝트별 채용 비율 <small>오픈 공고 수 기준</small></div><div id="hrProjects" class="hr-projects"></div></section>
 <section class="panel"><div class="panel-title">채용 공고 <small>공고를 선택해 후보자를 관리하세요</small></div><div class="hr-list-controls"><input id="hrSearch" class="search-input" placeholder="프로젝트 · 공고명 검색" aria-label="프로젝트 또는 공고명 검색" value="${escapeHtml(hrQuery)}"><select id="hrFilter" aria-label="공고 상태"><option value="open">오픈 공고</option><option value="all">전체 공고</option><option value="hold">보류</option><option value="closed">마감</option><option value="unknown">상태 확인 필요</option></select></div><div id="hrJobs"></div></section><div id="hrDetail"></div>
 <p class="market-footnote">리드타임은 한국 날짜 기준 달력일입니다. 지원→입사 확정은 후보자 지원일부터 확정일까지, 공고 오픈→입사 확정은 직접 입력한 오픈일부터 각 후보자의 확정일까지입니다. 평균은 확정된 후보자 중 유효한 날짜가 있는 기록만 계산하며, 입사 예정일이나 실제 출근일과는 다릅니다.</p>`;
 const counts={};open.forEach(j=>counts[j.project]=(counts[j.project]||0)+1);
 document.getElementById('hrProjects').innerHTML=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([project,n],i)=>`<button class="hr-project" data-project="${escapeHtml(project)}"><span>${escapeHtml(project)}</span><strong>${n}건 <small>${(n/open.length*100).toFixed(1)}%</small></strong><div class="hr-bar"><i style="width:${n/open.length*100}%;background:${MY_COMPANY_DONUT_COLORS[i%9]}"></i></div></button>`).join('')||'<p class="placeholder-hint">오픈 공고가 없습니다.</p>';
 document.querySelectorAll('.hr-project').forEach(b=>b.onclick=()=>{hrQuery=b.dataset.project;document.getElementById('hrSearch').value=hrQuery;hrDrawJobs();});
 document.getElementById('hrFilter').value=hrFilter;document.getElementById('hrFilter').onchange=e=>{hrFilter=e.target.value;hrDrawJobs();};
 document.getElementById('hrSearch').oninput=e=>{hrQuery=e.target.value;hrDrawJobs();};
 document.getElementById('hrExport').onclick=()=>hrRun(()=>{const blob=new Blob([JSON.stringify(hrRead(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='kongs-recruitment-'+hrToday()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 document.getElementById('hrImport').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5*1024*1024)throw new Error('5MB 이하의 백업 파일을 선택해주세요.');const incoming=JSON.parse(await file.text());if(!hrValidate(incoming))throw new Error('올바른 채용 대시보드 백업이 아닙니다.');if(!confirm('현재 브라우저의 채용 기록을 백업 내용으로 교체할까요? 기존 기록이 필요하면 먼저 백업해주세요.'))return;hrWrite(incoming);hrRender();}catch(err){alert(err.message);}};
 hrDrawJobs();if(hrSelected&&jobs.some(j=>j.gi_no===hrSelected))hrDetail();
}
function hrDrawJobs(){
 const d=hrRead(),jobs=hrJobCatalog(d).filter(j=>(hrFilter==='all'||j.status===hrFilter)&&(j.title+' '+j.project).toLowerCase().includes(hrQuery.toLowerCase()));
 document.getElementById('hrJobs').innerHTML=jobs.map(j=>{const cs=d.candidates.filter(c=>c.jobId===j.gi_no),elapsed=hrDays(j.opened,j.status==='closed'?j.closed:hrToday());return `<button class="hr-job ${hrSelected===j.gi_no?'selected':''}" data-id="${escapeHtml(j.gi_no)}"><div><span class="hr-tag">${escapeHtml(j.project)}</span><strong>${escapeHtml(j.title)}</strong><small>${{open:'오픈',hold:'보류',closed:'마감',unknown:'상태 확인 필요'}[j.status]}${j.observed?'':' · 최신 수집에서 미노출'}</small></div><div class="hr-job-metrics"><span>후보자 <b>${cs.length}</b>명</span><span>진행 <b>${cs.filter(c=>!HR_TERMINAL.has(hrStage(c))).length}</b>명</span><span>${elapsed===null?'오픈일 미입력':'오픈 후 '+elapsed+'일'}</span></div></button>`;}).join('')||'<p class="placeholder-hint">조건에 맞는 공고가 없습니다. 전체 공고에서 이전 공고를 확인할 수 있어요.</p>';
 document.querySelectorAll('.hr-job').forEach(b=>b.onclick=()=>{hrSelected=b.dataset.id;hrDrawJobs();hrDetail();document.getElementById('hrDetail').scrollIntoView({behavior:'smooth',block:'start'});});
}
function hrDetail(){
 const d=hrRead(),job=hrJobCatalog(d).find(j=>j.gi_no===hrSelected);if(!job)return;
 const cs=d.candidates.filter(c=>c.jobId===hrSelected),hired=cs.filter(c=>hrStage(c)==='입사 확정'),hireAvg=hrAverage(hired.map(c=>hrMetrics(c,job).hire)),fillAvg=hrAverage(hired.map(c=>hrMetrics(c,job).fill));
 document.getElementById('hrDetail').innerHTML=`<section class="panel hr-detail"><div class="panel-title">${escapeHtml(job.title)}<a class="entity-link" target="_blank" rel="noopener" href="https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=${encodeURIComponent(job.gi_no)}">원문 ↗</a></div>
 <form id="hrJobForm" class="hr-form"><label>프로젝트<input name="project" required maxlength="100" value="${escapeHtml(job.project)}"></label><label>상태<select name="status">${[['open','오픈'],['hold','보류'],['closed','마감']].map(([v,t])=>`<option value="${v}" ${v===(job.status==='unknown'?'hold':job.status)?'selected':''}>${t}</option>`).join('')}</select></label><label>공고 오픈일<input name="opened" type="date" max="${hrToday()}" value="${job.opened}"></label><label>마감일<input name="closed" type="date" max="${hrToday()}" value="${job.closed}"></label><label class="hr-wide">공고 메모<textarea name="memo" rows="2" maxlength="5000" placeholder="TO 변경, 채용 우선순위, 인터뷰 유의사항">${escapeHtml(job.memo)}</textarea></label><button class="hr-primary" type="submit">공고 정보 저장</button></form>
 <details class="hr-competitors"><summary>경쟁 공고 확인</summary><div id="hrCompetitors"></div></details>
 <div class="hr-lead"><span>평균 지원→확정 <b>${hireAvg===null?'—':hireAvg+'일'}</b></span><span>평균 오픈→확정 <b>${fillAvg===null?'—':fillAvg+'일'}</b></span><small>입사 확정 ${hired.length}명 기준 · 날짜 미입력 제외</small></div>
 <h3>후보자 등록</h3><form id="hrCandidateForm" class="hr-form"><label>후보자명<input name="name" required maxlength="80" placeholder="성명 또는 관리용 별칭"></label><label>지원일<input name="applied" required type="date" max="${hrToday()}" value="${hrToday()}"></label><label class="hr-wide">후보자 메모<input name="memo" maxlength="2000" placeholder="지원 경로, 확인할 사항 등"></label><button class="hr-primary" type="submit">후보자 등록</button></form>
 <h3>후보자 단계별 진행 <small>${cs.length}명</small></h3><p class="hr-notice">단계를 변경하면 이력이 기록됩니다. 과거 단계는 기록된 날짜만 계산하며, 건너뛴 단계의 소요일은 추정하지 않습니다.</p><div class="hr-board">${HR_STAGES.map(stage=>`<section class="hr-column"><h4>${stage}<span>${cs.filter(c=>hrStage(c)===stage).length}</span></h4>${cs.filter(c=>hrStage(c)===stage).map(c=>hrCandidateCard(c,job)).join('')||'<p class="hr-empty">후보자 없음</p>'}</section>`).join('')}</div></section>`;
 const latest=(typeof monthlyArchive!=='undefined'&&monthlyArchive.length?monthlyArchive:snapshots).at(-1),cats=jobCategories(job);
 const competitors=(latest?.jobs||[]).filter(j=>!(j.company_name||'').includes('콩스튜디오')&&jobCategories(j).some(c=>cats.includes(c)));
 document.getElementById('hrCompetitors').innerHTML=competitors.slice(0,10).map(j=>`<a class="competitor-example-link" href="https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=${encodeURIComponent(j.gi_no)}" target="_blank" rel="noopener"><span class="ce-company">${escapeHtml(j.company_name)}</span><span class="ce-title">${escapeHtml(j.title)}</span></a>`).join('')||'<p class="hr-notice">동일 직무의 경쟁 공고가 없습니다.</p>';
 document.getElementById('hrJobForm').onsubmit=e=>{e.preventDefault();hrRun(()=>{const f=new FormData(e.target),next={title:job.title,project:f.get('project').trim(),status:f.get('status'),opened:f.get('opened'),closed:f.get('closed'),memo:f.get('memo'),categories:job.job_categories||''};if(!next.project)throw Error('프로젝트명을 입력해주세요.');if(next.closed&&next.status!=='closed')throw Error('마감일은 마감 상태에서 입력해주세요.');if(next.opened&&hired.some(c=>c.history.find(h=>h.stage==='입사 확정').date<next.opened))throw Error('공고 오픈일은 후보자 입사 확정일보다 늦을 수 없습니다.');const data=hrRead();data.jobs[job.gi_no]=next;hrWrite(data);hrRender();});};
 document.getElementById('hrCandidateForm').onsubmit=e=>{e.preventDefault();hrRun(()=>{const f=new FormData(e.target),name=f.get('name').trim(),date=f.get('applied');if(!name)throw Error('후보자명을 입력해주세요.');const data=hrRead();hrRemember(data,job);data.candidates.push({id:crypto.randomUUID(),jobId:job.gi_no,name,applied:date,memo:f.get('memo'),history:[{stage:'지원',date,recordedAt:new Date().toISOString()}]});hrWrite(data);hrRender();});};
 document.querySelectorAll('.hr-candidate-form').forEach(form=>form.onsubmit=e=>{e.preventDefault();hrRun(()=>{const f=new FormData(form),data=hrRead(),c=data.candidates.find(c=>c.id===form.dataset.id),stage=f.get('stage'),date=f.get('date');if(!f.get('name').trim())throw Error('후보자명을 입력해주세요.');if(stage!==hrStage(c)){if(date<c.history.at(-1).date||date<c.applied||date>hrToday())throw Error('변경일은 이전 단계 날짜 이후부터 오늘까지 입력해주세요.');if(hrStage(c)==='입사 확정')throw Error('입사 확정 기록을 수정하려면 마지막 단계 취소 후 변경해주세요.');if(stage==='입사 확정'&&job.opened&&date<job.opened)throw Error('입사 확정일은 공고 오픈일 이후여야 합니다.');c.history.push({stage,date,recordedAt:new Date().toISOString()});}c.name=f.get('name').trim();c.memo=f.get('memo');hrWrite(data);hrRender();});});
 document.querySelectorAll('.hr-delete').forEach(b=>b.onclick=()=>hrRun(()=>{if(!confirm('이 후보자와 단계 이력을 삭제할까요? 필요하면 먼저 기록을 백업해주세요.'))return;const data=hrRead();data.candidates=data.candidates.filter(c=>c.id!==b.dataset.id);hrWrite(data);hrRender();}));
 document.querySelectorAll('.hr-undo').forEach(b=>b.onclick=()=>hrRun(()=>{if(!confirm('마지막 단계 변경을 취소할까요?'))return;const data=hrRead(),c=data.candidates.find(c=>c.id===b.dataset.id);if(c.history.length>1)c.history.pop();hrWrite(data);hrRender();}));
}
function hrCandidateCard(c,job){
 const m=hrMetrics(c,job),terminal=HR_TERMINAL.has(hrStage(c));
 return `<article class="hr-candidate"><strong>${escapeHtml(c.name)}</strong><p>지원 ${c.applied} · ${m.elapsed??'—'}일${terminal?' 소요':' 경과'}</p>${m.stageDays!==null?`<p>현재 단계 ${m.stageDays}일째</p>`:''}${m.hire!==null?`<p class="up-text">지원→확정 ${m.hire}일</p>`:''}
 <details><summary>단계 변경 · 기록</summary><form class="hr-candidate-form" data-id="${escapeHtml(c.id)}"><label>후보자명<input name="name" required maxlength="80" value="${escapeHtml(c.name)}"></label><label>단계<select name="stage">${HR_STAGES.map(s=>`<option ${hrStage(c)===s?'selected':''}>${s}</option>`).join('')}</select></label><label>단계 변경일<input name="date" required type="date" min="${c.history.at(-1).date}" max="${hrToday()}" value="${hrToday()}"></label><label>메모<textarea name="memo" maxlength="2000" rows="3">${escapeHtml(c.memo)}</textarea></label><button type="submit" class="hr-primary">저장</button></form><ol class="hr-history">${c.history.map((h,i)=>`<li>${escapeHtml(h.stage)} · ${h.date}${i<c.history.length-1?` <small>${hrDays(h.date,c.history[i+1].date)}일 체류</small>`:''}</li>`).join('')}</ol>${c.history.length>1?`<button class="chip hr-undo" data-id="${escapeHtml(c.id)}">마지막 단계 취소</button>`:''}<button class="chip hr-delete" data-id="${escapeHtml(c.id)}">후보자 삭제</button></details></article>`;
}

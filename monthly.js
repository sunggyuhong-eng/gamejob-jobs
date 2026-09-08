/* Monthly comparison layer. Keeps existing company, report and recruitment tools. */
let monthlyArchive = [], moverMode = 'increase', changeMode = 'new', changeLimit = 30;
const originalRender = render;
const originalReportPrompt = buildReportPrompt;
function monthlyRepresentatives(parsed) {
  const months = new Map();
  parsed.filter(s => s && s.date !== '2026-08-01' && s.jobs.length).sort((a,b)=>a.date.localeCompare(b.date)).forEach(s=>{
    if(!months.has(s.date.slice(0,7))) months.set(s.date.slice(0,7),s);
  });
  return [...months.values()];
}
applySnapshots = function(parsed){
  monthlyArchive = monthlyRepresentatives(parsed);
  if(!monthlyArchive.length){document.getElementById('emptyState').textContent='비교할 실제 수집 자료가 없어요. 임시 8월 자료는 제외됩니다.';return;}
  const select = document.getElementById('monthSelect');
  select.innerHTML = [...monthlyArchive].reverse().map(s=>`<option value="${escapeHtml(s.date)}">${escapeHtml(s.date.slice(0,7))}</option>`).join('');
  select.onchange=()=>chooseMonth(select.value);
  chooseMonth(select.value);
};
function chooseMonth(date){
  snapshots=monthlyArchive.filter(s=>s.date<=date);
  selected={company:null,category:null,employment:null};
  ['company','category','employment'].forEach(kind=>{const el=document.getElementById(kind+'Detail');if(el){el.innerHTML='';el.classList.remove('show');}});
  const companyList=document.getElementById('companyListSection');if(companyList)companyList.style.display='';
  document.getElementById('reportPromptEditor').dataset.userEdited='';
  changeLimit=30;
  originalRender();
  renderMonthlySurface();
}
tryAutoLoad = async function(){
  try {
    const manifest=await fetch('data/snapshots/index.json',{cache:'no-store'});
    if(!manifest.ok) return false;
    const names=await manifest.json();
    const parsed=await Promise.all(names.filter(n=>/^\d{4}-\d{2}-\d{2}\.csv$/.test(n)&&n!=='2026-08-01.csv').map(async name=>{
      const response=await fetch('data/snapshots/'+name,{cache:'no-store'});
      if(!response.ok) throw new Error('일부 월의 자료를 불러오지 못했습니다.');
      const csv=Papa.parse(await response.text(),{header:true,skipEmptyLines:true});
      if(csv.errors.length || !csv.meta.fields.includes('gi_no')) throw new Error('자료 형식을 확인해주세요.');
      let meta=null;
      try {const r=await fetch('data/snapshots/'+name.replace('.csv','.meta.json'),{cache:'no-store'});if(r.ok)meta=await r.json();}catch(e){}
      return {date:name.slice(0,10), jobs:csv.data.filter(j=>j.gi_no),meta};
    }));
    applySnapshots(parsed);
    return monthlyArchive.length>0;
  }catch(error){return false;}
};
function changesForSelection(){
  const cur=snapshots.at(-1),prev=snapshots.at(-2);
  if(!prev)return {new:[],removed:[],prev:null,cur};
  const a=new Set(prev.jobs.map(j=>j.gi_no)),b=new Set(cur.jobs.map(j=>j.gi_no));
  return {new:cur.jobs.filter(j=>!a.has(j.gi_no)),removed:prev.jobs.filter(j=>!b.has(j.gi_no)),prev,cur};
}
renderStats=function(){
  const d=changesForSelection(),delta=d.new.length-d.removed.length;
  const cards=[['전체 공고',d.cur.jobs.length.toLocaleString(),''],['신규 공고',d.prev?'+'+d.new.length.toLocaleString():'—','up'],['소멸 공고',d.prev?'−'+d.removed.length.toLocaleString():'—','down'],['순증감',d.prev?(delta>0?'+':'')+delta.toLocaleString():'—',delta>0?'up':delta<0?'down':'']];
  document.getElementById('statRow').innerHTML=cards.map(([label,num,cls])=>`<div class="stat-card"><div class="label">${label}</div><div class="num ${cls}">${num}<small>건</small></div></div>`).join('');
};
function movementRows(kind){
  const d=changesForSelection(), counts=new Map();
  const keys=j=>kind==='company'?[j.company_name||'미분류']:jobCategories(j);
  const add=(jobs,field)=>jobs.forEach(j=>new Set(keys(j)).forEach(name=>{
    if(!counts.has(name))counts.set(name,{name,new:0,removed:0,current:0,previous:0});
    counts.get(name)[field]++;
  }));
  add(d.cur.jobs,'current');if(d.prev)add(d.prev.jobs,'previous');add(d.new,'new');add(d.removed,'removed');
  return [...counts.values()].map(e=>({...e,delta:e.current-e.previous}));
}
function renderMovers(){
  const d=changesForSelection();
  if(!d.prev){document.getElementById('moverTables').innerHTML='<p class="placeholder-hint">현재는 첫 기준 자료만 있어요. 다음 달 실제 자료 수집 후 기업·직무별 신규, 소멸, 순증감을 비교합니다.</p>';return;}
  document.getElementById('moverTables').innerHTML=['company','category'].map(kind=>{
    let rows=movementRows(kind);
    if(moverMode==='increase')rows=rows.filter(e=>e.delta>0).sort((a,b)=>b.delta-a.delta);
    else if(moverMode==='decrease')rows=rows.filter(e=>e.delta<0).sort((a,b)=>a.delta-b.delta);
    else rows=rows.filter(e=>e[moverMode]>0).sort((a,b)=>b[moverMode]-a[moverMode]);
    return `<div><h3 class="movement-title">${kind==='company'?'기업별 변화':'직무별 변화'}</h3><div class="table-scroll"><table class="movement-table"><thead><tr><th>${kind==='company'?'기업':'직무'}</th><th>신규</th><th>소멸</th><th>순증감</th></tr></thead><tbody>${rows.slice(0,8).map(e=>`<tr><td><button class="entity-link" data-kind="${kind}" data-name="${escapeHtml(e.name)}">${escapeHtml(e.name)}</button></td><td class="up-text">+${e.new}</td><td class="down-text">−${e.removed}</td><td class="${e.delta>0?'up-text':e.delta<0?'down-text':''}">${e.delta>0?'+':''}${e.delta}</td></tr>`).join('')||'<tr><td colspan="4">해당하는 변화가 없어요.</td></tr>'}</tbody></table></div></div>`;
  }).join('');
  document.querySelectorAll('.entity-link').forEach(b=>b.onclick=()=>goToEntityDetail(b.dataset.kind,b.dataset.name));
}
function renderChangedJobs(){
  const d=changesForSelection(),q=document.getElementById('changeSearch').value.trim().toLowerCase();
  const rows=d[changeMode].filter(j=>(j.company_name+' '+j.title).toLowerCase().includes(q));
  document.getElementById('changedJobs').innerHTML=rows.slice(0,changeLimit).map(j=>`<div class="change-job"><span>${escapeHtml(j.company_name||'')}</span><a href="https://www.gamejob.co.kr/List_GI/GIB_Read.asp?GI_No=${encodeURIComponent(j.gi_no)}" target="_blank" rel="noopener">${escapeHtml(j.title||'공고 보기')}</a><small>${escapeHtml(j.career||'')}</small></div>`).join('')||`<p class="placeholder-hint">${!d.prev?'비교할 이전 달 자료가 아직 없어요.':'조건에 맞는 공고가 없어요.'}</p>`;
  document.getElementById('moreChanges').hidden=rows.length<=changeLimit;
  document.getElementById('newJobsToggle').classList.toggle('active',changeMode==='new');
  document.getElementById('removedJobsToggle').classList.toggle('active',changeMode==='removed');
}
function renderMonthlySurface(){
  const d=changesForSelection();
  const period=d.prev?`${d.prev.date} → ${d.cur.date}`:`${d.cur.date} · 첫 기준 자료`;
  const offCycle=snapshots.slice(-2).some(s=>!s.date.endsWith('-01'));
  const time=d.cur.meta?.started_at?` · 실제 수집 ${new Date(d.cur.meta.started_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST`:'';
  document.getElementById('periodNote').textContent=`${period}${time}${offCycle?' · 월초 외 수집 자료 포함':''} · 임시 8월 자료 제외`;
  renderMovers();renderChangedJobs();
}
document.getElementById('moverControls').onclick=e=>{if(!e.target.dataset.mover)return;moverMode=e.target.dataset.mover;document.querySelectorAll('[data-mover]').forEach(b=>b.classList.toggle('active',b===e.target));renderMovers();};
document.getElementById('newJobsToggle').onclick=()=>{changeMode='new';changeLimit=30;renderChangedJobs();};
document.getElementById('removedJobsToggle').onclick=()=>{changeMode='removed';changeLimit=30;renderChangedJobs();};
document.getElementById('changeSearch').oninput=()=>{changeLimit=30;renderChangedJobs();};
document.getElementById('moreChanges').onclick=()=>{changeLimit+=30;renderChangedJobs();};
buildReportPrompt=function(stats){
  const d=changesForSelection();
  return originalReportPrompt(stats)+`\n\n[비교 해석 원칙]\n실제 비교 기간: ${stats.prevDate} ~ ${stats.date}. 신규 확인 ${d.new.length}건, 소멸(미노출) ${d.removed.length}건. 각 달 첫 수집 시점의 차이이며 월중 생성 후 월중 마감된 공고는 집계되지 않는다. 소멸을 채용 완료나 감원으로 단정하지 않는다. 월초 외 수집 자료가 있으면 명시한다. 원문 URL을 확인하지 못한 뉴스는 확인 불가로 표시한다.`;
};
const definition=document.createElement('p');definition.className='market-footnote';definition.textContent='신규 = 이전 기준에 없던 공고 · 소멸 = 이전 기준에 있었으나 현재 보이지 않는 공고 · 순증감 = 신규 − 소멸. 공고 수는 채용 인원과 다르며, 월중 생성·마감된 공고는 월초 비교에 포함되지 않습니다. 직무는 복수 집계될 수 있어요. 소멸 공고의 원문은 열리지 않을 수 있습니다.';document.getElementById('statRow').after(definition);

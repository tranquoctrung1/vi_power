// ============================================================
// CONSTANTS
// ============================================================
const AREA_NAMES  = {bom:'Trạm Bơm Tổng',xl:'Khu Xử Lý',vp:'Văn Phòng'};
const AREA_COLORS = {bom:'#38aaff',xl:'#a855f7',vp:'#22d369'};
const DEVICES = [
  {id:'TB-01',name:'Trạm Bơm 1',    area:'bom'},
  {id:'TB-02',name:'Trạm Bơm 2',    area:'bom'},
  {id:'XL-01',name:'Máy Bơm Xử Lý',area:'xl'},
  {id:'VP-01',name:'Văn Phòng',      area:'vp'},
];
const ALERT_TYPES = ['Áp suất','Nhiệt độ','Điện áp','Dòng điện','Kết nối','Hiệu suất'];
const LEVEL_CONFIG = {
  critical:{label:'Critical',color:'var(--red)',   icon:'bi-x-octagon-fill'},
  warning: {label:'Warning', color:'var(--orange)',icon:'bi-exclamation-triangle-fill'},
  info:    {label:'Info',    color:'var(--accent)',icon:'bi-info-circle-fill'},
  ok:      {label:'OK',      color:'var(--green)', icon:'bi-check-circle-fill'},
};
const MESSAGES = {
  'Áp suất':   {hi:'Áp suất đầu ra vượt ngưỡng cho phép',lo:'Áp suất thấp hơn mức tối thiểu'},
  'Nhiệt độ':  {hi:'Nhiệt độ cuộn dây động cơ quá cao',lo:'Nhiệt độ bất thường thấp'},
  'Điện áp':   {hi:'Điện áp pha vượt ngưỡng +10%',lo:'Sụt áp nghiêm trọng'},
  'Dòng điện': {hi:'Dòng điện vượt 115% định mức',lo:'Dòng điện thấp bất thường — có thể mất tải'},
  'Kết nối':   {hi:'Mất tín hiệu LoRaWAN quá 5 phút',lo:'Tín hiệu yếu'},
  'Hiệu suất': {hi:'Hiệu suất bơm giảm >20% so baseline',lo:''},
};

// ============================================================
// DATA GENERATION
// ============================================================
let allAlerts = [];
let nextId = 1;

function seededRand(s){ return ()=>{ s=(s*9301+49297)%233280; return s/233280; }; }

function generateAlerts(){
  const rand = seededRand(42);
  const now = new Date();
  const alerts = [];

  for(let i=0; i<180; i++){
    const dev = DEVICES[Math.floor(rand()*DEVICES.length)];
    const type = ALERT_TYPES[Math.floor(rand()*ALERT_TYPES.length)];
    const r = rand();
    const level = r<0.15?'critical': r<0.5?'warning': r<0.7?'info':'ok';
    const hoursAgo = Math.floor(rand()*720); // up to 30 days
    const time = new Date(now.getTime() - hoursAgo*3600000);
    const r2 = rand();
    const status = hoursAgo<12?(r2<0.3?'new':'seen'): r2<0.7?'resolved':'seen';
    const isHi = rand()>0.4;
    const msgObj = MESSAGES[type]||{hi:'Bất thường phát hiện',lo:'Giá trị thấp bất thường'};
    const msg = isHi?msgObj.hi:msgObj.lo||msgObj.hi;

    // Simulated values
    const thresholds = {'Áp suất':'6.5 bar','Nhiệt độ':'85°C','Điện áp':'242V','Dòng điện':'115A','Kết nối':'5 phút','Hiệu suất':'0.72 kWh/m³'};
    const values     = {'Áp suất':(6.5+rand()*2).toFixed(1)+' bar','Nhiệt độ':(75+rand()*30).toFixed(0)+'°C','Điện áp':(220+rand()*30).toFixed(0)+'V','Dòng điện':(100+rand()*40).toFixed(0)+'A','Kết nối':(5+rand()*15).toFixed(0)+' phút','Hiệu suất':(0.6+rand()*0.3).toFixed(2)+' kWh/m³'};

    alerts.push({
      id: nextId++,
      time, timeStr: time.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),
      device: dev.name, deviceId: dev.id, area: dev.area,
      type, level, status,
      message: msg,
      value: values[type]||'--',
      threshold: thresholds[type]||'--',
      note: status==='resolved'?'Đã kiểm tra và khắc phục.':'',
      selected: false,
    });
  }
  // Sort newest first
  alerts.sort((a,b)=>b.time-a.time);
  return alerts;
}

// ============================================================
// STATE
// ============================================================
let state = {
  levelFilter:'all', areaFilter:'all', deviceFilter:'all',
  typeFilter:'all', statusFilter:'all', search:'',
  dateFrom:'', dateTo:'',
  sortCol:'time', sortDir:'desc',
  page:1, pageSize:20,
  filtered:[],
};

// ============================================================
// UTILS
// ============================================================
const fmt = n=>Number(n).toLocaleString('vi-VN');
function showToast(msg,type='info'){
  const tc=document.getElementById('toastContainer');
  const t=document.createElement('div'); t.className='toast';
  const cols={info:'var(--accent)',ok:'var(--green)',warn:'var(--yellow)',error:'var(--red)'};
  const ics={info:'bi-info-circle-fill',ok:'bi-check-circle-fill',warn:'bi-exclamation-triangle-fill',error:'bi-x-circle-fill'};
  t.innerHTML=`<i class="bi ${ics[type]||ics.info}" style="color:${cols[type]||cols.info};font-size:16px;"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(()=>{t.classList.add('fade-out');setTimeout(()=>t.remove(),350);},3000);
}

// ============================================================
// KPI STRIP
// ============================================================
function updateKPIs(){
  const today = new Date(); today.setHours(0,0,0,0);
  const todayAlerts = allAlerts.filter(a=>a.time>=today);
  document.getElementById('kpiTotalVal').textContent     = todayAlerts.length;
  document.getElementById('kpiCriticalVal').textContent  = todayAlerts.filter(a=>a.level==='critical').length;
  document.getElementById('kpiWarningVal').textContent   = todayAlerts.filter(a=>a.level==='warning').length;
  document.getElementById('kpiOkVal').textContent        = todayAlerts.filter(a=>a.level==='ok').length;
  document.getElementById('kpiUnresolvedVal').textContent= allAlerts.filter(a=>a.status==='new').length;
  document.getElementById('sidebarBadge').textContent    = allAlerts.filter(a=>a.status==='new').length;
}

// ============================================================
// TIMELINE CHART
// ============================================================
let chartTimeline=null;
function updateTimeline(){
  const now=new Date(); const days=30;
  const labels=[], dataCrit=[], dataWarn=[], dataOk=[];
  for(let i=days-1;i>=0;i--){
    const d=new Date(now); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
    const next=new Date(d); next.setDate(next.getDate()+1);
    const dayAlerts=allAlerts.filter(a=>a.time>=d&&a.time<next);
    labels.push(d.toLocaleDateString('vi-VN',{day:'numeric',month:'numeric'}));
    dataCrit.push(dayAlerts.filter(a=>a.level==='critical').length);
    dataWarn.push(dayAlerts.filter(a=>a.level==='warning').length);
    dataOk.push(dayAlerts.filter(a=>a.level==='ok'||a.level==='info').length);
  }
  if(!chartTimeline){
    chartTimeline=new Chart(document.getElementById('chartTimeline'),{
      type:'bar',
      data:{labels,datasets:[
        {label:'Critical',data:dataCrit,backgroundColor:'rgba(244,75,75,.75)',borderRadius:2,stack:'A'},
        {label:'Warning', data:dataWarn,backgroundColor:'rgba(255,112,67,.65)',borderRadius:2,stack:'A'},
        {label:'OK/Info', data:dataOk, backgroundColor:'rgba(34,211,105,.55)',borderRadius:2,stack:'A'},
      ]},
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{
          backgroundColor:'#111c2b',borderColor:'rgba(56,139,253,.28)',borderWidth:1,
          bodyColor:'#e6eef8',padding:8,mode:'index',intersect:false,
        }},
        scales:{
          x:{grid:{display:false},ticks:{color:'#3a506b',font:{family:'JetBrains Mono',size:9},maxTicksLimit:10},stacked:true},
          y:{grid:{color:'rgba(56,139,253,.06)'},ticks:{color:'#607b99',font:{family:'JetBrains Mono',size:10}},stacked:true,beginAtZero:true},
        }
      }
    });
  } else {
    chartTimeline.data.labels=labels;
    chartTimeline.data.datasets[0].data=dataCrit;
    chartTimeline.data.datasets[1].data=dataWarn;
    chartTimeline.data.datasets[2].data=dataOk;
    chartTimeline.update();
  }
}

// ============================================================
// DEVICE DISTRIBUTION
// ============================================================
function updateDistribution(){
  const counts={}; DEVICES.forEach(d=>{counts[d.id]=0;});
  allAlerts.filter(a=>a.status!=='resolved').forEach(a=>{ counts[a.deviceId]=(counts[a.deviceId]||0)+1; });
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;
  document.getElementById('distList').innerHTML=sorted.map(([id,cnt])=>{
    const dev=DEVICES.find(d=>d.id===id);
    const color=AREA_COLORS[dev?.area]||'var(--accent)';
    return `<div class="dist-row">
      <span class="dist-label">${dev?.name||id}</span>
      <div class="dist-track"><div class="dist-fill" style="width:${cnt/max*100}%;background:${color};"></div></div>
      <span class="dist-count" style="color:${color};">${cnt}</span>
    </div>`;
  }).join('');
}

// ============================================================
// FILTER + RENDER TABLE
// ============================================================
function applyFilters(){
  let data=[...allAlerts];

  if(state.levelFilter!=='all')  data=data.filter(a=>a.level===state.levelFilter);
  if(state.areaFilter!=='all')   data=data.filter(a=>a.area===state.areaFilter);
  if(state.deviceFilter!=='all') data=data.filter(a=>a.deviceId===state.deviceFilter);
  if(state.typeFilter!=='all')   data=data.filter(a=>a.type===state.typeFilter);
  if(state.statusFilter!=='all') data=data.filter(a=>a.status===state.statusFilter);

  if(state.search){
    const q=state.search.toLowerCase();
    data=data.filter(a=>a.message.toLowerCase().includes(q)||a.device.toLowerCase().includes(q)||a.type.toLowerCase().includes(q));
  }
  if(state.dateFrom){ const f=new Date(state.dateFrom); data=data.filter(a=>a.time>=f); }
  if(state.dateTo){ const t=new Date(state.dateTo); t.setHours(23,59,59); data=data.filter(a=>a.time<=t); }

  // Sort
  data.sort((a,b)=>{
    const va=a[state.sortCol]==='time'?a.time.getTime():a[state.sortCol];
    const vb=b[state.sortCol]==='time'?b.time.getTime():b[state.sortCol];
    if(typeof va==='string') return state.sortDir==='asc'?va.localeCompare(vb):vb.localeCompare(va);
    return state.sortDir==='asc'?va-vb:vb-va;
  });

  state.filtered=data;
  renderTable();
}

function renderTable(){
  const data=state.filtered;
  const ps=state.pageSize;
  const totalPages=Math.max(1,Math.ceil(data.length/ps));
  state.page=Math.min(state.page,totalPages);
  const pageData=data.slice((state.page-1)*ps,state.page*ps);

  document.getElementById('tableInfo').textContent=`${fmt(data.length)} bản ghi`;
  document.getElementById('pageInfo').textContent=`Trang ${state.page}/${totalPages} · ${fmt(data.length)} bản ghi`;

  const tbody=document.getElementById('alertTableBody');
  tbody.innerHTML=pageData.map(a=>{
    const lc=LEVEL_CONFIG[a.level]||LEVEL_CONFIG.info;
    const ac=AREA_COLORS[a.area]||'var(--accent)';
    const isUnread=a.status==='new';
    return `<tr class="${isUnread?'unread':''}" data-id="${a.id}">
      <td style="padding:9px 8px;"><input type="checkbox" class="row-check" data-id="${a.id}" style="accent-color:var(--accent);cursor:pointer;" ${a.selected?'checked':''}></td>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);white-space:nowrap;">${a.timeStr}</td>
      <td style="font-weight:500;white-space:nowrap;">${a.device}</td>
      <td><span class="area-tag" style="background:${ac}18;color:${ac};">${AREA_NAMES[a.area]||a.area}</span></td>
      <td style="font-size:12px;color:var(--text-muted);">${a.type}</td>
      <td style="font-size:12.5px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.message}">${a.message}</td>
      <td><span class="level-badge ${a.level}"><i class="bi ${lc.icon}"></i>${lc.label}</span></td>
      <td><span class="status-badge ${a.status}">${a.status==='new'?'Mới':a.status==='seen'?'Đã xem':'Đã xử lý'}</span></td>
      <td>
        <div style="display:flex;gap:4px;">
          ${a.status!=='resolved'?`<button class="action-btn resolve" data-action="resolve" data-id="${a.id}"><i class="bi bi-check"></i></button>`:''}
          <button class="action-btn" data-action="detail" data-id="${a.id}"><i class="bi bi-eye"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Sort indicators
  document.querySelectorAll('.alert-table thead th[data-col]').forEach(th=>{
    th.classList.remove('sort-asc','sort-desc');
    if(th.dataset.col===state.sortCol) th.classList.add(state.sortDir==='asc'?'sort-asc':'sort-desc');
  });

  renderPagination(totalPages);
  updateBulkBar();
}

function renderPagination(total){
  const pg=document.getElementById('pagination');
  let html=`<button class="page-btn" onclick="goPage(${state.page-1})" ${state.page<=1?'disabled':''}><i class="bi bi-chevron-left"></i></button>`;
  const range=[];
  for(let i=1;i<=total;i++){
    if(i===1||i===total||Math.abs(i-state.page)<=2) range.push(i);
    else if(range[range.length-1]!=='…') range.push('…');
  }
  range.forEach(p=>{
    if(p==='…') html+=`<span style="color:var(--text-dim);padding:0 4px;">…</span>`;
    else html+=`<button class="page-btn ${p===state.page?'active':''}" onclick="goPage(${p})">${p}</button>`;
  });
  html+=`<button class="page-btn" onclick="goPage(${state.page+1})" ${state.page>=total?'disabled':''}><i class="bi bi-chevron-right"></i></button>`;
  pg.innerHTML=html;
}
window.goPage=p=>{state.page=p;renderTable();};

// ============================================================
// BULK ACTIONS
// ============================================================
function updateBulkBar(){
  const selected=allAlerts.filter(a=>a.selected);
  const bar=document.getElementById('bulkBar');
  if(selected.length>0){
    bar.classList.remove('hidden');
    document.getElementById('bulkCount').textContent=`${selected.length} mục được chọn`;
  } else {
    bar.classList.add('hidden');
  }
}

function getAlertById(id){ return allAlerts.find(a=>a.id===parseInt(id)); }

// ============================================================
// DETAIL MODAL
// ============================================================
let currentAlertId=null;
function openModal(id){
  const a=getAlertById(id); if(!a) return;
  currentAlertId=id;
  // Mark as seen
  if(a.status==='new'){ a.status='seen'; updateKPIs(); renderTable(); }

  const lc=LEVEL_CONFIG[a.level]||LEVEL_CONFIG.info;
  document.getElementById('modalLevelBadge').innerHTML=`<span class="level-badge ${a.level}"><i class="bi ${lc.icon}"></i>${lc.label}</span>`;
  document.getElementById('modalTitle').textContent=a.message;
  document.getElementById('mDevice').textContent=`${a.device} (${a.deviceId})`;
  document.getElementById('mArea').textContent=AREA_NAMES[a.area]||a.area;
  document.getElementById('mTime').textContent=a.time.toLocaleString('vi-VN');
  document.getElementById('mType').textContent=a.type;
  document.getElementById('mMessage').textContent=a.message;
  document.getElementById('mValue').textContent=a.value;
  document.getElementById('mValue').style.color=lc.color;
  document.getElementById('mThresh').textContent=a.threshold;
  document.getElementById('mNote').value=a.note||'';

  const resolveBtn=document.getElementById('modalResolveBtn');
  if(a.status==='resolved'){
    resolveBtn.textContent='✓ Đã xử lý';
    resolveBtn.style.background='var(--green)';
    resolveBtn.disabled=true;
  } else {
    resolveBtn.innerHTML='<i class="bi bi-check-circle" style="margin-right:5px;"></i>Đánh dấu đã xử lý';
    resolveBtn.style.background='var(--accent)';
    resolveBtn.disabled=false;
  }

  document.getElementById('modalBackdrop').classList.add('open');
}
function closeModal(){ document.getElementById('modalBackdrop').classList.remove('open'); }

// ============================================================
// EVENTS
// ============================================================
document.getElementById('modalClose').addEventListener('click',closeModal);
document.getElementById('modalCloseBtn').addEventListener('click',closeModal);
document.getElementById('modalBackdrop').addEventListener('click',e=>{ if(e.target===document.getElementById('modalBackdrop')) closeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });

// Modal resolve
document.getElementById('modalResolveBtn').addEventListener('click',()=>{
  const a=getAlertById(currentAlertId); if(!a||a.status==='resolved') return;
  a.status='resolved'; a.note=document.getElementById('mNote').value;
  closeModal(); updateKPIs(); updateDistribution(); applyFilters();
  showToast(`Đã xử lý: ${a.message.substring(0,40)}...`,'ok');
});

// Table click (row → detail, action btn → resolve/detail)
document.getElementById('alertTableBody').addEventListener('click',e=>{
  const btn=e.target.closest('[data-action]');
  const row=e.target.closest('tr[data-id]');
  const chk=e.target.closest('.row-check');
  if(chk){ // checkbox
    const a=getAlertById(chk.dataset.id); if(a){ a.selected=chk.checked; updateBulkBar(); } return;
  }
  if(btn){
    if(btn.dataset.action==='resolve'){
      const a=getAlertById(btn.dataset.id); if(!a) return;
      a.status='resolved'; updateKPIs(); updateDistribution(); applyFilters();
      showToast('Đã đánh dấu xử lý','ok'); return;
    }
    if(btn.dataset.action==='detail'){ openModal(parseInt(btn.dataset.id)); return; }
  }
  if(row&&!chk){ openModal(parseInt(row.dataset.id)); }
});

// Check all
document.getElementById('checkAll').addEventListener('change',e=>{
  const ps=state.pageSize;
  const pageData=state.filtered.slice((state.page-1)*ps,state.page*ps);
  pageData.forEach(a=>{ a.selected=e.target.checked; });
  renderTable(); updateBulkBar();
});

// Bulk actions
document.getElementById('btnBulkResolve').addEventListener('click',()=>{
  const n=allAlerts.filter(a=>a.selected).length;
  allAlerts.filter(a=>a.selected).forEach(a=>{ a.status='resolved'; a.selected=false; });
  updateKPIs(); updateDistribution(); applyFilters();
  showToast(`Đã xử lý ${n} cảnh báo`,'ok');
});
document.getElementById('btnBulkSeen').addEventListener('click',()=>{
  allAlerts.filter(a=>a.selected&&a.status==='new').forEach(a=>{ a.status='seen'; a.selected=false; });
  updateKPIs(); applyFilters();
  showToast('Đã đánh dấu đã xem','ok');
});
document.getElementById('btnBulkClear').addEventListener('click',()=>{
  allAlerts.forEach(a=>a.selected=false); renderTable(); updateBulkBar();
});

// Sort
document.querySelectorAll('.alert-table thead th[data-col]').forEach(th=>{
  th.addEventListener('click',()=>{
    if(state.sortCol===th.dataset.col) state.sortDir=state.sortDir==='asc'?'desc':'asc';
    else{ state.sortCol=th.dataset.col; state.sortDir='desc'; }
    state.page=1; applyFilters();
  });
});

// Filters
document.getElementById('searchInput').addEventListener('input',e=>{ state.search=e.target.value; state.page=1; applyFilters(); });
document.getElementById('filterArea').addEventListener('change',e=>{ state.areaFilter=e.target.value; state.page=1; applyFilters(); });
document.getElementById('filterDevice').addEventListener('change',e=>{ state.deviceFilter=e.target.value; state.page=1; applyFilters(); });
document.getElementById('filterType').addEventListener('change',e=>{ state.typeFilter=e.target.value; state.page=1; applyFilters(); });
document.getElementById('filterStatus').addEventListener('change',e=>{ state.statusFilter=e.target.value; state.page=1; applyFilters(); });
document.getElementById('dateFrom').addEventListener('change',e=>{ state.dateFrom=e.target.value; state.page=1; applyFilters(); });
document.getElementById('dateTo').addEventListener('change',e=>{ state.dateTo=e.target.value; state.page=1; applyFilters(); });
document.getElementById('pageSize').addEventListener('change',e=>{ state.pageSize=parseInt(e.target.value); state.page=1; renderTable(); });

// Reset filter
document.getElementById('btnResetFilter').addEventListener('click',()=>{
  ['searchInput'].forEach(id=>document.getElementById(id).value='');
  ['filterArea','filterDevice','filterType','filterStatus'].forEach(id=>document.getElementById(id).value='all');
  ['dateFrom','dateTo'].forEach(id=>document.getElementById(id).value='');
  document.querySelectorAll('.kpi-cell').forEach(c=>c.classList.remove('selected'));
  Object.assign(state,{levelFilter:'all',areaFilter:'all',deviceFilter:'all',typeFilter:'all',statusFilter:'all',search:'',dateFrom:'',dateTo:'',page:1});
  applyFilters(); showToast('Đã xóa toàn bộ bộ lọc','info');
});

// KPI strip filter click
document.querySelectorAll('.kpi-cell[data-filter-level]').forEach(cell=>{
  cell.addEventListener('click',()=>{
    document.querySelectorAll('.kpi-cell').forEach(c=>c.classList.remove('selected'));
    cell.classList.add('selected');
    state.levelFilter=cell.dataset.filterLevel; state.page=1; applyFilters();
  });
});

// Mark all seen
document.getElementById('btnMarkAllSeen').addEventListener('click',()=>{
  const n=allAlerts.filter(a=>a.status==='new').length;
  allAlerts.filter(a=>a.status==='new').forEach(a=>a.status='seen');
  updateKPIs(); applyFilters();
  showToast(`Đã đánh dấu đã xem ${n} cảnh báo`,'ok');
});

// Export CSV
document.getElementById('btnExport').addEventListener('click',()=>{
  const data=state.filtered.length?state.filtered:allAlerts;
  const header=['ID','Thời gian','Thiết bị','Khu vực','Loại lỗi','Nội dung','Giá trị','Ngưỡng','Mức độ','Trạng thái','Ghi chú'];
  const rows=data.map(a=>[a.id,a.timeStr,a.device,AREA_NAMES[a.area],a.type,a.message,a.value,a.threshold,a.level,a.status,a.note||'']);
  const csv=[['Nhật ký Cảnh báo — ViPower Nhà máy Tân Hiệp'],[`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`],[],header,...rows]
    .map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`CanhBao_ViPower_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  showToast(`Đã xuất ${fmt(data.length)} bản ghi`,'ok');
});

// Refresh
document.getElementById('btnRefresh').addEventListener('click',()=>{
  allAlerts=generateAlerts(); nextId=allAlerts.length+1;
  updateKPIs(); updateTimeline(); updateDistribution(); applyFilters();
  showToast('Dữ liệu đã được làm mới','ok');
});

// Default dates
const today=new Date();
document.getElementById('dateTo').value=today.toISOString().slice(0,10);
document.getElementById('dateFrom').value=new Date(today.getTime()-29*86400000).toISOString().slice(0,10);

// ============================================================
// INIT
// ============================================================
allAlerts=generateAlerts();
updateKPIs();
updateTimeline();
updateDistribution();
applyFilters();

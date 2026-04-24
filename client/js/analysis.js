// ═══ DATA ═══
const DEVICES=[
  {id:'TB-01',name:'Trạm Bơm 1',   area:'bom',power:280,flow:1600},
  {id:'TB-02',name:'Trạm Bơm 2',   area:'bom',power:190,flow:1200},
  {id:'XL-01',name:'Máy Bơm Xử Lý',area:'xl', power:310,flow:1500},
  {id:'VP-01',name:'Văn Phòng',     area:'vp', power:20, flow:0},
];
const AREA_NAMES={bom:'Trạm Bơm Tổng',xl:'Khu Xử Lý',vp:'Văn Phòng'};
const AREA_COLORS={bom:'#38aaff',xl:'#a855f7',vp:'#22d369'};
const BENCH_EFF={bom:0.62,xl:0.58,vp:0.75};
const CHART_COLORS=['#38aaff','#22d369','#f5a623','#a855f7','#f44b4b','#ff7043'];

// Build 3-year monthly data
const BASE_MONTHS=(()=>{
  const now=new Date(),arr=[];
  for(let y=now.getFullYear()-2;y<=now.getFullYear();y++){
    for(let m=0;m<12;m++){
      if(y===now.getFullYear()&&m>now.getMonth()) break;
      const d=new Date(y,m,1);
      const idx=arr.length;
      const tb=180000+idx*2500;
      const sea=tb*0.08*Math.sin(Math.PI*(m-3)/6);
      const noise=Math.sin(idx*7.3)*3000;
      arr.push({date:d,label:d.toLocaleString('vi-VN',{month:'short',year:'numeric'}),
        energy:Math.round(tb+sea+noise),year:y,month:m,index:idx});
    }
  }
  return arr;
})();

// ═══ STATE ═══
let state={area:'all',device:'all',anomalyPeriod:'weekly'};
let shiftRowCounter=0;

// ═══ UTILS ═══
const fmt=(n,d=0)=>Number(n).toLocaleString('vi-VN',{maximumFractionDigits:d});
function srand(seed){return()=>{seed=(seed*9301+49297)%233280;return seed/233280;};}
function toast(msg,type='info'){
  const tc=document.getElementById('toastContainer'),t=document.createElement('div');
  const cols={info:'var(--accent)',ok:'var(--green)',warn:'var(--yellow)',error:'var(--red)'};
  const ics={info:'bi-info-circle-fill',ok:'bi-check-circle-fill',warn:'bi-exclamation-triangle-fill',error:'bi-x-circle-fill'};
  t.className='toast';t.innerHTML=`<i class="bi ${ics[type]}" style="color:${cols[type]};font-size:15px;"></i>${msg}`;
  tc.appendChild(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),350);},3200);
}
function showSpin(id){const e=document.getElementById(id);if(e)e.classList.add('show');}
function hideSpin(id){setTimeout(()=>{const e=document.getElementById(id);if(e)e.classList.remove('show');},100);}
function areaMul(){
  if(state.device!=='all'){const d=DEVICES.find(x=>x.id===state.device);return d?d.power/400:1;}
  return state.area==='bom'?1.175:state.area==='xl'?0.775:state.area==='vp'?0.05:2.0;
}
function linReg(vals){
  const n=vals.length,xs=[...Array(n).keys()];
  const sx=xs.reduce((a,b)=>a+b),sy=vals.reduce((a,b)=>a+b);
  const sxy=xs.reduce((s,x,i)=>s+x*vals[i],0),sxx=xs.reduce((s,x)=>s+x*x,0);
  const a=(n*sxy-sx*sy)/(n*sxx-sx*sx||1),b=(sy-a*sx)/n;
  const yh=xs.map(x=>a*x+b);
  const sst=vals.reduce((s,v)=>s+(v-sy/n)**2,0),sse=vals.reduce((s,v,i)=>s+(v-yh[i])**2,0);
  return{a,b,yhat:yh,r2:sst>0?1-sse/sst:1};
}

// ═══ CHART INIT ═══
const CD={responsive:true,maintainAspectRatio:false,
  plugins:{legend:{display:false},tooltip:{backgroundColor:'#111c2b',borderColor:'rgba(56,139,253,.28)',borderWidth:1,titleColor:'#607b99',bodyColor:'#e6eef8',padding:10}},
  scales:{x:{grid:{color:'rgba(56,139,253,.05)'},ticks:{color:'#3a506b',font:{family:'JetBrains Mono',size:10},maxTicksLimit:14}},
    y:{grid:{color:'rgba(56,139,253,.07)'},ticks:{color:'#607b99',font:{family:'JetBrains Mono',size:10}},beginAtZero:true}}};
const dc=()=>JSON.parse(JSON.stringify(CD));
let cShift,cPeak,cMonth,cBench,cTrend,cAnomaly;

function initCharts(){
  cShift  =new Chart(document.getElementById('chartShift'),  {type:'line',data:{labels:[],datasets:[]},options:{...dc(),interaction:{mode:'index',intersect:false}}});
  cPeak   =new Chart(document.getElementById('chartPeak'),   {type:'bar', data:{labels:[],datasets:[]},options:{...dc(),interaction:{mode:'index',intersect:false}}});
  cMonth  =new Chart(document.getElementById('chartMonth'),  {type:'line',data:{labels:[],datasets:[]},options:{...dc(),interaction:{mode:'index',intersect:false}}});
  const bo=dc();bo.indexAxis='y';bo.scales.x={...bo.scales.x,suggestedMin:70,suggestedMax:130,ticks:{...bo.scales.x.ticks,callback:v=>v+'%'}};bo.scales.y={...bo.scales.y,beginAtZero:false};
  cBench  =new Chart(document.getElementById('chartBench'),  {type:'bar',data:{labels:[],datasets:[]},options:bo});
  cTrend  =new Chart(document.getElementById('chartTrend'),  {type:'line',data:{labels:[],datasets:[]},options:{...dc(),interaction:{mode:'index',intersect:false}}});
  cAnomaly=new Chart(document.getElementById('chartAnomaly'),{type:'line',data:{labels:[],datasets:[]},options:{...dc(),interaction:{mode:'index',intersect:false}}});
}

// ═══ KPI ═══
function updateKPIs(){
  const mul=areaMul();const rand=srand(42+Math.floor(mul*100));
  const total=Math.round(180000*mul*(1+rand()*.08-.04));
  const avgP=Math.round(400*mul*(1+rand()*.06-.03));
  const peak=Math.round(650*mul*(1+rand()*.04-.02));
  document.getElementById('kpiE').textContent=`${fmt(total)} kWh`;
  document.getElementById('kpiP').textContent=`${fmt(avgP)} kW`;
  document.getElementById('kpiPk').textContent=`${fmt(peak)} kW`;
  document.getElementById('kpiT').textContent=rand()>.5?'Dự báo Tăng':'Dự báo Giảm';
  const setD=(id,v)=>{const e=document.getElementById(id);e.innerHTML=`<i class="bi bi-arrow-${v>=0?'up':'down'}-short"></i>${Math.abs((v*10).toFixed(0)/10)}% vs kỳ trước`;e.className=`kpi-delta ${v>=0?'up':'down'}`;};
  setD('kpiED',(rand()*.16-.08)*100);setD('kpiPD',(rand()*.1-.05)*100);setD('kpiPkD',(rand()*.12-.06)*100);
}

// ═══ 1. SHIFT CHART ═══
function addShiftRow(date,shiftIdx){
  shiftRowCounter++;
  const today=new Date().toISOString().slice(0,10);
  const d=date||today;const si=shiftIdx??0;
  const id=`sr${shiftRowCounter}`;
  const row=document.createElement('div');
  row.className='shift-row-item';row.id=id;
  row.innerHTML=`<input type="date" class="date-input shift-date" value="${d}" style="width:128px;">
    <select class="filter-select shift-sel" style="width:120px;">
      ${['Ca A (00–08)','Ca B (08–16)','Ca C (16–24)'].map((s,i)=>`<option value="${i}" ${i===si?'selected':''}>${s}</option>`).join('')}
    </select>
    <button class="btn-sm danger" onclick="document.getElementById('${id}').remove()"><i class="bi bi-x"></i></button>`;
  document.getElementById('shiftControls').appendChild(row);
}

function updateShiftChart(){
  showSpin('spShift');
  const rows=[...document.querySelectorAll('#shiftControls .shift-row-item')];
  const mul=areaMul();
  const hours=Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`);
  const datasets=[];

  rows.forEach((row,ri)=>{
    const date=row.querySelector('.shift-date').value;
    const si=parseInt(row.querySelector('.shift-sel').value);
    const sn=['Ca A','Ca B','Ca C'][si];
    const smul=[0.75,1.35,0.9][si];
    const rand=srand(parseInt(date.replace(/-/g,'').slice(-4))+si*1000+ri*37);
    const data=hours.map((_,h)=>{
      const isPeak=h>=8&&h<=17;
      const base=(isPeak?360:140)*mul*smul;
      return Math.round(base+rand()*base*.22-base*.11);
    });
    const peakV=Math.max(...data),peakI=data.indexOf(peakV);
    const color=CHART_COLORS[ri%CHART_COLORS.length];
    datasets.push({label:`${date} ${sn}`,data,borderColor:color,backgroundColor:color+'25',
      borderWidth:2,fill:false,tension:.3,pointRadius:0,pointHoverRadius:4});
    datasets.push({label:`Peak`,data:data.map((v,i)=>i===peakI?v:null),
      backgroundColor:color,borderColor:color,pointRadius:8,pointStyle:'star',showLine:false,order:0});
  });

  cShift.data.labels=hours;cShift.data.datasets=datasets;
  cShift.options.plugins.tooltip.callbacks={filter:c=>c.dataset.pointStyle!=='star',label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)} kW`};
  cShift.update();
  document.getElementById('shiftLegend').innerHTML=rows.map((r,ri)=>{
    const c=CHART_COLORS[ri%CHART_COLORS.length];
    const sn=['Ca A','Ca B','Ca C'][parseInt(r.querySelector('.shift-sel').value)];
    return `<div class="legend-item"><div style="width:16px;height:2px;background:${c};border-radius:2px;"></div>${r.querySelector('.shift-date').value} ${sn}</div>`;
  }).join('');
  hideSpin('spShift');
}

// ═══ 2. PEAK DEMAND ═══
function updatePeakChart(){
  showSpin('spPeak');
  const days=peakPicker.getSelected();
  const mul=areaMul();
  const hours=Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`);
  const datasets=[];let gPeak=0,gPeakH=0,gMin=99999;

  days.forEach((day,di)=>{
    const rand=srand(parseInt(day.value.replace(/-/g,'').slice(-4))+di*113);
    const data=hours.map((_,h)=>{
      const isPeak=(h>=8&&h<=11)||(h>=14&&h<=17);
      return Math.round((isPeak?280+rand()*140:70+rand()*70)*mul);
    });
    const pv=Math.max(...data),pi=data.indexOf(pv),mn=Math.min(...data);
    if(pv>gPeak){gPeak=pv;gPeakH=pi;}
    if(mn<gMin) gMin=mn;
    const color=CHART_COLORS[di%CHART_COLORS.length];
    datasets.push({label:day.label,data,backgroundColor:color+'77',borderColor:color,borderWidth:1.5,type:'bar',order:1});
    datasets.push({label:`Peak ${day.label}`,data:data.map((v,i)=>i===pi?v+8:null),
      backgroundColor:'#f44b4b',borderColor:'#f44b4b',pointRadius:8,pointStyle:'star',showLine:false,type:'scatter',order:0});
  });

  cPeak.data.labels=hours;cPeak.data.datasets=datasets;
  cPeak.options.plugins.tooltip.callbacks={filter:c=>!c.dataset.label?.startsWith('Peak'),label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)} kW`};
  cPeak.update();
  if(days.length){
    document.getElementById('peakHr').textContent=`${String(gPeakH).padStart(2,'0')}:00`;
    document.getElementById('peakMax').textContent=`${fmt(gPeak)} kW`;
    document.getElementById('peakMin').textContent=`${fmt(gMin)} kW`;
  }
  hideSpin('spPeak');
}

// ═══ 3. MONTH COMPARISON ═══
function updateMonthChart(){
  showSpin('spMonth');
  const sel=monthPicker.getSelected();
  const mul=areaMul();
  const labels=Array.from({length:31},(_,i)=>i+1);
  const datasets=[];

  sel.forEach((s,si)=>{
    const md=BASE_MONTHS[s.index];if(!md) return;
    const days=new Date(md.year,md.month+1,0).getDate();
    const base=(md.energy*mul)/days;
    const rand=srand(md.year*100+md.month+si*7);
    const data=Array.from({length:days},(_,i)=>
      Math.round(base*(i%7>=5?.82:1)+rand()*base*.08-base*.04)
    ).concat(Array(31-days).fill(null));
    const c=CHART_COLORS[si%CHART_COLORS.length];
    datasets.push({label:md.label,data,borderColor:c,backgroundColor:c+'18',
      borderWidth:2,fill:false,tension:.2,pointRadius:0,pointHoverRadius:3,spanGaps:false});
  });

  cMonth.data.labels=labels;cMonth.data.datasets=datasets;
  cMonth.options.plugins.tooltip.callbacks={filter:c=>c.parsed.y!==null,label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)} kWh`};
  if(!cMonth.options.scales.x.title) cMonth.options.scales.x.title={display:true,text:'Ngày trong tháng',color:'#607b99',font:{size:10}};
  cMonth.update();
  document.getElementById('monthLegend').innerHTML=datasets.map(ds=>`<div class="legend-item"><div style="width:16px;height:2px;background:${ds.borderColor};border-radius:2px;"></div>${ds.label}</div>`).join('');
  hideSpin('spMonth');
}

// ═══ 4. BENCHMARKING ═══
function updateBench(){
  showSpin('spBench');
  const refV=document.getElementById('benchRef').value;
  const refEff=refV==='target'?0.60:parseFloat(refV)||0.60;
  const areas=Object.keys(BENCH_EFF);
  const labels=areas.map(k=>AREA_NAMES[k]);
  const vals=areas.map(k=>parseFloat(((refEff/BENCH_EFF[k])*100).toFixed(1)));
  const colors=vals.map(v=>v>=100?'#22d369':v>=90?'#f5a623':'#f44b4b');

  cBench.data.labels=labels;
  cBench.data.datasets=[{label:'Hiệu suất %',data:vals,backgroundColor:colors.map(c=>c+'99'),borderColor:colors,borderWidth:1.5,borderRadius:4}];
  cBench.options.plugins.tooltip.callbacks={label:c=>` ${c.label}: ${c.parsed.x.toFixed(1)}%`};
  cBench.update();

  const best=areas[vals.indexOf(Math.max(...vals))];
  const worst=areas[vals.indexOf(Math.min(...vals))];
  document.getElementById('benchBest').textContent=AREA_NAMES[best]||'--';
  document.getElementById('benchWorst').textContent=AREA_NAMES[worst]||'--';
  hideSpin('spBench');
}

// ═══ 5. TREND + SEASONALITY FORECAST ═══
function updateTrend(){
  showSpin('spTrend');
  const sel=trendPicker.getSelected();
  const mul=areaMul();
  const indices=sel.length?sel.map(s=>s.index):
    Array.from({length:Math.min(BASE_MONTHS.length,12)},(_,i)=>BASE_MONTHS.length-12+i);

  if(indices.length<4){cTrend.data.datasets=[];cTrend.update();hideSpin('spTrend');return;}

  const labels=indices.map(i=>BASE_MONTHS[i].label);
  const vals=indices.map(i=>Math.round(BASE_MONTHS[i].energy*mul));
  const reg=linReg(vals);

  const lastM=BASE_MONTHS[indices[indices.length-1]];
  const preds=Array.from({length:3},(_,k)=>{
    const futX=vals.length+k;
    const futMonth=(lastM.month+k+1)%12;
    const sea=vals.reduce((s,v)=>s+v)/vals.length*0.08*Math.sin(Math.PI*(futMonth-3)/6);
    return Math.max(10000,Math.round(reg.a*futX+reg.b+sea));
  });

  const futLabels=preds.map((_,i)=>`Dự báo T+${i+1}`);
  const trendFull=[...reg.yhat,...Array.from({length:3},(_,i)=>reg.a*(vals.length+i)+reg.b)];

  cTrend.data.labels=[...labels,...futLabels];
  cTrend.data.datasets=[
    {label:'Thực tế (kWh)',data:[...vals,...Array(3).fill(null)],
     borderColor:'#38aaff',backgroundColor:'rgba(56,170,255,.06)',fill:true,borderWidth:2,pointRadius:3,tension:.3,spanGaps:false},
    {label:'Trendline',data:trendFull,borderColor:'rgba(56,170,255,.4)',borderWidth:1.5,borderDash:[4,3],pointRadius:0,fill:false,tension:0},
    {label:'Dự báo LR+Seasonality',data:[...Array(vals.length-1).fill(null),vals[vals.length-1],...preds],
     borderColor:'#f5a623',backgroundColor:'rgba(245,166,35,.07)',fill:true,borderWidth:2,borderDash:[6,3],pointRadius:4,pointBackgroundColor:'#f5a623',tension:.3,spanGaps:false},
  ];
  cTrend.options.plugins.tooltip.callbacks={filter:c=>c.parsed.y!==null,label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)} kWh`};
  cTrend.update();

  const s=reg.a;const isUp=s>500,isDown=s<-500;
  document.getElementById('trendRate').textContent=`${s>0?'+':''}${fmt(s,0)} kWh/tháng`;
  document.getElementById('trendRate').style.color=isUp?'var(--red)':isDown?'var(--green)':'var(--text-primary)';
  document.getElementById('trendRateLbl').textContent=isUp?'⚠ Xu hướng tăng — cần kiểm tra':isDown?'✓ Xu hướng giảm — đang cải thiện':'→ Ổn định';
  document.getElementById('r2Val').textContent=reg.r2.toFixed(3);
  document.getElementById('r2Val').style.color=reg.r2>.75?'var(--green)':reg.r2>.5?'var(--yellow)':'var(--red)';
  document.getElementById('fcT1').textContent=`${fmt(preds[0])} kWh`;
  document.getElementById('fcT2').textContent=`${fmt(preds[1])} kWh`;
  document.getElementById('fcT3').textContent=`${fmt(preds[2])} kWh`;

  const bc=isUp?'up':isDown?'down':'flat',bi=isUp?'bi-arrow-up-right':isDown?'bi-arrow-down-right':'bi-arrow-right';
  const bt=isUp?`+${fmt(s,0)}`:isDown?`${fmt(s,0)}`:'Ổn định';
  const bh=`<span class="trend-badge ${bc}"><i class="bi ${bi}"></i>${bt} kWh/tháng</span>`;
  document.getElementById('trendBadgeWrap').innerHTML=bh;
  document.getElementById('topTrendBadge').innerHTML=bh;
  hideSpin('spTrend');
}

// ═══ 6. ANOMALY ═══
function updateAnomaly(){
  const period=state.anomalyPeriod;
  const mul=areaMul();
  let labels,base,n;
  if(period==='daily'){labels=Array.from({length:24},(_,i)=>`${String(i).padStart(2,'0')}:00`);base=80;n=24;}
  else if(period==='weekly'){labels=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','CN'];base=1200;n=7;}
  else{labels=Array.from({length:30},(_,i)=>i+1);base=24000;n=30;}

  const rand=srand(77+n*3);
  const mean=Array.from({length:n},()=>Math.round(base*mul*(1+rand()*.06-.03)));
  const std=Math.sqrt(mean.reduce((s,v)=>s+(v-mean.reduce((a,b)=>a+b)/n)**2,0)/n);
  const upper=mean.map(v=>Math.round(v+2*std));
  const lower=mean.map(v=>Math.round(Math.max(0,v-2*std)));
  const anomaly=mean.map(()=>null);
  if(n>4){
    anomaly[Math.floor(rand()*(n-1))]=Math.round(upper[0]*1.35);
    anomaly[Math.floor(rand()*(n-2)+1)]=Math.round(lower[1]*0.55);
  }
  const cnt=anomaly.filter(v=>v!==null).length;

  cAnomaly.data.labels=labels;
  cAnomaly.data.datasets=[
    {label:'Giới hạn trên',data:upper,borderColor:'rgba(244,75,75,.2)',backgroundColor:'rgba(244,75,75,.06)',borderDash:[3,3],borderWidth:1,pointRadius:0,fill:'+1',tension:.2},
    {label:'Trung bình',data:mean,borderColor:'#38aaff',backgroundColor:'rgba(56,170,255,.06)',fill:'-1',borderWidth:1.5,pointRadius:0,tension:.2},
    {label:'Giới hạn dưới',data:lower,borderColor:'rgba(244,75,75,.2)',backgroundColor:'transparent',borderDash:[3,3],borderWidth:1,pointRadius:0,fill:false,tension:.2},
    {label:'Bất thường',data:anomaly,borderColor:'transparent',backgroundColor:'#f44b4b',pointRadius:8,pointStyle:'triangle',showLine:false},
  ];
  cAnomaly.options.plugins.tooltip.callbacks={filter:c=>c.parsed.y!==null,label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)} kWh`};
  cAnomaly.update();

  const b=document.getElementById('anomalyBadge');
  b.textContent=`${cnt} điểm bất thường`;b.style.color=cnt>1?'var(--red)':'var(--green)';
  document.getElementById('anomalyCount').textContent=`${cnt} mục`;

  document.getElementById('anomalyList').innerHTML=anomaly.map((v,i)=>{
    if(v===null)return'';
    const isH=v>mean[i];const sc=isH?'var(--red)':'var(--purple)';
    const pct=((Math.abs(v-mean[i])/mean[i])*100).toFixed(1);
    return`<div class="anomaly-item">
      <div class="anomaly-icon" style="background:${isH?'var(--red-glow)':'rgba(168,85,247,.15)'};color:${sc};border:1px solid ${isH?'rgba(244,75,75,.3)':'rgba(168,85,247,.3)'};">
        <i class="bi ${isH?'bi-arrow-up-right':'bi-arrow-down-right'}"></i>
      </div>
      <div class="anomaly-body">
        <div class="anomaly-title">${isH?'Cao':'Thấp'} bất thường — ${labels[i]}</div>
        <div class="anomaly-time">${fmt(v)} kWh · TB: ${fmt(mean[i])} kWh</div>
      </div>
      <div class="anomaly-pct" style="color:${sc};">${isH?'+':'−'}${pct}%</div>
    </div>`;
  }).filter(Boolean).join('');
}

// ═══ MULTI-PICKER CLASS ═══
class MultiPicker{
  constructor(inId,dropId,tagId,mode='month'){
    this.inp=document.getElementById(inId);
    this.drop=document.getElementById(dropId);
    this.tagEl=document.getElementById(tagId);
    this.mode=mode;this.selected=[];
    this.items=mode==='month'?BASE_MONTHS:this._days();
    this._build();
    this.inp.addEventListener('click',e=>{e.stopPropagation();this.drop.classList.toggle('open');});
    document.addEventListener('click',e=>{if(!this.drop.contains(e.target)&&e.target!==this.inp)this.drop.classList.remove('open');});
  }
  _days(){
    const arr=[],now=new Date();
    for(let i=0;i<30;i++){
      const d=new Date(now);d.setDate(now.getDate()-i);
      arr.push({index:i,value:d.toISOString().slice(0,10),
        label:d.toLocaleDateString('vi-VN',{day:'numeric',month:'numeric'}),year:d.getFullYear()});
    }
    return arr;
  }
  _build(){
    const grouped={};
    this.items.forEach(it=>{const g=it.year||(new Date(it.value)).getFullYear();(grouped[g]=grouped[g]||[]).push(it);});
    this.drop.innerHTML='';
    Object.entries(grouped).reverse().forEach(([yr,its])=>{
      const t=document.createElement('div');t.className='picker-yr';t.textContent=`${yr}`;this.drop.appendChild(t);
      const g=document.createElement('div');g.className=this.mode==='month'?'picker-grid-m':'picker-grid-d';
      its.forEach(it=>{
        const el=document.createElement('div');el.className='picker-item';
        el.dataset.index=it.index;
        el.textContent=this.mode==='month'?it.date.toLocaleString('vi-VN',{month:'short'}):it.label;
        el.addEventListener('click',()=>this._toggle(it,el));
        g.appendChild(el);
      });
      this.drop.appendChild(g);
    });
  }
  _toggle(it,el){
    const idx=this.selected.findIndex(s=>s.index===it.index);
    if(idx>-1){this.selected.splice(idx,1);el.classList.remove('sel');}
    else{this.selected.push(it);el.classList.add('sel');}
    this._tags();
  }
  _tags(){
    this.selected.sort((a,b)=>a.index-b.index);
    this.inp.value=this.selected.map(s=>this.mode==='month'?BASE_MONTHS[s.index]?.label||s.label:s.label).join(', ')||
      (this.mode==='month'?'Chọn nhiều tháng...':'Chọn nhiều ngày...');
    this.tagEl.innerHTML=this.selected.map(s=>`<span class="tag">${this.mode==='month'?BASE_MONTHS[s.index]?.label||s.label:s.label}<span class="rm" data-i="${s.index}">&times;</span></span>`).join('');
    this.tagEl.querySelectorAll('.rm').forEach(b=>b.addEventListener('click',e=>{
      const i=parseInt(e.target.dataset.i);
      this.selected=this.selected.filter(s=>s.index!==i);
      this.drop.querySelector(`[data-index="${i}"]`)?.classList.remove('sel');
      this._tags();
    }));
  }
  selectByIndex(i){const it=this.items.find(x=>x.index===i);const el=this.drop.querySelector(`[data-index="${i}"]`);if(it&&el&&!el.classList.contains('sel'))this._toggle(it,el);}
  selectByValue(v){const it=this.items.find(x=>x.value===v);if(it)this.selectByIndex(it.index);}
  clear(){this.selected=[];this.drop.querySelectorAll('.sel').forEach(e=>e.classList.remove('sel'));this._tags();}
  getSelected(){return[...this.selected];}
}

// ═══ DEVICE SELECT ═══
function populateDevices(area){
  const sel=document.getElementById('selDevice');
  sel.innerHTML='<option value="all">Tất cả thiết bị</option>';
  (area==='all'?DEVICES:DEVICES.filter(d=>d.area===area)).forEach(d=>{
    const o=document.createElement('option');o.value=d.id;o.textContent=`${d.id} · ${d.name}`;sel.appendChild(o);
  });sel.value='all';
}

// ═══ BENCHMARK REF ═══
function populateBenchRef(){
  const sel=document.getElementById('benchRef');
  sel.innerHTML='<option value="target">Mục tiêu (0.60)</option>';
  Object.keys(BENCH_EFF).forEach(k=>{
    const o=document.createElement('option');o.value=BENCH_EFF[k];
    o.textContent=`So với ${AREA_NAMES[k]} (${BENCH_EFF[k]})`;sel.appendChild(o);
  });
}

// ═══ GLOBAL UPDATE ═══
let monthPicker,peakPicker,trendPicker;
function updateAll(){updateKPIs();updateShiftChart();updatePeakChart();updateMonthChart();updateBench();updateTrend();updateAnomaly();}

// ═══ INIT ═══
initCharts();populateDevices('all');populateBenchRef();

monthPicker=new MultiPicker('monthInput','monthDrop','monthTags','month');
peakPicker =new MultiPicker('peakInput', 'peakDrop', 'peakTags', 'day');
trendPicker=new MultiPicker('trendInput','trendDrop','trendTags','month');

// Defaults
const now=new Date(),today=now.toISOString().slice(0,10);
const cMI=BASE_MONTHS.findIndex(m=>m.year===now.getFullYear()&&m.month===now.getMonth());
const pMI=BASE_MONTHS.findIndex(m=>m.year===now.getFullYear()-1&&m.month===now.getMonth());
if(cMI>=0)monthPicker.selectByIndex(cMI);
if(pMI>=0)monthPicker.selectByIndex(pMI);
peakPicker.selectByValue(today);
const tStart=Math.max(0,BASE_MONTHS.length-12);
for(let i=tStart;i<BASE_MONTHS.length;i++)trendPicker.selectByIndex(i);
addShiftRow(today,0);addShiftRow(today,1);addShiftRow(today,2);

updateAll();

// ═══ EVENTS ═══
document.getElementById('selArea').addEventListener('change',e=>{state.area=e.target.value;state.device='all';populateDevices(state.area);updateAll();});
document.getElementById('selDevice').addEventListener('change',e=>{state.device=e.target.value;updateAll();});
document.getElementById('selAnomalyPeriod').addEventListener('change',e=>{state.anomalyPeriod=e.target.value;updateAnomaly();});
document.getElementById('benchRef').addEventListener('change',updateBench);
document.getElementById('btnAddShift').addEventListener('click',()=>addShiftRow());
document.getElementById('btnResetShift').addEventListener('click',()=>{document.getElementById('shiftControls').innerHTML='';shiftRowCounter=0;addShiftRow(today,0);addShiftRow(today,1);addShiftRow(today,2);updateShiftChart();});
document.getElementById('btnUpdateShift').addEventListener('click',updateShiftChart);
document.getElementById('btnResetPeak').addEventListener('click',()=>{peakPicker.clear();updatePeakChart();});
document.getElementById('btnUpdatePeak').addEventListener('click',updatePeakChart);
document.getElementById('btnResetMonth').addEventListener('click',()=>{monthPicker.clear();updateMonthChart();});
document.getElementById('btnUpdateMonth').addEventListener('click',updateMonthChart);
document.getElementById('btnResetTrend').addEventListener('click',()=>{trendPicker.clear();updateTrend();});
document.getElementById('btnUpdateTrend').addEventListener('click',updateTrend);
document.getElementById('btnExport').addEventListener('click',()=>toast('Đang xuất dữ liệu phân tích...','info'));

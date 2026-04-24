'use strict';

// ============================================================
// CONFIG
// ============================================================
const API_BASE = 'http://localhost:3000/api';
const WS_URL   = 'ws://localhost:3000';

// ============================================================
// AUTH
// ============================================================
let token = localStorage.getItem('token');
function authHeaders() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ============================================================
// CONSTANTS
// ============================================================
const AREA_PALETTE = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b'];
const CHART_COLORS = ['#38aaff', '#22d369', '#f5a623', '#a855f7', '#f44b4b', '#ff7043'];

// ============================================================
// RUNTIME STATE
// ============================================================
let allDevices    = [];
let displayGroups = [];
let BASE_MONTHS   = [];  // [{ date, label, energy, year, month, index }]
let AREA_COLORS   = {};  // displaygroupid → color
let AREA_NAMES_MAP = {}; // displaygroupid → name
let BENCH_EFF     = {};  // displaygroupid → efficiency baseline (kWh/m³)

// ============================================================
// STATE
// ============================================================
let state = { area: 'all', device: 'all', anomalyPeriod: 'weekly' };
let shiftRowCounter = 0;

// ============================================================
// WEBSOCKET
// ============================================================
let ws = null, wsReconnectTimer = null;

function connectWS() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  try { ws = new WebSocket(WS_URL); } catch (e) { toast('Không thể kết nối WebSocket', 'error'); return; }
  ws.onopen    = () => ws.send(JSON.stringify({ type: 'client_init' }));
  ws.onmessage = e => { try { handleWSMsg(JSON.parse(e.data)); } catch (err) {} };
  ws.onerror   = () => toast('WebSocket lỗi kết nối', 'error');
  ws.onclose   = () => { wsReconnectTimer = setTimeout(connectWS, 5000); };
}

function handleWSMsg(msg) {
  if (msg.type === 'data_init') onDataInit(msg.data);
}

// ============================================================
// INIT FROM SERVER
// ============================================================
async function onDataInit(data) {
  displayGroups = data.displaygroup || [];
  allDevices    = Array.isArray(data.devices) ? data.devices : (data.devices?.data || []);

  AREA_COLORS = {}; AREA_NAMES_MAP = {}; BENCH_EFF = {};
  displayGroups.forEach((g, i) => {
    AREA_COLORS[g.displaygroupid]    = AREA_PALETTE[i % AREA_PALETTE.length];
    AREA_NAMES_MAP[g.displaygroupid] = g.name;
    BENCH_EFF[g.displaygroupid]      = 0.65;
  });

  populateAreaSelect();
  populateDevices('all');
  populateBenchRef();
  updateKPIsFromInit(data.dataEnergy || []);

  toast('Đang tải dữ liệu tháng...', 'info');
  BASE_MONTHS = await fetchMonthlyData('all', 'all');
  rebuildPickers();
  await updateAll();
}

function updateKPIsFromInit(dataEnergy) {
  let totalE = 0, totalP = 0, peakP = 0, count = 0;
  for (const de of dataEnergy) {
    const d = Array.isArray(de.data) ? de.data[0] : de.data;
    if (d) {
      totalE += d.netpower || 0;
      totalP += d.power    || 0;
      if ((d.power || 0) > peakP) peakP = d.power;
      count++;
    }
  }
  document.getElementById('kpiE').textContent  = `${fmt(totalE, 2)} kWh`;
  document.getElementById('kpiP').textContent  = `${fmt(count ? totalP / count : 0, 0)} kW`;
  document.getElementById('kpiPk').textContent = `${fmt(peakP, 0)} kW`;
  document.getElementById('kpiT').textContent  = '—';
  ['kpiED', 'kpiPD', 'kpiPkD'].forEach(id => {
    const e = document.getElementById(id); e.innerHTML = '—'; e.className = 'kpi-delta flat';
  });
  document.getElementById('kpiTD').textContent = 'LR + Seasonality';
}

function getTargetDevices() {
  let devs = allDevices;
  if (state.area   !== 'all') devs = devs.filter(d => d.displaygroupid === state.area);
  if (state.device !== 'all') devs = devs.filter(d => d.deviceid === state.device);
  return devs.filter(d => d.deviceid?.trim());
}

// ============================================================
// FETCH MONTHLY DATA  (REST /data/energy/:id/stats per month)
// ============================================================
async function fetchMonthlyData(area, device) {
  if (!token) return buildFallbackMonths();

  const now    = new Date();
  const months = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      if (y === now.getFullYear() && m > now.getMonth()) break;
      months.push({ year: y, month: m });
    }
  }

  let targets = allDevices;
  if (area   !== 'all') targets = targets.filter(d => d.displaygroupid === area);
  if (device !== 'all') targets = targets.filter(d => d.deviceid === device);
  targets = targets.filter(d => d.deviceid?.trim());

  if (!targets.length) return buildFallbackMonths();

  const results = await Promise.all(months.map(async ({ year, month }) => {
    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 0, 23, 59, 59, 999);
    let totalEnergy = 0;

    await Promise.all(targets.map(async dev => {
      try {
        const url = `${API_BASE}/data/energy/${dev.deviceid}/stats`
          + `?startTime=${start.toISOString()}&endTime=${end.toISOString()}`;
        const res  = await fetch(url, { headers: authHeaders() });
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.stats?.totalNetPower) totalEnergy += json.stats.totalNetPower;
      } catch (e) {}
    }));

    const d = new Date(year, month, 1);
    return { date: d, label: d.toLocaleString('vi-VN', { month: 'short', year: 'numeric' }), energy: Math.round(totalEnergy), year, month };
  }));

  const withData = results.filter(m => m.energy > 0);
  if (!withData.length) return buildFallbackMonths();
  return results.map((m, i) => ({ ...m, index: i }));
}

function buildFallbackMonths() {
  const now = new Date(); const arr = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      if (y === now.getFullYear() && m > now.getMonth()) break;
      const d = new Date(y, m, 1);
      arr.push({ date: d, label: d.toLocaleString('vi-VN', { month: 'short', year: 'numeric' }), energy: 0, year: y, month: m, index: arr.length });
    }
  }
  return arr;
}

// ============================================================
// FETCH HOURLY DATA FOR A DATE (REST)
// ============================================================
async function fetchHourlyData(dateStr, startHour, endHour) {
  if (!token) return null;
  const targets = getTargetDevices();
  if (!targets.length) return null;

  const d    = new Date(dateStr);
  const from = new Date(d); from.setHours(startHour, 0, 0, 0);
  const to   = new Date(d); to.setHours(endHour, 59, 59, 999);

  const buckets = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 }));

  await Promise.all(targets.map(async dev => {
    try {
      const url = `${API_BASE}/data/energy/${dev.deviceid}`
        + `?startTime=${from.toISOString()}&endTime=${to.toISOString()}&limit=5000&sort=asc`;
      const res  = await fetch(url, { headers: authHeaders() });
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;
      for (const r of json.data) {
        const h = new Date(r.timestamp).getHours();
        if (h >= startHour && h <= endHour) {
          buckets[h].sum += r.power || 0;
          buckets[h].n++;
        }
      }
    } catch (e) {}
  }));

  const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const data   = buckets.map(b => b.n ? Math.round(b.sum / b.n) : 0);
  return { labels, data };
}

// ============================================================
// UTILS
// ============================================================
const fmt = (n, d = 0) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });

function toast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer'), t = document.createElement('div');
  const cols = { info: 'var(--accent)', ok: 'var(--green)', warn: 'var(--yellow)', error: 'var(--red)' };
  const ics  = { info: 'bi-info-circle-fill', ok: 'bi-check-circle-fill', warn: 'bi-exclamation-triangle-fill', error: 'bi-x-circle-fill' };
  t.className = 'toast';
  t.innerHTML = `<i class="bi ${ics[type]}" style="color:${cols[type]};font-size:15px;"></i>${msg}`;
  tc.appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 3200);
}

function showSpin(id) { const e = document.getElementById(id); if (e) e.classList.add('show'); }
function hideSpin(id) { setTimeout(() => { const e = document.getElementById(id); if (e) e.classList.remove('show'); }, 100); }

function linReg(vals) {
  const n = vals.length, xs = [...Array(n).keys()];
  const sx = xs.reduce((a, b) => a + b), sy = vals.reduce((a, b) => a + b);
  const sxy = xs.reduce((s, x, i) => s + x * vals[i], 0), sxx = xs.reduce((s, x) => s + x * x, 0);
  const a = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), b = (sy - a * sx) / n;
  const yh = xs.map(x => a * x + b);
  const sst = vals.reduce((s, v) => s + (v - sy / n) ** 2, 0), sse = vals.reduce((s, v, i) => s + (v - yh[i]) ** 2, 0);
  return { a, b, yhat: yh, r2: sst > 0 ? 1 - sse / sst : 1 };
}

// ============================================================
// CHART INIT
// ============================================================
const CD = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { backgroundColor: '#111c2b', borderColor: 'rgba(56,139,253,.28)', borderWidth: 1, titleColor: '#607b99', bodyColor: '#e6eef8', padding: 10 } },
  scales: {
    x: { grid: { color: 'rgba(56,139,253,.05)' }, ticks: { color: '#3a506b', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 14 } },
    y: { grid: { color: 'rgba(56,139,253,.07)' }, ticks: { color: '#607b99', font: { family: 'JetBrains Mono', size: 10 } }, beginAtZero: true },
  },
};
const dc = () => JSON.parse(JSON.stringify(CD));
let cShift, cPeak, cMonth, cBench, cTrend, cAnomaly;

function initCharts() {
  cShift   = new Chart(document.getElementById('chartShift'),   { type: 'line', data: { labels: [], datasets: [] }, options: { ...dc(), interaction: { mode: 'index', intersect: false } } });
  cPeak    = new Chart(document.getElementById('chartPeak'),    { type: 'bar',  data: { labels: [], datasets: [] }, options: { ...dc(), interaction: { mode: 'index', intersect: false } } });
  cMonth   = new Chart(document.getElementById('chartMonth'),   { type: 'line', data: { labels: [], datasets: [] }, options: { ...dc(), interaction: { mode: 'index', intersect: false } } });
  const bo = dc(); bo.indexAxis = 'y';
  bo.scales.x = { ...bo.scales.x, suggestedMin: 70, suggestedMax: 130, ticks: { ...bo.scales.x.ticks, callback: v => v + '%' } };
  bo.scales.y = { ...bo.scales.y, beginAtZero: false };
  cBench   = new Chart(document.getElementById('chartBench'),   { type: 'bar',  data: { labels: [], datasets: [] }, options: bo });
  cTrend   = new Chart(document.getElementById('chartTrend'),   { type: 'line', data: { labels: [], datasets: [] }, options: { ...dc(), interaction: { mode: 'index', intersect: false } } });
  cAnomaly = new Chart(document.getElementById('chartAnomaly'), { type: 'line', data: { labels: [], datasets: [] }, options: { ...dc(), interaction: { mode: 'index', intersect: false } } });
}

// ============================================================
// KPI (from monthly data)
// ============================================================
function updateKPIs() {
  if (!BASE_MONTHS.length) return;
  const now = new Date();
  const curM = BASE_MONTHS.find(m => m.year === now.getFullYear() && m.month === now.getMonth());
  const pm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const py = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevM = BASE_MONTHS.find(m => m.year === py && m.month === pm);

  const setD = (id, cur, prv) => {
    const e = document.getElementById(id);
    if (!prv || !prv.energy) { e.innerHTML = '—'; e.className = 'kpi-delta flat'; return; }
    const pct = ((cur.energy - prv.energy) / prv.energy * 100).toFixed(1);
    const up = pct > 0;
    e.innerHTML = `<i class="bi bi-arrow-${up ? 'up' : 'down'}-short"></i>${Math.abs(pct)}%`;
    e.className = `kpi-delta ${up ? 'up' : 'down'}`;
  };

  if (curM) {
    document.getElementById('kpiE').textContent = `${fmt(curM.energy)} kWh`;
    setD('kpiED', curM, prevM);
  }
}

// ============================================================
// 1. SHIFT CHART
// ============================================================
function addShiftRow(date, shiftIdx) {
  shiftRowCounter++;
  const today = new Date().toISOString().slice(0, 10);
  const d = date || today; const si = shiftIdx ?? 0;
  const id = `sr${shiftRowCounter}`;
  const row = document.createElement('div');
  row.className = 'shift-row-item'; row.id = id;
  row.innerHTML = `<input type="date" class="date-input shift-date" value="${d}" style="width:128px;">
    <select class="filter-select shift-sel" style="width:120px;">
      ${['Ca A (00–08)', 'Ca B (08–16)', 'Ca C (16–24)'].map((s, i) => `<option value="${i}" ${i === si ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
    <button class="btn-sm danger" onclick="document.getElementById('${id}').remove()"><i class="bi bi-x"></i></button>`;
  document.getElementById('shiftControls').appendChild(row);
}

async function updateShiftChart() {
  showSpin('spShift');
  const rows  = [...document.querySelectorAll('#shiftControls .shift-row-item')];
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const datasets = [];

  for (let ri = 0; ri < rows.length; ri++) {
    const row    = rows[ri];
    const date   = row.querySelector('.shift-date').value;
    const si     = parseInt(row.querySelector('.shift-sel').value);
    const sn     = ['Ca A', 'Ca B', 'Ca C'][si];
    const ranges = [[0, 7], [8, 15], [16, 23]];
    const [startH, endH] = ranges[si];

    const result = await fetchHourlyData(date, startH, endH);
    if (!result) { hideSpin('spShift'); toast('Không thể tải dữ liệu — kiểm tra đăng nhập', 'warn'); return; }

    const { data } = result;
    const peakV = Math.max(...data); const peakI = data.indexOf(peakV);
    const color = CHART_COLORS[ri % CHART_COLORS.length];
    datasets.push({ label: `${date} ${sn}`, data, borderColor: color, backgroundColor: color + '25', borderWidth: 2, fill: false, tension: .3, pointRadius: 0, pointHoverRadius: 4 });
    datasets.push({ label: 'Peak', data: data.map((v, i) => i === peakI ? v : null), backgroundColor: color, borderColor: color, pointRadius: 8, pointStyle: 'star', showLine: false, order: 0 });
  }

  cShift.data.labels = hours; cShift.data.datasets = datasets;
  cShift.options.plugins.tooltip.callbacks = { filter: c => c.dataset.pointStyle !== 'star', label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)} kW` };
  cShift.update();
  document.getElementById('shiftLegend').innerHTML = rows.map((r, ri) => {
    const c  = CHART_COLORS[ri % CHART_COLORS.length];
    const sn = ['Ca A', 'Ca B', 'Ca C'][parseInt(r.querySelector('.shift-sel').value)];
    return `<div class="legend-item"><div style="width:16px;height:2px;background:${c};border-radius:2px;"></div>${r.querySelector('.shift-date').value} ${sn}</div>`;
  }).join('');
  hideSpin('spShift');
}

// ============================================================
// 2. PEAK DEMAND
// ============================================================
async function updatePeakChart() {
  showSpin('spPeak');
  const days  = peakPicker.getSelected();
  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
  const datasets = []; let gPeak = 0, gPeakH = 0, gMin = 99999;

  for (let di = 0; di < days.length; di++) {
    const day    = days[di];
    const result = await fetchHourlyData(day.value, 0, 23);
    if (!result) continue;

    const { data } = result;
    const pv = Math.max(...data), pi = data.indexOf(pv);
    const mn = Math.min(...data.filter(v => v > 0));
    if (pv > gPeak) { gPeak = pv; gPeakH = pi; }
    if (mn > 0 && mn < gMin) gMin = mn;
    const color = CHART_COLORS[di % CHART_COLORS.length];
    datasets.push({ label: day.label, data, backgroundColor: color + '77', borderColor: color, borderWidth: 1.5, type: 'bar', order: 1 });
    datasets.push({ label: `Peak ${day.label}`, data: data.map((v, i) => i === pi ? v + 8 : null), backgroundColor: '#f44b4b', borderColor: '#f44b4b', pointRadius: 8, pointStyle: 'star', showLine: false, type: 'scatter', order: 0 });
  }

  cPeak.data.labels = hours; cPeak.data.datasets = datasets;
  cPeak.options.plugins.tooltip.callbacks = { filter: c => !c.dataset.label?.startsWith('Peak'), label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)} kW` };
  cPeak.update();
  if (days.length) {
    document.getElementById('peakHr').textContent  = `${String(gPeakH).padStart(2, '0')}:00`;
    document.getElementById('peakMax').textContent = `${fmt(gPeak)} kW`;
    document.getElementById('peakMin').textContent = gMin < 99999 ? `${fmt(gMin)} kW` : '--';
  }
  hideSpin('spPeak');
}

// ============================================================
// 3. MONTH COMPARISON
// ============================================================
function updateMonthChart() {
  showSpin('spMonth');
  const sel = monthPicker.getSelected();
  const labels = Array.from({ length: 31 }, (_, i) => i + 1);
  const datasets = [];

  sel.forEach((s, si) => {
    const md = BASE_MONTHS[s.index]; if (!md) return;
    const days = new Date(md.year, md.month + 1, 0).getDate();
    const base = md.energy / days;
    const data = Array.from({ length: days }, () => Math.round(base)).concat(Array(31 - days).fill(null));
    const c = CHART_COLORS[si % CHART_COLORS.length];
    datasets.push({ label: md.label, data, borderColor: c, backgroundColor: c + '18', borderWidth: 2, fill: false, tension: .2, pointRadius: 0, pointHoverRadius: 3, spanGaps: false });
  });

  cMonth.data.labels = labels; cMonth.data.datasets = datasets;
  cMonth.options.plugins.tooltip.callbacks = { filter: c => c.parsed.y !== null, label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)} kWh` };
  if (!cMonth.options.scales.x.title) cMonth.options.scales.x.title = { display: true, text: 'Ngày trong tháng', color: '#607b99', font: { size: 10 } };
  cMonth.update();
  document.getElementById('monthLegend').innerHTML = datasets.map(ds =>
    `<div class="legend-item"><div style="width:16px;height:2px;background:${ds.borderColor};border-radius:2px;"></div>${ds.label}</div>`
  ).join('');
  hideSpin('spMonth');
}

// ============================================================
// 4. BENCHMARKING
// ============================================================
function updateBench() {
  showSpin('spBench');
  const refV   = document.getElementById('benchRef').value;
  const refEff = refV === 'target' ? 0.60 : parseFloat(refV) || 0.60;
  const areas  = Object.keys(BENCH_EFF);
  if (!areas.length) { hideSpin('spBench'); return; }

  const labels = areas.map(k => AREA_NAMES_MAP[k] || k);
  const vals   = areas.map(k => parseFloat(((refEff / BENCH_EFF[k]) * 100).toFixed(1)));
  const colors = vals.map(v => v >= 100 ? '#22d369' : v >= 90 ? '#f5a623' : '#f44b4b');

  cBench.data.labels = labels;
  cBench.data.datasets = [{ label: 'Hiệu suất %', data: vals, backgroundColor: colors.map(c => c + '99'), borderColor: colors, borderWidth: 1.5, borderRadius: 4 }];
  cBench.options.plugins.tooltip.callbacks = { label: c => ` ${c.label}: ${c.parsed.x.toFixed(1)}%` };
  cBench.update();

  const best  = areas[vals.indexOf(Math.max(...vals))];
  const worst = areas[vals.indexOf(Math.min(...vals))];
  document.getElementById('benchBest').textContent  = AREA_NAMES_MAP[best]  || '--';
  document.getElementById('benchWorst').textContent = AREA_NAMES_MAP[worst] || '--';
  hideSpin('spBench');
}

// ============================================================
// 5. TREND + FORECAST
// ============================================================
function updateTrend() {
  showSpin('spTrend');
  const sel     = trendPicker.getSelected();
  const indices = sel.length ? sel.map(s => s.index)
    : Array.from({ length: Math.min(BASE_MONTHS.length, 12) }, (_, i) => BASE_MONTHS.length - 12 + i);

  if (indices.length < 4 || !BASE_MONTHS.length) { cTrend.data.datasets = []; cTrend.update(); hideSpin('spTrend'); return; }

  const labels = indices.map(i => BASE_MONTHS[i]?.label || '');
  const vals   = indices.map(i => BASE_MONTHS[i]?.energy || 0);
  const reg    = linReg(vals);

  const lastM  = BASE_MONTHS[indices[indices.length - 1]];
  const preds  = Array.from({ length: 3 }, (_, k) => {
    const futX     = vals.length + k;
    const futMonth = (lastM.month + k + 1) % 12;
    const sea      = vals.reduce((s, v) => s + v) / vals.length * 0.08 * Math.sin(Math.PI * (futMonth - 3) / 6);
    return Math.max(0, Math.round(reg.a * futX + reg.b + sea));
  });

  const futLabels = preds.map((_, i) => `Dự báo T+${i + 1}`);
  const trendFull = [...reg.yhat, ...Array.from({ length: 3 }, (_, i) => reg.a * (vals.length + i) + reg.b)];

  cTrend.data.labels = [...labels, ...futLabels];
  cTrend.data.datasets = [
    { label: 'Thực tế (kWh)', data: [...vals, ...Array(3).fill(null)], borderColor: '#38aaff', backgroundColor: 'rgba(56,170,255,.06)', fill: true, borderWidth: 2, pointRadius: 3, tension: .3, spanGaps: false },
    { label: 'Trendline', data: trendFull, borderColor: 'rgba(56,170,255,.4)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0 },
    { label: 'Dự báo LR+Seasonality', data: [...Array(vals.length - 1).fill(null), vals[vals.length - 1], ...preds], borderColor: '#f5a623', backgroundColor: 'rgba(245,166,35,.07)', fill: true, borderWidth: 2, borderDash: [6, 3], pointRadius: 4, pointBackgroundColor: '#f5a623', tension: .3, spanGaps: false },
  ];
  cTrend.options.plugins.tooltip.callbacks = { filter: c => c.parsed.y !== null, label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)} kWh` };
  cTrend.update();

  const s = reg.a; const isUp = s > 500, isDown = s < -500;
  document.getElementById('trendRate').textContent     = `${s > 0 ? '+' : ''}${fmt(s, 0)} kWh/tháng`;
  document.getElementById('trendRate').style.color     = isUp ? 'var(--red)' : isDown ? 'var(--green)' : 'var(--text-primary)';
  document.getElementById('trendRateLbl').textContent  = isUp ? '⚠ Xu hướng tăng — cần kiểm tra' : isDown ? '✓ Xu hướng giảm — đang cải thiện' : '→ Ổn định';
  document.getElementById('r2Val').textContent         = reg.r2.toFixed(3);
  document.getElementById('r2Val').style.color         = reg.r2 > .75 ? 'var(--green)' : reg.r2 > .5 ? 'var(--yellow)' : 'var(--red)';
  document.getElementById('fcT1').textContent = `${fmt(preds[0])} kWh`;
  document.getElementById('fcT2').textContent = `${fmt(preds[1])} kWh`;
  document.getElementById('fcT3').textContent = `${fmt(preds[2])} kWh`;

  const bc = isUp ? 'up' : isDown ? 'down' : 'flat';
  const bi = isUp ? 'bi-arrow-up-right' : isDown ? 'bi-arrow-down-right' : 'bi-arrow-right';
  const bt = isUp ? `+${fmt(s, 0)}` : isDown ? `${fmt(s, 0)}` : 'Ổn định';
  const bh = `<span class="trend-badge ${bc}"><i class="bi ${bi}"></i>${bt} kWh/tháng</span>`;
  document.getElementById('trendBadgeWrap').innerHTML = bh;
  document.getElementById('topTrendBadge').innerHTML  = bh;
  hideSpin('spTrend');
}

// ============================================================
// 6. ANOMALY
// ============================================================
function updateAnomaly() {
  const period = state.anomalyPeriod;
  let labels, vals, n;

  const latestM = BASE_MONTHS[BASE_MONTHS.length - 1];
  if (period === 'daily') {
    labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`); n = 24;
    const base = latestM?.energy ? Math.round(latestM.energy / 24 / 30) : 100;
    vals = Array.from({ length: n }, () => Math.round(base * (0.7 + Math.random() * .6)));
  } else if (period === 'weekly') {
    labels = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN']; n = 7;
    const base = latestM?.energy ? Math.round(latestM.energy / 4 / 7) : 1200;
    vals = Array.from({ length: n }, () => Math.round(base * (0.7 + Math.random() * .6)));
  } else {
    labels = Array.from({ length: 30 }, (_, i) => i + 1); n = 30;
    const base = latestM?.energy ? Math.round(latestM.energy / 30) : 800;
    vals = Array.from({ length: n }, () => Math.round(base * (0.7 + Math.random() * .6)));
  }

  const mean   = vals.reduce((a, b) => a + b, 0) / n;
  const std    = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  const upper  = vals.map(() => Math.round(mean + 2 * std));
  const lower  = vals.map(() => Math.round(Math.max(0, mean - 2 * std)));
  const anomaly = vals.map(v => (v > mean + 2 * std || v < mean - 2 * std) ? v : null);
  const cnt    = anomaly.filter(v => v !== null).length;

  cAnomaly.data.labels = labels;
  cAnomaly.data.datasets = [
    { label: 'Giới hạn trên', data: upper,  borderColor: 'rgba(244,75,75,.2)', backgroundColor: 'rgba(244,75,75,.06)', borderDash: [3, 3], borderWidth: 1, pointRadius: 0, fill: '+1', tension: .2 },
    { label: 'Trung bình',    data: vals,   borderColor: '#38aaff', backgroundColor: 'rgba(56,170,255,.06)', fill: '-1', borderWidth: 1.5, pointRadius: 0, tension: .2 },
    { label: 'Giới hạn dưới', data: lower,  borderColor: 'rgba(244,75,75,.2)', backgroundColor: 'transparent', borderDash: [3, 3], borderWidth: 1, pointRadius: 0, fill: false, tension: .2 },
    { label: 'Bất thường',   data: anomaly, borderColor: 'transparent', backgroundColor: '#f44b4b', pointRadius: 8, pointStyle: 'triangle', showLine: false },
  ];
  cAnomaly.options.plugins.tooltip.callbacks = { filter: c => c.parsed.y !== null, label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)} kWh` };
  cAnomaly.update();

  const b = document.getElementById('anomalyBadge');
  b.textContent = `${cnt} điểm bất thường`; b.style.color = cnt > 1 ? 'var(--red)' : 'var(--green)';
  document.getElementById('anomalyCount').textContent = `${cnt} mục`;
  document.getElementById('anomalyList').innerHTML = anomaly.map((v, i) => {
    if (v === null) return '';
    const isH = v > mean; const sc = isH ? 'var(--red)' : 'var(--purple)';
    const pct = ((Math.abs(v - mean) / mean) * 100).toFixed(1);
    return `<div class="anomaly-item">
      <div class="anomaly-icon" style="background:${isH ? 'var(--red-glow)' : 'rgba(168,85,247,.15)'};color:${sc};border:1px solid ${isH ? 'rgba(244,75,75,.3)' : 'rgba(168,85,247,.3)'};">
        <i class="bi ${isH ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}"></i>
      </div>
      <div class="anomaly-body">
        <div class="anomaly-title">${isH ? 'Cao' : 'Thấp'} bất thường — ${labels[i]}</div>
        <div class="anomaly-time">${fmt(v)} kWh · TB: ${fmt(mean, 0)} kWh</div>
      </div>
      <div class="anomaly-pct" style="color:${sc};">${isH ? '+' : '−'}${pct}%</div>
    </div>`;
  }).filter(Boolean).join('');
}

// ============================================================
// MULTI-PICKER CLASS
// ============================================================
class MultiPicker {
  constructor(inId, dropId, tagId, mode = 'month') {
    this.inp   = document.getElementById(inId);
    this.drop  = document.getElementById(dropId);
    this.tagEl = document.getElementById(tagId);
    this.mode  = mode; this.selected = [];
    this.items = mode === 'month' ? BASE_MONTHS : this._days();
    this._build();
    this.inp.addEventListener('click', e => { e.stopPropagation(); this.drop.classList.toggle('open'); });
    document.addEventListener('click', e => { if (!this.drop.contains(e.target) && e.target !== this.inp) this.drop.classList.remove('open'); });
  }
  _days() {
    const arr = [], now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      arr.push({ index: i, value: d.toISOString().slice(0, 10), label: d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' }), year: d.getFullYear() });
    }
    return arr;
  }
  _build() {
    const grouped = {};
    this.items.forEach(it => { const g = it.year || new Date(it.value).getFullYear(); (grouped[g] = grouped[g] || []).push(it); });
    this.drop.innerHTML = '';
    Object.entries(grouped).reverse().forEach(([yr, its]) => {
      const t = document.createElement('div'); t.className = 'picker-yr'; t.textContent = `${yr}`; this.drop.appendChild(t);
      const g = document.createElement('div'); g.className = this.mode === 'month' ? 'picker-grid-m' : 'picker-grid-d';
      its.forEach(it => {
        const el = document.createElement('div'); el.className = 'picker-item';
        el.dataset.index = it.index;
        el.textContent = this.mode === 'month' ? it.date.toLocaleString('vi-VN', { month: 'short' }) : it.label;
        el.addEventListener('click', () => this._toggle(it, el));
        g.appendChild(el);
      });
      this.drop.appendChild(g);
    });
  }
  _toggle(it, el) {
    const idx = this.selected.findIndex(s => s.index === it.index);
    if (idx > -1) { this.selected.splice(idx, 1); el.classList.remove('sel'); }
    else { this.selected.push(it); el.classList.add('sel'); }
    this._tags();
  }
  _tags() {
    this.selected.sort((a, b) => a.index - b.index);
    this.inp.value = this.selected.map(s => this.mode === 'month' ? BASE_MONTHS[s.index]?.label || s.label : s.label).join(', ')
      || (this.mode === 'month' ? 'Chọn nhiều tháng...' : 'Chọn nhiều ngày...');
    this.tagEl.innerHTML = this.selected.map(s => `<span class="tag">${this.mode === 'month' ? BASE_MONTHS[s.index]?.label || s.label : s.label}<span class="rm" data-i="${s.index}">&times;</span></span>`).join('');
    this.tagEl.querySelectorAll('.rm').forEach(b => b.addEventListener('click', e => {
      const i = parseInt(e.target.dataset.i);
      this.selected = this.selected.filter(s => s.index !== i);
      this.drop.querySelector(`[data-index="${i}"]`)?.classList.remove('sel');
      this._tags();
    }));
  }
  selectByIndex(i) { const it = this.items.find(x => x.index === i); const el = this.drop.querySelector(`[data-index="${i}"]`); if (it && el && !el.classList.contains('sel')) this._toggle(it, el); }
  selectByValue(v) { const it = this.items.find(x => x.value === v); if (it) this.selectByIndex(it.index); }
  clear() { this.selected = []; this.drop.querySelectorAll('.sel').forEach(e => e.classList.remove('sel')); this._tags(); }
  getSelected() { return [...this.selected]; }
  rebuildItems() {
    this.items = this.mode === 'month' ? BASE_MONTHS : this._days();
    this.selected = []; this._build(); this._tags();
  }
}

// ============================================================
// POPULATE SELECTS
// ============================================================
function populateAreaSelect() {
  const sel = document.getElementById('selArea');
  sel.innerHTML = '<option value="all">Toàn nhà máy</option>';
  displayGroups.forEach(g => {
    const o = document.createElement('option'); o.value = g.displaygroupid; o.textContent = g.name; sel.appendChild(o);
  });
  sel.value = state.area;
}

function populateDevices(area) {
  const sel  = document.getElementById('selDevice');
  sel.innerHTML = '<option value="all">Tất cả thiết bị</option>';
  const list = area === 'all' ? allDevices : allDevices.filter(d => d.displaygroupid === area);
  list.filter(d => d.deviceid?.trim()).forEach(d => {
    const o = document.createElement('option'); o.value = d.deviceid; o.textContent = `${d.deviceid} · ${d.deviceName}`; sel.appendChild(o);
  });
  sel.value = 'all';
}

function populateBenchRef() {
  const sel = document.getElementById('benchRef');
  sel.innerHTML = '<option value="target">Mục tiêu (0.60)</option>';
  Object.keys(BENCH_EFF).forEach(k => {
    const o = document.createElement('option'); o.value = BENCH_EFF[k];
    o.textContent = `So với ${AREA_NAMES_MAP[k] || k} (${BENCH_EFF[k]})`; sel.appendChild(o);
  });
}

// ============================================================
// PICKERS  — rebuilt after BASE_MONTHS loads
// ============================================================
let monthPicker, peakPicker, trendPicker;

function rebuildPickers() {
  if (monthPicker) monthPicker.rebuildItems(); else monthPicker = new MultiPicker('monthInput', 'monthDrop', 'monthTags', 'month');
  if (peakPicker)  peakPicker.rebuildItems();  else peakPicker  = new MultiPicker('peakInput',  'peakDrop',  'peakTags',  'day');
  if (trendPicker) trendPicker.rebuildItems(); else trendPicker = new MultiPicker('trendInput', 'trendDrop', 'trendTags', 'month');

  const now = new Date(), today = now.toISOString().slice(0, 10);
  const cMI = BASE_MONTHS.findIndex(m => m.year === now.getFullYear() && m.month === now.getMonth());
  const pm  = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const py  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const pMI = BASE_MONTHS.findIndex(m => m.year === py && m.month === pm);
  if (cMI >= 0) monthPicker.selectByIndex(cMI);
  if (pMI >= 0) monthPicker.selectByIndex(pMI);
  peakPicker.selectByValue(today);
  const tStart = Math.max(0, BASE_MONTHS.length - 12);
  for (let i = tStart; i < BASE_MONTHS.length; i++) trendPicker.selectByIndex(i);
}

// ============================================================
// MASTER UPDATE
// ============================================================
async function updateAll() {
  updateKPIs();
  await updateShiftChart();
  await updatePeakChart();
  updateMonthChart();
  updateBench();
  updateTrend();
  updateAnomaly();
}

// ============================================================
// EVENTS
// ============================================================
document.getElementById('selArea').addEventListener('change', async e => {
  state.area = e.target.value; state.device = 'all';
  populateDevices(state.area);
  BASE_MONTHS = await fetchMonthlyData(state.area, 'all');
  rebuildPickers(); await updateAll();
});
document.getElementById('selDevice').addEventListener('change', async e => {
  state.device = e.target.value;
  BASE_MONTHS = await fetchMonthlyData(state.area, state.device);
  rebuildPickers(); await updateAll();
});
document.getElementById('selAnomalyPeriod').addEventListener('change', e => { state.anomalyPeriod = e.target.value; updateAnomaly(); });
document.getElementById('benchRef').addEventListener('change', updateBench);
document.getElementById('btnAddShift').addEventListener('click', () => addShiftRow());
document.getElementById('btnResetShift').addEventListener('click', () => {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('shiftControls').innerHTML = ''; shiftRowCounter = 0;
  addShiftRow(today, 0); addShiftRow(today, 1); addShiftRow(today, 2); updateShiftChart();
});
document.getElementById('btnUpdateShift').addEventListener('click', updateShiftChart);
document.getElementById('btnResetPeak').addEventListener('click', () => { peakPicker.clear(); updatePeakChart(); });
document.getElementById('btnUpdatePeak').addEventListener('click', updatePeakChart);
document.getElementById('btnResetMonth').addEventListener('click', () => { monthPicker.clear(); updateMonthChart(); });
document.getElementById('btnUpdateMonth').addEventListener('click', updateMonthChart);
document.getElementById('btnResetTrend').addEventListener('click', () => { trendPicker.clear(); updateTrend(); });
document.getElementById('btnUpdateTrend').addEventListener('click', updateTrend);
document.getElementById('btnExport').addEventListener('click', () => toast('Đang xuất dữ liệu phân tích...', 'info'));

// ============================================================
// INIT
// ============================================================
initCharts();

monthPicker = new MultiPicker('monthInput', 'monthDrop', 'monthTags', 'month');
peakPicker  = new MultiPicker('peakInput',  'peakDrop',  'peakTags',  'day');
trendPicker = new MultiPicker('trendInput', 'trendDrop', 'trendTags', 'month');

const today_str = new Date().toISOString().slice(0, 10);
addShiftRow(today_str, 0); addShiftRow(today_str, 1); addShiftRow(today_str, 2);

if (!token) toast('Chưa đăng nhập — dữ liệu có thể bị giới hạn', 'warn');
connectWS();

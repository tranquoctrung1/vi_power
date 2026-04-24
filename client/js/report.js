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
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ============================================================
// STATE
// ============================================================
let allDevices    = [];
let displayGroups = [];
let donutData     = [];
let ws            = null;
let wsReconnectTimer = null;

const state = {
  area: 'all', device: 'all',
  dateFrom: null, dateTo: null, rangeKey: '7d',
  sortCol: 'time', sortDir: 'desc',
  searchQuery: '', page: 1, pageSize: 20,
  tableData: [], filteredData: [],
};

// ============================================================
// COLOR / NAME MAPS (built from displayGroups on init)
// ============================================================
const AREA_PALETTE = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b'];
let AREA_COLORS   = {};  // displaygroupid → color
let AREA_NAMES_MAP = {}; // displaygroupid → name

// ============================================================
// UTILS
// ============================================================
const fmt = (n, d = 0) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });

function showToast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  t.className = 'toast';
  const cols = { info: 'var(--accent)', ok: 'var(--green)', warn: 'var(--yellow)', error: 'var(--red)' };
  const ics  = { info: 'bi-info-circle-fill', ok: 'bi-check-circle-fill', warn: 'bi-exclamation-triangle-fill', error: 'bi-x-circle-fill' };
  t.innerHTML = `<i class="bi ${ics[type] || ics.info}" style="color:${cols[type] || cols.info};font-size:16px;"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 350); }, 3200);
}

// Map rangeKey → range number understood by server (hours)
function getRangeNum() {
  if (state.rangeKey === 'today') return 24;
  if (state.rangeKey === '7d')    return 168;
  return 720; // month / lastmonth / custom
}

// Absolute date range for REST API table calls
function getDateRange() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  if (state.rangeKey === 'today')     return { from: new Date(y, m, d), to: new Date() };
  if (state.rangeKey === '7d')        return { from: new Date(y, m, d - 6), to: new Date() };
  if (state.rangeKey === 'month')     return { from: new Date(y, m, 1), to: new Date() };
  if (state.rangeKey === 'lastmonth') { const lm = new Date(y, m, 0); return { from: new Date(y, m - 1, 1), to: lm }; }
  if (state.rangeKey === 'custom' && state.dateFrom && state.dateTo) {
    return { from: new Date(state.dateFrom), to: new Date(state.dateTo + 'T23:59:59') };
  }
  return { from: new Date(y, m, d - 6), to: new Date() };
}

function getPrevDateRange() {
  const { from, to } = getDateRange();
  const diff = to - from;
  return { from: new Date(from.getTime() - diff - 86400000), to: from };
}

function updateComparePeriodLabel() {
  const prev = getPrevDateRange();
  const f = d => d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
  document.getElementById('comparePeriodLabel').textContent = `${f(prev.from)} – ${f(prev.to)}`;
}

// ============================================================
// WEBSOCKET
// ============================================================
function connectWS() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    showToast('Không thể kết nối WebSocket', 'error');
    return;
  }

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'client_init' }));
  };

  ws.onmessage = (event) => {
    try {
      handleWSMessage(JSON.parse(event.data));
    } catch (e) { console.error('WS parse error', e); }
  };

  ws.onerror = () => showToast('WebSocket lỗi kết nối', 'error');

  ws.onclose = () => {
    wsReconnectTimer = setTimeout(connectWS, 5000);
  };
}

function wsSend(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function handleWSMessage(msg) {
  switch (msg.type) {
    case 'data_init':     onDataInit(msg.data);       break;
    case 'chart_data':    onChartData(msg.data);       break;
    case 'heatmap_data':  onHeatmapData(msg.data);     break;
  }
}

// ============================================================
// DATA INIT
// ============================================================
function onDataInit(data) {
  displayGroups = data.displaygroup || [];
  // DeviceModel.findAll() returns { data: [...], count }
  const devRaw  = data.devices;
  allDevices    = Array.isArray(devRaw) ? devRaw : (devRaw?.data || []);
  donutData     = data.donutData || [];

  // Build maps
  displayGroups.forEach((g, i) => {
    const id = g.displaygroupid;
    AREA_COLORS[id]    = AREA_PALETTE[i % AREA_PALETTE.length];
    AREA_NAMES_MAP[id] = g.name;
  });

  populateAreaSelect();
  populateDeviceSelect(state.area);
  updateAll();
}

// ============================================================
// FILTERS
// ============================================================
function populateAreaSelect() {
  const sel = document.getElementById('selectArea');
  sel.innerHTML = '<option value="all">Toàn nhà máy</option>';
  displayGroups.forEach(g => {
    const o = document.createElement('option');
    o.value = g.displaygroupid;
    o.textContent = g.name;
    sel.appendChild(o);
  });
  sel.value = state.area;
}

function populateDeviceSelect(area) {
  const sel  = document.getElementById('selectDevice');
  sel.innerHTML = '<option value="all">Tất cả thiết bị</option>';
  const list = area === 'all' ? allDevices : allDevices.filter(d => d.displaygroupid === area);
  list.forEach(d => {
    const o = document.createElement('option');
    o.value = d.deviceid;
    o.textContent = `${d.deviceid} · ${d.deviceName}`;
    sel.appendChild(o);
  });
  sel.value = 'all';
  state.device = 'all';
}

// ============================================================
// WS HANDLERS
// ============================================================
function onChartData(ts) {
  updateKPIs(ts);
  updateCharts(ts);
}

function onHeatmapData(grid) {
  // grid: number[7][24] (0=Sunday)
  renderHeatmap(grid);
}

// ============================================================
// CHARTS
// ============================================================
let chartPower = null, chartEnergy = null, chartEff = null;

const chartDefaults = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#111c2b', borderColor: 'rgba(56,139,253,.28)', borderWidth: 1,
      titleColor: '#607b99', bodyColor: '#e6eef8', padding: 10,
    },
  },
  scales: {
    x: { grid: { color: 'rgba(56,139,253,.05)' }, ticks: { color: '#3a506b', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 } },
    y: { grid: { color: 'rgba(56,139,253,.07)' }, ticks: { color: '#607b99', font: { family: 'JetBrains Mono', size: 10 } }, beginAtZero: true },
  },
};

function cloneDefaults() { return JSON.parse(JSON.stringify(chartDefaults)); }

function initCharts() {
  chartPower = new Chart(document.getElementById('chartPower'), {
    type: 'line', data: { labels: [], datasets: [] },
    options: { ...cloneDefaults(), interaction: { mode: 'index', intersect: false } },
  });

  const energyOpts = cloneDefaults();
  energyOpts.interaction = { mode: 'index', intersect: false };
  energyOpts.scales.x.stacked = true;
  energyOpts.scales.y.stacked = true;
  chartEnergy = new Chart(document.getElementById('chartEnergy'), {
    type: 'bar', data: { labels: [], datasets: [] }, options: energyOpts,
  });

  const effOpts = cloneDefaults();
  effOpts.interaction = { mode: 'index', intersect: false };
  effOpts.scales.y.title = { display: true, text: 'kWh', color: '#607b99', font: { size: 10 } };
  chartEff = new Chart(document.getElementById('chartEff'), {
    type: 'line', data: { labels: [], datasets: [] }, options: effOpts,
  });
}

function updateCharts(ts) {
  const THRESHOLD_KW = 700;
  const pts = ts.labels.length;

  // -- Power chart --
  chartPower.data.labels   = ts.labels;
  chartPower.data.datasets = [
    { label: 'Kỳ này (kW)', data: ts.power, borderColor: '#38aaff',
      backgroundColor: 'rgba(56,170,255,.08)', fill: true,
      borderWidth: 2, pointRadius: pts > 30 ? 0 : 2, tension: .4 },
    { label: 'Kỳ trước (kW)', data: ts.prevPower, borderColor: 'rgba(56,170,255,.3)',
      backgroundColor: 'transparent', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: .4 },
    { label: `Ngưỡng ${THRESHOLD_KW} kW`, data: Array(pts).fill(THRESHOLD_KW),
      borderColor: 'rgba(244,75,75,.6)', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, fill: false },
  ];
  chartPower.options.plugins.tooltip.callbacks = { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)} kW` };
  chartPower.update();
  document.getElementById('chartPowerSubtitle').textContent =
    state.area === 'all' ? 'Toàn nhà máy' : (AREA_NAMES_MAP[state.area] || state.area);

  // -- Energy chart (stacked or single) --
  chartEnergy.data.labels = ts.labels;
  if (state.area === 'all' && displayGroups.length > 0) {
    // Split total energy by donutData percentages
    const totalDotPct = donutData.reduce((s, d) => s + (d.percentage || 0), 0) || 100;
    chartEnergy.data.datasets = displayGroups.map((g, i) => {
      const pct = (donutData.find(d => d.name === g.name)?.percentage || (100 / displayGroups.length)) / 100;
      return {
        label: g.name,
        data: ts.energy.map(e => parseFloat((e * pct).toFixed(2))),
        backgroundColor: AREA_PALETTE[i % AREA_PALETTE.length] + 'bb',
        borderColor: AREA_PALETTE[i % AREA_PALETTE.length],
        borderWidth: 0, borderRadius: 2, stack: 'A',
      };
    });
    document.getElementById('energyLegend').innerHTML = displayGroups.map((g, i) => `
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);">
        <div style="width:10px;height:10px;border-radius:2px;background:${AREA_PALETTE[i % AREA_PALETTE.length]};"></div>${g.name}
      </div>`).join('');
  } else {
    const color = AREA_COLORS[state.area] || '#38aaff';
    chartEnergy.data.datasets = [{
      label: 'Điện năng (kWh)', data: ts.energy,
      backgroundColor: color + '99', borderColor: color, borderWidth: 0, borderRadius: 3,
    }];
    document.getElementById('energyLegend').innerHTML = `
      <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);">
        <div style="width:10px;height:10px;border-radius:2px;background:${AREA_COLORS[state.area] || '#38aaff'};"></div>
        ${AREA_NAMES_MAP[state.area] || 'Khu vực'}
      </div>`;
  }
  chartEnergy.options.plugins.tooltip.callbacks = { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y, 2)} kWh` };
  chartEnergy.update();
  document.getElementById('chartEnergySubtitle').textContent =
    state.area === 'all' ? 'Stacked theo khu vực' : (AREA_NAMES_MAP[state.area] || state.area);

  // -- Cumulative energy chart (3rd slot) --
  const cumEnergy = ts.energy.reduce((acc, v) => {
    acc.push(parseFloat(((acc.length ? acc[acc.length - 1] : 0) + v).toFixed(2)));
    return acc;
  }, []);
  const prevCumEnergy = ts.prevEnergy.reduce((acc, v) => {
    acc.push(parseFloat(((acc.length ? acc[acc.length - 1] : 0) + v).toFixed(2)));
    return acc;
  }, []);
  chartEff.data.labels   = ts.labels;
  chartEff.data.datasets = [
    { label: 'Điện năng lũy kế kỳ này (kWh)', data: cumEnergy,
      borderColor: '#22d369', backgroundColor: 'rgba(34,211,105,.08)',
      fill: true, borderWidth: 2, pointRadius: pts > 20 ? 0 : 2, tension: .4 },
    { label: 'Điện năng lũy kế kỳ trước (kWh)', data: prevCumEnergy,
      borderColor: 'rgba(245,166,35,.55)', borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, fill: false },
  ];
  chartEff.options.plugins.tooltip.callbacks = { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y, 1)} kWh` };
  chartEff.update();
}

// ============================================================
// KPI
// ============================================================
function updateKPIs(ts) {
  const totalE    = ts.energy.reduce((s, e) => s + e, 0);
  const prevE     = ts.prevEnergy.reduce((s, e) => s + e, 0);
  const peakP     = Math.max(...ts.power, 0);
  const prevPeakP = Math.max(...ts.prevPower, 0);

  const delta = (cur, prv, lowerBetter = true) => {
    if (!prv) return { html: '--', cls: 'kpi-delta' };
    const pct  = ((cur - prv) / prv * 100).toFixed(1);
    const up   = pct > 0;
    const good = lowerBetter ? !up : up;
    const icon = up ? 'bi-arrow-up-short' : 'bi-arrow-down-short';
    return { html: `<i class="bi ${icon}"></i>${Math.abs(pct)}%`, cls: `kpi-delta ${good ? 'down-bad' : 'up-good'}` };
  };

  document.getElementById('kpiEnergy').innerHTML = `${fmt(totalE, 0)} <sup>kWh</sup>`;
  const de = delta(totalE, prevE, true);
  const dd = document.getElementById('kpiEnergyDelta');
  dd.innerHTML = de.html; dd.className = de.cls;

  document.getElementById('kpiPeak').innerHTML = `${fmt(peakP)} <sup>kW</sup>`;
  const dp = delta(peakP, prevPeakP, true);
  const pd = document.getElementById('kpiPeakDelta');
  pd.innerHTML = dp.html; pd.className = dp.cls;

  // Efficiency: no flow data available
  document.getElementById('kpiEff').innerHTML = `-- <sup>kWh/m³</sup>`;
  document.getElementById('kpiEffDelta').innerHTML = '<span style="color:var(--text-dim)">N/A</span>';
}

// ============================================================
// HEATMAP
// ============================================================
const HM_COLORS = ['#0d1a2b', '#0d3060', '#0e4d9e', '#1168c8', '#1a85e0', '#38aaff', '#6dc8ff', '#b3e4ff'];
const HM_DAYS   = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']; // grid[0]=Sunday

function renderHeatmap(grid) {
  const gridEl  = document.getElementById('heatmapGrid');
  const allVals = grid.flat();
  const maxV    = Math.max(...allVals) || 1;
  const minV    = Math.min(...allVals);

  let html = '<div class="hm-header"></div>';
  for (let h = 0; h < 24; h++) html += `<div class="hm-header">${String(h).padStart(2, '0')}</div>`;

  grid.forEach((row, di) => {
    html += `<div class="hm-label">${HM_DAYS[di]}</div>`;
    row.forEach((v, h) => {
      const ratio = (v - minV) / (maxV - minV || 1);
      const ci    = Math.min(7, Math.floor(ratio * 8));
      const textC = ci >= 4 ? 'rgba(255,255,255,0.9)' : 'transparent';
      html += `<div class="hm-cell" style="background:${HM_COLORS[ci]};color:${textC};"
        title="${HM_DAYS[di]} ${String(h).padStart(2, '0')}:00 — ${fmt(v)} kW">${v}</div>`;
    });
  });

  gridEl.innerHTML = html;
  document.getElementById('hmLegendBar').innerHTML =
    HM_COLORS.map(c => `<div class="hm-legend-seg" style="background:${c};"></div>`).join('');
}

// ============================================================
// TABLE — REST API
// ============================================================
async function fetchTableData() {
  if (!token) {
    showToast('Chưa đăng nhập — không thể tải bảng dữ liệu', 'warn');
    return;
  }

  const { from, to } = getDateRange();
  const devList  = state.area === 'all'
    ? allDevices
    : allDevices.filter(d => d.displaygroupid === state.area);
  const targets  = state.device === 'all'
    ? devList
    : devList.filter(d => d.deviceid === state.device);

  if (!targets.length) {
    state.tableData = [];
    state.page      = 1;
    renderTable();
    return;
  }

  const rows = [];
  await Promise.all(targets.map(async (dev) => {
    try {
      const url = `${API_BASE}/data/energy/${dev.deviceid}` +
        `?startTime=${from.toISOString()}&endTime=${to.toISOString()}&limit=500&sort=desc`;
      const res  = await fetch(url, { headers: authHeaders() });
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;

      for (const r of json.data) {
        rows.push({
          time:     new Date(r.timestamp),
          timeStr:  new Date(r.timestamp).toLocaleString('vi-VN'),
          device:   dev.deviceName,
          deviceId: dev.deviceid,
          area:     dev.displaygroupid,
          areaName: AREA_NAMES_MAP[dev.displaygroupid] || dev.displaygroupid || '--',
          power:    r.power    || 0,
          energy:   r.netpower || 0,
          pf:       r.per      || null,
          status:   r.power > 0 ? 'ok' : 'error',
        });
      }
    } catch (e) {
      console.error(`Fetch error ${dev.deviceid}:`, e);
    }
  }));

  state.tableData = rows;
  state.page      = 1;
  renderTable();
}

// ============================================================
// TABLE RENDER
// ============================================================
function renderTable() {
  let data = [...state.tableData];

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    data = data.filter(r =>
      r.device.toLowerCase().includes(q) ||
      r.areaName.toLowerCase().includes(q) ||
      r.timeStr.toLowerCase().includes(q)
    );
  }

  data.sort((a, b) => {
    let va = a[state.sortCol], vb = b[state.sortCol];
    if (state.sortCol === 'time') { va = a.time.getTime(); vb = b.time.getTime(); }
    if (typeof va === 'string') return state.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return state.sortDir === 'asc' ? va - vb : vb - va;
  });
  state.filteredData = data;

  const totalE = data.reduce((s, r) => s + r.energy, 0);
  const avgP   = data.length ? data.reduce((s, r) => s + r.power, 0) / data.length : 0;
  const pfRows = data.filter(r => r.pf !== null && r.pf > 0);
  const avgPF  = pfRows.length ? pfRows.reduce((s, r) => s + r.pf, 0) / pfRows.length : null;

  document.getElementById('footerAvgPower').textContent    = `${fmt(avgP, 0)} kW TB`;
  document.getElementById('footerTotalEnergy').textContent = `${fmt(totalE, 2)} kWh`;
  document.getElementById('footerAvgEff').textContent      = avgPF !== null ? `PF ${avgPF.toFixed(2)}` : '--';
  document.getElementById('tableRecordInfo').textContent   = `${fmt(data.length)} bản ghi`;

  const ps         = parseInt(state.pageSize);
  const totalPages = Math.max(1, Math.ceil(data.length / ps));
  state.page       = Math.min(state.page, totalPages);
  const pageData   = data.slice((state.page - 1) * ps, state.page * ps);

  const statusLabel = { ok: 'Bình thường', error: 'Lỗi', warn: 'Cảnh báo' };
  const statusCls   = { ok: 'ok', error: 'warn', warn: 'warn' };

  document.getElementById('tableBody').innerHTML = pageData.map(r => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);">${r.timeStr}</td>
      <td style="font-weight:500;">${r.device}</td>
      <td>
        <span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;
          color:${AREA_COLORS[r.area] || 'var(--accent)'};
          background:${AREA_COLORS[r.area] || '#38aaff'}22;">
          ${r.areaName}
        </span>
      </td>
      <td class="num">${fmt(r.power, 0)}</td>
      <td class="num">${fmt(r.energy, 4)}</td>
      <td class="num">${r.pf !== null ? r.pf.toFixed(2) : '--'}</td>
      <td><span class="status-badge ${statusCls[r.status] || 'normal'}">${statusLabel[r.status] || r.status}</span></td>
    </tr>`).join('');

  document.getElementById('pageInfo').textContent = `Trang ${state.page} / ${totalPages} · ${fmt(data.length)} bản ghi`;
  renderPagination(totalPages);

  document.querySelectorAll('.data-table thead th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === state.sortCol) th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}

function renderPagination(totalPages) {
  const pg = document.getElementById('pagination');
  let html = `<button class="page-btn" onclick="goPage(${state.page - 1})" ${state.page <= 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>`;
  const range = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - state.page) <= 2) range.push(i);
    else if (range[range.length - 1] !== '…') range.push('…');
  }
  range.forEach(p => {
    if (p === '…') html += `<span style="color:var(--text-dim);padding:0 4px;">…</span>`;
    else html += `<button class="page-btn ${p === state.page ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
  });
  html += `<button class="page-btn" onclick="goPage(${state.page + 1})" ${state.page >= totalPages ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>`;
  pg.innerHTML = html;
}

window.goPage = p => { state.page = p; renderTable(); };

// ============================================================
// CSV EXPORT
// ============================================================
function exportCSV() {
  const data = state.filteredData.length ? state.filteredData : state.tableData;
  if (!data.length) { showToast('Không có dữ liệu để xuất', 'warn'); return; }

  const header = ['Thời gian', 'Thiết bị', 'ID', 'Khu vực', 'Công suất (kW)', 'Điện năng (kWh)', 'PF', 'Trạng thái'];
  const meta   = [
    ['Báo cáo năng lượng — ViPower'],
    ['Nhà máy: Nhà máy Xử lý Nước'],
    [`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`],
    [],
    header,
  ];
  const rows = data.map(r => [r.timeStr, r.device, r.deviceId, r.areaName, r.power, r.energy, r.pf ?? '', r.status]);
  const csv  = [...meta, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `BaoCao_ViPower_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Đã xuất ${fmt(data.length)} bản ghi CSV`, 'ok');
}

// ============================================================
// MASTER UPDATE
// ============================================================
function updateAll() {
  const rangeNum = getRangeNum();

  // WebSocket: chart + heatmap
  wsSend({ type: 'request_chart_data',   message: { area: state.area, device: state.device, range: rangeNum } });
  wsSend({ type: 'request_heatmap_data', message: { area: state.area, device: state.device } });

  // REST: table
  fetchTableData();
  updateComparePeriodLabel();
}

// ============================================================
// BOOT
// ============================================================
initCharts();

const today = new Date();
document.getElementById('dateFrom').value = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10);
document.getElementById('dateTo').value   = today.toISOString().slice(0, 10);

if (!token) {
  showToast('Chưa đăng nhập — một số tính năng sẽ bị giới hạn', 'warn');
}

connectWS();

// ============================================================
// EVENTS
// ============================================================
document.getElementById('selectArea').addEventListener('change', e => {
  state.area = e.target.value;
  populateDeviceSelect(state.area);
  updateAll();
});

document.getElementById('selectDevice').addEventListener('change', e => {
  state.device = e.target.value;
  updateAll();
});

document.querySelectorAll('.range-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.rangeKey = btn.dataset.range;
    state.page     = 1;
    const isCustom = state.rangeKey === 'custom';
    document.getElementById('customDateGroup').style.display = isCustom ? 'flex' : 'none';
    if (!isCustom) updateAll();
  });
});

document.getElementById('btnApplyDate').addEventListener('click', () => {
  state.dateFrom = document.getElementById('dateFrom').value;
  state.dateTo   = document.getElementById('dateTo').value;
  if (!state.dateFrom || !state.dateTo) {
    showToast('Vui lòng chọn đủ ngày bắt đầu và kết thúc', 'warn'); return;
  }
  if (new Date(state.dateFrom) > new Date(state.dateTo)) {
    showToast('Ngày bắt đầu phải trước ngày kết thúc', 'warn'); return;
  }
  state.page = 1;
  updateAll();
});

document.querySelectorAll('.data-table thead th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    if (state.sortCol === th.dataset.col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = th.dataset.col; state.sortDir = 'desc'; }
    state.page = 1;
    renderTable();
  });
});

document.getElementById('tableSearch').addEventListener('input', e => {
  state.searchQuery = e.target.value;
  state.page        = 1;
  renderTable();
});

document.getElementById('tablePageSize').addEventListener('change', e => {
  state.pageSize = parseInt(e.target.value);
  state.page     = 1;
  renderTable();
});

document.getElementById('btnExportCSV').addEventListener('click',  exportCSV);
document.getElementById('btnExportCSV2').addEventListener('click', exportCSV);
document.getElementById('btnExportPDF').addEventListener('click', () => {
  showToast('Tính năng xuất PDF đang phát triển — vui lòng dùng Ctrl+P', 'info');
});

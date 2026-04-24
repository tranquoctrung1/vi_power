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
const LEVEL_CONFIG = {
  critical: { label: 'Critical', color: 'var(--red)',    icon: 'bi-x-octagon-fill' },
  warning:  { label: 'Warning',  color: 'var(--orange)', icon: 'bi-exclamation-triangle-fill' },
  info:     { label: 'Info',     color: 'var(--accent)', icon: 'bi-info-circle-fill' },
  ok:       { label: 'OK',       color: 'var(--green)',  icon: 'bi-check-circle-fill' },
};
const SEV_MAP     = { red: 'critical', orange: 'warning', green: 'ok' };
const AREA_PALETTE = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b'];

// ============================================================
// RUNTIME STATE
// ============================================================
let allAlerts    = [];
let allDevices   = [];
let displayGroups = [];
let AREA_COLORS  = {};   // displaygroupid → color
let AREA_NAMES   = {};   // displaygroupid → name
let ws = null, wsReconnectTimer = null;

// ============================================================
// ALERT MAPPING  (DB → UI)
// ============================================================
function mapAlert(a) {
  const dev = allDevices.find(d => d.deviceid === a.deviceid);
  return {
    id:        a._id,
    time:      new Date(a.timestamp || a.createdAt),
    timeStr:   new Date(a.timestamp || a.createdAt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    device:    a.deviceName || dev?.deviceName || '--',
    deviceId:  a.deviceid   || '--',
    area:      dev?.displaygroupid || '',
    type:      a.alertType  || 'Khác',
    level:     SEV_MAP[a.severity] || 'info',
    status:    a.resolved ? 'resolved' : 'new',
    message:   a.message    || '--',
    value:     '--',
    threshold: '--',
    note:      a.note       || '',
    selected:  false,
  };
}

// ============================================================
// STATE
// ============================================================
let state = {
  levelFilter: 'all', areaFilter: 'all', deviceFilter: 'all',
  typeFilter: 'all', statusFilter: 'all', search: '',
  dateFrom: '', dateTo: '',
  sortCol: 'time', sortDir: 'desc',
  page: 1, pageSize: 20,
  filtered: [],
};

// ============================================================
// UTILS
// ============================================================
const fmt = n => Number(n).toLocaleString('vi-VN');

function showToast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  t.className = 'toast';
  const cols = { info: 'var(--accent)', ok: 'var(--green)', warn: 'var(--yellow)', error: 'var(--red)' };
  const ics  = { info: 'bi-info-circle-fill', ok: 'bi-check-circle-fill', warn: 'bi-exclamation-triangle-fill', error: 'bi-x-circle-fill' };
  t.innerHTML = `<i class="bi ${ics[type] || ics.info}" style="color:${cols[type] || cols.info};font-size:16px;"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 350); }, 3000);
}

// ============================================================
// WEBSOCKET
// ============================================================
function connectWS() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  try { ws = new WebSocket(WS_URL); } catch (e) {
    showToast('Không thể kết nối WebSocket', 'error'); return;
  }
  ws.onopen    = () => ws.send(JSON.stringify({ type: 'client_init' }));
  ws.onmessage = e => { try { handleWSMsg(JSON.parse(e.data)); } catch (err) {} };
  ws.onerror   = () => showToast('WebSocket lỗi kết nối', 'error');
  ws.onclose   = () => { wsReconnectTimer = setTimeout(connectWS, 5000); };
}

function handleWSMsg(msg) {
  switch (msg.type) {
    case 'data_init':       onDataInit(msg.data);  break;
    case 'history_inserted': refreshFromServer();   break;
  }
}

function onDataInit(data) {
  displayGroups = data.displaygroup || [];
  allDevices    = Array.isArray(data.devices) ? data.devices : (data.devices?.data || []);

  AREA_COLORS = {}; AREA_NAMES = {};
  displayGroups.forEach((g, i) => {
    AREA_COLORS[g.displaygroupid] = AREA_PALETTE[i % AREA_PALETTE.length];
    AREA_NAMES[g.displaygroupid]  = g.name;
  });

  populateAreaFilter();
  populateDeviceFilter('all');

  const rawAlerts = data.alarms || [];
  allAlerts = rawAlerts.map(mapAlert).sort((a, b) => b.time - a.time);

  updateKPIs();
  updateTimeline();
  updateDistribution();
  applyFilters();
}

function refreshFromServer() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'client_init' }));
  }
}

// ============================================================
// POPULATE FILTERS DYNAMICALLY
// ============================================================
function populateAreaFilter() {
  const sel = document.getElementById('filterArea');
  sel.innerHTML = '<option value="all">Tất cả</option>';
  displayGroups.forEach(g => {
    const o = document.createElement('option');
    o.value = g.displaygroupid; o.textContent = g.name;
    sel.appendChild(o);
  });
  sel.value = state.areaFilter === 'all' ? 'all' : state.areaFilter;
}

function populateDeviceFilter(area) {
  const sel  = document.getElementById('filterDevice');
  sel.innerHTML = '<option value="all">Tất cả</option>';
  const list = area === 'all' ? allDevices : allDevices.filter(d => d.displaygroupid === area);
  list.filter(d => d.deviceid?.trim()).forEach(d => {
    const o = document.createElement('option');
    o.value = d.deviceid; o.textContent = `${d.deviceid} · ${d.deviceName}`;
    sel.appendChild(o);
  });
}

// ============================================================
// KPI STRIP
// ============================================================
function updateKPIs() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayAlerts = allAlerts.filter(a => a.time >= today);
  document.getElementById('kpiTotalVal').textContent      = todayAlerts.length;
  document.getElementById('kpiCriticalVal').textContent   = todayAlerts.filter(a => a.level === 'critical').length;
  document.getElementById('kpiWarningVal').textContent    = todayAlerts.filter(a => a.level === 'warning').length;
  document.getElementById('kpiOkVal').textContent         = todayAlerts.filter(a => a.level === 'ok').length;
  document.getElementById('kpiUnresolvedVal').textContent = allAlerts.filter(a => a.status === 'new').length;
  const badge = document.getElementById('sidebarBadge');
  if (badge) badge.textContent = allAlerts.filter(a => a.status === 'new').length;
}

// ============================================================
// TIMELINE CHART
// ============================================================
let chartTimeline = null;
function updateTimeline() {
  const now = new Date(); const days = 30;
  const labels = [], dataCrit = [], dataWarn = [], dataOk = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const da = allAlerts.filter(a => a.time >= d && a.time < next);
    labels.push(d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' }));
    dataCrit.push(da.filter(a => a.level === 'critical').length);
    dataWarn.push(da.filter(a => a.level === 'warning').length);
    dataOk.push(da.filter(a => a.level === 'ok' || a.level === 'info').length);
  }
  if (!chartTimeline) {
    chartTimeline = new Chart(document.getElementById('chartTimeline'), {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Critical', data: dataCrit, backgroundColor: 'rgba(244,75,75,.75)',   borderRadius: 2, stack: 'A' },
        { label: 'Warning',  data: dataWarn, backgroundColor: 'rgba(255,112,67,.65)',  borderRadius: 2, stack: 'A' },
        { label: 'OK/Info',  data: dataOk,   backgroundColor: 'rgba(34,211,105,.55)', borderRadius: 2, stack: 'A' },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#111c2b', borderColor: 'rgba(56,139,253,.28)', borderWidth: 1, bodyColor: '#e6eef8', padding: 8, mode: 'index', intersect: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#3a506b', font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 10 }, stacked: true },
          y: { grid: { color: 'rgba(56,139,253,.06)' }, ticks: { color: '#607b99', font: { family: 'JetBrains Mono', size: 10 } }, stacked: true, beginAtZero: true },
        },
      },
    });
  } else {
    chartTimeline.data.labels = labels;
    chartTimeline.data.datasets[0].data = dataCrit;
    chartTimeline.data.datasets[1].data = dataWarn;
    chartTimeline.data.datasets[2].data = dataOk;
    chartTimeline.update();
  }
}

// ============================================================
// DEVICE DISTRIBUTION
// ============================================================
function updateDistribution() {
  const counts = {};
  allDevices.forEach(d => { counts[d.deviceid] = 0; });
  allAlerts.filter(a => a.status !== 'resolved').forEach(a => {
    counts[a.deviceId] = (counts[a.deviceId] || 0) + 1;
  });
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] || 1;
  document.getElementById('distList').innerHTML = sorted.map(([id, cnt]) => {
    const dev   = allDevices.find(d => d.deviceid === id);
    const color = AREA_COLORS[dev?.displaygroupid] || 'var(--accent)';
    return `<div class="dist-row">
      <span class="dist-label">${dev?.deviceName || id}</span>
      <div class="dist-track"><div class="dist-fill" style="width:${cnt / max * 100}%;background:${color};"></div></div>
      <span class="dist-count" style="color:${color};">${cnt}</span>
    </div>`;
  }).join('');
}

// ============================================================
// FILTER + RENDER TABLE
// ============================================================
function applyFilters() {
  let data = [...allAlerts];
  if (state.levelFilter  !== 'all') data = data.filter(a => a.level    === state.levelFilter);
  if (state.areaFilter   !== 'all') data = data.filter(a => a.area     === state.areaFilter);
  if (state.deviceFilter !== 'all') data = data.filter(a => a.deviceId === state.deviceFilter);
  if (state.typeFilter   !== 'all') data = data.filter(a => a.type     === state.typeFilter);
  if (state.statusFilter !== 'all') data = data.filter(a => a.status   === state.statusFilter);
  if (state.search) {
    const q = state.search.toLowerCase();
    data = data.filter(a => a.message.toLowerCase().includes(q) || a.device.toLowerCase().includes(q) || a.type.toLowerCase().includes(q));
  }
  if (state.dateFrom) { const f = new Date(state.dateFrom); data = data.filter(a => a.time >= f); }
  if (state.dateTo)   { const t = new Date(state.dateTo); t.setHours(23, 59, 59); data = data.filter(a => a.time <= t); }

  data.sort((a, b) => {
    const va = state.sortCol === 'time' ? a.time.getTime() : a[state.sortCol];
    const vb = state.sortCol === 'time' ? b.time.getTime() : b[state.sortCol];
    if (typeof va === 'string') return state.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return state.sortDir === 'asc' ? va - vb : vb - va;
  });

  state.filtered = data;
  renderTable();
}

function renderTable() {
  const data = state.filtered;
  const ps   = state.pageSize;
  const totalPages = Math.max(1, Math.ceil(data.length / ps));
  state.page = Math.min(state.page, totalPages);
  const pageData = data.slice((state.page - 1) * ps, state.page * ps);

  document.getElementById('tableInfo').textContent = `${fmt(data.length)} bản ghi`;
  document.getElementById('pageInfo').textContent  = `Trang ${state.page}/${totalPages} · ${fmt(data.length)} bản ghi`;

  const tbody = document.getElementById('alertTableBody');
  tbody.innerHTML = pageData.map(a => {
    const lc  = LEVEL_CONFIG[a.level] || LEVEL_CONFIG.info;
    const ac  = AREA_COLORS[a.area]   || 'var(--accent)';
    const an  = AREA_NAMES[a.area]    || a.area || '--';
    const unread = a.status === 'new';
    return `<tr class="${unread ? 'unread' : ''}" data-id="${a.id}">
      <td style="padding:9px 8px;"><input type="checkbox" class="row-check" data-id="${a.id}" style="accent-color:var(--accent);cursor:pointer;" ${a.selected ? 'checked' : ''}></td>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);white-space:nowrap;">${a.timeStr}</td>
      <td style="font-weight:500;white-space:nowrap;">${a.device}</td>
      <td><span class="area-tag" style="background:${ac}18;color:${ac};">${an}</span></td>
      <td style="font-size:12px;color:var(--text-muted);">${a.type}</td>
      <td style="font-size:12.5px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.message}">${a.message}</td>
      <td><span class="level-badge ${a.level}"><i class="bi ${lc.icon}"></i>${lc.label}</span></td>
      <td><span class="status-badge ${a.status}">${a.status === 'new' ? 'Mới' : a.status === 'seen' ? 'Đã xem' : 'Đã xử lý'}</span></td>
      <td>
        <div style="display:flex;gap:4px;">
          ${a.status !== 'resolved' ? `<button class="action-btn resolve" data-action="resolve" data-id="${a.id}"><i class="bi bi-check"></i></button>` : ''}
          <button class="action-btn" data-action="detail" data-id="${a.id}"><i class="bi bi-eye"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.alert-table thead th[data-col]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === state.sortCol) th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });

  renderPagination(totalPages);
  updateBulkBar();
}

function renderPagination(total) {
  const pg = document.getElementById('pagination');
  let html = `<button class="page-btn" onclick="goPage(${state.page - 1})" ${state.page <= 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>`;
  const range = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - state.page) <= 2) range.push(i);
    else if (range[range.length - 1] !== '…') range.push('…');
  }
  range.forEach(p => {
    if (p === '…') html += `<span style="color:var(--text-dim);padding:0 4px;">…</span>`;
    else html += `<button class="page-btn ${p === state.page ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
  });
  html += `<button class="page-btn" onclick="goPage(${state.page + 1})" ${state.page >= total ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>`;
  pg.innerHTML = html;
}
window.goPage = p => { state.page = p; renderTable(); };

// ============================================================
// BULK ACTIONS
// ============================================================
function updateBulkBar() {
  const selected = allAlerts.filter(a => a.selected);
  const bar = document.getElementById('bulkBar');
  if (selected.length > 0) {
    bar.classList.remove('hidden');
    document.getElementById('bulkCount').textContent = `${selected.length} mục được chọn`;
  } else {
    bar.classList.add('hidden');
  }
}

function getAlertById(id) { return allAlerts.find(a => String(a.id) === String(id)); }

// ============================================================
// API ACTIONS
// ============================================================
async function apiResolve(alertId) {
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
      method: 'PATCH', headers: authHeaders(),
    });
    if (!res.ok) throw new Error('API error');
  } catch (e) {
    showToast('Lỗi kết nối API khi xử lý cảnh báo', 'error');
  }
}

async function apiUpdateNote(alertId, note) {
  if (!token || !note) return;
  try {
    await fetch(`${API_BASE}/alerts/${alertId}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ note }),
    });
  } catch (e) {}
}

// ============================================================
// DETAIL MODAL
// ============================================================
let currentAlertId = null;
function openModal(id) {
  const a = getAlertById(id); if (!a) return;
  currentAlertId = id;
  if (a.status === 'new') { a.status = 'seen'; updateKPIs(); renderTable(); }

  const lc = LEVEL_CONFIG[a.level] || LEVEL_CONFIG.info;
  document.getElementById('modalLevelBadge').innerHTML = `<span class="level-badge ${a.level}"><i class="bi ${lc.icon}"></i>${lc.label}</span>`;
  document.getElementById('modalTitle').textContent    = a.message;
  document.getElementById('mDevice').textContent       = `${a.device} (${a.deviceId})`;
  document.getElementById('mArea').textContent         = AREA_NAMES[a.area] || a.area || '--';
  document.getElementById('mTime').textContent         = a.time.toLocaleString('vi-VN');
  document.getElementById('mType').textContent         = a.type;
  document.getElementById('mMessage').textContent      = a.message;
  document.getElementById('mValue').textContent        = a.value;
  document.getElementById('mValue').style.color        = lc.color;
  document.getElementById('mThresh').textContent       = a.threshold;
  document.getElementById('mNote').value               = a.note || '';

  const resolveBtn = document.getElementById('modalResolveBtn');
  if (a.status === 'resolved') {
    resolveBtn.textContent = '✓ Đã xử lý';
    resolveBtn.style.background = 'var(--green)';
    resolveBtn.disabled = true;
  } else {
    resolveBtn.innerHTML = '<i class="bi bi-check-circle" style="margin-right:5px;"></i>Đánh dấu đã xử lý';
    resolveBtn.style.background = 'var(--accent)';
    resolveBtn.disabled = false;
  }
  document.getElementById('modalBackdrop').classList.add('open');
}
function closeModal() { document.getElementById('modalBackdrop').classList.remove('open'); }

// ============================================================
// EVENTS
// ============================================================
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', e => { if (e.target === document.getElementById('modalBackdrop')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

document.getElementById('modalResolveBtn').addEventListener('click', async () => {
  const a = getAlertById(currentAlertId); if (!a || a.status === 'resolved') return;
  const note = document.getElementById('mNote').value;
  await apiUpdateNote(a.id, note);
  await apiResolve(a.id);
  a.status = 'resolved'; a.note = note;
  closeModal(); updateKPIs(); updateDistribution(); applyFilters();
  showToast(`Đã xử lý: ${a.message.substring(0, 40)}...`, 'ok');
});

document.getElementById('alertTableBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  const row = e.target.closest('tr[data-id]');
  const chk = e.target.closest('.row-check');
  if (chk) {
    const a = getAlertById(chk.dataset.id); if (a) { a.selected = chk.checked; updateBulkBar(); } return;
  }
  if (btn) {
    if (btn.dataset.action === 'resolve') {
      const a = getAlertById(btn.dataset.id); if (!a) return;
      apiResolve(a.id);
      a.status = 'resolved'; updateKPIs(); updateDistribution(); applyFilters();
      showToast('Đã đánh dấu xử lý', 'ok'); return;
    }
    if (btn.dataset.action === 'detail') { openModal(btn.dataset.id); return; }
  }
  if (row && !chk) { openModal(row.dataset.id); }
});

document.getElementById('checkAll').addEventListener('change', e => {
  const ps = state.pageSize;
  const pageData = state.filtered.slice((state.page - 1) * ps, state.page * ps);
  pageData.forEach(a => { a.selected = e.target.checked; });
  renderTable(); updateBulkBar();
});

document.getElementById('btnBulkResolve').addEventListener('click', async () => {
  const selected = allAlerts.filter(a => a.selected);
  await Promise.all(selected.map(a => apiResolve(a.id)));
  selected.forEach(a => { a.status = 'resolved'; a.selected = false; });
  updateKPIs(); updateDistribution(); applyFilters();
  showToast(`Đã xử lý ${selected.length} cảnh báo`, 'ok');
});
document.getElementById('btnBulkSeen').addEventListener('click', () => {
  allAlerts.filter(a => a.selected && a.status === 'new').forEach(a => { a.status = 'seen'; a.selected = false; });
  updateKPIs(); applyFilters(); showToast('Đã đánh dấu đã xem', 'ok');
});
document.getElementById('btnBulkClear').addEventListener('click', () => {
  allAlerts.forEach(a => a.selected = false); renderTable(); updateBulkBar();
});

document.querySelectorAll('.alert-table thead th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    if (state.sortCol === th.dataset.col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = th.dataset.col; state.sortDir = 'desc'; }
    state.page = 1; applyFilters();
  });
});

document.getElementById('searchInput').addEventListener('input',   e => { state.search = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('filterArea').addEventListener('change',   e => { state.areaFilter = e.target.value; populateDeviceFilter(e.target.value); state.page = 1; applyFilters(); });
document.getElementById('filterDevice').addEventListener('change', e => { state.deviceFilter = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('filterType').addEventListener('change',   e => { state.typeFilter = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('filterStatus').addEventListener('change', e => { state.statusFilter = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('dateFrom').addEventListener('change',     e => { state.dateFrom = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('dateTo').addEventListener('change',       e => { state.dateTo = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('pageSize').addEventListener('change',     e => { state.pageSize = parseInt(e.target.value); state.page = 1; renderTable(); });

document.getElementById('btnResetFilter').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  ['filterArea', 'filterDevice', 'filterType', 'filterStatus'].forEach(id => document.getElementById(id).value = 'all');
  ['dateFrom', 'dateTo'].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.kpi-cell').forEach(c => c.classList.remove('selected'));
  Object.assign(state, { levelFilter: 'all', areaFilter: 'all', deviceFilter: 'all', typeFilter: 'all', statusFilter: 'all', search: '', dateFrom: '', dateTo: '', page: 1 });
  applyFilters(); showToast('Đã xóa toàn bộ bộ lọc', 'info');
});

document.querySelectorAll('.kpi-cell[data-filter-level]').forEach(cell => {
  cell.addEventListener('click', () => {
    document.querySelectorAll('.kpi-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    state.levelFilter = cell.dataset.filterLevel; state.page = 1; applyFilters();
  });
});

document.getElementById('btnMarkAllSeen').addEventListener('click', () => {
  const n = allAlerts.filter(a => a.status === 'new').length;
  allAlerts.filter(a => a.status === 'new').forEach(a => a.status = 'seen');
  updateKPIs(); applyFilters();
  showToast(`Đã đánh dấu đã xem ${n} cảnh báo`, 'ok');
});

document.getElementById('btnExport').addEventListener('click', () => {
  const data   = state.filtered.length ? state.filtered : allAlerts;
  const header = ['ID', 'Thời gian', 'Thiết bị', 'Khu vực', 'Loại lỗi', 'Nội dung', 'Mức độ', 'Trạng thái', 'Ghi chú'];
  const rows   = data.map(a => [a.id, a.timeStr, a.device, AREA_NAMES[a.area] || a.area, a.type, a.message, a.level, a.status, a.note || '']);
  const csv    = [['Nhật ký Cảnh báo — ViPower'], [`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`], [], header, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `CanhBao_ViPower_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Đã xuất ${fmt(data.length)} bản ghi`, 'ok');
});

document.getElementById('btnRefresh').addEventListener('click', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'client_init' }));
  } else { connectWS(); }
  showToast('Đang làm mới dữ liệu...', 'info');
});

// ============================================================
// DEFAULT DATES
// ============================================================
const today = new Date();
document.getElementById('dateTo').value   = today.toISOString().slice(0, 10);
document.getElementById('dateFrom').value = new Date(today.getTime() - 29 * 86400000).toISOString().slice(0, 10);

// ============================================================
// INIT
// ============================================================
if (!token) showToast('Chưa đăng nhập — dữ liệu có thể bị giới hạn', 'warn');
connectWS();

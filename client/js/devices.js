'use strict';


let token = localStorage.getItem('token');
function authHeaders() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Runtime state ─────────────────────────────────────────────
let allDevices     = [];
let displayGroups  = [];
let AREA_COLORS    = {};
let AREA_NAMES     = {};
const AREA_PALETTE = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b'];

let ws = null, wsReconnectTimer = null;

let state = {
  search: '', groupFilter: 'all', typeFilter: 'all', statusFilter: 'all',
  kpiFilter: 'all',
  sortCol: 'deviceid', sortDir: 'asc',
  page: 1, pageSize: 20,
  filtered: [],
};

// ── Utils ─────────────────────────────────────────────────────
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

// ── Custom confirm dialog ─────────────────────────────────────
function showConfirm({ title = 'Xác nhận', msg, icon = 'bi-question-diamond', danger = false } = {}) {
  return new Promise(resolve => {
    document.getElementById('confirmModalTitle').textContent  = title;
    document.getElementById('confirmModalMsg').innerHTML      = msg;
    document.getElementById('confirmModalBigIcon').innerHTML  = `<i class="bi ${icon}"></i>`;
    const yesBtn = document.getElementById('confirmModalYes');
    yesBtn.className = danger ? 'btn-modal-danger' : 'btn-modal-primary';
    document.getElementById('confirmModalBackdrop').classList.add('open');

    const cleanup = result => {
      document.getElementById('confirmModalBackdrop').classList.remove('open');
      yesBtn.removeEventListener('click', onYes);
      document.getElementById('confirmModalNo').removeEventListener('click', onNo);
      resolve(result);
    };
    const onYes = () => cleanup(true);
    const onNo  = () => cleanup(false);
    yesBtn.addEventListener('click', onYes);
    document.getElementById('confirmModalNo').addEventListener('click', onNo);
  });
}

// ── WebSocket ─────────────────────────────────────────────────
function connectWS() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  try { ws = new WebSocket(WS_URL); } catch (e) {
    showToast('Không thể kết nối WebSocket', 'error'); return;
  }
  ws.onopen    = () => ws.send(JSON.stringify({ type: 'client_init' }));
  ws.onmessage = e => { try { handleWSMsg(JSON.parse(e.data)); } catch (_) {} };
  ws.onerror   = () => {};
  ws.onclose   = () => { wsReconnectTimer = setTimeout(connectWS, 5000); };
}

function handleWSMsg(msg) {
  if (msg.type === 'data_init') onDataInit(msg.data);
}

function onDataInit(data) {
  displayGroups = (data.displaygroup || []).map(g => ({ ...g, displaygroupid: g.displaygrouid || g.displaygroupid }));
  allDevices    = Array.isArray(data.devices) ? data.devices : (data.devices?.data || []);

  AREA_COLORS = {}; AREA_NAMES = {};
  displayGroups.forEach((g, i) => {
    AREA_COLORS[g.displaygroupid] = AREA_PALETTE[i % AREA_PALETTE.length];
    AREA_NAMES[g.displaygroupid]  = g.name;
  });

  populateGroupFilter();
  populateGroupDropdown();
  updateKPIs();
  applyFilters();
}

// ── Populate dropdowns ────────────────────────────────────────
function populateGroupFilter() {
  const sel = document.getElementById('filterGroup');
  sel.innerHTML = '<option value="all">Tất cả</option>';
  displayGroups.forEach(g => {
    const o = document.createElement('option');
    o.value = g.displaygroupid; o.textContent = g.name;
    sel.appendChild(o);
  });
  sel.value = state.groupFilter;
}

function populateGroupDropdown() {
  const sel = document.getElementById('fDisplaygroupid');
  const cur = sel.value;
  sel.innerHTML = '<option value="">-- Chọn khu vực --</option>';
  displayGroups.forEach(g => {
    const o = document.createElement('option');
    o.value = g.displaygroupid; o.textContent = g.name;
    sel.appendChild(o);
  });
  if (cur) sel.value = cur;
}

// ── KPI ───────────────────────────────────────────────────────
function updateKPIs() {
  document.getElementById('kpiTotalVal').textContent    = allDevices.length;
  document.getElementById('kpiActiveVal').textContent   = allDevices.filter(d => d.status === 'active').length;
  document.getElementById('kpiInactiveVal').textContent = allDevices.filter(d => d.status === 'inactive').length;
  document.getElementById('kpiPausedVal').textContent   = allDevices.filter(d => d.status === 'paused').length;
  document.getElementById('kpiOnlineVal').textContent   = allDevices.filter(d => d.isOnline).length;
}

// ── Filter + render ───────────────────────────────────────────
function applyFilters() {
  let data = [...allDevices];

  if (state.kpiFilter === 'active')   data = data.filter(d => d.status === 'active');
  else if (state.kpiFilter === 'inactive') data = data.filter(d => d.status === 'inactive');
  else if (state.kpiFilter === 'paused')   data = data.filter(d => d.status === 'paused');
  else if (state.kpiFilter === 'online')   data = data.filter(d => d.isOnline);

  if (state.groupFilter  !== 'all') data = data.filter(d => d.displaygroupid === state.groupFilter);
  if (state.typeFilter   !== 'all') data = data.filter(d => (d.deviceType || '').toLowerCase() === state.typeFilter.toLowerCase());
  if (state.statusFilter !== 'all') data = data.filter(d => d.status === state.statusFilter);
  if (state.search) {
    const q = state.search.toLowerCase();
    data = data.filter(d =>
      (d.deviceid   || '').toLowerCase().includes(q) ||
      (d.deviceName || '').toLowerCase().includes(q) ||
      (d.location   || '').toLowerCase().includes(q)
    );
  }

  data.sort((a, b) => {
    const va = a[state.sortCol] ?? '';
    const vb = b[state.sortCol] ?? '';
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

  document.getElementById('tableInfo').textContent = `${fmt(data.length)} thiết bị`;
  document.getElementById('pageInfo').textContent  = `Trang ${state.page}/${totalPages} · ${fmt(data.length)} thiết bị`;

  const tbody = document.getElementById('deviceTableBody');
  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="bi bi-hdd-network"></i><p>Không có thiết bị nào</p></div></td></tr>`;
    renderPagination(totalPages);
    return;
  }

  tbody.innerHTML = pageData.map(d => {
    const areaColor = AREA_COLORS[d.displaygroupid] || 'var(--accent)';
    const areaName  = AREA_NAMES[d.displaygroupid]  || d.displaygroupid || '--';
    const typeLow   = (d.deviceType || '').toLowerCase();
    return `<tr data-id="${d._id}">
      <td style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--accent);white-space:nowrap;">${d.deviceid || '--'}</td>
      <td style="font-weight:500;">${d.deviceName || '--'}</td>
      <td>${typeLow ? `<span class="type-tag">${d.deviceType}</span>` : '<span style="color:var(--text-dim)">--</span>'}</td>
      <td style="font-size:12px;color:var(--text-muted);">${d.location || '--'}</td>
      <td>${d.displaygroupid ? `<span class="area-tag" style="background:${areaColor}18;color:${areaColor};">${areaName}</span>` : '<span style="color:var(--text-dim)">--</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);text-align:center;">${d.samplingCycle ?? 60}</td>
      <td><span class="status-badge ${d.status || 'inactive'}">${statusLabel(d.status)}</span></td>
      <td style="text-align:center;"><span class="online-dot ${d.isOnline ? 'on' : 'off'}" title="${d.isOnline ? 'Online' : 'Offline'}"></span></td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="action-btn edit"      data-action="edit"      data-id="${d._id}" title="Sửa"><i class="bi bi-pencil"></i></button>
          <button class="action-btn threshold" data-action="threshold" data-id="${d._id}" title="Ngưỡng"><i class="bi bi-sliders"></i></button>
          <button class="action-btn del"       data-action="delete"    data-id="${d._id}" title="Xóa"><i class="bi bi-trash3"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.device-table thead th[data-col]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === state.sortCol) th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });

  renderPagination(totalPages);
}

function statusLabel(s) {
  return s === 'active' ? 'Đang hoạt động' : s === 'inactive' ? 'Không hoạt động' : s === 'paused' ? 'Dừng hoạt động' : s || '--';
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

// ── ADD / EDIT MODAL ──────────────────────────────────────────
let editingId = null;

function openFormModal(device = null) {
  editingId = device ? device._id : null;
  document.getElementById('formModalTitle').textContent = device ? 'Sửa thiết bị' : 'Thêm thiết bị';

  const fields = ['Deviceid', 'DeviceName', 'Displaygroupid', 'Location', 'Status', 'SamplingCycle', 'CoordX', 'CoordY', 'AlertDelayCycles'];
  fields.forEach(f => {
    const el = document.getElementById(`f${f}`);
    if (el) el.value = '';
    const err = document.getElementById(`err${f}`);
    if (err) err.textContent = '';
    if (el) el.classList.remove('error');
  });

  if (device) {
    document.getElementById('fDeviceid').value       = device.deviceid       || '';
    document.getElementById('fDeviceName').value     = device.deviceName     || '';
    document.getElementById('fDisplaygroupid').value = device.displaygroupid || '';
    document.getElementById('fLocation').value       = device.location       || '';
    document.getElementById('fStatus').value         = device.status         || 'active';
    document.getElementById('fSamplingCycle').value  = device.samplingCycle  ?? 60;
    document.getElementById('fCoordX').value             = device.coordinates?.x      ?? 0;
    document.getElementById('fCoordY').value             = device.coordinates?.y      ?? 0;
    document.getElementById('fAlertDelayCycles').value   = device.alertDelayCycles    ?? 1;
    document.getElementById('fDeviceid').disabled        = true;
  } else {
    document.getElementById('fDeviceid').disabled        = false;
    document.getElementById('fStatus').value             = 'active';
    document.getElementById('fSamplingCycle').value      = 60;
    document.getElementById('fCoordX').value             = 0;
    document.getElementById('fCoordY').value             = 0;
    document.getElementById('fAlertDelayCycles').value   = 1;
  }

  document.getElementById('formModalBackdrop').classList.add('open');
}

function closeFormModal() {
  document.getElementById('formModalBackdrop').classList.remove('open');
  editingId = null;
}

function validateForm() {
  let ok = true;
  const deviceid   = document.getElementById('fDeviceid').value.trim();
  const deviceName = document.getElementById('fDeviceName').value.trim();

  if (!editingId && !deviceid) {
    document.getElementById('errDeviceid').textContent = 'Device ID không được để trống';
    document.getElementById('fDeviceid').classList.add('error');
    ok = false;
  }
  if (!deviceName) {
    document.getElementById('errDeviceName').textContent = 'Tên thiết bị không được để trống';
    document.getElementById('fDeviceName').classList.add('error');
    ok = false;
  }
  return ok;
}

async function saveDevice() {
  if (!validateForm()) return;

  const saveBtn = document.getElementById('formModalSave');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .8s linear infinite;"></i> Đang lưu...';

  const payload = {
    deviceName:    document.getElementById('fDeviceName').value.trim(),
    deviceType:    'Lorawan năng lượng',
    displaygroupid: document.getElementById('fDisplaygroupid').value || undefined,
    location:      document.getElementById('fLocation').value.trim() || undefined,
    status:        document.getElementById('fStatus').value,
    samplingCycle:      parseInt(document.getElementById('fSamplingCycle').value)    || 60,
    alertDelayCycles:   parseInt(document.getElementById('fAlertDelayCycles').value) || 1,
    coordinates: {
      x: parseFloat(document.getElementById('fCoordX').value) || 0,
      y: parseFloat(document.getElementById('fCoordY').value) || 0,
    },
  };

  if (!editingId) {
    payload.deviceid = document.getElementById('fDeviceid').value.trim();
  }

  try {
    let res;
    if (editingId) {
      res = await fetch(`${API_BASE}/devices/${editingId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`${API_BASE}/devices`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
      });
    }

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Lỗi server');

    closeFormModal();
    showToast(editingId ? 'Cập nhật thiết bị thành công' : 'Thêm thiết bị thành công', 'ok');
    refreshData();
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Lưu';
  }
}

// ── DELETE MODAL ──────────────────────────────────────────────
let deleteTargetId   = null;
let deleteTargetName = '';

function openDeleteModal(id, name) {
  deleteTargetId   = id;
  deleteTargetName = name;
  document.getElementById('deleteTargetName').textContent = `"${name}"`;
  document.getElementById('deleteModalBackdrop').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('deleteModalBackdrop').classList.remove('open');
  deleteTargetId = null;
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  const btn = document.getElementById('deleteModalConfirm');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Đang xóa...';

  try {
    const res = await fetch(`${API_BASE}/devices/${deleteTargetId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Lỗi server');

    closeDeleteModal();
    showToast(`Đã xóa thiết bị "${deleteTargetName}"`, 'ok');
    refreshData();
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-trash3"></i> Xóa';
  }
}

// ── Refresh data ──────────────────────────────────────────────
function refreshData() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'client_init' }));
  } else {
    connectWS();
  }
}

// ── Export CSV ────────────────────────────────────────────────
function exportCSV() {
  const data   = state.filtered.length ? state.filtered : allDevices;
  const header = ['Device ID', 'Tên thiết bị', 'Loại', 'Vị trí', 'Khu vực', 'Chu kỳ (s)', 'Trạng thái', 'Online'];
  const rows   = data.map(d => [
    d.deviceid, d.deviceName, d.deviceType || '', d.location || '',
    AREA_NAMES[d.displaygroupid] || d.displaygroupid || '',
    d.samplingCycle ?? 60, d.status, d.isOnline ? 'Yes' : 'No',
  ]);
  const csv = [['Danh sách Thiết bị — ViPower'], [`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`], [], header, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ThietBi_ViPower_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Đã xuất ${fmt(data.length)} thiết bị`, 'ok');
}

// ── Event listeners ───────────────────────────────────────────
document.getElementById('btnAddDevice').addEventListener('click', () => openFormModal());
document.getElementById('formModalClose').addEventListener('click', closeFormModal);
document.getElementById('formModalCancel').addEventListener('click', closeFormModal);
document.getElementById('formModalBackdrop').addEventListener('click', e => { if (e.target === document.getElementById('formModalBackdrop')) closeFormModal(); });
document.getElementById('formModalSave').addEventListener('click', saveDevice);

document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalCancel').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalBackdrop').addEventListener('click', e => { if (e.target === document.getElementById('deleteModalBackdrop')) closeDeleteModal(); });
document.getElementById('deleteModalConfirm').addEventListener('click', confirmDelete);

document.getElementById('deviceTableBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id  = btn.dataset.id;
  const dev = allDevices.find(d => String(d._id) === String(id));
  if (!dev) return;
  if (btn.dataset.action === 'edit')      { openFormModal(dev); return; }
  if (btn.dataset.action === 'threshold') { openThresholdModal(dev); return; }
  if (btn.dataset.action === 'delete')    { openDeleteModal(id, dev.deviceName || dev.deviceid); return; }
});

document.querySelectorAll('.device-table thead th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    if (state.sortCol === th.dataset.col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = th.dataset.col; state.sortDir = 'asc'; }
    state.page = 1; applyFilters();
  });
});

document.getElementById('searchInput').addEventListener('input',  e => { state.search = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('filterGroup').addEventListener('change',  e => { state.groupFilter = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('filterType').addEventListener('change',   e => { state.typeFilter = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('filterStatus').addEventListener('change', e => { state.statusFilter = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('pageSize').addEventListener('change',     e => { state.pageSize = parseInt(e.target.value); state.page = 1; renderTable(); });

document.getElementById('btnResetFilter').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  ['filterGroup', 'filterType', 'filterStatus'].forEach(id => document.getElementById(id).value = 'all');
  document.querySelectorAll('.kpi-cell').forEach(c => c.classList.remove('selected'));
  Object.assign(state, { search: '', groupFilter: 'all', typeFilter: 'all', statusFilter: 'all', kpiFilter: 'all', page: 1 });
  applyFilters(); showToast('Đã xóa toàn bộ bộ lọc', 'info');
});

document.querySelectorAll('.kpi-cell[data-filter]').forEach(cell => {
  cell.addEventListener('click', () => {
    document.querySelectorAll('.kpi-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    state.kpiFilter = cell.dataset.filter; state.page = 1; applyFilters();
  });
});

function exportExcel() {
  const data   = state.filtered.length ? state.filtered : allDevices;
  if (!data.length) { showToast('Không có dữ liệu để xuất', 'warn'); return; }
  const header = ['Device ID', 'Tên thiết bị', 'Loại', 'Vị trí', 'Khu vực', 'Chu kỳ (s)', 'Trạng thái', 'Online', 'Tọa độ X', 'Tọa độ Y'];
  const rows   = data.map(d => [
    d.deviceid, d.deviceName, d.deviceType || '', d.location || '',
    AREA_NAMES[d.displaygroupid] || d.displaygroupid || '',
    d.samplingCycle ?? 60, d.status, d.isOnline ? 'Yes' : 'No',
    d.coordinates?.x ?? 0, d.coordinates?.y ?? 0,
  ]);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Thiết bị');
  XLSX.writeFile(wb, `ThietBi_ViPower_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast(`Đã xuất ${fmt(data.length)} thiết bị Excel`, 'ok');
}

document.getElementById('btnExport').addEventListener('click', exportCSV);
document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
document.getElementById('btnRefresh').addEventListener('click', () => {
  refreshData();
  showToast('Đang làm mới dữ liệu...', 'info');
});

// ── THRESHOLD MODAL ───────────────────────────────────────────
let thresholdDevice  = null;
let allLatestData    = [];

function openThresholdModal(dev) {
  thresholdDevice = dev;
  document.getElementById('thresholdModalDevName').textContent = dev.deviceName || dev.deviceid;
  document.getElementById('thresholdChannel').value = 'currentI1';
  document.getElementById('thresholdBasemin').value  = '';
  document.getElementById('thresholdBasemax').value  = '';
  document.getElementById('thresholdCurrentVal').textContent = '';
  document.getElementById('thresholdModalBackdrop').classList.add('open');
  loadLatestData(dev.deviceid);
}

function closeThresholdModal() {
  document.getElementById('thresholdModalBackdrop').classList.remove('open');
  thresholdDevice = null;
  allLatestData   = [];
}

async function loadLatestData(deviceid) {
  try {
    const res  = await fetch(`${API_BASE}/latest-data/${deviceid}`, { headers: authHeaders() });
    const json = await res.json();
    allLatestData = json.success ? (json.data || []) : [];
  } catch {
    allLatestData = [];
  }
  fillChannelValues();
}

function fillChannelValues() {
  const channel = document.getElementById('thresholdChannel').value;
  const entry   = allLatestData.find(d => d.channel === channel);
  document.getElementById('thresholdBasemin').value = entry && entry.basemin != null ? entry.basemin : '';
  document.getElementById('thresholdBasemax').value = entry && entry.basemax != null ? entry.basemax : '';
  if (entry && entry.value != null) {
    const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString('vi-VN') : '--';
    document.getElementById('thresholdCurrentVal').textContent = `Giá trị hiện tại: ${entry.value} · Cập nhật: ${ts}`;
  } else {
    document.getElementById('thresholdCurrentVal').textContent = 'Chưa có dữ liệu cho kênh này.';
  }
}

async function saveThreshold() {
  if (!thresholdDevice) return;
  const channel = document.getElementById('thresholdChannel').value;
  const rawMin  = document.getElementById('thresholdBasemin').value.trim();
  const rawMax  = document.getElementById('thresholdBasemax').value.trim();
  const basemin = rawMin === '' ? null : parseFloat(rawMin);
  const basemax = rawMax === '' ? null : parseFloat(rawMax);

  const saveBtn   = document.getElementById('thresholdSaveBtn');
  const btnText   = saveBtn.querySelector('.btn-text');
  const btnLoad   = saveBtn.querySelector('.btn-loading');
  saveBtn.disabled = true;
  btnText.style.display = 'none';
  btnLoad.style.display = 'inline';

  try {
    const res  = await fetch(`${API_BASE}/latest-data/${thresholdDevice.deviceid}/${channel}/threshold`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ basemin, basemax }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Lỗi cập nhật');
    showToast('Đã cập nhật ngưỡng thành công', 'ok');
    closeThresholdModal();
  } catch (err) {
    showToast(err.message || 'Cập nhật thất bại', 'error');
  } finally {
    saveBtn.disabled = false;
    btnText.style.display = '';
    btnLoad.style.display = 'none';
  }
}

document.getElementById('thresholdModalClose').addEventListener('click',  closeThresholdModal);
document.getElementById('thresholdModalCancel').addEventListener('click', closeThresholdModal);
document.getElementById('thresholdSaveBtn').addEventListener('click',     saveThreshold);
document.getElementById('thresholdChannel').addEventListener('change',    fillChannelValues);

// ── CSS spin animation (for save button) ──────────────────────
const style = document.createElement('style');
style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(style);

// ── GROUP CRUD MODAL ──────────────────────────────────────────
let editingGroupId = null;

function openGroupModal() {
  editingGroupId = null;
  document.getElementById('gName').value = '';
  document.getElementById('gNote').value = '';
  document.getElementById('gFormTitle').textContent = 'Thêm khu vực mới';
  document.getElementById('gSaveBtnText').textContent = 'Thêm';
  document.getElementById('gCancelEditBtn').style.display = 'none';
  document.getElementById('groupModalBackdrop').classList.add('open');
  renderGroupList();
}

function closeGroupModal() {
  document.getElementById('groupModalBackdrop').classList.remove('open');
  cancelGroupEdit();
}

function cancelGroupEdit() {
  editingGroupId = null;
  document.getElementById('gName').value = '';
  document.getElementById('gNote').value = '';
  document.getElementById('gFormTitle').textContent = 'Thêm khu vực mới';
  document.getElementById('gSaveBtnText').textContent = 'Thêm';
  document.getElementById('gCancelEditBtn').style.display = 'none';
}

function renderGroupList() {
  const list = document.getElementById('groupList');
  if (!displayGroups.length) {
    list.innerHTML = '<div style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px;">Chưa có khu vực nào</div>';
    return;
  }
  list.innerHTML = displayGroups.map((g, idx) => {
    const color = AREA_COLORS[g.displaygroupid] || 'var(--accent)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;">
      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:500;font-size:13px;">${g.name}</div>
        ${g.note ? `<div style="font-size:11px;color:var(--text-muted);">${g.note}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button class="action-btn edit" data-gidx="${idx}" data-gaction="edit" title="Sửa"><i class="bi bi-pencil"></i></button>
        <button class="action-btn del"  data-gidx="${idx}" data-gaction="del"  title="Xóa"><i class="bi bi-trash3"></i></button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('groupList').addEventListener('click', e => {
  const btn = e.target.closest('[data-gaction]');
  if (!btn) return;
  const g = displayGroups[parseInt(btn.dataset.gidx)];
  if (!g) return;
  if (btn.dataset.gaction === 'edit') startEditGroup(g);
  if (btn.dataset.gaction === 'del')  deleteGroup(g._id, g.name);
});

function startEditGroup(g) {
  editingGroupId = g._id;
  document.getElementById('gName').value = g.name || '';
  document.getElementById('gNote').value = g.note || '';
  document.getElementById('gFormTitle').textContent = 'Sửa khu vực';
  document.getElementById('gSaveBtnText').textContent = 'Cập nhật';
  document.getElementById('gCancelEditBtn').style.display = '';
  document.getElementById('gName').focus();
}

async function deleteGroup(id, name) {
  const ok = await showConfirm({
    title: 'Xóa khu vực',
    msg: `Xóa khu vực <strong>"${name}"</strong>?<br>Các thiết bị thuộc khu vực này sẽ không còn được phân nhóm.`,
    icon: 'bi-trash3',
    danger: true,
  });
  if (!ok) return;
  try {
    const res = await fetch(`${API_BASE}/display-groups/${id}`, { method: 'DELETE', headers: authHeaders() });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Lỗi xóa');
    showToast(`Đã xóa khu vực "${name}"`, 'ok');
    await reloadGroups();
    renderGroupList();
    populateGroupFilter();
    populateGroupDropdown();
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'error');
  }
}

async function saveGroup() {
  const name = document.getElementById('gName').value.trim();
  const note = document.getElementById('gNote').value.trim();
  if (!name) { showToast('Tên khu vực không được để trống', 'warn'); return; }

  const btn = document.getElementById('gSaveBtn');
  btn.disabled = true;
  try {
    let res;
    if (editingGroupId) {
      res = await fetch(`${API_BASE}/display-groups/${editingGroupId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ name, note }),
      });
    } else {
      const displaygrouid = 'GRP_' + Date.now();
      res = await fetch(`${API_BASE}/display-groups`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ displaygrouid, name, note }),
      });
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Lỗi lưu');
    showToast(editingGroupId ? 'Đã cập nhật khu vực' : 'Đã thêm khu vực mới', 'ok');
    cancelGroupEdit();
    await reloadGroups();
    renderGroupList();
    populateGroupFilter();
    populateGroupDropdown();
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function reloadGroups() {
  try {
    const res  = await fetch(`${API_BASE}/display-groups?limit=1000`, { headers: authHeaders() });
    const json = await res.json();
    const raw  = json.data || json || [];
    displayGroups = raw.map(g => ({ ...g, displaygroupid: g.displaygrouid || g.displaygroupid }));
    AREA_COLORS = {}; AREA_NAMES = {};
    displayGroups.forEach((g, i) => {
      AREA_COLORS[g.displaygroupid] = AREA_PALETTE[i % AREA_PALETTE.length];
      AREA_NAMES[g.displaygroupid]  = g.name;
    });
  } catch (_) {}
}

document.getElementById('btnManageGroups').addEventListener('click', openGroupModal);
document.getElementById('groupModalClose').addEventListener('click', closeGroupModal);
document.getElementById('groupModalBackdrop').addEventListener('click', e => { if (e.target === document.getElementById('groupModalBackdrop')) closeGroupModal(); });
document.getElementById('gSaveBtn').addEventListener('click', saveGroup);
document.getElementById('gCancelEditBtn').addEventListener('click', cancelGroupEdit);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeFormModal(); closeDeleteModal(); closeThresholdModal(); closeGroupModal(); }
});

// ── Init ──────────────────────────────────────────────────────
connectWS();

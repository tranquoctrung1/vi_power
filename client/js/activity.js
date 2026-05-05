'use strict';

function authHeaders() {
  return { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

const fmtDT  = dt => dt ? new Date(dt).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' }) : '--';
const fmtD   = dt => dt ? new Date(dt).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '--';
const fmt    = n  => Number(n).toLocaleString('vi-VN');

function showToast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  t.className = 'toast';
  const cols = { info:'var(--accent)', ok:'var(--green)', warn:'var(--yellow)', error:'var(--red)' };
  const ics  = { info:'bi-info-circle-fill', ok:'bi-check-circle-fill', warn:'bi-exclamation-triangle-fill', error:'bi-x-circle-fill' };
  t.innerHTML = `<i class="bi ${ics[type]||ics.info}" style="color:${cols[type]||cols.info};font-size:16px;"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 350); }, 3500);
}

// ── Action label ──────────────────────────────────────────────
function actionLabel(method, endpoint) {
  const e = endpoint.split('?')[0].replace(/\/[a-f0-9]{24}/gi, '/:id');
  const map = [
    ['POST',   '/api/auth/login',                   'Đăng nhập'],
    ['POST',   '/api/auth/logout',                  'Đăng xuất'],
    ['POST',   '/api/auth/refresh',                 'Làm mới token'],
    ['POST',   '/api/auth/change-password',         'Đổi mật khẩu'],
    ['POST',   '/api/auth/register',                'Tạo người dùng'],
    ['PUT',    '/api/auth/users/:id',               'Sửa người dùng'],
    ['DELETE', '/api/auth/users/:id',               'Xóa người dùng'],
    ['POST',   '/api/devices',                      'Thêm thiết bị'],
    ['PUT',    '/api/devices/:id',                  'Sửa thiết bị'],
    ['PATCH',  '/api/devices/:id/status',           'Cập nhật trạng thái thiết bị'],
    ['DELETE', '/api/devices/:id',                  'Xóa thiết bị'],
    ['POST',   '/api/alerts',                       'Tạo cảnh báo'],
    ['PUT',    '/api/alerts/:id',                   'Sửa cảnh báo'],
    ['PATCH',  '/api/alerts/:id/resolve',           'Giải quyết cảnh báo'],
    ['DELETE', '/api/alerts/:id',                   'Xóa cảnh báo'],
    ['POST',   '/api/user-groups',                  'Phân quyền khu vực'],
    ['POST',   '/api/user-groups/bulk',             'Phân quyền nhiều khu vực'],
    ['DELETE', '/api/user-groups/:id',              'Thu hồi quyền khu vực'],
    ['DELETE', '/api/user-groups/user/:id/group',   'Thu hồi quyền khu vực'],
    ['POST',   '/api/display-groups',               'Tạo khu vực'],
    ['PUT',    '/api/display-groups/:id',           'Sửa khu vực'],
    ['DELETE', '/api/display-groups/:id',           'Xóa khu vực'],
    ['POST',   '/api/api-keys',                     'Tạo API Key'],
    ['PATCH',  '/api/api-keys/:id/revoke',          'Thu hồi API Key'],
    ['PATCH',  '/api/api-keys/:id/activate',        'Kích hoạt API Key'],
    ['DELETE', '/api/api-keys/:id',                 'Xóa API Key'],
    ['POST',   '/api/data/energy/:id',              'Ghi dữ liệu năng lượng'],
    ['DELETE', '/api/data/energy/:id/cleanup',      'Xóa dữ liệu cũ'],
    ['GET',    '/api/auth/me',                      'Xem thông tin cá nhân'],
    ['GET',    '/api/auth/users',                   'Xem danh sách người dùng'],
    ['GET',    '/api/devices',                      'Xem danh sách thiết bị'],
    ['GET',    '/api/alerts',                       'Xem danh sách cảnh báo'],
    ['GET',    '/api/logs',                         'Xem nhật ký'],
    ['GET',    '/api/logs/summary',                 'Xem tóm tắt hoạt động'],
  ];
  for (const [m, pat, label] of map) {
    if (m === method && e.startsWith(pat.replace('/:id', '').replace('/user/:id/group', '/user'))) {
      return label;
    }
  }
  if (method === 'GET') return 'Xem dữ liệu';
  return `${method} ${e}`;
}

// ── Tab switch ────────────────────────────────────────────────
let activeTab = 'summary';
window.switchTab = function(tab) {
  activeTab = tab;
  document.getElementById('paneSummary').style.display  = tab === 'summary' ? '' : 'none';
  document.getElementById('paneDetail').style.display   = tab === 'detail'  ? '' : 'none';
  document.getElementById('tabSummary').classList.toggle('active', tab === 'summary');
  document.getElementById('tabDetail').classList.toggle('active',  tab === 'detail');
  if (tab === 'detail' && logData.length === 0) loadLogs(1);
};

// ── SUMMARY ───────────────────────────────────────────────────
let summaryData = [];
let summarySearch = '';

async function loadSummary() {
  try {
    const res  = await fetch(`${API_BASE}/logs/summary`, { headers: authHeaders() });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    summaryData = json.data || [];
    updateKPIs();
    renderSummary();
  } catch (e) {
    showToast(`Lỗi tải tóm tắt: ${e.message}`, 'error');
  }
}

function updateKPIs() {
  const totalToday  = summaryData.reduce((s, u) => s + (u.todayRequests || 0), 0);
  const totalWrites = summaryData.reduce((s, u) => s + (u.writeCount    || 0), 0);
  const totalErrors = summaryData.reduce((s, u) => s + (u.errorCount    || 0), 0);
  const totalLogins = summaryData.reduce((s, u) => s + (u.loginCount    || 0), 0);
  document.getElementById('kpiUsers').textContent  = fmt(summaryData.length);
  document.getElementById('kpiToday').textContent  = fmt(totalToday);
  document.getElementById('kpiWrites').textContent = fmt(totalWrites);
  document.getElementById('kpiErrors').textContent = fmt(totalErrors);
  document.getElementById('kpiLogins').textContent = fmt(totalLogins);
}

function renderSummary() {
  const q    = summarySearch.toLowerCase();
  const data = q ? summaryData.filter(u => u.username.toLowerCase().includes(q)) : summaryData;
  const tbody = document.getElementById('summaryBody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="bi bi-activity"></i><p>Chưa có dữ liệu hoạt động</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(u => `
    <tr style="cursor:pointer;" onclick="drillUser('${u.username}')">
      <td><span style="font-family:var(--font-mono);font-size:12.5px;font-weight:600;">${u.username}</span></td>
      <td style="font-family:var(--font-mono);font-size:12px;text-align:center;">
        ${u.loginCount > 0
          ? `<span style="background:rgba(168,85,247,.12);color:#a855f7;padding:2px 8px;border-radius:10px;">${fmt(u.loginCount)}</span>`
          : '<span style="color:var(--text-dim)">0</span>'}
      </td>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);">${fmtD(u.lastLogin)}</td>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);">${fmtD(u.lastActivity)}</td>
      <td style="text-align:center;">${u.todayRequests > 0 ? `<span class="sum-today">${fmt(u.todayRequests)}</span>` : '<span style="color:var(--text-dim)">0</span>'}</td>
      <td style="text-align:center;"><span class="sum-total">${fmt(u.totalRequests)}</span></td>
      <td style="text-align:center;">${u.writeCount > 0 ? `<span class="sum-write">${fmt(u.writeCount)}</span>` : '<span style="color:var(--text-dim)">0</span>'}</td>
      <td style="text-align:center;">${u.errorCount > 0 ? `<span class="sum-err">${fmt(u.errorCount)}</span>` : '<span style="color:var(--text-dim)">0</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${u.lastIp || '--'}</td>
    </tr>`).join('');
}

window.drillUser = function(username) {
  document.getElementById('logSearch').value = username;
  logFilters.username = username;
  switchTab('detail');
  loadLogs(1);
};

// ── DETAIL LOGS ───────────────────────────────────────────────
let logData    = [];
let logTotal   = 0;
let logPage    = 1;
let logPageSize = 50;

const logFilters = { username: '', method: '', status: '', from: '', to: '' };

async function loadLogs(page = 1) {
  logPage = page;
  const params = new URLSearchParams({
    page,
    limit: logPageSize,
    ...(logFilters.username && { username: logFilters.username }),
    ...(logFilters.method   && { method:   logFilters.method }),
    ...(logFilters.from     && { startDate:  logFilters.from }),
    ...(logFilters.to       && { endDate:    logFilters.to + 'T23:59:59' }),
    ...(logFilters.status   && { statusType: logFilters.status }),
  });

  try {
    const res  = await fetch(`${API_BASE}/logs?${params}`, { headers: authHeaders() });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    logData  = json.data || [];
    logTotal = json.pagination?.total || 0;
    renderLogs();
  } catch (e) {
    showToast(`Lỗi tải log: ${e.message}`, 'error');
  }
}

function renderLogs() {
  const totalPages = Math.max(1, Math.ceil(logTotal / logPageSize));
  document.getElementById('logCount').textContent    = `${fmt(logTotal)} bản ghi`;
  document.getElementById('logPageInfo').textContent = `Trang ${logPage}/${totalPages} · ${fmt(logTotal)} bản ghi`;

  const tbody = document.getElementById('logBody');
  if (logData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="bi bi-list-ul"></i><p>Không có bản ghi nào</p></div></td></tr>`;
    renderLogPagination(totalPages);
    return;
  }

  tbody.innerHTML = logData.map(log => {
    const sc   = log.statusCode || 0;
    const scCls = sc >= 500 ? 'status-err' : sc >= 400 ? 'status-warn' : 'status-ok';
    const mCls  = `method-${log.method}`;
    const label = actionLabel(log.method, log.endpoint || '');
    const ep    = (log.endpoint || '').split('?')[0];
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);white-space:nowrap;">${fmtDT(log.timestamp)}</td>
      <td><span style="font-family:var(--font-mono);font-size:12px;font-weight:600;">${log.username || '<span style="color:var(--text-dim)">anon</span>'}</span></td>
      <td>
        <div class="action-label">${label}</div>
        <div class="action-sub">${ep}</div>
      </td>
      <td style="text-align:center;"><span class="method-badge ${mCls}">${log.method}</span></td>
      <td style="text-align:center;"><span class="status-badge ${scCls}">${sc}</span></td>
      <td style="text-align:right;font-family:var(--font-mono);font-size:11px;color:${(log.processingTime||0)>500?'var(--yellow)':'var(--text-muted)'};">${log.processingTime || 0}ms</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${log.ipAddress || '--'}</td>
    </tr>`;
  }).join('');

  renderLogPagination(totalPages);
}

function renderLogPagination(total) {
  const pg = document.getElementById('logPagination');
  let html = `<button class="page-btn" onclick="goLogPage(${logPage-1})" ${logPage<=1?'disabled':''}><i class="bi bi-chevron-left"></i></button>`;
  const range = [];
  for (let i = 1; i <= total; i++) {
    if (i===1||i===total||Math.abs(i-logPage)<=2) range.push(i);
    else if (range[range.length-1]!=='…') range.push('…');
  }
  range.forEach(p => {
    if (p==='…') html += `<span style="color:var(--text-dim);padding:0 4px;">…</span>`;
    else html += `<button class="page-btn ${p===logPage?'active':''}" onclick="goLogPage(${p})">${p}</button>`;
  });
  html += `<button class="page-btn" onclick="goLogPage(${logPage+1})" ${logPage>=total?'disabled':''}><i class="bi bi-chevron-right"></i></button>`;
  pg.innerHTML = html;
}
window.goLogPage = p => loadLogs(p);

// ── Log detail status filter (client-side overlay for status) ─
// Note: backend doesn't support statusCode=error query directly — filter client-side
function applyStatusFilter(data) {
  if (!logFilters.status) return data;
  if (logFilters.status === 'ok')  return data.filter(l => (l.statusCode||0) < 400);
  if (logFilters.status === 'err') return data.filter(l => (l.statusCode||0) >= 400);
  return data;
}

// ── Event listeners ───────────────────────────────────────────
document.getElementById('summarySearch').addEventListener('input', e => {
  summarySearch = e.target.value;
  renderSummary();
});

document.getElementById('btnApplyFilter').addEventListener('click', () => {
  logFilters.username = document.getElementById('logSearch').value.trim();
  logFilters.method   = document.getElementById('filterMethod').value;
  logFilters.status   = document.getElementById('filterStatus').value;
  logFilters.from     = document.getElementById('filterFrom').value;
  logFilters.to       = document.getElementById('filterTo').value;
  loadLogs(1);
});

document.getElementById('logSearch').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnApplyFilter').click();
});

document.getElementById('btnResetFilter').addEventListener('click', () => {
  document.getElementById('logSearch').value    = '';
  document.getElementById('filterMethod').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterFrom').value   = '';
  document.getElementById('filterTo').value     = '';
  Object.assign(logFilters, { username:'', method:'', status:'', from:'', to:'' });
  loadLogs(1);
});

document.getElementById('logPageSize').addEventListener('change', e => {
  logPageSize = parseInt(e.target.value);
  loadLogs(1);
});

document.getElementById('btnRefresh').addEventListener('click', async () => {
  showToast('Đang làm mới...', 'info');
  await loadSummary();
  if (activeTab === 'detail') await loadLogs(logPage);
});

// ── Cleanup modal ─────────────────────────────────────────────
document.getElementById('btnCleanup').addEventListener('click', () => {
  document.getElementById('cleanupModalBackdrop').classList.add('open');
});
document.getElementById('cleanupModalClose').addEventListener('click', () => {
  document.getElementById('cleanupModalBackdrop').classList.remove('open');
});
document.getElementById('cleanupModalCancel').addEventListener('click', () => {
  document.getElementById('cleanupModalBackdrop').classList.remove('open');
});
document.getElementById('cleanupModalBackdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('cleanupModalBackdrop'))
    document.getElementById('cleanupModalBackdrop').classList.remove('open');
});
document.getElementById('cleanupModalConfirm').addEventListener('click', async () => {
  const btn = document.getElementById('cleanupModalConfirm');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Đang xóa...';
  try {
    const res  = await fetch(`${API_BASE}/logs/cleanup?olderThanDays=30`, { method: 'DELETE', headers: authHeaders() });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    document.getElementById('cleanupModalBackdrop').classList.remove('open');
    showToast(`Đã xóa ${fmt(json.deletedCount)} bản ghi cũ`, 'ok');
    await loadSummary();
    if (activeTab === 'detail') await loadLogs(1);
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-trash3"></i> Xóa log cũ';
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('cleanupModalBackdrop').classList.remove('open');
});

// ── Init ──────────────────────────────────────────────────────
loadSummary();

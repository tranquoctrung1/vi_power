'use strict';

const API_BASE = 'http://localhost:3000/api';

let token    = localStorage.getItem('token');
let currentUser = null;

function authHeaders() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Role config ───────────────────────────────────────────────
const ROLE_CONFIG = {
  Admin:      { icon: 'bi-shield-fill',       color: '#c084fc' },
  Engineer:   { icon: 'bi-wrench-adjustable', color: 'var(--accent)' },
  Supervisor: { icon: 'bi-binoculars-fill',   color: 'var(--yellow)' },
  Operator:   { icon: 'bi-toggles',           color: 'var(--green)' },
  Viewer:     { icon: 'bi-eye-fill',          color: 'var(--text-muted)' },
};

const AVATAR_COLORS = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b', '#ff7043'];

function avatarColor(username) {
  let n = 0;
  for (let i = 0; i < username.length; i++) n += username.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function initials(name, username) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase();
  }
  return (username || '?')[0].toUpperCase();
}

// ── Runtime state ─────────────────────────────────────────────
let allUsers = [];

let state = {
  search: '', roleFilter: 'all', statusFilter: 'all', kpiFilter: 'all',
  sortCol: 'createdAt', sortDir: 'desc',
  page: 1, pageSize: 20,
  filtered: [],
};

// ── Utils ─────────────────────────────────────────────────────
const fmt     = n  => Number(n).toLocaleString('vi-VN');
const fmtDate = dt => dt ? new Date(dt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '--';
const fmtDateTime = dt => dt ? new Date(dt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';

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

// ── Fetch all users ───────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/auth/users?limit=500`, { headers: authHeaders() });
    if (res.status === 403) {
      document.getElementById('adminNotice').style.display = 'flex';
      document.getElementById('btnAddUser').disabled = true;
      document.getElementById('btnExport').disabled  = true;
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    allUsers = json.data || [];
    updateKPIs();
    applyFilters();
  } catch (e) {
    showToast(`Lỗi tải danh sách người dùng: ${e.message}`, 'error');
  }
}

// ── KPI ───────────────────────────────────────────────────────
function updateKPIs() {
  document.getElementById('kpiTotalVal').textContent      = allUsers.length;
  document.getElementById('kpiAdminVal').textContent      = allUsers.filter(u => u.role === 'Admin').length;
  document.getElementById('kpiEngineerVal').textContent   = allUsers.filter(u => u.role === 'Engineer').length;
  document.getElementById('kpiSupervisorVal').textContent = allUsers.filter(u => u.role === 'Supervisor').length;
  document.getElementById('kpiOperatorVal').textContent   = allUsers.filter(u => u.role === 'Operator').length;
  document.getElementById('kpiViewerVal').textContent     = allUsers.filter(u => u.role === 'Viewer').length;
  document.getElementById('kpiOnlineVal').textContent     = allUsers.filter(u => u.isActive).length;
}

// ── Filter + render ───────────────────────────────────────────
function applyFilters() {
  let data = [...allUsers];

  if (state.kpiFilter === 'online') data = data.filter(u => u.isActive);
  else if (state.kpiFilter !== 'all') data = data.filter(u => u.role === state.kpiFilter);
  if (state.roleFilter !== 'all') data = data.filter(u => u.role === state.roleFilter);
  if (state.statusFilter === 'online')  data = data.filter(u =>  u.isActive);
  if (state.statusFilter === 'offline') data = data.filter(u => !u.isActive);
  if (state.search) {
    const q = state.search.toLowerCase();
    data = data.filter(u =>
      (u.username || '').toLowerCase().includes(q) ||
      (u.fullName || '').toLowerCase().includes(q)
    );
  }

  data.sort((a, b) => {
    let va, vb;
    if (state.sortCol === 'createdAt' || state.sortCol === 'updatedAt') {
      va = new Date(a[state.sortCol] || 0).getTime();
      vb = new Date(b[state.sortCol] || 0).getTime();
    } else if (state.sortCol === 'isActive') {
      va = a.isActive ? 1 : 0;
      vb = b.isActive ? 1 : 0;
    } else if (state.sortCol === 'loginCount') {
      va = a.loginCount || 0;
      vb = b.loginCount || 0;
    } else {
      va = a[state.sortCol] || '';
      vb = b[state.sortCol] || '';
    }
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

  document.getElementById('tableInfo').textContent = `${fmt(data.length)} người dùng`;
  document.getElementById('pageInfo').textContent  = `Trang ${state.page}/${totalPages} · ${fmt(data.length)} người dùng`;

  const tbody = document.getElementById('userTableBody');
  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="bi bi-people"></i><p>Không có người dùng nào</p></div></td></tr>`;
    renderPagination(totalPages);
    return;
  }

  const isSelf = u => currentUser && String(u._id) === String(currentUser._id);

  tbody.innerHTML = pageData.map(u => {
    const rc   = ROLE_CONFIG[u.role] || ROLE_CONFIG.Viewer;
    const ac   = avatarColor(u.username || '');
    const ini  = initials(u.fullName, u.username);
    const self = isSelf(u);
    return `<tr data-id="${u._id}">
      <td style="padding:8px 12px;">
        <div class="user-avatar" style="background:${ac}22;color:${ac};border:1px solid ${ac}44;">${ini}</div>
      </td>
      <td>
        <span style="font-family:var(--font-mono);font-size:12.5px;font-weight:600;">${u.username || '--'}</span>
        ${self ? '<span style="font-size:10px;background:var(--accent-dim);color:var(--accent);padding:1px 6px;border-radius:10px;margin-left:6px;">Bạn</span>' : ''}
      </td>
      <td style="font-size:13px;">${u.fullName || '<span style="color:var(--text-dim)">--</span>'}</td>
      <td><span class="role-badge ${u.role}"><i class="bi ${rc.icon}"></i>${u.role}</span></td>
      <td>
        <span class="status-dot ${u.isActive ? 'online' : 'offline'}"></span>
        <span style="font-size:12px;color:${u.isActive ? 'var(--green)' : 'var(--text-muted)'};">${u.isActive ? 'Online' : 'Offline'}</span>
      </td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-primary);text-align:center;">
        ${u.loginCount > 0 ? `<span style="background:var(--accent-dim);color:var(--accent);padding:2px 8px;border-radius:10px;">${fmt(u.loginCount)}</span>` : '<span style="color:var(--text-dim)">0</span>'}
      </td>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);">${fmtDate(u.createdAt)}</td>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);">${fmtDate(u.updatedAt)}</td>
      <td>
        <div style="display:flex;gap:4px;">
          <button class="action-btn edit" data-action="edit" data-id="${u._id}" title="Sửa"><i class="bi bi-pencil"></i></button>
          <button class="action-btn perm" data-action="perm" data-username="${u.username}" title="Phân quyền khu vực"><i class="bi bi-diagram-3"></i></button>
          <button class="action-btn del" data-action="delete" data-id="${u._id}" ${self ? 'disabled title="Không thể xóa chính mình"' : 'title="Xóa"'}
            style="${self ? 'opacity:.35;cursor:not-allowed;' : ''}"><i class="bi bi-person-x"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.user-table thead th[data-col]').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === state.sortCol) th.classList.add(state.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });

  renderPagination(totalPages);
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

function clearFormErrors() {
  ['Username', 'FullName', 'Password', 'Role'].forEach(f => {
    const err = document.getElementById(`err${f}`);
    const inp = document.getElementById(`f${f}`);
    if (err) err.textContent = '';
    if (inp) inp.classList.remove('error');
  });
}

function openFormModal(user = null) {
  editingId = user ? user._id : null;
  clearFormErrors();

  document.getElementById('formModalTitle').textContent = user ? 'Sửa người dùng' : 'Thêm người dùng';
  document.getElementById('fUsername').value  = user?.username  || '';
  document.getElementById('fFullName').value  = user?.fullName  || '';
  document.getElementById('fPassword').value  = '';
  document.getElementById('fRole').value      = user?.role      || 'Engineer';

  document.getElementById('fUsername').disabled = !!user;

  if (user) {
    document.getElementById('pwLabel').innerHTML = 'Mật khẩu mới';
    document.getElementById('pwHint').textContent = 'Để trống nếu không muốn đổi mật khẩu';
    document.getElementById('fPassword').placeholder = 'Để trống để giữ nguyên...';
  } else {
    document.getElementById('pwLabel').innerHTML = 'Mật khẩu <span class="req">*</span>';
    document.getElementById('pwHint').textContent = '';
    document.getElementById('fPassword').placeholder = 'Nhập mật khẩu...';
  }

  document.getElementById('formModalBackdrop').classList.add('open');
  setTimeout(() => (user ? document.getElementById('fFullName') : document.getElementById('fUsername')).focus(), 80);
}

function closeFormModal() {
  document.getElementById('formModalBackdrop').classList.remove('open');
  editingId = null;
}

function validateForm() {
  clearFormErrors();
  let ok = true;

  const username = document.getElementById('fUsername').value.trim();
  const password = document.getElementById('fPassword').value;

  if (!editingId && !username) {
    document.getElementById('errUsername').textContent = 'Username không được để trống';
    document.getElementById('fUsername').classList.add('error');
    ok = false;
  }
  if (!editingId && !password) {
    document.getElementById('errPassword').textContent = 'Mật khẩu không được để trống';
    document.getElementById('fPassword').classList.add('error');
    ok = false;
  }
  if (password && password.length < 6) {
    document.getElementById('errPassword').textContent = 'Mật khẩu tối thiểu 6 ký tự';
    document.getElementById('fPassword').classList.add('error');
    ok = false;
  }
  return ok;
}

async function saveUser() {
  if (!validateForm()) return;

  const saveBtn = document.getElementById('formModalSave');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .8s linear infinite;"></i> Đang lưu...';

  const payload = {
    fullName: document.getElementById('fFullName').value.trim() || undefined,
    role:     document.getElementById('fRole').value,
  };

  const password = document.getElementById('fPassword').value;
  if (password) payload.password = password;

  if (!editingId) {
    payload.username = document.getElementById('fUsername').value.trim();
  }

  try {
    let res;
    if (editingId) {
      res = await fetch(`${API_BASE}/auth/users/${editingId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
      });
    }

    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Lỗi server');

    closeFormModal();
    showToast(editingId ? 'Cập nhật người dùng thành công' : 'Thêm người dùng thành công', 'ok');
    await loadUsers();
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
  if (currentUser && String(id) === String(currentUser._id)) {
    showToast('Không thể xóa tài khoản đang đăng nhập', 'warn');
    return;
  }
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
    const res = await fetch(`${API_BASE}/auth/users/${deleteTargetId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Lỗi server');

    closeDeleteModal();
    showToast(`Đã xóa người dùng "${deleteTargetName}"`, 'ok');
    await loadUsers();
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-person-x"></i> Xóa';
  }
}

// ── AREA PERMISSION MODAL ─────────────────────────────────────
let areaTargetUsername = null;
let areaOrigGroups = new Set();

async function openAreaModal(username) {
  areaTargetUsername = username;
  document.getElementById('areaModalUsername').textContent = username;
  document.getElementById('areaGroupList').innerHTML = '<div style="color:var(--text-muted);font-size:12px;">Đang tải...</div>';
  document.getElementById('areaModalBackdrop').classList.add('open');

  try {
    const [groupsRes, userGroupsRes] = await Promise.all([
      fetch(`${API_BASE}/display-groups`, { headers: authHeaders() }),
      fetch(`${API_BASE}/user-groups/user/${encodeURIComponent(username)}/groups`, { headers: authHeaders() }),
    ]);
    const groupsJson     = await groupsRes.json();
    const userGroupsJson = await userGroupsRes.json();

    const allGroups  = groupsJson.data || [];
    const userGIDs   = (userGroupsJson.data || []).map(g => g.displaygrouid);
    areaOrigGroups   = new Set(userGIDs);

    if (allGroups.length === 0) {
      document.getElementById('areaGroupList').innerHTML =
        '<div style="color:var(--text-muted);font-size:12px;">Chưa có khu vực nào trong hệ thống.</div>';
      return;
    }

    document.getElementById('areaGroupList').innerHTML = allGroups.map(g => `
      <label class="area-check-row">
        <input type="checkbox" class="area-checkbox" value="${g.displaygrouid}"
          ${areaOrigGroups.has(g.displaygrouid) ? 'checked' : ''}>
        <span class="area-check-label">
          <span class="area-check-name">${g.name || g.displaygrouid}</span>
          ${g.note ? `<span class="area-check-note">${g.note}</span>` : ''}
        </span>
      </label>`).join('');
  } catch (e) {
    document.getElementById('areaGroupList').innerHTML =
      `<div style="color:var(--red);font-size:12px;">Lỗi tải dữ liệu: ${e.message}</div>`;
  }
}

function closeAreaModal() {
  document.getElementById('areaModalBackdrop').classList.remove('open');
  areaTargetUsername = null;
  areaOrigGroups = new Set();
}

async function saveAreaAssignments() {
  if (!areaTargetUsername) return;

  const checkboxes = document.querySelectorAll('.area-checkbox');
  const newGroups  = new Set([...checkboxes].filter(c => c.checked).map(c => c.value));
  const toAdd      = [...newGroups].filter(g => !areaOrigGroups.has(g));
  const toRemove   = [...areaOrigGroups].filter(g => !newGroups.has(g));

  if (toAdd.length === 0 && toRemove.length === 0) { closeAreaModal(); return; }

  const saveBtn = document.getElementById('areaModalSave');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .8s linear infinite;"></i> Đang lưu...';

  try {
    const errors = [];

    for (const displaygrouid of toAdd) {
      const res = await fetch(`${API_BASE}/user-groups`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ username: areaTargetUsername, displaygrouid }),
      });
      if (!res.ok) { const j = await res.json(); errors.push(`Thêm ${displaygrouid}: ${j.message || res.status}`); }
    }

    for (const displaygrouid of toRemove) {
      const res = await fetch(
        `${API_BASE}/user-groups/user/${encodeURIComponent(areaTargetUsername)}/group/${encodeURIComponent(displaygrouid)}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (!res.ok) { const j = await res.json(); errors.push(`Xóa ${displaygrouid}: ${j.message || res.status}`); }
    }

    if (errors.length) {
      showToast(`Một số thay đổi thất bại: ${errors.join('; ')}`, 'warn');
    } else {
      showToast(`Đã cập nhật phân quyền khu vực cho "${areaTargetUsername}"`, 'ok');
    }
    closeAreaModal();
  } catch (e) {
    showToast(`Lỗi: ${e.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Lưu';
  }
}

// ── Export CSV ────────────────────────────────────────────────
function exportCSV() {
  const data   = state.filtered.length ? state.filtered : allUsers;
  const header = ['Username', 'Họ tên', 'Vai trò', 'Trạng thái', 'Lần đăng nhập', 'Ngày tạo', 'Cập nhật'];
  const rows   = data.map(u => [u.username, u.fullName || '', u.role, u.isActive ? 'Online' : 'Offline', u.loginCount || 0, fmtDateTime(u.createdAt), fmtDateTime(u.updatedAt)]);
  const csv = [['Danh sách Người dùng — ViPower'], [`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`], [], header, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `NguoiDung_ViPower_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Đã xuất ${fmt(data.length)} người dùng`, 'ok');
}

// ── Event listeners ───────────────────────────────────────────
document.getElementById('btnAddUser').addEventListener('click', () => openFormModal());
document.getElementById('formModalClose').addEventListener('click', closeFormModal);
document.getElementById('formModalCancel').addEventListener('click', closeFormModal);
document.getElementById('formModalBackdrop').addEventListener('click', e => { if (e.target === document.getElementById('formModalBackdrop')) closeFormModal(); });
document.getElementById('formModalSave').addEventListener('click', saveUser);

document.getElementById('deleteModalClose').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalCancel').addEventListener('click', closeDeleteModal);
document.getElementById('deleteModalBackdrop').addEventListener('click', e => { if (e.target === document.getElementById('deleteModalBackdrop')) closeDeleteModal(); });
document.getElementById('deleteModalConfirm').addEventListener('click', confirmDelete);

document.getElementById('areaModalClose').addEventListener('click', closeAreaModal);
document.getElementById('areaModalCancel').addEventListener('click', closeAreaModal);
document.getElementById('areaModalBackdrop').addEventListener('click', e => { if (e.target === document.getElementById('areaModalBackdrop')) closeAreaModal(); });
document.getElementById('areaModalSave').addEventListener('click', saveAreaAssignments);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeFormModal(); closeDeleteModal(); closeAreaModal(); }
  if (e.key === 'Enter' && document.getElementById('formModalBackdrop').classList.contains('open')) saveUser();
});

document.getElementById('pwToggle').addEventListener('click', () => {
  const inp = document.getElementById('fPassword');
  const ico = document.getElementById('pwToggle').querySelector('i');
  if (inp.type === 'password') {
    inp.type = 'text';
    ico.className = 'bi bi-eye-slash';
  } else {
    inp.type = 'password';
    ico.className = 'bi bi-eye';
  }
});

document.getElementById('userTableBody').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;
  if (btn.dataset.action === 'perm') { openAreaModal(btn.dataset.username); return; }
  const id   = btn.dataset.id;
  const user = allUsers.find(u => String(u._id) === String(id));
  if (!user) return;
  if (btn.dataset.action === 'edit')   { openFormModal(user); return; }
  if (btn.dataset.action === 'delete') { openDeleteModal(id, user.username); return; }
});

document.querySelectorAll('.user-table thead th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    if (state.sortCol === th.dataset.col) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else { state.sortCol = th.dataset.col; state.sortDir = 'desc'; }
    state.page = 1; applyFilters();
  });
});

document.getElementById('searchInput').addEventListener('input',  e => { state.search = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('filterRole').addEventListener('change',  e => { state.roleFilter = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('filterStatus').addEventListener('change', e => { state.statusFilter = e.target.value; state.page = 1; applyFilters(); });
document.getElementById('pageSize').addEventListener('change',    e => { state.pageSize = parseInt(e.target.value); state.page = 1; renderTable(); });

document.getElementById('btnResetFilter').addEventListener('click', () => {
  document.getElementById('searchInput').value  = '';
  document.getElementById('filterRole').value   = 'all';
  document.getElementById('filterStatus').value = 'all';
  document.querySelectorAll('.kpi-cell').forEach(c => c.classList.remove('selected'));
  Object.assign(state, { search: '', roleFilter: 'all', statusFilter: 'all', kpiFilter: 'all', page: 1 });
  applyFilters(); showToast('Đã xóa toàn bộ bộ lọc', 'info');
});

document.querySelectorAll('.kpi-cell[data-filter]').forEach(cell => {
  cell.addEventListener('click', () => {
    document.querySelectorAll('.kpi-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    state.kpiFilter    = cell.dataset.filter;
    state.statusFilter = 'all';
    document.getElementById('filterStatus').value = 'all';
    state.page = 1;
    applyFilters();
  });
});

document.getElementById('btnExport').addEventListener('click', exportCSV);
document.getElementById('btnRefresh').addEventListener('click', async () => {
  showToast('Đang làm mới...', 'info');
  await loadUsers();
});

// ── CSS spin animation ────────────────────────────────────────
const style = document.createElement('style');
style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(style);

// ── Init: get current user then load list ─────────────────────
async function init() {
  try {
    const res  = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    const json = await res.json();
    if (json.success) currentUser = json.data;
  } catch (_) {}
  await loadUsers();
}

init();

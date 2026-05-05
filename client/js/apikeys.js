'use strict';

let token = localStorage.getItem('token');
function authHeaders() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

let allKeys = [];
let pendingDeleteId = null;

// ── Utils ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  t.className = 'toast';
  const cols = { info: 'var(--accent)', ok: 'var(--green)', warn: 'var(--yellow)', error: 'var(--red)' };
  const ics  = { info: 'bi-info-circle-fill', ok: 'bi-check-circle-fill', warn: 'bi-exclamation-triangle-fill', error: 'bi-x-circle-fill' };
  t.innerHTML = `<i class="bi ${ics[type]||ics.info}" style="color:${cols[type]||cols.info};font-size:16px;"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 350); }, 3200);
}

// ── Fetch ─────────────────────────────────────────────────────
async function fetchKeys() {
  try {
    const res  = await fetch(`${API_BASE}/api-keys`, { headers: authHeaders() });
    const json = await res.json();
    if (!json.success) {
      if (res.status === 403) showToast('Chỉ Admin mới xem được API keys', 'warn');
      else showToast('Lỗi tải dữ liệu: ' + json.message, 'error');
      return;
    }
    allKeys = json.data || [];
    renderTable();
    updateKPIs();
  } catch (e) {
    showToast('Lỗi kết nối: ' + e.message, 'error');
  }
}

// ── KPI ───────────────────────────────────────────────────────
function updateKPIs() {
  const total   = allKeys.length;
  const active  = allKeys.filter(k => k.active).length;
  const revoked = total - active;
  document.getElementById('kpiTotal').textContent   = total;
  document.getElementById('kpiActive').textContent  = active;
  document.getElementById('kpiRevoked').textContent = revoked;
  document.getElementById('tableInfo').textContent  = `${total} keys`;
}

// ── Render table ──────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('keysTableBody');
  if (!allKeys.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-dim);">Chưa có API key nào</td></tr>`;
    return;
  }
  tbody.innerHTML = allKeys.map(k => {
    const perms = (k.permissions || ['read']).map(p => {
      const c = p === 'admin' ? 'var(--red)' : p === 'write' ? 'var(--yellow)' : 'var(--accent)';
      return `<span style="font-size:11px;font-weight:600;padding:2px 7px;border-radius:4px;color:${c};background:${c}22;font-family:var(--font-mono);">${p}</span>`;
    }).join(' ');
    const lastUsed = k.lastUsed
      ? new Date(k.lastUsed).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '<span style="color:var(--text-dim)">Chưa dùng</span>';
    const statusBadge = k.active
      ? `<span style="color:var(--green);background:var(--green-glow);padding:2px 8px;border-radius:4px;font-size:11.5px;font-weight:600;">Active</span>`
      : `<span style="color:var(--red);background:var(--red-glow);padding:2px 8px;border-radius:4px;font-size:11.5px;font-weight:600;">Revoked</span>`;
    const revokeBtn = k.active
      ? `<button class="btn-action warn" data-id="${k._id}" data-action="revoke" title="Thu hồi"><i class="bi bi-slash-circle"></i></button>`
      : `<button class="btn-action ok" data-id="${k._id}" data-action="activate" title="Kích hoạt lại"><i class="bi bi-check-circle"></i></button>`;
    return `<tr>
      <td style="font-weight:600;">${k.name}</td>
      <td><code style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-muted);">${k.key}</code></td>
      <td>${perms}</td>
      <td style="color:var(--text-muted);">${k.createdBy || '--'}</td>
      <td style="color:var(--text-muted);font-size:12px;">${lastUsed}</td>
      <td style="font-family:var(--font-mono);text-align:right;padding-right:16px;">${k.usageCount || 0}</td>
      <td>${statusBadge}</td>
      <td>
        <div style="display:flex;gap:4px;">
          ${revokeBtn}
          <button class="btn-action danger" data-id="${k._id}" data-name="${k.name}" data-action="delete" title="Xóa"><i class="bi bi-trash3"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { id, action, name } = btn.dataset;
      if (action === 'revoke')   revokeKey(id);
      if (action === 'activate') activateKey(id);
      if (action === 'delete')   openDeleteModal(id, name);
    });
  });
}

// ── Create ────────────────────────────────────────────────────
function openCreateModal() {
  document.getElementById('fKeyName').value  = '';
  document.getElementById('fKeyDesc').value  = '';
  document.getElementById('permRead').checked  = true;
  document.getElementById('permWrite').checked = false;
  document.getElementById('errKeyName').textContent = '';
  document.getElementById('createModalBackdrop').style.display = 'flex';
  setTimeout(() => document.getElementById('fKeyName').focus(), 100);
}
function closeCreateModal() {
  document.getElementById('createModalBackdrop').style.display = 'none';
}

async function createKey() {
  const name  = document.getElementById('fKeyName').value.trim();
  if (!name) { document.getElementById('errKeyName').textContent = 'Bắt buộc nhập tên'; return; }
  document.getElementById('errKeyName').textContent = '';

  const perms = [];
  if (document.getElementById('permRead').checked)  perms.push('read');
  if (document.getElementById('permWrite').checked) perms.push('write');
  if (!perms.length) perms.push('read');

  const btn = document.getElementById('createModalSave');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Đang tạo...';

  try {
    const res  = await fetch(`${API_BASE}/api-keys`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name, description: document.getElementById('fKeyDesc').value.trim(), permissions: perms }),
    });
    const json = await res.json();
    if (!json.success) { showToast('Lỗi: ' + json.message, 'error'); return; }

    closeCreateModal();
    showRevealModal(json.data);
    fetchKeys();
  } catch (e) {
    showToast('Lỗi kết nối: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-check-lg"></i> Tạo key';
  }
}

// ── Reveal ────────────────────────────────────────────────────
function showRevealModal(keyDoc) {
  document.getElementById('revealKeyText').textContent   = keyDoc.key;
  document.getElementById('revealKeyInCode').textContent = keyDoc.key;
  document.getElementById('revealModalBackdrop').style.display = 'flex';
}
function closeRevealModal() {
  document.getElementById('revealModalBackdrop').style.display = 'none';
}

// ── Revoke / Activate ─────────────────────────────────────────
async function revokeKey(id) {
  try {
    const res  = await fetch(`${API_BASE}/api-keys/${id}/revoke`, { method: 'PATCH', headers: authHeaders() });
    const json = await res.json();
    if (json.success) { showToast('Đã thu hồi API key', 'ok'); fetchKeys(); }
    else showToast('Lỗi: ' + json.message, 'error');
  } catch (e) { showToast('Lỗi kết nối', 'error'); }
}

async function activateKey(id) {
  try {
    const res  = await fetch(`${API_BASE}/api-keys/${id}/activate`, { method: 'PATCH', headers: authHeaders() });
    const json = await res.json();
    if (json.success) { showToast('Đã kích hoạt lại API key', 'ok'); fetchKeys(); }
    else showToast('Lỗi: ' + json.message, 'error');
  } catch (e) { showToast('Lỗi kết nối', 'error'); }
}

// ── Delete ────────────────────────────────────────────────────
function openDeleteModal(id, name) {
  pendingDeleteId = id;
  document.getElementById('deleteTargetName').textContent = name;
  document.getElementById('deleteModalBackdrop').style.display = 'flex';
}
function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById('deleteModalBackdrop').style.display = 'none';
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  try {
    const res  = await fetch(`${API_BASE}/api-keys/${pendingDeleteId}`, { method: 'DELETE', headers: authHeaders() });
    const json = await res.json();
    if (json.success) { showToast('Đã xóa API key', 'ok'); fetchKeys(); }
    else showToast('Lỗi: ' + json.message, 'error');
  } catch (e) { showToast('Lỗi kết nối', 'error'); }
  closeDeleteModal();
}

// ── Event wiring ──────────────────────────────────────────────
document.getElementById('btnCreateKey').addEventListener('click', openCreateModal);
document.getElementById('btnRefresh').addEventListener('click', fetchKeys);

document.getElementById('createModalClose').addEventListener('click',  closeCreateModal);
document.getElementById('createModalCancel').addEventListener('click', closeCreateModal);
document.getElementById('createModalSave').addEventListener('click',   createKey);
document.getElementById('createModalBackdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('createModalBackdrop')) closeCreateModal();
});

document.getElementById('revealModalClose').addEventListener('click', closeRevealModal);
document.getElementById('btnCopyKey').addEventListener('click', async () => {
  const key = document.getElementById('revealKeyText').textContent;
  try {
    await navigator.clipboard.writeText(key);
    showToast('Đã sao chép API key', 'ok');
    document.getElementById('btnCopyKey').innerHTML = '<i class="bi bi-check2"></i> Đã copy';
    setTimeout(() => { document.getElementById('btnCopyKey').innerHTML = '<i class="bi bi-clipboard"></i> Copy'; }, 2000);
  } catch { showToast('Không thể sao chép, hãy copy thủ công', 'warn'); }
});

document.getElementById('deleteModalClose').addEventListener('click',   closeDeleteModal);
document.getElementById('deleteModalCancel').addEventListener('click',  closeDeleteModal);
document.getElementById('deleteModalConfirm').addEventListener('click', confirmDelete);
document.getElementById('deleteModalBackdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('deleteModalBackdrop')) closeDeleteModal();
});

// ── Init ──────────────────────────────────────────────────────
fetchKeys();

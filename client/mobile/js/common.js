'use strict';

// ── App guard ─────────────────────────────────────────────────
// Native app opens URL with ?src=app → sets localStorage flag.
// Subsequent loads check that flag. Localhost always allowed (dev).
(function () {
  const p = new URLSearchParams(location.search);
  if (p.get('src') === 'app') {
    localStorage.setItem('vp_app', '1');
  }

  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  const isApp = localStorage.getItem('vp_app') === '1';

  if (!isApp && !isLocalhost) {
    document.documentElement.innerHTML = `
      <!doctype html><html lang="vi">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
      <link href="css/app.css" rel="stylesheet">
      <title>ViPower App</title></head>
      <body>
      <div class="denied-wrap">
        <i class="bi bi-phone-fill denied-icon"></i>
        <div class="denied-title">Chỉ dành cho ứng dụng</div>
        <div class="denied-msg">Trang này chỉ có thể truy cập từ ứng dụng ViPower trên điện thoại.</div>
      </div></body></html>`;
    throw new Error('App-only page');
  }
})();

// ── JWT helpers ───────────────────────────────────────────────
function jwtExpired(token) {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (p.exp - 30) < Date.now() / 1000;
  } catch { return true; }
}

// ── Auth guard ────────────────────────────────────────────────
let _token = localStorage.getItem('token');

async function authGuard() {
  if (_token && !jwtExpired(_token)) return _token;

  // Try refresh
  const rt = localStorage.getItem('vp_refresh');
  if (rt) {
    try {
      const res  = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const json = await res.json();
      if (json.success) {
        localStorage.setItem('token', json.token);
        _token = json.token;
        return _token;
      }
    } catch {}
  }

  // No valid token — go to login
  const dest = `login.html?redirect=${encodeURIComponent(location.href)}`;
  location.replace(dest);
  return null;
}

function authHeaders() {
  return { 'Authorization': `Bearer ${_token}`, 'Content-Type': 'application/json' };
}

// ── Fetch with auth ───────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  let res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  if (res.status === 401) {
    const newToken = await authGuard();
    if (!newToken) return res;
    _token = newToken;
    res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
  }
  return res;
}

// ── Logout ────────────────────────────────────────────────────
async function logout() {
  try {
    await apiFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch {}
  localStorage.removeItem('token');
  localStorage.removeItem('vp_refresh');
  location.replace('login.html');
}

// ── Bottom nav ────────────────────────────────────────────────
function renderBottomNav(activeTab) {
  const tabs = [
    { id: 'home',    href: 'index.html',   icon: 'bi-house-fill',        label: 'Thiết bị' },
    { id: 'qr',      href: 'qr.html',      icon: 'bi-qr-code-scan',      label: 'Quét QR' },
    { id: 'report',  href: 'report.html',  icon: 'bi-bar-chart-fill',    label: 'Báo cáo' },
    { id: 'alerts',  href: 'alerts.html',  icon: 'bi-bell-fill',         label: 'Cảnh báo' },
  ];

  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.innerHTML = tabs.map(t => `
    <a href="${t.href}" class="nav-tab${t.id === activeTab ? ' active' : ''}" data-tab="${t.id}">
      <div class="nav-tab-wrap">
        <i class="bi ${t.icon}"></i>
        ${t.id === 'alerts' ? '<span id="navAlertBadge" class="nav-badge" style="display:none"></span>' : ''}
        <span>${t.label}</span>
      </div>
    </a>`).join('') + `
    <button class="nav-tab" id="btnNavLogout">
      <div class="nav-tab-wrap">
        <i class="bi bi-box-arrow-right"></i>
        <span>Đăng xuất</span>
      </div>
    </button>`;
  document.body.appendChild(nav);
  document.getElementById('btnNavLogout').addEventListener('click', logout);

  // Load alert badge count
  apiFetch(`${API_BASE}/alerts?limit=500`)
    .then(r => r.json())
    .then(json => {
      const count = (json.data || []).filter(a => !a.resolved && !a.isComplete).length;
      const badge = document.getElementById('navAlertBadge');
      if (badge && count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = '';
      }
    }).catch(() => {});
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let tc = document.getElementById('_toastContainer');
  if (!tc) {
    tc = document.createElement('div');
    tc.id = '_toastContainer';
    tc.className = 'toast-container';
    document.body.appendChild(tc);
  }
  const colors = { info: '#38aaff', ok: '#22d369', warn: '#f5a623', error: '#f44b4b' };
  const icons  = { info: 'bi-info-circle-fill', ok: 'bi-check-circle-fill', warn: 'bi-exclamation-triangle-fill', error: 'bi-x-circle-fill' };
  const t = document.createElement('div');
  t.className = 'toast-msg';
  t.innerHTML = `<i class="bi ${icons[type] || icons.info}" style="color:${colors[type] || colors.info}"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 320); }, 3000);
}

// ── Number formatting ─────────────────────────────────────────
function fmt(n, d = 1) {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}
function fmtPower(kw) {
  if (kw == null || isNaN(kw)) return '--';
  if (Math.abs(kw) >= 1000) return fmt(kw / 1000, 2) + ' MW';
  return fmt(kw, 2) + ' kW';
}

// ── Status helpers ────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    active:   { cls: 'badge-active',   label: 'Hoạt động', dot: 'active' },
    offline:  { cls: 'badge-offline',  label: 'Offline',   dot: 'offline' },
    error:    { cls: 'badge-error',    label: 'Lỗi',       dot: 'error' },
    inactive: { cls: 'badge-inactive', label: 'Tắt',       dot: 'inactive' },
  };
  const s = map[status] || map.inactive;
  return `<span class="badge ${s.cls}"><span class="status-dot ${s.dot}"></span>${s.label}</span>`;
}

function iconCls(status) {
  const m = { active: 'active', offline: 'offline', error: 'error', inactive: 'inactive' };
  return m[status] || 'inactive';
}

// ── Relative time ─────────────────────────────────────────────
function relTime(ts) {
  if (!ts) return '--';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s/60)}p trước`;
  if (s < 86400)return `${Math.floor(s/3600)}h trước`;
  return `${Math.floor(s/86400)}d trước`;
}

// ── Loading spinner HTML ──────────────────────────────────────
const LOADING_HTML = `<div class="loading-wrap"><div class="spinner"></div></div>`;

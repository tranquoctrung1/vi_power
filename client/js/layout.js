'use strict';

// ── Auth utilities ────────────────────────────────────────────
const _API_BASE    = 'http://localhost:3000/api';
const _origFetch   = window.fetch.bind(window);
let   _refreshing  = null;

function _jwtExpired(token) {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return (p.exp - 30) < Date.now() / 1000;
  } catch { return true; }
}

async function _tryRefresh() {
  const rt = localStorage.getItem('vp_refresh');
  if (!rt) return false;
  try {
    const res  = await _origFetch(`${_API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    const json = await res.json();
    if (json.success) { localStorage.setItem('token', json.token); return true; }
  } catch {}
  localStorage.removeItem('vp_refresh');
  return false;
}

function _clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('vp_refresh');
  localStorage.removeItem('vp_user');
}

// ── Auth guard — redirect to login if no/expired token ────────
(function () {
  const token = localStorage.getItem('token');
  if (!token || _jwtExpired(token)) {
    const dest = 'login.html?redirect=' + encodeURIComponent(location.href);
    location.replace(dest);
  }
})();

// ── Fetch interceptor — handle 401 mid-session ────────────────
window.fetch = async function (input, init = {}) {
  const res = await _origFetch(input, init);
  if (res.status !== 401) return res;

  const url = (typeof input === 'string' ? input : input.url) || '';
  if (url.includes('/auth/refresh') || url.includes('/auth/login')) return res;

  if (!_refreshing) _refreshing = _tryRefresh().finally(() => { _refreshing = null; });
  const ok = await _refreshing;

  if (!ok) { _clearSession(); location.replace('login.html'); return res; }

  const newToken = localStorage.getItem('token');
  return _origFetch(input, {
    ...init,
    headers: { ...(init.headers || {}), 'Authorization': `Bearer ${newToken}` },
  });
};

// ── Sidebar user-block styles (injected once) ─────────────────
(function () {
  const s = document.createElement('style');
  s.textContent = `
    .sidebar-user{display:flex;align-items:center;gap:8px;padding:8px 6px;border-top:1px solid var(--border);margin-top:8px;width:100%;min-width:0;}
    .user-avatar{width:30px;height:30px;min-width:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;}
    .user-details{flex:1;min-width:0;overflow:hidden;white-space:nowrap;}
    .user-name-sb{font-size:12px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;}
    .user-role-sb{font-size:10px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;}
    .btn-logout{background:none;border:none;color:var(--text-muted);cursor:pointer;padding:4px 6px;border-radius:4px;font-size:15px;display:flex;align-items:center;transition:color .2s,background .2s;flex-shrink:0;}
    .btn-logout:hover{color:var(--red,#f44b4b);background:rgba(244,75,75,.1);}
    .sidebar:not(.expanded) .user-details,.sidebar:not(.expanded) .btn-logout{display:none;}
    .sidebar:not(.expanded) .user-avatar{margin:0 auto;}
  `;
  document.head.appendChild(s);
})();

const NAV_SECTIONS = [
  {
    label: 'Giám sát',
    items: [
      { href: 'index.html',  icon: 'bi-speedometer2',   text: 'Dashboard' },
      { href: 'report.html', icon: 'bi-bar-chart-line', text: 'Báo cáo' },
      { href: 'analysis.html', icon: 'bi-graph-up-arrow', text: 'Phân tích' },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { href: '#', icon: 'bi-geo-alt',     text: 'Bản đồ' },
      { href: 'alert.html', icon: 'bi-bell', text: 'Cảnh báo', badge: '2' },
      { href: 'devices.html', icon: 'bi-hdd-network', text: 'Thiết bị' },
    ],
  },
  {
    label: 'Tài khoản',
    bottom: true,
    items: [
      { href: 'users.html',  icon: 'bi-people',         text: 'Người dùng' },
      { href: '#',           icon: 'bi-gear',            text: 'Cấu hình' },
      { href: '#',           icon: 'bi-person-circle',   text: 'Tài khoản' },
    ],
  },
];

(function () {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const cfg  = window.LAYOUT_CONFIG || {};

  // ── Sidebar ──────────────────────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.innerHTML =
      `<div class="sidebar-logo">
        <div class="logo-icon"><i class="bi bi-lightning-charge-fill"></i></div>
        <span class="logo-text">ViPower</span>
      </div>` +
      NAV_SECTIONS.map(sec => {
        const cls = 'nav-section' + (sec.bottom ? ' sidebar-bottom' : '');
        const items = sec.items.map(item => {
          const active = item.href !== '#' && page === item.href;
          return `<a href="${item.href}" class="nav-item${active ? ' active' : ''}">
            <i class="bi ${item.icon}"></i>
            <span class="nav-text">${item.text}</span>
            ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
          </a>`;
        }).join('');
        return `<div class="${cls}"><div class="nav-label">${sec.label}</div>${items}</div>`;
      }).join('');
  }

  // ── Topbar left ───────────────────────────────────────────────
  const topbar = document.getElementById('topbar');
  if (topbar) {
    const bc = (cfg.breadcrumb || ['ViPower'])
      .map((b, i) => (i === 0 ? b : `<span>/</span>${b}`))
      .join(' ');

    const left = document.createElement('div');
    left.className = 'topbar-left';
    left.innerHTML =
      `<button class="btn-icon" id="btnToggle"><i class="bi bi-list"></i></button>
      <div>
        <div class="topbar-title">${cfg.title || 'ViPower'}</div>
        <div class="topbar-breadcrumb">${bc}</div>
      </div>`;

    topbar.insertBefore(left, topbar.firstChild);
  }

  // ── Sidebar user block ────────────────────────────────────────
  if (sidebar) {
    const AVATAR_COLORS = ['#38aaff','#a855f7','#22d369','#f5a623','#f44b4b','#ff7043'];
    const u = JSON.parse(localStorage.getItem('vp_user') || 'null');
    if (u) {
      let n = 0;
      for (let i = 0; i < u.username.length; i++) n += u.username.charCodeAt(i);
      const color = AVATAR_COLORS[n % AVATAR_COLORS.length];
      const name  = u.fullName || u.username;
      const ini   = name.split(' ').slice(-2).map(w => w[0]).join('').slice(0, 2).toUpperCase();

      const block = document.createElement('div');
      block.className = 'sidebar-user';
      block.innerHTML =
        `<div class="user-avatar" style="background:${color}">${ini}</div>
         <div class="user-details">
           <div class="user-name-sb">${name}</div>
           <div class="user-role-sb">${u.role}</div>
         </div>
         <button class="btn-logout" id="btnLogout" title="Đăng xuất">
           <i class="bi bi-box-arrow-right"></i>
         </button>`;
      sidebar.appendChild(block);
    }
  }

  // ── Toggle ────────────────────────────────────────────────────
  const btn = document.getElementById('btnToggle');
  const sb  = document.getElementById('sidebar');
  if (btn && sb) btn.addEventListener('click', () => sb.classList.toggle('expanded'));

  // ── Logout ────────────────────────────────────────────────────
  document.addEventListener('click', async e => {
    if (!e.target.closest('#btnLogout')) return;
    const token = localStorage.getItem('token');
    if (token) {
      _origFetch(`${_API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      }).catch(() => {});
    }
    _clearSession();
    location.replace('login.html');
  });
})();

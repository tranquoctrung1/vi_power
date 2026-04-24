'use strict';

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
      { href: '#', icon: 'bi-hdd-network', text: 'Thiết bị' },
    ],
  },
  {
    label: 'Tài khoản',
    bottom: true,
    items: [
      { href: '#', icon: 'bi-gear',          text: 'Cấu hình' },
      { href: '#', icon: 'bi-person-circle', text: 'Tài khoản' },
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

  // ── Toggle ────────────────────────────────────────────────────
  const btn = document.getElementById('btnToggle');
  const sb  = document.getElementById('sidebar');
  if (btn && sb) btn.addEventListener('click', () => sb.classList.toggle('expanded'));
})();

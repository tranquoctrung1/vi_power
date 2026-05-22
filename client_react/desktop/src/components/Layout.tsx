import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiGet } from '../api/client';
import { useWS } from '../contexts/WSContext';

interface NavItem {
  path: string;
  icon: string;
  text: string;
  adminOnly?: boolean;
  badge?: boolean;
}

const NAV_SECTIONS: { label: string; items: NavItem[]; bottom?: boolean }[] = [
  {
    label: 'Giám sát',
    items: [
      { path: '/',         icon: 'bi-speedometer2',   text: 'Dashboard' },
      { path: '/report',   icon: 'bi-bar-chart-line', text: 'Báo cáo' },
      { path: '/analysis', icon: 'bi-graph-up-arrow', text: 'Phân tích' },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { path: '/topology', icon: 'bi-geo-alt',       text: 'Sơ đồ / Bản đồ' },
      { path: '/alerts',   icon: 'bi-bell-fill',     text: 'Cảnh báo', badge: true },
      { path: '/devices',  icon: 'bi-hdd-network',   text: 'Thiết bị', adminOnly: true },
    ],
  },
  {
    label: 'Tài khoản',
    bottom: true,
    items: [
      { path: '/users',    icon: 'bi-people',        text: 'Người dùng', adminOnly: true },
      { path: '/apikeys',  icon: 'bi-key',           text: 'API Keys', adminOnly: true },
      { path: '/activity', icon: 'bi-activity',      text: 'Nhật ký', adminOnly: true },
    ],
  },
];

const AVATAR_COLORS = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b', '#ff7043'];

function avatarColor(username: string): string {
  let n = 0;
  for (let i = 0; i < username.length; i++) n += username.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

function avatarInitials(user: { username: string; fullName?: string }): string {
  const name = user.fullName || user.username;
  return name.split(' ').slice(-2).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

interface LayoutProps {
  title: string;
  breadcrumb?: string[];
  topbarRight?: React.ReactNode;
  children: React.ReactNode;
}

export default function Layout({ title, breadcrumb, topbarRight, children }: LayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { subscribe } = useWS();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alertBadge, setAlertBadge] = useState(0);
  const isAdmin = user?.role === 'Admin';

  function fetchAlertBadge() {
    apiGet('/alerts/unresolved')
      .then(r => r.json())
      .then(json => {
        const count = (json.data || []).filter((a: { isComplete?: boolean }) => !a.isComplete).length;
        setAlertBadge(count);
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetchAlertBadge();
    const unsub = subscribe('new_alert', () => fetchAlertBadge());
    return () => unsub();
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const bc = breadcrumb || ['ViPower', title];

  const sidebarClass = `sidebar${mobileOpen ? ' expanded' : collapsed ? ' collapsed' : ''}`;
  const topbarClass = `topbar${collapsed ? ' collapsed' : ''}`;
  const mainClass = `main-content${collapsed ? ' collapsed' : ''}`;

  const isMobileNow = () => window.matchMedia('(max-width: 768px)').matches;

  function toggleSidebar() {
    if (isMobileNow()) setMobileOpen(o => !o);
    else { setMobileOpen(false); setCollapsed(c => !c); }
  }

  function closeMobile() { setMobileOpen(false); }

  return (
    <div className="layout-root">
      <div className={`sidebar-overlay${mobileOpen ? ' show' : ''}`} onClick={closeMobile} />
      <aside className={sidebarClass}>
        <div className="sidebar-logo">
          <div className="logo-icon"><i className="bi bi-lightning-charge-fill" /></div>
          <span className="logo-text">ViPower</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_SECTIONS.filter(s => !s.bottom).map(sec => {
            const items = sec.items.filter(it => !it.adminOnly || isAdmin);
            if (!items.length) return null;
            return (
              <div key={sec.label} className="nav-section">
                <div className="nav-label">{sec.label}</div>
                {items.map(it => (
                  <NavLink key={it.path} to={it.path} end={it.path === '/'}
                    className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    onClick={closeMobile}>
                    <i className={`bi ${it.icon}`} />
                    <span className="nav-item-text">{it.text}</span>
                    {it.badge && alertBadge > 0 && (
                      <span className="nav-badge">{alertBadge}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom nav-section">
          {NAV_SECTIONS.filter(s => s.bottom).flatMap(s =>
            s.items.filter(it => !it.adminOnly || isAdmin).map(it => (
              <NavLink key={it.path} to={it.path}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onClick={closeMobile}>
                <i className={`bi ${it.icon}`} />
                <span className="nav-item-text">{it.text}</span>
              </NavLink>
            ))
          )}
        </div>

        {user && (
          <div className="sidebar-user">
            <div className="user-avatar" style={{ background: avatarColor(user.username) }}>
              {avatarInitials(user)}
            </div>
            <div className="user-details">
              <div className="user-name-sb">{user.fullName || user.username}</div>
              <div className="user-role-sb">{user.role}</div>
            </div>
            <button className="btn-logout" onClick={handleLogout} title="Đăng xuất">
              <i className="bi bi-box-arrow-right" />
            </button>
          </div>
        )}
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header className={topbarClass}>
          <div className="topbar-left">
            <button className="btn-icon" onClick={toggleSidebar}>
              <i className="bi bi-list" />
            </button>
            <div>
              <div className="topbar-title">{title}</div>
              <div className="topbar-breadcrumb">
                {bc.map((b, i) => (
                  <span key={i}>{i > 0 && ' / '}{b}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="topbar-right">{topbarRight}</div>
        </header>

        <main className={mainClass}>
          {children}
        </main>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { apiGet } from '../api/client';
import { useWS } from '../contexts/WSContext';

interface Props { active: string; }

const TABS = [
  { id: 'home',   path: '/',        icon: 'bi-house-fill',     label: 'Thiết bị' },
  { id: 'qr',     path: '/qr',      icon: 'bi-qr-code-scan',   label: 'Quét QR' },
  { id: 'report', path: '/report',  icon: 'bi-bar-chart-fill', label: 'Báo cáo' },
  { id: 'alerts', path: '/alerts',  icon: 'bi-bell-fill',      label: 'Cảnh báo' },
];

export default function BottomNav({ active }: Props) {
  const navigate = useNavigate();
  const logout = useAuthStore(s => s.logout);
  const { subscribe } = useWS();
  const [alertCount, setAlertCount] = useState(0);

  function fetchAlertCount() {
    apiGet('/alerts?limit=500').then(r => r.json()).then(json => {
      const count = (json.data || []).filter((a: { resolved?: boolean; isComplete?: boolean }) => !a.resolved && !a.isComplete).length;
      setAlertCount(count);
    }).catch(() => {});
  }

  useEffect(() => {
    fetchAlertCount();
    const unsub = subscribe('new_alert', () => fetchAlertCount());
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="bottom-nav">
      {TABS.map(tab => (
        <NavLink key={tab.id} to={tab.path} end={tab.path === '/'} className={`nav-tab${active === tab.id ? ' active' : ''}`}>
          <div className="nav-tab-wrap">
            <i className={`bi ${tab.icon}`} />
            {tab.id === 'alerts' && alertCount > 0 && (
              <span className="nav-badge">{alertCount > 99 ? '99+' : alertCount}</span>
            )}
            <span>{tab.label}</span>
          </div>
        </NavLink>
      ))}
      <button className="nav-tab" onClick={handleLogout}>
        <div className="nav-tab-wrap">
          <i className="bi bi-box-arrow-right" />
          <span>Đăng xuất</span>
        </div>
      </button>
    </nav>
  );
}

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPatch } from '../api/client';
import BottomNav from '../components/BottomNav';
import { useToast } from '../components/Toast';
import { useWS } from '../contexts/WSContext';

interface Alert {
  _id: string;
  deviceid: string;
  message: string;
  severity: 'critical' | 'warning' | 'info' | 'ok';
  createdAt?: string;
  timestamp?: string;
  resolved?: boolean;
  isComplete?: boolean;
}

type FilterType = 'all' | 'unresolved' | 'critical' | 'warning';

const SEV_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  critical: { icon: 'bi-x-octagon-fill',             color: '#f44b4b',  label: 'Critical' },
  warning:  { icon: 'bi-exclamation-triangle-fill',  color: '#f5a623',  label: 'Warning'  },
  info:     { icon: 'bi-info-circle-fill',            color: '#38aaff',  label: 'Thông tin' },
  ok:       { icon: 'bi-check-circle-fill',           color: '#22d369',  label: 'OK'        },
};

function relTime(ts?: string): string {
  if (!ts) return '--';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s / 60)}p trước`;
  if (s < 86400) return `${Math.floor(s / 3600)}h trước`;
  return `${Math.floor(s / 86400)}d trước`;
}

export default function AlertsPage() {
  useAuth();
  const { showToast } = useToast();
  const { subscribe } = useWS();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
    const u1 = subscribe('mqtt_data', d => {
      const ev = d as { alert?: unknown };
      if (ev?.alert) loadAlerts();
    });
    const u2 = subscribe('new_alert', () => loadAlerts());
    return () => { u1(); u2(); };
  }, []);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadDevices(), loadAlerts()]);
    setLoading(false);
  }

  async function loadDevices() {
    try {
      const res = await apiGet('/devices?limit=1000');
      const json = await res.json();
      const map: Record<string, string> = {};
      (json.data || json.devices || []).forEach((d: { deviceid: string; deviceName?: string }) => {
        map[d.deviceid] = d.deviceName || d.deviceid;
      });
      setDeviceMap(map);
    } catch {}
  }

  async function loadAlerts() {
    try {
      const res = await apiGet('/alerts?limit=200&sortOrder=desc');
      const json = await res.json();
      setAlerts(json.data || []);
    } catch {
      showToast('Không tải được cảnh báo', 'error');
    }
  }

  async function resolveAlert(id: string) {
    try {
      const res = await apiPatch(`/alerts/${id}/resolve`);
      const json = await res.json();
      if (json.success) {
        setAlerts(prev => prev.map(a => a._id === id ? { ...a, isComplete: true, resolved: true } : a));
        showToast('Đã xử lý cảnh báo', 'ok');
      } else {
        showToast(json.message || 'Lỗi xử lý', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    }
  }

  const unresolved = alerts.filter(a => !a.resolved && !a.isComplete).length;
  const critical = alerts.filter(a => a.severity === 'critical').length;

  const filtered = alerts.filter(a => {
    if (filter === 'unresolved') return !a.isComplete && !a.resolved;
    if (filter === 'critical' || filter === 'warning') return a.severity === filter;
    return true;
  });

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'unresolved', label: 'Chưa xử lý' },
    { id: 'critical', label: 'Critical' },
    { id: 'warning', label: 'Warning' },
  ];

  return (
    <>
      <header className="app-header">
        <div className="app-header-title">
          <i className="bi bi-bell-fill" />
          Cảnh báo
        </div>
        <button onClick={() => { setLoading(true); loadAlerts().then(() => setLoading(false)); }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', padding: 4 }}>
          <i className="bi bi-arrow-clockwise" />
        </button>
      </header>

      <div className="app-content">
        <div className="chip-row" style={{ paddingTop: 10 }}>
          {FILTERS.map(f => (
            <button key={f.id} className={`chip${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>

        <div className="kpi-strip">
          <div className="kpi-box"><div className="kpi-box-val">{alerts.length}</div><div className="kpi-box-lbl">Tổng</div></div>
          <div className="kpi-box"><div className="kpi-box-val" style={{ color: '#f44b4b' }}>{unresolved}</div><div className="kpi-box-lbl">Chưa xử lý</div></div>
          <div className="kpi-box"><div className="kpi-box-val" style={{ color: '#f44b4b' }}>{critical}</div><div className="kpi-box-lbl">Critical</div></div>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-msg">
            <i className="bi bi-bell-slash" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
            Không có cảnh báo nào.
          </div>
        ) : (
          <div className="alert-list">
            {filtered.map(a => {
              const s = SEV_CONFIG[a.severity] || SEV_CONFIG.info;
              const resolved = a.resolved || a.isComplete;
              const devName = deviceMap[a.deviceid] || a.deviceid || '--';
              return (
                <div key={a._id} className={`alert-item ${a.severity || 'info'}${resolved ? ' alert-resolved' : ''}`}>
                  <i className={`bi ${s.icon} alert-icon`} style={{ color: s.color }} />
                  <div className="alert-body">
                    <div className="alert-device">{devName}</div>
                    <div className="alert-msg">{a.message || '--'}</div>
                    <div className="alert-time">
                      <span className={`badge ${resolved ? 'badge-inactive' : 'badge-offline'}`} style={{ fontSize: 9, padding: '1px 6px' }}>
                        {s.label}
                      </span>
                      {relTime(a.createdAt || a.timestamp)}{resolved ? ' · Đã xử lý' : ''}
                    </div>
                  </div>
                  {!resolved && (
                    <button className="resolve-btn" onClick={() => resolveAlert(a._id)}>Xử lý</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="spacer-bottom" />
      </div>

      <BottomNav active="alerts" />
    </>
  );
}

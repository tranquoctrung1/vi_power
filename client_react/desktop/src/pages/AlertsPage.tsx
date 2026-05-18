import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPatch } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { WS_URL } from '../config';

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

type FilterType = 'all' | 'unresolved' | 'critical' | 'warning' | 'info';

const SEV_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  critical: { icon: 'bi-x-octagon-fill',            color: '#f44b4b', label: 'Critical' },
  warning:  { icon: 'bi-exclamation-triangle-fill', color: '#f5a623', label: 'Warning'  },
  info:     { icon: 'bi-info-circle-fill',           color: '#38aaff', label: 'Info'     },
  ok:       { icon: 'bi-check-circle-fill',          color: '#22d369', label: 'OK'       },
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
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    loadAll();
    connectWS();
    return () => wsRef.current?.close();
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
      const res = await apiGet('/alerts?limit=500&sortOrder=desc');
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

  function connectWS() {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'client_init' })));
    ws.addEventListener('message', evt => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'mqtt_data' && msg.data?.alert) loadAlerts();
      } catch {}
    });
    ws.addEventListener('close', () => setTimeout(connectWS, 5000));
    ws.addEventListener('error', () => ws.close());
  }

  const unresolved = alerts.filter(a => !a.resolved && !a.isComplete).length;
  const critical = alerts.filter(a => a.severity === 'critical').length;
  const warning = alerts.filter(a => a.severity === 'warning').length;

  const filtered = alerts.filter(a => {
    if (filter === 'unresolved') return !a.isComplete && !a.resolved;
    if (filter === 'critical' || filter === 'warning' || filter === 'info') return a.severity === filter;
    if (search) {
      const q = search.toLowerCase();
      return (a.message || '').toLowerCase().includes(q) ||
             (deviceMap[a.deviceid] || a.deviceid || '').toLowerCase().includes(q);
    }
    return true;
  }).filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.message || '').toLowerCase().includes(q) ||
           (deviceMap[a.deviceid] || a.deviceid || '').toLowerCase().includes(q);
  });

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'unresolved', label: 'Chưa xử lý' },
    { id: 'critical', label: 'Critical' },
    { id: 'warning', label: 'Warning' },
    { id: 'info', label: 'Thông tin' },
  ];

  const topbarRight = (
    <button className="btn-icon" onClick={() => { setLoading(true); loadAlerts().then(() => setLoading(false)); }} title="Làm mới">
      <i className="bi bi-arrow-clockwise" />
    </button>
  );

  return (
    <Layout title="Cảnh báo & Sự kiện" breadcrumb={['ViPower', 'Hệ thống', 'Cảnh báo']} topbarRight={topbarRight}>
      <div className="kpi-strip">
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--text-primary)' }}>
          <div className="kpi-cell-label">Tổng cảnh báo</div>
          <div className="kpi-cell-val">{alerts.length}</div>
          <div className="kpi-cell-sub">Tất cả</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--red)' }}>
          <div className="kpi-cell-label">Chưa xử lý</div>
          <div className="kpi-cell-val">{unresolved}</div>
          <div className="kpi-cell-sub">Active</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--red)' }}>
          <div className="kpi-cell-label">Critical</div>
          <div className="kpi-cell-val">{critical}</div>
          <div className="kpi-cell-sub">Cần xử lý ngay</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--yellow)' }}>
          <div className="kpi-cell-label">Warning</div>
          <div className="kpi-cell-val">{warning}</div>
          <div className="kpi-cell-sub">Theo dõi chặt</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" />
          <input className="search-input" type="search" placeholder="Tìm nội dung, thiết bị..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {FILTERS.map(f => (
          <button key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '7px 14px', borderRadius: 7, border: `1px solid ${filter === f.id ? 'var(--accent)' : 'var(--border-bright)'}`,
              background: filter === f.id ? 'var(--accent-dim)' : 'var(--bg-elevated)',
              color: filter === f.id ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-bell-fill" />Danh sách cảnh báo</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} bản ghi</span>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-bell-slash" />
            Không có cảnh báo nào.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Thiết bị</th>
                  <th>Mức độ</th>
                  <th>Nội dung</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const s = SEV_CONFIG[a.severity] || SEV_CONFIG.info;
                  const resolved = a.resolved || a.isComplete;
                  return (
                    <tr key={a._id} style={{ opacity: resolved ? 0.6 : 1 }}>
                      <td className="td-mono td-muted">{relTime(a.createdAt || a.timestamp)}</td>
                      <td>{deviceMap[a.deviceid] || a.deviceid || '--'}</td>
                      <td>
                        <span className={`badge badge-${a.severity}`}>
                          <i className={`bi ${s.icon}`} style={{ color: s.color }} />
                          {s.label}
                        </span>
                      </td>
                      <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.message || '--'}
                      </td>
                      <td>
                        {resolved
                          ? <span className="badge badge-ok">Đã xử lý</span>
                          : <span className="badge badge-offline">Chưa xử lý</span>}
                      </td>
                      <td>
                        {!resolved && (
                          <button className="resolve-btn" onClick={() => resolveAlert(a._id)}>Xử lý</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

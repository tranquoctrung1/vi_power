import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useAuthStore } from '../stores/authStore';

interface ActivityLog {
  _id: string;
  username?: string;
  action?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  ip?: string;
  createdAt?: string;
  timestamp?: string;
}

function relTime(ts?: string): string {
  if (!ts) return '--';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s / 60)}p trước`;
  if (s < 86400) return `${Math.floor(s / 3600)}h trước`;
  return `${Math.floor(s / 86400)}d trước`;
}

export default function ActivityPage() {
  useAuth();
  const { showToast } = useToast();
  const storeUser = useAuthStore(s => s.user);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const isAdmin = storeUser?.role === 'Admin';

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet('/activity?limit=500');
      const json = await res.json();
      setLogs(json.data || json.logs || []);
    } catch {
      showToast('Không tải được nhật ký', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filtered = logs.filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (l.username || '').toLowerCase().includes(q) ||
           (l.action || l.path || '').toLowerCase().includes(q);
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = logs.filter(l => new Date(l.createdAt || l.timestamp || 0) >= today).length;
  const writeCount = logs.filter(l => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(l.method || '')).length;
  const errorCount = logs.filter(l => (l.statusCode || 0) >= 400).length;

  const topbarRight = (
    <button className="btn-icon" onClick={load} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
  );

  if (!isAdmin) {
    return (
      <Layout title="Nhật ký hoạt động" breadcrumb={['ViPower', 'Tài khoản', 'Nhật ký']}>
        <div className="empty-state" style={{ padding: 60 }}>
          <i className="bi bi-shield-lock-fill" style={{ color: 'var(--red)' }} />
          Trang này chỉ dành cho Admin.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Nhật ký hoạt động" breadcrumb={['ViPower', 'Tài khoản', 'Nhật ký']} topbarRight={topbarRight}>
      <div className="kpi-strip">
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--accent)' }}>
          <div className="kpi-cell-label">Tổng bản ghi</div>
          <div className="kpi-cell-val">{logs.length}</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--green)' }}>
          <div className="kpi-cell-label">Hôm nay</div>
          <div className="kpi-cell-val">{todayCount}</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--yellow)' }}>
          <div className="kpi-cell-label">Thao tác ghi</div>
          <div className="kpi-cell-val">{writeCount}</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--red)' }}>
          <div className="kpi-cell-label">Lỗi</div>
          <div className="kpi-cell-val">{errorCount}</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" />
          <input className="search-input" type="search" placeholder="Tìm user, action..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-activity" />Nhật ký hoạt động</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} bản ghi</span>
        </div>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><i className="bi bi-clock-history" />Chưa có bản ghi nào.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người dùng</th>
                  <th>Phương thức</th>
                  <th>Đường dẫn / Hành động</th>
                  <th>Status</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l._id}>
                    <td className="td-mono td-muted">{relTime(l.createdAt || l.timestamp)}</td>
                    <td style={{ fontWeight: 500 }}>{l.username || '--'}</td>
                    <td>
                      {l.method && (
                        <span className="badge" style={{
                          background: l.method === 'GET' ? 'rgba(34,211,105,0.12)' : l.method === 'DELETE' ? 'rgba(244,75,75,0.12)' : 'rgba(56,170,255,0.12)',
                          color: l.method === 'GET' ? 'var(--green)' : l.method === 'DELETE' ? 'var(--red)' : 'var(--accent)',
                        }}>{l.method}</span>
                      )}
                    </td>
                    <td className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {l.action || l.path || '--'}
                    </td>
                    <td>
                      {l.statusCode ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: l.statusCode >= 400 ? 'var(--red)' : 'var(--green)' }}>
                          {l.statusCode}
                        </span>
                      ) : '--'}
                    </td>
                    <td className="td-mono td-muted">{l.ip || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

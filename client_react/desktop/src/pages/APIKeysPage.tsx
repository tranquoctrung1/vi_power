import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, apiDelete } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useAuthStore } from '../stores/authStore';

interface APIKey {
  _id: string;
  name?: string;
  description?: string;
  key?: string;
  keyPreview?: string;
  isActive?: boolean;
  createdAt?: string;
  lastUsed?: string;
  createdBy?: string;
}

function relTime(ts?: string): string {
  if (!ts) return 'Chưa dùng';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s / 60)}p trước`;
  if (s < 86400) return `${Math.floor(s / 3600)}h trước`;
  return `${Math.floor(s / 86400)}d trước`;
}

export default function APIKeysPage() {
  useAuth();
  const { showToast } = useToast();
  const storeUser = useAuthStore(s => s.user);
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<APIKey | null>(null);

  const isAdmin = storeUser?.role === 'Admin';

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet('/apikeys');
      const json = await res.json();
      setKeys(json.data || json.keys || []);
    } catch {
      showToast('Không tải được API Keys', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.name) { showToast('Vui lòng nhập tên key', 'warn'); return; }
    setSaving(true);
    try {
      const res = await apiPost('/apikeys', form);
      const json = await res.json();
      if (json.data?.key || json.key) {
        setNewKey(json.data?.key || json.key);
        showToast('Tạo API Key thành công', 'ok');
        setModal(false);
        load();
      } else {
        showToast(json.message || 'Lỗi tạo key', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(k: APIKey) {
    try {
      const res = await apiDelete(`/apikeys/${k._id}`);
      const json = await res.json();
      if (json.success) {
        showToast('Đã thu hồi API Key', 'ok');
        setConfirmRevoke(null);
        load();
      } else {
        showToast(json.message || 'Lỗi thu hồi', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    }
  }

  const active = keys.filter(k => k.isActive !== false).length;
  const revoked = keys.filter(k => k.isActive === false).length;

  const topbarRight = (
    <>
      {isAdmin && <button className="btn-primary" onClick={() => { setForm({ name: '', description: '' }); setModal(true); }}><i className="bi bi-plus-lg" />Tạo API Key</button>}
      <button className="btn-icon" onClick={load} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
    </>
  );

  if (!isAdmin) {
    return (
      <Layout title="API Keys" breadcrumb={['ViPower', 'Tài khoản', 'API Keys']}>
        <div className="empty-state" style={{ padding: 60 }}>
          <i className="bi bi-shield-lock-fill" style={{ color: 'var(--red)' }} />
          Trang này chỉ dành cho Admin.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="API Keys" breadcrumb={['ViPower', 'Tài khoản', 'API Keys']} topbarRight={topbarRight}>
      <div style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-bright)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <i className="bi bi-info-circle-fill" style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Kết nối SCADA / Power BI / EMS</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Gửi header <code style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 3, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>X-API-Key: &lt;key&gt;</code> trong mỗi request.
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--text-primary)' }}>
          <div className="kpi-cell-label">Tổng API Keys</div>
          <div className="kpi-cell-val">{keys.length}</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--green)' }}>
          <div className="kpi-cell-label">Đang hoạt động</div>
          <div className="kpi-cell-val">{active}</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--red)' }}>
          <div className="kpi-cell-label">Đã thu hồi</div>
          <div className="kpi-cell-val">{revoked}</div>
        </div>
      </div>

      {newKey && (
        <div style={{ background: 'rgba(34,211,105,0.1)', border: '1px solid rgba(34,211,105,0.3)', borderRadius: 10, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <i className="bi bi-check-circle-fill" style={{ color: 'var(--green)', fontSize: 18 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>API Key mới (chỉ hiển thị một lần — hãy lưu lại!)</div>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green)', wordBreak: 'break-all' }}>{newKey}</code>
          </div>
          <button className="btn-icon" onClick={() => { navigator.clipboard.writeText(newKey); showToast('Đã sao chép', 'ok'); }} title="Sao chép">
            <i className="bi bi-clipboard" />
          </button>
          <button className="btn-icon" onClick={() => setNewKey('')} title="Đóng">
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-key" />Danh sách API Keys</span>
        </div>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : keys.length === 0 ? (
          <div className="empty-state"><i className="bi bi-key" />Chưa có API Key nào.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Mô tả</th>
                  <th>Key</th>
                  <th>Trạng thái</th>
                  <th>Lần dùng cuối</th>
                  <th>Ngày tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k._id}>
                    <td style={{ fontWeight: 600 }}>{k.name || '--'}</td>
                    <td className="td-muted">{k.description || '--'}</td>
                    <td className="td-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                      {k.keyPreview || (k.key ? k.key.slice(0, 12) + '...' : '--')}
                    </td>
                    <td>
                      {k.isActive !== false
                        ? <span className="badge badge-active">Active</span>
                        : <span className="badge badge-inactive">Revoked</span>}
                    </td>
                    <td className="td-muted">{relTime(k.lastUsed)}</td>
                    <td className="td-muted">{relTime(k.createdAt)}</td>
                    <td>
                      {k.isActive !== false && (
                        <button className="resolve-btn" style={{ color: 'var(--red)', borderColor: 'rgba(244,75,75,0.3)' }} onClick={() => setConfirmRevoke(k)}>
                          Thu hồi
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="modal-title">Tạo API Key mới</div>
              <button className="modal-close" onClick={() => setModal(false)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tên key *</label>
                <input className="form-input" placeholder="VD: SCADA Integration" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Mô tả</label>
                <input className="form-input" placeholder="Mục đích sử dụng..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setModal(false)}>Hủy</button>
              <button className="btn-modal-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Đang tạo...' : 'Tạo key'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmRevoke && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setConfirmRevoke(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ color: 'var(--red)' }}>Thu hồi API Key</div>
              <button className="modal-close" onClick={() => setConfirmRevoke(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Thu hồi key <strong style={{ color: 'var(--text-primary)' }}>{confirmRevoke.name}</strong>? Key sẽ không còn hoạt động.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setConfirmRevoke(null)}>Hủy</button>
              <button className="btn-modal-primary" style={{ background: 'var(--red)' }} onClick={() => handleRevoke(confirmRevoke)}>Thu hồi</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

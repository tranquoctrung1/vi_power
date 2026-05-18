import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useAuthStore } from '../stores/authStore';

interface User {
  _id: string;
  username: string;
  fullName?: string;
  email?: string;
  role: string;
  isActive?: boolean;
  createdAt?: string;
  lastLogin?: string;
}

const ROLES = ['Admin', 'Engineer', 'Supervisor', 'Operator', 'Viewer'];

const ROLE_COLORS: Record<string, string> = {
  Admin: '#a855f7', Engineer: '#38aaff', Supervisor: '#f5a623',
  Operator: '#22d369', Viewer: '#607b99',
};

function relTime(ts?: string): string {
  if (!ts) return 'Chưa bao giờ';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s / 60)}p trước`;
  if (s < 86400) return `${Math.floor(s / 3600)}h trước`;
  return `${Math.floor(s / 86400)}d trước`;
}

export default function UsersPage() {
  useAuth();
  const { showToast } = useToast();
  const storeUser = useAuthStore(s => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState({ username: '', fullName: '', email: '', role: 'Viewer', password: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  const isAdmin = storeUser?.role === 'Admin';

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet('/users?limit=500');
      const json = await res.json();
      setUsers(json.data || json.users || []);
    } catch {
      showToast('Không tải được danh sách người dùng', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm({ username: '', fullName: '', email: '', role: 'Viewer', password: '', isActive: true });
    setEditId('');
    setModal('add');
  }

  function openEdit(u: User) {
    setForm({ username: u.username, fullName: u.fullName || '', email: u.email || '', role: u.role, password: '', isActive: u.isActive !== false });
    setEditId(u._id);
    setModal('edit');
  }

  async function handleSave() {
    if (!form.username || (modal === 'add' && !form.password)) {
      showToast('Username và mật khẩu là bắt buộc', 'warn'); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { username: form.username, fullName: form.fullName, email: form.email, role: form.role, isActive: form.isActive };
      if (form.password) payload.password = form.password;

      const res = modal === 'add'
        ? await apiPost('/users', payload)
        : await apiPut(`/users/${editId}`, payload);
      const json = await res.json();
      if (json.success || json.data || json._id) {
        showToast(modal === 'add' ? 'Thêm người dùng thành công' : 'Cập nhật thành công', 'ok');
        setModal(null); load();
      } else {
        showToast(json.message || 'Lỗi lưu', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u: User) {
    try {
      const res = await apiDelete(`/users/${u._id}`);
      const json = await res.json();
      if (json.success) {
        showToast('Đã xóa người dùng', 'ok');
        setConfirmDelete(null); load();
      } else {
        showToast(json.message || 'Lỗi xóa', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    }
  }

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (u.username || '').toLowerCase().includes(q) ||
             (u.fullName || '').toLowerCase().includes(q) ||
             (u.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const roleCounts: Record<string, number> = { all: users.length };
  ROLES.forEach(r => { roleCounts[r] = users.filter(u => u.role === r).length; });

  const topbarRight = (
    <>
      {isAdmin && <button className="btn-primary" onClick={openAdd}><i className="bi bi-person-plus" />Thêm người dùng</button>}
      <button className="btn-icon" onClick={load} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
    </>
  );

  if (!isAdmin) {
    return (
      <Layout title="Quản lý Người dùng" breadcrumb={['ViPower', 'Tài khoản', 'Người dùng']}>
        <div className="empty-state" style={{ padding: 60 }}>
          <i className="bi bi-shield-lock-fill" style={{ color: 'var(--red)' }} />
          Trang này chỉ dành cho Admin.
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Quản lý Người dùng" breadcrumb={['ViPower', 'Tài khoản', 'Người dùng']} topbarRight={topbarRight}>
      <div className="kpi-strip">
        {[{ id: 'all', label: 'Tổng', color: 'var(--text-primary)' }, ...ROLES.map(r => ({ id: r, label: r, color: ROLE_COLORS[r] }))].map(item => (
          <div key={item.id} className={`kpi-cell${roleFilter === item.id ? ' active' : ''}`}
            style={{ ['--kpi-c' as string]: item.color, cursor: 'pointer' }}
            onClick={() => setRoleFilter(item.id)}>
            <div className="kpi-cell-label">{item.label}</div>
            <div className="kpi-cell-val">{roleCounts[item.id] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" />
          <input className="search-input" type="search" placeholder="Tìm username, họ tên..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-people" />Danh sách người dùng</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} người dùng</span>
        </div>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Họ tên</th>
                  <th>Email</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Đăng nhập lần cuối</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u._id}>
                    <td className="td-mono" style={{ fontWeight: 600 }}>{u.username}</td>
                    <td>{u.fullName || '--'}</td>
                    <td className="td-muted">{u.email || '--'}</td>
                    <td>
                      <span className="badge" style={{ background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role] }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      {u.isActive !== false
                        ? <span className="badge badge-active">Hoạt động</span>
                        : <span className="badge badge-inactive">Bị khóa</span>}
                    </td>
                    <td className="td-muted">{relTime(u.lastLogin)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13 }} onClick={() => openEdit(u)} title="Sửa">
                          <i className="bi bi-pencil" />
                        </button>
                        {u._id !== storeUser?._id && (
                          <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13, color: 'var(--red)' }} onClick={() => setConfirmDelete(u)} title="Xóa">
                            <i className="bi bi-trash" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modal === 'add' ? 'Thêm người dùng' : 'Sửa người dùng'}</div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body">
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input className="form-input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} disabled={modal === 'edit'} />
                </div>
                <div className="form-group">
                  <label className="form-label">{modal === 'add' ? 'Mật khẩu *' : 'Mật khẩu mới (để trống nếu không đổi)'}</label>
                  <input className="form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Họ tên</label>
                  <input className="form-input" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Vai trò</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select className="form-select" value={form.isActive ? 'active' : 'locked'} onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'active' }))}>
                    <option value="active">Hoạt động</option>
                    <option value="locked">Bị khóa</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setModal(null)}>Hủy</button>
              <button className="btn-modal-primary" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ color: 'var(--red)' }}>Xác nhận xóa</div>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Xóa người dùng <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.username}</strong>? Thao tác không thể hoàn tác.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setConfirmDelete(null)}>Hủy</button>
              <button className="btn-modal-primary" style={{ background: 'var(--red)' }} onClick={() => handleDelete(confirmDelete)}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

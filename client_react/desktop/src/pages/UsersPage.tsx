import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useAuthStore } from '../stores/authStore';
import Pager from '../components/Pager';
import { exportCSV } from '../utils/exportCSV';

interface User {
  _id: string;
  username: string;
  fullName?: string;
  email?: string;
  role: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
  loginCount?: number;
  allowedAreas?: string[];
}

interface DisplayGroup {
  _id: string;
  displaygrouid: string;
  name?: string;
  groupName?: string;
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

function fmtDate(ts?: string): string {
  if (!ts) return '--';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

const PAGE_SIZE = 10;

export default function UsersPage() {
  useAuth();
  const { showToast } = useToast();
  const storeUser = useAuthStore(s => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<DisplayGroup[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState({ username: '', fullName: '', email: '', role: 'Viewer', password: '', isActive: true });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  // Area permission modal
  const [areaModal, setAreaModal] = useState<User | null>(null);
  const [areaSelected, setAreaSelected] = useState<Set<string>>(new Set());
  const [areaSaving, setAreaSaving] = useState(false);

  const isAdmin = storeUser?.role === 'Admin';

  useEffect(() => { load(); loadGroups(); }, []);
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet('/auth/users?limit=500');
      const json = await res.json();
      setUsers(json.data || json.users || []);
    } catch {
      showToast('Không tải được danh sách người dùng', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadGroups() {
    try {
      const res = await apiGet('/display-groups?limit=1000');
      const json = await res.json();
      setGroups(json.data?.data || json.data || []);
    } catch {}
  }

  function openAdd() {
    setForm({ username: '', fullName: '', email: '', role: 'Viewer', password: '', isActive: true });
    setShowPassword(false);
    setEditId('');
    setModal('add');
  }

  function openEdit(u: User) {
    setForm({ username: u.username, fullName: u.fullName || '', email: u.email || '', role: u.role, password: '', isActive: u.isActive !== false });
    setShowPassword(false);
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
        ? await apiPost('/auth/register', payload)
        : await apiPut(`/auth/users/${editId}`, payload);
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
      const res = await apiDelete(`/auth/users/${u._id}`);
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

  function openAreaModal(u: User) {
    setAreaModal(u);
    setAreaSelected(new Set(u.allowedAreas || []));
  }

  async function saveAreaPermissions() {
    if (!areaModal) return;
    setAreaSaving(true);
    try {
      const res = await apiPut(`/auth/users/${areaModal._id}`, { allowedAreas: [...areaSelected] });
      const json = await res.json();
      if (res.ok || json.success) {
        showToast('Đã cập nhật quyền khu vực', 'ok');
        setAreaModal(null);
        load();
      } else {
        showToast(json.message || 'Lỗi lưu', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    } finally {
      setAreaSaving(false);
    }
  }

  function handleExport() {
    exportCSV('users', ['Username', 'Họ tên', 'Email', 'Vai trò', 'Trạng thái', 'Đăng nhập lần cuối', 'Ngày tạo'],
      filtered.map(u => [u.username, u.fullName || '', u.email || '', u.role, u.isActive !== false ? 'Hoạt động' : 'Bị khóa', relTime(u.lastLogin), fmtDate(u.createdAt)]));
    showToast(`Đã xuất ${filtered.length} người dùng`, 'ok');
  }

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (statusFilter === 'active' && u.isActive === false) return false;
    if (statusFilter === 'locked' && u.isActive !== false) return false;
    if (search) {
      const q = search.toLowerCase();
      return (u.username || '').toLowerCase().includes(q) ||
             (u.fullName || '').toLowerCase().includes(q) ||
             (u.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const roleCounts: Record<string, number> = { all: users.length };
  ROLES.forEach(r => { roleCounts[r] = users.filter(u => u.role === r).length; });

  const topbarRight = (
    <>
      {isAdmin && <button className="btn-primary" onClick={openAdd}><i className="bi bi-person-plus" />Thêm người dùng</button>}
      <button className="btn-ghost" onClick={handleExport} disabled={!filtered.length}><i className="bi bi-download" />Xuất CSV</button>
      <button className="btn-primary" onClick={handleExport} disabled={!filtered.length}><i className="bi bi-file-earmark-excel" />Xuất Excel</button>
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
    <Layout title="Quản lý Người dùng" breadcrumb={['ViPower', 'Hệ thống', 'Người dùng']} topbarRight={topbarRight}>
      {/* KPI strip — role filter */}
      <div className="kpi-strip">
        {[{ id: 'all', label: 'Tổng', color: 'var(--text-primary)', sub: 'Toàn hệ thống' },
          ...ROLES.map(r => ({ id: r, label: r, color: ROLE_COLORS[r], sub: '' }))].map(item => (
          <div key={item.id} className={`kpi-cell${roleFilter === item.id ? ' active' : ''}`}
            style={{ ['--kpi-c' as string]: item.color, cursor: 'pointer' }}
            onClick={() => setRoleFilter(item.id)}>
            <div className="kpi-cell-label">{item.label}</div>
            <div className="kpi-cell-val">{roleCounts[item.id] ?? 0}</div>
            {item.sub && <div className="kpi-cell-sub">{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" />
          <input className="search-input" type="search" placeholder="Tìm username, họ tên..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="filter-label">Vai trò</span>
        <select className="filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">Tất cả</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="filter-label">Trạng thái</span>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Tất cả</option>
          <option value="active">Đang hoạt động</option>
          <option value="locked">Bị khóa</option>
        </select>
        {(search || roleFilter !== 'all' || statusFilter !== 'all') && (
          <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto' }}
            onClick={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); }}>
            <i className="bi bi-x-circle" /> Xóa lọc
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-people" />Danh sách người dùng</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} người dùng</span>
        </div>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 44 }}></th>
                    <th>Username</th>
                    <th>Họ tên</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Lần đăng nhập</th>
                    <th>Ngày tạo</th>
                    <th>Cập nhật</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(u => (
                    <tr key={u._id}>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                          background: `${ROLE_COLORS[u.role]}22`, color: ROLE_COLORS[u.role],
                          margin: '0 auto',
                        }}>
                          {u.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      </td>
                      <td className="td-mono" style={{ fontWeight: 600 }}>{u.username}</td>
                      <td>{u.fullName || '--'}</td>
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
                      <td className="td-mono td-muted" style={{ fontSize: 11 }}>{u.loginCount ?? '--'}</td>
                      <td className="td-muted" style={{ fontSize: 11 }}>{fmtDate(u.createdAt)}</td>
                      <td className="td-muted" style={{ fontSize: 11 }}>{fmtDate(u.updatedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13 }} onClick={() => openEdit(u)} title="Sửa">
                            <i className="bi bi-pencil" />
                          </button>
                          {u.role !== 'Admin' && (
                            <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13, color: 'var(--accent)' }} onClick={() => openAreaModal(u)} title="Phân quyền khu vực">
                              <i className="bi bi-diagram-3" />
                            </button>
                          )}
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
            <Pager total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">
                <i className="bi bi-person-circle" style={{ color: 'var(--accent)' }} />
                {modal === 'add' ? 'Thêm người dùng' : 'Sửa người dùng'}
              </div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                <i className="bi bi-info-circle" /> Thông tin tài khoản
              </div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Username *</label>
                  <input className="form-input" placeholder="VD: john_doe" value={form.username}
                    onChange={e => setForm(f => ({ ...f, username: e.target.value }))} disabled={modal === 'edit'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Họ và tên</label>
                  <input className="form-input" placeholder="VD: Nguyễn Văn A" value={form.fullName}
                    onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{modal === 'add' ? 'Mật khẩu *' : 'Mật khẩu mới (để trống nếu không đổi)'}</label>
                  <div className="pw-wrap">
                    <input className="form-input" type={showPassword ? 'text' : 'password'}
                      placeholder="Nhập mật khẩu..." value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
                    <button type="button" className="pw-toggle" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                      <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Vai trò *</label>
                  <select className="form-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select className="form-select" value={form.isActive ? 'active' : 'locked'}
                    onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'active' }))}>
                    <option value="active">Hoạt động</option>
                    <option value="locked">Bị khóa</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setModal(null)}>Hủy</button>
              <button className="btn-modal-primary" onClick={handleSave} disabled={saving}>
                <i className="bi bi-check-lg" />{saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ color: 'var(--red)' }}>
                <i className="bi bi-exclamation-triangle" /> Xác nhận xóa
              </div>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <i className="bi bi-person-x" style={{ fontSize: 32, color: 'var(--red)', marginBottom: 10, display: 'block' }} />
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Xóa người dùng này?</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Tài khoản <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.username}</strong> sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setConfirmDelete(null)}>Hủy</button>
              <button className="btn-modal-primary" style={{ background: 'var(--red)' }} onClick={() => handleDelete(confirmDelete)}>
                <i className="bi bi-person-x" /> Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Area permission modal */}
      {areaModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setAreaModal(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="bi bi-diagram-3" style={{ color: 'var(--accent)' }} />
                Phân quyền khu vực — <strong>{areaModal.username}</strong>
              </div>
              <button className="modal-close" onClick={() => setAreaModal(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
                <i className="bi bi-geo-alt" /> Chọn khu vực được phép truy cập
              </div>
              {groups.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Chưa có khu vực nào được tạo.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {groups.map(g => {
                    const gid = g.displaygrouid || g._id;
                    const checked = areaSelected.has(gid);
                    return (
                      <label key={g._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 7, border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer' }}>
                        <input type="checkbox" checked={checked} style={{ accentColor: 'var(--accent)' }}
                          onChange={() => setAreaSelected(prev => { const next = new Set(prev); next.has(gid) ? next.delete(gid) : next.add(gid); return next; })} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{g.groupName || g.name || gid}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setAreaModal(null)}>Hủy</button>
              <button className="btn-modal-primary" onClick={saveAreaPermissions} disabled={areaSaving}>
                <i className="bi bi-check-lg" />{areaSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

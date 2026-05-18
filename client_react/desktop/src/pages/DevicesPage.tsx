import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';

interface Device {
  _id: string;
  deviceid: string;
  deviceName: string;
  location?: string;
  deviceType?: string;
  status: string;
  samplingCycle?: number;
  displaygroupid?: string;
}

type StatusFilter = 'all' | 'active' | 'offline' | 'error' | 'inactive' | 'paused';

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  active:   { cls: 'badge-active',   label: 'Hoạt động' },
  offline:  { cls: 'badge-offline',  label: 'Offline' },
  error:    { cls: 'badge-error',    label: 'Lỗi' },
  inactive: { cls: 'badge-inactive', label: 'Tắt' },
  paused:   { cls: 'badge-paused',   label: 'Dừng' },
};

const EMPTY_FORM = { deviceid: '', deviceName: '', location: '', deviceType: '', samplingCycle: 60, status: 'inactive' };

export default function DevicesPage() {
  useAuth();
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Device | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet('/devices?limit=1000');
      const json = await res.json();
      setDevices((json.data || json.devices || []).filter((d: Device) => d.deviceid));
    } catch {
      showToast('Không tải được danh sách thiết bị', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setEditId('');
    setModal('add');
  }

  function openEdit(d: Device) {
    setForm({ deviceid: d.deviceid, deviceName: d.deviceName || '', location: d.location || '', deviceType: d.deviceType || '', samplingCycle: d.samplingCycle || 60, status: d.status || 'inactive' });
    setEditId(d._id);
    setModal('edit');
  }

  async function handleSave() {
    if (!form.deviceid || !form.deviceName) { showToast('Vui lòng điền đầy đủ thông tin', 'warn'); return; }
    setSaving(true);
    try {
      if (modal === 'add') {
        const res = await apiPost('/devices', form);
        const json = await res.json();
        if (json.success || json.data) {
          showToast('Thêm thiết bị thành công', 'ok');
          setModal(null);
          load();
        } else {
          showToast(json.message || 'Lỗi thêm thiết bị', 'error');
        }
      } else {
        const res = await apiPut(`/devices/${editId}`, form);
        const json = await res.json();
        if (json.success || json.data) {
          showToast('Cập nhật thành công', 'ok');
          setModal(null);
          load();
        } else {
          showToast(json.message || 'Lỗi cập nhật', 'error');
        }
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(d: Device) {
    try {
      const res = await apiDelete(`/devices/${d._id}`);
      const json = await res.json();
      if (json.success) {
        showToast('Đã xóa thiết bị', 'ok');
        setConfirmDelete(null);
        load();
      } else {
        showToast(json.message || 'Lỗi xóa', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    }
  }

  const filtered = devices.filter(d => {
    if (statusFilter !== 'all') {
      const match = statusFilter === 'offline' ? ['offline', 'paused'] : [statusFilter];
      if (!match.includes(d.status)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (d.deviceName || '').toLowerCase().includes(q) ||
             (d.deviceid || '').toLowerCase().includes(q) ||
             (d.location || '').toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    all: devices.length,
    active: devices.filter(d => d.status === 'active').length,
    offline: devices.filter(d => ['offline', 'paused'].includes(d.status)).length,
    error: devices.filter(d => d.status === 'error').length,
    inactive: devices.filter(d => d.status === 'inactive').length,
  };

  const topbarRight = (
    <>
      <button className="btn-primary" onClick={openAdd}><i className="bi bi-plus-lg" />Thêm thiết bị</button>
      <button className="btn-icon" onClick={load} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
    </>
  );

  return (
    <Layout title="Quản lý Thiết bị" breadcrumb={['ViPower', 'Hệ thống', 'Thiết bị']} topbarRight={topbarRight}>
      <div className="kpi-strip">
        {(['all', 'active', 'offline', 'error', 'inactive'] as StatusFilter[]).map(s => (
          <div key={s} className={`kpi-cell${statusFilter === s ? ' active' : ''}`}
            style={{ ['--kpi-c' as string]: s === 'active' ? 'var(--green)' : s === 'offline' || s === 'error' ? 'var(--red)' : 'var(--text-primary)' }}
            onClick={() => setStatusFilter(s)}>
            <div className="kpi-cell-label">{s === 'all' ? 'Tổng thiết bị' : STATUS_MAP[s]?.label || s}</div>
            <div className="kpi-cell-val">{counts[s as keyof typeof counts] ?? '--'}</div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" />
          <input className="search-input" type="search" placeholder="Tìm thiết bị..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-hdd-network" />Danh sách thiết bị</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} thiết bị</span>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><i className="bi bi-hdd" />Không có thiết bị nào.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mã thiết bị</th>
                  <th>Tên</th>
                  <th>Vị trí</th>
                  <th>Loại</th>
                  <th>Chu kỳ (s)</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => {
                  const s = STATUS_MAP[d.status] || STATUS_MAP.inactive;
                  return (
                    <tr key={d._id}>
                      <td className="td-mono">{d.deviceid}</td>
                      <td style={{ fontWeight: 500 }}>{d.deviceName}</td>
                      <td className="td-muted">{d.location || '--'}</td>
                      <td className="td-muted">{d.deviceType || '--'}</td>
                      <td className="td-mono td-muted">{d.samplingCycle || 60}</td>
                      <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13 }} onClick={() => openEdit(d)} title="Sửa">
                            <i className="bi bi-pencil" />
                          </button>
                          <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13, color: 'var(--red)' }} onClick={() => setConfirmDelete(d)} title="Xóa">
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modal === 'add' ? 'Thêm thiết bị' : 'Sửa thiết bị'}</div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body">
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Mã thiết bị *</label>
                  <input className="form-input" value={form.deviceid} onChange={e => setForm(f => ({ ...f, deviceid: e.target.value }))} disabled={modal === 'edit'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tên thiết bị *</label>
                  <input className="form-input" value={form.deviceName} onChange={e => setForm(f => ({ ...f, deviceName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Vị trí</label>
                  <input className="form-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Loại thiết bị</label>
                  <input className="form-input" value={form.deviceType} onChange={e => setForm(f => ({ ...f, deviceType: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Chu kỳ lấy mẫu (giây)</label>
                  <input className="form-input" type="number" min={10} value={form.samplingCycle} onChange={e => setForm(f => ({ ...f, samplingCycle: +e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Tắt</option>
                    <option value="paused">Dừng</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setModal(null)}>Hủy</button>
              <button className="btn-modal-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
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
                Xóa thiết bị <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.deviceName}</strong> ({confirmDelete.deviceid})?
                Thao tác này không thể hoàn tác.
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

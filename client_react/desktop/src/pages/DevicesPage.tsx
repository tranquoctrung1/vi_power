import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import Pager from '../components/Pager';
import { exportCSV } from '../utils/exportCSV';

interface Device {
  _id: string;
  deviceid: string;
  deviceName: string;
  location?: string;
  deviceType?: string;
  status: string;
  samplingCycle?: number;
  displaygroupid?: string;
  isOnline?: boolean;
  coordX?: number;
  coordY?: number;
  alertDelayCycles?: number;
}

interface DisplayGroup {
  _id: string;
  displaygrouid: string;
  name?: string;
  groupName?: string;
  note?: string;
}

interface LatestDataEntry {
  channel: string;
  value?: number;
  basemin?: number | null;
  basemax?: number | null;
  timestamp?: string;
}

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  active:   { cls: 'badge-active',   label: 'Hoạt động' },
  offline:  { cls: 'badge-offline',  label: 'Offline' },
  error:    { cls: 'badge-error',    label: 'Lỗi' },
  inactive: { cls: 'badge-inactive', label: 'Tắt' },
  paused:   { cls: 'badge-paused',   label: 'Dừng' },
};

// Display labels for every channel LatestDataModel.CHANNELS persists in DB (server/src/models/LatestData.js).
// Unknown/future channels fall back to the raw channel name.
const CHANNEL_LABELS: Record<string, string> = {
  currentI1: 'Dòng I1 (currentI1)',
  currentI2: 'Dòng I2 (currentI2)',
  currentI3: 'Dòng I3 (currentI3)',
  voltageV1N: 'Điện áp V1N',
  voltageV2N: 'Điện áp V2N',
  voltageV3N: 'Điện áp V3N',
  voltageV12: 'Điện áp V12',
  voltageV23: 'Điện áp V23',
  voltageV31: 'Điện áp V31',
  power: 'Công suất (power)',
  netpower: 'Công suất thực (netpower)',
  per: 'Hệ số PF (per)',
  kw1: 'Công suất P1 (kw1)',
  kw2: 'Công suất P2 (kw2)',
  kw3: 'Công suất P3 (kw3)',
  totalKva: 'Công suất biểu kiến (totalKva)',
  totalKvar: 'Công suất phản kháng (totalKvar)',
  freq: 'Tần số (freq)',
  kvah: 'Điện năng biểu kiến (kvah)',
  kvarh: 'Điện năng phản kháng (kvarh)',
};
function channelLabel(ch: string): string { return CHANNEL_LABELS[ch] || ch; }

const EMPTY_FORM = { deviceid: '', deviceName: '', location: '', deviceType: 'Lorawan năng lượng', samplingCycle: 60, status: 'inactive', displaygroupid: '', coordX: '', coordY: '', alertDelayCycles: '' };

const PALETTE = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b', '#ff7043'];

export default function DevicesPage() {
  useAuth();
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DisplayGroup[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortCol, setSortCol] = useState('deviceid');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Device form modal
  const [modal, setModal] = useState<'add' | 'edit' | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Device | null>(null);

  // Threshold modal
  const [threshDev, setThreshDev] = useState<Device | null>(null);
  const [threshChannel, setThreshChannel] = useState('currentI1');
  const [threshLatest, setThreshLatest] = useState<LatestDataEntry[]>([]);
  const [threshBasemin, setThreshBasemin] = useState('');
  const [threshBasemax, setThreshBasemax] = useState('');
  const [threshSaving, setThreshSaving] = useState(false);

  // Group management modal
  const [groupModal, setGroupModal] = useState(false);
  const [gForm, setGForm] = useState({ name: '', note: '' });
  const [gEditId, setGEditId] = useState('');
  const [gSaving, setGSaving] = useState(false);

  useEffect(() => { load(); loadGroups(); }, []);
  useEffect(() => { setPage(1); }, [search, statusFilter, groupFilter, typeFilter, sortCol, sortDir]);

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

  async function loadGroups() {
    try {
      const res = await apiGet('/display-groups?limit=1000');
      const json = await res.json();
      const raw = json.data?.data || json.data || [];
      setGroups(raw);
    } catch {}
  }

  function groupName(gid?: string): string {
    if (!gid) return '--';
    const g = groups.find(g => g.displaygrouid === gid || g._id === gid);
    return g ? (g.groupName || g.name || gid) : gid;
  }

  // ── Device CRUD ───────────────────────────────────────────────
  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setEditId('');
    setModal('add');
  }

  function openEdit(d: Device) {
    const cx = d.coordX ?? (d as any).coordinates?.x;
    const cy = d.coordY ?? (d as any).coordinates?.y;
    setForm({ deviceid: d.deviceid, deviceName: d.deviceName || '', location: d.location || '', deviceType: d.deviceType || 'Lorawan năng lượng', samplingCycle: d.samplingCycle || 60, status: d.status || 'inactive', displaygroupid: d.displaygroupid || '', coordX: cx != null ? String(cx) : '', coordY: cy != null ? String(cy) : '', alertDelayCycles: d.alertDelayCycles != null ? String(d.alertDelayCycles) : '' });
    setEditId(d._id);
    setModal('edit');
  }

  async function handleSave() {
    if (!form.deviceid || !form.deviceName) { showToast('Vui lòng điền đầy đủ thông tin', 'warn'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        displaygroupid: form.displaygroupid || undefined,
        coordX: form.coordX !== '' ? parseFloat(form.coordX as string) : undefined,
        coordY: form.coordY !== '' ? parseFloat(form.coordY as string) : undefined,
        alertDelayCycles: form.alertDelayCycles !== '' ? parseInt(form.alertDelayCycles as string) : undefined,
      };
      if (modal === 'add') {
        const res = await apiPost('/devices', payload);
        const json = await res.json();
        if (json.success || json.data) { showToast('Thêm thiết bị thành công', 'ok'); setModal(null); load(); }
        else showToast(json.message || 'Lỗi thêm thiết bị', 'error');
      } else {
        const res = await apiPut(`/devices/${editId}`, payload);
        const json = await res.json();
        if (json.success || json.data) { showToast('Cập nhật thành công', 'ok'); setModal(null); load(); }
        else showToast(json.message || 'Lỗi cập nhật', 'error');
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
      if (json.success) { showToast('Đã xóa thiết bị', 'ok'); setConfirmDelete(null); load(); }
      else showToast(json.message || 'Lỗi xóa', 'error');
    } catch {
      showToast('Lỗi kết nối', 'error');
    }
  }

  // ── Threshold modal ───────────────────────────────────────────
  async function openThreshold(dev: Device) {
    setThreshDev(dev);
    setThreshChannel('currentI1');
    setThreshBasemin('');
    setThreshBasemax('');
    setThreshLatest([]);
    try {
      const res = await apiGet(`/latest-data/${dev.deviceid}`);
      const json = await res.json();
      const latest: LatestDataEntry[] = json.success ? (json.data || []) : [];
      setThreshLatest(latest);
      const firstCh = latest.find(e => e.channel === 'currentI1') ? 'currentI1' : (latest[0]?.channel || 'currentI1');
      setThreshChannel(firstCh);
      fillChannelVals(firstCh, latest);
    } catch {}
  }

  function fillChannelVals(channel: string, latest: LatestDataEntry[]) {
    const entry = latest.find(e => e.channel === channel);
    setThreshBasemin(entry && entry.basemin != null ? String(entry.basemin) : '');
    setThreshBasemax(entry && entry.basemax != null ? String(entry.basemax) : '');
  }

  function handleChannelChange(ch: string) {
    setThreshChannel(ch);
    fillChannelVals(ch, threshLatest);
  }

  async function saveThreshold() {
    if (!threshDev) return;
    setThreshSaving(true);
    try {
      const basemin = threshBasemin === '' ? null : parseFloat(threshBasemin);
      const basemax = threshBasemax === '' ? null : parseFloat(threshBasemax);
      const res = await apiPatch(`/latest-data/${threshDev.deviceid}/${threshChannel}/threshold`, { basemin, basemax });
      const json = await res.json();
      if (res.ok || json.success) {
        showToast('Đã cập nhật ngưỡng thành công', 'ok');
        setThreshDev(null);
      } else {
        showToast(json.message || 'Cập nhật thất bại', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    } finally {
      setThreshSaving(false);
    }
  }

  const threshEntry = threshLatest.find(e => e.channel === threshChannel);

  // ── Group management ──────────────────────────────────────────
  function openGroupModal() {
    setGForm({ name: '', note: '' });
    setGEditId('');
    setGroupModal(true);
  }

  async function saveGroup() {
    if (!gForm.name.trim()) { showToast('Tên khu vực không được để trống', 'warn'); return; }
    setGSaving(true);
    try {
      let res;
      if (gEditId) {
        res = await apiPut(`/display-groups/${gEditId}`, { name: gForm.name.trim(), note: gForm.note.trim() });
      } else {
        const displaygrouid = 'GRP_' + Date.now();
        res = await apiPost('/display-groups', { displaygrouid, name: gForm.name.trim(), note: gForm.note.trim() });
      }
      const json = await res.json();
      if (res.ok || json.success) {
        showToast(gEditId ? 'Đã cập nhật khu vực' : 'Đã thêm khu vực mới', 'ok');
        setGForm({ name: '', note: '' }); setGEditId('');
        loadGroups();
      } else {
        showToast(json.message || 'Lỗi lưu', 'error');
      }
    } catch { showToast('Lỗi kết nối', 'error'); } finally { setGSaving(false); }
  }

  async function deleteGroup(g: DisplayGroup) {
    try {
      const res = await apiDelete(`/display-groups/${g._id}`);
      const json = await res.json();
      if (res.ok || json.success) { showToast(`Đã xóa khu vực "${g.name || g.groupName}"`, 'ok'); loadGroups(); }
      else showToast(json.message || 'Lỗi xóa', 'error');
    } catch { showToast('Lỗi kết nối', 'error'); }
  }

  // ── Export ────────────────────────────────────────────────────
  function handleExport() {
    exportCSV('devices', ['Mã thiết bị', 'Tên', 'Vị trí', 'Loại', 'Khu vực', 'Chu kỳ (s)', 'Trạng thái'],
      filtered.map(d => [d.deviceid, d.deviceName, d.location || '', d.deviceType || '', groupName(d.displaygroupid), d.samplingCycle || 60, STATUS_MAP[d.status]?.label || d.status]));
    showToast(`Đã xuất ${filtered.length} thiết bị`, 'ok');
  }

  // ── Filtering ─────────────────────────────────────────────────
  const filtered = devices.filter(d => {
    if (statusFilter === 'online') { if (!d.isOnline) return false; }
    else if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (typeFilter !== 'all' && (d.deviceType || '') !== typeFilter) return false;
    if (groupFilter !== 'all') {
      if (groupFilter === '__none') { if (d.displaygroupid) return false; }
      else if (d.displaygroupid !== groupFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (d.deviceName || '').toLowerCase().includes(q) ||
             (d.deviceid || '').toLowerCase().includes(q) ||
             (d.location || '').toLowerCase().includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const va = (a as any)[sortCol] ?? '';
    const vb = (b as any)[sortCol] ?? '';
    const cmp = typeof va === 'string' ? va.localeCompare(vb) : (va as number) - (vb as number);
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const topbarRight = (
    <>
      <button className="btn-primary" onClick={openAdd}><i className="bi bi-plus-lg" />Thêm thiết bị</button>
      <button className="btn-primary desktop-only" onClick={handleExport} disabled={!filtered.length}><i className="bi bi-file-earmark-excel" />Xuất Excel</button>
      <button className="btn-icon" onClick={load} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
    </>
  );

  return (
    <Layout title="Quản lý Thiết bị" breadcrumb={['ViPower', 'Hệ thống', 'Thiết bị']} topbarRight={topbarRight}>
      <div className="kpi-strip">
        {[
          { key: 'all',      label: 'Tổng thiết bị',      sub: 'Toàn hệ thống',    color: 'var(--text-primary)', count: devices.length },
          { key: 'active',   label: 'Đang hoạt động',     sub: 'Status: active',   color: 'var(--green)',        count: devices.filter(d => d.status === 'active').length },
          { key: 'inactive', label: 'Không hoạt động',    sub: 'Status: inactive', color: 'var(--text-muted)',   count: devices.filter(d => d.status === 'inactive').length },
          { key: 'paused',   label: 'Dừng hoạt động',     sub: 'Status: paused',   color: 'var(--yellow)',       count: devices.filter(d => d.status === 'paused').length },
          { key: 'online',   label: 'Đang online',         sub: 'isOnline = true',  color: 'var(--accent)',       count: devices.filter(d => d.isOnline).length },
        ].map(s => (
          <div key={s.key} className={`kpi-cell${statusFilter === s.key ? ' active' : ''}`}
            style={{ ['--kpi-c' as string]: s.color }}
            onClick={() => setStatusFilter(s.key)}>
            <div className="kpi-cell-label">{s.label}</div>
            <div className="kpi-cell-val">{s.count}</div>
            <div className="kpi-cell-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" />
          <input className="search-input" type="search" placeholder="Tìm ID, tên, vị trí..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={groupFilter} onChange={e => setGroupFilter(e.target.value)}>
          <option value="all">Tất cả khu vực</option>
          {groups.map(g => (
            <option key={g._id} value={g.displaygrouid || g._id}>{g.groupName || g.name}</option>
          ))}
          <option value="__none">Chưa phân nhóm</option>
        </select>
        <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">Tất cả loại</option>
          <option value="Lorawan năng lượng">Lorawan năng lượng</option>
        </select>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="inactive">Không hoạt động</option>
          <option value="paused">Dừng hoạt động</option>
          <option value="error">Lỗi</option>
        </select>
        <button className="btn-icon" style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto', width: 'auto', gap: 5 }}
          onClick={() => { setSearch(''); setStatusFilter('all'); setGroupFilter('all'); setTypeFilter('all'); setPage(1); }}>
          <i className="bi bi-x-circle" /> Xóa lọc
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="card-title"><i className="bi bi-hdd-network" />Danh sách thiết bị</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} thiết bị</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select className="filter-select" style={{ width: 'auto' }} value={pageSize}
              onChange={e => { setPageSize(+e.target.value); setPage(1); }}>
              <option value={20}>20 / trang</option>
              <option value={50}>50 / trang</option>
              <option value={100}>100 / trang</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><i className="bi bi-hdd" />Không có thiết bị nào.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {([['deviceid','Mã thiết bị'],['deviceName','Tên'],['deviceType','Loại'],['location','Vị trí'],['displaygroupid','Khu vực'],['samplingCycle','Chu kỳ (s)'],['status','Trạng thái']] as [string,string][]).map(([col,label]) => (
                      <th key={col} onClick={() => { if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortCol(col);setSortDir('asc');} setPage(1); }}
                        style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                        {label}{sortCol===col?(sortDir==='asc'?' ▲':' ▼'):' ⇅'}
                      </th>
                    ))}
                    <th>Online</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(d => {
                    const s = STATUS_MAP[d.status] || STATUS_MAP.inactive;
                    const gi = groups.findIndex(g => g.displaygrouid === d.displaygroupid || g._id === d.displaygroupid);
                    const gColor = gi >= 0 ? PALETTE[gi % PALETTE.length] : 'var(--text-dim)';
                    return (
                      <tr key={d._id}>
                        <td className="td-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{d.deviceid}</td>
                        <td style={{ fontWeight: 500 }}>{d.deviceName}</td>
                        <td>{d.deviceType
                          ? <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{d.deviceType}</span>
                          : <span className="td-muted">--</span>}</td>
                        <td className="td-muted">{d.location || '--'}</td>
                        <td>
                          {d.displaygroupid ? (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: gColor + '22', color: gColor, fontWeight: 600 }}>
                              {groupName(d.displaygroupid)}
                            </span>
                          ) : <span className="td-muted">--</span>}
                        </td>
                        <td className="td-mono td-muted">{d.samplingCycle || 60}</td>
                        <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                        <td style={{ textAlign: 'center' }}>
                          {d.isOnline != null
                            ? <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: d.isOnline ? 'var(--green)' : 'var(--text-dim)', boxShadow: d.isOnline ? '0 0 5px var(--green)' : 'none' }} title={d.isOnline ? 'Online' : 'Offline'} />
                            : <span className="td-muted">--</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13 }} onClick={() => openEdit(d)} title="Sửa">
                              <i className="bi bi-pencil" />
                            </button>
                            <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 13, color: 'var(--yellow)' }} onClick={() => openThreshold(d)} title="Ngưỡng cảnh báo">
                              <i className="bi bi-sliders" />
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
            <Pager total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      {/* Add/Edit modal */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="bi bi-hdd-network" style={{ color: 'var(--accent)' }} />
                {modal === 'add' ? 'Thêm thiết bị' : 'Sửa thiết bị'}
              </div>
              <button className="modal-close" onClick={() => setModal(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                <i className="bi bi-info-circle" /> Thông tin cơ bản
              </div>
              <div className="grid-2" style={{ gap: 12, marginBottom: 0 }}>
                <div className="form-group">
                  <label className="form-label">Mã thiết bị *</label>
                  <input className="form-input" placeholder="VD: TB-01" value={form.deviceid}
                    onChange={e => setForm(f => ({ ...f, deviceid: e.target.value }))} disabled={modal === 'edit'} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tên thiết bị *</label>
                  <input className="form-input" placeholder="VD: Trạm Bơm 1" value={form.deviceName}
                    onChange={e => setForm(f => ({ ...f, deviceName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Khu vực / Nhóm</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="form-select" style={{ flex: 1 }} value={form.displaygroupid}
                      onChange={e => setForm(f => ({ ...f, displaygroupid: e.target.value }))}>
                      <option value="">-- Chọn khu vực --</option>
                      {groups.map(g => (
                        <option key={g._id} value={g.displaygrouid || g._id}>{g.groupName || g.name}</option>
                      ))}
                    </select>
                    <button type="button" className="btn-icon" style={{ flexShrink: 0 }} onClick={() => { setModal(null); openGroupModal(); }} title="Quản lý khu vực">
                      <i className="bi bi-gear" />
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Vị trí</label>
                  <input className="form-input" placeholder="VD: Nhà máy A, Tầng 2" value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Không hoạt động</option>
                    <option value="paused">Dừng hoạt động</option>
                  </select>
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                <i className="bi bi-sliders" /> Cấu hình
              </div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Chu kỳ lấy mẫu (giây)</label>
                  <input className="form-input" type="number" min={1} max={3600} placeholder="60" value={form.samplingCycle}
                    onChange={e => setForm(f => ({ ...f, samplingCycle: +e.target.value }))} />
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>Mặc định: 60 giây</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Tọa độ X</label>
                  <input className="form-input" type="number" step="0.01" placeholder="0"
                    value={form.coordX as string} onChange={e => setForm(f => ({ ...f, coordX: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tọa độ Y</label>
                  <input className="form-input" type="number" step="0.01" placeholder="0"
                    value={form.coordY as string} onChange={e => setForm(f => ({ ...f, coordY: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Số chu kỳ báo trễ</label>
                  <input className="form-input" type="number" min={1} max={9999} placeholder="1"
                    value={form.alertDelayCycles as string} onChange={e => setForm(f => ({ ...f, alertDelayCycles: e.target.value }))} />
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>Số chu kỳ bỏ qua trước khi tạo cảnh báo</span>
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

      {/* Threshold modal */}
      {threshDev && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setThreshDev(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title">
                Ngưỡng cảnh báo — <span style={{ color: 'var(--accent)' }}>{threshDev.deviceName || threshDev.deviceid}</span>
              </div>
              <button className="modal-close" onClick={() => setThreshDev(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Kênh</label>
                <select className="form-select" value={threshChannel} onChange={e => handleChannelChange(e.target.value)}>
                  {threshLatest.length === 0
                    ? <option value={threshChannel}>{channelLabel(threshChannel)}</option>
                    : threshLatest.map(e => <option key={e.channel} value={e.channel}>{channelLabel(e.channel)}</option>)}
                </select>
              </div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Ngưỡng dưới (basemin)</label>
                  <input className="form-input" type="number" step="any" placeholder="—"
                    value={threshBasemin} onChange={e => setThreshBasemin(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Ngưỡng trên (basemax)</label>
                  <input className="form-input" type="number" step="any" placeholder="—"
                    value={threshBasemax} onChange={e => setThreshBasemax(e.target.value)} />
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                {threshEntry?.value != null
                  ? `Giá trị hiện tại: ${threshEntry.value} · Cập nhật: ${threshEntry.timestamp ? new Date(threshEntry.timestamp).toLocaleString('vi-VN') : '--'}`
                  : 'Chưa có dữ liệu cho kênh này.'}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setThreshDev(null)}>Huỷ</button>
              <button className="btn-modal-primary" onClick={saveThreshold} disabled={threshSaving}>
                {threshSaving ? <><i className="bi bi-arrow-clockwise" /> Đang lưu...</> : 'Cập nhật'}
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
              <i className="bi bi-trash3" style={{ fontSize: 32, color: 'var(--red)', marginBottom: 10, display: 'block' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Xóa thiết bị <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete.deviceName}</strong> ({confirmDelete.deviceid})?
                <br />Thao tác này không thể hoàn tác.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setConfirmDelete(null)}>Hủy</button>
              <button className="btn-modal-primary" style={{ background: 'var(--red)' }} onClick={() => handleDelete(confirmDelete)}>
                <i className="bi bi-trash3" /> Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group management modal */}
      {groupModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setGroupModal(false)}>
          <div className="modal" style={{ maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div className="modal-title"><i className="bi bi-collection" style={{ color: 'var(--accent)' }} /> Quản lý Khu vực / Nhóm</div>
              <button className="modal-close" onClick={() => setGroupModal(false)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Add/Edit form */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {gEditId ? 'Sửa khu vực' : 'Thêm khu vực mới'}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label className="form-label">Tên khu vực *</label>
                    <input className="form-input" placeholder="VD: Khu A, Nhà máy 1..."
                      value={gForm.name} onChange={e => setGForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label className="form-label">Ghi chú</label>
                    <input className="form-input" placeholder="Tuỳ chọn..."
                      value={gForm.note} onChange={e => setGForm(f => ({ ...f, note: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-modal-primary" style={{ fontSize: 12, padding: '6px 16px' }} onClick={saveGroup} disabled={gSaving}>
                    <i className={`bi ${gEditId ? 'bi-check-lg' : 'bi-plus-lg'}`} />
                    {gEditId ? 'Cập nhật' : 'Thêm'}
                  </button>
                  {gEditId && (
                    <button className="btn-modal-ghost" style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => { setGForm({ name: '', note: '' }); setGEditId(''); }}>
                      Hủy sửa
                    </button>
                  )}
                </div>
              </div>
              {/* Group list */}
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Danh sách khu vực
                </div>
                {groups.length === 0 ? (
                  <div style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 20 }}>Chưa có khu vực nào</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {groups.map((g, i) => (
                      <div key={g._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 7, border: '1px solid var(--border)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{g.groupName || g.name}</div>
                          {g.note && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.note}</div>}
                        </div>
                        <button className="btn-icon" style={{ width: 26, height: 26, fontSize: 12 }}
                          onClick={() => { setGForm({ name: g.groupName || g.name || '', note: g.note || '' }); setGEditId(g._id); }}
                          title="Sửa"><i className="bi bi-pencil" /></button>
                        <button className="btn-icon" style={{ width: 26, height: 26, fontSize: 12, color: 'var(--red)' }}
                          onClick={() => deleteGroup(g)} title="Xóa"><i className="bi bi-trash" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';
import { useWS } from '../contexts/WSContext';
import { apiGet, apiPatch } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { WS_URL } from '../config';
import Pager from '../components/Pager';
import { exportCSV } from '../utils/exportCSV';
import { Chart, registerables } from 'chart.js';
import '../utils/chartDefaults';

interface Alert {
  _id: string;
  deviceid: string;
  message: string;
  severity: 'critical' | 'warning' | 'info' | 'ok' | 'red' | 'orange' | 'green';
  createdAt?: string;
  timestamp?: string;
  resolved?: boolean;
  isComplete?: boolean;
  value?: number;
  basemax?: number;
  basemin?: number;
  alertType?: string;
  area?: string;
}

interface Device {
  deviceid: string;
  deviceName?: string;
  displaygroupid?: string;
  displaygrouid?: string;
}

interface Group {
  _id: string;
  displaygrouid?: string;
  displaygroupid?: string;
  groupName?: string;
  name?: string;
}

type FilterSev = 'all' | 'unresolved' | 'critical' | 'warning' | 'info';
type FilterStatus = 'all' | 'new' | 'seen' | 'resolved';

const SEV_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  critical: { icon: 'bi-x-octagon-fill',            color: '#f44b4b', label: 'Critical' },
  red:      { icon: 'bi-x-octagon-fill',            color: '#f44b4b', label: 'Critical' },
  warning:  { icon: 'bi-exclamation-triangle-fill', color: '#f5a623', label: 'Warning'  },
  orange:   { icon: 'bi-exclamation-triangle-fill', color: '#f5a623', label: 'Warning'  },
  info:     { icon: 'bi-info-circle-fill',           color: '#38aaff', label: 'Info'     },
  ok:       { icon: 'bi-check-circle-fill',          color: '#22d369', label: 'OK'       },
  green:    { icon: 'bi-check-circle-fill',          color: '#22d369', label: 'OK'       },
};

const AREA_PALETTE = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b'];
const TYPE_OPTIONS = ['Áp suất', 'Nhiệt độ', 'Điện áp', 'Dòng điện', 'Kết nối', 'Hiệu suất'];

function fmtAlertTime(ts?: string): string {
  if (!ts) return '--';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${hh}:${mm} ${dd}-${mo}`;
}

function relTime(ts?: string): string {
  if (!ts) return '--';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s trước`;
  if (s < 3600) return `${Math.floor(s / 60)}p trước`;
  if (s < 86400) return `${Math.floor(s / 3600)}h trước`;
  return `${Math.floor(s / 86400)}d trước`;
}

function fmtFull(ts?: string): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const PAGE_SIZE = 10;

const todayISO = new Date().toISOString().slice(0, 10);
const ago30ISO = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

export default function AlertsPage() {
  useAuth();
  const { showToast } = useToast();
  const { subscribe } = useWS();
  const storeUser = useAuthStore(s => s.user);

  function filterGroupsByPermission(grps: Group[]): Group[] {
    if (!storeUser || storeUser.role === 'Admin') return grps;
    const allowed = storeUser.allowedAreas || [];
    if (allowed.length === 0) return [];
    return grps.filter(g => allowed.includes(g.displaygrouid || ''));
  }

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, Device>>({});
  const [filter, setFilter] = useState<FilterSev>('all');
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [filterArea, setFilterArea] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [dateFrom, setDateFrom] = useState(ago30ISO);
  const [dateTo, setDateTo] = useState(todayISO);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortCol, setSortCol] = useState<string>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailAlert, setDetailAlert] = useState<Alert | null>(null);
  const [noteText, setNoteText] = useState('');
  const [seenSet, setSeenSet] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInst = useRef<Chart | null>(null);

  useEffect(() => {
    loadAll();
    const u = subscribe('mqtt_data', (d: unknown) => {
      const msg = d as { alert?: unknown };
      if (msg?.alert) loadAlerts();
    });
    return () => { u(); chartInst.current?.destroy(); };
  }, []);

  useEffect(() => { setPage(1); setSelected(new Set()); }, [filter, search, deviceFilter, filterArea, filterType, filterStatus, dateFrom, dateTo, pageSize]);
  useEffect(() => { loadAlerts(dateFrom, dateTo); }, [dateFrom, dateTo]);

  useEffect(() => {
    if (alerts.length > 0) buildTimelineChart();
  }, [alerts, dateFrom, dateTo]);

  async function loadAll(from = dateFrom, to = dateTo) {
    setLoading(true);
    await Promise.all([loadDevices(), loadAlerts(from, to)]);
    setLoading(false);
  }

  async function loadDevices() {
    try {
      const [devRes, grpRes] = await Promise.allSettled([
        apiGet('/devices?limit=1000'),
        apiGet('/display-groups?limit=500'),
      ]);
      let devs: Device[] = [];
      if (devRes.status === 'fulfilled') {
        const json = await devRes.value.json();
        devs = json.data || json.devices || [];
        setDevices(devs);
        const map: Record<string, Device> = {};
        devs.forEach(d => { map[d.deviceid] = d; });
        setDeviceMap(map);
      }
      if (grpRes.status === 'fulfilled') {
        const json = await grpRes.value.json();
        setGroups(filterGroupsByPermission(json.data || json.groups || []));
      }
    } catch {}
  }

  async function loadAlerts(from?: string, to?: string) {
    try {
      const params = new URLSearchParams({ limit: '2000', sortOrder: 'desc' });
      if (from) params.set('startDate', new Date(from).toISOString());
      if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); params.set('endDate', d.toISOString()); }
      const res = await apiGet(`/alerts?${params}`);
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
        if (detailAlert?._id === id) setDetailAlert(a => a ? { ...a, isComplete: true, resolved: true } : null);
        showToast('Đã xử lý cảnh báo', 'ok');
      } else showToast(json.message || 'Lỗi xử lý', 'error');
    } catch { showToast('Lỗi kết nối', 'error'); }
  }

  async function bulkResolve() {
    const ids = [...selected].filter(id => {
      const a = alerts.find(x => x._id === id);
      return a && !a.resolved && !a.isComplete;
    });
    if (!ids.length) { showToast('Không có cảnh báo nào cần xử lý', 'warn'); return; }
    await Promise.all(ids.map(id =>
      apiPatch(`/alerts/${id}/resolve`).then(r => r.json()).then(j => {
        if (j.success) setAlerts(prev => prev.map(a => a._id === id ? { ...a, isComplete: true, resolved: true } : a));
      }).catch(() => {})
    ));
    setSelected(new Set());
    showToast(`Đã xử lý ${ids.length} cảnh báo`, 'ok');
  }

  function markSeen(ids: string[]) {
    setSeenSet(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
  }

  function markAllSeen() {
    const ids = filtered.map(a => a._id);
    markSeen(ids);
    showToast(`Đã đánh dấu ${ids.length} cảnh báo đã xem`, 'ok');
  }


  function buildTimelineChart() {
    const canvas = chartRef.current;
    if (!canvas) return;
const fromDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 29 * 86400000);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = dateTo ? new Date(dateTo) : new Date();
    toDate.setHours(23, 59, 59, 999);
    const days = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
    const labels: string[] = [];
    const dataCrit: number[] = [], dataWarn: number[] = [], dataOk: number[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(fromDate); d.setDate(d.getDate() + i);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const da = alerts.filter(a => {
        const t = new Date(a.timestamp || a.createdAt || '').getTime();
        return t >= d.getTime() && t < next.getTime();
      });
      const label = `${d.getDate()}/${d.getMonth() + 1}`;
      labels.push(label);
      const crit = da.filter(a => a.severity === 'critical' || a.severity === 'red').length;
      const warn = da.filter(a => a.severity === 'warning'  || a.severity === 'orange').length;
      const ok   = da.filter(a => a.severity === 'info' || a.severity === 'ok' || a.severity === 'green').length;
dataCrit.push(crit);
      dataWarn.push(warn);
      dataOk.push(ok);
    }
    if (chartInst.current) {
      chartInst.current.data.labels = labels;
      chartInst.current.data.datasets[0].data = dataCrit;
      chartInst.current.data.datasets[1].data = dataWarn;
      chartInst.current.data.datasets[2].data = dataOk;
      chartInst.current.update();
      return;
    }
    chartInst.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Critical', data: dataCrit, backgroundColor: 'rgba(244,75,75,0.75)', borderRadius: 2, stack: 'A' },
          { label: 'Warning',  data: dataWarn, backgroundColor: 'rgba(255,112,67,0.65)', borderRadius: 2, stack: 'A' },
          { label: 'OK/Info',  data: dataOk,  backgroundColor: 'rgba(34,211,105,0.55)', borderRadius: 2, stack: 'A' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#3a506b', font: { size: 9 }, maxTicksLimit: 10 }, stacked: true },
          y: { grid: { color: 'rgba(56,139,253,0.06)' }, ticks: { color: '#607b99', font: { size: 10 } }, stacked: true, beginAtZero: true },
        },
      },
    });
  }

  // Distribution by device
  const devCounts: { deviceid: string; name: string; count: number }[] = [];
  const countMap: Record<string, number> = {};
  alerts.forEach(a => { countMap[a.deviceid] = (countMap[a.deviceid] || 0) + 1; });
  Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([devid, cnt]) => {
    devCounts.push({ deviceid: devid, name: deviceMap[devid]?.deviceName || devid, count: cnt });
  });
  const maxDevCount = devCounts[0]?.count || 1;

  // Today's stats for KPI
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayAlerts = alerts.filter(a => new Date(a.timestamp || a.createdAt || '').getTime() >= todayStart.getTime());
  const todayCount   = todayAlerts.length;
  const todayCrit    = todayAlerts.filter(a => a.severity === 'critical' || a.severity === 'red').length;
  const todayWarn    = todayAlerts.filter(a => a.severity === 'warning'  || a.severity === 'orange').length;

  // Filtering
  const filtered = alerts.filter(a => {
    const isResolved = a.resolved || a.isComplete;
    const isSeen = seenSet.has(a._id);
    if (filter === 'unresolved' && isResolved) return false;
    if (filter === 'critical' && a.severity !== 'critical' && a.severity !== 'red') return false;
    if (filter === 'warning'  && a.severity !== 'warning'  && a.severity !== 'orange') return false;
    if (filter === 'info'     && a.severity !== 'info') return false;
    if (filterArea !== 'all') {
      const dev = deviceMap[a.deviceid];
      const devGid = dev?.displaygroupid || dev?.displaygrouid;
      if (devGid !== filterArea) return false;
    }
    if (filterType !== 'all' && a.alertType !== filterType) return false;
    if (filterStatus === 'new' && (isSeen || isResolved)) return false;
    if (filterStatus === 'seen' && (!isSeen || isResolved)) return false;
    if (filterStatus === 'resolved' && !isResolved) return false;
    if (deviceFilter !== 'all' && a.deviceid !== deviceFilter) return false;
    if (dateFrom) {
      const ts = new Date(a.timestamp || a.createdAt || '');
      const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);
      if (ts < from) return false;
    }
    if (dateTo) {
      const ts = new Date(a.timestamp || a.createdAt || '');
      const to = new Date(dateTo); to.setHours(23, 59, 59, 999);
      if (ts > to) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (a.message || '').toLowerCase().includes(q) ||
             (deviceMap[a.deviceid]?.deviceName || a.deviceid || '').toLowerCase().includes(q);
    }
    return true;
  });

  const SEV_ORDER: Record<string, number> = { critical: 3, red: 3, warning: 2, orange: 2, info: 1 };
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'time') {
      cmp = new Date(a.createdAt || a.timestamp || '').getTime() - new Date(b.createdAt || b.timestamp || '').getTime();
    } else if (sortCol === 'device') {
      cmp = (deviceMap[a.deviceid]?.deviceName || a.deviceid || '').localeCompare(deviceMap[b.deviceid]?.deviceName || b.deviceid || '');
    } else if (sortCol === 'area') {
      const ag = deviceMap[a.deviceid]?.displaygroupid || deviceMap[a.deviceid]?.displaygrouid || '';
      const bg = deviceMap[b.deviceid]?.displaygroupid || deviceMap[b.deviceid]?.displaygrouid || '';
      cmp = (groupNameMap[ag] || ag).localeCompare(groupNameMap[bg] || bg);
    } else if (sortCol === 'type') {
      cmp = (a.alertType || '').localeCompare(b.alertType || '');
    } else if (sortCol === 'severity') {
      cmp = (SEV_ORDER[a.severity] || 0) - (SEV_ORDER[b.severity] || 0);
    } else if (sortCol === 'status') {
      cmp = Number(a.resolved || a.isComplete) - Number(b.resolved || b.isComplete);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);
  const pagedIds = paged.map(a => a._id);
  const allPageChecked = pagedIds.length > 0 && pagedIds.every(id => selected.has(id));

  function toggleAll(checked: boolean) {
    setSelected(prev => { const next = new Set(prev); pagedIds.forEach(id => checked ? next.add(id) : next.delete(id)); return next; });
  }
  function toggleOne(id: string) {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  function handleExportCSV() {
    exportCSV('alerts_csv', ['Thời gian', 'Thiết bị', 'Khu vực', 'Loại lỗi', 'Mức độ', 'Nội dung', 'Trạng thái'],
      filtered.map(a => {
        const dev = deviceMap[a.deviceid];
        const gid = dev?.displaygroupid || dev?.displaygrouid;
        return [
          fmtFull(a.createdAt || a.timestamp),
          dev?.deviceName || a.deviceid,
          gid ? groupNameMap[gid] || gid : '--',
          a.alertType || '--',
          SEV_CONFIG[a.severity]?.label || a.severity,
          a.message,
          (a.resolved || a.isComplete) ? 'Đã xử lý' : seenSet.has(a._id) ? 'Đã xem' : 'Mới',
        ];
      }));
    showToast(`Đã xuất ${filtered.length} cảnh báo`, 'ok');
  }

  function handleExportExcel() {
    exportCSV('alerts', ['Thời gian', 'Thiết bị', 'Mức độ', 'Nội dung', 'Trạng thái'],
      filtered.map(a => [
        fmtFull(a.createdAt || a.timestamp),
        deviceMap[a.deviceid]?.deviceName || a.deviceid,
        SEV_CONFIG[a.severity]?.label || a.severity,
        a.message,
        (a.resolved || a.isComplete) ? 'Đã xử lý' : 'Chưa xử lý',
      ]));
    showToast(`Đã xuất ${filtered.length} cảnh báo`, 'ok');
  }

  const groupColorMap: Record<string, string> = {};
  const groupNameMap: Record<string, string> = {};
  groups.forEach((g, i) => {
    const gid = g.displaygroupid || g.displaygrouid || g._id;
    groupColorMap[gid] = AREA_PALETTE[i % AREA_PALETTE.length];
    groupNameMap[gid] = g.groupName || g.name || gid;
  });
  const AREA_OPTIONS = [{ value: 'all', label: 'Tất cả' }, ...groups.map((g, i) => {
    const gid = g.displaygroupid || g.displaygrouid || g._id;
    return { value: gid, label: g.groupName || g.name || gid };
  })];

  const hasActiveFilter = deviceFilter !== 'all' || filterArea !== 'all' || filterType !== 'all' || filterStatus !== 'all' || !!dateFrom || !!dateTo;

  const topbarRight = (
    <>
      <button className="btn-ghost" onClick={markAllSeen}><i className="bi bi-check-all" />Đánh dấu đã xem</button>
      <button className="btn-ghost" onClick={handleExportCSV} disabled={!filtered.length}><i className="bi bi-download" />Xuất CSV</button>
      <button className="btn-primary" onClick={handleExportExcel} disabled={!filtered.length}><i className="bi bi-file-earmark-excel" />Xuất Excel</button>
      <button className="btn-icon" onClick={() => { setLoading(true); loadAlerts(dateFrom, dateTo).then(() => setLoading(false)); }} title="Làm mới">
        <i className="bi bi-arrow-clockwise" />
      </button>
    </>
  );

  return (
    <Layout title="Cảnh báo & Sự kiện" breadcrumb={['ViPower', 'Hệ thống', 'Cảnh báo']} topbarRight={topbarRight}>

      {/* KPI strip — today counts, clickable to filter by severity */}
      <div className="kpi-strip">
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--text-primary)', cursor: 'pointer' }} onClick={() => setFilter('all')}>
          <div className="kpi-cell-label">Tổng hôm nay</div>
          <div className="kpi-cell-val">{todayCount}</div>
          <div className="kpi-cell-sub">Tất cả mức độ</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--red)', cursor: 'pointer' }} onClick={() => setFilter('critical')}>
          <div className="kpi-cell-label">🔴 Critical</div>
          <div className="kpi-cell-val">{todayCrit}</div>
          <div className="kpi-cell-sub">Cần xử lý ngay</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--orange)', cursor: 'pointer' }} onClick={() => setFilter('warning')}>
          <div className="kpi-cell-label">🟠 Warning</div>
          <div className="kpi-cell-val">{todayWarn}</div>
          <div className="kpi-cell-sub">Theo dõi chặt</div>
        </div>
      </div>

      {/* Timeline + Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 14, marginBottom: 14 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-calendar-week" />Biểu đồ số lượng cảnh báo trong 30 ngày gần nhất</span>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['var(--red)', 'Critical'], ['var(--orange)', 'Warning'], ['var(--green)', 'OK']].map(([c, l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{l}
                </div>
              ))}
            </div>
          </div>
          <div className="chart-wrap" style={{ height: 180 }}>
            <canvas ref={chartRef} />
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-pie-chart" />Phân bổ theo thiết bị</span>
          </div>
          {devCounts.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}><i className="bi bi-bar-chart" />Chưa có dữ liệu</div>
          ) : (
            <div className="consumer-list" style={{ padding: '0 4px' }}>
              {devCounts.map((d, i) => (
                <div key={d.deviceid} className="consumer-row">
                  <div className="consumer-rank">{i + 1}</div>
                  <div className="consumer-name">{d.name}</div>
                  <div className="consumer-bar-wrap">
                    <div className="consumer-bar" style={{ width: `${(d.count / maxDevCount) * 100}%`, background: '#f44b4b' }} />
                  </div>
                  <div className="consumer-val" style={{ color: 'var(--red)' }}>{d.count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        <div className="search-box">
          <i className="bi bi-search" />
          <input className="search-input" type="search" placeholder="Tìm nội dung, thiết bị..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <span className="filter-label">Khu vực</span>
        <select className="filter-select" value={filterArea} onChange={e => setFilterArea(e.target.value)}>
          {AREA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="filter-label">Thiết bị</span>
        <select className="filter-select" value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)}>
          <option value="all">Tất cả</option>
          {devices.map(d => <option key={d.deviceid} value={d.deviceid}>{d.deviceid} · {d.deviceName}</option>)}
        </select>
        <span className="filter-label">Loại lỗi</span>
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">Tất cả</option>
          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="filter-label">Trạng thái</span>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)}>
          <option value="all">Tất cả</option>
          <option value="new">Mới</option>
          <option value="seen">Đã xem</option>
          <option value="resolved">Đã xử lý</option>
        </select>
        <span className="filter-label">Từ</span>
        <input type="date" className="filter-select" style={{ padding: '5px 8px', fontSize: 12 }}
          value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <span className="filter-label">Đến</span>
        <input type="date" className="filter-select" style={{ padding: '5px 8px', fontSize: 12 }}
          value={dateTo} onChange={e => setDateTo(e.target.value)} />
        {hasActiveFilter && (
          <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 12px', marginLeft: 'auto' }}
            onClick={() => { setDateFrom(''); setDateTo(''); setDeviceFilter('all'); setFilterArea('all'); setFilterType('all'); setFilterStatus('all'); }}>
            <i className="bi bi-x-circle" /> Xóa lọc
          </button>
        )}
      </div>

      {/* Severity filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {([
          { id: 'all' as FilterSev, label: 'Tất cả' },
          { id: 'unresolved' as FilterSev, label: 'Chưa xử lý' },
          { id: 'critical' as FilterSev, label: 'Critical' },
          { id: 'warning' as FilterSev, label: 'Warning' },
          { id: 'info' as FilterSev, label: 'Thông tin' },
        ]).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: '7px 14px', borderRadius: 7,
              border: `1px solid ${filter === f.id ? 'var(--accent)' : 'var(--border-bright)'}`,
              background: filter === f.id ? 'var(--accent-dim)' : 'var(--bg-elevated)',
              color: filter === f.id ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <i className="bi bi-check2-square" style={{ color: 'var(--accent)', fontSize: 16 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} mục được chọn</span>
          <button className="resolve-btn" style={{ color: 'var(--green)', borderColor: 'rgba(34,211,105,0.4)' }} onClick={bulkResolve}>
            <i className="bi bi-check-circle" /> Đánh dấu đã xử lý
          </button>
          <button className="resolve-btn" onClick={() => { markSeen([...selected]); showToast(`Đã đánh dấu ${selected.size} đã xem`, 'ok'); }}>
            <i className="bi bi-eye" /> Đánh dấu đã xem
          </button>
          <button className="btn-icon" style={{ marginLeft: 'auto', width: 28, height: 28, fontSize: 13 }}
            onClick={() => setSelected(new Set())} title="Bỏ chọn">
            <i className="bi bi-x" />
          </button>
        </div>
      )}

      {/* Alert table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-bell-fill" />Danh sách cảnh báo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} bản ghi</span>
            <select className="filter-select" style={{ fontSize: 12, padding: '3px 8px' }}
              value={pageSize} onChange={e => setPageSize(Number(e.target.value))}>
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}/trang</option>)}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><i className="bi bi-bell-slash" />Không có cảnh báo nào.</div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36, padding: '9px 8px' }}>
                      <input type="checkbox" checked={allPageChecked} onChange={e => toggleAll(e.target.checked)}
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    </th>
                    {(['time','device','area','type'] as const).map((col, i) => {
                      const labels = ['Thời gian','Thiết bị','Khu vực','Loại lỗi'];
                      return (
                        <th key={col} onClick={() => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } setPage(1); }}
                          style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                          {labels[i]}{sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                        </th>
                      );
                    })}
                    <th>Nội dung</th>
                    {(['severity','status'] as const).map((col, i) => {
                      const labels = ['Mức độ','Trạng thái'];
                      return (
                        <th key={col} onClick={() => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } setPage(1); }}
                          style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                          {labels[i]}{sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                        </th>
                      );
                    })}
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(a => {
                    const s = SEV_CONFIG[a.severity] || SEV_CONFIG.info;
                    const resolved = a.resolved || a.isComplete;
                    const isSeen = seenSet.has(a._id);
                    const dev = deviceMap[a.deviceid];
                    const gid = dev?.displaygroupid || dev?.displaygrouid;
                    const areaColor = gid ? groupColorMap[gid] : undefined;
                    const areaName = gid ? (groupNameMap[gid] || gid) : (a.area || '--');
                    return (
                      <tr key={a._id} style={{ opacity: resolved ? 0.6 : 1, cursor: 'pointer' }}
                        onClick={() => { setDetailAlert(a); setNoteText(''); markSeen([a._id]); }}>
                        <td onClick={e => { e.stopPropagation(); toggleOne(a._id); }} style={{ padding: '9px 8px' }}>
                          <input type="checkbox" checked={selected.has(a._id)} onChange={() => toggleOne(a._id)}
                            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                        </td>
                        <td className="td-mono td-muted">{fmtAlertTime(a.createdAt || a.timestamp)}</td>
                        <td>{dev?.deviceName || a.deviceid || '--'}</td>
                        <td style={{ fontSize: 11 }}>
                          {areaColor
                            ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${areaColor}22`, color: areaColor, border: `1px solid ${areaColor}44` }}>{areaName}</span>
                            : <span className="td-muted">{areaName}</span>}
                        </td>
                        <td className="td-muted" style={{ fontSize: 11 }}>{a.alertType || '--'}</td>
                        <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.message || '--'}
                        </td>
                        <td>
                          <span className={`badge badge-${a.severity}`}>
                            <i className={`bi ${s.icon}`} style={{ color: s.color }} />{s.label}
                          </span>
                        </td>
                        <td>
                          {resolved
                            ? <span className="badge badge-ok">Đã xử lý</span>
                            : isSeen
                              ? <span className="badge" style={{ background: 'rgba(96,123,153,0.15)', color: 'var(--text-muted)' }}>Đã xem</span>
                              : <span className="badge badge-offline">Mới</span>}
                        </td>
                        <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                          <button className="resolve-btn" style={{ marginRight: 4 }}
                            onClick={() => { setDetailAlert(a); setNoteText(''); }}>
                            <i className="bi bi-eye" />
                          </button>
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
            <Pager total={filtered.length} page={page} pageSize={pageSize} onChange={setPage} />
          </>
        )}
      </div>

      {/* Alert detail modal */}
      {detailAlert && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDetailAlert(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`badge badge-${detailAlert.severity}`}>
                  <i className={`bi ${SEV_CONFIG[detailAlert.severity]?.icon}`} style={{ color: SEV_CONFIG[detailAlert.severity]?.color }} />
                  {SEV_CONFIG[detailAlert.severity]?.label}
                </span>
                <span className="modal-title">Chi tiết cảnh báo</span>
              </div>
              <button className="modal-close" onClick={() => setDetailAlert(null)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="detail-stat">
                  <div className="detail-stat-label">Thiết bị</div>
                  <div className="detail-stat-val" style={{ fontSize: 14 }}>{deviceMap[detailAlert.deviceid]?.deviceName || detailAlert.deviceid}</div>
                </div>
                <div className="detail-stat">
                  <div className="detail-stat-label">Khu vực</div>
                  <div className="detail-stat-val" style={{ fontSize: 14 }}>
                    {(() => {
                      const dev = deviceMap[detailAlert.deviceid];
                      const gid = dev?.displaygroupid || dev?.displaygrouid;
                      return gid ? (groupNameMap[gid] || gid) : (detailAlert.area || '--');
                    })()}
                  </div>
                </div>
                <div className="detail-stat">
                  <div className="detail-stat-label">Thời gian phát sinh</div>
                  <div className="detail-stat-val" style={{ fontSize: 13 }}>{fmtFull(detailAlert.timestamp || detailAlert.createdAt)}</div>
                </div>
                <div className="detail-stat">
                  <div className="detail-stat-label">Loại lỗi</div>
                  <div className="detail-stat-val" style={{ fontSize: 14 }}>{detailAlert.alertType || '--'}</div>
                </div>
                <div className="detail-stat">
                  <div className="detail-stat-label">Giá trị đo</div>
                  <div className="detail-stat-val" style={{ color: 'var(--red)' }}>{detailAlert.value ?? '--'}</div>
                </div>
                <div className="detail-stat">
                  <div className="detail-stat-label">Ngưỡng cảnh báo</div>
                  <div className="detail-stat-val" style={{ color: 'var(--yellow)' }}>
                    {detailAlert.basemax ?? detailAlert.basemin ?? '--'}
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Nội dung chi tiết</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>{detailAlert.message || '--'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Ghi chú xử lý</div>
                <textarea className="modal-note" placeholder="Nhập ghi chú về cách xử lý..."
                  value={noteText} onChange={e => setNoteText(e.target.value)} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Trạng thái: <strong style={{ color: (detailAlert.resolved || detailAlert.isComplete) ? 'var(--green)' : 'var(--red)' }}>
                  {(detailAlert.resolved || detailAlert.isComplete) ? 'Đã xử lý' : 'Chưa xử lý'}
                </strong>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setDetailAlert(null)}>Đóng</button>
              {!(detailAlert.resolved || detailAlert.isComplete) && (
                <button className="btn-modal-primary" onClick={() => { resolveAlert(detailAlert._id); setDetailAlert(null); }}>
                  <i className="bi bi-check-circle" style={{ marginRight: 5 }} />Đánh dấu đã xử lý
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

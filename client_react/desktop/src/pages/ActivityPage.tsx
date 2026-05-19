import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet, apiDelete } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useAuthStore } from '../stores/authStore';
import Pager from '../components/Pager';
import { exportXLSX } from '../utils/exportXLSX';

interface ActivityLog {
  _id: string;
  username?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  ipAddress?: string;
  timestamp?: string;
  processingTime?: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface UserSummaryItem {
  username: string;
  loginCount: number;
  lastLogin: string | null;
  lastActivity: string | null;
  todayRequests: number;
  totalRequests: number;
  writeCount: number;
  errorCount: number;
  lastIp: string | null;
}

const fmtDT = (dt?: string | null) => dt
  ? new Date(dt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  : '--';

const fmtD = (dt?: string | null) => dt
  ? new Date(dt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '--';


function actionLabel(method: string, endpoint: string): string {
  const e = endpoint.split('?')[0].replace(/\/[a-f0-9]{24}/gi, '/:id');
  const map: [string, string, string][] = [
    ['POST',   '/api/auth/login',                 'Đăng nhập'],
    ['POST',   '/api/auth/logout',                'Đăng xuất'],
    ['POST',   '/api/auth/refresh',               'Làm mới token'],
    ['POST',   '/api/auth/change-password',       'Đổi mật khẩu'],
    ['POST',   '/api/auth/register',              'Tạo người dùng'],
    ['PUT',    '/api/auth/users/:id',             'Sửa người dùng'],
    ['DELETE', '/api/auth/users/:id',             'Xóa người dùng'],
    ['POST',   '/api/devices',                    'Thêm thiết bị'],
    ['PUT',    '/api/devices/:id',                'Sửa thiết bị'],
    ['PATCH',  '/api/devices/:id/status',         'Cập nhật trạng thái thiết bị'],
    ['DELETE', '/api/devices/:id',                'Xóa thiết bị'],
    ['POST',   '/api/alerts',                     'Tạo cảnh báo'],
    ['PUT',    '/api/alerts/:id',                 'Sửa cảnh báo'],
    ['PATCH',  '/api/alerts/:id/resolve',         'Giải quyết cảnh báo'],
    ['DELETE', '/api/alerts/:id',                 'Xóa cảnh báo'],
    ['POST',   '/api/display-groups',             'Tạo khu vực'],
    ['PUT',    '/api/display-groups/:id',         'Sửa khu vực'],
    ['DELETE', '/api/display-groups/:id',         'Xóa khu vực'],
    ['POST',   '/api/api-keys',                   'Tạo API Key'],
    ['PATCH',  '/api/api-keys/:id/revoke',        'Thu hồi API Key'],
    ['PATCH',  '/api/api-keys/:id/activate',      'Kích hoạt API Key'],
    ['DELETE', '/api/api-keys/:id',               'Xóa API Key'],
    ['POST',   '/api/data/energy/:id',            'Ghi dữ liệu năng lượng'],
    ['DELETE', '/api/data/energy/:id/cleanup',    'Xóa dữ liệu cũ'],
    ['GET',    '/api/auth/me',                    'Xem thông tin cá nhân'],
    ['GET',    '/api/auth/users',                 'Xem danh sách người dùng'],
    ['GET',    '/api/devices',                    'Xem danh sách thiết bị'],
    ['GET',    '/api/alerts',                     'Xem danh sách cảnh báo'],
    ['GET',    '/api/logs',                       'Xem nhật ký'],
    ['GET',    '/api/logs/summary',               'Xem tóm tắt hoạt động'],
  ];
  for (const [m, pat, label] of map) {
    if (m === method && e.startsWith(pat.replace('/:id', '').replace('/user/:id/group', '/user'))) {
      return label;
    }
  }
  if (method === 'GET') return 'Xem dữ liệu';
  return `${method} ${e}`;
}

const fmt = (n: number) => Number(n).toLocaleString('vi-VN');

export default function ActivityPage() {
  useAuth();
  const { showToast } = useToast();
  const storeUser = useAuthStore(s => s.user);
  const isAdmin = storeUser?.role === 'Admin';

  const [activeTab, setActiveTab] = useState<'summary' | 'detail'>('summary');

  // Summary state
  const [summaryData, setSummaryData] = useState<UserSummaryItem[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summarySearch, setSummarySearch] = useState('');

  // Detail state
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Sort — summary
  const [sumSortCol, setSumSortCol] = useState<keyof UserSummaryItem>('totalRequests');
  const [sumSortDir, setSumSortDir] = useState<'asc' | 'desc'>('desc');

  // Sort — detail (client-side within current page)
  const [detSortCol, setDetSortCol] = useState('timestamp');
  const [detSortDir, setDetSortDir] = useState<'asc' | 'desc'>('desc');

  // Summary pagination
  const [sumPage, setSumPage] = useState(1);
  const SUM_PAGE_SIZE = 50;

  // Cleanup modal
  const [showCleanup, setShowCleanup] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      loadSummary();
    }
  }, [isAdmin]);

  // ── Summary ──────────────────────────────────────────────────
  async function loadSummary() {
    setSummaryLoading(true);
    try {
      const res = await apiGet('/logs/summary');
      const json = await res.json();
      setSummaryData(json.data || []);
    } catch {
      showToast('Không tải được tóm tắt', 'error');
    } finally {
      setSummaryLoading(false);
    }
  }

  // ── Detail ───────────────────────────────────────────────────
  async function loadLogs(page: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (logSearch)    params.set('username', logSearch);
      if (methodFilter) params.set('method', methodFilter);
      if (statusFilter) params.set('statusType', statusFilter);
      if (filterFrom)   params.set('startDate', filterFrom);
      if (filterTo)     params.set('endDate', filterTo + 'T23:59:59');
      const res = await apiGet(`/logs?${params}`);
      const json = await res.json();
      setLogs(json.data || []);
      if (json.pagination) setPagination(json.pagination);
      setCurrentPage(page);
    } catch {
      showToast('Không tải được nhật ký', 'error');
    } finally {
      setLoading(false);
    }
  }

  function applyFilter() {
    loadLogs(1);
  }

  function resetFilter() {
    setLogSearch(''); setMethodFilter(''); setStatusFilter(''); setFilterFrom(''); setFilterTo('');
    setTimeout(() => loadLogs(1), 0);
  }

  function drillUser(username: string) {
    setLogSearch(username);
    setActiveTab('detail');
    setTimeout(() => loadLogs(1), 0);
  }

  // ── Export ───────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ page: '1', limit: '10000' });
      if (filterFrom) params.set('startDate', filterFrom);
      if (filterTo)   params.set('endDate', filterTo + 'T23:59:59');
      const res = await apiGet(`/logs?${params}`);
      const json = await res.json();
      const rows: ActivityLog[] = json.data || [];
      if (!rows.length) { showToast('Không có dữ liệu để xuất', 'warn'); return; }
      exportXLSX(`NhatKy_ViPower_${new Date().toISOString().slice(0, 10)}`,
        ['Thời gian', 'Người dùng', 'Phương thức', 'Đường dẫn', 'Status', 'IP', 'ms'],
        rows.map(l => [fmtDT(l.timestamp), l.username || '', l.method || '', l.endpoint || '', l.statusCode ?? '', l.ipAddress || '', l.processingTime ?? '']),
        'Nhật ký');
      showToast(`Đã xuất ${rows.length} bản ghi`, 'ok');
    } catch {
      showToast('Lỗi xuất file', 'error');
    } finally {
      setExporting(false);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────
  async function doCleanup() {
    setCleanupLoading(true);
    try {
      const res = await apiDelete('/logs/cleanup?olderThanDays=30');
      const json = await res.json();
      if (res.ok || json.success) {
        showToast(`Đã xóa ${fmt(json.deletedCount || 0)} bản ghi cũ`, 'ok');
        setShowCleanup(false);
        loadSummary();
        loadLogs(1);
      } else {
        showToast(json.message || 'Lỗi dọn log', 'error');
      }
    } catch {
      showToast('Lỗi kết nối', 'error');
    } finally {
      setCleanupLoading(false);
    }
  }

  // ── KPI from summary data ─────────────────────────────────────
  const kpiUsers  = summaryData.length;
  const kpiToday  = summaryData.reduce((s, u) => s + (u.todayRequests || 0), 0);
  const kpiWrites = summaryData.reduce((s, u) => s + (u.writeCount || 0), 0);
  const kpiErrors = summaryData.reduce((s, u) => s + (u.errorCount || 0), 0);
  const kpiLogins = summaryData.reduce((s, u) => s + (u.loginCount || 0), 0);

  const summaryFiltered = summaryData.filter(u =>
    !summarySearch || u.username.toLowerCase().includes(summarySearch.toLowerCase())
  );
  const summaryRows = [...summaryFiltered].sort((a, b) => {
    const va = a[sumSortCol] ?? '';
    const vb = b[sumSortCol] ?? '';
    const cmp = typeof va === 'string' ? (va as string).localeCompare(vb as string) : (va as number) - (vb as number);
    return sumSortDir === 'asc' ? cmp : -cmp;
  }).slice((sumPage - 1) * SUM_PAGE_SIZE, sumPage * SUM_PAGE_SIZE);

  // Detail: sort current page client-side
  const detailSorted = [...logs].sort((a, b) => {
    let va: string | number = '', vb: string | number = '';
    if (detSortCol === 'timestamp')      { va = a.timestamp || ''; vb = b.timestamp || ''; }
    else if (detSortCol === 'username')  { va = a.username || ''; vb = b.username || ''; }
    else if (detSortCol === 'method')    { va = a.method || ''; vb = b.method || ''; }
    else if (detSortCol === 'statusCode'){ va = a.statusCode || 0; vb = b.statusCode || 0; }
    else if (detSortCol === 'processingTime') { va = a.processingTime || 0; vb = b.processingTime || 0; }
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return detSortDir === 'asc' ? cmp : -cmp;
  });

  const topbarRight = (
    <>
      {isAdmin && (
        <button className="btn-ghost" onClick={() => setShowCleanup(true)} title="Xóa log cũ hơn 30 ngày">
          <i className="bi bi-trash3" />Dọn log cũ
        </button>
      )}
      <button className="btn-primary" onClick={handleExport} disabled={exporting}>
        <i className="bi bi-file-earmark-excel" />{exporting ? 'Đang xuất...' : 'Xuất Excel'}
      </button>
      <button className="btn-icon" onClick={() => { loadSummary(); if (activeTab === 'detail') loadLogs(currentPage); }} title="Làm mới">
        <i className="bi bi-arrow-clockwise" />
      </button>
    </>
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
    <Layout title="Nhật ký hoạt động" breadcrumb={['ViPower', 'Hệ thống', 'Nhật ký']} topbarRight={topbarRight}>

      {/* KPI strip */}
      <div className="kpi-strip" style={{ marginBottom: 14 }}>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--accent)' }}>
          <div className="kpi-cell-label">Tổng người dùng</div>
          <div className="kpi-cell-val">{summaryLoading ? '--' : fmt(kpiUsers)}</div>
          <div className="kpi-cell-sub">Đã ghi nhận</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--green)' }}>
          <div className="kpi-cell-label">Hoạt động hôm nay</div>
          <div className="kpi-cell-val">{summaryLoading ? '--' : fmt(kpiToday)}</div>
          <div className="kpi-cell-sub">Yêu cầu</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--yellow)' }}>
          <div className="kpi-cell-label">Thao tác ghi</div>
          <div className="kpi-cell-val">{summaryLoading ? '--' : fmt(kpiWrites)}</div>
          <div className="kpi-cell-sub">POST/PUT/DELETE</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--red)' }}>
          <div className="kpi-cell-label">Lỗi</div>
          <div className="kpi-cell-val">{summaryLoading ? '--' : fmt(kpiErrors)}</div>
          <div className="kpi-cell-sub">4xx / 5xx</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: '#a855f7' }}>
          <div className="kpi-cell-label">Tổng đăng nhập</div>
          <div className="kpi-cell-val">{summaryLoading ? '--' : fmt(kpiLogins)}</div>
          <div className="kpi-cell-sub">Tất cả thời gian</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="act-tabs">
        <button className={`act-tab${activeTab === 'summary' ? ' active' : ''}`} onClick={() => setActiveTab('summary')}>
          <i className="bi bi-people" /> Tóm tắt người dùng
        </button>
        <button className={`act-tab${activeTab === 'detail' ? ' active' : ''}`}
          onClick={() => { setActiveTab('detail'); if (logs.length === 0) loadLogs(1); }}>
          <i className="bi bi-list-ul" /> Chi tiết thao tác
        </button>
      </div>

      {/* Summary tab */}
      {activeTab === 'summary' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-people" />Hoạt động theo người dùng</span>
            <div className="search-box" style={{ width: 220 }}>
              <i className="bi bi-search" />
              <input type="search" className="search-input" placeholder="Tìm username..."
                value={summarySearch} onChange={e => setSummarySearch(e.target.value)} />
            </div>
          </div>
          {summaryLoading ? (
            <div className="loading-wrap"><div className="spinner" /></div>
          ) : summaryRows.length === 0 ? (
            <div className="empty-state"><i className="bi bi-people" />Chưa có dữ liệu hoạt động.</div>
          ) : (
            <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {([
                      ['username','Username',false],['loginCount','Lần đăng nhập',true],
                      ['lastLogin','Đăng nhập cuối',false],['lastActivity','Hoạt động cuối',false],
                      ['todayRequests','Hôm nay',true],['totalRequests','Tổng yêu cầu',true],
                      ['writeCount','Thao tác ghi',true],['errorCount','Lỗi',true],
                    ] as [keyof UserSummaryItem, string, boolean][]).map(([col, label, center]) => (
                      <th key={col} onClick={() => { if (sumSortCol===col) setSumSortDir(d=>d==='asc'?'desc':'asc'); else{setSumSortCol(col);setSumSortDir('desc');} setSumPage(1); }}
                        style={{ cursor:'pointer', userSelect:'none', textAlign: center ? 'center' : 'left', whiteSpace:'nowrap' }}>
                        {label}{sumSortCol===col?(sumSortDir==='asc'?' ▲':' ▼'):' ⇅'}
                      </th>
                    ))}
                    <th>IP cuối</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map(u => (
                    <tr key={u.username} style={{ cursor: 'pointer' }} onClick={() => drillUser(u.username)}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600 }}>{u.username}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, textAlign: 'center' }}>
                        {u.loginCount > 0
                          ? <span style={{ background: 'rgba(168,85,247,.12)', color: '#a855f7', padding: '2px 8px', borderRadius: 10 }}>{fmt(u.loginCount)}</span>
                          : <span className="td-muted">0</span>}
                      </td>
                      <td className="td-mono td-muted" style={{ fontSize: 11.5 }}>{fmtD(u.lastLogin)}</td>
                      <td className="td-mono td-muted" style={{ fontSize: 11.5 }}>{fmtD(u.lastActivity)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {u.todayRequests > 0
                          ? <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{fmt(u.todayRequests)}</span>
                          : <span className="td-muted">0</span>}
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmt(u.totalRequests)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {u.writeCount > 0
                          ? <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{fmt(u.writeCount)}</span>
                          : <span className="td-muted">0</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {u.errorCount > 0
                          ? <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--red)' }}>{fmt(u.errorCount)}</span>
                          : <span className="td-muted">0</span>}
                      </td>
                      <td className="td-mono td-muted" style={{ fontSize: 11 }}>{u.lastIp || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', flexWrap: 'wrap', gap: 8 }}>
              <Pager total={summaryFiltered.length} page={sumPage} pageSize={SUM_PAGE_SIZE} onChange={setSumPage} />
              <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={() => exportXLSX(`TomTatHoatDong_ViPower_${new Date().toISOString().slice(0,10)}`,
                  ['Username','Lần đăng nhập','Đăng nhập cuối','Hoạt động cuối','Hôm nay','Tổng yêu cầu','Thao tác ghi','Lỗi','IP cuối'],
                  summaryFiltered.map(u => [u.username, u.loginCount, fmtD(u.lastLogin), fmtD(u.lastActivity), u.todayRequests, u.totalRequests, u.writeCount, u.errorCount, u.lastIp || '']),
                  'Tóm tắt')}>
                <i className="bi bi-file-earmark-excel" /> Xuất Excel
              </button>
            </div>
            </>
          )}
        </div>
      )}

      {/* Detail tab */}
      {activeTab === 'detail' && (
        <>
          <div className="filter-bar">
            <div className="search-box">
              <i className="bi bi-search" />
              <input type="search" className="search-input" placeholder="Tìm username..."
                value={logSearch} onChange={e => setLogSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilter()} />
            </div>
            <div className="filter-sep" />
            <span className="filter-label">Phương thức</span>
            <select className="filter-select" value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>
            <span className="filter-label">Trạng thái</span>
            <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="ok">Thành công</option>
              <option value="err">Lỗi</option>
            </select>
            <span className="filter-label">Từ</span>
            <input type="date" className="filter-select" style={{ width: 130 }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            <span className="filter-label">Đến</span>
            <input type="date" className="filter-select" style={{ width: 130 }} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={applyFilter}>
              <i className="bi bi-funnel" /> Lọc
            </button>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '5px 12px', marginLeft: 4 }} onClick={resetFilter}>
              <i className="bi bi-x-circle" /> Xóa lọc
            </button>
          </div>

          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="card-title"><i className="bi bi-list-ul" />Lịch sử thao tác</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(pagination.total)} bản ghi</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select className="filter-select" style={{ width: 'auto' }} value={pageSize}
                  onChange={e => { setPageSize(+e.target.value); loadLogs(1); }}>
                  <option value={50}>50 / trang</option>
                  <option value={100}>100 / trang</option>
                  <option value={200}>200 / trang</option>
                </select>
              </div>
            </div>
            {loading ? (
              <div className="loading-wrap"><div className="spinner" /></div>
            ) : logs.length === 0 ? (
              <div className="empty-state"><i className="bi bi-clock-history" />Không có bản ghi nào.</div>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {([
                          ['timestamp','Thời gian',140,'left'],
                          ['username','Username',120,'left'],
                        ] as [string,string,number,string][]).map(([col,label,w,align])=>(
                          <th key={col} onClick={()=>{if(detSortCol===col)setDetSortDir(d=>d==='asc'?'desc':'asc');else{setDetSortCol(col);setDetSortDir('asc');}}}
                            style={{width:w,cursor:'pointer',userSelect:'none',textAlign:align as 'left'|'center'|'right',whiteSpace:'nowrap'}}>
                            {label}{detSortCol===col?(detSortDir==='asc'?' ▲':' ▼'):' ⇅'}
                          </th>
                        ))}
                        <th>Hành động / Endpoint</th>
                        {([
                          ['method','Method',70,'center'],
                          ['statusCode','Status',70,'center'],
                          ['processingTime','Thời gian xử lý',100,'right'],
                        ] as [string,string,number,string][]).map(([col,label,w,align])=>(
                          <th key={col} onClick={()=>{if(detSortCol===col)setDetSortDir(d=>d==='asc'?'desc':'asc');else{setDetSortCol(col);setDetSortDir('asc');}}}
                            style={{width:w,cursor:'pointer',userSelect:'none',textAlign:align as 'left'|'center'|'right',whiteSpace:'nowrap'}}>
                            {label}{detSortCol===col?(detSortDir==='asc'?' ▲':' ▼'):' ⇅'}
                          </th>
                        ))}
                        <th style={{ width: 140 }}>IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailSorted.map(l => {
                        const sc = l.statusCode || 0;
                        const ep = (l.endpoint || '').split('?')[0];
                        const label = l.method && l.endpoint ? actionLabel(l.method, l.endpoint) : '--';
                        const ptColor = (l.processingTime || 0) > 500 ? 'var(--yellow)' : 'var(--text-muted)';
                        return (
                          <tr key={l._id}>
                            <td className="td-mono td-muted" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{fmtDT(l.timestamp)}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>{l.username || <span className="td-muted">anon</span>}</td>
                            <td>
                              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ep}</div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {l.method && (
                                <span className="badge" style={{
                                  background: l.method === 'GET' ? 'rgba(34,211,105,0.12)' : l.method === 'DELETE' ? 'rgba(244,75,75,0.12)' : 'rgba(56,170,255,0.12)',
                                  color: l.method === 'GET' ? 'var(--green)' : l.method === 'DELETE' ? 'var(--red)' : 'var(--accent)',
                                }}>{l.method}</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: sc >= 500 ? 'var(--red)' : sc >= 400 ? 'var(--yellow)' : 'var(--green)' }}>
                                {sc || '--'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: ptColor }}>
                              {l.processingTime != null ? `${l.processingTime}ms` : '--'}
                            </td>
                            <td className="td-mono td-muted" style={{ fontSize: 11 }}>{l.ipAddress || '--'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pager total={pagination.total} page={currentPage} pageSize={pageSize} onChange={loadLogs} />
              </>
            )}
          </div>
        </>
      )}

      {/* Cleanup confirm modal */}
      {showCleanup && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowCleanup(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title"><i className="bi bi-trash3" style={{ color: 'var(--yellow)' }} /> Dọn dẹp log cũ</div>
              <button className="modal-close" onClick={() => setShowCleanup(false)}><i className="bi bi-x-lg" /></button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
              <i className="bi bi-clock-history" style={{ fontSize: 32, color: 'var(--yellow)', marginBottom: 12, display: 'block' }} />
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Xóa log cũ hơn 30 ngày?</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Các bản ghi nhật ký cũ hơn 30 ngày sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-ghost" onClick={() => setShowCleanup(false)}>Hủy</button>
              <button className="btn-modal-primary" style={{ background: 'var(--yellow)', color: '#000' }}
                onClick={doCleanup} disabled={cleanupLoading}>
                <i className="bi bi-trash3" /> {cleanupLoading ? 'Đang xóa...' : 'Xóa log cũ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

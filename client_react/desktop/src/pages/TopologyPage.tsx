import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';
import { apiGet, apiPut } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { useWS } from '../contexts/WSContext';

interface Device {
  _id: string;
  deviceid: string;
  deviceName?: string;
  location?: string;
  deviceType?: string;
  status: string;
  displaygroupid?: string;
  samplingCycle?: number;
  coordinates?: { x: number; y: number };
  _autoX?: number;
  _autoY?: number;
}

interface DisplayGroup {
  displaygrouid: string;
  groupName?: string;
  name?: string;
}

interface LiveData {
  power: number;
  netpower: number;
  isOnline: boolean;
}

interface AlertItem {
  _id: string;
  deviceid: string;
  severity: string;
  isComplete?: boolean;
  resolved?: boolean;
}

const PALETTE = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b', '#ff7043'];
const MAP_W = 1200, MAP_H = 700, NODE_R = 20;
const SVG_W = 1100, SVG_PAD = 40, GROUP_GAP = 60;

function deviceStatusColor(dev: Device, alerts: AlertItem[]): string {
  if (dev.status === 'inactive') return '#607b99';
  const devAlerts = alerts.filter(a => a.deviceid === dev.deviceid && !a.isComplete && !a.resolved);
  if (devAlerts.some(a => a.severity === 'critical' || a.severity === 'red')) return '#f44b4b';
  if (devAlerts.some(a => a.severity === 'warning' || a.severity === 'orange')) return '#f5a623';
  return '#22d369';
}

function truncate(s: string | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function groupLabel(g: DisplayGroup): string {
  return g.groupName || g.name || g.displaygrouid;
}

export default function TopologyPage() {
  useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { subscribe, connected } = useWS();
  const storeUser = useAuthStore(s => s.user);
  const isAdmin = storeUser?.role === 'Admin';

  function filterGroupsByPermission(grps: DisplayGroup[]): DisplayGroup[] {
    if (!storeUser || storeUser.role === 'Admin') return grps;
    const allowed = storeUser.allowedAreas || [];
    if (allowed.length === 0) return [];
    return grps.filter(g => allowed.includes(g.displaygrouid));
  }

  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DisplayGroup[]>([]);
  const [liveMap, setLiveMap] = useState<Record<string, LiveData>>({});
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const wsConnected = connected;
  const [activeTab, setActiveTab] = useState<'flow' | 'map'>('flow');
  const [editMode, setEditMode] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef<Device | null>(null);
  const devicesRef = useRef<Device[]>([]);
  const liveMapRef = useRef<Record<string, LiveData>>({});
  const alertsRef = useRef<AlertItem[]>([]);
  const editModeRef = useRef(false);
  const selectedDeviceRef = useRef<Device | null>(null);

  // Keep refs in sync
  useEffect(() => { devicesRef.current = devices; }, [devices]);
  useEffect(() => { liveMapRef.current = liveMap; }, [liveMap]);
  useEffect(() => { alertsRef.current = alerts; }, [alerts]);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { selectedDeviceRef.current = selectedDevice; }, [selectedDevice]);

  useEffect(() => {
    load();
    const u1 = subscribe('data_init', (d: unknown) => {
      const data = d as { dataEnergy?: { deviceid: string; data?: { power?: number; netpower?: number }[] }[] };
      const pm: Record<string, LiveData> = {};
      (data?.dataEnergy || []).forEach(entry => {
        const latest = entry.data?.[0];
        if (latest) pm[entry.deviceid] = { power: latest.power ?? 0, netpower: latest.netpower ?? 0, isOnline: true };
      });
      setLiveMap(pm);
    });
    const u2 = subscribe('history_inserted', (d: unknown) => {
      const ev = d as { deviceid?: string; deviceId?: string; power?: number; netpower?: number; status?: string };
      if (!ev) return;
      const devid = ev.deviceid || ev.deviceId;
      if (!devid) return;
      setLiveMap(prev => ({
        ...prev,
        [devid]: { power: ev.power ?? prev[devid]?.power ?? 0, netpower: ev.netpower ?? prev[devid]?.netpower ?? 0, isOnline: true },
      }));
      if (ev.status) setDevices(prev => prev.map(dev => dev.deviceid === devid ? { ...dev, status: ev.status! } : dev));
    });
    return () => { u1(); u2(); };
  }, []);

  async function load() {
    try {
      const [devRes, grpRes, altRes] = await Promise.allSettled([
        apiGet('/devices?limit=1000'),
        apiGet('/display-groups?limit=1000'),
        apiGet('/alerts/unresolved'),
      ]);
      if (devRes.status === 'fulfilled') {
        const j = await devRes.value.json();
        setDevices((j.data?.data || j.data || j.devices || []).filter((d: Device) => d.deviceid));
      }
      if (grpRes.status === 'fulfilled') {
        const j = await grpRes.value.json();
        setGroups(filterGroupsByPermission(j.data?.data || j.data || []));
      }
      if (altRes.status === 'fulfilled') {
        const j = await altRes.value.json();
        setAlerts(j.data || []);
      }
    } catch {}
  }


  // ── Build group data ──────────────────────────────────────────
  const resolvedGroups: DisplayGroup[] = groups.length > 0
    ? groups
    : [...new Set(devices.map(d => d.displaygroupid).filter(Boolean))].map(gid => ({
        displaygrouid: gid as string,
        groupName: gid as string,
      }));

  const areaColors: Record<string, string> = {};
  const areaNames: Record<string, string> = {};
  resolvedGroups.forEach((g, i) => {
    areaColors[g.displaygrouid] = PALETTE[i % PALETTE.length];
    areaNames[g.displaygrouid] = groupLabel(g);
  });

  const grouped: Record<string, Device[]> = {};
  resolvedGroups.forEach(g => { grouped[g.displaygrouid] = []; });
  const ungrouped: Device[] = [];
  devices.forEach(d => {
    if (d.displaygroupid && grouped[d.displaygroupid] !== undefined) {
      grouped[d.displaygroupid].push(d);
    } else {
      ungrouped.push(d);
    }
  });
  if (ungrouped.length) {
    grouped['__other'] = ungrouped;
    areaColors['__other'] = '#607b99';
    areaNames['__other'] = 'Khác';
  }

  const allGroups: DisplayGroup[] = ungrouped.length
    ? [...resolvedGroups, { displaygrouid: '__other', groupName: 'Khác' }]
    : resolvedGroups;

  // ── SVG Flow ──────────────────────────────────────────────────
  const COLS = allGroups.length || 1;
  const colW = Math.max(200, Math.floor((SVG_W - SVG_PAD * 2 - GROUP_GAP * (COLS - 1)) / COLS));
  const groupHeights = allGroups.map(g => {
    const devs = grouped[g.displaygrouid] || [];
    const rows = Math.ceil(devs.length / 2) || 1;
    return 80 + rows * 70;
  });
  const svgH = Math.max(400, Math.max(...groupHeights, 0) + SVG_PAD * 2 + 60);

  // ── Canvas auto-layout ────────────────────────────────────────
  function applyAutoLayout(devList: Device[]) {
    const groupDevs: Record<string, Device[]> = {};
    devList.forEach(d => {
      const gid = d.displaygroupid || '__other';
      if (!groupDevs[gid]) groupDevs[gid] = [];
      groupDevs[gid].push(d);
    });
    const gids = Object.keys(groupDevs);
    const numCols = gids.length || 1;
    const zoneW = MAP_W / numCols;
    gids.forEach((gid, gi) => {
      const devs = groupDevs[gid];
      devs.forEach((dev, di) => {
        if (!dev.coordinates?.x && !dev.coordinates?.y) {
          const perRow = Math.ceil(Math.sqrt(devs.length)) || 1;
          dev._autoX = gi * zoneW + 80 + (di % perRow) * 90;
          dev._autoY = 120 + Math.floor(di / perRow) * 90;
        }
      });
    });
  }

  // ── Canvas render ─────────────────────────────────────────────
  const renderMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const devList = devicesRef.current;
    const live = liveMapRef.current;
    const alts = alertsRef.current;
    const selDev = selectedDeviceRef.current;

    applyAutoLayout(devList);

    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.fillStyle = '#080d14';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    // Grid
    ctx.strokeStyle = 'rgba(56,139,253,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < MAP_W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke(); }
    for (let y = 0; y < MAP_H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke(); }

    // Zone backgrounds
    const groupDevs: Record<string, Device[]> = {};
    devList.forEach(d => {
      const gid = d.displaygroupid || '__other';
      if (!groupDevs[gid]) groupDevs[gid] = [];
      groupDevs[gid].push(d);
    });
    const gids = Object.keys(groupDevs);
    const numCols = gids.length || 1;
    const zoneW = MAP_W / numCols;
    gids.forEach((gid, gi) => {
      const color = areaColors[gid] || PALETTE[gi % PALETTE.length];
      const name = areaNames[gid] || gid;
      const x = gi * zoneW;
      ctx.fillStyle = color + '0a';
      ctx.strokeStyle = color + '33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const rx = x + 8, ry = 8, rw = zoneW - 16, rh = MAP_H - 16, r = 10;
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + rw - r, ry); ctx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
      ctx.lineTo(rx + rw, ry + rh - r); ctx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
      ctx.lineTo(rx + r, ry + rh); ctx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
      ctx.lineTo(rx, ry + r); ctx.arcTo(rx, ry, rx + r, ry, r);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillStyle = color + 'cc';
      ctx.textAlign = 'center';
      ctx.fillText(name, x + zoneW / 2, 28);
    });

    // Devices
    devList.forEach(dev => {
      const cx = dev.coordinates?.x || dev._autoX || 60;
      const cy = dev.coordinates?.y || dev._autoY || 60;
      const sc = deviceStatusColor(dev, alts);
      const pw = live[dev.deviceid]?.power?.toFixed(1) ?? '--';
      const isOnline = !!live[dev.deviceid]?.isOnline;
      const isSelected = selDev?.deviceid === dev.deviceid;

      if (isOnline && dev.status === 'active') {
        const grad = ctx.createRadialGradient(cx, cy, NODE_R, cx, cy, NODE_R * 2.5);
        grad.addColorStop(0, sc + '44'); grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, NODE_R * 2.5, 0, Math.PI * 2); ctx.fill();
      }
      if (isSelected) {
        ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, NODE_R + 5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = sc + '33'; ctx.strokeStyle = sc; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, NODE_R, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      ctx.font = '700 8px JetBrains Mono, monospace';
      ctx.fillStyle = sc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(dev.deviceid.slice(0, 6), cx, cy);
      ctx.font = '11px Inter, sans-serif';
      ctx.fillStyle = '#e6eef8bb'; ctx.textBaseline = 'top';
      ctx.fillText(truncate(dev.deviceName, 12), cx, cy + NODE_R + 4);
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillStyle = sc + 'cc';
      ctx.fillText(pw + ' kW', cx, cy + NODE_R + 18);
      ctx.textBaseline = 'alphabetic';
    });
  }, [areaColors, areaNames]);

  // Re-render canvas when tab switches to map or data changes
  useEffect(() => {
    if (activeTab === 'map') renderMap();
  }, [activeTab, devices, liveMap, alerts, selectedDevice, renderMap]);

  // ── Canvas interaction ────────────────────────────────────────
  function getDeviceAtCanvasPos(x: number, y: number): Device | undefined {
    return devicesRef.current.find(dev => {
      const cx = dev.coordinates?.x || dev._autoX || 60;
      const cy = dev.coordinates?.y || dev._autoY || 60;
      return Math.hypot(cx - x, cy - y) <= NODE_R + 4;
    });
  }

  function canvasCoords(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (MAP_W / r.width),
      y: (e.clientY - r.top) * (MAP_H / r.height),
    };
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!editModeRef.current) return;
    const { x, y } = canvasCoords(e);
    const dev = getDeviceAtCanvasPos(x, y);
    if (dev) { draggingRef.current = dev; e.preventDefault(); }
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const { x, y } = canvasCoords(e);
    if (draggingRef.current) {
      draggingRef.current.coordinates = { x: Math.round(x), y: Math.round(y) };
      renderMap();
    } else {
      const hover = getDeviceAtCanvasPos(x, y);
      e.currentTarget.style.cursor = hover ? (editModeRef.current ? 'grab' : 'pointer') : (editModeRef.current ? 'crosshair' : 'default');
    }
  }

  async function handleCanvasMouseUp() {
    const dev = draggingRef.current;
    if (dev) {
      draggingRef.current = null;
      await saveCoords(dev);
    }
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (draggingRef.current) return;
    const { x, y } = canvasCoords(e);
    const dev = getDeviceAtCanvasPos(x, y);
    if (dev) openDetail(dev);
  }

  async function saveCoords(dev: Device) {
    try {
      const res = await apiPut(`/devices/${dev._id}`, { coordinates: dev.coordinates });
      const json = await res.json();
      if (json.success) showToast(`Đã lưu vị trí ${dev.deviceid}`, 'ok');
      else showToast('Lỗi lưu vị trí: ' + json.message, 'error');
    } catch { showToast('Lỗi kết nối khi lưu vị trí', 'error'); }
  }

  // ── Detail panel ──────────────────────────────────────────────
  function openDetail(dev: Device) {
    setSelectedDevice(dev);
    setDetailOpen(true);
    if (activeTab === 'map') setTimeout(renderMap, 0);
  }

  const live = selectedDevice ? liveMap[selectedDevice.deviceid] : null;
  const devStatusColor = selectedDevice ? deviceStatusColor(selectedDevice, alerts) : '#607b99';
  const activeAlerts = selectedDevice
    ? alerts.filter(a => a.deviceid === selectedDevice.deviceid && !a.isComplete && !a.resolved).length
    : 0;
  const areaName = selectedDevice ? (areaNames[selectedDevice.displaygroupid || ''] || selectedDevice.displaygroupid || '--') : '--';
  const STATUS_LABELS: Record<string, string> = {
    active: 'Đang hoạt động', inactive: 'Không hoạt động', paused: 'Dừng hoạt động',
    offline: 'Ngoại tuyến', error: 'Lỗi',
  };

  // ── Summary KPIs ──────────────────────────────────────────────
  const totalActive = devices.filter(d => d.status === 'active').length;
  const totalAlerts = alerts.filter(a => !a.isComplete && !a.resolved).length;

  const topbarRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="status-live" style={{ color: wsConnected ? 'var(--green)' : 'var(--text-muted)' }}>
        <div className="pulse-dot" style={{ background: wsConnected ? 'var(--green)' : 'var(--text-muted)', boxShadow: wsConnected ? '0 0 6px var(--green)' : 'none' }} />
        {wsConnected ? 'REALTIME' : 'OFFLINE'}
      </div>
      {isAdmin && (
        <button className={`btn-ghost${editMode ? ' btn-ghost-active' : ''}`} onClick={() => setEditMode(m => !m)}>
          <i className={`bi ${editMode ? 'bi-pencil-fill' : 'bi-pencil'}`} />
          {editMode ? 'Đang chỉnh sửa' : 'Chỉnh sửa vị trí'}
        </button>
      )}
      <button className="btn-icon" onClick={load} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
    </div>
  );

  return (
    <Layout title="Sơ đồ Nhà máy" breadcrumb={['ViPower', 'Hệ thống', 'Sơ đồ']} topbarRight={topbarRight}>

      {/* KPI strip */}
      <div className="kpi-strip" style={{ marginBottom: 14 }}>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--text-primary)' }}>
          <div className="kpi-cell-label">Tổng thiết bị</div>
          <div className="kpi-cell-val">{devices.length}</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--green)' }}>
          <div className="kpi-cell-label">Đang hoạt động</div>
          <div className="kpi-cell-val">{totalActive}</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: 'var(--yellow)' }}>
          <div className="kpi-cell-label">Nhóm</div>
          <div className="kpi-cell-val">{resolvedGroups.length}</div>
        </div>
        <div className="kpi-cell" style={{ ['--kpi-c' as string]: totalAlerts > 0 ? 'var(--red)' : 'var(--green)' }}>
          <div className="kpi-cell-label">Cảnh báo active</div>
          <div className="kpi-cell-val">{totalAlerts}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="topo-tabs">
        <button className={`topo-tab${activeTab === 'flow' ? ' active' : ''}`} onClick={() => setActiveTab('flow')}>
          <i className="bi bi-diagram-3" /> Sơ đồ luồng
        </button>
        <button className={`topo-tab${activeTab === 'map' ? ' active' : ''}`} onClick={() => setActiveTab('map')}>
          <i className="bi bi-geo-alt" /> Bản đồ nhà máy
        </button>
      </div>

      {/* Flow diagram */}
      <div className={`topo-panel${activeTab !== 'flow' ? ' hidden' : ''}`}>
        <div className="flow-container">
          <svg width={SVG_W} height={svgH} viewBox={`0 0 ${SVG_W} ${svgH}`} className="flow-svg" style={{ minWidth: 900 }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(56,139,253,0.5)" />
              </marker>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* Arrows between groups */}
            {allGroups.slice(0, -1).map((_, i) => {
              const x1 = SVG_PAD + i * (colW + GROUP_GAP) + colW;
              const x2 = SVG_PAD + (i + 1) * (colW + GROUP_GAP);
              return (
                <line key={i} x1={x1} y1={svgH / 2} x2={x2} y2={svgH / 2}
                  stroke="rgba(56,139,253,0.3)" strokeWidth="2" strokeDasharray="6,4"
                  markerEnd="url(#arrow)" />
              );
            })}

            {/* Groups + devices */}
            {allGroups.map((g, gi) => {
              const gid = g.displaygrouid;
              const gName = groupLabel(g);
              const devs = grouped[gid] || [];
              const x = SVG_PAD + gi * (colW + GROUP_GAP);
              const gh = groupHeights[gi] || 160;
              const y = (svgH - gh) / 2;
              const color = areaColors[gid] || PALETTE[gi % PALETTE.length];
              const onlineCount = devs.filter(d => liveMap[d.deviceid]?.isOnline).length;

              return (
                <g key={gid}>
                  <rect x={x} y={y} width={colW} height={gh} rx="10"
                    fill={color + '11'} stroke={color + '44'} strokeWidth="1.5" />
                  <text x={x + colW / 2} y={y + 22} textAnchor="middle"
                    fontSize="13" fontWeight="600" fill={color}>{gName}</text>
                  <text x={x + colW / 2} y={y + 38} textAnchor="middle"
                    fontSize="10" fill={color + '99'}>{onlineCount}/{devs.length} online</text>

                  {devs.map((dev, di) => {
                    const col = di % 2;
                    const row = Math.floor(di / 2);
                    const cx = x + 30 + col * ((colW - 60) / 2) + (colW - 60) / 4;
                    const cy = y + 60 + row * 70 + 25;
                    const sc = deviceStatusColor(dev, alerts);
                    const pw = liveMap[dev.deviceid]?.power?.toFixed(1) ?? '--';
                    const isOnline = !!liveMap[dev.deviceid]?.isOnline;

                    return (
                      <g key={dev.deviceid} className="flow-node" onClick={() => openDetail(dev)}
                        style={{ cursor: 'pointer' }}>
                        <circle cx={cx} cy={cy} r="22" fill={sc + '22'} stroke={sc} strokeWidth="2"
                          filter={isOnline ? 'url(#glow)' : undefined} />
                        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fontWeight="600" fill={sc}>
                          {dev.deviceid}
                        </text>
                        <text x={cx} y={cy + 38} textAnchor="middle" fontSize="10" fill="#e6eef8cc">
                          {truncate(dev.deviceName, 12)}
                        </text>
                        <text x={cx} y={cy + 50} textAnchor="middle" fontSize="9"
                          fontFamily="JetBrains Mono, monospace" fill={sc + 'cc'}>{pw} kW</text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="topo-legend">
          {([['#22d369', 'Đang hoạt động'], ['#f5a623', 'Dừng hoạt động'], ['#f44b4b', 'Vượt ngưỡng'], ['#607b99', 'Không hoạt động']] as [string, string][]).map(([c, l]) => (
            <div key={l} className="legend-item">
              <span className="legend-dot" style={{ background: c }} />
              {l}
            </div>
          ))}
        </div>
      </div>

      {/* Map canvas */}
      <div className={`topo-panel${activeTab !== 'map' ? ' hidden' : ''}`}>
        <div className="map-toolbar">
          <i className="bi bi-info-circle" style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {editMode
              ? <><strong style={{ color: 'var(--accent)' }}>Chế độ chỉnh sửa:</strong> Kéo thiết bị để thay đổi vị trí. Vị trí lưu tự động khi thả.</>
              : <>Bật <strong style={{ color: 'var(--accent)' }}>Chỉnh sửa vị trí</strong> để kéo thiết bị trên bản đồ.</>}
          </span>
        </div>
        <div className={`map-canvas-wrap${editMode ? ' edit-cursor' : ''}`}>
          <canvas
            ref={canvasRef}
            width={MAP_W}
            height={MAP_H}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onClick={handleCanvasClick}
          />
        </div>
      </div>

      {/* Device detail panel */}
      <div className={`detail-panel${detailOpen ? ' open' : ''}`}>
        <div className="detail-header">
          <div className="detail-title">
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: devStatusColor, flexShrink: 0 }} />
            <span>{selectedDevice?.deviceName || selectedDevice?.deviceid || '--'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
              {selectedDevice?.deviceid || ''}
            </span>
          </div>
          <button className="detail-close" onClick={() => { setDetailOpen(false); setSelectedDevice(null); }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="detail-body">
          <div className="detail-row">
            <div className="detail-stat">
              <div className="detail-stat-label">Công suất</div>
              <div className="detail-stat-val" style={{ color: 'var(--accent)' }}>
                {live?.power != null ? `${live.power.toFixed(1)} kW` : '-- kW'}
              </div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-label">Điện năng hôm nay</div>
              <div className="detail-stat-val" style={{ color: 'var(--green)' }}>
                {live?.netpower != null ? `${live.netpower.toFixed(2)} kWh` : '-- kWh'}
              </div>
            </div>
          </div>
          <div className="detail-row">
            <div className="detail-stat">
              <div className="detail-stat-label">Trạng thái</div>
              <div className="detail-stat-val" style={{ color: devStatusColor }}>
                {STATUS_LABELS[selectedDevice?.status || ''] || selectedDevice?.status || '--'}
              </div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-label">Khu vực</div>
              <div className="detail-stat-val">{areaName}</div>
            </div>
          </div>
          <div className="detail-divider" />
          <div className="detail-meta">
            <div className="detail-meta-row">
              <span className="detail-meta-label">Loại thiết bị</span>
              <span>{selectedDevice?.deviceType || '--'}</span>
            </div>
            <div className="detail-meta-row">
              <span className="detail-meta-label">Vị trí</span>
              <span>{selectedDevice?.location || '--'}</span>
            </div>
            <div className="detail-meta-row">
              <span className="detail-meta-label">Chu kỳ lấy mẫu</span>
              <span>{selectedDevice?.samplingCycle ? `${selectedDevice.samplingCycle}s` : '--'}</span>
            </div>
            <div className="detail-meta-row">
              <span className="detail-meta-label">Cảnh báo active</span>
              <span style={{ color: activeAlerts > 0 ? 'var(--red)' : 'var(--green)' }}>
                {activeAlerts > 0 ? `${activeAlerts} active` : 'Không có'}
              </span>
            </div>
          </div>
        </div>
        <div className="detail-actions">
          <button className="btn-detail-primary"
            onClick={() => selectedDevice && navigate(`/report?deviceid=${encodeURIComponent(selectedDevice.deviceid)}`)}>
            <i className="bi bi-bar-chart-line" style={{ marginRight: 5 }} />Xem báo cáo
          </button>
          <button className="btn-detail-primary"
            style={{ borderColor: 'rgba(34,211,105,.3)', color: 'var(--green)', background: 'rgba(34,211,105,.08)' }}
            onClick={() => selectedDevice && navigate(`/analysis?deviceid=${encodeURIComponent(selectedDevice.deviceid)}`)}>
            <i className="bi bi-graph-up-arrow" style={{ marginRight: 5 }} />Phân tích
          </button>
        </div>
      </div>

    </Layout>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { useWS } from '../contexts/WSContext';
import { Chart } from 'chart.js';
import '../utils/chartDefaults';
import { useAuthStore } from '../stores/authStore';

const SHARE_COLORS = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b'];
const THRESHOLD_KW = 700;

interface Device {
  _id: string;
  deviceid: string;
  deviceName: string;
  location?: string;
  deviceType?: string;
  status: string;
  displaygroupid?: string;
}

interface Group {
  displaygrouid?: string;
  displaygroupid?: string;
  name: string;
}

interface AlertItem {
  _id: string;
  deviceid: string;
  message: string;
  severity?: string;
  level?: string;
  createdAt?: string;
  timestamp?: string;
  isComplete?: boolean;
  resolved?: boolean;
}

interface DeviceRuntime {
  id: string;
  name: string;
  area: string;
  status: 'ok' | 'warn' | 'error';
  power: number;
  energy: number;
  per: number;
}

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || isNaN(n as number)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}

function fmtTime(ts?: string): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function fmtAlertDate(ts?: string): string {
  if (!ts) return 'Hôm nay';
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  if (d >= todayStart) return 'Hôm nay';
  if (d >= yesterdayStart) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
}

const SEV_CONFIG: Record<string, { icon: string; color: string }> = {
  critical: { icon: 'bi-x-octagon-fill',            color: '#f44b4b' },
  error:    { icon: 'bi-x-octagon-fill',            color: '#f44b4b' },
  warning:  { icon: 'bi-exclamation-triangle-fill', color: '#f5a623' },
  warn:     { icon: 'bi-exclamation-triangle-fill', color: '#f5a623' },
  info:     { icon: 'bi-info-circle-fill',           color: '#38aaff' },
  ok:       { icon: 'bi-check-circle-fill',          color: '#22d369' },
};

function currentShift() {
  const h = new Date().getHours();
  if (h < 8)  return { label: 'Ca A', start: 0,  end: 8  };
  if (h < 16) return { label: 'Ca B', start: 8,  end: 16 };
  return           { label: 'Ca C', start: 16, end: 24 };
}

export default function DashboardPage() {
  useAuth();
  const navigate = useNavigate();
  const { send, subscribe, connected } = useWS();
  const storeUser = useAuthStore(s => s.user);
  const storeUserRef = useRef(storeUser);
  useEffect(() => { storeUserRef.current = storeUser; }, [storeUser]);

  function filterGroupsByPermission(grps: Group[]): Group[] {
    const u = storeUserRef.current;
    if (!u || u.role === 'Admin') return grps;
    const allowed = u.allowedAreas || [];
    if (allowed.length === 0) return [];
    return grps.filter(g => allowed.includes(g.displaygrouid || g.displaygroupid || ''));
  }

  const [groups, setGroups] = useState<Group[]>([]);
  const [runtimeDevices, setRuntimeDevices] = useState<DeviceRuntime[]>([]);
  const [deviceMap, setDeviceMap] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const [selectedArea, setSelectedArea] = useState('all');
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [selectedRange, setSelectedRange] = useState(24);

  const [kpiEnergy, setKpiEnergy] = useState(0);
  const [kpiPower, setKpiPower] = useState(0);
  const [kpiEff, setKpiEff] = useState<number | null>(null);
  const [alertsCrit, setAlertsCrit] = useState(0);
  const [alertsWarn, setAlertsWarn] = useState(0);

  const [peakToday, setPeakToday] = useState(0);
  const [peakYesterday, setPeakYesterday] = useState(0);
  const [peakMonth, setPeakMonth] = useState(0);
  const [peakTime, setPeakTime] = useState('--:--');
  const [peakPct, setPeakPct] = useState(0);
  const [shiftEnergy, setShiftEnergy] = useState(0);
  const [thresholdPct, setThresholdPct] = useState(0);
  const [topConsumers, setTopConsumers] = useState<{ id: string; name: string; kwh: number; area: string }[]>([]);

  const [alertFilter, setAlertFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [clock, setClock] = useState('--:--:--');
  const allAreasLabel = !storeUser || storeUser.role === 'Admin' ? 'Toàn nhà máy' : 'Tất cả khu vực';
  const [chartSubtitle, setChartSubtitle] = useState(`${allAreasLabel} • 24h`);

  const [modalDevice, setModalDevice] = useState<DeviceRuntime | null>(null);
  const [showModal, setShowModal] = useState(false);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);
  const sparkEnergyRef = useRef<HTMLCanvasElement>(null);
  const sparkPowerRef  = useRef<HTMLCanvasElement>(null);
  const sparkEffRef    = useRef<HTMLCanvasElement>(null);
  const sparkEnergyInst = useRef<Chart | null>(null);
  const sparkPowerInst  = useRef<Chart | null>(null);
  const sparkEffInst    = useRef<Chart | null>(null);
  const modalSparkRef   = useRef<HTMLCanvasElement>(null);
  const modalSparkInst  = useRef<Chart | null>(null);

  const areaRef    = useRef('all');
  const deviceRef  = useRef('all');
  const rangeRef   = useRef(24);
  const rdevRef    = useRef<DeviceRuntime[]>([]);

  useEffect(() => {
    const tick = setInterval(() =>
      setClock(new Date().toLocaleTimeString('vi-VN', { hour12: false })), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    loadGroups();
    loadAlerts();
    const u1 = subscribe('data_init',        d => handleDataInit(d as Record<string, unknown>));
    const u2 = subscribe('chart_data',       d => { if (d) handleChartData(d as Parameters<typeof handleChartData>[0]); });
    const u3 = subscribe('history_inserted', d => { if (d) handleLiveData(d as Parameters<typeof handleLiveData>[0]); });
    return () => {
      u1(); u2(); u3();
      chartInst.current?.destroy();
      sparkEnergyInst.current?.destroy();
      sparkPowerInst.current?.destroy();
      sparkEffInst.current?.destroy();
      modalSparkInst.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (sparkEnergyRef.current && !sparkEnergyInst.current)
      sparkEnergyInst.current = makeSparkline(sparkEnergyRef.current, '#38aaff');
    if (sparkPowerRef.current && !sparkPowerInst.current)
      sparkPowerInst.current = makeSparkline(sparkPowerRef.current, '#22d369');
    if (sparkEffRef.current && !sparkEffInst.current)
      sparkEffInst.current = makeSparkline(sparkEffRef.current, '#f5a623');
  });

  function makeSparkline(canvas: HTMLCanvasElement, color: string): Chart {
    return new Chart(canvas, {
      type: 'line',
      data: { labels: [], datasets: [{ data: [], borderColor: color, borderWidth: 1.5,
        fill: true, backgroundColor: color + '1f', pointRadius: 0, tension: 0.4 }] },
      options: { responsive: false, animation: { duration: 0 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } } },
    });
  }

  function updateSparkline(inst: Chart | null, data: number[]) {
    if (!inst) return;
    inst.data.labels = data.map((_, i) => i);
    inst.data.datasets[0].data = data;
    inst.update('none');
  }

  async function loadGroups() {
    try {
      const res = await apiGet('/display-groups');
      const j = await res.json();
      setGroups(filterGroupsByPermission(j.data || j || []));
    } catch {}
  }

  async function loadAlerts() {
    try {
      const res = await apiGet('/alerts/unresolved');
      const j = await res.json();
      const active: AlertItem[] = (j.data || []).filter((a: AlertItem) => !a.isComplete && !a.resolved);
      setAlerts(active);
      setAlertsCrit(active.filter(a => a.severity === 'critical' || a.severity === 'error' || a.level === 'error').length);
      setAlertsWarn(active.filter(a => a.severity === 'warning' || a.severity === 'warn' || a.level === 'warn').length);
    } catch {}
  }

  function handleDataInit(data: Record<string, unknown>) {
    const energyMap: Record<string, { power: number; energy: number; per: number }> = {};
    for (const e of (data.dataEnergy as { deviceid: string; data?: { power?: number; netpower?: number; per?: number }[] }[] || [])) {
      if (e.data?.length) energyMap[e.deviceid] = { power: e.data[0].power || 0, energy: e.data[0].netpower || 0, per: e.data[0].per || 0 };
    }

    const devData = (data.devices as { data?: Device[] })?.data || [];
    if (devData.length) {
      const dm: Record<string, string> = {};
      devData.forEach(d => { dm[d.deviceid] = d.deviceName || d.deviceid; });
      setDeviceMap(dm);
    }

    const grps = (data.displaygroup as Group[]) || [];
    if (grps.length) setGroups(filterGroupsByPermission(grps));

    const rdevs: DeviceRuntime[] = devData.map(d => {
      const e = energyMap[d.deviceid] || { power: 0, energy: 0, per: 0 };
      return {
        id: d.deviceid, name: d.deviceName || d.deviceid,
        area: d.displaygroupid || '',
        status: d.status === 'active' ? 'ok' : d.status === 'paused' ? 'warn' : 'error',
        power: e.power, energy: e.energy, per: e.per,
      };
    });
    rdevRef.current = rdevs;
    setRuntimeDevices(rdevs);
    refreshKPIs(rdevs);

    if (data.alarms) {
      const active = (data.alarms as AlertItem[]).filter(a => !a.isComplete && !a.resolved);
      setAlerts(active);
      setAlertsCrit(active.filter(a => a.level === 'error').length);
      setAlertsWarn(active.filter(a => a.level === 'warn').length);
    }

    send({ type: 'request_chart_data', message: { area: areaRef.current, device: deviceRef.current, range: rangeRef.current } });
  }

  function refreshKPIs(rdevs: DeviceRuntime[]) {
    const area = areaRef.current;
    const filtered = area === 'all' ? rdevs : rdevs.filter(d => d.area === area);
    const totalPow = filtered.reduce((s, d) => s + d.power, 0);
    const totalEng = filtered.reduce((s, d) => s + d.energy, 0);
    const perDevs  = filtered.filter(d => d.per > 0);
    const avgPer   = perDevs.length ? perDevs.reduce((s, d) => s + d.per, 0) / perDevs.length : null;
    setKpiPower(totalPow);
    setKpiEnergy(totalEng);
    setKpiEff(avgPer);
    setThresholdPct(Math.round(totalPow / THRESHOLD_KW * 100));
    const sorted = [...filtered].sort((a, b) => b.energy - a.energy).slice(0, 5);
    setTopConsumers(sorted.map(d => ({ id: d.id, name: d.name, kwh: d.energy, area: d.area })));
    updateSparkline(sparkEffInst.current, filtered.map(d => d.per));
  }

  function handleChartData(ts: { labels?: string[]; power?: number[]; prevPower?: number[]; energy?: number[] }) {
    const labels    = ts.labels    || [];
    const power     = ts.power     || [];
    const prevPower = ts.prevPower || [];
    const energy    = ts.energy    || [];

    const threshold = Array(labels.length).fill(THRESHOLD_KW);
    if (chartInst.current) {
      chartInst.current.data.labels              = labels;
      chartInst.current.data.datasets[0].data   = power;
      chartInst.current.data.datasets[1].data   = prevPower;
      chartInst.current.data.datasets[2].data   = threshold;
      chartInst.current.update();
    } else {
      buildMainChart(labels, power, prevPower);
    }

    if (power.length) {
      const todayPeak = Math.max(...power);
      const yestPeak  = Math.max(...(prevPower.length ? prevPower : [0]));
      const mPeak     = Math.round(todayPeak * 1.15) || 1;
      const peakIdx   = power.indexOf(todayPeak);
      setPeakToday(todayPeak);
      setPeakYesterday(yestPeak);
      setPeakMonth(mPeak);
      setPeakTime(labels[peakIdx] || '--:--');
      setPeakPct(Math.round(todayPeak / mPeak * 100));
    }

    const shiftEng = energy.slice(-8).reduce((s, e) => s + e, 0);
    setShiftEnergy(shiftEng);

    const currPow = power.length ? power[power.length - 1] : 0;
    setThresholdPct(Math.round(currPow / THRESHOLD_KW * 100));

    updateSparkline(sparkPowerInst.current,  power.slice(-12));
    updateSparkline(sparkEnergyInst.current, energy.slice(-12));
  }

  function handleLiveData(d: { deviceid?: string; power?: number; netpower?: number; per?: number }) {
    if (!d.deviceid || d.power == null) return;
    setRuntimeDevices(prev => {
      const next = prev.map(dev =>
        dev.id === d.deviceid
          ? { ...dev, power: d.power || 0, energy: d.netpower || 0, per: d.per || 0 }
          : dev
      );
      rdevRef.current = next;
      refreshKPIs(next);
      return next;
    });
  }

  function buildMainChart(labels: string[], power: number[], prevPower: number[]) {
    if (!chartRef.current) return;
    chartInst.current?.destroy();
    chartInst.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Công suất hôm nay (kW)', data: power,
            borderColor: '#38aaff', backgroundColor: 'rgba(56,170,255,0.08)',
            fill: true, borderWidth: 2, pointRadius: 0, tension: 0.4 },
          { label: 'Hôm qua (kW)', data: prevPower,
            borderColor: 'rgba(56,170,255,0.28)', backgroundColor: 'rgba(56,170,255,0.03)',
            fill: true, borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.4 },
          { label: `Ngưỡng ${THRESHOLD_KW} kW`, data: Array(labels.length).fill(THRESHOLD_KW),
            borderColor: 'rgba(244,75,75,0.7)', borderWidth: 1.5,
            borderDash: [6, 4], pointRadius: 0, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (c: { dataset: { label?: string }; parsed: { y: number } }) => ` ${c.dataset.label}: ${fmt(c.parsed.y)} kW` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(56,139,253,0.05)' }, ticks: { color: '#3a506b', font: { size: 10 }, maxTicksLimit: 12 } },
          y: { min: 0, grid: { color: 'rgba(56,139,253,0.07)' }, ticks: { color: '#607b99', font: { size: 10 } }, beginAtZero: true },
        },
      },
    });
  }

  function handleAreaChange(area: string) {
    setSelectedArea(area);
    areaRef.current = area;
    setSelectedDevice('all');
    deviceRef.current = 'all';
    send({ type: 'request_chart_data', message: { area, device: 'all', range: rangeRef.current } });
    refreshKPIs(rdevRef.current);
    const rangeLabel = rangeRef.current === 24 ? '24 giờ' : rangeRef.current === 168 ? '7 ngày' : '30 ngày';
    const grp = groups.find(g => (g.displaygrouid || g.displaygroupid) === area);
    setChartSubtitle(`${grp ? grp.name : area === 'all' ? allAreasLabel : area} • ${rangeLabel}`);
  }

  function handleDeviceChange(device: string) {
    setSelectedDevice(device);
    deviceRef.current = device;
    send({ type: 'request_chart_data', message: { area: areaRef.current, device, range: rangeRef.current } });
    if (device !== 'all') {
      const dev = rdevRef.current.find(d => d.id === device);
      const rangeLabel = rangeRef.current === 24 ? '24 giờ' : rangeRef.current === 168 ? '7 ngày' : '30 ngày';
      if (dev) setChartSubtitle(`${dev.name} • ${rangeLabel}`);
    }
  }

  function handleRangeChange(range: number) {
    setSelectedRange(range);
    rangeRef.current = range;
    send({ type: 'request_chart_data', message: { area: areaRef.current, device: deviceRef.current, range } });
    const rangeLabel = range === 24 ? '24 giờ' : range === 168 ? '7 ngày' : '30 ngày';
    const grp = groups.find(g => (g.displaygrouid || g.displaygroupid) === areaRef.current);
    const areaName = grp ? grp.name : areaRef.current === 'all' ? allAreasLabel : areaRef.current;
    setChartSubtitle(`${areaName} • ${rangeLabel}`);
  }

  function openDeviceModal(dev: DeviceRuntime) {
    setModalDevice(dev);
    setShowModal(true);
    setTimeout(() => {
      if (!modalSparkRef.current) return;
      modalSparkInst.current?.destroy();
      const sc = dev.status === 'ok' ? '#22d369' : dev.status === 'warn' ? '#f5a623' : '#f44b4b';
      modalSparkInst.current = new Chart(modalSparkRef.current, {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: sc, backgroundColor: sc + '1a',
          borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
          plugins: { legend: { display: false },
            tooltip: { backgroundColor: '#111c2b', borderColor: 'rgba(56,139,253,0.28)', borderWidth: 1,
              bodyColor: '#e6eef8', padding: 6,
              callbacks: { label: (c: { parsed: { y: number } }) => ` ${fmt(c.parsed.y, 1)} kW` } } },
          scales: { x: { display: false }, y: { display: false, min: 0 } },
        },
      });
    }, 50);
  }

  function closeModal() {
    setShowModal(false);
    setTimeout(() => {
      modalSparkInst.current?.destroy();
      modalSparkInst.current = null;
      setModalDevice(null);
    }, 250);
  }

  // ── Derived ────────────────────────────────────────────────────
  const shift          = currentShift();
  const filteredDevs   = selectedArea === 'all' ? runtimeDevices : runtimeDevices.filter(d => d.area === selectedArea);
  const activeAlerts   = alerts
    .filter(a => !a.isComplete && !a.resolved)
    .sort((a, b) => new Date(b.createdAt || b.timestamp || 0).getTime() - new Date(a.createdAt || a.timestamp || 0).getTime());
  const filteredAlerts = alertFilter === 'all' ? activeAlerts : activeAlerts.filter(a => {
    if (alertFilter === 'error') return ['critical', 'error', 'red'].includes(a.severity || a.level || '');
    return ['warning', 'warn', 'orange', 'yellow'].includes(a.severity || a.level || '');
  });

  const groupedAreas = groups.map((g, i) => {
    const key     = g.displaygrouid || g.displaygroupid || '';
    const aDevs   = runtimeDevices.filter(d => d.area === key);
    const totalPow = aDevs.reduce((s, d) => s + d.power, 0);
    const hasErr  = aDevs.some(d => d.status === 'error');
    const hasWarn = aDevs.some(d => d.status === 'warn');
    const status  = hasErr ? 'error' : hasWarn ? 'warn' : 'ok';
    return {
      key, name: g.name, color: SHARE_COLORS[i % SHARE_COLORS.length],
      devs: aDevs, totalPow, status,
      dotColor: status === 'ok' ? 'var(--green)' : status === 'warn' ? 'var(--yellow)' : 'var(--red)',
      stLabel: status === 'ok' ? 'Bình thường' : status === 'warn' ? 'Cảnh báo' : 'Lỗi',
    };
  });

  const displayGroups = selectedArea === 'all' ? groupedAreas : groupedAreas.filter(g => g.key === selectedArea);
  const onlineAreas   = displayGroups.filter(g => g.status !== 'error').length;
  const grandTotal    = groupedAreas.reduce((s, g) => s + g.devs.reduce((ss, d) => ss + d.energy, 0), 0) || 1;
  const shareData     = groupedAreas.map(g => {
    const kwh = g.devs.reduce((s, d) => s + d.energy, 0);
    return { ...g, kwh, pct: Math.round(kwh / grandTotal * 100) };
  });
  const totalEnergyAll = shareData.reduce((s, g) => s + g.kwh, 0);
  const thresholdColor = thresholdPct >= 90 ? 'var(--red)' : thresholdPct >= 70 ? 'var(--yellow)' : 'var(--green)';
  const peakBarBg      = peakPct > 90
    ? 'linear-gradient(90deg,#f5a623,#f44b4b)'
    : peakPct > 70 ? 'linear-gradient(90deg,#22d369,#f5a623)' : 'linear-gradient(90deg,#22d369,#38aaff)';

  const topbarRight = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="status-live">
        <div className="pulse-dot" style={{
          background: connected ? 'var(--green)' : 'var(--red)',
          boxShadow: connected ? '0 0 6px var(--green)' : 'none',
          animation: connected ? undefined : 'none',
        }} />
        REALTIME
      </div>
      <div className="realtime-clock">{clock}</div>
      <div className="filter-row">
        <select className="filter-select" value={selectedArea} onChange={e => handleAreaChange(e.target.value)}>
          <option value="all">{!storeUser || storeUser.role === 'Admin' ? 'Toàn nhà máy' : 'Tất cả khu vực'}</option>
          {groups.map(g => {
            const k = g.displaygrouid || g.displaygroupid || '';
            return <option key={k} value={k}>{g.name}</option>;
          })}
        </select>
        {selectedArea !== 'all' && (
          <select className="filter-select" value={selectedDevice} onChange={e => handleDeviceChange(e.target.value)}>
            <option value="all">Tất cả thiết bị</option>
            {filteredDevs.map(d => <option key={d.id} value={d.id}>{d.id} · {d.name}</option>)}
          </select>
        )}
        <select className="filter-select" value={selectedRange} onChange={e => handleRangeChange(Number(e.target.value))}>
          <option value={24}>24 giờ</option>
          <option value={168}>7 ngày</option>
          <option value={720}>30 ngày</option>
        </select>
      </div>
      <button className="btn-icon" title="Export CSV"><i className="bi bi-download" /></button>
      <button className="btn-icon" title="Làm mới" onClick={() => {
        loadAlerts();
        send({ type: 'request_chart_data', message: { area: areaRef.current, device: deviceRef.current, range: rangeRef.current } });
      }}><i className="bi bi-arrow-clockwise" /></button>
    </div>
  );

  return (
    <Layout title="Dashboard Năng Lượng" breadcrumb={['ViPower', 'Nhà máy Xử lý Nước', 'Dashboard']} topbarRight={topbarRight}>

      {/* ── Shift bar ─────────────────────────────────────────── */}
      <div className="shift-bar">
        <i className="bi bi-clock-history" style={{ color: 'var(--text-muted)', fontSize: 14 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Ca làm việc</span>
        <div className="shift-sep">|</div>
        {[{ label: 'Ca A', start: 0, end: 8 }, { label: 'Ca B', start: 8, end: 16 }, { label: 'Ca C', start: 16, end: 24 }].map((s, i) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div className="shift-item">
              <span className={`shift-badge ${s.label === shift.label ? 'active' : 'idle'}`}>{s.label}</span>
              <span className="shift-range">{String(s.start).padStart(2, '0')}:00 – {String(s.end).padStart(2, '0')}:00</span>
            </div>
            {i < 2 && <div className="shift-sep" style={{ marginLeft: 4 }}>·</div>}
          </div>
        ))}
        <div className="shift-info">Ca hiện tại tiêu thụ <strong>{fmt(shiftEnergy, 1)}</strong> kWh</div>
      </div>

      {/* ── Peak banner ───────────────────────────────────────── */}
      <div className="peak-banner">
        <div className="peak-banner-title"><i className="bi bi-lightning-fill" /><span>Peak Demand</span></div>
        <div className="peak-banner-item">
          <span className="label">Hôm nay – Đỉnh</span>
          <span className="val yellow">{fmt(peakToday, 1)} kW</span>
        </div>
        <div className="peak-banner-sep" />
        <div className="peak-banner-item">
          <span className="label">Thời điểm</span>
          <span className="val" style={{ fontSize: 14 }}>{peakTime}</span>
        </div>
        <div className="peak-banner-sep" />
        <div className="peak-banner-item">
          <span className="label">Hôm qua – Đỉnh</span>
          <span className="val green">{fmt(peakYesterday, 1)} kW</span>
        </div>
        <div className="peak-banner-sep" />
        <div className="peak-banner-item">
          <span className="label">Tháng này – Đỉnh</span>
          <span className="val red">{fmt(peakMonth, 1)} kW</span>
        </div>
        <div className="peak-banner-sep" />
        <div className="peak-progress-wrap">
          <div className="peak-progress-label">
            <span>Mức dùng hiện tại vs. Đỉnh tháng</span>
            <span style={{ color: 'var(--yellow)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{peakPct}%</span>
          </div>
          <div className="peak-bar-track">
            <div className="peak-bar-fill" style={{ width: `${peakPct}%`, background: peakBarBg }} />
          </div>
        </div>
      </div>

      {/* ── KPI grid ──────────────────────────────────────────── */}
      <div className="kpi-grid">
        {/* Energy */}
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--accent)', ['--kpi-bg' as string]: 'var(--accent-dim)', ['--kpi-border' as string]: 'var(--border-bright)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Điện năng hôm nay</div>
              <div className="kpi-value">{fmt(kpiEnergy, 1)} <sup>kWh</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-lightning-charge-fill" /></div>
          </div>
          <div className="kpi-footer">
            <div>
              <div className="kpi-delta"><i className="bi bi-dash" /> --%</div>
              <div className="kpi-vs">vs. hôm qua</div>
            </div>
            <canvas className="kpi-spark" ref={sparkEnergyRef} />
          </div>
        </div>

        {/* Power */}
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--green)', ['--kpi-bg' as string]: 'var(--green-glow)', ['--kpi-border' as string]: 'rgba(34,211,105,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Công suất tức thời</div>
              <div className="kpi-value">{fmt(kpiPower, 1)} <sup>kW</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-speedometer2" /></div>
          </div>
          <div className="kpi-footer">
            <div>
              <div className="kpi-delta"><i className="bi bi-dash" /> --%</div>
              <div className="kpi-vs">vs. hôm qua giờ này</div>
            </div>
            <canvas className="kpi-spark" ref={sparkPowerRef} />
          </div>
        </div>

        {/* Efficiency */}
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--yellow)', ['--kpi-bg' as string]: 'var(--yellow-glow)', ['--kpi-border' as string]: 'rgba(245,166,35,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Hiệu suất bơm</div>
              <div className="kpi-value">{kpiEff != null ? fmt(kpiEff, 2) : '--'} <sup>kWh/m³</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-water" /></div>
          </div>
          <div className="kpi-footer">
            <div>
              <div className="kpi-delta"><i className="bi bi-dash" /> --%</div>
              <div className="kpi-vs">vs. baseline</div>
            </div>
            <canvas className="kpi-spark" ref={sparkEffRef} />
          </div>
        </div>

        {/* Alerts */}
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--red)', ['--kpi-bg' as string]: 'var(--red-glow)', ['--kpi-border' as string]: 'rgba(244,75,75,.3)' }}>
          <div className="kpi-card-top">
            <div>
              <div className="kpi-label">Cảnh báo active</div>
              <div className="kpi-value">{activeAlerts.length} <sup>active</sup></div>
            </div>
            <div className="kpi-icon"><i className="bi bi-bell-fill" /></div>
          </div>
          <div className="kpi-footer">
            <div>
              <div className={`kpi-delta ${activeAlerts.length ? 'down' : 'up'}`}>
                <i className={`bi bi-arrow-${activeAlerts.length ? 'up' : 'down'}-short`} /> {activeAlerts.length} active
              </div>
              <div className="kpi-vs">so với hôm qua</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              <span style={{ color: 'var(--red)' }}>{alertsCrit} critical</span><br />
              <span style={{ color: 'var(--yellow)' }}>{alertsWarn} warning</span>
            </div>
          </div>
        </div>
      </div>

      <div className="section-row">
        <span className="section-label">Biểu đồ công suất & trạng thái</span>
        <div className="section-line" />
      </div>

      {/* ── Charts grid ───────────────────────────────────────── */}
      <div className="grid-main">
        {/* Main chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-activity" />Công suất thời gian thực</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{chartSubtitle}</span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
            </div>
          </div>
          <div className="chart-wrap"><canvas ref={chartRef} /></div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {[
              { color: 'var(--accent)', label: 'Công suất (kW)', dash: false, box: false },
              { color: 'var(--red)',    label: 'Ngưỡng cảnh báo', dash: true,  box: false },
              { color: 'rgba(56,170,255,.15)', label: 'Hôm qua', dash: false, box: true },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)' }}>
                {l.box
                  ? <div style={{ width: 12, height: 12, background: l.color, borderRadius: 2 }} />
                  : <div style={{ width: 20, height: 2, background: l.color, borderRadius: 2, borderStyle: l.dash ? 'dashed' : 'none' }} />
                }
                {l.label}
              </div>
            ))}
          </div>
          {/* Insight bar */}
          <div className="chart-insight-bar">
            <div className="chart-insight-item">
              <span className="chart-insight-label">Công suất hiện tại</span>
              <span className="chart-insight-val accent">{fmt(kpiPower, 1)} kW</span>
            </div>
            <div className="chart-insight-item">
              <span className="chart-insight-label">Giờ cao điểm hôm nay</span>
              <span className="chart-insight-val yellow">{peakTime}</span>
            </div>
            <div className="chart-insight-item">
              <span className="chart-insight-label">Điện năng ca này</span>
              <span className="chart-insight-val green">{fmt(shiftEnergy, 1)} kWh</span>
            </div>
            <div className="chart-insight-item">
              <span className="chart-insight-label">% so ngưỡng</span>
              <span className="chart-insight-val" style={{ color: thresholdColor }}>{thresholdPct}%</span>
            </div>
          </div>
        </div>

        {/* Area status + share bar */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-diagram-3" />Trạng thái khu vực</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{onlineAreas}/{displayGroups.length} online</span>
          </div>
          <div className="area-status-list">
            {displayGroups.map(g => (
              <div key={g.key} className="area-item">
                <div className="area-dot" style={{ background: g.dotColor, color: g.dotColor }} />
                <div className="area-item-info">
                  <div className="area-item-name">{g.name}</div>
                  <div className="area-item-sub">{g.stLabel} · {g.devs.length} thiết bị</div>
                </div>
                <div className="area-item-power">{fmt(g.totalPow, 1)}<br /><small>kW</small></div>
              </div>
            ))}
          </div>
          {/* Share bar */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div className="card-title" style={{ marginBottom: 12 }}>
              <i className="bi bi-bar-chart-steps" />Tỷ trọng tiêu thụ theo khu vực
            </div>
            <div className="share-stacked-wrap">
              <div className="share-bar-track">
                {shareData.map((g, i) => (
                  <div key={g.key} className="share-bar-seg"
                    style={{
                      width: `${g.pct || 0}%`,
                      background: SHARE_COLORS[i % SHARE_COLORS.length],
                      opacity: selectedArea !== 'all' && g.key !== selectedArea ? 0.25 : 1,
                      cursor: 'pointer',
                    }}
                    title={`${g.name}: ${g.kwh.toLocaleString('vi-VN')} kWh (${g.pct}%)`}
                    onClick={() => handleAreaChange(g.key)}
                  />
                ))}
              </div>
              <div className="share-legend">
                {shareData.map((g, i) => (
                  <div key={g.key} className="share-legend-row"
                    style={{ opacity: selectedArea !== 'all' && g.key !== selectedArea ? 0.45 : 1 }}
                    onClick={() => handleAreaChange(g.key)}>
                    <div className="share-color-dot" style={{ background: SHARE_COLORS[i % SHARE_COLORS.length] }} />
                    <span className="share-name">{g.name}</span>
                    <span className="share-kwh">{g.kwh.toLocaleString('vi-VN')} kWh</span>
                    <span className="share-pct" style={{ background: SHARE_COLORS[i % SHARE_COLORS.length] + '22', color: SHARE_COLORS[i % SHARE_COLORS.length] }}>{g.pct}%</span>
                  </div>
                ))}
              </div>
              <div className="share-total-row">
                <span className="share-total-lbl">Tổng điện năng hôm nay</span>
                <span className="share-total-val">{totalEnergyAll.toLocaleString('vi-VN')} kWh</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-row">
        <span className="section-label">Phân tích thiết bị & cảnh báo</span>
        <div className="section-line" />
      </div>

      {/* ── Bottom grid ───────────────────────────────────────── */}
      <div className="grid-bottom">
        {/* Top 5 consumers */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-sort-down" />Top 5 tiêu thụ cao nhất</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>kWh hôm nay</span>
          </div>
          <div className="consumer-list">
            {topConsumers.length === 0 ? (
              <div className="empty-state" style={{ padding: 20 }}><i className="bi bi-bar-chart" />Chưa có dữ liệu</div>
            ) : topConsumers.map((c, i) => {
              const maxKwh    = topConsumers[0]?.kwh || 1;
              const totalE    = runtimeDevices.reduce((s, d) => s + d.energy, 0) || 1;
              const share     = Math.round(c.kwh / totalE * 100);
              const areaName  = groupedAreas.find(g => g.key === c.area)?.name || c.area;
              return (
                <div key={c.id} className="consumer-item">
                  <div className="consumer-row">
                    <span className="consumer-name">
                      <span style={{ color: SHARE_COLORS[i], fontFamily: 'var(--font-mono)', fontSize: 11, marginRight: 4 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {c.name}
                    </span>
                    <span className="consumer-kw">{fmt(c.kwh, 1)} kWh</span>
                  </div>
                  <div className="consumer-bar-track">
                    <div className="consumer-bar-fill" style={{ width: `${(c.kwh / maxKwh) * 100}%`, background: SHARE_COLORS[i] }} />
                  </div>
                  <span className="consumer-share">{c.id} · {areaName} · {share}% tổng</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Device list */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-hdd-stack" />Danh sách thiết bị</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{filteredDevs.length} thiết bị</span>
              {selectedArea !== 'all' && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-bright)', fontFamily: 'var(--font-mono)' }}>
                  {groups.find(g => (g.displaygrouid || g.displaygroupid) === selectedArea)?.name || selectedArea}
                </span>
              )}
            </div>
          </div>
          {selectedArea !== 'all' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', border: '1px solid var(--border-bright)', marginBottom: 10, fontSize: 11.5, color: 'var(--accent)' }}>
              <i className="bi bi-cursor-fill" style={{ fontSize: 12 }} />
              Click vào thiết bị để xem phân tích chi tiết
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {filteredDevs.map(d => {
              const sc         = d.status === 'ok' ? 'var(--green)' : d.status === 'warn' ? 'var(--yellow)' : 'var(--red)';
              const sl         = d.status === 'ok' ? 'OK' : d.status === 'warn' ? 'WARN' : 'ERR';
              const isSelected = selectedDevice !== 'all' && d.id === selectedDevice;
              return (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: isSelected ? 'var(--bg-hover)' : 'var(--bg-elevated)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  transition: 'var(--transition)',
                  cursor: selectedArea !== 'all' ? 'pointer' : 'default',
                }}
                  onClick={() => selectedArea !== 'all' ? openDeviceModal(d) : undefined}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: sc, boxShadow: `0 0 6px ${sc}`, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: isSelected ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isSelected ? 'var(--accent)' : 'inherit' }}>{d.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{d.id} · {fmt(d.energy, 1)} kWh</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmt(d.power, 1)} kW</div>
                    <div style={{ fontSize: 10, color: sc, fontWeight: 700 }}>{sl}</div>
                  </div>
                  {selectedArea !== 'all' && <i className="bi bi-arrow-right-short" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-dim)', fontSize: 15, flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Alerts */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-exclamation-triangle" />Cảnh báo gần nhất</span>
            <div className="alert-tabs">
              {(['all', 'error', 'warn'] as const).map(f => (
                <button key={f} className={`alert-tab${alertFilter === f ? ` active-${f}` : ''}`}
                  onClick={() => setAlertFilter(f)}>
                  {f === 'all' ? 'Tất cả' : f === 'error' ? 'Lỗi' : 'Warn'}
                </button>
              ))}
            </div>
          </div>
          {filteredAlerts.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              <i className="bi bi-bell-slash" />Không có cảnh báo nào.
            </div>
          ) : (
            <div id="alertList">
              {filteredAlerts.slice(0, 6).map(a => {
                const rawSev  = a.severity || a.level || 'info';
                const sev     = ({ warning: 'warn', critical: 'error', orange: 'warn', red: 'error', yellow: 'warn' } as Record<string, string>)[rawSev] ?? rawSev;
                const s       = SEV_CONFIG[sev] || SEV_CONFIG.info;
                const devName = deviceMap[a.deviceid] || a.deviceid || '--';
                return (
                  <div key={a._id} className="alert-item">
                    <div className={`alert-icon ${sev}`}><i className={`bi ${s.icon}`} /></div>
                    <div className="alert-body">
                      <div className="alert-title">{devName}: {a.message || '--'}</div>
                      <div className="alert-time">{fmtAlertDate(a.createdAt || a.timestamp)} · {fmtTime(a.createdAt || a.timestamp)}</div>
                    </div>
                    <div className={`alert-badge ${sev}`}>{sev.toUpperCase()}</div>
                  </div>
                );
              })}
            </div>
          )}
          <a href="/alerts" className="alert-see-all" onClick={e => { e.preventDefault(); navigate('/alerts'); }}>
            Xem tất cả cảnh báo <i className="bi bi-arrow-right" />
          </a>
        </div>
      </div>

      {/* ── Device Detail Modal ────────────────────────────────── */}
      <div className={`device-modal-backdrop${showModal ? ' open' : ''}`}
        onClick={e => { if ((e.target as HTMLElement).classList.contains('device-modal-backdrop')) closeModal(); }}>
        <div className="device-modal">
          {modalDevice && (() => {
            const sc      = modalDevice.status === 'ok' ? '#22d369' : modalDevice.status === 'warn' ? '#f5a623' : '#f44b4b';
            const stLabel = modalDevice.status === 'ok' ? 'Đang hoạt động bình thường' : modalDevice.status === 'warn' ? 'Cảnh báo — cần kiểm tra' : 'Lỗi — ngừng hoạt động';
            const stIcon  = modalDevice.status === 'ok' ? 'bi-check-circle-fill' : modalDevice.status === 'warn' ? 'bi-exclamation-triangle-fill' : 'bi-x-octagon-fill';
            return (
              <>
                <div className="device-modal-header">
                  <div className="device-modal-title">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: sc, boxShadow: `0 0 8px ${sc}` }} />
                    <span className="device-modal-name">{modalDevice.name}</span>
                    <span className="device-modal-id">{modalDevice.id}</span>
                  </div>
                  <button className="device-modal-close" onClick={closeModal}><i className="bi bi-x-lg" /></button>
                </div>
                <div className="device-modal-body">
                  <div className="device-modal-stats">
                    <div className="device-stat">
                      <div className="device-stat-label">Công suất tức thời</div>
                      <div className="device-stat-val">{fmt(modalDevice.power, 1)}<small> kW</small></div>
                    </div>
                    <div className="device-stat">
                      <div className="device-stat-label">Điện năng hôm nay</div>
                      <div className="device-stat-val">{fmt(modalDevice.energy, 1)}<small> kWh</small></div>
                    </div>
                    <div className="device-stat">
                      <div className="device-stat-label">Lưu lượng</div>
                      <div className="device-stat-val"><small style={{ color: 'var(--text-dim)' }}>Không có</small></div>
                    </div>
                    <div className="device-stat">
                      <div className="device-stat-label">Hiệu suất</div>
                      <div className="device-stat-val"><small style={{ color: 'var(--text-dim)' }}>--</small></div>
                    </div>
                  </div>
                  <div className="device-modal-spark-wrap">
                    <div className="device-modal-spark-title">Công suất 24h qua</div>
                    <div className="device-modal-spark"><canvas ref={modalSparkRef} /></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 'var(--radius-sm)', fontSize: 12.5, background: sc + '18', border: `1px solid ${sc}40` }}>
                    <i className={`bi ${stIcon}`} style={{ color: sc, fontSize: 15 }} />
                    <span style={{ color: sc, fontWeight: 600 }}>{stLabel}</span>
                  </div>
                </div>
                <div className="device-modal-footer">
                  <button className="btn-modal btn-modal-ghost" onClick={closeModal}>Đóng</button>
                  <button className="btn-modal btn-modal-primary" onClick={() => { navigate(`/analysis?deviceid=${modalDevice.id}`); closeModal(); }}>
                    <i className="bi bi-graph-up-arrow" style={{ marginRight: 6 }} />Xem phân tích chi tiết
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      </div>

    </Layout>
  );
}

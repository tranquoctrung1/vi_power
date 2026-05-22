import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Chart } from 'chart.js';
import Pager from '../components/Pager';
import { exportCSV } from '../utils/exportCSV';
import '../utils/chartDefaults';

type RangePeriod = 'today' | '7d' | 'month' | 'lastmonth' | 'custom';

interface Device {
  deviceid: string;
  deviceName?: string;
  location?: string;
  samplingCycle?: number;
  displaygroupid?: string;
}

interface DisplayGroup {
  _id: string;
  displaygrouid: string;
  name?: string;
  groupName?: string;
}

interface EnergyRow {
  timestamp: string;
  power?: number;
  per?: number;
}

const RANGE_OPTS: { id: RangePeriod; label: string }[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
  { id: 'lastmonth', label: 'Tháng trước' },
  { id: 'custom', label: 'Tùy chọn' },
];


const CHART_COLORS = ['#38aaff', '#22d369', '#a855f7', '#f5a623', '#f44b4b', '#ff7043'];
const PAGE_SIZE = 20;

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}

function fmtDelta(curr: number, prev: number): { text: string; cls: string } {
  if (!prev) return { text: '--', cls: '' };
  const pct = ((curr - prev) / prev) * 100;
  return { text: `${pct >= 0 ? '↑ +' : '↓ '}${Math.abs(pct).toFixed(1)}%`, cls: pct >= 0 ? 'up' : 'down' };
}

function computePeriod(range: RangePeriod, dateFrom: string, dateTo: string) {
  const now = new Date();
  let start: Date, end: Date, prevStart: Date, prevEnd: Date, prevLabel: string;
  if (range === 'today') {
    start = new Date(now); start.setHours(0, 0, 0, 0);
    end = new Date(now);
    prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 1);
    prevEnd = new Date(start); prevEnd.setMilliseconds(-1);
    prevLabel = 'Hôm qua';
  } else if (range === '7d') {
    start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
    end = new Date(now);
    prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 7);
    prevEnd = new Date(start); prevEnd.setMilliseconds(-1);
    prevLabel = '7 ngày trước';
  } else if (range === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    prevLabel = `Tháng ${now.getMonth() || 12}`;
  } else if (range === 'lastmonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
    prevLabel = `Tháng ${now.getMonth() === 0 ? 11 : now.getMonth() - 1 || 12}`;
  } else {
    start = dateFrom ? (() => { const d = new Date(dateFrom); d.setHours(0,0,0,0); return d; })() : (() => { const d = new Date(); d.setDate(d.getDate()-6); d.setHours(0,0,0,0); return d; })();
    end = dateTo ? (() => { const d = new Date(dateTo); d.setHours(23,59,59,999); return d; })() : new Date();
    const dur = end.getTime() - start.getTime();
    prevEnd = new Date(start.getTime() - 1);
    prevStart = new Date(start.getTime() - dur);
    prevLabel = 'Kỳ trước';
  }
  return { start, end, prevStart, prevEnd, prevLabel };
}

function heatColor(val: number, max: number): string {
  if (!max || !val) return 'rgba(13,21,32,1)';
  const t = Math.min(val / max, 1);
  if (t < 0.5) {
    const s = t * 2;
    return `rgb(${Math.round(13 + s * 43)},${Math.round(21 + s * 149)},${Math.round(32 + s * 223)})`;
  }
  const s = (t - 0.5) * 2;
  return `rgb(${Math.round(56 + s * 189)},${Math.round(170 - s * 4)},${Math.round(255 - s * 220)})`;
}

export default function ReportPage() {
  useAuth();
  const { showToast } = useToast();
  const storeUser = useAuthStore(s => s.user);
  const allAreasLabel = !storeUser || storeUser.role === 'Admin' ? 'Toàn nhà máy' : 'Tất cả khu vực';

  function filterGroupsByPermission(grps: DisplayGroup[]): DisplayGroup[] {
    if (!storeUser || storeUser.role === 'Admin') return grps;
    const allowed = storeUser.allowedAreas || [];
    if (allowed.length === 0) return [];
    return grps.filter(g => allowed.includes(g.displaygrouid || g._id));
  }

  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DisplayGroup[]>([]);
  const [selArea, setSelArea] = useState('all');
  const [selDevice, setSelDevice] = useState('all');
  const [range, setRange] = useState<RangePeriod>('7d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [comparePeriodText, setComparePeriodText] = useState('--');

  // KPI
  const [currKwh, setCurrKwh] = useState<number | null>(null);
  const [prevKwh, setPrevKwh] = useState<number | null>(null);
  const [currPeak, setCurrPeak] = useState<number | null>(null);
  const [prevPeak, setPrevPeak] = useState<number | null>(null);

  // Heatmap (7 days x 24 hours)
  const [heatmap, setHeatmap] = useState<number[][]>([]);
  const [heatMax, setHeatMax] = useState(1);

  // Table
  const [tableRows, setTableRows] = useState<{ time: string; device: string; area: string; areaId: string; power: number; kwh: number; pf: number | null; status: string }[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const [sortCol, setSortCol] = useState('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const powerRef = useRef<HTMLCanvasElement>(null);
  const areaRef  = useRef<HTMLCanvasElement>(null);
  const cumRef   = useRef<HTMLCanvasElement>(null);
  const powerInst = useRef<Chart | null>(null);
  const areaInst  = useRef<Chart | null>(null);
  const cumInst   = useRef<Chart | null>(null);

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => {
    if (devices.length > 0) loadReport();
  }, [range, selArea, selDevice, devices]);

  useEffect(() => {
    return () => { powerInst.current?.destroy(); areaInst.current?.destroy(); cumInst.current?.destroy(); };
  }, []);

  async function loadMeta() {
    try {
      const [dr, gr] = await Promise.all([apiGet('/devices?limit=1000'), apiGet('/display-groups?limit=1000')]);
      const dj = await dr.json(); const gj = await gr.json();
      setDevices(dj.data || dj.devices || []);
      setGroups(filterGroupsByPermission(gj.data?.data || gj.data || []));
    } catch {}
  }

  function getGroupName(gid?: string): string {
    if (!gid) return '--';
    const g = groups.find(g => g.displaygrouid === gid || g._id === gid);
    return g ? (g.groupName || g.name || gid) : gid;
  }

  function getTargets(): Device[] {
    if (selDevice !== 'all') return devices.filter(d => d.deviceid === selDevice);
    if (selArea !== 'all') return devices.filter(d => d.displaygroupid === selArea);
    return devices;
  }

  function getAreaDevices(): Device[] {
    if (selArea !== 'all') return devices.filter(d => d.displaygroupid === selArea);
    return devices;
  }

  async function loadReport() {
    const targets = getTargets();
    if (!targets.length) return;

    setLoading(true);
    setCurrKwh(null); setPrevKwh(null); setCurrPeak(null); setPrevPeak(null); setTableRows([]);

    const { start, end, prevStart, prevEnd } = computePeriod(range, dateFrom, dateTo);
    const fmtD = (d: Date) => d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
    setComparePeriodText(`${fmtD(prevStart)} – ${fmtD(prevEnd)}`);

    const duration = end.getTime() - start.getTime();
    const isDaily = duration >= 86400000;
    const bucketMs = isDaily ? 86400000 : 3600000;
    const bucketCount = Math.max(1, Math.ceil(duration / bucketMs));

    try {
      const [currRes, prevRes] = await Promise.all([
        Promise.all(targets.map(d =>
          apiGet(`/data/energy/${encodeURIComponent(d.deviceid)}?startTime=${start.toISOString()}&endTime=${end.toISOString()}&limit=5000&sort=asc`)
            .then(r => r.json()).then(j => ({ device: d, rows: (j.data || []) as EnergyRow[] }))
            .catch(() => ({ device: d, rows: [] as EnergyRow[] }))
        )),
        Promise.all(targets.map(d =>
          apiGet(`/data/energy/${encodeURIComponent(d.deviceid)}?startTime=${prevStart.toISOString()}&endTime=${prevEnd.toISOString()}&limit=5000&sort=asc`)
            .then(r => r.json()).then(j => ({ device: d, rows: (j.data || []) as EnergyRow[] }))
            .catch(() => ({ device: d, rows: [] as EnergyRow[] }))
        )),
      ]);

      // Current period aggregation
      const cBuckets = Array(bucketCount).fill(0);
      const cCounts  = Array(bucketCount).fill(0);
      let peakCurr = 0;
      const tableData: typeof tableRows = [];

      currRes.forEach(({ device, rows }) => {
        rows.forEach(row => {
          const bi = Math.floor((new Date(row.timestamp).getTime() - start.getTime()) / bucketMs);
          if (bi >= 0 && bi < bucketCount) { cBuckets[bi] += (row.power || 0); cCounts[bi]++; }
          if ((row.power || 0) > peakCurr) peakCurr = row.power || 0;
          tableData.push({ time: new Date(row.timestamp).toLocaleString('vi-VN'), device: device.deviceName || device.deviceid, area: getGroupName(device.displaygroupid), areaId: device.displaygroupid || '', power: row.power || 0, kwh: (row.power || 0) * ((device.samplingCycle || 60) / 3600), pf: row.per ?? null, status: (row.power || 0) > 0 ? 'ok' : 'error' });
        });
      });

      const avgPow = cBuckets.map((s, i) => cCounts[i] ? s / cCounts[i] : 0);
      const kwhBuckets = avgPow.map(p => p * (bucketMs / 3600000));
      const totalKwh = kwhBuckets.reduce((a, b) => a + b, 0);

      // Previous period aggregation
      const pBuckets = Array(bucketCount).fill(0);
      const pCounts  = Array(bucketCount).fill(0);
      let peakPrev = 0;
      prevRes.forEach(({ rows }) => {
        rows.forEach(row => {
          const bi = Math.floor((new Date(row.timestamp).getTime() - prevStart.getTime()) / bucketMs);
          if (bi >= 0 && bi < bucketCount) { pBuckets[bi] += (row.power || 0); pCounts[bi]++; }
          if ((row.power || 0) > peakPrev) peakPrev = row.power || 0;
        });
      });
      const prevAvgPow = pBuckets.map((s, i) => pCounts[i] ? s / pCounts[i] : 0);
      const prevKwhBuckets = prevAvgPow.map(p => p * (bucketMs / 3600000));
      const prevTotalKwh = prevKwhBuckets.reduce((a, b) => a + b, 0);

      setCurrKwh(totalKwh); setPrevKwh(prevTotalKwh);
      setCurrPeak(peakCurr); setPrevPeak(peakPrev);
      setTableRows(tableData);
      setTablePage(1);

      // Labels
      const labels: string[] = [];
      for (let i = 0; i < bucketCount; i++) {
        const d = new Date(start.getTime() + i * bucketMs);
        labels.push(isDaily ? `${d.getDate()}/${d.getMonth() + 1}` : `${String(d.getHours()).padStart(2,'0')}:00`);
      }

      buildPowerChart(labels, avgPow, prevAvgPow);
      buildAreaChart(labels, kwhBuckets);
      buildCumChart(labels, kwhBuckets, prevKwhBuckets);
      buildHeatmap(currRes);

    } catch {
      showToast('Lỗi tải báo cáo', 'error');
    } finally {
      setLoading(false);
    }
  }

  const THRESHOLD_KW = 700;

  function buildPowerChart(labels: string[], curr: number[], prev: number[]) {
    const canvas = powerRef.current; if (!canvas) return;
    powerInst.current?.destroy();
    powerInst.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Kỳ này (kW)', data: curr.map(v => +v.toFixed(2)), borderColor: '#38aaff', backgroundColor: 'rgba(56,170,255,0.08)', borderWidth: 2, pointRadius: labels.length > 30 ? 0 : 2, tension: 0.4, fill: true },
          { label: 'Kỳ trước (kW)', data: prev.map(v => +v.toFixed(2)), borderColor: 'rgba(56,170,255,0.3)', borderWidth: 1.5, pointRadius: 0, tension: 0.4, borderDash: [4, 3] as number[], fill: false },
          { label: `Ngưỡng ${THRESHOLD_KW} kW`, data: Array(labels.length).fill(THRESHOLD_KW), borderColor: 'rgba(244,75,75,0.6)', borderWidth: 1.5, borderDash: [6, 4] as number[], pointRadius: 0, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#111c2b', borderColor: 'rgba(56,139,253,.28)', borderWidth: 1, titleColor: '#607b99', bodyColor: '#e6eef8', padding: 10 } },
        scales: { x: { grid: { color: 'rgba(56,139,253,.05)' }, ticks: { color: '#3a506b', font: { size: 10 }, maxTicksLimit: 12 } }, y: { grid: { color: 'rgba(56,139,253,.07)' }, ticks: { color: '#607b99', font: { size: 10 } }, beginAtZero: true } },
      },
    });
  }

  function buildAreaChart(labels: string[], data: number[]) {
    const canvas = areaRef.current; if (!canvas) return;
    const color = '#38aaff';
    areaInst.current?.destroy();
    areaInst.current = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Điện năng (kWh)', data: data.map(v => +v.toFixed(2)), backgroundColor: color + '99', borderColor: color, borderWidth: 0, borderRadius: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111c2b', borderColor: 'rgba(56,139,253,.28)', borderWidth: 1,
            titleColor: '#607b99', bodyColor: '#e6eef8', padding: 10,
            callbacks: { label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${c.dataset.label}: ${Number(c.parsed.y ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kWh` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(56,139,253,.05)' }, ticks: { color: '#3a506b', font: { size: 10 }, maxTicksLimit: 12 } },
          y: { grid: { color: 'rgba(56,139,253,.08)' }, ticks: { color: '#607b99', font: { size: 10 } }, beginAtZero: true },
        },
      },
    });
  }

  function buildCumChart(labels: string[], curr: number[], prev: number[]) {
    const canvas = cumRef.current; if (!canvas) return;
    let cc = 0, cp = 0;
    const cumCurr = curr.map(v => { cc += v; return +cc.toFixed(2); });
    const cumPrev = prev.map(v => { cp += v; return +cp.toFixed(2); });
    cumInst.current?.destroy();
    cumInst.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Kỳ này', data: cumCurr, borderColor: '#22d369', backgroundColor: 'rgba(34,211,105,0.08)', borderWidth: 2, pointRadius: 0, tension: 0.35, fill: true },
          { label: 'Kỳ trước', data: cumPrev, borderColor: 'rgba(245,166,35,0.6)', borderWidth: 1.5, pointRadius: 0, tension: 0.35, borderDash: [5, 3] as number[], fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) => ` ${c.dataset.label}: ${Number(c.parsed.y ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kWh` } },
        },
        scales: { x: { ticks: { color: '#607b99', font: { size: 9 }, maxTicksLimit: 10 }, grid: { display: false } }, y: { ticks: { color: '#607b99', font: { size: 10 } }, grid: { color: 'rgba(56,139,253,0.08)' }, beginAtZero: true } },
      },
    });
  }

  function buildHeatmap(results: { device: Device; rows: EnergyRow[] }[]) {
    const hmStart = new Date(); hmStart.setDate(hmStart.getDate() - 6); hmStart.setHours(0, 0, 0, 0);
    const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const counts: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    results.forEach(({ rows }) => {
      rows.forEach(row => {
        const t = new Date(row.timestamp);
        const day = Math.floor((t.getTime() - hmStart.getTime()) / 86400000);
        const hour = t.getHours();
        if (day >= 0 && day < 7) { matrix[day][hour] += (row.power || 0); counts[day][hour]++; }
      });
    });
    const avg = matrix.map((row, d) => row.map((s, h) => counts[d][h] ? s / counts[d][h] : 0));
    const maxVal = Math.max(...avg.flat(), 1);
    setHeatmap(avg);
    setHeatMax(maxVal);
  }

  function handleExport() {
    exportCSV('report', ['Thời gian', 'Thiết bị', 'Khu vực', 'Công suất (kW)', 'Điện năng (kWh)'],
      tableFiltered.map(r => [r.time, r.device, r.area, r.power.toFixed(2), r.kwh.toFixed(3)]));
    showToast(`Đã xuất ${tableFiltered.length} bản ghi`, 'ok');
  }

  function handleSort(col: string) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
    setTablePage(1);
  }

  const tableFiltered = tableRows.filter(r => {
    if (!tableSearch) return true;
    const q = tableSearch.toLowerCase();
    return r.device.toLowerCase().includes(q) || r.area.toLowerCase().includes(q);
  });

  const tableSorted = [...tableFiltered].sort((a, b) => {
    let va: string | number, vb: string | number;
    if (sortCol === 'time')   { va = a.time;   vb = b.time; }
    else if (sortCol === 'device') { va = a.device; vb = b.device; }
    else if (sortCol === 'area')   { va = a.area;   vb = b.area; }
    else if (sortCol === 'power')  { va = a.power;  vb = b.power; }
    else if (sortCol === 'energy') { va = a.kwh;    vb = b.kwh; }
    else if (sortCol === 'eff')    { va = a.pf ?? -1; vb = b.pf ?? -1; }
    else { va = a.status; vb = b.status; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const tablePaged = tableSorted.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);
  const tableAvgPow = tableFiltered.length ? tableFiltered.reduce((a, r) => a + r.power, 0) / tableFiltered.length : 0;
  const tableTotalKwh = tableFiltered.reduce((a, r) => a + r.kwh, 0);
  const pfRows = tableFiltered.filter(r => r.pf !== null && (r.pf ?? 0) > 0);
  const tableAvgPf = pfRows.length ? pfRows.reduce((a, r) => a + (r.pf ?? 0), 0) / pfRows.length : null;

  const areaColorMap: Record<string, string> = {};
  groups.forEach((g, i) => { areaColorMap[g.displaygrouid || g._id] = CHART_COLORS[i % CHART_COLORS.length]; });

  const hmDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  });

  const energyDelta = fmtDelta(currKwh ?? 0, prevKwh ?? 0);
  const peakDelta   = fmtDelta(currPeak ?? 0, prevPeak ?? 0);
  const topbarRight = (
    <>
      <div className="compare-badge desktop-only">
        <i className="bi bi-calendar3" style={{ color: 'var(--accent)' }} />
        Kỳ so sánh: <strong>{comparePeriodText}</strong>
      </div>
      <button className="btn-ghost desktop-only" onClick={handleExport} disabled={!tableRows.length}>
        <i className="bi bi-filetype-csv" />CSV
      </button>
      <button className="btn-primary desktop-only" onClick={handleExport} disabled={!tableRows.length}>
        <i className="bi bi-file-earmark-excel" />Excel
      </button>
      <button className="btn-icon" onClick={() => { if (devices.length) loadReport(); }} title="Làm mới">
        <i className="bi bi-arrow-clockwise" />
      </button>
    </>
  );

  return (
    <Layout title="Báo cáo Năng lượng" breadcrumb={['ViPower', 'Giám sát', 'Báo cáo']} topbarRight={topbarRight}>

      {/* Filter bar */}
      <div className="filter-bar">
        <i className="bi bi-funnel" style={{ color: 'var(--text-dim)', fontSize: 14 }} />
        <select className="filter-select" value={selArea} onChange={e => { setSelArea(e.target.value); setSelDevice('all'); }}>
          <option value="all">{allAreasLabel}</option>
          {groups.map(g => {
            const gid = g.displaygrouid || g._id;
            return <option key={gid} value={gid}>{g.groupName || g.name || gid}</option>;
          })}
        </select>
        <select className="filter-select" value={selDevice} onChange={e => setSelDevice(e.target.value)}>
          <option value="all">Tất cả thiết bị</option>
          {getAreaDevices().map(d => <option key={d.deviceid} value={d.deviceid}>{d.deviceName || d.deviceid}</option>)}
        </select>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <span className="filter-label">Kỳ</span>
        <div className="range-pills">
          {RANGE_OPTS.map(o => (
            <button key={o.id} className={`range-pill${range === o.id ? ' active' : ''}`}
              onClick={() => setRange(o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <>
            <span className="filter-label">Từ</span>
            <input type="date" className="filter-select" style={{ padding: '5px 8px', fontSize: 12 }}
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="filter-label">Đến</span>
            <input type="date" className="filter-select" style={{ padding: '5px 8px', fontSize: 12 }}
              value={dateTo} onChange={e => setDateTo(e.target.value)} />
            <button className="btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={() => { if (devices.length) loadReport(); }}>Áp dụng</button>
          </>
        )}
        {loading && <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />}
      </div>

      {/* KPI cards (3-col) */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--accent)' }}>
          <div className="kpi-label">Tổng điện năng</div>
          <div className="kpi-value">{fmt(currKwh, 0)} <sup>kWh</sup></div>
          <div className="kpi-footer">
            <div className={`kpi-delta ${energyDelta.cls}`}>{energyDelta.text}</div>
            <div className="kpi-vs">vs. kỳ trước</div>
          </div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--yellow)' }}>
          <div className="kpi-label">Công suất đỉnh</div>
          <div className="kpi-value">{fmt(currPeak, 0)} <sup>kW</sup></div>
          <div className="kpi-footer">
            <div className={`kpi-delta ${peakDelta.cls}`}>{peakDelta.text}</div>
            <div className="kpi-vs">vs. kỳ trước</div>
          </div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--green)' }}>
          <div className="kpi-label">Hiệu suất TB</div>
          <div className="kpi-value">-- <sup>kWh/m³</sup></div>
          <div className="kpi-footer">
            <div className="kpi-delta" style={{ color: 'var(--text-dim)' }}>N/A</div>
            <div className="kpi-vs">vs. kỳ trước</div>
          </div>
        </div>
      </div>

      {/* Charts section */}
      <div className="section-row">
        <span className="section-label">Biểu đồ phân tích</span>
        <div className="section-line"></div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-activity" />Công suất theo thời gian (kW)</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{selArea === 'all' ? allAreasLabel : getGroupName(selArea)}</span>
          </div>
          <div className="chart-wrap" style={{ height: 200 }}>
            <canvas ref={powerRef} />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { color: 'var(--accent)', label: 'Kỳ này', dash: false },
              { color: 'rgba(56,170,255,.3)', label: 'Kỳ trước', dash: true },
              { color: 'var(--red)', label: 'Ngưỡng', dash: true },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ width: 16, height: 2, background: l.color, borderRadius: 2, borderStyle: l.dash ? 'dashed' : 'solid', borderWidth: l.dash ? '1px' : 0, borderColor: l.color }} />
                {l.label}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-bar-chart-fill" />Điện năng theo khu vực (kWh)</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{range === 'today' ? 'Theo giờ' : range === '7d' ? 'Theo ngày • 7 ngày' : range === 'month' ? 'Theo ngày • tháng này' : range === 'lastmonth' ? 'Theo ngày • tháng trước' : 'Theo ngày'}</span>
          </div>
          <div className="chart-wrap" style={{ height: 200 }}>
            <canvas ref={areaRef} />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#38aaff' }} />
              Điện năng (kWh)
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-graph-up" />Điện năng lũy kế (kWh)</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Kỳ này vs. kỳ trước</span>
          </div>
          <div className="chart-wrap" style={{ height: 200 }}>
            <canvas ref={cumRef} />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 16, height: 2, background: 'var(--green)', borderRadius: 2 }} />Kỳ này
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ width: 16, height: 2, background: 'rgba(245,166,35,.6)', borderRadius: 2 }} />Kỳ trước
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="section-row">
        <span className="section-label">Heatmap công suất — 7 ngày gần nhất (kW)</span>
        <div className="section-line"></div>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Hover để xem chi tiết</span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="heatmap-wrap">
          <div className="heatmap-grid">
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="hm-header">{h % 3 === 0 ? `${String(h).padStart(2,'0')}h` : ''}</div>
            ))}
            {hmDays.flatMap((day, di) => [
              <div key={`l${di}`} className="hm-label">{day}</div>,
              ...Array.from({ length: 24 }, (_, hi) => {
                const val = heatmap[di]?.[hi] ?? 0;
                return (
                  <div key={`${di}-${hi}`} className="hm-cell"
                    title={`${day} ${String(hi).padStart(2,'0')}:00 — ${val.toFixed(1)} kW`}
                    style={{ background: heatColor(val, heatMax), color: heatMax > 0 && val / heatMax >= 0.5 ? 'rgba(255,255,255,0.9)' : 'transparent' }}>
                    {val > 0 ? val.toFixed(0) : ''}
                  </div>
                );
              }),
            ])}
          </div>
          <div className="hm-legend">
            <span>Thấp</span>
            <div className="hm-legend-bar">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="hm-legend-seg" style={{ background: heatColor((i / 9) * heatMax, heatMax) }} />
              ))}
            </div>
            <span>Cao ({fmt(heatMax, 0)} kW)</span>
          </div>
        </div>
      </div>

      {/* Data table */}
      <div className="section-row">
        <span className="section-label">Bảng dữ liệu chi tiết</span>
        <div className="section-line"></div>
      </div>

      <div className="card">
        <div className="table-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="search-box">
              <i className="bi bi-search" />
              <input className="search-input" type="search" placeholder="Tìm thiết bị, khu vực..."
                value={tableSearch} onChange={e => { setTableSearch(e.target.value); setTablePage(1); }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tableFiltered.length} bản ghi</span>
          </div>
          <button className="btn-ghost desktop-only" style={{ fontSize: 12, padding: '5px 12px' }} onClick={handleExport} disabled={!tableRows.length}>
            <i className="bi bi-download" /> Xuất CSV
          </button>
        </div>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : tablePaged.length === 0 ? (
          <div className="empty-state"><i className="bi bi-bar-chart" />Không có dữ liệu.</div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    {(['time','device','area','power','energy','eff','status'] as const).map((col, idx) => {
                      const labels = ['Thời gian','Thiết bị','Khu vực','Công suất (kW)','Điện năng (kWh)','Hiệu suất (kWh/m³)','Trạng thái'];
                      const isNum = idx >= 3 && idx <= 5;
                      const active = sortCol === col;
                      return (
                        <th key={col} data-col={col} className={`sortable${isNum ? ' num' : ''}${active ? ' sort-' + sortDir : ''}`}
                          onClick={() => handleSort(col)}>
                          {labels[idx]}
                          <span className="sort-icon">{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {tablePaged.map((r, i) => {
                    const ac = areaColorMap[r.areaId] || 'var(--accent)';
                    const stLabel = r.status === 'ok' ? 'Bình thường' : 'Lỗi';
                    const stCls   = r.status === 'ok' ? 'ok' : 'warn';
                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{r.time}</td>
                        <td style={{ fontWeight: 500 }}>{r.device}</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: ac, background: ac + '22' }}>
                            {r.area}
                          </span>
                        </td>
                        <td className="num">{fmt(r.power, 0)}</td>
                        <td className="num">{fmt(r.kwh, 4)}</td>
                        <td className="num">{r.pf !== null && r.pf !== undefined ? r.pf.toFixed(2) : '--'}</td>
                        <td><span className={`status-badge ${stCls}`}>{stLabel}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <table className="table-footer-fixed">
              <tbody>
                <tr>
                  <td>Tổng kết kỳ báo cáo</td>
                  <td /><td />
                  <td className="num">{fmt(tableAvgPow, 0)} kW TB</td>
                  <td className="num">{fmt(tableTotalKwh, 2)} kWh</td>
                  <td className="num">{tableAvgPf !== null ? `PF ${tableAvgPf.toFixed(2)}` : '--'}</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <Pager total={tableFiltered.length} page={tablePage} pageSize={PAGE_SIZE} onChange={setTablePage} />
          </>
        )}
      </div>
    </Layout>
  );
}

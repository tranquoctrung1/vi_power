import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Chart } from 'chart.js';
import '../utils/chartDefaults';

type AnomalyPreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month'
  | 'this_quarter' | 'last_quarter' | '6m' | '1y' | 'custom';

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function getAnomalyPresetRange(preset: AnomalyPreset, now = new Date()): { start: Date; end: Date } {
  switch (preset) {
    case 'today': return { start: startOfDay(now), end: now };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'this_week': {
      const dow = (now.getDay() + 6) % 7; // Monday = 0
      const start = new Date(now); start.setDate(now.getDate() - dow);
      return { start: startOfDay(start), end: now };
    }
    case 'last_week': {
      const dow = (now.getDay() + 6) % 7;
      const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - dow);
      const start = new Date(thisWeekStart); start.setDate(start.getDate() - 7);
      const end = new Date(thisWeekStart); end.setDate(end.getDate() - 1);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    case 'this_month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      return { start: new Date(now.getFullYear(), q * 3, 1), end: now };
    }
    case 'last_quarter': {
      const q = Math.floor(now.getMonth() / 3) - 1;
      const year = q < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const qq = (q + 4) % 4;
      return { start: new Date(year, qq * 3, 1), end: new Date(year, qq * 3 + 3, 0, 23, 59, 59, 999) };
    }
    case '6m':
      return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end: now };
    case '1y':
      return { start: new Date(now.getFullYear(), now.getMonth() - 11, 1), end: now };
    default:
      return { start: startOfDay(now), end: now };
  }
}

const ANOMALY_PRESET_OPTIONS: [AnomalyPreset, string][] = [
  ['today', 'Ngày hiện tại'],
  ['yesterday', 'Ngày hôm trước'],
  ['this_week', 'Tuần hiện tại'],
  ['last_week', 'Tuần trước'],
  ['this_month', 'Tháng hiện tại'],
  ['last_month', 'Tháng trước'],
  ['this_quarter', 'Quý hiện tại'],
  ['last_quarter', 'Quý trước'],
  ['6m', '6 tháng'],
  ['1y', '1 năm'],
];

function toDatetimeLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const SHIFT_DEFS: [string, number, number][] = [
  ['Ca 1 (6h–14h)', 6, 13],
  ['Ca 2 (14h–22h)', 14, 21],
  ['Ca 3 (22h–6h)', 22, 5],
];
const CHART_COLORS = ['#38aaff', '#22d369', '#f5a623', '#a855f7', '#f44b4b', '#ff7043'];

interface Device { deviceid: string; deviceName?: string; displaygroupid?: string; displaygrouid?: string; }
interface Group { _id: string; displaygrouid?: string; displaygroupid?: string; groupName?: string; name?: string; }
interface MonthData { year: number; month: number; energy: number; label: string; index: number; }
interface ShiftRow { id: number; date: string; shift: 0 | 1 | 2; }
interface ERow { timestamp: string; power?: number; netpower?: number; }

let _sid = 0;
const SCALE = {
  x: { ticks: { color: '#607b99', font: { size: 10 } as const, maxTicksLimit: 14 }, grid: { color: 'rgba(56,139,253,0.06)' } },
  y: { ticks: { color: '#607b99', font: { size: 10 } as const }, grid: { color: 'rgba(56,139,253,0.07)' }, beginAtZero: true },
};

function fmt(n: number | null | undefined, d = 1) {
  if (n == null || isNaN(n as number)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}

function linReg(vals: number[]) {
  const n = vals.length;
  if (n < 2) return { a: 0, b: vals[0] ?? 0, r2: 0, yhat: vals.map(() => vals[0] ?? 0) };
  const xMean = (n - 1) / 2;
  const yMean = vals.reduce((a, b) => a + b, 0) / n;
  let ssXX = 0, ssXY = 0, ssYY = 0;
  for (let i = 0; i < n; i++) { ssXX += (i - xMean) ** 2; ssXY += (i - xMean) * (vals[i] - yMean); ssYY += (vals[i] - yMean) ** 2; }
  const a = ssXX ? ssXY / ssXX : 0;
  const b = yMean - a * xMean;
  const r2 = ssYY ? ssXY ** 2 / (ssXX * ssYY) : 0;
  return { a, b, r2, yhat: vals.map((_, i) => a * i + b) };
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function gid(g: Group) { return g.displaygrouid || g.displaygroupid || g._id; }

export default function AnalysisPage() {
  useAuth();
  const { showToast } = useToast();
  const storeUser = useAuthStore(s => s.user);
  const allAreasLabel = !storeUser || storeUser.role === 'Admin' ? 'Toàn nhà máy' : 'Tất cả khu vực';

  function filterGroupsByPermission(grps: Group[]): Group[] {
    if (!storeUser || storeUser.role === 'Admin') return grps;
    const allowed = storeUser.allowedAreas || [];
    if (allowed.length === 0) return [];
    return grps.filter(g => allowed.includes(g.displaygrouid || g.displaygroupid || g._id));
  }

  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selArea, setSelArea] = useState('all');
  const [selDevice, setSelDevice] = useState('all');
  const [anomalyPreset, setAnomalyPreset] = useState<AnomalyPreset>('today');
  const [anomalyCustomOpen, setAnomalyCustomOpen] = useState(false);
  const [anomalyCustomStart, setAnomalyCustomStart] = useState(() => toDatetimeLocal(startOfDay(new Date())));
  const [anomalyCustomEnd, setAnomalyCustomEnd] = useState(() => toDatetimeLocal(new Date()));
  const [anomalyRange, setAnomalyRange] = useState(() => getAnomalyPresetRange('today'));
  const anomalyRangeRef = useRef(anomalyRange);
  useEffect(() => { anomalyRangeRef.current = anomalyRange; }, [anomalyRange]);

  // Monthly base data
  const [baseMonths, setBaseMonths] = useState<MonthData[]>([]);

  // KPI
  const [kpiE, setKpiE] = useState('--');
  const [kpiED, setKpiED] = useState({ text: '—', cls: 'flat' });
  const [kpiPk, setKpiPk] = useState('--');
  const [kpiT, setKpiT] = useState('—');

  // Shift rows
  const [shiftRows, setShiftRows] = useState<ShiftRow[]>(() => {
    const d = todayStr();
    return [{ id: ++_sid, date: d, shift: 0 }, { id: ++_sid, date: d, shift: 1 }, { id: ++_sid, date: d, shift: 2 }];
  });
  const [shiftLoading, setShiftLoading] = useState(false);
  const shiftRowsRef = useRef(shiftRows);
  useEffect(() => { shiftRowsRef.current = shiftRows; }, [shiftRows]);

  // Peak demand
  const [peakDates, setPeakDates] = useState<string[]>([todayStr()]);
  const [peakAddDate, setPeakAddDate] = useState(todayStr());
  const [peakStats, setPeakStats] = useState({ hour: '--', max: '--', min: '--' });
  const [peakLoading, setPeakLoading] = useState(false);
  const peakDatesRef = useRef(peakDates);
  useEffect(() => { peakDatesRef.current = peakDates; }, [peakDates]);

  // Month comparison picker
  const [monthSel, setMonthSel] = useState<MonthData[]>([]);
  const [monthOpen, setMonthOpen] = useState(false);

  // Trend picker
  const [trendSel, setTrendSel] = useState<MonthData[]>([]);
  const [trendOpen, setTrendOpen] = useState(false);
  const [trendSum, setTrendSum] = useState({ slope: 0, r2: 0, t1: 0, t2: 0, t3: 0 });
  const [trendBadge, setTrendBadge] = useState({ text: '', cls: 'flat' });

  // Bench
  const [benchRefVal, setBenchRefVal] = useState('0.60');
  const [benchBest, setBenchBest] = useState('--');
  const [benchWorst, setBenchWorst] = useState('--');
  const [benchAvg, setBenchAvg] = useState('--');

  // Anomaly
  const [anomalies, setAnomalies] = useState<{ date: string; kwh: number; deviation: number }[]>([]);
  const [anomCount, setAnomalyCount] = useState(0);

  // Chart refs
  const shiftRef    = useRef<HTMLCanvasElement>(null);
  const shiftInst   = useRef<Chart | null>(null);
  const peakRef     = useRef<HTMLCanvasElement>(null);
  const peakInst    = useRef<Chart | null>(null);
  const monthRef    = useRef<HTMLCanvasElement>(null);
  const monthInst   = useRef<Chart | null>(null);
  const benchCanvas = useRef<HTMLCanvasElement>(null);
  const benchInst   = useRef<Chart | null>(null);
  const trendRef    = useRef<HTMLCanvasElement>(null);
  const trendInst   = useRef<Chart | null>(null);
  const anomalyRef  = useRef<HTMLCanvasElement>(null);
  const anomalyInst = useRef<Chart | null>(null);

  useEffect(() => {
    loadMeta();
    return () => {
      shiftInst.current?.destroy(); peakInst.current?.destroy();
      monthInst.current?.destroy(); benchInst.current?.destroy();
      trendInst.current?.destroy(); anomalyInst.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!devices.length) return;
    loadAll();
  }, [selArea, selDevice, devices]);

  function selectAnomalyPreset(preset: AnomalyPreset) {
    setAnomalyPreset(preset);
    setAnomalyCustomOpen(false);
    const range = getAnomalyPresetRange(preset);
    setAnomalyRange(range);
    anomalyRangeRef.current = range;
    loadAnomalyChart();
  }

  function applyAnomalyCustomRange() {
    const range = { start: new Date(anomalyCustomStart), end: new Date(anomalyCustomEnd) };
    setAnomalyRange(range);
    anomalyRangeRef.current = range;
    loadAnomalyChart();
  }

  async function loadMeta() {
    try {
      const [dr, gr] = await Promise.all([
        apiGet('/devices?limit=1000').then(r => r.json()),
        apiGet('/display-groups?limit=1000').then(r => r.json()),
      ]);
      setDevices(dr.data || dr.devices || []);
      setGroups(filterGroupsByPermission(gr.data?.data || gr.data || []));
    } catch {}
  }

  function getTargets(devs = devices) {
    let d = devs;
    if (selArea   !== 'all') d = d.filter(x => (x.displaygroupid || x.displaygrouid) === selArea);
    if (selDevice !== 'all') d = d.filter(x => x.deviceid === selDevice);
    return d.filter(x => x.deviceid?.trim());
  }

  // Per-device avg per hour bucket, then SUM devices (true total demand, not avg-mixed-across
  // devices which understates the total when multiple devices are selected) — same fix as Dashboard.
  async function fetchHourly(date: string, startH: number, endH: number) {
    const targets = getTargets();
    if (!targets.length) return Array(24).fill(0);
    const wraps = endH < startH; // shift crosses midnight (e.g. Ca 3: 22h–6h hôm sau)
    const d = new Date(date);
    const from = new Date(d); from.setHours(startH, 0, 0, 0);
    const to   = new Date(d); to.setHours(wraps ? 23 : endH, wraps ? 59 : 59, 59, 999);
    const from2 = wraps ? new Date(d.getTime() + 86400000) : null;
    const to2   = wraps ? (() => { const t = new Date(d.getTime() + 86400000); t.setHours(endH, 59, 59, 999); return t; })() : null;
    if (from2) from2.setHours(0, 0, 0, 0);
    const buckets: Record<string, { p: number; n: number }>[] = Array.from({ length: 24 }, () => ({}));
    await Promise.all(targets.map(async dev => {
      try {
        const ranges = wraps ? [[from, to], [from2!, to2!]] : [[from, to]];
        for (const [rFrom, rTo] of ranges) {
          const j = await apiGet(`/data/energy/${encodeURIComponent(dev.deviceid)}?startTime=${rFrom.toISOString()}&endTime=${rTo.toISOString()}&limit=5000&sort=asc`).then(r => r.json());
          for (const r of (j.data || []) as ERow[]) {
            const h = new Date(r.timestamp).getHours();
            if (wraps ? (h >= startH || h <= endH) : (h >= startH && h <= endH)) {
              const b = buckets[h][dev.deviceid] || (buckets[h][dev.deviceid] = { p: 0, n: 0 });
              b.p += r.power || 0;
              b.n++;
            }
          }
        }
      } catch {}
    }));
    return buckets.map(b => Math.round(Object.values(b).reduce((s, dv) => s + (dv.n ? dv.p / dv.n : 0), 0)));
  }

  // Energy via netpower cumulative-counter delta (last reading at/after period end minus first
  // reading at/after period start, summed per device) — same method as Dashboard/ReportPage, so
  // totals always agree between pages. NOT avgPower×duration, which is only a rough estimate.
  async function fetchMonthEnergy(targets: Device[], start: Date, end: Date): Promise<number> {
    const all = await Promise.all(targets.map(dev =>
      apiGet(`/data/energy/${encodeURIComponent(dev.deviceid)}?startTime=${start.toISOString()}&endTime=${end.toISOString()}&limit=5000&sort=asc`)
        .then(r => r.json()).then(j => (j.data || []) as ERow[])
        .catch(() => [] as ERow[])
    ));
    let total = 0;
    all.forEach(rows => {
      if (rows.length < 2) return;
      const first = rows[0].netpower;
      const last  = rows[rows.length - 1].netpower;
      if (first == null || last == null) return;
      total += Math.max(0, last - first);
    });
    return total;
  }

  async function loadBaseMonths(): Promise<MonthData[]> {
    const targets = getTargets();
    if (!targets.length) return [];
    const now = new Date();
    const months: MonthData[] = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), energy: 0, label: d.toLocaleString('vi-VN', { month: 'short', year: 'numeric' }), index: i };
    });
    await Promise.all(months.map(async (m, idx) => {
      const start = new Date(m.year, m.month, 1);
      const end   = new Date(m.year, m.month + 1, 0, 23, 59, 59, 999);
      const e = await fetchMonthEnergy(targets, start, end);
      months[idx] = { ...months[idx], energy: Math.round(e) };
    }));
    setBaseMonths(months);
    return months;
  }

  async function loadAll() {
    try {
      const months = await loadBaseMonths();

      // KPIs
      const now = new Date();
      const curM  = months.find(m => m.year === now.getFullYear() && m.month === now.getMonth());
      const pm    = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const py    = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const prevM = months.find(m => m.year === py && m.month === pm);
      if (curM) {
        setKpiE(fmt(curM.energy, 0));
        if (prevM && prevM.energy) {
          const pct = ((curM.energy - prevM.energy) / prevM.energy * 100);
          setKpiED({ text: `${pct >= 0 ? '↑ +' : '↓ '}${Math.abs(pct).toFixed(1)}%`, cls: pct >= 0 ? 'up' : 'down' });
        }
      }

      // Default pickers
      const defMonthSel: MonthData[] = [prevM, curM].filter(Boolean) as MonthData[];
      const defTrendSel = months.slice(-12);

      setMonthSel(prev => prev.length ? prev : defMonthSel);
      setTrendSel(prev => prev.length ? prev : defTrendSel);

      doUpdateMonthChart(months, monthSel.length ? monthSel : defMonthSel);
      doUpdateTrendChart(months, trendSel.length ? trendSel : defTrendSel);
      doUpdateBench(benchRefVal);

      await Promise.all([loadShiftChart(), loadPeakChart(), loadAnomalyChart()]);
    } catch {
      showToast('Lỗi tải dữ liệu phân tích', 'error');
    }
  }

  // ── 1. Shift chart ──
  async function loadShiftChart() {
    const rows = shiftRowsRef.current;
    if (!rows.length) return;
    setShiftLoading(true);
    try {
      const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`);
      const datasets: any[] = [];
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const [, startH, endH] = SHIFT_DEFS[row.shift];
        const data = await fetchHourly(row.date, startH, endH);
        const peakV = Math.max(...data); const peakI = data.indexOf(peakV);
        const color = CHART_COLORS[ri % CHART_COLORS.length];
        const name = SHIFT_DEFS[row.shift][0];
        datasets.push({ label: `${row.date} ${name}`, data, borderColor: color, backgroundColor: color + '20', borderWidth: 2, fill: false, tension: 0.3, pointRadius: 0, pointHoverRadius: 4 });
        datasets.push({ label: 'Peak', data: data.map((v, i) => i === peakI ? v : null), backgroundColor: color, borderColor: color, pointRadius: 8, pointStyle: 'star' as any, showLine: false, order: 0 });
      }
      setShiftLoading(false);
      const canvas = shiftRef.current; if (!canvas) return;
      shiftInst.current?.destroy();
      shiftInst.current = new Chart(canvas, {
        type: 'line',
        data: { labels: hours, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { callbacks: { filter: (c: any) => c.dataset.pointStyle !== 'star', label: (c: any) => ` ${c.dataset.label}: ${fmt(c.parsed.y, 0)} kW` } as any } as any },
          scales: SCALE,
        } as any,
      });
    } catch { setShiftLoading(false); }
  }

  // ── 2. Peak demand chart ──
  async function loadPeakChart() {
    const dates = peakDatesRef.current;
    if (!dates.length) return;
    setPeakLoading(true);
    try {
      const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2,'0')}:00`);
      const datasets: any[] = [];
      let gPeak = 0, gPeakH = 0, gMin = 99999;
      for (let di = 0; di < dates.length; di++) {
        const day = dates[di];
        const data = await fetchHourly(day, 0, 23);
        const pv = Math.max(...data); const pi = data.indexOf(pv);
        const mn = Math.min(...data.filter(v => v > 0));
        if (pv > gPeak) { gPeak = pv; gPeakH = pi; }
        if (mn > 0 && mn < gMin) gMin = mn;
        const color = CHART_COLORS[di % CHART_COLORS.length];
        const label = new Date(day).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
        datasets.push({ label, data, backgroundColor: color + '77', borderColor: color, borderWidth: 1.5, type: 'bar' as const, order: 1 });
        datasets.push({ label: `Peak ${label}`, data: data.map((v, i) => i === pi ? v : null), backgroundColor: '#f44b4b', borderColor: '#f44b4b', pointRadius: 8, pointStyle: 'star' as any, showLine: false, type: 'scatter' as const, order: 0 });
      }
      setPeakStats({ hour: `${String(gPeakH).padStart(2,'0')}:00`, max: `${fmt(gPeak, 0)} kW`, min: gMin < 99999 ? `${fmt(gMin, 0)} kW` : '--' });
      setKpiPk(fmt(gPeak, 0));
      setPeakLoading(false);
      const canvas = peakRef.current; if (!canvas) return;
      peakInst.current?.destroy();
      peakInst.current = new Chart(canvas, {
        type: 'bar',
        data: { labels: hours, datasets },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { callbacks: { filter: (c: any) => !c.dataset.label?.startsWith('Peak'), label: (c: any) => ` ${c.dataset.label}: ${fmt(c.parsed.y, 0)} kW` } as any } as any },
          scales: SCALE,
        } as any,
      });
    } catch { setPeakLoading(false); }
  }

  // ── 3. Month comparison chart ──
  function doUpdateMonthChart(_months: MonthData[], sel: MonthData[]) {
    const canvas = monthRef.current; if (!canvas) return;
    const labels = Array.from({ length: 31 }, (_, i) => `${i + 1}`);
    const datasets = sel.map((m, si) => {
      const days = new Date(m.year, m.month + 1, 0).getDate();
      const perDay = m.energy / days;
      const data = [...Array.from({ length: days }, () => Math.round(perDay)), ...Array(31 - days).fill(null)];
      const c = CHART_COLORS[si % CHART_COLORS.length];
      return { label: m.label, data, borderColor: c, backgroundColor: c + '18', borderWidth: 2, fill: false, tension: 0.2, pointRadius: 0, pointHoverRadius: 3, spanGaps: false };
    });
    monthInst.current?.destroy();
    monthInst.current = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, labels: { color: '#607b99', font: { size: 11 } as any } } },
        scales: { ...SCALE, x: { ...SCALE.x, title: { display: true, text: 'Ngày trong tháng', color: '#607b99', font: { size: 10 } as any } } },
      } as any,
    });
  }

  // ── 4. Benchmarking chart ──
  // Real per-group avg power factor (latest 'per' reading per device, avg across devices —
  // same weighting as Dashboard's kpiEff), not a fake formula identical across every group.
  async function doUpdateBench(refStr: string) {
    const canvas = benchCanvas.current; if (!canvas || !groups.length) return;
    const refEff = parseFloat(refStr) || 0.60;
    const target = refEff * 100;
    const items = await Promise.all(groups.map(async g => {
      const name = g.groupName || g.name || gid(g);
      const groupId = gid(g);
      const groupDevices = devices.filter(d => (d.displaygroupid || d.displaygrouid) === groupId);
      const pfs = await Promise.all(groupDevices.map(async dev => {
        try {
          const j = await apiGet(`/latest-data/${encodeURIComponent(dev.deviceid)}`).then(r => r.json());
          const entry = (j.data || []).find((c: { channel: string; value: number | null }) => c.channel === 'per');
          return entry?.value ?? null;
        } catch { return null; }
      }));
      const valid = pfs.filter((v): v is number => v != null && v > 0);
      const avgPf = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
      const pct = parseFloat((avgPf * 100).toFixed(1));
      const col = pct >= target ? '#22d369' : pct >= target * 0.9 ? '#f5a623' : '#f44b4b';
      return { name, pct, col };
    }));
    benchInst.current?.destroy();
    benchInst.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: items.map(i => i.name),
        datasets: [{ label: 'Hiệu suất (%)', data: items.map(i => i.pct), backgroundColor: items.map(i => i.col + '99'), borderColor: items.map(i => i.col), borderWidth: 1.5, borderRadius: 4 } as any],
      },
      options: {
        indexAxis: 'y' as const, responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => ` ${c.label}: ${c.parsed.x.toFixed(1)}%` } as any } as any },
        scales: {
          x: { ...SCALE.x, suggestedMin: 0, suggestedMax: 100, ticks: { ...SCALE.x.ticks, callback: (v: any) => v + '%' } },
          y: { ticks: { color: '#607b99', font: { size: 10 } as const }, grid: { display: false } },
        },
      } as any,
    });
    if (items.length) {
      const sorted = [...items].sort((a, b) => b.pct - a.pct);
      setBenchBest(sorted[0].name);
      setBenchWorst(sorted[sorted.length - 1].name);
      setBenchAvg((items.reduce((a, b) => a + b.pct, 0) / items.length).toFixed(1));
    }
  }

  // ── 5. Trend chart ──
  function doUpdateTrendChart(_months: MonthData[], sel: MonthData[]) {
    if (sel.length < 4) return;
    const vals = sel.map(m => m.energy);
    const reg  = linReg(vals);
    const lastM = sel[sel.length - 1];
    const preds = Array.from({ length: 3 }, (_, k) => {
      const futX = vals.length + k;
      const futMonth = (lastM.month + k + 1) % 12;
      const sea = vals.reduce((s, v) => s + v, 0) / vals.length * 0.08 * Math.sin(Math.PI * (futMonth - 3) / 6);
      return Math.max(0, Math.round(reg.a * futX + reg.b + sea));
    });
    const trendFull = [...reg.yhat, ...Array.from({ length: 3 }, (_, i) => reg.a * (vals.length + i) + reg.b)];
    const labels = [...sel.map(m => m.label), 'Dự báo T+1', 'Dự báo T+2', 'Dự báo T+3'];
    const s = reg.a; const isUp = s > 500, isDown = s < -500;
    setTrendSum({ slope: +s.toFixed(1), r2: +reg.r2.toFixed(3), t1: preds[0], t2: preds[1], t3: preds[2] });
    setTrendBadge({ text: `${s >= 0 ? '+' : ''}${fmt(s, 0)} kWh/tháng`, cls: isUp ? 'up' : isDown ? 'down' : 'flat' });
    setKpiT(isUp ? '⚠ Xu hướng tăng' : isDown ? '✓ Xu hướng giảm' : '→ Ổn định');
    const canvas = trendRef.current; if (!canvas) return;
    trendInst.current?.destroy();
    trendInst.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar',  label: 'Thực tế (kWh)',         data: [...vals, null, null, null],                             backgroundColor: 'rgba(56,170,255,0.4)', borderColor: '#38aaff', borderWidth: 1, borderRadius: 4 } as any,
          { type: 'line', label: 'Trendline',               data: trendFull,                                               borderColor: 'rgba(56,170,255,.4)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0 } as any,
          { type: 'line', label: 'Dự báo LR+Seasonality',  data: [...Array(vals.length - 1).fill(null), vals[vals.length - 1], ...preds], borderColor: '#f5a623', backgroundColor: 'rgba(245,166,35,.07)', fill: true, borderWidth: 2, borderDash: [6, 3], pointRadius: 4, pointBackgroundColor: '#f5a623', tension: 0.3, spanGaps: false } as any,
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, labels: { color: '#607b99', font: { size: 11 } as any } } },
        scales: SCALE,
      } as any,
    });
  }

  // ── 6. Anomaly chart ──
  async function loadAnomalyChart() {
    const targets = getTargets();
    if (!targets.length) return;
    const { start, end } = anomalyRangeRef.current;
    const anomStart = startOfDay(start);
    const anomEndDay = startOfDay(end);
    const days = Math.floor((anomEndDay.getTime() - anomStart.getTime()) / 86400000) + 1;
    const all = await Promise.all(targets.map(d =>
      apiGet(`/data/energy/${encodeURIComponent(d.deviceid)}?startTime=${start.toISOString()}&endTime=${end.toISOString()}&limit=10000&sort=asc`)
        .then(r => r.json()).then(j => (j.data || []) as ERow[])
        .catch(() => [] as ERow[])
    ));
    const rows = all.flat();
    const db = Array(days).fill(0); const dc = Array(days).fill(0);
    rows.forEach(r => {
      const di = Math.floor((new Date(r.timestamp).getTime() - anomStart.getTime()) / 86400000);
      if (di >= 0 && di < days) { db[di] += r.power || 0; dc[di]++; }
    });
    const kwhPerDay: (number | null)[] = db.map((s, i) => dc[i] ? +(s / dc[i] * 24).toFixed(1) : null);
    const nonNull = kwhPerDay.filter((v): v is number => v !== null);
    const mean = nonNull.length ? nonNull.reduce((a, b) => a + b, 0) / nonNull.length : 0;
    const std  = nonNull.length > 1 ? Math.sqrt(nonNull.reduce((s, v) => s + (v - mean) ** 2, 0) / nonNull.length) : 0;
    const upper = kwhPerDay.map(() => +(mean + 2 * std).toFixed(1));
    const lower = kwhPerDay.map(() => +Math.max(0, mean - 2 * std).toFixed(1));
    const labels = Array.from({ length: days }, (_, i) => { const d = new Date(anomStart); d.setDate(d.getDate() + i); return `${d.getDate()}/${d.getMonth() + 1}`; });
    const newAnomalies = kwhPerDay.map((v, i) => {
      if (v === null) return null;
      const dev = std > 0 ? (v - mean) / std : 0;
      if (Math.abs(dev) < 2) return null;
      const d = new Date(anomStart); d.setDate(d.getDate() + i);
      return { date: `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`, kwh: v, deviation: +dev.toFixed(2) };
    }).filter((v): v is NonNullable<typeof v> => v !== null);
    setAnomalies(newAnomalies);
    setAnomalyCount(newAnomalies.length);
    const canvas = anomalyRef.current; if (!canvas) return;
    anomalyInst.current?.destroy();
    anomalyInst.current = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '+2σ',     data: upper,      borderColor: 'rgba(244,75,75,.45)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: '+1', backgroundColor: 'rgba(244,75,75,.07)' } as any,
          { label: '-2σ',     data: lower,      borderColor: 'rgba(244,75,75,.45)', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false } as any,
          { label: 'kWh/ngày', data: kwhPerDay, borderColor: '#38aaff', borderWidth: 2, pointRadius: 3, pointBackgroundColor: kwhPerDay.map(v => v !== null && (v > mean + 2 * std || v < mean - 2 * std) ? '#f44b4b' : '#38aaff'), fill: false, tension: 0.2 } as any,
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false } },
        scales: { x: { ...SCALE.x, ticks: { ...SCALE.x.ticks, maxTicksLimit: 15 } }, y: SCALE.y },
      } as any,
    });
  }

  // ── Shift row helpers ──
  function addShiftRow() { setShiftRows(prev => [...prev, { id: ++_sid, date: todayStr(), shift: 0 }]); }
  function resetShiftRows() {
    const d = todayStr();
    setShiftRows([{ id: ++_sid, date: d, shift: 0 }, { id: ++_sid, date: d, shift: 1 }, { id: ++_sid, date: d, shift: 2 }]);
  }
  function removeShiftRow(id: number) { setShiftRows(prev => prev.filter(r => r.id !== id)); }
  function updateShiftRow(id: number, key: 'date' | 'shift', val: string | number) {
    setShiftRows(prev => prev.map(r => r.id === id ? { ...r, [key]: val } : r));
  }

  // ── Month picker helpers ──
  function toggleMonthSel(m: MonthData) {
    setMonthSel(prev => prev.find(x => x.index === m.index) ? prev.filter(x => x.index !== m.index) : [...prev, m].sort((a, b) => a.index - b.index));
  }
  function toggleTrendSel(m: MonthData) {
    setTrendSel(prev => prev.find(x => x.index === m.index) ? prev.filter(x => x.index !== m.index) : [...prev, m].sort((a, b) => a.index - b.index));
  }

  function monthsByYear(months: MonthData[]) {
    const g: Record<number, MonthData[]> = {};
    months.forEach(m => { (g[m.year] = g[m.year] || []).push(m); });
    return Object.entries(g).reverse() as [string, MonthData[]][];
  }

  const areaDevices = selArea === 'all' ? devices : devices.filter(d => (d.displaygroupid || d.displaygrouid) === selArea);

  const topbarRight = (
    <>
      {trendBadge.text && (
        <span className={`trend-badge ${trendBadge.cls} desktop-only`}>
          <i className={`bi bi-arrow-${trendBadge.cls === 'up' ? 'up' : trendBadge.cls === 'down' ? 'down' : ''}${trendBadge.cls !== 'flat' ? '-right' : 'right'}`} />
          {trendBadge.text}
        </span>
      )}
      <button className="btn-ghost desktop-only" style={{ fontSize: 12, padding: '5px 12px' }}>
        <i className="bi bi-filetype-csv" />Xuất CSV
      </button>
      <button className="btn-icon" onClick={() => loadAll()} title="Làm mới"><i className="bi bi-arrow-clockwise" /></button>
    </>
  );

  return (
    <Layout title="Phân tích Năng lượng" breadcrumb={['ViPower', 'Nhà máy Tân Hiệp', 'Phân tích']} topbarRight={topbarRight}>

      {/* Filter bar */}
      <div className="filter-bar">
        <i className="bi bi-funnel" style={{ color: 'var(--text-dim)', fontSize: 14 }} />
        <select className="filter-select" value={selArea} onChange={e => { setSelArea(e.target.value); setSelDevice('all'); }}>
          <option value="all">{allAreasLabel}</option>
          {groups.map(g => { const id = gid(g); return <option key={id} value={id}>{g.groupName || g.name || id}</option>; })}
        </select>
        <select className="filter-select" value={selDevice} onChange={e => setSelDevice(e.target.value)}>
          <option value="all">Tất cả thiết bị</option>
          {areaDevices.map(d => <option key={d.deviceid} value={d.deviceid}>{d.deviceName || d.deviceid}</option>)}
        </select>
        <span className="filter-label">Bất thường:</span>
        <select className="filter-select" value={anomalyPreset} onChange={e => selectAnomalyPreset(e.target.value as AnomalyPreset)}>
          {ANOMALY_PRESET_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button className="btn-sm" onClick={() => setAnomalyCustomOpen(o => !o)}>Tùy chọn</button>
        {anomalyCustomOpen && (
          <>
            <input type="datetime-local" className="filter-select" value={anomalyCustomStart} onChange={e => setAnomalyCustomStart(e.target.value)} />
            <span className="filter-label">→</span>
            <input type="datetime-local" className="filter-select" value={anomalyCustomEnd} onChange={e => setAnomalyCustomEnd(e.target.value)} />
            <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={applyAnomalyCustomRange}>Áp dụng</button>
          </>
        )}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--accent)' }}>
          <div className="kpi-label">Tổng điện năng</div>
          <div className="kpi-value">{kpiE} <sup>kWh</sup></div>
          <div className={`kpi-delta ${kpiED.cls}`}>{kpiED.text}</div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--yellow)' }}>
          <div className="kpi-label">Công suất TB</div>
          <div className="kpi-value">-- <sup>kW</sup></div>
          <div className="kpi-delta flat">—</div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--red)' }}>
          <div className="kpi-label">Công suất Điện</div>
          <div className="kpi-value">{kpiPk} <sup>kW</sup></div>
          <div className="kpi-delta flat">—</div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as string]: 'var(--green)' }}>
          <div className="kpi-label">Xu hướng dự báo</div>
          <div className="kpi-value" style={{ fontSize: 16 }}>{kpiT}</div>
          <div className="kpi-delta flat" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>LR + Seasonality</div>
        </div>
      </div>

      {/* ── Section 1: Shift + Peak ── */}
      <div className="section-row">
        <span className="section-label">So sánh ca vận hành &amp; peak demand</span>
        <div className="section-line" />
      </div>
      <div className="grid-2" style={{ marginBottom: 14 }}>

        {/* Shift chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-activity" />Công suất 24h theo ca (kW)</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-sm" onClick={addShiftRow}><i className="bi bi-plus" />Thêm ca</button>
              <button className="btn-sm" onClick={resetShiftRows}>Reset</button>
              <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={loadShiftChart} disabled={shiftLoading}>Cập nhật</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 14px' }}>
            {shiftRows.map(row => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="date" className="filter-select" style={{ width: 128, padding: '4px 8px', fontSize: 12 }}
                  value={row.date} onChange={e => updateShiftRow(row.id, 'date', e.target.value)} />
                <select className="filter-select" style={{ width: 130, fontSize: 12 }}
                  value={row.shift} onChange={e => updateShiftRow(row.id, 'shift', parseInt(e.target.value) as 0 | 1 | 2)}>
                  {SHIFT_DEFS.map(([name], i) => <option key={i} value={i}>{name}</option>)}
                </select>
                <button className="btn-icon" style={{ color: 'var(--red)' }} onClick={() => removeShiftRow(row.id)}>
                  <i className="bi bi-x" />
                </button>
              </div>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <div className="chart-wrap" style={{ height: 220 }}><canvas ref={shiftRef} /></div>
            {shiftLoading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,17,27,0.6)', borderRadius: 4 }}><div className="spinner" /></div>}
          </div>
          <div className="legend-row" style={{ paddingBottom: 8 }}>
            {shiftRows.map((row, ri) => {
              const c = CHART_COLORS[ri % CHART_COLORS.length];
              return (
                <div key={row.id} className="legend-item">
                  <div style={{ width: 16, height: 2, background: c, borderRadius: 2 }} />
                  {row.date} {SHIFT_DEFS[row.shift][0]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Peak demand */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-lightning-fill" />Peak demand theo ngày (kW)</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" className="filter-select" style={{ width: 118, padding: '4px 8px', fontSize: 12 }}
                value={peakAddDate} onChange={e => setPeakAddDate(e.target.value)} />
              <button className="btn-sm" style={{ padding: '4px 7px' }} onClick={() => {
                if (peakAddDate && !peakDates.includes(peakAddDate)) {
                  setPeakDates(prev => { const next = [...prev, peakAddDate]; peakDatesRef.current = next; return next; });
                }
              }}><i className="bi bi-plus" /></button>
              <button className="btn-sm" onClick={() => { setPeakDates([]); peakDatesRef.current = []; }}>Reset</button>
              <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={loadPeakChart} disabled={peakLoading}>Cập nhật</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 14px 2px' }}>
            {peakDates.map(d => {
              const label = new Date(d).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
              return (
                <span key={d} className="tag">
                  {label}
                  <span className="rm" onClick={() => { const next = peakDates.filter(x => x !== d); setPeakDates(next); peakDatesRef.current = next; }}>×</span>
                </span>
              );
            })}
          </div>
          <div style={{ position: 'relative' }}>
            <div className="chart-wrap" style={{ height: 220 }}><canvas ref={peakRef} /></div>
            {peakLoading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,17,27,0.6)', borderRadius: 4 }}><div className="spinner" /></div>}
          </div>
          <div className="insight-strip">
            <div className="insight-cell"><div className="insight-lbl">Giờ đỉnh</div><div className="insight-val" style={{ color: 'var(--yellow)' }}>{peakStats.hour}</div></div>
            <div className="insight-cell"><div className="insight-lbl">Đỉnh (kW)</div><div className="insight-val" style={{ color: 'var(--red)' }}>{peakStats.max}</div></div>
            <div className="insight-cell"><div className="insight-lbl">Thấp (kW)</div><div className="insight-val" style={{ color: 'var(--green)' }}>{peakStats.min}</div></div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Month comparison + Bench ── */}
      <div className="section-row">
        <span className="section-label">So sánh tháng &amp; benchmarking hiệu suất</span>
        <div className="section-line" />
      </div>
      <div className="grid-2" style={{ marginBottom: 14 }}>

        {/* Month comparison */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-bar-chart-steps" />Điện năng ngày trong tháng (kWh)</span>
            <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <input className="filter-select" readOnly style={{ width: 160, fontSize: 12, cursor: 'pointer' }}
                  value={monthSel.length ? monthSel.map(m => m.label).join(', ') : 'Chọn nhiều tháng...'}
                  onClick={() => setMonthOpen(o => !o)} />
                {monthOpen && (
                  <div className="picker-drop">
                    {monthsByYear(baseMonths).map(([yr, ms]) => (
                      <div key={yr}>
                        <div className="picker-yr">{yr}</div>
                        <div className="picker-grid">
                          {ms.map(m => (
                            <div key={m.index} className={`picker-item${monthSel.find(x => x.index === m.index) ? ' sel' : ''}`}
                              onClick={() => toggleMonthSel(m)}>
                              {new Date(m.year, m.month, 1).toLocaleString('vi-VN', { month: 'short' })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn-sm" onClick={() => setMonthSel([])}>Reset</button>
              <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { doUpdateMonthChart(baseMonths, monthSel); setMonthOpen(false); }}>Cập nhật</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 14px 2px' }}>
            {monthSel.map(m => (
              <span key={m.index} className="tag">
                {m.label}
                <span className="rm" onClick={() => toggleMonthSel(m)}>×</span>
              </span>
            ))}
          </div>
          <div className="chart-wrap" style={{ height: 220 }}><canvas ref={monthRef} /></div>
        </div>

        {/* Benchmarking */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-bar-chart-line" />So chuẩn hiệu suất khu vực (%)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              So với
              <select className="filter-select" style={{ fontSize: 12 }} value={benchRefVal} onChange={e => { setBenchRefVal(e.target.value); doUpdateBench(e.target.value); }}>
                <option value="0.60">Mục tiêu (0.60)</option>
                <option value="0.65">Baseline (0.65)</option>
              </select>
            </div>
          </div>
          <div className="chart-wrap" style={{ height: 200 }}><canvas ref={benchCanvas} /></div>
          <div className="insight-strip">
            <div className="insight-cell"><div className="insight-lbl">Tốt nhất</div><div className="insight-val" style={{ color: 'var(--green)', fontSize: 13 }}>{benchBest}</div></div>
            <div className="insight-cell"><div className="insight-lbl">Cần cải thiện</div><div className="insight-val" style={{ color: 'var(--red)', fontSize: 13 }}>{benchWorst}</div></div>
            <div className="insight-cell"><div className="insight-lbl">Hiệu suất TB</div><div className="insight-val" style={{ color: 'var(--accent)' }}>{benchAvg}%</div></div>
          </div>
        </div>
      </div>

      {/* ── Section 3: Trend ── */}
      <div className="section-row">
        <span className="section-label"><i className="bi bi-graph-up-arrow" style={{ marginRight: 4 }} />Xu hướng &amp; dự báo (Linear + Seasonality)</span>
        <div className="section-line" />
      </div>
      <div className="grid-2-1">
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-activity" />Điện năng tháng + Trendline + Dự báo 3 tháng</span>
            <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <input className="filter-select" readOnly style={{ width: 180, fontSize: 12, cursor: 'pointer' }}
                  value={trendSel.length
                    ? (trendSel.length <= 3 ? trendSel.map(m => m.label).join(', ') : `${trendSel.slice(-3).map(m => m.label).join(', ')}…`)
                    : 'Chọn nhiều tháng...'}
                  onClick={() => setTrendOpen(o => !o)} />
                {trendOpen && (
                  <div className="picker-drop">
                    {monthsByYear(baseMonths).map(([yr, ms]) => (
                      <div key={yr}>
                        <div className="picker-yr">{yr}</div>
                        <div className="picker-grid">
                          {ms.map(m => (
                            <div key={m.index} className={`picker-item${trendSel.find(x => x.index === m.index) ? ' sel' : ''}`}
                              onClick={() => toggleTrendSel(m)}>
                              {new Date(m.year, m.month, 1).toLocaleString('vi-VN', { month: 'short' })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn-sm" onClick={() => setTrendSel([])}>Reset</button>
              <button className="btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { doUpdateTrendChart(baseMonths, trendSel); setTrendOpen(false); }}>Cập nhật dự báo</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 14px 2px' }}>
            {trendSel.map(m => (
              <span key={m.index} className="tag">
                {m.label}
                <span className="rm" onClick={() => toggleTrendSel(m)}>×</span>
              </span>
            ))}
          </div>
          <div className="chart-wrap" style={{ height: 260 }}><canvas ref={trendRef} /></div>
          <div className="legend-row">
            <div className="legend-item"><div style={{ width: 16, height: 2, background: 'var(--accent)', borderRadius: 2 }} />Thực tế</div>
            <div className="legend-item"><div style={{ width: 16, height: 2, background: 'rgba(56,170,255,.4)', borderRadius: 2 }} />Trendline</div>
            <div className="legend-item"><div style={{ width: 16, height: 2, background: 'var(--yellow)', borderRadius: 2 }} />Dự báo</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-calculator" />Tóm tắt</span>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Tốc độ thay đổi điện năng</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: trendSum.slope >= 0 ? 'var(--red)' : 'var(--green)' }}>
                {trendSum.slope >= 0 ? '+' : ''}{fmt(trendSum.slope, 1)} <small style={{ fontSize: 12, color: 'var(--text-muted)' }}>kWh/tháng</small>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                {trendSum.slope >= 0 ? '⚠ Xu hướng tăng — cần kiểm tra' : '✓ Xu hướng giảm — đang cải thiện'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Độ tin cậy R²</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: trendSum.r2 > 0.75 ? 'var(--green)' : trendSum.r2 > 0.5 ? 'var(--yellow)' : 'var(--red)' }}>
                {fmt(trendSum.r2 * 100, 1)} <small style={{ fontSize: 12 }}>%</small>
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>Dự báo 3 tháng tới</div>
            {(['T+1', 'T+2', 'T+3'] as const).map((lbl, i) => {
              const val = [trendSum.t1, trendSum.t2, trendSum.t3][i];
              return (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lbl}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--yellow)', fontWeight: 700 }}>
                    {fmt(val, 0)} <small style={{ fontSize: 10, color: 'var(--text-dim)' }}>kWh</small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section 4: Anomaly ── */}
      <div className="section-row">
        <span className="section-label"><i className="bi bi-exclamation-octagon" style={{ color: 'var(--red)', marginRight: 4 }} />Phát hiện bất thường (±2σ)</span>
        <div className="section-line" />
        <span style={{ fontSize: 11, color: anomCount > 0 ? 'var(--red)' : 'var(--green)' }}>
          {anomCount} điểm bất thường
        </span>
      </div>
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-radar" />Biểu đồ bất thường điện năng (kWh)</span>
          </div>
          <div className="chart-wrap" style={{ height: 260 }}><canvas ref={anomalyRef} /></div>
          <div className="legend-row">
            <div className="legend-item"><div style={{ width: 16, height: 2, background: 'var(--accent)', borderRadius: 2 }} />Tiêu thụ</div>
            <div className="legend-item"><div style={{ width: 14, height: 10, background: 'rgba(244,75,75,.1)', borderRadius: 2, border: '1px solid rgba(244,75,75,.3)' }} />Vùng ±2σ</div>
            <div className="legend-item"><div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--red)' }} />Bất thường</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-list-ul" />Danh sách bất thường</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{anomalies.length} mục</span>
          </div>
          <div className="anomaly-list">
            {anomalies.length === 0
              ? <div className="empty-state"><i className="bi bi-check-circle" /><span>Không phát hiện bất thường</span></div>
              : anomalies.map(a => (
                <div key={a.date} className="anomaly-item">
                  <div className="anomaly-icon" style={{ background: a.deviation > 0 ? 'var(--red-glow)' : 'var(--accent-dim)', color: a.deviation > 0 ? 'var(--red)' : 'var(--accent)', border: `1px solid ${a.deviation > 0 ? 'rgba(244,75,75,.3)' : 'var(--border-bright)'}` }}>
                    <i className={`bi ${a.deviation > 0 ? 'bi-arrow-up' : 'bi-arrow-down'}`} />
                  </div>
                  <div className="anomaly-body">
                    <div className="anomaly-title">{a.date}</div>
                    <div className="anomaly-time">{fmt(a.kwh, 1)} kWh/ngày</div>
                  </div>
                  <div className="anomaly-pct" style={{ color: a.deviation > 0 ? 'var(--red)' : 'var(--accent)' }}>
                    {a.deviation > 0 ? '+' : ''}{fmt(a.deviation, 2)}σ
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </Layout>
  );
}

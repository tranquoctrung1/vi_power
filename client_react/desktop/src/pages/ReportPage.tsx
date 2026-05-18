import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiGet } from '../api/client';
import Layout from '../components/Layout';
import { useToast } from '../components/Toast';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

type Period = 'day' | 'week' | 'month';

interface Device {
  deviceid: string;
  deviceName?: string;
  location?: string;
  samplingCycle?: number;
}

interface EnergyRow {
  timestamp: string;
  power?: number;
}

interface DevResult {
  device: Device;
  rows: EnergyRow[];
}

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null || isNaN(n)) return '--';
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
}

function buildTimeRange(p: Period) {
  const now = new Date();
  const endDate = new Date(now);
  let startDate: Date, labels: string[], bucketMs: number, periodLabel: string;

  if (p === 'day') {
    startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
    bucketMs = 3600000;
    labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    periodLabel = 'Hôm nay';
  } else if (p === 'week') {
    startDate = new Date(now); startDate.setDate(now.getDate() - 6); startDate.setHours(0, 0, 0, 0);
    bucketMs = 86400000;
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startDate); d.setDate(d.getDate() + i);
      return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
    });
    periodLabel = '7 ngày qua';
  } else {
    startDate = new Date(now); startDate.setDate(1); startDate.setHours(0, 0, 0, 0);
    bucketMs = 86400000;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}/${now.getMonth() + 1}`);
    periodLabel = `Tháng ${now.getMonth() + 1}`;
  }

  return { startDate, endDate, bucketMs, labels, periodLabel };
}

export default function ReportPage() {
  useAuth();
  const { showToast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [period, setPeriod] = useState<Period>('day');
  const [selDevice, setSelDevice] = useState('all');
  const [loading, setLoading] = useState(false);
  const [totalKwh, setTotalKwh] = useState<number | null>(null);
  const [peakKw, setPeakKw] = useState<number | null>(null);
  const [devSums, setDevSums] = useState<{ device: Device; total: number; max: number }[]>([]);
  const [chartTitle, setChartTitle] = useState('Biểu đồ tiêu thụ');

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);

  useEffect(() => { loadDevices(); }, []);
  useEffect(() => {
    if (devices.length > 0 || selDevice === 'all') loadReport();
  }, [period, selDevice, devices]);

  async function loadDevices() {
    try {
      const res = await apiGet('/devices?limit=1000');
      const json = await res.json();
      setDevices(json.data || json.devices || []);
    } catch {}
  }

  async function loadReport() {
    const targets = selDevice === 'all' ? devices : devices.filter(d => d.deviceid === selDevice);
    if (selDevice !== 'all' && !targets.length) return;

    setLoading(true);
    setTotalKwh(null); setPeakKw(null); setDevSums([]);

    const { startDate, endDate, bucketMs, labels, periodLabel } = buildTimeRange(period);
    setChartTitle(`Biểu đồ công suất — ${periodLabel}`);

    try {
      const results: DevResult[] = await Promise.all(
        targets.map(async d => {
          try {
            const url = `/data/energy/${encodeURIComponent(d.deviceid)}?startTime=${startDate.toISOString()}&endTime=${endDate.toISOString()}&limit=5000&sort=asc`;
            const res = await apiGet(url);
            const json = await res.json();
            return { device: d, rows: json.data || [] };
          } catch {
            return { device: d, rows: [] };
          }
        })
      );
      renderReport(results, labels, bucketMs, startDate);
    } catch {
      showToast('Lỗi tải dữ liệu báo cáo', 'error');
    } finally {
      setLoading(false);
    }
  }

  function renderReport(results: DevResult[], labels: string[], bucketMs: number, startDate: Date) {
    const buckets = Array(labels.length).fill(0);
    const counts = Array(labels.length).fill(0);
    let globalMax = 0;
    const sums: { device: Device; total: number; max: number }[] = [];

    results.forEach(({ device, rows }) => {
      let devTotal = 0, devMax = 0;
      rows.forEach(row => {
        const bi = Math.floor((new Date(row.timestamp).getTime() - startDate.getTime()) / bucketMs);
        if (bi >= 0 && bi < buckets.length) { buckets[bi] += (row.power || 0); counts[bi]++; }
        devTotal += (row.power || 0) * ((device.samplingCycle || 60) / 3600);
        if ((row.power || 0) > devMax) devMax = row.power || 0;
      });
      if (devMax > globalMax) globalMax = devMax;
      sums.push({ device, total: devTotal, max: devMax });
    });

    const kwhBuckets = buckets.map((sum, i) => counts[i] ? (sum / counts[i]) * (bucketMs / 3600000) : 0);
    setTotalKwh(kwhBuckets.reduce((a, b) => a + b, 0));
    setPeakKw(globalMax);
    setDevSums([...sums].sort((a, b) => b.total - a.total));

    const canvas = chartRef.current;
    if (!canvas) return;
    chartInst.current?.destroy();
    chartInst.current = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'kWh', data: kwhBuckets.map(v => +v.toFixed(2)),
          backgroundColor: 'rgba(56,170,255,0.6)', borderColor: '#38aaff', borderWidth: 1, borderRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#607b99', font: { size: 10 }, maxRotation: 45, maxTicksLimit: 12 }, grid: { display: false } },
          y: { ticks: { color: '#607b99', font: { size: 11 } }, grid: { color: 'rgba(56,139,253,0.08)' }, beginAtZero: true },
        },
      },
    });
  }

  const PERIODS: { id: Period; label: string }[] = [
    { id: 'day', label: 'Hôm nay' },
    { id: 'week', label: '7 ngày' },
    { id: 'month', label: 'Tháng này' },
  ];

  const topbarRight = (
    <button className="btn-icon" onClick={() => loadReport()} title="Làm mới">
      <i className="bi bi-arrow-clockwise" />
    </button>
  );

  return (
    <Layout title="Báo cáo tiêu thụ" breadcrumb={['ViPower', 'Giám sát', 'Báo cáo']} topbarRight={topbarRight}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="period-tabs" style={{ marginBottom: 0 }}>
          {PERIODS.map(p => (
            <button key={p.id} className={`period-tab${period === p.id ? ' active' : ''}`}
              onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
        <select className="filter-select" value={selDevice} onChange={e => setSelDevice(e.target.value)}>
          <option value="all">Tất cả thiết bị</option>
          {devices.map(d => <option key={d.deviceid} value={d.deviceid}>{d.deviceName || d.deviceid}</option>)}
        </select>
      </div>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Tổng tiêu thụ</div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
            {totalKwh != null ? fmt(totalKwh, 1) : '--'} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>kWh</span>
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Công suất đỉnh</div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>
            {peakKw != null ? fmt(peakKw, 1) : '--'} <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>kW</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <span className="card-title"><i className="bi bi-bar-chart" />{chartTitle}</span>
        </div>
        <div className="chart-wrap" style={{ height: 240 }}>
          <canvas ref={chartRef} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title"><i className="bi bi-list-ul" />Chi tiết theo thiết bị</span>
        </div>
        {loading ? (
          <div className="loading-wrap"><div className="spinner" /></div>
        ) : devSums.length === 0 || devSums.every(d => d.total === 0) ? (
          <div className="empty-state"><i className="bi bi-bar-chart" />Không có dữ liệu trong khoảng thời gian này.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Thiết bị</th>
                  <th>Vị trí</th>
                  <th>Tiêu thụ (kWh)</th>
                  <th>Đỉnh (kW)</th>
                </tr>
              </thead>
              <tbody>
                {devSums.map(({ device, total, max }, i) => (
                  <tr key={device.deviceid}>
                    <td className="td-muted">{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{device.deviceName || device.deviceid}</td>
                    <td className="td-muted">{device.location || '--'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700 }}>{fmt(total, 1)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--yellow)' }}>{fmt(max, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

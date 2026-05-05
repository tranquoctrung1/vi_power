'use strict';

// ============================================================
// STATE — populated from WebSocket server
// ============================================================
let AREAS      = [];
let DEVICES    = [];
let ALERTS     = [];
let ENERGY_MAP = {}; // deviceid → latest energy record

const SHARE_COLORS = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b'];
const THRESHOLD_KW = 700;

// ============================================================
// WEBSOCKET
// ============================================================
let ws             = null;
let reconnectTimer = null;

function connectWS() {
  ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    clearTimeout(reconnectTimer);
    ws.send(JSON.stringify({ type: 'client_init' }));
  });

  ws.addEventListener('message', (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    onWSMessage(msg);
  });

  ws.addEventListener('close', () => {
    reconnectTimer = setTimeout(connectWS, 5000);
  });

  ws.addEventListener('error', () => ws.close());
}

function sendWS(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
    return true;
  }
  return false;
}

function onWSMessage(msg) {
  switch (msg.type) {
    case 'data_init':
      applyInitData(msg.data);
      break;

    case 'chart_data':
      if (msg.data) {
        updateMainChart(msg.data);
        updatePeakBanner(msg.data);
        updateShiftBar(msg.data);
        updateChartInsights(msg.data);
      }
      break;

    case 'history_inserted': {
      const d = msg.data;
      if (!d?.deviceId) break;
      ENERGY_MAP[d.deviceId] = d;
      const dev = DEVICES.find(x => x.id === d.deviceId);
      if (dev) { dev.power = d.power || 0; dev.energy = d.netpower || 0; }
      refreshKPIs();
      break;
    }
  }
}

// ============================================================
// APPLY INIT DATA
// ============================================================
function applyInitData(data) {
  AREAS = (data.displaygroup || []).map((g, i) => ({
    key:    g.displaygrouid || g.displaygroupid,
    name:   g.name,
    status: 'ok',
    flow:   0,
    color:  SHARE_COLORS[i % SHARE_COLORS.length],
  }));

  ENERGY_MAP = {};
  for (const e of (data.dataEnergy || [])) {
    if (e.data) ENERGY_MAP[e.deviceid] = e.data;
  }

  DEVICES = (data.devices?.data || []).map(d => {
    const e = ENERGY_MAP[d.deviceid] || {};
    return {
      id:     d.deviceid,
      name:   d.deviceName,
      area:   d.displaygroupid,
      status: d.status === 'active' ? 'ok' : d.status === 'paused' ? 'warn' : 'error',
      power:  e.power    || 0,
      energy: e.netpower || 0,
      flow:   0,
    };
  });

  ALERTS = (data.alarms || []).map(a => ({
    level: a.level || 'warn',
    title: a.message || a.title || 'Cảnh báo',
    time:  new Date(a.createdAt || a.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    date:  'Hôm nay',
  }));

  rebuildAreaSelect();
  updateAll();
}

function rebuildAreaSelect() {
  const sel = document.getElementById('selectArea');
  sel.innerHTML = '<option value="all">Toàn nhà máy</option>' +
    AREAS.map(a => `<option value="${a.key}">${a.name}</option>`).join('');
  sel.value = 'all';
  toggleDeviceSelect('all');
}

// ============================================================
// UTILITIES
// ============================================================
function fmt(n, dec = 0) {
  return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: dec });
}

function showToast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  const colors = { error: 'var(--red)', warn: 'var(--yellow)', info: 'var(--accent)', ok: 'var(--green)' };
  const icons  = { error: 'bi-x-circle-fill', warn: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill', ok: 'bi-check-circle-fill' };
  t.className  = 'toast';
  t.innerHTML  = `<i class="bi ${icons[type] || icons.info}" style="color:${colors[type] || colors.info};font-size:16px;"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 350); }, 3500);
}

// ============================================================
// CLOCK
// ============================================================
function updateClock() {
  document.getElementById('clockDisplay').textContent =
    new Date().toLocaleTimeString('vi-VN', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ============================================================
// SPARKLINES
// ============================================================
const sparkCharts = {};
function initSparkline(id, color) {
  const ctx = document.getElementById(id);
  if (!ctx) return;
  sparkCharts[id] = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: color, borderWidth: 1.5, fill: true,
      backgroundColor: color.replace(')', ', 0.12)').replace('var(', 'rgba(').replace(/--[a-z-]+/, ''),
      pointRadius: 0, tension: 0.4 }] },
    options: { responsive: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } } },
  });
}

function updateSparkline(id, data) {
  if (!sparkCharts[id]) return;
  sparkCharts[id].data.labels              = data.map((_, i) => i);
  sparkCharts[id].data.datasets[0].data   = data;
  sparkCharts[id].update('none');
}

// ============================================================
// MAIN CHART
// ============================================================
let mainChart;
function initMainChart() {
  const ctx = document.getElementById('chartMain');
  mainChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Công suất hôm nay (kW)', data: [], borderColor: '#38aaff',
        backgroundColor: 'rgba(56,170,255,0.08)', fill: true,
        borderWidth: 2, pointRadius: 0, tension: 0.4 },
      { label: 'Hôm qua (kW)', data: [], borderColor: 'rgba(56,170,255,0.28)',
        backgroundColor: 'rgba(56,170,255,0.03)', fill: true,
        borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, tension: 0.4 },
      { label: `Ngưỡng ${THRESHOLD_KW} kW`, data: [], borderColor: 'rgba(244,75,75,0.7)',
        borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, fill: false },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111c2b', borderColor: 'rgba(56,139,253,0.28)', borderWidth: 1,
          titleColor: '#607b99', bodyColor: '#e6eef8', padding: 10,
          callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)} kW` },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(56,139,253,0.05)' },
             ticks: { color: '#3a506b', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 12 } },
        y: { min: 0, grid: { color: 'rgba(56,139,253,0.07)' },
             ticks: { color: '#607b99', font: { family: 'JetBrains Mono', size: 10 } },
             title: { display: true, text: 'kW', color: '#607b99', font: { size: 10 } } },
      },
    },
  });
}

function updateMainChart(ts) {
  const threshold = Array(ts.labels.length).fill(THRESHOLD_KW);
  mainChart.data.labels            = ts.labels;
  mainChart.data.datasets[0].data = ts.power;
  mainChart.data.datasets[1].data = ts.prevPower;
  mainChart.data.datasets[2].data = threshold;
  mainChart.update();
}

function updateChartInsights(ts) {
  const power    = ts.power    || [];
  const prevPow  = ts.prevPower || [];
  const energy   = ts.energy   || [];

  const currPow  = power[power.length - 1]       || 0;
  const prevLast = prevPow[prevPow.length - 1]   || 0;
  const peakPow  = power.length ? Math.max(...power) : 0;
  const peakIdx  = power.indexOf(peakPow);
  const peakTime = ts.labels[peakIdx] || '--';
  const shiftKwh = energy.slice(-8).reduce((s, e) => s + e, 0);
  const threshPct = Math.round(currPow / THRESHOLD_KW * 100);
  const pctColor  = threshPct >= 90 ? 'var(--red)' : threshPct >= 70 ? 'var(--yellow)' : 'var(--green)';

  document.getElementById('insight-now').textContent        = `${fmt(currPow, 1)} kW`;
  document.getElementById('insight-peak-time').textContent  = peakTime;
  document.getElementById('insight-shift-kwh').textContent  = `${fmt(shiftKwh, 1)} kWh`;
  const pctEl = document.getElementById('insight-threshold-pct');
  pctEl.textContent = `${threshPct}%`;
  pctEl.style.color = pctColor;

  updateSparkline('spark-power',  power.slice(-12));
  updateSparkline('spark-energy', energy.slice(-12));

  // Power delta vs previous period
  if (prevLast > 0) {
    const pDelta = ((currPow - prevLast) / prevLast * 100).toFixed(1);
    const pUp    = Number(pDelta) > 0;
    const pEl    = document.getElementById('kpi-power-delta');
    pEl.innerHTML = `<i class="bi bi-arrow-${pUp ? 'up' : 'down'}-short"></i> ${Math.abs(pDelta)}%`;
    pEl.className = `kpi-delta ${pUp ? 'up' : 'down'}`;
  }
}

// ============================================================
// KPI — from live device data
// ============================================================
function refreshKPIs() {
  const area     = document.getElementById('selectArea').value;
  const aDevices = area === 'all' ? DEVICES : DEVICES.filter(d => d.area === area);

  const totalPower  = aDevices.reduce((s, d) => s + (d.power  || 0), 0);
  const totalEnergy = aDevices.reduce((s, d) => s + (d.energy || 0), 0);
  const alerts   = ALERTS.filter(a => a.level !== 'ok');
  const critical = alerts.filter(a => a.level === 'error').length;
  const warnings = alerts.filter(a => a.level === 'warn').length;

  document.getElementById('kpi-energy').innerHTML = `${fmt(totalEnergy, 1)} <sup>kWh</sup>`;
  document.getElementById('kpi-power').innerHTML  = `${fmt(totalPower,  1)} <sup>kW</sup>`;
  document.getElementById('kpi-eff').innerHTML    = `-- <sup>kWh/m³</sup>`;
  document.getElementById('kpi-alerts').innerHTML = `${alerts.length} <sup>active</sup>`;
  document.getElementById('kpi-alerts-crit').textContent = `${critical} critical`;
  document.getElementById('kpi-alerts-warn').textContent = `${warnings} warning`;

  document.getElementById('kpi-energy-delta').innerHTML = '';
  document.getElementById('kpi-energy-delta').className = 'kpi-delta';
  document.getElementById('kpi-eff-delta').innerHTML    = '';
  document.getElementById('kpi-eff-delta').className    = 'kpi-delta';

  const aEl = document.getElementById('kpi-alerts-delta');
  aEl.innerHTML = `<i class="bi bi-arrow-up-short"></i> ${alerts.length} active`;
  aEl.className = `kpi-delta ${alerts.length ? 'down' : 'up'}`;

  updateSparkline('spark-eff', []);
}

// ============================================================
// DEVICE POPUP MODAL
// ============================================================
let modalSparkChart = null;

function openDeviceModal(deviceId) {
  const dev = DEVICES.find(d => d.id === deviceId);
  if (!dev) return;

  const sc      = dev.status === 'ok' ? '#22d369' : dev.status === 'warn' ? '#f5a623' : '#f44b4b';
  const stLabel = dev.status === 'ok'   ? 'Đang hoạt động bình thường'
                : dev.status === 'warn' ? 'Cảnh báo — cần kiểm tra'
                : 'Lỗi — ngừng hoạt động';
  const stIcon  = dev.status === 'ok'   ? 'bi-check-circle-fill'
                : dev.status === 'warn' ? 'bi-exclamation-triangle-fill'
                : 'bi-x-octagon-fill';

  document.getElementById('modalDeviceName').textContent = dev.name;
  document.getElementById('modalDeviceId').textContent   = dev.id;
  document.getElementById('modalStatusDot').style.cssText =
    `width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${sc};box-shadow:0 0 8px ${sc};`;
  document.getElementById('modalPower').innerHTML  = `${fmt(dev.power,  1)}<small> kW</small>`;
  document.getElementById('modalEnergy').innerHTML = `${fmt(dev.energy, 1)}<small> kWh</small>`;
  document.getElementById('modalFlow').innerHTML   = `<small style="color:var(--text-dim)">Không có</small>`;
  document.getElementById('modalEff').innerHTML    = `<small style="color:var(--text-dim)">--</small>`;
  document.getElementById('modalStatusRow').innerHTML =
    `<i class="bi ${stIcon}" style="color:${sc};font-size:15px;"></i>
     <span style="color:${sc};font-weight:600;">${stLabel}</span>`;
  document.getElementById('modalStatusRow').style.background = `${sc}18`;
  document.getElementById('modalStatusRow').style.border     = `1px solid ${sc}40`;
  document.getElementById('btnModalAnalysis').dataset.deviceId = dev.id;

  const sparkCtx = document.getElementById('modalSparkCanvas');
  if (modalSparkChart) { modalSparkChart.destroy(); modalSparkChart = null; }
  modalSparkChart = new Chart(sparkCtx, {
    type: 'line',
    data: { labels: [], datasets: [{ data: [], borderColor: sc,
      backgroundColor: sc + '1a', borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: true }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: '#111c2b', borderColor: 'rgba(56,139,253,0.28)', borderWidth: 1,
        bodyColor: '#e6eef8', padding: 6,
        callbacks: { label: c => ` ${fmt(c.parsed.y, 1)} kW` },
      } },
      scales: { x: { display: false }, y: { display: false, min: 0 } },
    },
  });

  document.getElementById('deviceModalBackdrop').classList.add('open');
}

function closeDeviceModal() {
  document.getElementById('deviceModalBackdrop').classList.remove('open');
  setTimeout(() => {
    if (modalSparkChart) { modalSparkChart.destroy(); modalSparkChart = null; }
  }, 250);
}

document.getElementById('btnModalClose').addEventListener('click', closeDeviceModal);
document.getElementById('btnModalClose2').addEventListener('click', closeDeviceModal);
document.getElementById('deviceModalBackdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('deviceModalBackdrop')) closeDeviceModal();
});
document.getElementById('btnModalAnalysis').addEventListener('click', () => {
  const id = document.getElementById('btnModalAnalysis').dataset.deviceId;
  showToast(`Chuyển sang Phân tích: ${id}`, 'info');
  closeDeviceModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDeviceModal(); });

// ============================================================
// STACKED BAR — AREA SHARE
// ============================================================
function updateShareBar(area) {
  const track   = document.getElementById('shareBarTrack');
  const legend  = document.getElementById('shareLegend');
  const totalEl = document.getElementById('shareTotalVal');

  const areaData   = AREAS.map(a => ({
    ...a,
    kwh: DEVICES.filter(d => d.area === a.key).reduce((s, d) => s + d.energy, 0),
  }));
  const grandTotal = areaData.reduce((s, a) => s + a.kwh, 0) || 1;
  const focused    = area !== 'all';

  track.innerHTML = areaData.map((a, i) => {
    const pct     = Math.round(a.kwh / grandTotal * 100);
    const opacity = focused && a.key !== area ? '0.25' : '1';
    return `<div class="share-bar-seg"
      style="width:${pct || 0}%;background:${SHARE_COLORS[i % SHARE_COLORS.length]};opacity:${opacity};"
      title="${a.name}: ${a.kwh.toLocaleString('vi-VN')} kWh (${pct}%)"></div>`;
  }).join('');

  legend.innerHTML = areaData.map((a, i) => {
    const pct       = Math.round(a.kwh / grandTotal * 100);
    const dim       = focused && a.key !== area;
    const rowOpacity = dim ? 'opacity:0.45;' : '';
    const highlight  = !dim && focused ? `border-color:${SHARE_COLORS[i % SHARE_COLORS.length]}33;` : '';
    return `<div class="share-legend-row" style="${rowOpacity}${highlight}" data-area="${a.key}">
      <div class="share-color-dot" style="background:${SHARE_COLORS[i % SHARE_COLORS.length]};"></div>
      <span class="share-name">${a.name}</span>
      <span class="share-kwh">${a.kwh.toLocaleString('vi-VN')} kWh</span>
      <span class="share-pct" style="background:${SHARE_COLORS[i % SHARE_COLORS.length]}22;color:${SHARE_COLORS[i % SHARE_COLORS.length]};">${pct}%</span>
    </div>`;
  }).join('');

  totalEl.textContent = `${grandTotal.toLocaleString('vi-VN')} kWh`;

  legend.querySelectorAll('.share-legend-row').forEach(row => {
    row.addEventListener('click', () => {
      const k = row.dataset.area;
      document.getElementById('selectArea').value = k;
      toggleDeviceSelect(k);
      updateAll();
    });
  });
}

// ============================================================
// AREA STATUS LIST
// ============================================================
function renderAreaStatus(area) {
  const list     = document.getElementById('areaStatusList');
  const filtered = area === 'all' ? AREAS : AREAS.filter(a => a.key === area);
  const online   = filtered.filter(a => a.status !== 'error').length;
  document.getElementById('areaOnlineCount').textContent = `${online}/${filtered.length} online`;

  list.innerHTML = filtered.map(a => {
    const aDevices = DEVICES.filter(d => d.area === a.key);
    const totalPow = aDevices.reduce((s, d) => s + d.power, 0);
    const dotColor = a.status === 'ok' ? 'var(--green)' : a.status === 'warn' ? 'var(--yellow)' : 'var(--red)';
    const stLabel  = a.status === 'ok' ? 'Bình thường' : a.status === 'warn' ? 'Cảnh báo' : 'Lỗi';
    return `<div class="area-item">
      <div class="area-dot" style="background:${dotColor};color:${dotColor}"></div>
      <div class="area-item-info">
        <div class="area-item-name">${a.name}</div>
        <div class="area-item-sub">${stLabel} · ${aDevices.length} thiết bị</div>
      </div>
      <div class="area-item-power">${fmt(totalPow, 1)}<br><small>kW</small></div>
    </div>`;
  }).join('');
}

// ============================================================
// TOP 5 CONSUMERS
// ============================================================
function renderTop5(area) {
  const list     = document.getElementById('consumerList');
  const filtered = area === 'all' ? DEVICES : DEVICES.filter(d => d.area === area);
  const sorted   = [...filtered].sort((a, b) => b.energy - a.energy).slice(0, 5);
  const maxE     = sorted[0]?.energy || 1;
  const totalE   = DEVICES.reduce((s, x) => s + x.energy, 0) || 1;

  list.innerHTML = sorted.map((d, i) => {
    const pct      = Math.round(d.energy / maxE * 100);
    const share    = Math.round(d.energy / totalE * 100);
    const areaName = AREAS.find(a => a.key === d.area)?.name || d.area;
    return `<div class="consumer-item">
      <div class="consumer-row">
        <span class="consumer-name">
          <span style="color:${SHARE_COLORS[i]};font-family:var(--font-mono);font-size:11px;margin-right:4px;">${String(i + 1).padStart(2, '0')}</span>
          ${d.name}
        </span>
        <span class="consumer-kw">${fmt(d.energy, 1)} kWh</span>
      </div>
      <div class="consumer-bar-track">
        <div class="consumer-bar-fill" style="width:${pct}%;background:${SHARE_COLORS[i]};"></div>
      </div>
      <span class="consumer-share">${d.id} · ${areaName} · ${share}% tổng</span>
    </div>`;
  }).join('');
}

// ============================================================
// DEVICE MINI LIST
// ============================================================
function renderDeviceMiniList(area, selectedDeviceId = 'all') {
  const c          = document.getElementById('deviceMiniList');
  const hint       = document.getElementById('deviceNavHint');
  const areaTag    = document.getElementById('deviceAreaTag');
  const filtered   = area === 'all' ? DEVICES : DEVICES.filter(d => d.area === area);
  const isSpecific = area !== 'all';

  document.getElementById('deviceCount').textContent = `${filtered.length} thiết bị`;
  hint.style.display = isSpecific ? 'flex' : 'none';
  if (isSpecific) {
    const areaName    = AREAS.find(a => a.key === area)?.name || area;
    areaTag.textContent   = areaName;
    areaTag.style.display = 'inline-block';
  } else {
    areaTag.style.display = 'none';
  }

  c.innerHTML = filtered.map(d => {
    const sc          = d.status === 'ok' ? 'var(--green)' : d.status === 'warn' ? 'var(--yellow)' : 'var(--red)';
    const sl          = d.status === 'ok' ? 'OK' : d.status === 'warn' ? 'WARN' : 'ERR';
    const isSelected  = selectedDeviceId !== 'all' && d.id === selectedDeviceId;
    const selStyle    = isSelected ? 'border-color:var(--accent);background:var(--bg-hover);' : '';
    const clickable   = isSpecific ? 'cursor:pointer;' : 'cursor:default;';
    const hoverAttr   = isSpecific ? `data-device-id="${d.id}"` : '';

    return `<div class="device-row" ${hoverAttr}
      style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--radius-sm);
             background:var(--bg-elevated);border:1px solid var(--border);transition:var(--transition);${clickable}${selStyle}">
      <div style="width:7px;height:7px;border-radius:50%;background:${sc};box-shadow:0 0 6px ${sc};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;font-weight:${isSelected ? '600' : '500'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${isSelected ? 'var(--accent)' : 'inherit'};">${d.name}</div>
        <div style="font-size:10.5px;color:var(--text-dim);">${d.id} · ${fmt(d.energy, 1)} kWh</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-primary);">${fmt(d.power, 1)} kW</div>
        <div style="font-size:10px;color:${sc};font-weight:700;">${sl}</div>
      </div>
      ${isSpecific ? `<i class="bi bi-arrow-right-short" style="color:${isSelected ? 'var(--accent)' : 'var(--text-dim)'};font-size:15px;flex-shrink:0;"></i>` : ''}
    </div>`;
  }).join('');

  if (isSpecific) {
    c.querySelectorAll('.device-row[data-device-id]').forEach(row => {
      row.addEventListener('mouseenter', () => {
        if (row.dataset.deviceId !== selectedDeviceId) {
          row.style.borderColor = 'var(--border-bright)';
          row.style.background  = 'var(--bg-hover)';
        }
      });
      row.addEventListener('mouseleave', () => {
        if (row.dataset.deviceId !== selectedDeviceId) {
          row.style.borderColor = 'var(--border)';
          row.style.background  = 'var(--bg-elevated)';
        }
      });
      row.addEventListener('click', () => openDeviceModal(row.dataset.deviceId));
    });
  }
}

// ============================================================
// ALERTS
// ============================================================
let currentAlertFilter = 'all';
function renderAlerts(filter = 'all') {
  currentAlertFilter = filter;
  const list = document.getElementById('alertList');
  const tabs = document.querySelectorAll('.alert-tab');
  tabs.forEach(t => { t.className = 'alert-tab'; });
  const activeTab = [...tabs].find(t => t.dataset.filter === filter);
  if (activeTab) activeTab.classList.add(`active-${filter === 'all' ? 'all' : filter}`);

  const filtered = filter === 'all' ? ALERTS : ALERTS.filter(a => a.level === filter);
  const icons    = { error: 'bi-x-octagon-fill', warn: 'bi-exclamation-triangle-fill', ok: 'bi-check-circle-fill' };
  list.innerHTML = filtered.map(a => `
    <div class="alert-item">
      <div class="alert-icon ${a.level}"><i class="bi ${icons[a.level] || icons.warn}"></i></div>
      <div class="alert-body">
        <div class="alert-title">${a.title}</div>
        <div class="alert-time">${a.date} · ${a.time}</div>
      </div>
      <div class="alert-badge ${a.level}">${a.level.toUpperCase()}</div>
    </div>`).join('');
}

document.addEventListener('click', e => {
  if (e.target.closest('.alert-tab')) renderAlerts(e.target.closest('.alert-tab').dataset.filter);
});

// ============================================================
// PEAK DEMAND
// ============================================================
function updatePeakBanner(ts) {
  if (!ts?.power?.length) return;
  const todayPeak = Math.max(...ts.power);
  const yestPeak  = Math.max(...(ts.prevPower || [0]));
  const monthPeak = Math.round(todayPeak * 1.15) || 1;
  const peakIdx   = ts.power.indexOf(todayPeak);
  const peakLbl   = ts.labels[peakIdx] || '--';
  const pct       = Math.round(todayPeak / monthPeak * 100);

  document.getElementById('peakToday').textContent     = `${fmt(todayPeak, 1)} kW`;
  document.getElementById('peakYesterday').textContent  = `${fmt(yestPeak,  1)} kW`;
  document.getElementById('peakMonth').textContent      = `${fmt(monthPeak, 1)} kW`;
  document.getElementById('peakTime').textContent       = peakLbl;
  document.getElementById('peakPct').textContent        = `${pct}%`;
  document.getElementById('peakBar').style.width        = `${pct}%`;
  document.getElementById('peakBar').style.background   =
    pct > 90 ? 'linear-gradient(90deg,#f5a623,#f44b4b)'
    : pct > 70 ? 'linear-gradient(90deg,#22d369,#f5a623)'
    : 'linear-gradient(90deg,#22d369,#38aaff)';
}

// ============================================================
// SHIFT STATUS
// ============================================================
function updateShiftBar(ts) {
  const hour = new Date().getHours();
  const caA  = hour < 8;
  const caB  = hour >= 8 && hour < 16;
  const caC  = hour >= 16;

  const shiftEnergy = (ts?.energy || []).slice(-8).reduce((s, e) => s + e, 0);
  document.getElementById('shiftEnergy').textContent = fmt(shiftEnergy, 1);

  const badges = document.querySelectorAll('.shift-badge');
  if (badges[0]) badges[0].className = `shift-badge ${caA ? 'active' : 'idle'}`;
  if (badges[1]) badges[1].className = `shift-badge ${caB ? 'active' : 'idle'}`;
  if (badges[2]) badges[2].className = `shift-badge ${caC ? 'active' : 'idle'}`;
}

// ============================================================
// DEVICE FILTER
// ============================================================
function populateDeviceSelect(areaKey) {
  const sel = document.getElementById('selectDevice');
  sel.innerHTML = '<option value="all">Tất cả thiết bị</option>';
  DEVICES.filter(d => d.area === areaKey).forEach(d => {
    const o = document.createElement('option');
    o.value       = d.id;
    o.textContent = `${d.id} · ${d.name}`;
    sel.appendChild(o);
  });
  sel.value = 'all';
}

function toggleDeviceSelect(area) {
  const sel = document.getElementById('selectDevice');
  if (area === 'all') {
    sel.style.display = 'none';
    sel.value = 'all';
  } else {
    populateDeviceSelect(area);
    sel.style.display = '';
  }
}

// ============================================================
// CHART SUBTITLE
// ============================================================
function updateSubtitle(area, deviceId, range) {
  const areaEl    = document.getElementById('selectArea');
  const rangeEl   = document.getElementById('rangeSelect');
  const areaText  = areaEl.options[areaEl.selectedIndex]?.text || 'Toàn nhà máy';
  const rangeText = rangeEl.options[rangeEl.selectedIndex]?.text || '';
  let subtitle    = `${areaText} · ${rangeText}`;
  if (deviceId && deviceId !== 'all') {
    const dev = DEVICES.find(d => d.id === deviceId);
    if (dev) subtitle = `${dev.name} · ${rangeText}`;
  }
  document.getElementById('chartSubtitle').textContent = subtitle;
}

// ============================================================
// MASTER UPDATE
// ============================================================
function updateAll() {
  const area     = document.getElementById('selectArea').value;
  const deviceId = document.getElementById('selectDevice').value;
  const range    = parseInt(document.getElementById('rangeSelect').value);

  sendWS({ type: 'request_chart_data', message: { area, device: deviceId, range } });

  refreshKPIs();
  renderAreaStatus(area);
  updateShareBar(area);
  renderTop5(area);
  renderDeviceMiniList(area, deviceId);
  renderAlerts(currentAlertFilter);
  updateSubtitle(area, deviceId, range);
  updateShiftBar(null);
}

// ============================================================
// INIT
// ============================================================
initSparkline('spark-energy', '#38aaff');
initSparkline('spark-power',  '#22d369');
initSparkline('spark-eff',    '#f5a623');
initMainChart();

document.getElementById('selectArea').addEventListener('change', e => {
  toggleDeviceSelect(e.target.value);
  updateAll();
});
document.getElementById('selectDevice').addEventListener('change', updateAll);
document.getElementById('rangeSelect').addEventListener('change', updateAll);

document.getElementById('btnRefresh').addEventListener('click', () => {
  updateAll();
  showToast('Dữ liệu đã được làm mới', 'ok');
});
document.getElementById('btnExport').addEventListener('click', () => {
  showToast('Đang xuất báo cáo CSV...', 'info');
});

connectWS();
setInterval(updateAll, 60000);

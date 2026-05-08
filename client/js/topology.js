'use strict';

let token = localStorage.getItem('token');
function authHeaders() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── State ─────────────────────────────────────────────────────
let allDevices    = [];
let displayGroups = [];
let alerts        = [];
let liveData      = {};  // deviceid → { power, netpower, isOnline }
let AREA_COLORS   = {};
let AREA_NAMES    = {};
const AREA_PALETTE = ['#38aaff', '#a855f7', '#22d369', '#f5a623', '#f44b4b', '#ff7043'];

let currentTab    = 'flow';
let editMode      = false;
let selectedDevice = null;
let ws = null, wsReconnectTimer = null;

// Map canvas drag state
let dragging = null;  // { device, startX, startY, origX, origY }

// ── Utils ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t  = document.createElement('div');
  t.className = 'toast';
  const cols = { info: 'var(--accent)', ok: 'var(--green)', warn: 'var(--yellow)', error: 'var(--red)' };
  const ics  = { info: 'bi-info-circle-fill', ok: 'bi-check-circle-fill', warn: 'bi-exclamation-triangle-fill', error: 'bi-x-circle-fill' };
  t.innerHTML = `<i class="bi ${ics[type]||ics.info}" style="color:${cols[type]||cols.info};font-size:16px;"></i>${msg}`;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 350); }, 3200);
}

function deviceStatusColor(dev) {
  if (!dev) return '#607b99';
  if (dev.status === 'inactive') return '#607b99';
  const devAlerts = alerts.filter(a => a.deviceid === dev.deviceid && !a.isComplete);
  if (devAlerts.some(a => a.severity === 'red'))    return '#f44b4b'; // vượt ngưỡng
  if (devAlerts.some(a => a.severity === 'orange')) return '#f5a623'; // dừng hoạt động
  return '#22d369'; // đang hoạt động
}

// ── WebSocket ─────────────────────────────────────────────────
function connectWS() {
  if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
  try { ws = new WebSocket(WS_URL); } catch { return; }
  ws.onopen    = () => ws.send(JSON.stringify({ type: 'client_init' }));
  ws.onmessage = e => { try { handleWSMsg(JSON.parse(e.data)); } catch (_) {} };
  ws.onerror   = () => {};
  ws.onclose   = () => { wsReconnectTimer = setTimeout(connectWS, 5000); };
}

function handleWSMsg(msg) {
  if (msg.type === 'data_init') {
    const data = msg.data || {};
    for (const e of (data.dataEnergy || [])) {
      if (e.data && e.data.length > 0) {
        liveData[e.deviceid] = {
          power:    e.data[0].power    || 0,
          netpower: e.data[0].netpower || 0,
          per:      e.data[0].per      || 0,
          isOnline: true,
        };
      }
    }
    if (currentTab === 'flow') renderFlow();
    else renderMap();
    if (selectedDevice) refreshDetailPanel(selectedDevice);
  }

  if (msg.type === 'history_inserted') {
    const d = msg.data;
    if (!d) return;
    const devid = d.deviceid || d.deviceId;
    if (!devid) return;
    liveData[devid] = {
      power:     d.power    || 0,
      netpower:  d.netpower || 0,
      per:       d.per      || 0,
      isOnline:  true,
      updatedAt: Date.now(),
    };
    if (currentTab === 'flow') renderFlow();
    else renderMap();
    if (selectedDevice?.deviceid === devid) refreshDetailPanel(selectedDevice);
  }
}

// ── Data fetch ────────────────────────────────────────────────
async function fetchData() {
  try {
    const [devRes, grpRes, altRes] = await Promise.all([
      fetch(`${API_BASE}/devices?limit=200`, { headers: authHeaders() }),
      fetch(`${API_BASE}/display-groups`,    { headers: authHeaders() }),
      fetch(`${API_BASE}/alerts/unresolved`, { headers: authHeaders() }),
    ]);
    const [devJson, grpJson, altJson] = await Promise.all([devRes.json(), grpRes.json(), altRes.json()]);

    if (devJson.success) allDevices = devJson.data?.data || devJson.data || [];
    if (grpJson.success) {
      displayGroups = grpJson.data?.data || grpJson.data || [];
      displayGroups.forEach((g, i) => {
        AREA_COLORS[g.displaygrouid || g._id] = AREA_PALETTE[i % AREA_PALETTE.length];
        AREA_NAMES[g.displaygrouid || g._id]  = g.groupName || g.name || g.displaygrouid;
      });
    }
    if (altJson.success) alerts = altJson.data || [];

    if (currentTab === 'flow') renderFlow();
    else renderMap();
  } catch (e) {
    showToast('Lỗi tải dữ liệu: ' + e.message, 'error');
  }
}

// ── FLOW DIAGRAM ──────────────────────────────────────────────
function renderFlow() {
  const svg = document.getElementById('flowSvg');
  const W = 1100, PAD = 40, GROUP_GAP = 60;
  const groups = displayGroups.length ? displayGroups : buildDefaultGroups();

  // Assign devices to groups
  const grouped = {};
  groups.forEach(g => { grouped[g.displaygrouid || g._id] = []; });
  allDevices.forEach(d => {
    const gid = d.displaygroupid;
    if (grouped[gid]) grouped[gid].push(d);
    else {
      grouped['__other'] = grouped['__other'] || [];
      grouped['__other'].push(d);
    }
  });
  if (grouped['__other']?.length) {
    groups.push({ displaygrouid: '__other', groupName: 'Khác' });
  }

  const COLS = groups.length;
  const colW = Math.max(200, Math.floor((W - PAD * 2 - GROUP_GAP * (COLS - 1)) / COLS));

  // Calculate heights
  const groupHeights = groups.map(g => {
    const devs = grouped[g.displaygrouid || g._id] || [];
    const rows = Math.ceil(devs.length / 2) || 1;
    return 80 + rows * 70;
  });
  const H = Math.max(400, Math.max(...groupHeights) + PAD * 2 + 60);

  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  let svgHtml = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(56,139,253,0.5)"/>
    </marker>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;

  // Draw flow arrows between groups first (behind boxes)
  for (let i = 0; i < groups.length - 1; i++) {
    const x1 = PAD + i * (colW + GROUP_GAP) + colW;
    const x2 = PAD + (i + 1) * (colW + GROUP_GAP);
    const y  = H / 2;
    svgHtml += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"
      stroke="rgba(56,139,253,0.3)" stroke-width="2" stroke-dasharray="6,4"
      marker-end="url(#arrow)"/>`;
  }

  // Draw groups and devices
  groups.forEach((g, gi) => {
    const gid   = g.displaygrouid || g._id;
    const gName = g.groupName || g.name || gid;
    const devs  = grouped[gid] || [];
    const x     = PAD + gi * (colW + GROUP_GAP);
    const gh    = groupHeights[gi];
    const y     = (H - gh) / 2;
    const color = AREA_COLORS[gid] || AREA_PALETTE[gi % AREA_PALETTE.length];
    const onlineCount = devs.filter(d => liveData[d.deviceid]?.isOnline).length;

    svgHtml += `
      <rect x="${x}" y="${y}" width="${colW}" height="${gh}" rx="10"
        fill="${color}11" stroke="${color}44" stroke-width="1.5"/>
      <text x="${x + colW/2}" y="${y + 22}" text-anchor="middle"
        font-size="13" font-weight="600" fill="${color}">${escSvg(gName)}</text>
      <text x="${x + colW/2}" y="${y + 38}" text-anchor="middle"
        font-size="10" fill="${color}99">${onlineCount}/${devs.length} online</text>`;

    devs.forEach((dev, di) => {
      const col = di % 2;
      const row = Math.floor(di / 2);
      const cx  = x + 30 + col * ((colW - 60) / 2) + (colW - 60) / 4;
      const cy  = y + 60 + row * 70 + 25;
      const sc  = deviceStatusColor(dev);
      const devId = dev.deviceid;
      const pw = liveData[devId]?.power?.toFixed(1) || '--';

      svgHtml += `
        <g class="flow-node" data-deviceid="${escAttr(devId)}"
           transform="translate(0,0)">
          <circle cx="${cx}" cy="${cy}" r="22" fill="${sc}22" stroke="${sc}" stroke-width="2"
            ${liveData[devId]?.isOnline ? 'filter="url(#glow)"' : ''}/>
          <text x="${cx}" y="${cy + 4}" text-anchor="middle"
            font-size="9" font-weight="600" fill="${sc}">${escSvg(dev.deviceid)}</text>
          <text x="${cx}" y="${cy + 38}" text-anchor="middle"
            font-size="10" fill="#e6eef8cc" style="max-width:${colW/2}px">
            ${escSvg(truncate(dev.deviceName, 12))}</text>
          <text x="${cx}" y="${cy + 50}" text-anchor="middle"
            font-size="9" font-family="JetBrains Mono, monospace" fill="${sc}cc">${pw} kW</text>
        </g>`;
    });
  });

  svg.innerHTML = svgHtml;

  // Attach click handlers
  svg.querySelectorAll('.flow-node').forEach(el => {
    el.addEventListener('click', () => {
      const dev = allDevices.find(d => d.deviceid === el.dataset.deviceid);
      if (dev) openDetailPanel(dev);
    });
  });
}

function buildDefaultGroups() {
  const groupSet = new Set(allDevices.map(d => d.displaygroupid).filter(Boolean));
  return [...groupSet].map(gid => ({ displaygrouid: gid, groupName: gid }));
}

function escSvg(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escAttr(s) {
  return String(s || '').replace(/"/g,'&quot;');
}
function truncate(s, n) {
  return s && s.length > n ? s.slice(0, n) + '…' : (s || '');
}

// ── FACTORY MAP (Canvas) ──────────────────────────────────────
const MAP_W = 1200, MAP_H = 700;
const NODE_R = 20;

function getCanvasPos(dev) {
  const cx = dev.coordinates?.x || 0;
  const cy = dev.coordinates?.y || 0;
  return { cx, cy };
}

function autoLayout() {
  // If device has 0,0 coords, auto-assign a grid position within its group
  const groupDevs = {};
  allDevices.forEach(d => {
    const gid = d.displaygroupid || '__other';
    if (!groupDevs[gid]) groupDevs[gid] = [];
    groupDevs[gid].push(d);
  });

  const groups = Object.keys(groupDevs);
  const COLS   = groups.length || 1;
  const zoneW  = MAP_W / COLS;

  groups.forEach((gid, gi) => {
    const devs = groupDevs[gid];
    devs.forEach((dev, di) => {
      if (!dev.coordinates?.x && !dev.coordinates?.y) {
        const perRow = Math.ceil(Math.sqrt(devs.length)) || 1;
        const col = di % perRow;
        const row = Math.floor(di / perRow);
        dev._autoX = gi * zoneW + 80 + col * 90;
        dev._autoY = 120 + row * 90;
      }
    });
  });
}

function renderMap() {
  const canvas = document.getElementById('mapCanvas');
  const ctx    = canvas.getContext('2d');
  autoLayout();

  ctx.clearRect(0, 0, MAP_W, MAP_H);

  // Background
  ctx.fillStyle = '#080d14';
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  // Grid
  ctx.strokeStyle = 'rgba(56,139,253,0.06)';
  ctx.lineWidth   = 1;
  for (let x = 0; x < MAP_W; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); ctx.stroke();
  }
  for (let y = 0; y < MAP_H; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); ctx.stroke();
  }

  // Draw area zones
  const groupDevs = {};
  allDevices.forEach(d => {
    const gid = d.displaygroupid || '__other';
    if (!groupDevs[gid]) groupDevs[gid] = [];
    groupDevs[gid].push(d);
  });

  const groups = Object.keys(groupDevs);
  const COLS   = groups.length || 1;
  const zoneW  = MAP_W / COLS;

  groups.forEach((gid, gi) => {
    const color = AREA_COLORS[gid] || AREA_PALETTE[gi % AREA_PALETTE.length];
    const name  = AREA_NAMES[gid]  || gid;
    const x     = gi * zoneW;

    // Zone background
    ctx.fillStyle   = color + '0a';
    ctx.strokeStyle = color + '33';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    roundRect(ctx, x + 8, 8, zoneW - 16, MAP_H - 16, 10);
    ctx.fill(); ctx.stroke();

    // Zone label
    ctx.font      = '600 13px Inter, sans-serif';
    ctx.fillStyle = color + 'cc';
    ctx.textAlign = 'center';
    ctx.fillText(name, x + zoneW / 2, 28);
  });

  // Draw devices
  allDevices.forEach(dev => {
    const cx = dev.coordinates?.x || dev._autoX || 60;
    const cy = dev.coordinates?.y || dev._autoY || 60;
    const sc = deviceStatusColor(dev);
    const pw = liveData[dev.deviceid]?.power?.toFixed(1) || '--';
    const isSelected = selectedDevice?.deviceid === dev.deviceid;

    // Glow for online devices
    if (liveData[dev.deviceid]?.isOnline && dev.status === 'active') {
      const grad = ctx.createRadialGradient(cx, cy, NODE_R, cx, cy, NODE_R * 2.5);
      grad.addColorStop(0, sc + '44');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, NODE_R * 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Selection ring
    if (isSelected) {
      ctx.strokeStyle = '#ffffff88';
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.arc(cx, cy, NODE_R + 5, 0, Math.PI * 2); ctx.stroke();
    }

    // Main circle
    ctx.fillStyle   = sc + '33';
    ctx.strokeStyle = sc;
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(cx, cy, NODE_R, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Device icon (type-based)
    ctx.font      = '10px "Bootstrap Icons", sans-serif';
    ctx.fillStyle = sc;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Device ID text in circle
    ctx.font      = '700 8px JetBrains Mono, monospace';
    ctx.fillStyle = sc;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dev.deviceid.slice(0, 6), cx, cy);

    // Name below
    ctx.font      = '11px Inter, sans-serif';
    ctx.fillStyle = '#e6eef8bb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(truncate(dev.deviceName, 12), cx, cy + NODE_R + 4);

    // Power below name
    ctx.font      = '9px JetBrains Mono, monospace';
    ctx.fillStyle = sc + 'cc';
    ctx.fillText(pw + ' kW', cx, cy + NODE_R + 18);

    ctx.textBaseline = 'alphabetic';
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function getDeviceAtPos(x, y) {
  return allDevices.find(dev => {
    const cx = dev.coordinates?.x || dev._autoX || 60;
    const cy = dev.coordinates?.y || dev._autoY || 60;
    const dx = cx - x, dy = cy - y;
    return Math.sqrt(dx * dx + dy * dy) <= NODE_R + 4;
  });
}

function setupMapInteraction() {
  const canvas = document.getElementById('mapCanvas');
  const wrap   = document.getElementById('mapCanvasWrap');
  let mouseDown = false;

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (MAP_W / r.width);
    const y = (e.clientY - r.top)  * (MAP_H / r.height);
    document.getElementById('mapCoordDisplay').textContent = `X: ${Math.round(x)} Y: ${Math.round(y)}`;

    if (dragging) {
      dragging.device.coordinates = dragging.device.coordinates || {};
      dragging.device.coordinates.x = Math.round(x);
      dragging.device.coordinates.y = Math.round(y);
      renderMap();
    } else {
      const hover = getDeviceAtPos(x, y);
      canvas.style.cursor = hover ? (editMode ? 'grab' : 'pointer') : (editMode ? 'crosshair' : 'default');
    }
  });

  canvas.addEventListener('mousedown', e => {
    if (!editMode) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (MAP_W / r.width);
    const y = (e.clientY - r.top)  * (MAP_H / r.height);
    const dev = getDeviceAtPos(x, y);
    if (dev) {
      dragging = { device: dev };
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    }
  });

  canvas.addEventListener('mouseup', async () => {
    if (dragging) {
      const dev = dragging.device;
      dragging = null;
      canvas.style.cursor = editMode ? 'crosshair' : 'default';
      await saveDeviceCoords(dev);
    }
  });

  canvas.addEventListener('click', e => {
    if (dragging) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (MAP_W / r.width);
    const y = (e.clientY - r.top)  * (MAP_H / r.height);
    const dev = getDeviceAtPos(x, y);
    if (dev) {
      selectedDevice = dev;
      openDetailPanel(dev);
      renderMap();
    }
  });

  canvas.addEventListener('mouseleave', async () => {
    if (dragging) {
      const dev = dragging.device;
      dragging = null;
      await saveDeviceCoords(dev);
    }
  });
}

async function saveDeviceCoords(dev) {
  try {
    const res = await fetch(`${API_BASE}/devices/${dev._id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ coordinates: dev.coordinates }),
    });
    const json = await res.json();
    if (json.success) showToast(`Đã lưu vị trí ${dev.deviceid}`, 'ok');
    else showToast('Lỗi lưu vị trí: ' + json.message, 'error');
  } catch {
    showToast('Lỗi kết nối khi lưu vị trí', 'error');
  }
}

// ── DETAIL PANEL ──────────────────────────────────────────────
function openDetailPanel(dev) {
  selectedDevice = dev;
  refreshDetailPanel(dev);
  document.getElementById('detailPanel').classList.add('open');
}

function refreshDetailPanel(dev) {
  const live = liveData[dev.deviceid] || {};
  const sc   = deviceStatusColor(dev);
  const areaName = AREA_NAMES[dev.displaygroupid] || dev.displaygroupid || '--';
  const activeAlerts = alerts.filter(a => a.deviceid === dev.deviceid && !a.resolved).length;

  document.getElementById('detailStatusDot').style.background = sc;
  document.getElementById('detailName').textContent     = dev.deviceName || dev.deviceid;
  document.getElementById('detailId').textContent       = dev.deviceid;
  document.getElementById('detailPower').textContent    = live.power != null ? `${live.power.toFixed(1)} kW` : '-- kW';
  document.getElementById('detailEnergy').textContent   = live.netpower != null ? `${live.netpower.toFixed(2)} kWh` : '-- kWh';
  const statusMap = { active: 'Đang hoạt động', inactive: 'Không hoạt động', paused: 'Dừng hoạt động' };
  document.getElementById('detailStatus').textContent   = statusMap[dev.status] || dev.status || '--';
  document.getElementById('detailArea').textContent     = areaName;
  document.getElementById('detailType').textContent     = dev.deviceType || '--';
  document.getElementById('detailLocation').textContent = dev.location   || '--';
  document.getElementById('detailCycle').textContent    = dev.samplingCycle ? `${dev.samplingCycle}s` : '--';
  document.getElementById('detailAlerts').textContent   = activeAlerts > 0 ? `${activeAlerts} active` : 'Không có';
  document.getElementById('detailAlerts').style.color   = activeAlerts > 0 ? 'var(--red)' : 'var(--green)';
}

// ── TABS ──────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.topo-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.topo-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panelFlow').classList.toggle('hidden', currentTab !== 'flow');
      document.getElementById('panelMap').classList.toggle('hidden',  currentTab !== 'map');
      if (currentTab === 'flow') renderFlow();
      else renderMap();
    });
  });
}

// ── EDIT MODE ─────────────────────────────────────────────────
function setupEditMode() {
  const btn  = document.getElementById('btnEditMode');
  const wrap = document.getElementById('mapCanvasWrap');
  const _u   = JSON.parse(localStorage.getItem('vp_user') || 'null');
  if (_u?.role !== 'Admin') { btn.style.display = 'none'; return; }
  btn.addEventListener('click', () => {
    editMode = !editMode;
    btn.classList.toggle('active-mode', editMode);
    btn.innerHTML = editMode
      ? '<i class="bi bi-pencil-fill"></i> Đang chỉnh sửa'
      : '<i class="bi bi-pencil"></i> Chỉnh sửa vị trí';
    if (wrap) wrap.classList.toggle('edit-cursor', editMode);
  });
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupEditMode();
  setupMapInteraction();

  document.getElementById('btnRefresh').addEventListener('click', fetchData);

  document.getElementById('btnCloseDetail').addEventListener('click', () => {
    document.getElementById('detailPanel').classList.remove('open');
    selectedDevice = null;
  });

  document.getElementById('btnGoReport').addEventListener('click', () => {
    if (selectedDevice) location.href = `report.html`;
  });
  document.getElementById('btnGoAnalysis').addEventListener('click', () => {
    if (selectedDevice) location.href = `analysis.html`;
  });

  fetchData();
  connectWS();
});

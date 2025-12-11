let wsManager = null;

Chart.register(ChartDataLabels);

// --- UI/Theme Toggle ---
const sidebar = document.getElementById('sidebar');
document
    .getElementById('toggleSidebar')
    .addEventListener('click', () => sidebar.classList.toggle('expanded'));

// --- Sample Data ---
const sampleDevices = [
    {
        id: 1,
        area: 'bom',
        name: 'Trạm Bơm 1',
        loc: 'Khu vực A',
        lat: 10.776,
        lng: 106.7,
        status: 'ok',
        power: 420,
        energy: 1250.5,
        flow: 2500,
    },
    {
        id: 2,
        area: 'xl',
        name: 'Máy Bơm Xử lý',
        loc: 'Khu vực B',
        lat: 10.777,
        lng: 106.702,
        status: 'warn',
        power: 310,
        energy: 980.2,
        flow: 1200,
    },
    {
        id: 3,
        area: 'bom',
        name: 'Trạm Bơm 2',
        loc: 'Khu vực C',
        lat: 10.778,
        lng: 106.699,
        status: 'error',
        power: 50,
        energy: 120.7,
        flow: 300,
    },
    {
        id: 4,
        area: 'vp',
        name: 'Văn Phòng',
        loc: 'Khu hành chính',
        lat: 10.7775,
        lng: 106.7005,
        status: 'ok',
        power: 20,
        energy: 250.1,
        flow: 500,
    },
];
const sampleAlerts = [
    {
        level: 'error',
        title: 'Mất nguồn - Trạm Bơm 2',
        time: '2025-10-30 09:12',
    },
    {
        level: 'warn',
        title: 'Áp suất thấp - Máy Bơm Xử lý',
        time: '2025-10-30 08:50',
    },
    {
        level: 'ok',
        title: 'Trạng thái ổn định - Trạm Bơm 1',
        time: '2025-10-30 07:20',
    },
    {
        level: 'warn',
        title: 'Tăng nhiệt độ động cơ - Trạm Bơm 1',
        time: '2025-10-30 06:40',
    },
    {
        level: 'error',
        title: 'Mất tín hiệu cảm biến áp lực - Khu Xử Lý',
        time: '2025-10-30 05:55',
    },
    {
        level: 'warn',
        title: 'Nhiệt độ phòng máy cao',
        time: '2025-10-30 04:30',
    },
    { level: 'error', title: 'Chập điện khu vực VP', time: '2025-10-30 03:00' },
];
const AREA_MAP = {
    'Khu Xử Lý': 'xl',
    'Trạm Bơm Tổng': 'bom',
    'Văn Phòng': 'vp',
    'Vận hành Chung': 'chung',
};

/********** 1. Generate Data **********/
function generateTimeSeries(hours) {
    const labels = [],
        power = [],
        energy = [];
    const now = new Date();
    const numPoints = hours;
    const step = hours < 169 ? 1 : hours < 721 ? 24 : 168; // 1h for 24h, 24h for 7 days, 168h for 30 days
    for (let i = numPoints - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * step * 3600000);
        let timeLabel;
        if (hours === 24) timeLabel = d.toTimeString().slice(0, 5);
        else if (hours === 168)
            timeLabel = d.toLocaleDateString('vi-VN', { weekday: 'short' });
        else
            timeLabel = d.toLocaleDateString('vi-VN', {
                month: 'numeric',
                day: 'numeric',
            });
        labels.push(timeLabel);

        const basePower = 300;
        const baseEnergy = 8;
        const randomFactor = Math.random() * 0.4 - 0.2;
        power.push(Math.round(basePower + basePower * randomFactor));
        energy.push(
            parseFloat((baseEnergy + baseEnergy * randomFactor).toFixed(1)),
        );
    }
    // Simple Prev data generation
    const prevPower = power.map((p) => p * (0.9 + Math.random() * 0.2));
    const prevEnergy = energy.map((e) => e * (0.9 + Math.random() * 0.2));
    return { labels, power, energy, prevPower, prevEnergy };
}

/********** 2. Chart Main (Power & Energy) **********/
let mainChart;
const ctxMain = document.getElementById('chartMain').getContext('2d');
mainChart = new Chart(ctxMain, {
    type: 'line',
    data: {
        labels: [],
        datasets: [],
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: { boxWidth: 10 },
            },
        },
        scales: {
            x: { grid: { display: false } },
            y: {
                type: 'linear',
                position: 'left',
                min: 0,
                title: {
                    display: true,
                    text: 'Công suất (kW)',
                    color: '#0d6efd',
                },
            },
            y1: {
                type: 'linear',
                position: 'right',
                min: 0,
                title: {
                    display: true,
                    text: 'Điện năng (kWh)',
                    color: '#16a34a',
                },
                grid: { drawOnChartArea: false },
            },
        },
    },
});

/********** 3. Chart Share (Donut) **********/
let shareChart;
const ctxShare = document.getElementById('chartShare').getContext('2d');
shareChart = new Chart(ctxShare, {
    type: 'doughnut',
    data: {
        labels: ['Khu Xử Lý', 'Trạm Bơm Tổng', 'Văn Phòng', 'Vận hành Chung'],
        datasets: [
            {
                data: [43.7, 30.1, 17.5, 8.7], // Default to month
                backgroundColor: ['#059669', '#f59e0b', '#3b82f6', '#475569'],
                borderWidth: 0,
            },
        ],
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10 } },
            datalabels: { color: '#fff', formatter: (v) => v + '%' },
        },
        onClick: (e, elements) => {
            if (elements.length > 0) {
                const label = shareChart.data.labels[elements[0].index];
                let areaKey = 'all';
                const reversedMap = Object.keys(AREA_MAP).reduce((acc, key) => {
                    acc[AREA_MAP[key]] = key;
                    return acc;
                }, {});
                if (label in reversedMap) areaKey = reversedMap[label]; // Map label back to area key

                if (areaKey !== 'chung') {
                    document.getElementById('selectArea').value = areaKey;
                    populateDeviceSelect(areaKey);
                    updateMainChartAndWidgets();
                }
            }
        },
    },
});

function updateDonutTotal(mode = 'month') {
    const sum = sampleDevices.reduce((s, d) => s.energy + d.energy, {
        energy: 0,
    }).energy;
    const total = mode === 'today' ? Math.round(sum * 0.03) : Math.round(sum);
    document.getElementById('donutTotal').innerText =
        total.toLocaleString() + ' kWh';
}
updateDonutTotal('month');

document.getElementById('btnToday').addEventListener('click', () => {
    shareChart.data.datasets[0].data = [40, 35, 15, 10];
    shareChart.update();
    updateDonutTotal('today');
    document.getElementById('btnToday').classList.add('active');
    document.getElementById('btnMonth').classList.remove('active');
});

document.getElementById('btnMonth').addEventListener('click', () => {
    shareChart.data.datasets[0].data = [43.7, 30.1, 17.5, 8.7];
    shareChart.update();
    updateDonutTotal('month');
    document.getElementById('btnMonth').classList.add('active');
    document.getElementById('btnToday').classList.remove('active');
});

/********** 4. Comparison Chart **********/
let comparisonChart;
function calculateEfficiency(energy, flow) {
    return flow > 0 ? (energy / flow).toFixed(2) : 0;
}
function renderComparisonChart(area = 'all') {
    if (comparisonChart) comparisonChart.destroy();

    const selectAreaText =
        document.getElementById('selectArea').selectedOptions[0].text;
    const isAreaComparison = area === 'all';
    const chartTitle = isAreaComparison
        ? 'So sánh Điện năng & Hiệu suất Khu vực'
        : `So sánh Điện năng & Hiệu suất Thiết bị (${selectAreaText})`;
    document
        .querySelector('#chartCompare')
        .closest('.card')
        .querySelector('h6').innerText = chartTitle;

    let filteredList = [];
    const reversedAreaMap = Object.keys(AREA_MAP).reduce((acc, key) => {
        acc[AREA_MAP[key]] = key;
        return acc;
    }, {});

    if (isAreaComparison) {
        const areaKeys = Object.values(AREA_MAP).filter((k) => k !== 'chung');
        // Aggregate data by area
        filteredList = areaKeys.map((key) => {
            const areaDevices = sampleDevices.filter((d) => d.area === key);
            const totalEnergy = areaDevices.reduce(
                (sum, d) => sum + d.energy,
                0,
            );
            const totalFlow = areaDevices.reduce((sum, d) => sum + d.flow, 0);
            // Use the Vietnamese name for the label
            const labelName =
                Object.keys(AREA_MAP).find((k) => AREA_MAP[k] === key) || key;
            return {
                name: labelName,
                energy: totalEnergy,
                eff: calculateEfficiency(totalEnergy, totalFlow),
            };
        });
    } else {
        // Filter by device for a specific area
        filteredList = sampleDevices
            .filter((d) => d.area === area)
            .map((d) => ({
                name: d.name,
                energy: d.energy,
                eff: calculateEfficiency(d.energy, d.flow),
            }));
    }

    const labels = filteredList.map((d) => d.name);
    const energyData = filteredList.map((d) => d.energy);
    const effData = filteredList.map((d) => parseFloat(d.eff));

    comparisonChart = new Chart(
        document.getElementById('chartCompare').getContext('2d'),
        {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Điện năng (kWh)',
                        data: energyData,
                        backgroundColor: 'rgba(13, 110, 253, 0.7)',
                        yAxisID: 'y',
                    },
                    {
                        type: 'line',
                        label: 'Hiệu suất (kWh/m³)',
                        data: effData,
                        borderColor: '#dc2626',
                        backgroundColor: 'rgba(220, 38, 38, 0.2)',
                        yAxisID: 'y1',
                        tension: 0.4,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10 } },
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Điện năng (kWh)',
                            color: '#0d6efd',
                        },
                        min: 0,
                    },
                    y1: {
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Hiệu suất (kWh/m³)',
                            color: '#dc2626',
                        },
                        grid: { drawOnChartArea: false },
                        min: 0,
                    },
                },
            },
        },
    );
}

/********** 5. Heatmap Render **********/
function generateHeatmapData(mul = 1) {
    const data = [];
    for (let d = 0; d < 7; d++) {
        const dayData = [];
        for (let h = 0; h < 24; h++) {
            // Simulate average power based on time of day and multiplier
            let base = 50 + Math.random() * 50; // Base power 50-100 kW
            if (h >= 8 && h <= 17) {
                // Peak hours (8am - 5pm)
                base += 100 + Math.random() * 200; // 150-300 kW
            } else if (h >= 18 || h <= 7) {
                // Off-peak hours
                base += Math.random() * 50; // 50-150 kW
            }
            // Add a daily trend variation
            if (d < 5) base *= 1.1; // Weekdays slightly higher
            if (d === 6) base *= 0.8; // Sunday lower
            dayData.push(Math.round(base * mul));
        }
        data.push(dayData);
    }
    return data;
}

function renderHeatmap(mul = 1) {
    const container = document.getElementById('heatmapContainer');
    const data = generateHeatmapData(mul);

    // Color gradient for heatmap (8 steps from light to dark accent)
    const colors = [
        '#f3f8fe',
        '#e1effd',
        '#b0d5fb',
        '#7abef9',
        '#47a6f7',
        '#2563eb',
        '#1d4ed8',
        '#1e40af',
    ];
    // Calculate min and max globally or dynamically for the current data
    const allData = data.flat();
    const maxVal = Math.max(...allData);
    const minVal = Math.min(...allData);
    // Ensure step is not zero for uniform data
    const range = maxVal - minVal;
    const step = range > 0 ? range / 8 : 1;

    let html = '<div class="heatmap-grid">';
    html += '<div class="heatmap-header-cell">Giờ</div>';
    for (let h = 0; h < 24; h++) {
        html += `<div class="heatmap-header-cell">${h < 10 ? '0' + h : h}</div>`;
    }
    const days = ['CN', 'T7', 'T6', 'T5', 'T4', 'T3', 'T2'];
    for (let d = 0; d < 7; d++) {
        html += `<div class="heatmap-header-cell">${days[d]}</div>`;
        for (let h = 0; h < 24; h++) {
            const value = data[d][h];
            let colorIndex = Math.floor((value - minVal) / step);
            colorIndex = Math.min(7, Math.max(0, colorIndex)); // Ensure index is 0-7
            const colorClass = colors[colorIndex];
            const textColor = colorIndex >= 5 ? 'color: white;' : ''; // White text for dark backgrounds
            html += `<div class="heatmap-data-cell" style="background-color: ${colorClass}; ${textColor}" title="${days[d]} ${h}h: ${value} kW">${value}</div>`;
        }
    }
    html += '</div>';
    container.innerHTML = html;
}

/********** 6. Alert & Table rendering **********/
function renderAlerts(filter = 'all') {
    const list = sampleAlerts.filter((a) =>
        filter === 'all' ? true : a.level === filter,
    );
    const ul = document.getElementById('alertsList');
    ul.innerHTML = '';
    list.forEach((a) => {
        const cls =
            a.level === 'error'
                ? 'danger'
                : a.level === 'warn'
                  ? 'warning'
                  : 'success';
        const icon =
            a.level === 'error'
                ? 'bi-x-octagon-fill'
                : a.level === 'warn'
                  ? 'bi-exclamation-triangle-fill'
                  : 'bi-check-circle-fill';
        ul.innerHTML += `<li><div class="d-flex justify-content-between"> <div><i class="bi ${icon} text-${cls} me-2"></i><strong>${a.title}</strong><br><small class="muted">${a.time}</small></div> <div><span class="badge bg-${cls} rounded-pill">${a.level.toUpperCase()}</span></div> </div> </li>`;
    });
    const alertsCount = sampleAlerts.filter((x) => x.level !== 'ok').length;
    document.getElementById('kpi-alerts').innerText = alertsCount;
}

document.querySelectorAll('#alertFilterGroup .btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        document
            .querySelectorAll('#alertFilterGroup .btn')
            .forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');
        renderAlerts(e.target.getAttribute('data-filter'));
    });
});
renderAlerts();

/********** 7. Devices table render **********/
function renderDevices(area = 'all') {
    const tbody = document.getElementById('devicesTableBody');
    tbody.innerHTML = '';
    const list = sampleDevices.filter((d) =>
        area === 'all' ? true : d.area === area,
    );
    list.forEach((d) => {
        const statusColor =
            d.status === 'ok'
                ? 'success'
                : d.status === 'warn'
                  ? 'warning'
                  : 'danger';
        tbody.innerHTML += `<tr> <td>${d.id}</td><td>${d.name}</td><td>${d.loc}</td> <td><span class="badge bg-${statusColor}">${d.status.toUpperCase()}</span></td> <td>${d.power}</td><td>${d.energy.toFixed(1)}</td> </tr>`;
    });
    document.getElementById('devicesCount').innerText =
        `Tổng: ${list.length} thiết bị`;
}

/********** 8. KPI updates & Summary Insight **********/
function updateKPIsAndSummary(area, ts, range) {
    const totalEnergy = ts.energy.reduce((sum, e) => sum + e, 0);
    const totalPower =
        ts.power.reduce((sum, p) => sum + p, 0) / ts.power.length;
    const totalFlow = sampleDevices.reduce(
        (sum, d) => sum + d.flow * (range / 24),
        0,
    ); // Flow simulation
    const alertsCount = sampleAlerts.filter((a) => a.level !== 'ok').length;
    const rangeText =
        range === 24
            ? '24h trước'
            : range === 168
              ? '7 ngày trước'
              : '30 ngày trước';

    // Simulate change metrics (Simple random delta for demonstration)
    const deltaE = (Math.random() * 10 - 5).toFixed(1);
    const deltaP = (Math.random() * 10 - 5).toFixed(1);
    const deltaEf = (Math.random() * 10 - 5).toFixed(1);
    const deltaA = Math.round(Math.random() * 3 - 1);

    // Update Energy KPI
    document.getElementById('kpi-energy').innerText =
        totalEnergy.toLocaleString(undefined, { maximumFractionDigits: 0 }) +
        ' kWh';
    document.getElementById('kpi-energy-change').innerHTML =
        `${deltaE > 0 ? '▲' : '▼'} ${Math.abs(deltaE)}% <span class="muted">vs. ${rangeText}</span>`;
    document.getElementById('kpi-energy-change').className =
        `small text-${deltaE > 0 ? 'danger' : 'success'}`;

    // Update Power KPI
    document.getElementById('kpi-power').innerText =
        totalPower.toLocaleString(undefined, { maximumFractionDigits: 0 }) +
        ' kW';
    document.getElementById('kpi-power-change').innerHTML =
        `${deltaP > 0 ? '▲' : '▼'} ${Math.abs(deltaP)}% <span class="muted">vs. ${rangeText}</span>`;
    document.getElementById('kpi-power-change').className =
        `small text-${deltaP > 0 ? 'success' : 'danger'}`;

    // Update Efficiency KPI
    const eff = totalFlow > 0 ? (totalEnergy / totalFlow).toFixed(2) : 0;
    document.getElementById('kpi-eff').innerText = eff + ' kWh/m³';
    document.getElementById('kpi-eff-change').innerHTML =
        `${deltaEf > 0 ? '▲' : '▼'} ${Math.abs(deltaEf)}% <span class="muted">vs. ${rangeText}</span>`;
    document.getElementById('kpi-eff-change').className =
        `small text-${deltaEf > 0 ? 'success' : 'danger'}`;

    // Update Alerts KPI
    document.getElementById('kpi-alerts').innerText = alertsCount;
    document.getElementById('kpi-alerts-change').innerHTML =
        `${deltaA > 0 ? '▲' : '▼'} ${Math.abs(deltaA)} <span class="muted">vs. ${rangeText}</span>`;
    document.getElementById('kpi-alerts-change').className =
        `small text-${deltaA > 0 ? 'danger' : 'success'}`;

    // Insight Summary
    const areaText =
        document.getElementById('selectArea').selectedOptions[0].text;
    const topConsumer = sampleDevices.reduce(
        (max, d) => (d.energy > max.energy ? d : max),
        { energy: 0, name: 'N/A' },
    );
    let summary = `Trong ${rangeText}, ${areaText} đã tiêu thụ tổng cộng <strong class="text-primary">${totalEnergy.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh</strong>. `;
    summary += `Tổng công suất trung bình là <strong class="text-warning">${totalPower.toLocaleString(undefined, { maximumFractionDigits: 0 })} kW</strong>. `;
    summary += `Hiện có <strong class="text-danger">${alertsCount} cảnh báo</strong> đang hoạt động. `;
    if (area === 'all') {
        summary += `Thiết bị tiêu thụ lớn nhất là <strong class="text-success">${topConsumer.name}</strong> (${topConsumer.energy.toFixed(1)} kWh/ngày).`;
    }
    document.getElementById('insightSummary').innerHTML = summary;
}

/********** 9. Main Update Function **********/
let currentTs = generateTimeSeries(24);

function updateMainChartAndWidgets() {
    const area = getSelectedArea();
    const device = getSelectedDevice();
    const range = parseInt(document.getElementById('rangeSelect').value);

    // 1. Re-generate TS data based on selection (for demo purposes)
    currentTs = generateTimeSeries(range);
    let mul = 1;
    if (area === 'xl') mul = 0.75;
    if (area === 'bom') mul = 1.2;

    // Filter data for Main Chart based on area/device
    let powerData = currentTs.power.map((p) => p * mul);
    let energyData = currentTs.energy.map((e) => e * mul);

    if (device !== 'all') {
        const targetDevice = sampleDevices.find((d) => d.name === device);
        if (targetDevice) {
            // Adjust base power/energy for specific device
            const devicePowerMul = targetDevice.power / 420;
            powerData = powerData.map((p) => p * 0.4 * devicePowerMul);
            energyData = energyData.map((e) => e * 0.4 * devicePowerMul);
        }
    }

    // 2. Update Main Chart
    mainChart.data.labels = currentTs.labels;
    mainChart.data.datasets = [
        {
            label: 'Công suất (kW)',
            data: powerData,
            borderColor: '#0d6efd',
            backgroundColor: 'rgba(13,110,253,0.1)',
            tension: 0.3,
            pointRadius: 2,
            fill: true,
            type: 'line', // <-- Công suất là dạng đường
            yAxisID: 'y',
        },
        {
            label: 'Điện năng (kWh)',
            data: energyData,
            backgroundColor: 'rgba(22, 163, 74, 0.7)', // Màu đậm hơn cho cột
            type: 'bar', // <-- Điện năng là dạng cột
            yAxisID: 'y1',
        },
    ];
    mainChart.options.scales.y.title.text =
        range > 24 ? 'Công suất TB (kW)' : 'Công suất (kW)';
    document.getElementById('chartSubtitle').innerText =
        `Khu vực: ${document.getElementById('selectArea').selectedOptions[0].text}`;
    mainChart.update();

    // 3. Update KPI Cards and Summary
    updateKPIsAndSummary(area, { power: powerData, energy: energyData }, range);

    // 4. Update Comparison Chart
    renderComparisonChart(area);

    // 5. Update Devices Table
    renderDevices(area);

    // 6. Update Heatmap
    renderHeatmap(mul);
}

/********** 10. Area/device mapping + filters **********/
function populateDeviceSelect(areaKey) {
    const sel = document.getElementById('selectDevice');
    sel.innerHTML = '<option value="all">Tất cả thiết bị</option>';
    sampleDevices
        .filter((d) => (areaKey === 'all' ? true : d.area === areaKey))
        .forEach((d) => {
            const o = document.createElement('option');
            o.value = d.name;
            o.textContent = d.name;
            sel.appendChild(o);
        });
}

function getSelectedArea() {
    return document.getElementById('selectArea').value;
}
function getSelectedDevice() {
    return document.getElementById('selectDevice').value;
}

// Initial setup and event listeners
populateDeviceSelect('all');
document.getElementById('selectArea').addEventListener('change', (e) => {
    populateDeviceSelect(e.target.value);
    updateMainChartAndWidgets();
});
document
    .getElementById('selectDevice')
    .addEventListener('change', updateMainChartAndWidgets);
document
    .getElementById('rangeSelect')
    .addEventListener('change', updateMainChartAndWidgets);

// Initial load - chạy hàm cập nhật chính để load tất cả biểu đồ và dữ liệu
updateMainChartAndWidgets();

document.addEventListener('DOMContentLoaded', () => {
    // Initialize the WebSocket worker manager
    const wsManager = new WebSocketWorkerManager({
        debug: false,
        autoConnect: true,
        autoRequestData: true,
    });

    // Handle connection events
    wsManager.on('connected', (data) => {
        console.log('✅ Connected to server');
    });

    wsManager.on('disconnected', (data) => {
        console.log('🔌 Disconnected from server');
    });

    // Handle initial data
    wsManager.on('initial_data', (data) => {
        console.log('📊 Received initial data:', data);
    });

    // Handle errors
    wsManager.on('error', (error) => {
        console.error('❌ Error:', error);
    });

    window.addEventListener('resize', () => {});
});

window.addEventListener('beforeunload', () => {
    wsManager.closeConnection();
});

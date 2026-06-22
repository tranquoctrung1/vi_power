const DisplayGroupModel = require('../models/DisplayGroup');
const DeviceModel = require('../models/Device');
const EnergyDataModel = require('../models/EnergyData');
const AlertModel = require('../models/Alert');

class DataSocket {
    data = {};

    constructor() {
        this.data = {
            displaygroup: [],
            devices: [],
            dataEnergy: [],
            alarms: [],
            donutData: [],
        };
    }

    async init() {
        this.data.displaygroup = await this.getDisplayGroup();
        this.data.devices = await this.getDevices();
        this.data.dataEnergy = await this.getDataEnergy();
        this.data.alarms = await this.getAlarms();
        this.data.donutData = await this.getDonutData();
        // Baseline included up front so dashboard doesn't flash 0/stale "today" energy
        // before the separate request_energy_today round-trip resolves.
        this.data.energyToday = await this.getEnergyToday('all', 'all');
        return this.data;
    }

    async getDisplayGroup() {
        return await DisplayGroupModel.findAll();
    }

    async getDevices() {
        return await DeviceModel.findAll({}, { limit: 1000 });
    }

    async getDataEnergy() {
        const devices = await DeviceModel.findAll({}, { limit: 1000 });

        const result = [];
        for (const item of devices.data) {
            const data = await EnergyDataModel.findLatest(item.deviceid);
            result.push({ deviceid: item.deviceid, data });
        }

        return result;
    }

    async getAlarms() {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const endDate = new Date();
        return await AlertModel.findByTimeRange(startDate, endDate);
    }

    // Time series for main line chart — buckets aligned to VN wall-clock (0h,1h,2h.../calendar day),
    // power = sum across devices of each device's avg power in bucket (true simultaneous demand, not avg-mixed)
    // Returns { labels, power, energy, prevPower, prevEnergy }
    async getChartData(area, device, range) {
        const devices = await DeviceModel.findAll({}, { limit: 1000 });
        let targets = devices.data.filter((d) => d.deviceid?.trim());

        if (area !== 'all') {
            targets = targets.filter((d) => d.displaygroupid === area);
            if (device !== 'all') {
                targets = targets.filter((d) => d.deviceid === device);
            }
        }

        const nowUtc = new Date();
        const nowVn = new Date(nowUtc.getTime() + 7 * 3600000);
        const todayStartUtc = new Date(
            Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate()) - 7 * 3600000,
        );

        let stepMs, numPoints, startDate;
        if (range === 24) {
            stepMs = 3600000; // 1 hour, aligned to 0h/1h/2h... of today
            numPoints = 24;
            startDate = todayStartUtc;
        } else if (range === 168) {
            stepMs = 86400000; // 1 day
            numPoints = 7;
            startDate = new Date(todayStartUtc.getTime() - 6 * stepMs);
        } else {
            stepMs = 86400000; // 1 day
            numPoints = 30;
            startDate = new Date(todayStartUtc.getTime() - 29 * stepMs);
        }
        const prevStart = new Date(startDate.getTime() - numPoints * stepMs);

        const aggregate = async (start) => {
            const end = new Date(start.getTime() + numPoints * stepMs);
            const devBuckets = Array.from({ length: numPoints }, () => ({}));
            const energyBuckets = Array.from({ length: numPoints }, () => 0);

            for (const dev of targets) {
                const col = await EnergyDataModel.getCollection(
                    EnergyDataModel.getCollectionName(dev.deviceid),
                );

                const data = await EnergyDataModel.findByTimeRange(
                    dev.deviceid,
                    start,
                    end,
                    { limit: 50000, sort: { timestamp: 1 } },
                );

                // netpower is a cumulative kWh counter — bucket energy = delta vs end of previous bucket,
                // not a sum of raw samples (summing the same counter many times would wildly overcount).
                const byIdx = {};
                for (const r of data) {
                    const idx = Math.min(
                        numPoints - 1,
                        Math.floor((new Date(r.timestamp) - start) / stepMs),
                    );
                    if (idx < 0) continue;
                    (byIdx[idx] || (byIdx[idx] = [])).push(r);
                    const b = devBuckets[idx][dev.deviceid] || (devBuckets[idx][dev.deviceid] = { p: 0, n: 0 });
                    b.p += r.power || 0;
                    b.n++;
                }

                const before = await col
                    .find({ timestamp: { $lt: start } })
                    .sort({ timestamp: -1 })
                    .limit(1)
                    .toArray();
                let lastVal = before.length ? (before[0].netpower || 0) : null;

                for (let i = 0; i < numPoints; i++) {
                    const readings = byIdx[i];
                    if (!readings || !readings.length) continue;
                    const lastReading = readings[readings.length - 1].netpower || 0;
                    if (lastVal != null) {
                        energyBuckets[i] += Math.max(0, lastReading - lastVal);
                    }
                    lastVal = lastReading;
                }
            }

            const power = devBuckets.map((b) =>
                Math.round(Object.values(b).reduce((s, d) => s + (d.n ? d.p / d.n : 0), 0)),
            );
            const energy = energyBuckets.map((v) => parseFloat(v.toFixed(1)));
            return { power, energy };
        };

        const [cur, prev] = await Promise.all([
            aggregate(startDate),
            aggregate(prevStart),
        ]);

        const WEEKDAY_VN = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'];
        const labels = Array.from({ length: numPoints }, (_, i) => {
            // Bucket START time, converted UTC → VN wall-clock (UTC+7), independent of host TZ
            const vn = new Date(startDate.getTime() + i * stepMs + 7 * 3600000);
            if (range === 24) {
                return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`;
            }
            if (range === 168) return WEEKDAY_VN[vn.getUTCDay()];
            return `${vn.getUTCMonth() + 1}/${vn.getUTCDate()}`;
        });

        return {
            labels,
            power: cur.power,
            energy: cur.energy,
            prevPower: prev.power,
            prevEnergy: prev.energy,
        };
    }

    // Real peak demand: highest single-device power reading in window, VN calendar windows
    // Returns { today, yesterday, month } each = { value, time, deviceId, deviceName }
    async getPeakDemand(area, device) {
        const devices = await DeviceModel.findAll({}, { limit: 1000 });
        let targets = devices.data.filter((d) => d.deviceid?.trim());
        if (area !== 'all') {
            targets = targets.filter((d) => d.displaygroupid === area);
            if (device !== 'all') {
                targets = targets.filter((d) => d.deviceid === device);
            }
        }
        const nameMap = {};
        targets.forEach((d) => { nameMap[d.deviceid] = d.deviceName || d.deviceid; });

        const nowUtc = new Date();
        const nowVn = new Date(nowUtc.getTime() + 7 * 3600000);
        const todayStartUtc = new Date(
            Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate()) - 7 * 3600000,
        );
        const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 86400000);
        const monthStartUtc = new Date(
            Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), 1) - 7 * 3600000,
        );

        const findPeak = async (start, end) => {
            let best = { value: -1, time: '--', deviceId: null, deviceName: '--' };

            for (const dev of targets) {
                const data = await EnergyDataModel.findByTimeRange(
                    dev.deviceid,
                    start,
                    end,
                    { limit: 50000, sort: { timestamp: 1 } },
                );
                for (const r of data) {
                    const val = r.power || 0;
                    if (val > best.value) {
                        const ts = new Date(new Date(r.timestamp).getTime() + 7 * 3600000);
                        best = {
                            value: val,
                            time: `${String(ts.getUTCHours()).padStart(2, '0')}:${String(ts.getUTCMinutes()).padStart(2, '0')}`,
                            deviceId: dev.deviceid,
                            deviceName: nameMap[dev.deviceid] || dev.deviceid,
                        };
                    }
                }
            }

            if (best.value < 0) return { value: 0, time: '--', deviceId: null, deviceName: '--' };
            return { ...best, value: Math.round(best.value) };
        };

        const [today, yesterday, month] = await Promise.all([
            findPeak(todayStartUtc, nowUtc),
            findPeak(yesterdayStartUtc, todayStartUtc),
            findPeak(monthStartUtc, nowUtc),
        ]);

        return { today, yesterday, month };
    }

    // Real "energy today" = sum of (current netpower - netpower at VN midnight) per device.
    // netpower is a lifetime cumulative kWh counter, so a plain sum-of-current-value is wrong.
    // Returns { value, devices: [{ deviceId, baseline, value }] } — baseline lets clients keep
    // computing live per-device "today" delta themselves as new netpower readings stream in.
    async getEnergyToday(area, device) {
        const devices = await DeviceModel.findAll({}, { limit: 1000 });
        let targets = devices.data.filter((d) => d.deviceid?.trim());
        if (area !== 'all') {
            targets = targets.filter((d) => d.displaygroupid === area);
            if (device !== 'all') {
                targets = targets.filter((d) => d.deviceid === device);
            }
        }

        const nowUtc = new Date();
        const nowVn = new Date(nowUtc.getTime() + 7 * 3600000);
        const todayStartUtc = new Date(
            Date.UTC(nowVn.getUTCFullYear(), nowVn.getUTCMonth(), nowVn.getUTCDate()) - 7 * 3600000,
        );

        let total = 0;
        const deviceBreakdown = [];
        for (const dev of targets) {
            const col = await EnergyDataModel.getCollection(
                EnergyDataModel.getCollectionName(dev.deviceid),
            );
            const latest = await col.find({}).sort({ timestamp: -1 }).limit(1).toArray();
            if (!latest.length) continue;
            const current = latest[0].netpower || 0;

            // Baseline = first reading at/after VN midnight (nearest-after), never look before
            // todayStartUtc — matches ReportPage's method so both pages always agree.
            const firstToday = await col
                .find({ timestamp: { $gte: todayStartUtc } })
                .sort({ timestamp: 1 })
                .limit(1)
                .toArray();
            const baseline = firstToday.length ? (firstToday[0].netpower || 0) : current;

            const value = Math.max(0, current - baseline);
            total += value;
            deviceBreakdown.push({ deviceId: dev.deviceid, baseline, value: parseFloat(value.toFixed(1)) });
        }

        return { value: parseFloat(total.toFixed(1)), devices: deviceBreakdown };
    }

    // Per-group energy totals for donut chart
    // Returns [{ name, energy, percentage }]
    async getDonutData() {
        const groups = await DisplayGroupModel.findAll();
        const devices = await DeviceModel.findAll({}, { limit: 1000 });

        const result = [];
        let totalEnergy = 0;

        for (const group of groups) {
            const groupId = group.displaygroupid || group.displaygrouid;
            const groupDevices = devices.data.filter(
                (d) => d.displaygroupid === groupId,
            );
            let groupEnergy = 0;

            for (const dev of groupDevices) {
                if (!dev.deviceid?.trim()) continue;
                const latest = await EnergyDataModel.findLatest(dev.deviceid, 1);
                if (latest.length > 0) groupEnergy += latest[0].netpower || 0;
            }

            result.push({ name: group.name, energy: groupEnergy });
            totalEnergy += groupEnergy;
        }

        return result.map((r) => ({
            ...r,
            percentage:
                totalEnergy > 0
                    ? parseFloat(((r.energy / totalEnergy) * 100).toFixed(1))
                    : 0,
        }));
    }

    // 7-day × 24-hour average power matrix for heatmap
    // Returns number[7][24]
    async getHeatmapData(area, device) {
        const now = new Date();
        const startDate = new Date(now.getTime() - 7 * 86400000);

        const devices = await DeviceModel.findAll({}, { limit: 1000 });
        let targets = devices.data.filter((d) => d.deviceid?.trim());

        if (area !== 'all') {
            targets = targets.filter((d) => d.displaygroupid === area);
            if (device !== 'all') {
                targets = targets.filter((d) => d.deviceid === device);
            }
        }

        // grid[dayOfWeek 0-6][hour 0-23]
        const grid = Array.from({ length: 7 }, () =>
            Array.from({ length: 24 }, () => ({ sum: 0, n: 0 })),
        );

        for (const dev of targets) {
            const data = await EnergyDataModel.findByTimeRange(
                dev.deviceid,
                startDate,
                now,
                { limit: 50000, sort: { timestamp: 1 } },
            );
            for (const r of data) {
                // Convert UTC timestamp to VN wall-clock (UTC+7) regardless of host TZ
                const vn = new Date(new Date(r.timestamp).getTime() + 7 * 3600000);
                const day = vn.getUTCDay();
                const hour = vn.getUTCHours();
                grid[day][hour].sum += r.power || 0;
                grid[day][hour].n++;
            }
        }

        return grid.map((day) =>
            day.map((cell) => (cell.n ? Math.round(cell.sum / cell.n) : 0)),
        );
    }

    async getHistoryData(area, device, range) {
        const result = {
            kwh: null,
            kw: null,
            pf: null,
            alarms: [],
        };

        const now = new Date();
        const startDate = new Date();

        // Previous period: same duration, ending at range-ago
        if (range === 24) {
            startDate.setHours(startDate.getHours() - 48);
            now.setHours(now.getHours() - 24);
        } else if (range === 168) {
            startDate.setDate(startDate.getDate() - 14);
            now.setDate(now.getDate() - 7);
        } else {
            startDate.setDate(startDate.getDate() - 60);
            now.setDate(now.getDate() - 30);
        }

        const devices = await DeviceModel.findAll({}, { limit: 1000 });

        if (area === 'all') {
            for (const item of devices.data) {
                if (!item.deviceid?.trim()) continue;
                const data = await EnergyDataModel.findByTimeRange(
                    item.deviceid,
                    startDate,
                    now,
                );
                if (data.length > 0) {
                    result.kwh = (result.kwh || 0) + (data[0].netpower || 0);
                    result.kw = (result.kw || 0) + (data[0].power || 0);
                    result.pf = (result.pf || 0) + (data[0].per || 0);
                }
            }
            result.alarms = await AlertModel.findByTimeRange(startDate, now);
        } else {
            let filtered = devices.data.filter(
                (el) => el.displaygroupid === area,
            );
            if (device !== 'all') {
                filtered = filtered.filter((el) => el.deviceid === device);
            }

            for (const item of filtered) {
                if (!item.deviceid?.trim()) continue;
                const data = await EnergyDataModel.findByTimeRange(
                    item.deviceid,
                    startDate,
                    now,
                );
                if (data.length > 0) {
                    result.kwh = (result.kwh || 0) + (data[0].netpower || 0);
                    result.kw = (result.kw || 0) + (data[0].power || 0);
                    result.pf = (result.pf || 0) + (data[0].per || 0);
                }
            }

            const allAlarms = await AlertModel.findByTimeRange(startDate, now);
            const filterIds = filtered.map((el) => el.deviceid);
            result.alarms = allAlarms.filter((el) =>
                filterIds.includes(el.deviceid),
            );
        }

        return result;
    }
}

module.exports = new DataSocket();

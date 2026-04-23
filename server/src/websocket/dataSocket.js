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

    // Time series for main line chart
    // Returns { labels, power, energy, prevPower, prevEnergy }
    async getChartData(area, device, range) {
        const now = new Date();
        const devices = await DeviceModel.findAll({}, { limit: 1000 });
        let targets = devices.data.filter((d) => d.deviceid?.trim());

        if (area !== 'all') {
            targets = targets.filter((d) => d.displaygroupid === area);
            if (device !== 'all') {
                targets = targets.filter((d) => d.deviceid === device);
            }
        }

        let stepMs, numPoints;
        if (range === 24) {
            stepMs = 3600000; // 1 hour
            numPoints = 24;
        } else if (range === 168) {
            stepMs = 86400000; // 1 day
            numPoints = 7;
        } else {
            stepMs = 86400000; // 1 day
            numPoints = 30;
        }

        const startDate = new Date(now.getTime() - numPoints * stepMs);
        const prevStart = new Date(startDate.getTime() - numPoints * stepMs);

        const cur = Array.from({ length: numPoints }, () => ({
            power: 0,
            energy: 0,
            n: 0,
        }));
        const prev = Array.from({ length: numPoints }, () => ({
            power: 0,
            energy: 0,
            n: 0,
        }));

        for (const dev of targets) {
            if (!dev.deviceid?.trim()) continue;

            const curData = await EnergyDataModel.findByTimeRange(
                dev.deviceid,
                startDate,
                now,
                { limit: 50000, sort: { timestamp: 1 } },
            );
            for (const r of curData) {
                const idx = Math.min(
                    numPoints - 1,
                    Math.floor((new Date(r.timestamp) - startDate) / stepMs),
                );
                if (idx >= 0) {
                    cur[idx].power += r.power || 0;
                    cur[idx].energy += r.netpower || 0;
                    cur[idx].n++;
                }
            }

            const prevData = await EnergyDataModel.findByTimeRange(
                dev.deviceid,
                prevStart,
                startDate,
                { limit: 50000, sort: { timestamp: 1 } },
            );
            for (const r of prevData) {
                const idx = Math.min(
                    numPoints - 1,
                    Math.floor((new Date(r.timestamp) - prevStart) / stepMs),
                );
                if (idx >= 0) {
                    prev[idx].power += r.power || 0;
                    prev[idx].energy += r.netpower || 0;
                    prev[idx].n++;
                }
            }
        }

        const labels = Array.from({ length: numPoints }, (_, i) => {
            const d = new Date(startDate.getTime() + (i + 1) * stepMs);
            if (range === 24) return d.toTimeString().slice(0, 5);
            if (range === 168)
                return d.toLocaleDateString('vi-VN', { weekday: 'short' });
            return d.toLocaleDateString('vi-VN', {
                month: 'numeric',
                day: 'numeric',
            });
        });

        return {
            labels,
            power: cur.map((b) => (b.n ? Math.round(b.power / b.n) : 0)),
            energy: cur.map((b) => parseFloat(b.energy.toFixed(1))),
            prevPower: prev.map((b) => (b.n ? Math.round(b.power / b.n) : 0)),
            prevEnergy: prev.map((b) => parseFloat(b.energy.toFixed(1))),
        };
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
                const d = new Date(r.timestamp);
                const day = d.getDay();
                const hour = d.getHours();
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

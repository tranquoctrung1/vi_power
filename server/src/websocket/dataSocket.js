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
        };
    }

    async init() {
        this.data.displaygroup = await this.getDisplayGroup();
        this.data.devices = await this.getDevices();
        this.data.dataEnergy = await this.getDataEnergy();
        this.data.alarms = await this.getAlarms();
        return this.data;
    }

    async getDisplayGroup() {
        return await DisplayGroupModel.findAll();
    }

    async getDevices() {
        return await DeviceModel.findAll();
    }

    async getDataEnergy() {
        const devices = await DeviceModel.findAll();

        const result = [];
        for (const item of devices.data) {
            const data = await EnergyDataModel.findLatest(item.deviceid);
            const obj = {
                deviceid: item.deviceid,
                data: data,
            };
            result.push(obj);
        }

        return result;
    }

    async getAlarms() {
        const now = new Date(Date.now());
        const startDate = new Date(Date.now());
        now.setDate(now.getDate() - 8);
        startDate.setDate(startDate.getDate() - 30);

        return await AlertModel.findByTimeRange(startDate, now);
    }

    async getHistoryData(area, device, range) {
        const result = {
            kwh: null,
            kw: null,
            pf: null,
            alarms: null,
        };

        console.log(range);
        console.log(area);
        console.log(device);

        const devices = await DeviceModel.findAll();
        const now = new Date(Date.now());
        const startDate = new Date(Date.now());
        now.setDate(now.getDate() - 8);
        startDate.setDate(startDate.getDate() - 8);

        if (area === 'all') {
            if (range === 24) {
                startDate.setHours(startDate.getHours() - 25);
            } else if (range === 168) {
                startDate.setHours(startDate.getHours() - 169);
            } else {
                startDate.setHours(startDate.getHours() - 721);
            }

            for (const item of devices.data) {
                if (
                    item.deviceid !== null &&
                    item.deviceid !== undefined &&
                    item.deviceid.trim() !== ''
                ) {
                    const data = await EnergyDataModel.findByTimeRange(
                        item.deviceid,
                        startDate,
                        now,
                    );
                    if (data.length > 0) {
                        result.kwh += data[data.length - 1].netpower;
                        result.kw += data[data.length - 1].power;
                        result.pf += data[data.length - 1].per;
                    }
                }
            }

            result.alarms = await AlertModel.findByTimeRange(startDate, now);
        } else {
            if (device === 'all') {
                const filtered = devices.data.filter(
                    (el) => el.displaygroupid === area,
                );
                if (range === 24) {
                    startDate.setHours(startDate.getHours() - 25);
                } else if (range === 168) {
                    startDate.setHours(startDate.getHours() - 169);
                } else {
                    startDate.setHours(startDate.getHours() - 721);
                }

                for (const item of filtered) {
                    if (
                        item.deviceid !== null &&
                        item.deviceid !== undefined &&
                        item.deviceid.trim() !== ''
                    ) {
                        const data = await EnergyDataModel.findByTimeRange(
                            item.deviceid,
                            startDate,
                            now,
                        );
                        if (data.length > 0) {
                            result.kwh += data[data.length - 1].netpower;
                            result.kw += data[data.length - 1].power;
                            result.pf += data[data.length - 1].per;
                        }
                    }
                }

                const alarms = await AlertModel.findByTimeRange(startDate, now);

                const filterDeviceId = filtered.map((el) => el.deviceid);

                result.alarms = alarms.filter(
                    (el) => el.deviceid.indexOf(filterDeviceId) !== -1,
                );
            } else {
                const find = devices.data.find((el) => el.deviceid === device);
                if (find !== undefined) {
                    if (range === 24) {
                        startDate.setHours(startDate.getHours() - 25);
                    } else if (range === 168) {
                        startDate.setHours(startDate.getHours() - 169);
                    } else {
                        startDate.setHours(startDate.getHours() - 721);
                    }

                    const data = await EnergyDataModel.findByTimeRange(
                        find.deviceid,
                        startDate,
                        now,
                    );
                    if (data.length > 0) {
                        result.kwh += data[data.length - 1].netpower;
                        result.kw += data[data.length - 1].power;
                        result.pf += data[data.length - 1].per;
                    }

                    const alarms = await AlertModel.findByTimeRange(
                        startDate,
                        now,
                    );

                    result.alarms = alarms.filter(
                        (el) => el.deviceid === find.deviceid,
                    );
                }
            }
        }

        return result;
    }
}

module.exports = new DataSocket();

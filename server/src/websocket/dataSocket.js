const DisplayGroupModel = require('../models/DisplayGroup');
const DeviceModel = require('../models/Device');
const EnergyDataModel = require('../models/EnergyData');

class DataSocket {
    data = {};

    constructor() {
        this.data = {
            displaygroup: [],
            devices: [],
            dataEnergy: [],
        };
    }

    async init() {
        this.data.displaygroup = await this.getDisplayGroup();
        this.data.devices = await this.getDevices();
        this.data.dataEnergy = await this.getDataEnergy();
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
}

module.exports = new DataSocket();

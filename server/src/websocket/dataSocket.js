const DisplayGroupModel = require('../models/DisplayGroup');

class DataSocket {
    data = {};

    constructor() {
        this.data = {
            displaygroup: [],
        };
    }

    async init() {
        await this.getDisplayGroup();
        return this.data;
    }

    async getDisplayGroup() {
        this.data.displaygroup = await DisplayGroupModel.findAll();
    }
}

module.exports = new DataSocket();

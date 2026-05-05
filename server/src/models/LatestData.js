const database = require('../config/database');

const CHANNELS = [
    'currentI1', 'currentI2', 'currentI3',
    'voltageV1N', 'voltageV2N', 'voltageV3N',
    'voltageV12', 'voltageV23', 'voltageV31',
    'power', 'netpower', 'per',
];

const LatestDataModel = {
    CHANNELS,

    async getCollection() {
        const db = database.getDatabase();
        return db.collection('latest_data');
    },

    async findByDevice(deviceId) {
        const col = await this.getCollection();
        return col.find({ deviceId }).sort({ channel: 1 }).toArray();
    },

    // Update threshold for a single channel
    async updateThreshold(deviceId, channel, basemin, basemax) {
        const col = await this.getCollection();
        return col.updateOne(
            { deviceId, channel },
            {
                $set: { basemin, basemax },
                $setOnInsert: { timestamp: null, value: null },
            },
            { upsert: true },
        );
    },

    // Bulk update thresholds: thresholds = [{ channel, basemin, basemax }]
    async updateAllThresholds(deviceId, thresholds) {
        const col = await this.getCollection();
        const ops = thresholds.map(({ channel, basemin, basemax }) => ({
            updateOne: {
                filter: { deviceId, channel },
                update: {
                    $set: { basemin, basemax },
                    $setOnInsert: { timestamp: null, value: null },
                },
                upsert: true,
            },
        }));
        return col.bulkWrite(ops);
    },
};

module.exports = LatestDataModel;

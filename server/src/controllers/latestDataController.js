const LatestDataModel = require('../models/LatestData');

const latestDataController = {
    // GET /api/latest-data/:deviceid
    async getByDevice(req, res) {
        try {
            const { deviceid } = req.params;
            const data = await LatestDataModel.findByDevice(deviceid);
            res.json({ success: true, deviceId: deviceid, count: data.length, data });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // PATCH /api/latest-data/:deviceid/:channel/threshold
    async updateThreshold(req, res) {
        try {
            const { deviceid, channel } = req.params;

            if (!LatestDataModel.CHANNELS.includes(channel)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid channel. Valid channels: ${LatestDataModel.CHANNELS.join(', ')}`,
                });
            }

            const { basemin = null, basemax = null } = req.body;

            await LatestDataModel.updateThreshold(deviceid, channel, basemin, basemax);

            res.json({ success: true, message: 'Threshold updated', deviceId: deviceid, channel, basemin, basemax });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    // PUT /api/latest-data/:deviceid/thresholds
    // Body: { thresholds: [{ channel, basemin, basemax }] }
    async updateAllThresholds(req, res) {
        try {
            const { deviceid } = req.params;
            const { thresholds } = req.body;

            if (!Array.isArray(thresholds) || thresholds.length === 0) {
                return res.status(400).json({ success: false, message: 'thresholds array required' });
            }

            const invalid = thresholds.find((t) => !LatestDataModel.CHANNELS.includes(t.channel));
            if (invalid) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid channel: ${invalid.channel}. Valid channels: ${LatestDataModel.CHANNELS.join(', ')}`,
                });
            }

            await LatestDataModel.updateAllThresholds(deviceid, thresholds);

            res.json({ success: true, message: 'Thresholds updated', deviceId: deviceid, updatedCount: thresholds.length });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    },
};

module.exports = latestDataController;

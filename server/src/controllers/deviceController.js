const DeviceModel = require('../models/Device');

const deviceController = {
    // Tạo device mới
    async createDevice(req, res) {
        try {
            const deviceData = req.body;

            const device = await DeviceModel.create(deviceData);

            res.status(201).json({
                success: true,
                message: 'Device created successfully',
                data: device,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy device theo ID
    async getDeviceById(req, res) {
        try {
            const { id } = req.params;

            const device = await DeviceModel.findById(id);

            if (!device) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found',
                });
            }

            res.json({
                success: true,
                data: device,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy device theo deviceid
    async getDeviceByDeviceId(req, res) {
        try {
            const { deviceid } = req.params;

            const device = await DeviceModel.findByDeviceId(deviceid);

            if (!device) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found',
                });
            }

            res.json({
                success: true,
                data: device,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy tất cả devices
    async getAllDevices(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                status,
                deviceType,
                displaygroupid,
                sortBy = 'createdAt',
                sortOrder = 'desc',
            } = req.query;

            const filter = {};
            if (status) filter.status = status;
            if (deviceType) filter.deviceType = deviceType;

            // Non-Admin: restrict to allowedAreas; honor displaygroupid param only if in allowedAreas
            if (req.user && req.user.role !== 'Admin') {
                const allowed = req.user.allowedAreas || [];
                if (allowed.length === 0) {
                    return res.json({ success: true, data: [], pagination: { page: 1, limit: parseInt(limit), total: 0, pages: 0 } });
                }
                const scope = displaygroupid && allowed.includes(displaygroupid) ? [displaygroupid] : allowed;
                filter.displaygroupid = { $in: scope };
            } else if (displaygroupid) {
                filter.displaygroupid = displaygroupid;
            }

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sort,
            };

            const result = await DeviceModel.findAll(filter, options);

            res.json({
                success: true,
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Cập nhật device
    async updateDevice(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const result = await DeviceModel.update(id, updateData);

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found',
                });
            }

            res.json({
                success: true,
                message: 'Device updated successfully',
                data: result,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Cập nhật status
    async updateDeviceStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;

            const result = await DeviceModel.updateStatus(id, status);

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found',
                });
            }

            res.json({
                success: true,
                message: 'Device status updated successfully',
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Xóa device
    async deleteDevice(req, res) {
        try {
            const { id } = req.params;

            const result = await DeviceModel.delete(id);

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Device not found',
                });
            }

            res.json({
                success: true,
                message: 'Device deleted successfully',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy thống kê devices
    async getDeviceStats(req, res) {
        try {
            const stats = await DeviceModel.getStats(db);

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy devices theo group
    async getDevicesByGroup(req, res) {
        try {
            const { displaygroupid } = req.params;

            const devices = await DeviceModel.findByGroup(displaygroupid);

            res.json({
                success: true,
                data: devices,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy devices theo status
    async getDevicesByStatus(req, res) {
        try {
            const { status } = req.params;

            const devices = await DeviceModel.findByStatus(status);

            res.json({
                success: true,
                data: devices,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Map markers for TanHiep integration (Task 5)
    async getMapMarkers(req, res) {
        const crypto = require('crypto');
        const secret = req.headers['x-internal-secret'];
        const expected = process.env.INTERNAL_SECRET || '';
        if (!secret || !expected || secret.length !== expected.length ||
            !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        try {
            const LatestDataModel = require('../models/LatestData');

            // Fetch up to 10,000 devices; if device count approaches this limit, add pagination
            const result = await DeviceModel.findAll({}, { page: 1, limit: 10000 });
            const devices = result.data;

            const markers = await Promise.all(
                devices.map(async (device) => {
                    const latestRows = await LatestDataModel.findByDevice(device.deviceid);

                    const byChannel = {};
                    let latestTs = null;
                    for (const row of latestRows) {
                        byChannel[row.channel] = row.value;
                        if (row.timestamp && (!latestTs || row.timestamp > latestTs)) {
                            latestTs = row.timestamp;
                        }
                    }

                    return {
                        deviceId: device.deviceid,
                        name: device.deviceName,
                        location: device.location || '',
                        lat: device.coordX ?? device.coordinates?.y ?? 0,
                        lng: device.coordY ?? device.coordinates?.x ?? 0,
                        status: device.status,
                        latestData: {
                            power: byChannel['power'] ?? null,
                            voltage: byChannel['voltageV1N'] ?? null,
                            current: byChannel['currentI1'] ?? null,
                            energy: byChannel['netpower'] ?? null,
                            timestamp: latestTs ? latestTs.toISOString() : null,
                        },
                    };
                }),
            );

            // Filter out devices with no coordinates set (both 0)
            const validMarkers = markers.filter(m => m.lat !== 0 || m.lng !== 0);

            res.json({ success: true, data: validMarkers });
        } catch (err) {
            console.error('[getMapMarkers] error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    // Device history for TanHiep chart popup (internal secret protected)
    async getDeviceHistory(req, res) {
        const crypto = require('crypto');
        const secret = req.headers['x-internal-secret'];
        const expected = process.env.INTERNAL_SECRET || '';
        if (!secret || !expected || secret.length !== expected.length ||
            !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        try {
            const EnergyDataModel = require('../models/EnergyData');
            const { deviceid } = req.params;

            let startTime, endTime = null;
            let hours = Math.min(parseInt(req.query.hours) || 24, 720);
            if (req.query.startTime && req.query.endTime) {
                startTime = new Date(req.query.startTime);
                endTime   = new Date(req.query.endTime);
            } else {
                startTime = new Date(Date.now() - hours * 3600 * 1000);
            }

            const rows = await EnergyDataModel.findByTimeRange(
                deviceid, startTime, endTime,
                { limit: 1000, sort: { timestamp: 1 } }
            );

            const points = rows.map(r => ({
                t: r.timestamp ? r.timestamp.toISOString() : null,
                power: r.power ?? null,
                energy: r.netpower ?? null,
                voltage: r.voltageV1N ?? null,
                current: r.currentI1 ?? null,
            }));

            res.json({ success: true, deviceId: deviceid, hours, data: points });
        } catch (err) {
            console.error('[getDeviceHistory] error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    },
};

module.exports = deviceController;

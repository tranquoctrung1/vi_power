const { ObjectId } = require('mongodb');
const database = require('../config/database');

class Alert {
    constructor(data) {
        this.deviceId = new ObjectId(data.deviceId);
        this.alertType = data.alertType;
        this.message = data.message;
        this.severity = data.severity || 'orange';
        this.timestamp = data.timestamp || new Date();
        this.resolved = data.resolved || false;
        this.resolvedAt = data.resolvedAt || null;
        this.createdAt = data.createdAt || new Date();
    }
}

const AlertModel = {
    async getCollection(collectionName) {
        const db = database.getDatabase();
        return db.collection(collectionName);
    },

    // CREATE - Tạo alert mới
    async create(alertData) {
        try {
            const alerts = await this.getCollection('alerts');
            const alert = new Alert(alertData);
            const result = await alerts.insertOne(alert);
            return { ...alert, _id: result.insertedId };
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy alert theo ID
    async findById(alertId) {
        try {
            const alerts = await this.getCollection('alerts');
            return await alerts.findOne({ _id: new ObjectId(alertId) });
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy tất cả alerts
    async findAll(filter = {}, options = {}) {
        try {
            const alerts = await this.getCollection('alerts');
            const { page = 1, limit = 50, sort = { timestamp: -1 } } = options;
            const skip = (page - 1) * limit;

            const data = await alerts
                .find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();

            const total = await alerts.countDocuments(filter);

            return {
                data,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy alerts theo device
    async findByDeviceId(deviceId) {
        try {
            const alerts = await this.getCollection('alerts');
            return await alerts
                .find({ deviceId: new ObjectId(deviceId) })
                .sort({ timestamp: -1 })
                .toArray();
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy alerts chưa resolved
    async findUnresolved(filter = {}) {
        try {
            const alerts = await this.getCollection('alerts');
            return await alerts
                .find({ ...filter, resolved: false })
                .sort({ timestamp: -1 })
                .toArray();
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy alerts theo severity
    async findBySeverity(severity) {
        try {
            const alerts = await this.getCollection('alerts');
            return await alerts
                .find({ severity })
                .sort({ timestamp: -1 })
                .toArray();
        } catch (error) {
            throw error;
        }
    },

    // UPDATE - Cập nhật alert
    async update(alertId, updateData) {
        try {
            const alerts = await this.getCollection('alerts');

            // Nếu resolve alert, set resolvedAt
            if (updateData.resolved === true && !updateData.resolvedAt) {
                updateData.resolvedAt = new Date();
            }

            const result = await alerts.updateOne(
                { _id: new ObjectId(alertId) },
                { $set: updateData },
            );

            return result;
        } catch (error) {
            throw error;
        }
    },

    // UPDATE - Resolve alert
    async resolve(alertId) {
        try {
            const alerts = await this.getCollection('alerts');
            const result = await alerts.updateOne(
                { _id: new ObjectId(alertId) },
                {
                    $set: {
                        resolved: true,
                        resolvedAt: new Date(),
                        updatedAt: new Date(),
                    },
                },
            );

            return result;
        } catch (error) {
            throw error;
        }
    },

    // DELETE - Xóa alert
    async delete(alertId) {
        try {
            const alerts = await this.getCollection('alerts');
            const result = await alerts.deleteOne({
                _id: new ObjectId(alertId),
            });
            return result;
        } catch (error) {
            throw error;
        }
    },

    // COUNT - Đếm số lượng alerts
    async count(filter = {}) {
        try {
            const alerts = await this.getCollection('alerts');
            return await alerts.countDocuments(filter);
        } catch (error) {
            throw error;
        }
    },

    // STATS - Thống kê alerts
    async getStats(period = 'day') {
        try {
            const alerts = await this.getCollection('alerts');

            let startDate = new Date();
            if (period === 'day') {
                startDate.setDate(startDate.getDate() - 1);
            } else if (period === 'week') {
                startDate.setDate(startDate.getDate() - 7);
            } else if (period === 'month') {
                startDate.setMonth(startDate.getMonth() - 1);
            }

            const stats = {
                total: await alerts.countDocuments({
                    timestamp: { $gte: startDate },
                }),
                bySeverity: {
                    red: await alerts.countDocuments({
                        severity: 'red',
                        timestamp: { $gte: startDate },
                    }),
                    orange: await alerts.countDocuments({
                        severity: 'orange',
                        timestamp: { $gte: startDate },
                    }),
                    green: await alerts.countDocuments({
                        severity: 'green',
                        timestamp: { $gte: startDate },
                    }),
                },
                resolved: await alerts.countDocuments({
                    resolved: true,
                    timestamp: { $gte: startDate },
                }),
                unresolved: await alerts.countDocuments({
                    resolved: false,
                    timestamp: { $gte: startDate },
                }),
            };

            return stats;
        } catch (error) {
            throw error;
        }
    },
};

module.exports = AlertModel;

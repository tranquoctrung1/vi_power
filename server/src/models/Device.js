const { ObjectId } = require('mongodb');
const database = require('../config/database');

class Device {
    constructor(data) {
        this.deviceid = data.deviceid;
        this.deviceName = data.deviceName;
        this.deviceType = data.deviceType;
        this.location = data.location;
        this.coordinates = data.coordinates || { x: 0, y: 0 };
        this.samplingCycle = data.samplingCycle || 60;
        this.status = data.status || 'active';
        this.displaygroupid = data.displaygroupid;
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
    }
}

const DeviceModel = {
    async getCollection(collectionName) {
        const db = database.getDatabase();
        return db.collection(collectionName);
    },

    // CREATE - Tạo device mới và tạo collection energy_data tương ứng
    async create(deviceData) {
        try {
            const devices = await this.getCollection('devices');

            // Kiểm tra deviceid đã tồn tại chưa
            const existingDevice = await devices.findOne({
                deviceid: deviceData.deviceid,
            });
            if (existingDevice) {
                throw new Error('Device ID already exists');
            }

            const device = new Device(deviceData);
            const result = await devices.insertOne(device);

            // TẠO COLLECTION ENERGY_DATA TƯƠNG ỨNG
            await DeviceModel._createEnergyDataCollection(deviceData.deviceid);

            return { ...device, _id: result.insertedId };
        } catch (error) {
            throw error;
        }
    },

    // Hàm nội bộ tạo collection energy_data
    async _createEnergyDataCollection(deviceid) {
        try {
            const collectionName = `energy_data_${deviceid}`;

            // Kiểm tra collection đã tồn tại chưa
            const collections = await database
                .listCollections({ name: collectionName })
                .toArray();
            if (collections.length === 0) {
                // Tạo collection mới
                await database.createCollection(collectionName);
                console.log(
                    `✅ Created energy_data collection: ${collectionName}`,
                );

                // Tạo index cho timestamp (thứ tự tăng dần: 1)
                await database
                    .collection(collectionName)
                    .createIndex({ timestamp: 1 });
                console.log(
                    `✅ Created timestamp index (1) for ${collectionName}`,
                );

                // Tạo thêm các index khác để tối ưu truy vấn
                await database
                    .collection(collectionName)
                    .createIndex({ deviceId: 1 });
                await db.collection(collectionName).createIndex({
                    deviceId: 1,
                    timestamp: 1,
                });
                console.log(`✅ Created compound index for ${collectionName}`);
            }

            return collectionName;
        } catch (error) {
            console.error(
                `Error creating energy_data collection for ${deviceid}:`,
                error,
            );
            throw error;
        }
    },

    // READ - Lấy device theo ID
    async findById(deviceId) {
        try {
            const devices = await this.getCollection('devices');
            return await devices.findOne({ _id: new ObjectId(deviceId) });
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy device theo deviceid
    async findByDeviceId(deviceid) {
        try {
            const devices = await this.getCollection('devices');
            return await devices.findOne({ deviceid });
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy tất cả devices
    async findAll(filter = {}, options = {}) {
        try {
            const devices = await this.getCollection('devices');
            const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
            const skip = (page - 1) * limit;

            const data = await devices
                .find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();

            const total = await devices.countDocuments(filter);

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

    // READ - Lấy devices theo group
    async findByGroup(displaygroupid) {
        try {
            const devices = await this.getCollection('devices');
            return await devices.find({ displaygroupid }).toArray();
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy devices theo status
    async findByStatus(status) {
        try {
            const devices = await this.getCollection('devices');
            return await devices.find({ status }).toArray();
        } catch (error) {
            throw error;
        }
    },

    // UPDATE - Cập nhật device
    async update(deviceId, updateData) {
        try {
            const devices = await this.getCollection('devices');

            // Nếu update deviceid, kiểm tra trùng
            if (updateData.deviceid) {
                const existingDevice = await devices.findOne({
                    deviceid: updateData.deviceid,
                    _id: { $ne: new ObjectId(deviceId) },
                });
                if (existingDevice) {
                    throw new Error('Device ID already exists');
                }

                // Nếu deviceid thay đổi, cập nhật collection name
                const oldDevice = await devices.findOne({
                    _id: new ObjectId(deviceId),
                });
                if (oldDevice && oldDevice.deviceid !== updateData.deviceid) {
                    await DeviceModel._renameEnergyDataCollection(
                        oldDevice.deviceid,
                        updateData.deviceid,
                    );
                }
            }

            updateData.updatedAt = new Date();

            const result = await devices.updateOne(
                { _id: new ObjectId(deviceId) },
                { $set: updateData },
            );

            return result;
        } catch (error) {
            throw error;
        }
    },

    // Hàm đổi tên collection energy_data khi deviceid thay đổi
    async _renameEnergyDataCollection(oldDeviceid, newDeviceid) {
        try {
            const oldCollectionName = `energy_data_${oldDeviceid}`;
            const newCollectionName = `energy_data_${newDeviceid}`;

            // Kiểm tra collection cũ tồn tại
            const oldCollections = await db
                .listCollections({ name: oldCollectionName })
                .toArray();
            if (oldCollections.length === 0) {
                console.log(
                    `Collection ${oldCollectionName} does not exist, nothing to rename`,
                );
                return;
            }

            // Kiểm tra collection mới đã tồn tại chưa
            const newCollections = await db
                .listCollections({ name: newCollectionName })
                .toArray();
            if (newCollections.length > 0) {
                throw new Error(
                    `Collection ${newCollectionName} already exists`,
                );
            }

            // Đổi tên collection
            await db.collection(oldCollectionName).rename(newCollectionName);
            console.log(
                `✅ Renamed collection from ${oldCollectionName} to ${newCollectionName}`,
            );
        } catch (error) {
            console.error(`Error renaming energy_data collection:`, error);
            throw error;
        }
    },

    // UPDATE - Cập nhật status
    async updateStatus(deviceId, status) {
        try {
            const devices = await this.getCollection('devices');

            if (!['active', 'inactive', 'paused'].includes(status)) {
                throw new Error('Invalid status value');
            }

            const result = await devices.updateOne(
                { _id: new ObjectId(deviceId) },
                {
                    $set: {
                        status,
                        updatedAt: new Date(),
                    },
                },
            );

            return result;
        } catch (error) {
            throw error;
        }
    },

    // DELETE - Xóa device và collection energy_data tương ứng
    async delete(deviceId) {
        try {
            const devices = await this.getCollection('devices');

            // Lấy thông tin device để biết deviceid
            const device = await devices.findOne({
                _id: new ObjectId(deviceId),
            });
            if (!device) {
                throw new Error('Device not found');
            }

            // Xóa collection energy_data trước
            await DeviceModel._deleteEnergyDataCollection(device.deviceid);

            // Sau đó xóa device
            const result = await devices.deleteOne({
                _id: new ObjectId(deviceId),
            });
            return result;
        } catch (error) {
            throw error;
        }
    },

    // Hàm xóa collection energy_data
    async _deleteEnergyDataCollection(deviceid) {
        try {
            const collectionName = `energy_data_${deviceid}`;

            // Kiểm tra collection tồn tại
            const collections = await database
                .listCollections({ name: collectionName })
                .toArray();
            if (collections.length > 0) {
                await db.collection(collectionName).drop();
                console.log(
                    `✅ Deleted energy_data collection: ${collectionName}`,
                );
            }
        } catch (error) {
            console.error(
                `Error deleting energy_data collection for ${deviceid}:`,
                error,
            );
            // Không throw error ở đây để đảm bảo device vẫn được xóa
        }
    },

    // COUNT - Đếm số lượng devices
    async count(filter = {}) {
        try {
            const devices = await this.getCollection('devices');
            return await devices.countDocuments(filter);
        } catch (error) {
            throw error;
        }
    },

    // STATS - Thống kê
    async getStats(db) {
        try {
            const devices = await this.getCollection('devices');

            const stats = {
                total: await devices.countDocuments(),
                byStatus: {
                    active: await devices.countDocuments({ status: 'active' }),
                    inactive: await devices.countDocuments({
                        status: 'inactive',
                    }),
                    paused: await devices.countDocuments({ status: 'paused' }),
                },
                byType: {},
            };

            // Lấy thống kê theo deviceType
            const typeStats = await devices
                .aggregate([
                    { $group: { _id: '$deviceType', count: { $sum: 1 } } },
                ])
                .toArray();

            typeStats.forEach((stat) => {
                stats.byType[stat._id] = stat.count;
            });

            return stats;
        } catch (error) {
            throw error;
        }
    },

    // Kiểm tra collection energy_data tồn tại
    async energyDataCollectionExists(deviceid) {
        try {
            const collectionName = `energy_data_${deviceid}`;
            const collections = await db
                .listCollections({ name: collectionName })
                .toArray();
            return collections.length > 0;
        } catch (error) {
            throw error;
        }
    },

    // Tạo hoặc đảm bảo collection energy_data tồn tại
    async ensureEnergyDataCollection(deviceid) {
        try {
            const exists = await this.energyDataCollectionExists(deviceid);
            if (!exists) {
                return await this._createEnergyDataCollection(deviceid);
            }
            return `energy_data_${deviceid}`;
        } catch (error) {
            throw error;
        }
    },

    // Lấy thông tin về collection energy_data của device
    async getEnergyDataCollectionInfo(deviceid) {
        try {
            const collectionName = `energy_data_${deviceid}`;
            const collections = await db
                .listCollections({ name: collectionName })
                .toArray();

            if (collections.length === 0) {
                return null;
            }

            const collection = db.collection(collectionName);
            const count = await collection.countDocuments();
            const indexes = await collection.indexes();

            return {
                collectionName,
                exists: true,
                documentCount: count,
                indexes: indexes.map((idx) => ({
                    name: idx.name,
                    key: idx.key,
                    unique: idx.unique || false,
                })),
            };
        } catch (error) {
            throw error;
        }
    },
};

module.exports = DeviceModel;

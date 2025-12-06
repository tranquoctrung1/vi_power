const { ObjectId } = require("mongodb");

class EnergyData {
  constructor(data) {
    this.deviceId = new ObjectId(data.deviceId);
    this.timestamp = data.timestamp || new Date();
    this.currentI1 = data.currentI1 || 0;
    this.currentI2 = data.currentI2 || 0;
    this.currentI3 = data.currentI3 || 0;
    this.voltageV1N = data.voltageV1N || 0;
    this.voltageV2N = data.voltageV2N || 0;
    this.voltageV3N = data.voltageV3N || 0;
    this.voltageV12 = data.voltageV12 || 0;
    this.voltageV23 = data.voltageV23 || 0;
    this.voltageV31 = data.voltageV31 || 0;
    this.power = data.power || 0;
    this.netpower = data.netpower || 0;
  }
}

const EnergyDataModel = {
  // Tạo collection name cho device
  getCollectionName(deviceid) {
    return `energy_data_${deviceid}`;
  },

  // CREATE - Thêm dữ liệu năng lượng
  async create(db, deviceid, energyData) {
    try {
      const collectionName = this.getCollectionName(deviceid);
      const collection = db.collection(collectionName);

      const data = new EnergyData(energyData);
      const result = await collection.insertOne(data);
      return { ...data, _id: result.insertedId };
    } catch (error) {
      throw error;
    }
  },

  // CREATE - Thêm nhiều dữ liệu cùng lúc
  async createMany(db, deviceid, energyDataArray) {
    try {
      const collectionName = this.getCollectionName(deviceid);
      const collection = db.collection(collectionName);

      const data = energyDataArray.map((item) => new EnergyData(item));
      const result = await collection.insertMany(data);
      return result;
    } catch (error) {
      throw error;
    }
  },

  // READ - Lấy dữ liệu theo khoảng thời gian
  async findByTimeRange(db, deviceid, startTime, endTime, options = {}) {
    try {
      const collectionName = this.getCollectionName(deviceid);
      const collection = db.collection(collectionName);

      const { limit = 1000, sort = { timestamp: -1 } } = options;

      const query = {};
      if (startTime || endTime) {
        query.timestamp = {};
        if (startTime) query.timestamp.$gte = new Date(startTime);
        if (endTime) query.timestamp.$lte = new Date(endTime);
      }

      const data = await collection
        .find(query)
        .sort(sort)
        .limit(limit)
        .toArray();

      return data;
    } catch (error) {
      throw error;
    }
  },

  // READ - Lấy dữ liệu mới nhất
  async findLatest(db, deviceid, limit = 1) {
    try {
      const collectionName = this.getCollectionName(deviceid);
      const collection = db.collection(collectionName);

      const data = await collection
        .find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();

      return data;
    } catch (error) {
      throw error;
    }
  },

  // READ - Lấy thống kê
  async getStats(db, deviceid, startTime, endTime) {
    try {
      const collectionName = this.getCollectionName(deviceid);
      const collection = db.collection(collectionName);

      const query = {};
      if (startTime || endTime) {
        query.timestamp = {};
        if (startTime) query.timestamp.$gte = new Date(startTime);
        if (endTime) query.timestamp.$lte = new Date(endTime);
      }

      const pipeline = [
        { $match: query },
        {
          $group: {
            _id: null,
            avgCurrentI1: { $avg: "$currentI1" },
            avgCurrentI2: { $avg: "$currentI2" },
            avgCurrentI3: { $avg: "$currentI3" },
            avgVoltageV1N: { $avg: "$voltageV1N" },
            avgVoltageV2N: { $avg: "$voltageV2N" },
            avgVoltageV3N: { $avg: "$voltageV3N" },
            maxPower: { $max: "$power" },
            minPower: { $min: "$power" },
            avgPower: { $avg: "$power" },
            totalNetPower: { $sum: "$netpower" },
            count: { $sum: 1 },
          },
        },
      ];

      const stats = await collection.aggregate(pipeline).toArray();
      return stats[0] || {};
    } catch (error) {
      throw error;
    }
  },

  // DELETE - Xóa dữ liệu cũ
  async deleteOldData(db, deviceid, olderThanDays = 30) {
    try {
      const collectionName = this.getCollectionName(deviceid);
      const collection = db.collection(collectionName);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await collection.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      return result;
    } catch (error) {
      throw error;
    }
  },

  // COUNT - Đếm số lượng bản ghi
  async count(db, deviceid, filter = {}) {
    try {
      const collectionName = this.getCollectionName(deviceid);
      const collection = db.collection(collectionName);
      return await collection.countDocuments(filter);
    } catch (error) {
      throw error;
    }
  },
};

module.exports = EnergyDataModel;

const EnergyDataModel = require("../models/EnergyData");
const DeviceModel = require("../models/Device");

const dataController = {
  // Thêm dữ liệu năng lượng cho thiết bị
  async addEnergyData(req, res) {
    try {
      const db = req.db;
      const { deviceid } = req.params;
      const energyData = req.body;

      // Kiểm tra thiết bị tồn tại
      const device = await DeviceModel.findByDeviceId(db, deviceid);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      // Thêm deviceId vào dữ liệu
      energyData.deviceId = device._id;

      // Thêm dữ liệu
      const result = await EnergyDataModel.create(db, deviceid, energyData);

      // Gửi real-time update qua WebSocket (nếu cần)
      // broadcastToSubscribers(deviceid, result);

      res.status(201).json({
        success: true,
        message: "Energy data added successfully",
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Lấy dữ liệu năng lượng theo thiết bị
  async getEnergyData(req, res) {
    try {
      const db = req.db;
      const { deviceid } = req.params;
      const { startTime, endTime, limit = 1000, sort = "desc" } = req.query;

      // Kiểm tra thiết bị tồn tại
      const device = await DeviceModel.findByDeviceId(db, deviceid);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      const sortOrder = { timestamp: sort === "asc" ? 1 : -1 };

      // Lấy dữ liệu
      const data = await EnergyDataModel.findByTimeRange(
        db,
        deviceid,
        startTime,
        endTime,
        { limit: parseInt(limit), sort: sortOrder },
      );

      // Lấy thống kê
      const stats = await EnergyDataModel.getStats(
        db,
        deviceid,
        startTime,
        endTime,
      );

      res.json({
        success: true,
        device: {
          deviceid: device.deviceid,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          location: device.location,
        },
        count: data.length,
        stats,
        data,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Lấy dữ liệu mới nhất
  async getLatestEnergyData(req, res) {
    try {
      const db = req.db;
      const { deviceid } = req.params;
      const { limit = 10 } = req.query;

      // Kiểm tra thiết bị tồn tại
      const device = await DeviceModel.findByDeviceId(db, deviceid);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      // Lấy dữ liệu mới nhất
      const data = await EnergyDataModel.findLatest(
        db,
        deviceid,
        parseInt(limit),
      );

      res.json({
        success: true,
        device: {
          deviceid: device.deviceid,
          deviceName: device.deviceName,
        },
        count: data.length,
        data,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Lấy thống kê năng lượng
  async getEnergyStats(req, res) {
    try {
      const db = req.db;
      const { deviceid } = req.params;
      const { startTime, endTime } = req.query;

      // Kiểm tra thiết bị tồn tại
      const device = await DeviceModel.findByDeviceId(db, deviceid);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      // Lấy thống kê
      const stats = await EnergyDataModel.getStats(
        db,
        deviceid,
        startTime,
        endTime,
      );

      res.json({
        success: true,
        device: {
          deviceid: device.deviceid,
          deviceName: device.deviceName,
        },
        stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Thêm nhiều dữ liệu cùng lúc
  async addMultipleEnergyData(req, res) {
    try {
      const db = req.db;
      const { deviceid } = req.params;
      const { data: energyDataArray } = req.body;

      if (!Array.isArray(energyDataArray) || energyDataArray.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Data array is required",
        });
      }

      // Kiểm tra thiết bị tồn tại
      const device = await DeviceModel.findByDeviceId(db, deviceid);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      // Thêm deviceId vào mỗi bản ghi
      const dataWithDeviceId = energyDataArray.map((item) => ({
        ...item,
        deviceId: device._id,
      }));

      // Thêm dữ liệu
      const result = await EnergyDataModel.createMany(
        db,
        deviceid,
        dataWithDeviceId,
      );

      res.status(201).json({
        success: true,
        message: `Added ${result.insertedCount} energy data records`,
        insertedCount: result.insertedCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Xóa dữ liệu cũ
  async deleteOldEnergyData(req, res) {
    try {
      const db = req.db;
      const { deviceid } = req.params;
      const { olderThanDays = 30 } = req.query;

      // Kiểm tra thiết bị tồn tại
      const device = await DeviceModel.findByDeviceId(db, deviceid);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      // Chỉ Admin mới được xóa dữ liệu
      if (req.user.role !== "Admin") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin only.",
        });
      }

      // Xóa dữ liệu cũ
      const result = await EnergyDataModel.deleteOldData(
        db,
        deviceid,
        parseInt(olderThanDays),
      );

      res.json({
        success: true,
        message: `Deleted ${result.deletedCount} old energy data records`,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Tổng hợp dữ liệu năng lượng theo ngày/tuần/tháng
  async getAggregatedEnergyData(req, res) {
    try {
      const db = req.db;
      const { deviceid } = req.params;
      const { period = "day", startDate, endDate } = req.query;

      // Kiểm tra thiết bị tồn tại
      const device = await DeviceModel.findByDeviceId(db, deviceid);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      const collectionName = EnergyDataModel.getCollectionName(deviceid);
      const collection = db.collection(collectionName);

      // Tính toán khoảng thời gian
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate ? new Date(startDate) : new Date();

      if (period === "day") {
        start.setDate(start.getDate() - 1);
      } else if (period === "week") {
        start.setDate(start.getDate() - 7);
      } else if (period === "month") {
        start.setMonth(start.getMonth() - 1);
      } else if (period === "year") {
        start.setFullYear(start.getFullYear() - 1);
      }

      // Pipeline aggregation
      const pipeline = [
        {
          $match: {
            timestamp: {
              $gte: start,
              $lte: end,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format:
                  period === "hour"
                    ? "%Y-%m-%d %H:00"
                    : period === "day"
                      ? "%Y-%m-%d"
                      : period === "month"
                        ? "%Y-%m"
                        : "%Y",
                date: "$timestamp",
              },
            },
            avgCurrentI1: { $avg: "$currentI1" },
            avgCurrentI2: { $avg: "$currentI2" },
            avgCurrentI3: { $avg: "$currentI3" },
            avgVoltageV1N: { $avg: "$voltageV1N" },
            avgVoltageV2N: { $avg: "$voltageV2N" },
            avgVoltageV3N: { $avg: "$voltageV3N" },
            totalPower: { $sum: "$power" },
            totalNetPower: { $sum: "$netpower" },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ];

      const aggregatedData = await collection.aggregate(pipeline).toArray();

      res.json({
        success: true,
        device: {
          deviceid: device.deviceid,
          deviceName: device.deviceName,
        },
        period,
        startDate: start,
        endDate: end,
        count: aggregatedData.length,
        data: aggregatedData,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
};

module.exports = dataController;

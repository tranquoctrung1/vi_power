const AlertModel = require("../models/Alert");
const DeviceModel = require("../models/Device");

const alertController = {
  // Tạo alert mới
  async createAlert(req, res) {
    try {
      const db = req.db;
      const alertData = req.body;

      // Kiểm tra device tồn tại
      const device = await DeviceModel.findById(db, alertData.deviceId);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      // Tạo alert
      const alert = await AlertModel.create(db, alertData);

      // Gửi real-time notification qua WebSocket (nếu cần)
      // broadcastAlert(alert);

      res.status(201).json({
        success: true,
        message: "Alert created successfully",
        data: alert,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Lấy alert theo ID
  async getAlertById(req, res) {
    try {
      const db = req.db;
      const { id } = req.params;

      const alert = await AlertModel.findById(db, id);

      if (!alert) {
        return res.status(404).json({
          success: false,
          message: "Alert not found",
        });
      }

      // Lấy thông tin device
      const device = await DeviceModel.findById(db, alert.deviceId);

      const alertWithDevice = {
        ...alert,
        device: device
          ? {
              deviceid: device.deviceid,
              deviceName: device.deviceName,
              deviceType: device.deviceType,
              location: device.location,
            }
          : null,
      };

      res.json({
        success: true,
        data: alertWithDevice,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Lấy tất cả alerts
  async getAllAlerts(req, res) {
    try {
      const db = req.db;
      const {
        page = 1,
        limit = 50,
        resolved,
        severity,
        deviceId,
        startDate,
        endDate,
        sortBy = "timestamp",
        sortOrder = "desc",
      } = req.query;

      const filter = {};

      if (resolved !== undefined) {
        filter.resolved = resolved === "true";
      }

      if (severity) {
        filter.severity = severity;
      }

      if (deviceId) {
        filter.deviceId = deviceId;
      }

      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate) filter.timestamp.$lte = new Date(endDate);
      }

      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort,
      };

      const result = await AlertModel.findAll(db, filter, options);

      // Lấy thông tin device cho mỗi alert
      if (result.data.length > 0) {
        const deviceIds = [
          ...new Set(result.data.map((alert) => alert.deviceId.toString())),
        ];
        const devices = await db
          .collection("devices")
          .find({
            _id: {
              $in: deviceIds.map((id) => new require("mongodb").ObjectId(id)),
            },
          })
          .toArray();

        const deviceMap = {};
        devices.forEach((device) => {
          deviceMap[device._id.toString()] = {
            deviceid: device.deviceid,
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            location: device.location,
          };
        });

        result.data = result.data.map((alert) => ({
          ...alert,
          device: deviceMap[alert.deviceId.toString()] || null,
        }));
      }

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

  // Lấy alerts chưa resolved
  async getUnresolvedAlerts(req, res) {
    try {
      const db = req.db;
      const { limit = 100 } = req.query;

      const alerts = await AlertModel.findUnresolved(db, {}, parseInt(limit));

      // Lấy thông tin device
      if (alerts.length > 0) {
        const deviceIds = [
          ...new Set(alerts.map((alert) => alert.deviceId.toString())),
        ];
        const devices = await db
          .collection("devices")
          .find({
            _id: {
              $in: deviceIds.map((id) => new require("mongodb").ObjectId(id)),
            },
          })
          .toArray();

        const deviceMap = {};
        devices.forEach((device) => {
          deviceMap[device._id.toString()] = {
            deviceid: device.deviceid,
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            location: device.location,
          };
        });

        alerts.forEach((alert) => {
          alert.device = deviceMap[alert.deviceId.toString()] || null;
        });
      }

      res.json({
        success: true,
        count: alerts.length,
        data: alerts,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Lấy alerts theo device
  async getAlertsByDevice(req, res) {
    try {
      const db = req.db;
      const { deviceId } = req.params;
      const { limit = 100, resolved } = req.query;

      const filter = { deviceId };

      if (resolved !== undefined) {
        filter.resolved = resolved === "true";
      }

      const alerts = await AlertModel.findByDeviceId(db, deviceId);

      if (limit) {
        alerts = alerts.slice(0, parseInt(limit));
      }

      // Lấy thông tin device
      const device = await DeviceModel.findById(db, deviceId);

      res.json({
        success: true,
        device: device
          ? {
              deviceid: device.deviceid,
              deviceName: device.deviceName,
              deviceType: device.deviceType,
              location: device.location,
            }
          : null,
        count: alerts.length,
        data: alerts,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Cập nhật alert
  async updateAlert(req, res) {
    try {
      const db = req.db;
      const { id } = req.params;
      const updateData = req.body;

      const result = await AlertModel.update(db, id, updateData);

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Alert not found",
        });
      }

      res.json({
        success: true,
        message: "Alert updated successfully",
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Resolve alert
  async resolveAlert(req, res) {
    try {
      const db = req.db;
      const { id } = req.params;

      const result = await AlertModel.resolve(db, id);

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Alert not found",
        });
      }

      res.json({
        success: true,
        message: "Alert resolved successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Xóa alert
  async deleteAlert(req, res) {
    try {
      const db = req.db;
      const { id } = req.params;

      // Chỉ Admin mới được xóa alert
      if (req.user.role !== "Admin") {
        return res.status(403).json({
          success: false,
          message: "Access denied. Admin only.",
        });
      }

      const result = await AlertModel.delete(db, id);

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Alert not found",
        });
      }

      res.json({
        success: true,
        message: "Alert deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Lấy thống kê alerts
  async getAlertStats(req, res) {
    try {
      const db = req.db;
      const { period = "day" } = req.query;

      const stats = await AlertModel.getStats(db, period);

      res.json({
        success: true,
        period,
        stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Lấy alerts theo severity
  async getAlertsBySeverity(req, res) {
    try {
      const db = req.db;
      const { severity } = req.params;
      const { limit = 100 } = req.query;

      const alerts = await AlertModel.findBySeverity(db, severity);

      if (limit) {
        alerts = alerts.slice(0, parseInt(limit));
      }

      // Lấy thông tin device
      if (alerts.length > 0) {
        const deviceIds = [
          ...new Set(alerts.map((alert) => alert.deviceId.toString())),
        ];
        const devices = await db
          .collection("devices")
          .find({
            _id: {
              $in: deviceIds.map((id) => new require("mongodb").ObjectId(id)),
            },
          })
          .toArray();

        const deviceMap = {};
        devices.forEach((device) => {
          deviceMap[device._id.toString()] = {
            deviceid: device.deviceid,
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            location: device.location,
          };
        });

        alerts.forEach((alert) => {
          alert.device = deviceMap[alert.deviceId.toString()] || null;
        });
      }

      res.json({
        success: true,
        severity,
        count: alerts.length,
        data: alerts,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
};

module.exports = alertController;

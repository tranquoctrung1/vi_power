const DeviceModel = require("../models/Device");

const deviceController = {
  // Tạo device mới
  async createDevice(req, res) {
    try {
      const db = req.db;
      const deviceData = req.body;

      const device = await DeviceModel.create(db, deviceData);

      res.status(201).json({
        success: true,
        message: "Device created successfully",
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
      const db = req.db;
      const { id } = req.params;

      const device = await DeviceModel.findById(db, id);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
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
      const db = req.db;
      const { deviceid } = req.params;

      const device = await DeviceModel.findByDeviceId(db, deviceid);

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
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
      const db = req.db;
      const {
        page = 1,
        limit = 10,
        status,
        deviceType,
        displaygroupid,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const filter = {};
      if (status) filter.status = status;
      if (deviceType) filter.deviceType = deviceType;
      if (displaygroupid) filter.displaygroupid = displaygroupid;

      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort,
      };

      const result = await DeviceModel.findAll(db, filter, options);

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
      const db = req.db;
      const { id } = req.params;
      const updateData = req.body;

      const result = await DeviceModel.update(db, id, updateData);

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      res.json({
        success: true,
        message: "Device updated successfully",
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
      const db = req.db;
      const { id } = req.params;
      const { status } = req.body;

      const result = await DeviceModel.updateStatus(db, id, status);

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      res.json({
        success: true,
        message: "Device status updated successfully",
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
      const db = req.db;
      const { id } = req.params;

      const result = await DeviceModel.delete(db, id);

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Device not found",
        });
      }

      res.json({
        success: true,
        message: "Device deleted successfully",
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
      const db = req.db;

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
      const db = req.db;
      const { displaygroupid } = req.params;

      const devices = await DeviceModel.findByGroup(db, displaygroupid);

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
      const db = req.db;
      const { status } = req.params;

      const devices = await DeviceModel.findByStatus(db, status);

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
};

module.exports = deviceController;

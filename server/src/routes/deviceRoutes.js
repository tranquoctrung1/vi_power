const express = require("express");
const router = express.Router();
const deviceController = require("../controllers/deviceController");
const { authenticate } = require("../middleware/auth");

// Apply authentication to all device routes
router.use(authenticate);

// Device CRUD routes
router.post("/", deviceController.createDevice);
router.get("/", deviceController.getAllDevices);
router.get("/stats", deviceController.getDeviceStats);
router.get("/group/:displaygroupid", deviceController.getDevicesByGroup);
router.get("/status/:status", deviceController.getDevicesByStatus);
router.get("/id/:id", deviceController.getDeviceById);
router.get("/deviceid/:deviceid", deviceController.getDeviceByDeviceId);
router.put("/:id", deviceController.updateDevice);
router.patch("/:id/status", deviceController.updateDeviceStatus);
router.delete("/:id", deviceController.deleteDevice);

module.exports = router;

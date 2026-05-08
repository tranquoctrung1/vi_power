const express = require("express");
const router = express.Router();
const deviceController = require("../controllers/deviceController");
const { authenticate, authorize } = require("../middleware/auth");

// Apply authentication to all device routes
router.use(authenticate);

// Device CRUD routes
router.post("/",             authorize("Admin"), deviceController.createDevice);
router.get("/",              deviceController.getAllDevices);
router.get("/stats",         deviceController.getDeviceStats);
router.get("/group/:displaygroupid", deviceController.getDevicesByGroup);
router.get("/status/:status",deviceController.getDevicesByStatus);
router.get("/id/:id",        deviceController.getDeviceById);
router.get("/deviceid/:deviceid", deviceController.getDeviceByDeviceId);
router.put("/:id",           authorize("Admin"), deviceController.updateDevice);
router.patch("/:id/status",  authorize("Admin"), deviceController.updateDeviceStatus);
router.delete("/:id",        authorize("Admin"), deviceController.deleteDevice);

module.exports = router;

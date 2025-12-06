const express = require("express");
const router = express.Router();
const alertController = require("../controllers/alertController");
const { authenticate, authorize } = require("../middleware/auth");

// Apply authentication to all alert routes
router.use(authenticate);

// Alert CRUD routes
router.post("/", alertController.createAlert);
router.get("/", alertController.getAllAlerts);
router.get("/unresolved", alertController.getUnresolvedAlerts);
router.get("/stats", alertController.getAlertStats);
router.get("/severity/:severity", alertController.getAlertsBySeverity);
router.get("/device/:deviceId", alertController.getAlertsByDevice);
router.get("/:id", alertController.getAlertById);
router.put("/:id", alertController.updateAlert);
router.patch("/:id/resolve", alertController.resolveAlert);
router.delete("/:id", authorize("Admin"), alertController.deleteAlert);

module.exports = router;

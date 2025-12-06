const express = require("express");
const router = express.Router();
const dataController = require("../controllers/dataController");
const { authenticate } = require("../middleware/auth");

// Apply authentication to all data routes
router.use(authenticate);

// Energy data routes
router.post("/energy/:deviceid", dataController.addEnergyData);
router.post("/energy/:deviceid/bulk", dataController.addMultipleEnergyData);
router.get("/energy/:deviceid", dataController.getEnergyData);
router.get("/energy/:deviceid/latest", dataController.getLatestEnergyData);
router.get("/energy/:deviceid/stats", dataController.getEnergyStats);
router.get(
  "/energy/:deviceid/aggregated",
  dataController.getAggregatedEnergyData,
);
router.delete("/energy/:deviceid/cleanup", dataController.deleteOldEnergyData);

module.exports = router;

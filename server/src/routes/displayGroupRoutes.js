const express = require("express");
const router = express.Router();
const displayGroupController = require("../controllers/displayGroupController");
const { authenticate, authorize } = require("../middleware/auth");

// Apply authentication to all routes
router.use(authenticate);

// DisplayGroup CRUD routes
router.post("/", authorize("Admin"), displayGroupController.createDisplayGroup);
router.get("/", displayGroupController.getAllDisplayGroups);
router.get("/stats", displayGroupController.getDisplayGroupStats);
router.get("/search", displayGroupController.searchDisplayGroups);
router.get("/id/:id", displayGroupController.getDisplayGroupById);
router.get(
  "/groupid/:displaygrouid",
  displayGroupController.getDisplayGroupByGroupId,
);
router.put(
  "/:id",
  authorize("Admin"),
  displayGroupController.updateDisplayGroup,
);
router.delete(
  "/:id",
  authorize("Admin"),
  displayGroupController.deleteDisplayGroup,
);

module.exports = router;

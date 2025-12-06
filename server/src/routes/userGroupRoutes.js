const express = require("express");
const router = express.Router();
const userGroupController = require("../controllers/userGroupController");
const { authenticate, authorize } = require("../middleware/auth");

// Apply authentication to all routes
router.use(authenticate);

// UserGroup CRUD routes
router.post("/", authorize("Admin"), userGroupController.addUserToGroup);
router.post(
  "/bulk",
  authorize("Admin"),
  userGroupController.addMultipleUsersToGroup,
);
router.get("/", authorize("Admin"), userGroupController.getAllUserGroups);
router.get("/stats", authorize("Admin"), userGroupController.getUserGroupStats);
router.get("/group/:displaygrouid/users", userGroupController.getUsersInGroup);
router.get("/user/:username/groups", userGroupController.getUserGroups);
router.get(
  "/check/:username/:displaygrouid",
  userGroupController.checkUserInGroup,
);
router.delete(
  "/:id",
  authorize("Admin"),
  userGroupController.removeUserFromGroup,
);
router.delete(
  "/user/:username/group/:displaygrouid",
  authorize("Admin"),
  userGroupController.removeUserFromGroupByDetails,
);

module.exports = router;

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const ssoController = require("../controllers/ssoController");
const { authenticate, authorize } = require("../middleware/auth");

// Public routes
router.post("/login",   authController.login);
router.post("/refresh", authController.refresh);
router.get("/sso",      ssoController.verifySso);   // SSO entry point (từ hệ thống ngoài redirect vào)

// Protected routes
router.use(authenticate);
router.post("/logout",  authController.logout);

router.get("/me", authController.getCurrentUser);
router.post("/change-password", authController.changePassword);
router.get("/sso/lora", ssoController.getLoraUrl);

// Admin only routes
router.post("/register", authorize("Admin"), authController.register);
router.get("/users", authorize("Admin"), authController.getAllUsers);
router.put("/users/:id", authorize("Admin"), authController.updateUser);
router.delete("/users/:id", authorize("Admin"), authController.deleteUser);

module.exports = router;

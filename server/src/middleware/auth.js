const jwt = require("jsonwebtoken");
const UserModel = require("../models/User");

const authMiddleware = {
  // Xác thực token
  authenticate: async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          message: "Access denied. No token provided.",
        });
      }

      const token = authHeader.split(" ")[1];

      // Xác thực token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Lấy user từ database
      const user = await UserModel.findById(decoded.userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      // Gắn user vào request
      req.user = user;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expired",
        });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }
  },

  // Phân quyền theo role
  authorize: (...roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied. Insufficient permissions.",
        });
      }

      next();
    };
  },

  // Authenticate via X-API-Key header (for SCADA / Power BI / EMS)
  authenticateApiKey: async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ success: false, message: 'API key required' });
    }
    try {
      const ApiKeyModel = require('../models/ApiKey');
      const keyDoc = await ApiKeyModel.findByKey(apiKey);
      if (!keyDoc) {
        return res.status(401).json({ success: false, message: 'Invalid or revoked API key' });
      }
      await ApiKeyModel.touch(keyDoc._id);
      req.user = { username: `api:${keyDoc.name}`, role: 'api', apiKey: keyDoc };
      next();
    } catch (e) {
      res.status(500).json({ success: false, message: 'Authentication error' });
    }
  },

  // Accept either Bearer JWT or X-API-Key (for public data endpoints)
  authenticateAny: async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
      const ApiKeyModel = require('../models/ApiKey');
      try {
        const keyDoc = await ApiKeyModel.findByKey(apiKey);
        if (!keyDoc) {
          return res.status(401).json({ success: false, message: 'Invalid or revoked API key' });
        }
        await ApiKeyModel.touch(keyDoc._id);
        req.user = { username: `api:${keyDoc.name}`, role: 'api', apiKey: keyDoc };
        return next();
      } catch (e) {
        return res.status(500).json({ success: false, message: 'Authentication error' });
      }
    }
    return authMiddleware.authenticate(req, res, next);
  },

  // Block Viewer role from mutating data (POST/PUT/PATCH/DELETE)
  denyViewer: (req, res, next) => {
    if (req.user?.role === 'Viewer' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return res.status(403).json({
        success: false,
        message: 'Viewer không có quyền chỉnh sửa dữ liệu.',
      });
    }
    next();
  },

  // Basic authentication (cho demo)
  basicAuth: async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Basic ")) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const base64Credentials = authHeader.split(" ")[1];
      const credentials = Buffer.from(base64Credentials, "base64").toString(
        "ascii",
      );
      const [username, password] = credentials.split(":");

      const user = await UserModel.findByUsername(username);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const isValid = await UserModel.verifyPassword(password, user.password);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      req.user = user;
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Authentication failed",
      });
    }
  },
};

module.exports = authMiddleware;

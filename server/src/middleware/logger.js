const { ObjectId } = require("mongodb");

const loggerMiddleware = {
  // Log API requests
  logApiRequest: async (req, res, next) => {
    const startTime = Date.now();

    // Store original send function
    const originalSend = res.send;
    let responseBody;

    res.send = function (body) {
      responseBody = body;
      return originalSend.call(this, body);
    };

    // Log after response is sent
    res.on("finish", async () => {
      try {
        const db = req.db;
        const apiLogs = db.collection("api_logs");

        const logEntry = {
          _id: new ObjectId(),
          endpoint: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          requestBody: req.body,
          responseBody:
            typeof responseBody === "string"
              ? safeJsonParse(responseBody)
              : responseBody,
          timestamp: new Date(),
          client: req.headers["user-agent"] || "unknown",
          userId: req.user ? req.user._id : null,
          username: req.user ? req.user.username : null,
          processingTime: Date.now() - startTime,
          ipAddress:
            req.ip ||
            req.headers["x-forwarded-for"] ||
            req.connection.remoteAddress,
        };

        // Clean sensitive data from logs
        if (logEntry.requestBody && logEntry.requestBody.password) {
          logEntry.requestBody.password = "***REDACTED***";
        }

        if (logEntry.requestBody && logEntry.requestBody.currentPassword) {
          logEntry.requestBody.currentPassword = "***REDACTED***";
        }

        if (logEntry.requestBody && logEntry.requestBody.newPassword) {
          logEntry.requestBody.newPassword = "***REDACTED***";
        }

        await apiLogs.insertOne(logEntry);

        // Console log for development
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[${logEntry.timestamp.toISOString()}] ${logEntry.method} ${logEntry.endpoint} - ${logEntry.statusCode} (${logEntry.processingTime}ms)`,
          );
        }
      } catch (error) {
        console.error("Failed to log API request:", error);
      }
    });

    next();
  },

  // Get API logs (Admin only)
  getApiLogs: async (req, res) => {
    try {
      const db = req.db;
      const {
        page = 1,
        limit = 50,
        method,
        statusCode,
        startDate,
        endDate,
        username,
      } = req.query;

      const apiLogs = db.collection("api_logs");

      const filter = {};

      if (method) {
        filter.method = method;
      }

      if (statusCode) {
        filter.statusCode = parseInt(statusCode);
      }

      if (username) {
        filter.username = username;
      }

      if (startDate || endDate) {
        filter.timestamp = {};
        if (startDate) filter.timestamp.$gte = new Date(startDate);
        if (endDate) filter.timestamp.$lte = new Date(endDate);
      }

      const skip = (page - 1) * limit;

      const data = await apiLogs
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await apiLogs.countDocuments(filter);

      res.json({
        success: true,
        data,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Clear old logs (Admin only)
  clearOldLogs: async (req, res) => {
    try {
      const db = req.db;
      const { olderThanDays = 30 } = req.query;

      const apiLogs = db.collection("api_logs");

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays));

      const result = await apiLogs.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      res.json({
        success: true,
        message: `Cleared ${result.deletedCount} old log entries`,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },
};

// Helper function to safely parse JSON
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch (error) {
    return str;
  }
}

module.exports = loggerMiddleware;

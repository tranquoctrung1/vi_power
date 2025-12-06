require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const { connectToDatabase } = require("./src/config/database");
const authRoutes = require("./src/routes/authRoutes");
const deviceRoutes = require("./src/routes/deviceRoutes");
const dataRoutes = require("./src/routes/dataRoutes");
const alertRoutes = require("./src/routes/alertRoutes");
const displayGroupRoutes = require("./src/routes/displayGroupRoutes");
const userGroupRoutes = require("./src/routes/userGroupRoutes");
const { setupWebSocket } = require("./src/websocket/socketHandler");
const { logApiRequest } = require("./src/middleware/logger");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Attach database to request
app.use(async (req, res, next) => {
  try {
    req.db = await connectToDatabase();
    next();
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({ error: "Database connection failed" });
  }
});

// API logging middleware
app.use(logApiRequest);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/display-groups", displayGroupRoutes);
app.use("/api/user-groups", userGroupRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    database: "connected",
    websocket: "running",
  });
});

// API documentation
app.get("/api", (req, res) => {
  res.json({
    name: "ViPower Energy Monitoring API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/auth",
      devices: "/api/devices",
      data: "/api/data",
      alerts: "/api/alerts",
      reports: "/api/reports",
      health: "/api/health",
    },
    websocket: `ws://localhost:${process.env.WS_PORT || 8080}`,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Initialize server
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

async function startServer() {
  try {
    // Connect to MongoDB
    const db = await connectToDatabase();
    console.log("✅ Connected to MongoDB");

    // Setup WebSocket with database connection
    setupWebSocket(wss, db);
    console.log(`✅ WebSocket server running on port ${WS_PORT}`);

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket running on ws://localhost:${WS_PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📚 API docs: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
});

startServer();

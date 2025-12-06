const WebSocket = require("ws");
const { ObjectId } = require("mongodb");

// Store connected clients
const clients = new Map();

function setupWebSocket(wss, db) {
  wss.on("connection", (ws, req) => {
    const clientId = new ObjectId().toString();
    console.log(`🔗 New WebSocket connection: ${clientId}`);

    // Add client to map
    clients.set(clientId, {
      ws,
      subscribedDevices: new Set(),
      user: null,
    });

    // Handle incoming messages
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleWebSocketMessage(clientId, message, db);
      } catch (error) {
        console.error("WebSocket message error:", error);
        sendToClient(clientId, {
          type: "error",
          message: "Invalid message format",
        });
      }
    });

    // Handle disconnection
    ws.on("close", () => {
      console.log(`🔌 WebSocket disconnected: ${clientId}`);
      clients.delete(clientId);
    });

    // Send connection confirmation
    sendToClient(clientId, {
      type: "connected",
      clientId,
      timestamp: new Date(),
    });
  });

  // Start device data simulation (for testing)
  startDeviceDataSimulation(db);
}

function sendToClient(clientId, message) {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

function broadcastToSubscribers(deviceId, data) {
  clients.forEach((client, clientId) => {
    if (client.subscribedDevices.has(deviceId)) {
      sendToClient(clientId, {
        type: "device_data",
        deviceId,
        data,
        timestamp: new Date(),
      });
    }
  });
}

async function handleWebSocketMessage(clientId, message, db) {
  const client = clients.get(clientId);

  switch (message.type) {
    case "subscribe_device":
      const { deviceId } = message;
      client.subscribedDevices.add(deviceId);

      // Send confirmation
      sendToClient(clientId, {
        type: "subscribed",
        deviceId,
        message: `Subscribed to device ${deviceId}`,
      });

      // Send current device status
      const devices = db.collection("devices");
      const device = await devices.findOne({ deviceid: deviceId });
      if (device) {
        sendToClient(clientId, {
          type: "device_status",
          deviceId,
          status: device.status,
        });
      }
      break;

    case "unsubscribe_device":
      const { deviceId: unsubDeviceId } = message;
      client.subscribedDevices.delete(unsubDeviceId);

      sendToClient(clientId, {
        type: "unsubscribed",
        deviceId: unsubDeviceId,
        message: `Unsubscribed from device ${unsubDeviceId}`,
      });
      break;

    case "authenticate":
      try {
        const users = db.collection("users");
        const user = await users.findOne({
          username: message.username,
        });

        if (user) {
          // In production, use proper password verification
          if (user.password === message.password) {
            client.user = user;
            sendToClient(clientId, {
              type: "authenticated",
              user: {
                username: user.username,
                role: user.role,
                fullName: user.fullName,
              },
            });
          } else {
            sendToClient(clientId, {
              type: "auth_failed",
              message: "Invalid credentials",
            });
          }
        } else {
          sendToClient(clientId, {
            type: "auth_failed",
            message: "User not found",
          });
        }
      } catch (error) {
        sendToClient(clientId, {
          type: "error",
          message: "Authentication failed",
        });
      }
      break;

    default:
      sendToClient(clientId, {
        type: "error",
        message: "Unknown message type",
      });
  }
}

// Simulate device data updates
async function startDeviceDataSimulation(db) {
  setInterval(async () => {
    try {
      const devices = db.collection("devices");
      const activeDevices = await devices.find({ status: "active" }).toArray();

      for (const device of activeDevices) {
        // Generate simulated energy data
        const simulatedData = {
          deviceId: device._id,
          currentI1: Math.random() * 100 + 10,
          currentI2: Math.random() * 100 + 10,
          currentI3: Math.random() * 100 + 10,
          voltageV1N: Math.random() * 50 + 220,
          voltageV2N: Math.random() * 50 + 220,
          voltageV3N: Math.random() * 50 + 220,
          voltageV12: Math.random() * 50 + 380,
          voltageV23: Math.random() * 50 + 380,
          voltageV31: Math.random() * 50 + 380,
          power: Math.random() * 50 + 5,
          netpower: Math.random() * 100 + 50,
          timestamp: new Date(),
        };

        // Broadcast to subscribers
        broadcastToSubscribers(device.deviceid, simulatedData);

        // Store in database
        const collectionName = `energy_data_${device.deviceid}`;
        const energyCollection = db.collection(collectionName);
        await energyCollection.insertOne(simulatedData);

        // Check for alerts
        if (simulatedData.currentI1 > 95) {
          const alerts = db.collection("alerts");
          await alerts.insertOne({
            deviceId: device._id,
            alertType: "warning",
            message: `High current detected on phase 1: ${simulatedData.currentI1.toFixed(2)}A`,
            severity: "orange",
            timestamp: new Date(),
            resolved: false,
          });
        }
      }
    } catch (error) {
      console.error("Data simulation error:", error);
    }
  }, 5000);
}

module.exports = {
  setupWebSocket,
};

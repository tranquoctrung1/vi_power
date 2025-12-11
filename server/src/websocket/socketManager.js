// socketManager.js
const WebSocket = require('ws');
const dataSocket = require('./dataSocket');

const DisplayGroupModel = require('../models/DisplayGroup');

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // Store clients with IDs
        this.mqttWorker = null; // Reference to MQTT worker process
    }

    initialize(wss, mqttWorker = null, db = null) {
        this.wss = wss;
        this.mqttWorker = mqttWorker;
        this.db = db;

        this.wss.on('connection', async (ws) => {
            console.log('New WebSocket Connected');

            // Generate unique ID for client
            const clientId = this.generateClientId();
            ws.id = clientId;
            this.clients.set(clientId, ws);

            // Send MQTT status if available
            if (this.mqttWorker) {
                ws.send(
                    JSON.stringify({
                        type: 'mqtt_status',
                        status: 'connected',
                        timestamp: new Date().toISOString(),
                    }),
                );
            }

            ws.on('message', (data) => {
                try {
                    console.log(data);
                    const message = JSON.parse(data);
                    this.handleMessage(clientId, message);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });

            ws.on('close', () => {
                console.log(`Client ${clientId} disconnected`);
                this.clients.delete(clientId);
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error for client ${clientId}:`, error);
                this.clients.delete(clientId);
            });
        });
    }

    setMqttWorker(mqttWorker) {
        this.mqttWorker = mqttWorker;
    }

    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async handleMessage(clientId, message) {
        console.log(`Message from ${clientId}:`, message);

        // Handle different message types
        switch (message.type) {
            case 'client_init':
                this.sendToClient(message.clientId, {
                    type: 'data_init',
                    data: await DisplayGroupModel.findAll(),
                });
            case 'PING':
                this.sendToClient(clientId, {
                    type: 'PONG',
                    timestamp: Date.now(),
                });
                break;

            case 'BROADCAST':
                this.broadcast({
                    type: 'BROADCAST_MESSAGE',
                    from: clientId,
                    data: message.data,
                });
                break;

            case 'MQTT_PUBLISH':
                // Forward MQTT publish request to worker
                if (this.mqttWorker && this.mqttWorker.connected) {
                    this.mqttWorker.send({
                        type: 'publish',
                        topic: message.topic,
                        message: message.payload,
                        options: message.options,
                    });
                    this.sendToClient(clientId, {
                        type: 'MQTT_PUBLISH_ACK',
                        success: true,
                        messageId: message.messageId,
                    });
                } else {
                    this.sendToClient(clientId, {
                        type: 'MQTT_PUBLISH_ACK',
                        success: false,
                        error: 'MQTT not connected',
                        messageId: message.messageId,
                    });
                }
                break;

            case 'MQTT_SUBSCRIBE':
                // Forward subscribe request to worker
                if (this.mqttWorker && this.mqttWorker.connected) {
                    this.mqttWorker.send({
                        type: 'subscribe',
                        topic: message.topic,
                        options: message.options,
                    });
                }
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    // Handle MQTT worker messages
    handleMqttMessage(msg) {
        switch (msg.type) {
            case 'mqtt_connected':
                this.broadcast({
                    type: 'mqtt_status',
                    status: 'connected',
                    timestamp: new Date().toISOString(),
                });
                break;

            case 'mqtt_disconnected':
                this.broadcast({
                    type: 'mqtt_status',
                    status: 'disconnected',
                    timestamp: new Date().toISOString(),
                });
                break;

            case 'mqtt_message':
                // Forward MQTT messages to all clients
                this.broadcast({
                    type: 'mqtt_data',
                    topic: msg.topic,
                    data: msg.data,
                    timestamp: new Date().toISOString(),
                });
                break;

            case 'history_inserted':
                this.broadcast({
                    type: 'history_inserted',
                    topic: msg.topic,
                    data: msg.data,
                    timestamp: new Date().toISOString(),
                });
        }
    }

    // Broadcast to all connected clients
    broadcast(message) {
        if (!this.wss) return;

        const messageString = JSON.stringify(message);

        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageString);
            }
        });
    }

    // Send to specific client
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            return true;
        }
        return false;
    }

    // Send to multiple clients
    sendToClients(message) {
        if (!this.wss) return 0;

        const messageString = JSON.stringify(message);
        let sentCount = 0;

        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageString);
                sentCount++;
            }
        });

        return sentCount;
    }

    // Get all connected client IDs
    getConnectedClients() {
        return Array.from(this.clients.keys());
    }

    // Get number of connected clients
    getClientCount() {
        return this.clients.size;
    }

    // Check if client is connected
    isClientConnected(clientId) {
        const client = this.clients.get(clientId);
        return client && client.readyState === WebSocket.OPEN;
    }
}

// Create singleton instance
const websocketManager = new WebSocketManager();
module.exports = websocketManager;

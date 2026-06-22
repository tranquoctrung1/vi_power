// socketManager.js
const WebSocket = require('ws');
const dataSocket = require('./dataSocket');

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // Store clients with IDs
        this.mqttWorker = null; // Reference to MQTT worker process
        this.clientFilters = new Map(); // clientId -> { area, device, range }
        this._liveRefreshTimer = null;
    }

    initialize(wss, mqttWorker = null, db = null) {
        this.wss = wss;
        this.mqttWorker = mqttWorker;
        this.db = db;

        this.wss.on('connection', async (ws) => {
            console.log('New WebSocket Connected');

            const clientId = this.generateClientId();
            ws.id = clientId;
            ws.isAlive = true;
            this.clients.set(clientId, ws);

            if (this.mqttWorker) {
                ws.send(
                    JSON.stringify({
                        type: 'mqtt_status',
                        status: 'connected',
                        timestamp: new Date().toISOString(),
                    }),
                );
            }

            ws.on('pong', () => { ws.isAlive = true; });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(clientId, message);
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            });

            ws.on('close', () => {
                console.log(`Client ${clientId} disconnected`);
                this.clients.delete(clientId);
                this.clientFilters.delete(clientId);
            });

            ws.on('error', (error) => {
                console.error(`WebSocket error for client ${clientId}:`, error);
                this.clients.delete(clientId);
                this.clientFilters.delete(clientId);
            });
        });

        // Heartbeat: ping every 30s, terminate dead connections
        this._heartbeat = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (!ws.isAlive) {
                    this.clients.delete(ws.id);
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () => clearInterval(this._heartbeat));
    }

    setMqttWorker(mqttWorker) {
        this.mqttWorker = mqttWorker;
    }

    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async handleMessage(clientId, message) {
        // Handle different message types
        switch (message.type) {
            case 'client_init':
                this.sendToClient(clientId, {
                    type: 'data_init',
                    data: await dataSocket.init(),
                });
                break;
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
            case 'request_history_data':
                this.sendToClient(clientId, {
                    type: 'request_history_data',
                    data: await dataSocket.getHistoryData(
                        message.message.area,
                        message.message.device,
                        message.message.range,
                    ),
                });
                break;

            case 'request_chart_data':
                this.setClientFilter(clientId, {
                    area: message.message.area,
                    device: message.message.device,
                    range: message.message.range,
                });
                this.sendToClient(clientId, {
                    type: 'chart_data',
                    data: await dataSocket.getChartData(
                        message.message.area,
                        message.message.device,
                        message.message.range,
                    ),
                });
                break;

            case 'request_peak_demand':
                this.setClientFilter(clientId, {
                    area: message.message.area,
                    device: message.message.device,
                });
                this.sendToClient(clientId, {
                    type: 'peak_demand',
                    data: await dataSocket.getPeakDemand(
                        message.message.area,
                        message.message.device,
                    ),
                });
                break;

            case 'request_energy_today':
                this.sendToClient(clientId, {
                    type: 'energy_today',
                    data: await dataSocket.getEnergyToday(
                        message.message.area,
                        message.message.device,
                    ),
                });
                break;

            case 'request_donut_data':
                this.sendToClient(clientId, {
                    type: 'donut_data',
                    data: await dataSocket.getDonutData(),
                });
                break;

            case 'request_heatmap_data':
                this.sendToClient(clientId, {
                    type: 'heatmap_data',
                    data: await dataSocket.getHeatmapData(
                        message.message.area,
                        message.message.device,
                    ),
                });
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
                this.scheduleLiveRefresh();
                break;

            case 'new_alert':
                this.broadcast({
                    type: 'new_alert',
                    data: msg.data,
                });
                break;
        }
    }

    // Remember each client's current chart/peak filter so live MQTT data can
    // push refreshed chart_data/peak_demand back without the client polling.
    setClientFilter(clientId, partial) {
        const prev = this.clientFilters.get(clientId) || { area: 'all', device: 'all', range: 24 };
        this.clientFilters.set(clientId, { ...prev, ...partial });
    }

    // Debounce: a burst of MQTT inserts (one per device) collapses into a single
    // recompute per unique filter combo, a few seconds apart, instead of one per message.
    scheduleLiveRefresh() {
        if (this._liveRefreshTimer) return;
        this._liveRefreshTimer = setTimeout(async () => {
            this._liveRefreshTimer = null;
            await this.pushLiveRefresh();
        }, 3000);
    }

    async pushLiveRefresh() {
        // Group connected clients by their active filter so each unique combo is computed once.
        const groups = new Map(); // key -> { filter, clientIds: [] }
        for (const [clientId, filter] of this.clientFilters.entries()) {
            if (!this.isClientConnected(clientId)) continue;
            const key = `${filter.area}|${filter.device}|${filter.range}`;
            if (!groups.has(key)) groups.set(key, { filter, clientIds: [] });
            groups.get(key).clientIds.push(clientId);
        }

        for (const { filter, clientIds } of groups.values()) {
            try {
                const [chartData, peakData] = await Promise.all([
                    dataSocket.getChartData(filter.area, filter.device, filter.range),
                    dataSocket.getPeakDemand(filter.area, filter.device),
                ]);
                for (const clientId of clientIds) {
                    this.sendToClient(clientId, { type: 'chart_data', data: chartData });
                    this.sendToClient(clientId, { type: 'peak_demand', data: peakData });
                }
            } catch (err) {
                console.error('pushLiveRefresh error for filter', filter, err);
            }
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

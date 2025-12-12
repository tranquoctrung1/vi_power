// socket.js - Main Thread WebSocket Manager
class WebSocketWorkerManager {
    constructor(options = {}) {
        this.options = {
            workerPath: './js/web-worker.js',
            autoConnect: true,
            maxReconnectAttempts: 5,
            reconnectDelay: 3000,
            pingInterval: 30000,
            debug: false,
            autoRequestData: true,
            ...options,
        };

        this.worker = null;
        this.isConnected = false;
        this.reconnectCount = 0;
        this.pingInterval = null;
        this.eventListeners = new Map();
        this.initialData = null;
        this.session = {};

        if (this.options.autoConnect) {
            this.connect();
        }
    }

    connect() {
        try {
            this.worker = new Worker(this.options.workerPath);
            this.setupWorkerHandlers();
            this.worker.postMessage({ type: 'INIT_WS' });

            this.log('Connecting to WebSocket via worker...');
        } catch (error) {
            console.error('❌ Failed to create WebSocket worker:', error);
            this.triggerEvent('error', {
                error: 'Failed to create worker',
                details: error,
            });
        }
    }

    setupWorkerHandlers() {
        this.worker.onmessage = (event) => {
            const { type, payload, status, error, code, reason, timestamp } =
                event.data;
            this.log(`📨 Received from worker: ${type}`);

            switch (type) {
                case 'WS_MESSAGE':
                    this.handleWebSocketMessage(payload);
                    this.triggerEvent('message', payload);
                    break;

                case 'MQTT_DATA':
                    this.triggerEvent('mqtt_data', payload);
                    break;

                case 'WS_STATUS':
                    this.handleConnectionStatus(
                        status,
                        code,
                        reason,
                        event.data,
                    );
                    this.triggerEvent('status', {
                        status,
                        code,
                        reason,
                        timestamp,
                    });
                    break;

                case 'WS_ERROR':
                    this.handleError(error);
                    this.triggerEvent('error', { error, timestamp });
                    break;

                case 'STATUS_RESPONSE':
                    this.triggerEvent('status_response', payload || event.data);
                    break;

                case 'INITIAL_DATA':
                    this.handleInitialData(payload);
                    break;

                default:
                    this.log(
                        `Unknown message type from worker: ${type}`,
                        event.data,
                    );
            }
        };

        this.worker.onerror = (error) => {
            console.error('❌ Web Worker error:', error);
            this.triggerEvent('worker_error', error);
        };
    }

    handleConnectionStatus(status, code, reason, data) {
        this.log(`WebSocket status: ${status} (${code}: ${reason})`);

        switch (status) {
            case 'connected':
                this.isConnected = true;
                this.reconnectCount = 0;
                this.startPingInterval();
                this.triggerEvent('connected', data);

                // Store client ID if provided
                if (data.clientId) {
                    this.clientId = data.clientId;
                    this.log(`Client ID: ${this.clientId}`);
                }
                break;

            case 'disconnected':
                this.isConnected = false;
                this.stopPingInterval();
                this.triggerEvent('disconnected', { code, reason });
                break;

            case 'reconnecting':
                this.reconnectCount++;
                this.triggerEvent('reconnecting', {
                    attempt: this.reconnectCount,
                });
                break;
        }
    }

    handleWebSocketMessage(message) {
        if (!message || !message.type) {
            this.log('Received message without type:', message);
            return;
        }

        switch (message.type) {
            case 'data_init':
                initAreaMap(message.data.displaygroup);
                initSelectDisplayGroup(message.data.displaygroup);
                initDevices(message.data.devices.data, message.data.dataEnergy);
                break;
            case 'client_init_response':
                this.handleClientInitResponse(message);
                break;

            case 'initial_data':
                this.handleInitialData(message.payload || message);
                break;

            case 'server_status':
                this.log('Server status update:', message.status);
                this.triggerEvent('server_status', message);
                break;

            case 'mqtt_status':
                this.log('MQTT status:', message.status);
                this.triggerEvent('mqtt_status', message);
                break;

            case 'broadcast':
                this.log('Broadcast:', message.message);
                this.triggerEvent('broadcast', message);
                break;

            case 'device_data':
                this.triggerEvent('device_data', message);
                break;

            case 'alert_data':
                this.triggerEvent('alert_data', message);
                break;

            case 'energy_data':
                this.triggerEvent('energy_data', message);
                break;

            default:
                this.log('Unknown message type:', message.type);
                this.triggerEvent('unknown_message', message);
        }
    }

    handleClientInitResponse(message) {
        this.log('✅ Server acknowledged client initialization');

        if (message.session) {
            this.session = { ...this.session, ...message.session };
            this.triggerEvent('session_updated', this.session);
        }

        if (message.message) {
            this.log('Server message:', message.message);
        }

        // Request initial data if autoRequestData is enabled
        if (this.options.autoRequestData) {
            this.requestInitialData();
        }
    }

    handleInitialData(data) {
        this.initialData = data;
        this.log('📊 Received initial data from server');

        // Store data in session
        if (!this.session.initialData) {
            this.session.initialData = {};
        }
        this.session.initialData = { ...this.session.initialData, ...data };
        this.session.lastDataUpdate = new Date().toISOString();

        // Trigger initial data event
        this.triggerEvent('initial_data', data);

        // Also trigger specific data events if available
        if (data.devices) {
            this.triggerEvent('devices_data', data.devices);
        }
        if (data.alerts) {
            this.triggerEvent('alerts_data', data.alerts);
        }
        if (data.recent_data) {
            this.triggerEvent('recent_data', data.recent_data);
        }
    }

    handleError(error) {
        console.error('❌ WebSocket error:', error);
        this.triggerEvent('websocket_error', error);
    }

    // Public API Methods
    sendMessage(message) {
        if (!this.worker) {
            console.error('❌ Worker not initialized');
            return false;
        }

        try {
            this.worker.postMessage({
                type: 'SEND_MESSAGE',
                payload: message,
            });
            return true;
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            return false;
        }
    }

    sendJson(data) {
        return this.sendMessage(data);
    }

    requestInitialData(dataTypes = {}) {
        if (!this.worker) {
            console.error('❌ Worker not initialized');
            return false;
        }

        const request = {
            devices: dataTypes.devices !== undefined ? dataTypes.devices : true,
            alerts: dataTypes.alerts !== undefined ? dataTypes.alerts : true,
            recent_data:
                dataTypes.recent_data !== undefined
                    ? dataTypes.recent_data
                    : true,
            display_groups:
                dataTypes.display_groups !== undefined
                    ? dataTypes.display_groups
                    : true,
            user_groups:
                dataTypes.user_groups !== undefined
                    ? dataTypes.user_groups
                    : true,
            ...dataTypes,
        };

        this.worker.postMessage({
            type: 'REQUEST_DATA',
            payload: request,
        });

        this.log('📤 Requested initial data from server');
        return true;
    }

    setAuthToken(token) {
        if (this.worker) {
            this.worker.postMessage({
                type: 'SET_AUTH_TOKEN',
                payload: token,
            });
        }

        // Also store locally
        this.authToken = token;
        this.log('✅ Auth token set');
    }

    subscribeToTopic(topic) {
        return this.sendMessage({
            type: 'subscribe',
            topic: topic,
            clientId: this.clientId,
            timestamp: new Date().toISOString(),
        });
    }

    unsubscribeFromTopic(topic) {
        return this.sendMessage({
            type: 'unsubscribe',
            topic: topic,
            clientId: this.clientId,
            timestamp: new Date().toISOString(),
        });
    }

    closeConnection() {
        if (this.worker) {
            this.worker.postMessage({ type: 'CLOSE_WS' });
            this.stopPingInterval();
            this.isConnected = false;
        }
    }

    reconnect() {
        if (this.worker) {
            this.worker.postMessage({ type: 'RECONNECT' });
        }
    }

    getStatus() {
        return new Promise((resolve) => {
            if (!this.worker) {
                resolve({ connected: false, error: 'Worker not initialized' });
                return;
            }

            const handler = (event) => {
                if (event.data.type === 'STATUS_RESPONSE') {
                    resolve(event.data);
                    this.worker.removeEventListener('message', handler);
                }
            };

            this.worker.addEventListener('message', handler);
            this.worker.postMessage({ type: 'GET_STATUS' });
        });
    }

    getSession() {
        return {
            ...this.session,
            clientId: this.clientId,
            connected: this.isConnected,
        };
    }

    startPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        this.pingInterval = setInterval(() => {
            if (this.worker && this.isConnected) {
                this.worker.postMessage({ type: 'PING' });
            }
        }, this.options.pingInterval);
    }

    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    triggerEvent(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach((callback) => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} event handler:`, error);
                }
            });
        }
    }

    destroy() {
        this.closeConnection();
        this.stopPingInterval();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.eventListeners.clear();
        this.log('WebSocket manager destroyed');
    }

    log(...args) {
        if (this.options.debug) {
            console.log('[WebSocketWorkerManager]', ...args);
        }
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.WebSocketWorkerManager = WebSocketWorkerManager;
}

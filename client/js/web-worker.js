// web-worker.js
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 3000;
let reconnectTimeout = null;
let pingInterval = null;
let isExplicitClose = false;
let clientId = null;
let sessionData = {};

function generateClientId() {
    return (
        'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    );
}

function connectWebSocket() {
    if (isExplicitClose) {
        console.log('Explicit close requested, skipping reconnection');
        return;
    }

    try {
        // Generate client ID if not exists
        if (!clientId) {
            clientId = generateClientId();
        }

        // Clean up existing connection
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onclose = null;
            ws.onerror = null;
            if (
                ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING
            ) {
                ws.close();
            }
        }

        // Get WebSocket URL
        const protocol = self.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = self.location.hostname;
        const port = 3000;
        const wsUrl = `${protocol}//${host}:${port}`;

        console.log(`Worker connecting to WebSocket: ${wsUrl}`);
        ws = new WebSocket(wsUrl);

        ws.onopen = function (event) {
            console.log('✅ WebSocket connected in worker');
            reconnectAttempts = 0;

            // Clear any existing reconnect timeout
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }

            // Send client initialization message to server
            sendClientInit();

            // Notify main thread
            postMessage({
                type: 'WS_STATUS',
                status: 'connected',
                timestamp: new Date().toISOString(),
                url: wsUrl,
                clientId: clientId,
            });
        };

        ws.onmessage = function (event) {
            try {
                let data;
                if (typeof event.data === 'string') {
                    try {
                        data = JSON.parse(event.data);
                    } catch {
                        data = {
                            type: 'text',
                            message: event.data,
                        };
                    }
                } else {
                    data = event.data;
                }

                console.log('📨 Message received in worker:', data);

                // Send the message back to main thread
                postMessage({
                    type: 'WS_MESSAGE',
                    payload: data,
                    timestamp: new Date().toISOString(),
                });

                // Handle specific message types in worker
                handleServerMessage(data);
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
                postMessage({
                    type: 'WS_ERROR',
                    error: 'Failed to parse message',
                    details: error.message,
                    timestamp: new Date().toISOString(),
                });
            }
        };

        ws.onclose = function (event) {
            console.log(
                `🔌 WebSocket disconnected in worker. Code: ${event.code}, Reason: ${event.reason}`,
            );

            // Clean up ping interval
            if (pingInterval) {
                clearInterval(pingInterval);
                pingInterval = null;
            }

            // Notify main thread
            postMessage({
                type: 'WS_STATUS',
                status: 'disconnected',
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean,
                timestamp: new Date().toISOString(),
            });

            // Attempt reconnection if not explicitly closed
            if (!isExplicitClose && reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(
                    `🔄 Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts} in ${reconnectDelay}ms`,
                );

                reconnectTimeout = setTimeout(() => {
                    console.log('Attempting to reconnect...');
                    connectWebSocket();
                }, reconnectDelay);
            } else if (reconnectAttempts >= maxReconnectAttempts) {
                console.error('❌ Max reconnection attempts reached');
                postMessage({
                    type: 'WS_ERROR',
                    error: 'Max reconnection attempts reached',
                    attempts: reconnectAttempts,
                    timestamp: new Date().toISOString(),
                });
            }
        };

        ws.onerror = function (error) {
            console.error('❌ WebSocket error in worker:', error);
            postMessage({
                type: 'WS_ERROR',
                error: 'WebSocket connection error',
                timestamp: new Date().toISOString(),
            });
        };
    } catch (error) {
        console.error('❌ Failed to create WebSocket in worker:', error);
        postMessage({
            type: 'WS_ERROR',
            error: 'Failed to create WebSocket',
            details: error.message,
            timestamp: new Date().toISOString(),
        });
    }
}

function sendClientInit() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('Cannot send client init: WebSocket not ready');
        return;
    }

    const initMessage = {
        type: 'client_init',
        clientId: clientId,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        url: self.location.href,
        session: {
            initialized: false,
            lastActivity: null,
            subscriptions: [],
        },
    };

    // Add auth token if available (from localStorage or cookies)
    try {
        // Try to get from localStorage
        const token = localStorage.getItem('authToken');
        if (token) {
            initMessage.authToken = token;
        }
    } catch (e) {
        // localStorage not available
    }

    ws.send(JSON.stringify(initMessage));
    console.log('📤 Sent client initialization to server');
}

function handleServerMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
        case 'client_init_response':
            console.log('✅ Server acknowledged client initialization');

            // Store session data
            if (data.session) {
                sessionData = { ...sessionData, ...data.session };
            }

            // Request initial data based on server response
            requestInitialData();
            break;

        case 'pong':
            console.log('🏓 Received pong from server');
            break;

        case 'server_status':
            console.log('Server status:', data.status);
            break;

        case 'mqtt_status':
            console.log('MQTT status:', data.status);
            break;

        case 'mqtt_message':
            if (data.payload) {
                postMessage({
                    type: 'MQTT_DATA',
                    payload: data.payload,
                    topic: data.topic,
                    timestamp: data.timestamp || new Date().toISOString(),
                });
            }
            break;

        case 'initial_data':
            console.log('📊 Received initial data from server');
            postMessage({
                type: 'INITIAL_DATA',
                payload: data.payload,
                timestamp: new Date().toISOString(),
            });
            break;

        case 'broadcast':
            console.log('📢 Broadcast message:', data.message);
            break;

        case 'error':
            console.error('❌ Server error:', data.error);
            break;
    }
}

function requestInitialData() {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
    }

    const dataRequest = {
        type: 'get_initial_data',
        clientId: clientId,
        timestamp: new Date().toISOString(),
        request: {
            devices: true,
            alerts: true,
            recent_data: true,
            display_groups: true,
            user_groups: true,
        },
    };

    ws.send(JSON.stringify(dataRequest));
    console.log('📤 Requested initial data from server');
}

// Handle messages from main thread
self.onmessage = function (event) {
    const { type, payload } = event.data;
    console.log(`📤 Received from main thread: ${type}`);

    switch (type) {
        case 'INIT_WS':
            isExplicitClose = false;
            connectWebSocket();
            break;

        case 'SEND_MESSAGE':
            if (ws && ws.readyState === WebSocket.OPEN) {
                const message =
                    typeof payload === 'object'
                        ? JSON.stringify(payload)
                        : payload;
                ws.send(message);
                console.log('✅ Message sent to server:', payload);
            } else {
                console.error('❌ WebSocket not connected');
                postMessage({
                    type: 'WS_ERROR',
                    error: 'WebSocket not connected',
                    state: ws ? ws.readyState : 'no_websocket',
                    timestamp: new Date().toISOString(),
                });
            }
            break;

        case 'CLOSE_WS':
            isExplicitClose = true;
            if (ws) {
                ws.close(1000, 'Client requested closure');
            }
            break;

        case 'RECONNECT':
            isExplicitClose = false;
            reconnectAttempts = 0;
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
                reconnectTimeout = null;
            }
            connectWebSocket();
            break;

        case 'GET_STATUS':
            const status = ws
                ? {
                      readyState: ws.readyState,
                      url: ws.url,
                      connected: ws.readyState === WebSocket.OPEN,
                      reconnecting: reconnectTimeout !== null,
                      clientId: clientId,
                      sessionData: sessionData,
                  }
                : {
                      readyState: -1,
                      connected: false,
                      reconnecting: false,
                  };

            postMessage({
                type: 'STATUS_RESPONSE',
                status: status,
                reconnectAttempts: reconnectAttempts,
                isExplicitClose: isExplicitClose,
                timestamp: new Date().toISOString(),
            });
            break;

        case 'REQUEST_DATA':
            if (ws && ws.readyState === WebSocket.OPEN) {
                const dataRequest = {
                    type: 'client_data_request',
                    clientId: clientId,
                    timestamp: new Date().toISOString(),
                    request: payload || {},
                };
                ws.send(JSON.stringify(dataRequest));
            }
            break;

        case 'SET_AUTH_TOKEN':
            // Store auth token for future connections
            if (payload) {
                try {
                    localStorage.setItem('authToken', payload);
                } catch (e) {
                    console.warn('Could not store auth token in localStorage');
                }
            }
            break;

        default:
            console.log('Unknown message type from main thread:', type);
    }
};

// Initialize on worker load
console.log('🔧 WebSocket Worker initialized');

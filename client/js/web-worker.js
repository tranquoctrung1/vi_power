// websocket-worker.js
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

function connectWebSocket() {
  try {
    // Replace with your actual WebSocket server URL
    ws = new WebSocket(`ws://localhost:8080`);

    ws.onopen = function (event) {
      console.log("WebSocket connected in worker");
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      postMessage({ type: "WS_STATUS", status: "connected" });
    };

    ws.onmessage = function (event) {
      try {
        const data = JSON.parse(event.data);
        console.log("Message received in worker:", data);

        // Send the message back to main thread
        postMessage({
          type: "WS_MESSAGE",
          payload: data,
        });
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        postMessage({
          type: "WS_ERROR",
          error: "Failed to parse message",
        });
      }
    };

    ws.onclose = function (event) {
      console.log("WebSocket disconnected in worker");
      postMessage({
        type: "WS_STATUS",
        status: "disconnected",
        code: event.code,
        reason: event.reason,
      });

      // Attempt reconnection
      if (reconnectAttempts < maxReconnectAttempts) {
        setTimeout(() => {
          reconnectAttempts++;
          connectWebSocket();
        }, reconnectDelay);
      }
    };

    ws.onerror = function (error) {
      console.error("WebSocket error in worker:", error);
      postMessage({
        type: "WS_ERROR",
        error: "WebSocket connection error",
      });
    };
  } catch (error) {
    console.error("Failed to create WebSocket in worker:", error);
    postMessage({
      type: "WS_ERROR",
      error: "Failed to create WebSocket",
    });
  }
}

// Handle messages from main thread
self.onmessage = function (event) {
  const { type, payload } = event.data;

  switch (type) {
    case "INIT_WS":
      connectWebSocket();
      break;

    case "SEND_MESSAGE":
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      } else {
        postMessage({
          type: "WS_ERROR",
          error: "WebSocket not connected",
        });
      }
      break;

    case "CLOSE_WS":
      if (ws) {
        ws.close();
      }
      break;

    default:
      console.log("Unknown message type:", type);
  }
};

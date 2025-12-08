// main.js
class WebSocketWorkerManager {
  constructor() {
    this.worker = new Worker("./js/web-worker.js");
    this.setupMessageHandling();
    this.initializeWebSocket();
  }

  setupMessageHandling() {
    this.worker.onmessage = (event) => {
      const { type, payload, status, error } = event.data;

      switch (type) {
        case "WS_MESSAGE":
          this.handleWebSocketMessage(payload);
          break;

        default:
          console.log("Unknown message from worker:", type);
      }
    };

    this.worker.onerror = (error) => {
      console.error("Web Worker error:", error);
    };
  }

  initializeWebSocket() {
    // Send initialization message to worker
    this.worker.postMessage({ type: "INIT_WS" });
  }

  handleWebSocketMessage(message) {
    // Handle different message types from server
    switch (message.type) {
      case "INFO":
        // Update UI or perform actions based on INFO message
        break;

      default:
        console.log("Unknown message type:", message.type);
    }
  }

  handleError(error) {
    // Handle errors appropriately
    console.error("WebSocket error occurred:", error);
  }

  sendMessage(message) {
    // Send message to server via worker
    this.worker.postMessage({
      type: "SEND_MESSAGE",
      payload: message,
    });
  }

  closeConnection() {
    // Close WebSocket connection
    this.worker.postMessage({ type: "CLOSE_WS" });
  }
}

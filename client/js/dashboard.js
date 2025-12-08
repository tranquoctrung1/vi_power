let wsManager = null;

document.addEventListener("DOMContentLoaded", () => {
  // Initialize the WebSocket worker manager
  wsManager = new WebSocketWorkerManager();

  window.addEventListener("resize", () => {});
});

window.addEventListener("beforeunload", () => {
  wsManager.closeConnection();
});

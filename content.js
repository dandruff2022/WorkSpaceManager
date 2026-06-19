// Workspace Manager - Content Script Placeholder
// Injected into web pages to assist with automation (Phase 1+)

console.log("[Workspace Manager] Content script loaded on: " + window.location.href);

// For Phase 0.5, we just set up a basic message receiver
const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;

chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Workspace Manager] Content script received message:", message);
  if (message.action === "ping") {
    sendResponse({ status: "pong", url: window.location.href });
  }
  return true;
});

// Workspace Manager - Content Script
// Injected into web pages to assist with automation (Phase 1+)

console.log("[Workspace Manager] Content script loaded on: " + window.location.href);

const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;

// Function to inject interceptors into the webpage's Main World
function injectMainWorldInterceptors() {
  try {
    const script = document.createElement('script');
    script.textContent = `
      (() => {
        // Intercept Clipboard writeText
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
          navigator.clipboard.writeText = async (text) => {
            document.dispatchEvent(new CustomEvent('agyCopyCaptured', { detail: text }));
            if (window.__agy_intercept_active === true) {
              return Promise.resolve();
            }
            return originalWriteText(text);
          };
        }

        // Intercept SPA History navigation
        const originalPushState = history.pushState.bind(history);
        const originalReplaceState = history.replaceState.bind(history);

        history.pushState = function(...args) {
          const result = originalPushState(...args);
          document.dispatchEvent(new CustomEvent('agyNavigation', { detail: args[2] || location.pathname }));
          return result;
        };

        history.replaceState = function(...args) {
          const result = originalReplaceState(...args);
          document.dispatchEvent(new CustomEvent('agyNavigation', { detail: args[2] || location.pathname }));
          return result;
        };
      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
    console.log("[Workspace Manager] Main world interceptors successfully injected.");
  } catch (e) {
    console.error("[Workspace Manager] Failed to inject main world interceptors:", e);
  }
}

// Perform injection at document start
injectMainWorldInterceptors();

// Listen to CustomEvents relayed from Main World to Isolated World
document.addEventListener("agyCopyCaptured", (e) => {
  console.log("[Workspace Manager] Clipboard write intercepted: " + e.detail);
  chromeAPI.runtime.sendMessage({ action: "clipboardCaptured", payload: { text: e.detail } }).catch(err => {
    // Suppress unhandled promise rejection error if extension does not have background receiver active
  });
});

document.addEventListener("agyNavigation", (e) => {
  console.log("[Workspace Manager] SPA navigation detected: " + e.detail);
  chromeAPI.runtime.sendMessage({ action: "navigationDetected", payload: { path: e.detail } }).catch(err => {
    // Suppress error
  });
});

// Relay testing requests from Main World to Background via Isolated World
document.addEventListener("agyTestRequest", (e) => {
  const { id, action, payload } = e.detail;
  chromeAPI.runtime.sendMessage({ action, payload })
    .then(response => {
      document.dispatchEvent(new CustomEvent("agyTestResponse_" + id, { detail: response }));
    })
    .catch(err => {
      document.dispatchEvent(new CustomEvent("agyTestResponse_" + id, { detail: { error: err.message } }));
    });
});

// Basic message receiver for automation handshakes
chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Workspace Manager] Content script received message:", message);
  if (message.action === "ping") {
    sendResponse({ status: "pong", url: window.location.href });
  }
  return true;
});

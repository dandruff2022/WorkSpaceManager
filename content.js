// Workspace Manager - Content Script
// Injected into web pages to assist with automation (Phase 1+)

console.log("[Workspace Manager] Content script loaded on: " + window.location.href);

const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;


// Listen to CustomEvents relayed from Main World to Isolated World
document.addEventListener("agyCopyCaptured", (e) => {
  const logMsg = `[ContentScript] Clipboard write intercepted: "${e.detail.substring(0, 100)}..."`;
  console.log(logMsg);
  chromeAPI.runtime.sendMessage({ action: "bridge_log", payload: { text: logMsg, type: "success" } }).catch(() => {});
  chromeAPI.runtime.sendMessage({ action: "clipboardCaptured", payload: { text: e.detail } }).catch(err => {
    // Suppress error
  });
});

// Intercept native copy event in capture phase
document.addEventListener("copy", (e) => {
  const selectionText = window.getSelection().toString();
  const logMsg = `[ContentScript] Native 'copy' event fired. Selected: "${selectionText.substring(0, 100)}"`;
  console.log(logMsg);
  chromeAPI.runtime.sendMessage({ action: "bridge_log", payload: { text: logMsg, type: "info" } }).catch(() => {});
}, true);

document.addEventListener("agyNavigation", (e) => {
  console.log("[Workspace Manager] SPA navigation detected: " + e.detail);
  chromeAPI.runtime.sendMessage({ action: "navigationDetected", payload: { path: e.detail } }).catch(err => {
    // Suppress error
  });
});

// Relay testing requests from Main World to Background via Isolated World
// Only the local dev harness page may use this, and only with "Dev harness" switched on in Settings
document.addEventListener("agyTestRequest", async (e) => {
  if (!/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return;
  const { devHarness } = await chromeAPI.storage.local.get(['devHarness']);
  if (devHarness !== true) return;
  try {
    const data = JSON.parse(e.detail);
    const { id, action, payload } = data;
    chromeAPI.runtime.sendMessage({ action, payload })
      .then(response => {
        document.dispatchEvent(new CustomEvent("agyTestResponse_" + id, { 
          detail: JSON.stringify(response || {}) 
        }));
      })
      .catch(err => {
        document.dispatchEvent(new CustomEvent("agyTestResponse_" + id, { 
          detail: JSON.stringify({ error: err.message }) 
        }));
      });
  } catch (err) {
    console.error("[Workspace Manager] Error parsing agyTestRequest:", err);
  }
});

// Basic message receiver for automation handshakes
chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Workspace Manager] Content script received message:", message);
  if (message.action === "ping") {
    sendResponse({ status: "pong", url: window.location.href });
  }
  return true;
});

// Dynamic binding of Skills Autocomplete on active input focus
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (!el) return;

  const isTextarea = el.tagName === "TEXTAREA";
  const isInput = el.tagName === "INPUT" && el.type === "text";
  const isEditable = el.getAttribute("contenteditable") === "true";

  if ((isTextarea || isInput || isEditable) && !el.__agy_autocomplete_attached) {
    if (chromeAPI && chromeAPI.storage && chromeAPI.storage.local) {
      chromeAPI.storage.local.get(['enableWebpageAutocomplete', 'siteProfiles'], (data) => {
        if (data.enableWebpageAutocomplete === false) {
          return; // Webpage sessions autocomplete disabled
        }

        // Verify if the current domain matches a supported/connected site profile
        const host = window.location.hostname;
        const profiles = data.siteProfiles || {};
        let isSupported = false;
        
        for (const key in profiles) {
          const profile = profiles[key];
          const hostLower = (host || "").toLowerCase();
          const matchesDomain = profile.domain && hostLower.includes(profile.domain.toLowerCase());
          const matchesAlias = Array.isArray(profile.domainAliases) && profile.domainAliases.some(alias => alias && hostLower.includes(alias.toLowerCase()));
          if (matchesDomain || matchesAlias) {
            isSupported = true;
            break;
          }
        }

        if (!isSupported) {
          return; // Skip non-supported website
        }

        if (typeof SkillsAutocomplete !== "undefined") {
          new SkillsAutocomplete(el, {
            onQuery: (prefix) => {
              return new Promise((resolve) => {
                chromeAPI.runtime.sendMessage({ action: "querySkills", prefix }, (response) => {
                  if (response && response.matches) {
                    resolve(response.matches);
                  } else {
                    resolve([]);
                  }
                });
              });
            }
          });
          el.__agy_autocomplete_attached = true;
          console.log("[Workspace Manager] Autocomplete attached to element:", el);
        }
      });
    }
  }
});

// Workspace Manager - Background Script
// Targets Chrome/Chromium and Firefox (Manifest V3)

const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;
let managerWindowId = null;

// Milestone 1.2: Ephemeral Tab Registry
const tabTracker = {
  activeTabs: new Map(), // tabId -> { url, title, windowId }
  lastCreatedTabId: null,
  eventsLog: {
    activatedCount: 0,
    lifecycleCount: 0
  }
};

// Startup Tab Scan
function runStartupTabScan() {
  chromeAPI.tabs.query({}, (tabs) => {
    if (chromeAPI.runtime.lastError || !tabs) return;
    tabTracker.activeTabs.clear();
    for (const tab of tabs) {
      if (tab.id) {
        tabTracker.activeTabs.set(tab.id, {
          url: tab.url || "",
          title: tab.title || "",
          windowId: tab.windowId
        });
      }
    }
    console.log(`[Background] Startup tab scan complete. Registered ${tabTracker.activeTabs.size} tabs.`);
  });
}

// Run immediately on background start
runStartupTabScan();

// Tab lifecycle listeners
chromeAPI.tabs.onCreated.addListener((tab) => {
  if (!tab.id) return;
  tabTracker.activeTabs.set(tab.id, {
    url: tab.url || "",
    title: tab.title || "",
    windowId: tab.windowId
  });
  tabTracker.lastCreatedTabId = tab.id;
  tabTracker.eventsLog.lifecycleCount++;
  console.log(`[Background] Tab created: ${tab.id}. Lifecycle count: ${tabTracker.eventsLog.lifecycleCount}`);
});

chromeAPI.tabs.onRemoved.addListener((tabId) => {
  if (tabTracker.activeTabs.has(tabId)) {
    tabTracker.activeTabs.delete(tabId);
    tabTracker.eventsLog.lifecycleCount++;
    console.log(`[Background] Tab removed: ${tabId}. Lifecycle count: ${tabTracker.eventsLog.lifecycleCount}`);
  }
});

chromeAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tabId) return;
  tabTracker.activeTabs.set(tabId, {
    url: tab.url || "",
    title: tab.title || "",
    windowId: tab.windowId
  });
  tabTracker.eventsLog.lifecycleCount++;
  console.log(`[Background] Tab updated: ${tabId}. Lifecycle count: ${tabTracker.eventsLog.lifecycleCount}`);
});

chromeAPI.tabs.onActivated.addListener((activeInfo) => {
  tabTracker.eventsLog.activatedCount++;
  console.log(`[Background] Tab activated: ${activeInfo.tabId}. Activated count: ${tabTracker.eventsLog.activatedCount}`);
});

// Initialize the extension when installed or updated
chromeAPI.runtime.onInstalled.addListener(() => {
  console.log("Workspace Manager Extension Installed.");
  runStartupTabScan();
  
  const defaultProfiles = {
    chatgpt: {
      siteName: "ChatGPT",
      domain: "chatgpt.com",
      newChatUrl: "https://chatgpt.com/",
      selectors: {
        inputSelector: "#prompt-textarea",
        sendButtonSelector: "button[data-testid*=\"send\" i], button[aria-label*=\"send\" i]",
        newChatButtonSelector: "a[href=\"/\"], button[aria-label*=\"new chat\" i]",
        copyButtonSelector: "button[data-testid$=\"copy-turn-action-button\"], button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy message\" i]",
        stopButtonSelector: "button[data-testid*=\"stop-button\" i], button[aria-label*=\"stop generating\" i]",
        messageTurnSelector: "article, [data-testid^=\"conversation-turn\"]"
      },
      flags: {
        useEnterFallback: false,
        postSubmitDelayMs: 0
      }
    },
    claude: {
      siteName: "Claude",
      domain: "claude.ai",
      newChatUrl: "https://claude.ai/new",
      selectors: {
        inputSelector: "div[contenteditable=\"true\"]",
        sendButtonSelector: "button[aria-label*=\"send\" i], button[data-testid*=\"send\" i], button:has(svg polygon)",
        newChatButtonSelector: "a[href*=\"/new\" i], [data-testid*=\"new-chat\" i]",
        copyButtonSelector: "button[data-testid*=\"copy\" i], button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[data-testid*=\"copy\" i][aria-label*=\"copy\" i], button[aria-label*=\"copy\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.font-claude-message, div[data-testid*=\"message\" i], div.chat-and-document, [class*=\"conversation-turn\" i]"
      },
      flags: {
        useEnterFallback: true,
        postSubmitDelayMs: 1500
      }
    },
    gemini: {
      siteName: "Gemini",
      domain: "gemini.google.com",
      newChatUrl: "https://gemini.google.com/app",
      selectors: {
        inputSelector: "div[contenteditable=\"true\"]",
        sendButtonSelector: "button[aria-label*=\"send\" i], button.send-button",
        newChatButtonSelector: "a[href*=\"/app\" i][aria-label*=\"new\" i], [aria-label*=\"new chat\" i], [data-testid*=\"new-chat\" i], button.new-chat-button",
        copyButtonSelector: "button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy prompt\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.message-content, div.conversation-turn"
      },
      flags: {
        useEnterFallback: true,
        postSubmitDelayMs: 0
      }
    },
    copilot: {
      siteName: "Copilot",
      domain: "copilot.microsoft.com",
      newChatUrl: "https://copilot.microsoft.com/",
      selectors: {
        inputSelector: "textarea, #searchbar",
        sendButtonSelector: "button[aria-label*=\"submit\" i], button[aria-label*=\"send\" i]",
        newChatButtonSelector: "button[aria-label*=\"new\" i]",
        copyButtonSelector: "button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy\" i]",
        stopButtonSelector: "button#stop-responding-button, button[id*=\"stop\" i], button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.chat-message, div.message-bubble, div.group\\/ai-message, div.group\\/user-message, [data-testid=\"ai-message\" i], [data-testid=\"user-message\" i]"
      },
      flags: {
        useEnterFallback: true,
        postSubmitDelayMs: 0
      }
    }
  };

  // Seed storage.local with default preferredMode and siteProfiles
  chromeAPI.storage.local.set({ 
    preferredMode: 'window',
    siteProfiles: defaultProfiles
  });

  // For Chrome: Configure default behavior for the side panel API if available
  if (chromeAPI.sidePanel && typeof chromeAPI.sidePanel.setPanelBehavior === 'function') {
    // We don't want the side panel to open on action click by default, 
    // because we default to a detached window.
    chromeAPI.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      .catch((error) => console.error("Error setting panel behavior:", error));
  }
});

// Listen to the toolbar extension icon click
chromeAPI.action.onClicked.addListener(async (tab) => {
  const data = await chromeAPI.storage.local.get(['preferredMode']);
  const preferredMode = data.preferredMode || 'window';

  if (preferredMode === 'panel') {
    openSidePanel(tab);
  } else {
    openDetachedWindow();
  }
});

// Function to open the side panel
async function openSidePanel(tab, allowFallback = true) {
  // Try Chrome sidePanel API
  if (chromeAPI.sidePanel && typeof chromeAPI.sidePanel.open === 'function') {
    try {
      await chromeAPI.sidePanel.open({ windowId: tab.windowId });
      closeDetachedWindow();
    } catch (err) {
      console.error("Failed to open side panel via API:", err);
      if (allowFallback) openDetachedWindow();
    }
  } 
  // Try Firefox sidebarAction API
  else if (chromeAPI.sidebarAction && typeof chromeAPI.sidebarAction.open === 'function') {
    try {
      await chromeAPI.sidebarAction.open();
      closeDetachedWindow();
    } catch (err) {
      console.error("Failed to open Firefox sidebar programmatically:", err);
      if (allowFallback) openDetachedWindow();
    }
  } 
  // Fallback
  else {
    console.log("Side panel/sidebar APIs not supported or accessible in this browser.");
    if (allowFallback) openDetachedWindow();
  }
}

// Function to open the detached popup window
async function openDetachedWindow() {
  // If the window is already open, try to focus it
  if (managerWindowId !== null) {
    try {
      await chromeAPI.windows.update(managerWindowId, { focused: true });
      return;
    } catch (e) {
      // Window was closed manually by the user
      managerWindowId = null;
    }
  }

  // Create new detached window (popup type to hide toolbar/bookmarks)
  chromeAPI.windows.create({
    url: chromeAPI.runtime.getURL("ui/manager.html?mode=window"),
    type: "popup",
    width: 850,
    height: 600
  }, (win) => {
    if (win) {
      managerWindowId = win.id;
    }
  });
}

// Function to close the detached window
function closeDetachedWindow() {
  if (managerWindowId !== null) {
    chromeAPI.windows.remove(managerWindowId, () => {
      managerWindowId = null;
    });
  } else {
    // Fallback: search all windows to find the manager window and close it
    try {
      chromeAPI.windows.getAll({ populate: true }, (windows) => {
        if (chromeAPI.runtime.lastError || !windows) return;
        const managerWin = windows.find(win => 
          win.tabs && win.tabs.some(tab => tab.url && tab.url.includes("manager.html?mode=window"))
        );
        if (managerWin) {
          chromeAPI.windows.remove(managerWin.id);
        }
      });
    } catch (e) {
      console.warn("Could not query windows:", e);
    }
  }
}

// Message Bus Dispatcher
chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  // Milestone 1.2 testing actions
  if (message.action === 'getTestTrackerLogs') {
    sendResponse({
      activatedCount: tabTracker.eventsLog.activatedCount,
      lifecycleCount: tabTracker.eventsLog.lifecycleCount,
      lastCreatedTabId: tabTracker.lastCreatedTabId,
      callerTabId: sender.tab ? sender.tab.id : null
    });
    return true;
  }

  if (message.action === 'switchTab') {
    const { tabId } = message.payload;
    chromeAPI.tabs.update(tabId, { active: true }, (tab) => {
      if (chromeAPI.runtime.lastError || !tab) {
        sendResponse({ status: "error", error: chromeAPI.runtime.lastError?.message });
        return;
      }
      chromeAPI.windows.update(tab.windowId, { focused: true }, () => {
        sendResponse({ status: "success" });
      });
    });
    return true;
  }

  if (message.action === 'switchViewMode') {
    const targetMode = message.payload.mode;
    chromeAPI.storage.local.set({ preferredMode: targetMode }, () => {
      if (targetMode === 'panel') {
        // Switch to side panel: open it for the current window and close the detached window
        if (sender.tab && sender.tab.windowId) {
          openSidePanel(sender.tab, false);
        } else {
          // If message is sent from popup window, we query the active tab's window
          chromeAPI.tabs.query({ active: true, currentWindow: false }, (tabs) => {
            // Find a tab that is not in our popup window (our popup has no normal tabs)
            const activeTab = tabs.find(t => t.url && !t.url.includes("manager.html"));
            if (activeTab) {
              openSidePanel(activeTab, false);
            } else {
              // Fallback: query active tab in any window
              chromeAPI.tabs.query({ active: true }, (allActiveTabs) => {
                const targetTab = allActiveTabs.find(t => t.url && !t.url.includes("manager.html"));
                if (targetTab) {
                  openSidePanel(targetTab, false);
                } else {
                  console.error("Could not find a valid window tab to attach side panel.");
                }
              });
            }
          });
        }
      } else if (targetMode === 'window') {
        // Switch to detached window: open it and let the side panel be closed or stay
        openDetachedWindow();
      }
      sendResponse({ status: "success" });
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'closeDetached') {
    closeDetachedWindow();
    sendResponse({ status: "success" });
    return true;
  }

  if (message.action === 'bridgeCommand') {
    const { tabId, command, payload } = message.payload;
    ensureContentScript(tabId).then(() => {
      chromeAPI.tabs.sendMessage(tabId, { action: `bridge_${command}`, payload }, (response) => {
        if (chromeAPI.runtime.lastError) {
          sendResponse({ status: "error", error: chromeAPI.runtime.lastError.message });
        } else {
          sendResponse(response);
        }
      });
    }).catch(err => {
      sendResponse({ status: "error", error: err.message });
    });
    return true; // Keep channel open
  }

  // Forward observation state changes back to manager UI
  if (message.action === 'bridge_state_change') {
    chromeAPI.runtime.sendMessage(message).catch(() => {});
    return false;
  }

  return false;
});

// Dynamic content script loader validation helper
async function ensureContentScript(tabId) {
  try {
    const response = await new Promise((resolve, reject) => {
      chromeAPI.tabs.sendMessage(tabId, { action: "bridge_ping" }, (res) => {
        if (chromeAPI.runtime.lastError || !res) {
          reject(chromeAPI.runtime.lastError);
        } else {
          resolve(res);
        }
      });
    });
    if (response && response.status === "pong") return true;
  } catch (e) {
    // Content script not loaded or handshake failed
  }
  
  // Inject scripts dynamically
  await chromeAPI.scripting.executeScript({
    target: { tabId },
    files: ["bridge.js", "content.js"]
  });
  console.log(`[Background] Dynamically injected content scripts into tab ${tabId}.`);
  return true;
}

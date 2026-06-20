// Workspace Manager - Background Script
// Targets Chrome/Chromium and Firefox (Manifest V3)

const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;
let managerWindowId = null;

// Initialize the extension when installed or updated
chromeAPI.runtime.onInstalled.addListener(() => {
  console.log("Workspace Manager Extension Installed.");
  
  const defaultProfiles = {
    chatgpt: {
      siteName: "ChatGPT",
      domain: "chatgpt.com",
      selectors: {
        inputSelector: "#prompt-textarea",
        sendButtonSelector: "button[data-testid*=\"send\" i], button[aria-label*=\"send\" i]",
        newChatButtonSelector: "a[href=\"/\"], button[aria-label*=\"new chat\" i]",
        copyButtonSelector: "button[data-testid$=\"copy-turn-action-button\"], button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy message\" i]",
        stopButtonSelector: "button[data-testid*=\"stop\" i], button[aria-label*=\"stop\" i]",
        messageTurnSelector: "article, [data-testid^=\"conversation-turn\"]"
      },
      flags: {
        useEnterFallback: false
      }
    },
    claude: {
      siteName: "Claude",
      domain: "claude.ai",
      selectors: {
        inputSelector: "div[contenteditable=\"true\"]",
        sendButtonSelector: "button[aria-label*=\"send\" i], button[data-testid*=\"send\" i], button:has(svg polygon)",
        newChatButtonSelector: "a[href*=\"/new\" i], [data-testid*=\"new-chat\" i]",
        copyButtonSelector: "button[data-testid*=\"copy\" i], button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[data-testid*=\"copy\" i][aria-label*=\"copy\" i], button[aria-label*=\"copy\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.font-claude-message, div[data-testid=\"chat-message\"], div.chat-and-document"
      },
      flags: {
        useEnterFallback: true
      }
    },
    gemini: {
      siteName: "Gemini",
      domain: "gemini.google.com",
      selectors: {
        inputSelector: "div[contenteditable=\"true\"]",
        sendButtonSelector: "button[aria-label*=\"send\" i], button.send-button",
        newChatButtonSelector: "a[href*=\"/app\" i], button.new-chat-button",
        copyButtonSelector: "button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy prompt\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.message-content, div.conversation-turn"
      },
      flags: {
        useEnterFallback: false
      }
    },
    copilot: {
      siteName: "Copilot",
      domain: "copilot.microsoft.com",
      selectors: {
        inputSelector: "textarea, #searchbar",
        sendButtonSelector: "button[aria-label*=\"submit\" i], button[aria-label*=\"send\" i]",
        newChatButtonSelector: "button[aria-label*=\"new\" i]",
        copyButtonSelector: "button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.chat-message, div.message-bubble"
      },
      flags: {
        useEnterFallback: true
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

  return false;
});

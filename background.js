// Import Registries in worker context
if (typeof importScripts === 'function') {
  importScripts('utils/site_profiles_registry.js');
  importScripts('utils/skills_registry.js', 'utils/styles_registry.js', 'utils/library.js');
  importScripts('utils/workflow_prompts.js', 'utils/project_store.js', 'utils/workflow_engine.js');
}

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
chromeAPI.runtime.onInstalled.addListener(async () => {
  console.log("Workspace Manager Extension Installed.");
  runStartupTabScan();
  
  const defaultProfiles = {
    chatgpt: {
      siteName: "ChatGPT",
      domain: "chatgpt.com",
      newChatUrl: "https://chatgpt.com/",
      selectors: {
        inputSelector: "#prompt-textarea, div.ProseMirror[contenteditable=\"true\"]",
        sendButtonSelector: "button[data-testid*=\"send\" i], button[aria-label*=\"send\" i]",
        newChatButtonSelector: "a[href=\"/\"], button[aria-label*=\"new chat\" i]",
        copyButtonSelector: "button[data-testid$=\"copy-turn-action-button\"], button[aria-label=\"Copy\"]",
        userCopyButtonSelector: "button[aria-label*=\"copy message\" i]",
        stopButtonSelector: "button[data-testid*=\"stop-button\" i], button[aria-label*=\"stop generating\" i], button[aria-label=\"Stop\"]",
        messageTurnSelector: "article, [data-testid^=\"conversation-turn\"], [data-turn-key]"
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
        userCopyButtonSelector: "div.items-end button[data-testid=\"action-bar-copy\"], div.items-end button[aria-label*=\"copy\" i]",
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
        temporaryChatButtonSelector: "button[aria-label=\"Temporary chat\"]",
        copyButtonSelector: "button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy prompt\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "response-container, .response-container, .query-container, message-content, div.conversation-turn"
      },
      flags: {
        useEnterFallback: true,
        postSubmitDelayMs: 0
      }
    },
    copilot: {
      siteName: "Copilot",
      domain: "copilot.com",
      domainAliases: ["copilot.microsoft.com"],
      newChatUrl: "https://copilot.com/",
      selectors: {
        inputSelector: "textarea, #searchbar",
        sendButtonSelector: "button[aria-label*=\"submit\" i], button[aria-label*=\"send\" i]",
        newChatButtonSelector: "button[aria-label*=\"new\" i]",
        copyButtonSelector: ".group\\/ai-message button[aria-label*=\"copy\" i], [data-testid=\"ai-message\" i] button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: ".group\\/user-message button[aria-label*=\"copy\" i], [data-testid=\"user-message\" i] button[aria-label*=\"copy\" i]",
        stopButtonSelector: "button[data-testid*=\"stop\" i], button[aria-label*=\"interrupt\" i], button#stop-responding-button, button[id*=\"stop\" i], button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.chat-message, div.message-bubble, div.group\\/ai-message, div.group\\/user-message, [data-testid=\"ai-message\" i], [data-testid=\"user-message\" i]"
      },
      flags: {
        useEnterFallback: true,
        postSubmitDelayMs: 0
      }
    }
  };

  // Seed storage.local with default preferredMode and siteProfiles
  // Keep the user's saved window/panel choice; v0.6 moves the prompt pop-up key from "@" (which the chat sites
  // use for their own menus) to ";;" once
  // v0.7 makes the side panel the default and switches existing installs to it once
  const stored = await chromeAPI.storage.local.get(['preferredMode', 'triggerMigratedV06', 'panelDefaultV07']);
  const seed = { siteProfiles: defaultProfiles };
  if (!stored.preferredMode || !stored.panelDefaultV07) {
    seed.preferredMode = 'panel';
    seed.panelDefaultV07 = true;
  }
  if (!stored.triggerMigratedV06) {
    seed.autocompleteTriggerChar = ';;';
    seed.triggerMigratedV06 = true;
  }
  chromeAPI.storage.local.set(seed);

  // For Chrome: Configure default behavior for the side panel API if available
  if (chromeAPI.sidePanel && typeof chromeAPI.sidePanel.setPanelBehavior === 'function') {
    // We don't want the side panel to open on action click by default, 
    // because we default to a detached window.
    chromeAPI.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      .catch((error) => console.error("Error setting panel behavior:", error));
  }
});

// Listen to the toolbar extension icon click
// Cached so the click handler can open the side panel without an await (sidePanel.open needs the user gesture)
let preferredModeCache = 'panel';
chromeAPI.storage.local.get(['preferredMode']).then(data => { preferredModeCache = data.preferredMode || 'panel'; });
chromeAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.preferredMode) preferredModeCache = changes.preferredMode.newValue || 'panel';
});

chromeAPI.action.onClicked.addListener((tab) => {
  if (preferredModeCache === 'panel') {
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

// Messages that drive chat tabs may come from extension pages, or from the local dev harness page when the
// "Dev harness" setting is on. Any other web page is refused.
const PRIVILEGED_ACTIONS = /^(bridgeCommand|switchTab|wf_)/;
const HARNESS_ORIGINS = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

async function isAllowedSender(sender) {
  if (!sender.url || sender.url.startsWith(chromeAPI.runtime.getURL(''))) return true;
  if (!HARNESS_ORIGINS.test(sender.url)) return false;
  const { devHarness } = await chromeAPI.storage.local.get(['devHarness']);
  return devHarness === true;
}

if (typeof WorkflowEngine !== 'undefined') WorkflowEngine.recoverInterrupted().catch(() => {});

// Message Bus Dispatcher
chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  if (message.action && PRIVILEGED_ACTIONS.test(message.action) && sender.tab && !sender.url?.startsWith(chromeAPI.runtime.getURL(''))) {
    isAllowedSender(sender).then(ok => {
      if (!ok) return sendResponse({ status: "error", error: "Not allowed from this page" });
      if (!WorkflowEngine.handleMessage(message, sendResponse) && message.action === 'bridgeCommand') {
        const { tabId, command, payload } = message.payload;
        ensureContentScript(tabId)
          .then(() => chromeAPI.tabs.sendMessage(tabId, { action: `bridge_${command}`, payload }))
          .then(res => sendResponse(res))
          .catch(err => sendResponse({ status: "error", error: err.message }));
      } else if (message.action === 'switchTab') {
        sendResponse({ status: "error", error: "Not available from the harness" });
      }
    });
    return true;
  }

  if (typeof WorkflowEngine !== 'undefined' && WorkflowEngine.handleMessage(message, sendResponse)) {
    return true;
  }

  // What the ";;" picker can insert here (Prompts, Styles, Memory); read-only, used by chat-site content scripts
  if (message.action === 'library_query') {
    (async () => {
      await SkillsRegistry.load();
      const styles = await StylesStore.list();
      const choice = await StylesStore.getChoice('site');
      const projects = await self.ProjectStore.list();
      const items = Library.query({ skills: SkillsRegistry.skills, styles, projects }, message.context || { surface: 'site' }, message.text, message.group);
      sendResponse({ items, styles, choice });
    })().catch(err => sendResponse({ items: [], error: err.message }));
    return true;
  }

  // v0.6 name, kept for one release
  if (message.action === 'querySkills') {
    if (typeof SkillsRegistry !== 'undefined') {
      SkillsRegistry.load().then(() => {
        const matches = SkillsRegistry.getMatchingSkills(message.prefix, 6);
        sendResponse({ matches });
      }).catch(err => {
        console.error("Failed to query skills in background:", err);
        sendResponse({ matches: [] });
      });
    } else {
      sendResponse({ matches: [] });
    }
    return true; // asynchronous response
  }
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
    if (sender && sender.tab) {
      message.payload = message.payload || {};
      message.payload.tabId = sender.tab.id;
      notifyIfAnswerReady(sender.tab, message.payload.state);
    }
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
    files: ["bridge.js", "utils/styles_registry.js", "utils/library.js", "utils/picker_core.js", "utils/autocomplete.js", "content.js"]
  });
  await chromeAPI.scripting.executeScript({
    target: { tabId },
    files: ["main_world.js"],
    world: 'MAIN'
  });
  console.log(`[Background] Dynamically injected content scripts into tab ${tabId}.`);
  return true;
}

// "Answer ready" notifications: when a watched tab goes from working to done while the user is not
// looking at it, show a system notification; clicking it focuses that tab.
const lastGenerationState = new Map(); // tabId -> last observed state

async function notifyIfAnswerReady(tab, state) {
  const previous = lastGenerationState.get(tab.id);
  lastGenerationState.set(tab.id, state);
  if (previous !== 'working' || state !== 'complete') return;
  if (!chromeAPI.notifications) return;

  const { notifyWhenDone } = await chromeAPI.storage.local.get(['notifyWhenDone']);
  if (notifyWhenDone === false) return;

  // Skip if the tab is in front of the user right now
  try {
    const win = await chromeAPI.windows.get(tab.windowId);
    if (tab.active && win.focused) return;
  } catch (e) { /* window gone; notify anyway */ }

  let site = "Chatbot";
  try { site = new URL(tab.url).hostname.replace(/^www\./, ''); } catch (e) {}
  chromeAPI.notifications.create(`answer-ready-${tab.id}-${Date.now()}`, {
    type: 'basic',
    iconUrl: chromeAPI.runtime.getURL('icons/icon-128.png'),
    title: 'Answer ready',
    message: `${tab.title || site} finished responding.`,
    contextMessage: site
  });
}

chromeAPI.tabs.onRemoved.addListener((tabId) => lastGenerationState.delete(tabId));

if (chromeAPI.notifications) {
  chromeAPI.notifications.onClicked.addListener((notificationId) => {
    const match = /^answer-ready-(\d+)-/.exec(notificationId);
    if (!match) return;
    const tabId = parseInt(match[1], 10);
    chromeAPI.tabs.update(tabId, { active: true }, (tab) => {
      if (!chromeAPI.runtime.lastError && tab) chromeAPI.windows.update(tab.windowId, { focused: true });
    });
    chromeAPI.notifications.clear(notificationId);
  });
}

// Workspace Manager - UI Controller
// Handles tab navigation, presentation mode, and settings persistence

const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await setupViewMode();
  await queryInitialTabStates();
  initializeModules();
});

// 1. Sidebar Tab Navigation Logic
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const moduleViews = document.querySelectorAll('.module-view');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      
      // Deactivate current active states
      navItems.forEach(nav => nav.classList.remove('active'));
      moduleViews.forEach(view => view.classList.remove('active'));

      // Activate new states
      item.classList.add('active');
      const targetView = document.getElementById(`view-${targetId}`);
      if (targetView) {
        targetView.classList.add('active');
      }
    });
  });
}

// 2. View Mode Control (Detached Window vs Side Panel)
async function setupViewMode() {
  const body = document.body;
  const btnWindow = document.getElementById('btn-mode-window');
  const btnPanel = document.getElementById('btn-mode-panel');
  const btnDockHere = document.getElementById('btn-dock-here');

  // Check URL query parameters first (e.g. ?mode=window)
  const urlParams = new URLSearchParams(window.location.search);
  let mode = urlParams.get('mode');

  if (!mode) {
    // If not in query params, fallback to local storage
    if (chromeAPI && chromeAPI.storage && chromeAPI.storage.local) {
      try {
        const data = await chromeAPI.storage.local.get(['preferredMode']);
        mode = data.preferredMode || 'window';
      } catch (err) {
        console.warn("Could not read preferredMode from local storage:", err);
        mode = 'window';
      }
    } else {
      mode = 'window';
    }
  }

  updateUIForMode(mode);

  // Bind click listeners to view mode selector buttons
  if (btnWindow && btnPanel) {
    btnWindow.addEventListener('click', () => {
      switchViewMode('window');
    });

    btnPanel.addEventListener('click', () => {
      switchViewMode('panel');
    });
  }

  // Bind click listener for the entire detached placeholder screen to dock back to Side Panel
  const detachedPlaceholder = document.getElementById('detached-placeholder');
  if (detachedPlaceholder) {
    detachedPlaceholder.addEventListener('click', () => {
      // Send a message to background script to close the detached popup window
      if (chromeAPI && chromeAPI.runtime && chromeAPI.runtime.sendMessage) {
        chromeAPI.runtime.sendMessage({ action: 'closeDetached' });
      }
      switchViewMode('panel');
    });
  }

  // Listen for storage changes to reactively update layout (e.g. when panel is active in background)
  if (chromeAPI && chromeAPI.storage && chromeAPI.storage.onChanged) {
    chromeAPI.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.preferredMode) {
        const newMode = changes.preferredMode.newValue;
        updateUIForMode(newMode);
      }
    });
  }
}

// Update the UI styling to match the current mode
function updateUIForMode(mode) {
  const body = document.body;
  const btnWindow = document.getElementById('btn-mode-window');
  const btnPanel = document.getElementById('btn-mode-panel');

  // Check if this specific instance is running in the detached popup window
  const urlParams = new URLSearchParams(window.location.search);
  const isSelfWindow = urlParams.get('mode') === 'window';

  if (isSelfWindow) {
    // Popup window always shows normal window layout UI
    body.classList.remove('state-detached-placeholder');
    body.classList.remove('mode-panel');
    if (btnWindow) btnWindow.classList.add('active');
    if (btnPanel) btnPanel.classList.remove('active');
  } else {
    // Sidebar panel instance
    if (mode === 'window') {
      // Preference is set to detached window, show placeholder page in sidebar
      body.classList.add('state-detached-placeholder');
      body.classList.remove('mode-panel');
    } else {
      // Preference is set to sidebar, show normal panel UI in sidebar
      body.classList.remove('state-detached-placeholder');
      body.classList.add('mode-panel');
      if (btnWindow) btnWindow.classList.remove('active');
      if (btnPanel) btnPanel.classList.add('active');
    }
  }
}

// Last focused normal browser window, cached so the side panel can be opened synchronously from a click
let lastNormalWindowId = null;
if (chromeAPI && chromeAPI.windows) {
  chromeAPI.windows.getLastFocused({ windowTypes: ['normal'] }).then(win => {
    if (win) lastNormalWindowId = win.id;
  }).catch(() => {});
  chromeAPI.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chromeAPI.windows.WINDOW_ID_NONE) return;
    chromeAPI.windows.get(windowId).then(win => {
      if (win.type === 'normal') lastNormalWindowId = win.id;
    }).catch(() => {});
  });
}

// Persist selection and notify background script to restructure presentation
function switchViewMode(newMode) {
  updateUIForMode(newMode);

  // Chrome: from the detached window, open the side panel directly in this click (user gesture required)
  const inDetachedWindow = window.location.search.includes('mode=window');
  if (newMode === 'panel' && inDetachedWindow && chromeAPI && chromeAPI.sidePanel && lastNormalWindowId !== null) {
    chromeAPI.storage.local.set({ preferredMode: 'panel' });
    chromeAPI.sidePanel.open({ windowId: lastNormalWindowId })
      .then(() => window.close())
      .catch(err => {
        console.error("Could not open the side panel:", err);
        updateUIForMode('window');
        chromeAPI.storage.local.set({ preferredMode: 'window' });
      });
    return;
  }
  
  // Persist locally (asynchronous fire-and-forget to preserve gesture token)
  if (chromeAPI && chromeAPI.storage && chromeAPI.storage.local) {
    chromeAPI.storage.local.set({ preferredMode: newMode }).catch(err => {
      console.warn("Could not write preferredMode to storage:", err);
    });
  }
  
  // Send message to background worker to perform the switch
  if (chromeAPI && chromeAPI.runtime && chromeAPI.runtime.sendMessage) {
    chromeAPI.runtime.sendMessage({
      action: 'switchViewMode',
      payload: { mode: newMode }
    }, (response) => {
      if (chromeAPI.runtime.lastError) {
        console.warn("Message delivery error (probably switching layout tabs):", chromeAPI.runtime.lastError);
      } else {
        console.log("Background switch state response:", response);
      }
    });
  } else {
    console.log("View mode locally updated to:", newMode);
  }

  // Close the window in the initial click handler tick to preserve gesture context
  if (newMode === 'panel') {
    if (window.location.search.includes('mode=window')) {
      window.close();
    }
  }
}

// 3. Module Loader and Debug Mode Gate
function initializeModules() {
  console.log("[Workspace Manager] Initializing modules...");
  
  // v0.6: Context Transfer, Broadcast and Orchestrator are hidden (code kept in ui/modules/)
  const modules = {
    'send': window.SendModule,
    'skills': window.SkillsModule,
    'connection': window.ConnectionModule,
    'debug-test': window.DebugTestModule
  };

  for (const key in modules) {
    const viewContainer = document.getElementById(`view-${key}`);
    const moduleScript = modules[key];
    if (viewContainer && moduleScript && typeof moduleScript.init === 'function') {
      try {
        moduleScript.init(viewContainer);
        console.log(`[Workspace Manager] Initialized module: ${key}`);
      } catch (e) {
        console.error(`[Workspace Manager] Failed to initialize module: ${key}`, e);
      }
    }
  }

  setupDebugModeVisibility();
  setupPopupAutocomplete();
  setupNotificationSetting();
}

function setupNotificationSetting() {
  const checkbox = document.getElementById('checkbox-notify-done');
  if (!checkbox || !chromeAPI || !chromeAPI.storage) return;
  chromeAPI.storage.local.get(['notifyWhenDone'], (data) => {
    checkbox.checked = data.notifyWhenDone !== false;
  });
  checkbox.addEventListener('change', () => {
    chromeAPI.storage.local.set({ notifyWhenDone: checkbox.checked });
  });
}

function setupPopupAutocomplete() {
  const targetIds = ["send-prompt"];
  targetIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && typeof SkillsAutocomplete !== 'undefined') {
      new SkillsAutocomplete(el, {
        onQuery: async (prefix) => {
          if (typeof SkillsRegistry !== 'undefined') {
            await SkillsRegistry.load();
            return SkillsRegistry.getMatchingSkills(prefix, 6);
          }
          return [];
        }
      });
    }
  });
}

function setupDebugModeVisibility() {
  // Debug tools are hidden unless the manager is opened with ?debug (e.g. ui/manager.html?mode=window&debug)
  if (typeof window.__agy_debug_mode === 'undefined') {
    window.__agy_debug_mode = new URLSearchParams(window.location.search).has('debug');
  }

  const debugElements = document.querySelectorAll('.debug-mode-only');
  debugElements.forEach(el => {
    if (window.__agy_debug_mode) {
      el.classList.remove('debug-hidden');
    } else {
      el.classList.add('debug-hidden');
    }
  });
}

// 4. Global Tab States Cache & Synchronization
window.__agy_tab_states = {};

const SUPPORTED_DOMAINS = [
  "chatgpt.com",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "copilot.com"
];

function isSupportedAiTab(tab) {
  if (!tab.url) return false;
  try {
    const url = new URL(tab.url);
    return SUPPORTED_DOMAINS.some(domain => url.hostname.includes(domain));
  } catch (e) {
    return false;
  }
}

async function queryInitialTabStates() {
  if (!chromeAPI || !chromeAPI.tabs) return;
  try {
    const tabs = await chromeAPI.tabs.query({});
    const aiTabs = tabs.filter(isSupportedAiTab);
    for (const tab of aiTabs) {
      chromeAPI.runtime.sendMessage({
        action: "bridgeCommand",
        payload: { tabId: tab.id, command: "scanInitialState" }
      }, (res) => {
        if (res && res.status === "success" && res.state) {
          window.__agy_tab_states[tab.id] = res.state;
          console.log(`[Workspace Manager] Initialized state for Tab ${tab.id}: ${res.state}`);
          document.dispatchEvent(new CustomEvent('agyTabStatesHydrated'));
        }
      });
    }
  } catch (e) {
    console.error("Failed to query initial tab states:", e);
  }
}

// Listen for real-time state changes globally
if (chromeAPI && chromeAPI.runtime && chromeAPI.runtime.onMessage) {
  chromeAPI.runtime.onMessage.addListener((message) => {
    if (message.action === 'bridge_state_change' && message.payload && message.payload.tabId !== undefined && message.payload.tabId !== null) {
      const { tabId, state } = message.payload;
      window.__agy_tab_states[tabId] = state;
      console.log(`[Workspace Manager Global] Tab ${tabId} state changed to: ${state}`);
      document.dispatchEvent(new CustomEvent('agyTabStatesHydrated'));
    }
  });
}

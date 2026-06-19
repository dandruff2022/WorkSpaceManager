// Workspace Manager - UI Controller
// Handles tab navigation, presentation mode, and settings persistence

const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await setupViewMode();
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

// Persist selection and notify background script to restructure presentation
function switchViewMode(newMode) {
  updateUIForMode(newMode);
  
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

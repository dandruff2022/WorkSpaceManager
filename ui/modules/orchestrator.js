// Workspace Manager - Orchestrator Module
// Handles concurrent multi-tab state observation and visual graph node layout placeholders

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  const SUPPORTED_DOMAINS = [
    "chatgpt.com",
    "claude.ai",
    "gemini.google.com",
    "copilot.microsoft.com"
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

  window.OrchestratorModule = {
    init(container) {
      console.log("[OrchestratorModule] Initializing Orchestrator UI...");

      const observersContainer = container.querySelector('#orch-observers-container');
      let observedTabs = new Set();

      function getStatusClass(state) {
        switch (state) {
          case 'newchat': return 'light-newchat';
          case 'working': return 'light-working';
          case 'complete':
          case 'idle': return 'light-complete';
          default: return 'light-inactive';
        }
      }

      function getStatusText(state) {
        switch (state) {
          case 'newchat': return 'New Chat (Empty)';
          case 'working': return 'Generating...';
          case 'complete':
          case 'idle': return 'Observing (Idle)';
          default: return 'Inactive';
        }
      }

      async function initializeTabObservers() {
        if (!chromeAPI || !chromeAPI.tabs) return;
        try {
          const allTabs = await chromeAPI.tabs.query({});
          const aiTabs = allTabs.filter(isSupportedAiTab);

          if (observersContainer) {
            observersContainer.innerHTML = '';
            if (aiTabs.length === 0) {
              observersContainer.innerHTML = '<div style="font-size: 11px; color: var(--text-muted);">No open AI platform tabs found.</div>';
              return;
            }

            aiTabs.forEach(tab => {
              // Create status pill for each tab
              const pill = document.createElement('div');
              pill.id = `orch-observer-tab-${tab.id}`;
              pill.className = 'dbg-status-traffic';
              pill.style.padding = '6px 12px';
              pill.style.border = '1px solid var(--border-color)';
              pill.style.borderRadius = '6px';
              pill.style.background = 'rgba(255,255,255,0.03)';
              pill.style.display = 'flex';
              pill.style.alignItems = 'center';
              pill.style.gap = '8px';

              const dot = document.createElement('div');
              dot.className = 'traffic-light light-inactive';
              dot.id = `orch-light-${tab.id}`;

              const label = document.createElement('span');
              label.id = `orch-text-${tab.id}`;
              label.style.fontSize = '11px';
              label.style.fontWeight = '500';
              label.textContent = `${tab.title.substring(0, 16)}... (ID: ${tab.id}) - Initializing`;

              pill.appendChild(dot);
              pill.appendChild(label);
              observersContainer.appendChild(pill);

              // Register observeGenerationState in the background tab (JIT is handled automatically by background Command forwarder)
              if (!observedTabs.has(tab.id)) {
                observedTabs.add(tab.id);
                chromeAPI.runtime.sendMessage({
                  action: "bridgeCommand",
                  payload: { tabId: tab.id, command: "observeGenerationState" }
                }, (res) => {
                  if (res && res.status === "success") {
                    console.log(`[Orchestrator] MutationObserver registered on tab ${tab.id}`);
                  } else {
                    console.warn(`[Orchestrator] Failed to register MutationObserver on tab ${tab.id}`);
                  }
                });
              }
            });
          }
        } catch (e) {
          console.error("Failed to initialize tab observers in Orchestrator:", e);
        }
      }

      // Initial observer run
      initializeTabObservers();

      // Listen for tab focus/creation/closure events to re-sync
      if (chromeAPI && chromeAPI.tabs) {
        chromeAPI.tabs.onUpdated.addListener(initializeTabObservers);
        chromeAPI.tabs.onRemoved.addListener((tabId) => {
          observedTabs.delete(tabId);
          initializeTabObservers();
        });
        chromeAPI.tabs.onActivated.addListener(initializeTabObservers);
      }

      // Handle real-time state change broadcasts from the background worker
      if (chromeAPI && chromeAPI.runtime && chromeAPI.runtime.onMessage) {
        chromeAPI.runtime.onMessage.addListener((message) => {
          if (message.action === 'bridge_state_change' && message.payload) {
            const { tabId, state } = message.payload;
            console.log(`[Orchestrator] Received state update for Tab ${tabId}: ${state}`);

            const dot = container.querySelector(`#orch-light-${tabId}`);
            const textEl = container.querySelector(`#orch-text-${tabId}`);

            if (dot && textEl) {
              dot.className = `traffic-light ${getStatusClass(state)}`;
              
              // Get clean tab title from DOM element text if available
              const pillLabel = container.querySelector(`#orch-observer-tab-${tabId} span`);
              const titlePart = pillLabel ? pillLabel.textContent.split('...')[0] : 'Tab';
              textEl.textContent = `${titlePart}... (ID: ${tabId}) - ${getStatusText(state)}`;
            }
          }
        });
      }
    }
  };
})();

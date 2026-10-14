// Workspace Manager - Broadcast Module
// Handles concurrent prompt dispatching to multiple tabs with active focus restoring

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

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

  window.BroadcastModule = {
    init(container) {
      console.log("[BroadcastModule] Initializing Broadcast Module UI...");

      const listContainer = container.querySelector('#broadcast-tabs-list');
      const promptInput = container.querySelector('#textarea-broadcast-prompt');
      const submitBtn = container.querySelector('#btn-broadcast-submit');
      const logBox = container.querySelector('#broadcast-log');

      function log(msg, type = "info") {
        const time = new Date().toLocaleTimeString();
        const prefix = type === "error" ? "❌ " : (type === "success" ? "✅ " : "ℹ️ ");
        const text = `[${time}] ${prefix}${msg}\n`;
        if (logBox) {
          if (logBox.innerText === "Select targets and type a prompt to start.") {
            logBox.innerText = "";
          }
          logBox.innerText += text;
          logBox.scrollTop = logBox.scrollHeight;
        }
      }

      async function scanTabs() {
        if (!chromeAPI || !chromeAPI.tabs) return;
        try {
          const allTabs = await chromeAPI.tabs.query({});
          const aiTabs = allTabs.filter(isSupportedAiTab);

          if (listContainer) {
            listContainer.innerHTML = '';
            if (aiTabs.length === 0) {
              listContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 11px; padding: 4px;">No open AI platform tabs found.</div>';
              return;
            }

            aiTabs.forEach(tab => {
              const row = document.createElement('div');
              row.style.display = 'flex';
              row.style.alignItems = 'center';
              row.style.gap = '8px';
              row.style.fontSize = '12px';

              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.value = tab.id;
              checkbox.className = 'broadcast-tab-checkbox';

              const label = document.createElement('label');
              label.textContent = `${tab.title} (ID: ${tab.id})`;
              label.style.cursor = 'pointer';
              label.style.overflow = 'hidden';
              label.style.textOverflow = 'ellipsis';
              label.style.whiteSpace = 'nowrap';
              
              // Toggle checkbox on label click
              label.addEventListener('click', () => { checkbox.checked = !checkbox.checked; });

              row.appendChild(checkbox);
              row.appendChild(label);
              listContainer.appendChild(row);
            });
          }
        } catch (e) {
          console.error("Failed to query tabs for Broadcast:", e);
        }
      }

      // Initial tab scan
      scanTabs();

      // Listen for tab focus/creation events to refresh tab list
      if (chromeAPI && chromeAPI.tabs) {
        chromeAPI.tabs.onUpdated.addListener(scanTabs);
        chromeAPI.tabs.onRemoved.addListener(scanTabs);
        chromeAPI.tabs.onActivated.addListener(scanTabs);
      }

      if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
          const prompt = promptInput ? promptInput.value.trim() : "";
          if (!prompt) {
            log("Error: Please write a prompt first.", "error");
            return;
          }

          const checkboxes = container.querySelectorAll('.broadcast-tab-checkbox:checked');
          const selectedTabIds = Array.from(checkboxes).map(cb => parseInt(cb.value, 10));

          if (selectedTabIds.length === 0) {
            log("Error: No target tabs selected. Check at least one tab.", "error");
            return;
          }

          log(`Initializing Broadcast to ${selectedTabIds.length} target tab(s)...`);

          // 1. Get currently active tab in browser window to restore later
          const [activeTab] = await chromeAPI.tabs.query({ active: true, currentWindow: true });
          const originalTabId = activeTab ? activeTab.id : null;

          try {
            for (let i = 0; i < selectedTabIds.length; i++) {
              const tabId = selectedTabIds[i];
              log(`Targeting Tab ${tabId}...`);

              // A. Switch focus to the tab to bypass background execCommand restrictions
              await chromeAPI.tabs.update(tabId, { active: true });
              // B. Brief delay for browser layout focus hydration
              await new Promise(resolve => setTimeout(resolve, 80));

              // C. Send prompt injection write message (hydrates input state)
              const writeRes = await new Promise((resolve) => {
                chromeAPI.runtime.sendMessage({
                  action: "bridgeCommand",
                  payload: { tabId, command: "writeToInput", payload: { text: prompt } }
                }, resolve);
              });

              if (writeRes && writeRes.status === "success") {
                log(`Tab ${tabId} input hydrated. Triggering submit click...`, "success");
                
                // D. Send clickSend message to submit
                const sendRes = await new Promise((resolve) => {
                  chromeAPI.runtime.sendMessage({
                    action: "bridgeCommand",
                    payload: { tabId, command: "clickSend" }
                  }, resolve);
                });

                if (sendRes && sendRes.status === "success") {
                  log(`Tab ${tabId} broadcast submitted successfully.`, "success");
                } else {
                  log(`Warning: Tab ${tabId} failed to trigger send button.`, "error");
                }
              } else {
                log(`Error: Failed to write prompt text into Tab ${tabId}.`, "error");
              }
            }

            log("All broadcast actions dispatched.", "success");
          } catch (err) {
            log(`Broadcast execution interrupted: ${err.message}`, "error");
          } finally {
            // 2. Restore focus back to original active tab if switched away
            if (originalTabId && !selectedTabIds.includes(originalTabId)) {
              await chromeAPI.tabs.update(originalTabId, { active: true });
            }
          }
        });
      }
    }
  };
})();

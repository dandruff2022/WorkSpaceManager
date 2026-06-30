// Workspace Manager - Context Transfer Module
// Handles copying the last AI response from a Source tab and transferring it to a Target tab

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

  window.ContextTransferModule = {
    init(container) {
      console.log("[ContextTransferModule] Initializing Context Transfer Module UI...");

      const sourceSelect = container.querySelector('#select-transfer-source');
      const targetSelect = container.querySelector('#select-transfer-target');
      const executeBtn = container.querySelector('#btn-transfer-execute');
      const logBox = container.querySelector('#transfer-log');

      function log(msg, type = "info") {
        const time = new Date().toLocaleTimeString();
        const prefix = type === "error" ? "❌ " : (type === "success" ? "✅ " : "ℹ️ ");
        const text = `[${time}] ${prefix}${msg}\n`;
        if (logBox) {
          if (logBox.innerText === "Select tabs and click Execute.") {
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

          const populateSelect = (selectEl, defaultText) => {
            if (!selectEl) return;
            const currentValue = selectEl.value;
            selectEl.innerHTML = `<option value="">${defaultText}</option>`;
            
            aiTabs.forEach(tab => {
              const option = document.createElement('option');
              option.value = tab.id;
              option.textContent = `${tab.title} (ID: ${tab.id})`;
              selectEl.appendChild(option);
            });

            // Maintain previously selected value if still valid
            if (currentValue && aiTabs.some(t => t.id === parseInt(currentValue, 10))) {
              selectEl.value = currentValue;
            }
          };

          populateSelect(sourceSelect, "Select source chat...");
          populateSelect(targetSelect, "Select target chat...");
        } catch (e) {
          console.error("Failed to query tabs for Context Transfer:", e);
        }
      }

      // Initial tab scan
      scanTabs();

      // Listen for tab focus/creation events to refresh dropdowns
      if (chromeAPI && chromeAPI.tabs) {
        chromeAPI.tabs.onUpdated.addListener(scanTabs);
        chromeAPI.tabs.onRemoved.addListener(scanTabs);
        chromeAPI.tabs.onActivated.addListener(scanTabs);
      }

      if (executeBtn) {
        executeBtn.addEventListener('click', async () => {
          const sourceId = sourceSelect ? parseInt(sourceSelect.value, 10) : NaN;
          const targetId = targetSelect ? parseInt(targetSelect.value, 10) : NaN;

          if (isNaN(sourceId) || isNaN(targetId)) {
            log("Error: Please select both a Source and a Target tab.", "error");
            return;
          }

          if (sourceId === targetId) {
            log("Error: Source and Target tabs cannot be the same.", "error");
            return;
          }

          log(`Initializing Context Migration from Tab ${sourceId} to Tab ${targetId}...`);

          // 1. Get currently active tab in browser window to restore later
          const [activeTab] = await chromeAPI.tabs.query({ active: true, currentWindow: true });
          const originalTabId = activeTab ? activeTab.id : null;

          try {
            // A. Switch focus to the SOURCE tab to scan buttons and copy
            log(`Activating Source Tab ${sourceId}...`);
            await chromeAPI.tabs.update(sourceId, { active: true });
            await new Promise(resolve => setTimeout(resolve, 80));

            // B. Scan copy buttons
            log("Scanning copy buttons in source chat...");
            const listRes = await new Promise((resolve) => {
              chromeAPI.runtime.sendMessage({
                action: "bridgeCommand",
                payload: { tabId: sourceId, command: "getCopyButtonsList" }
              }, resolve);
            });

            if (!listRes || listRes.status !== "success" || !listRes.list || listRes.list.length === 0) {
              log("Error: No message responses found in the source tab.", "error");
              return;
            }

            const aiButtons = listRes.list.filter(btn => btn.type === "ai");
            if (aiButtons.length === 0) {
              log("Error: No AI responses found in the source tab to copy.", "error");
              return;
            }

            // C. Copy the last AI response (the final AI button index in the page-wide list)
            const targetBtn = aiButtons[aiButtons.length - 1];
            log(`Copying final AI response (Page Button Index: ${targetBtn.index})...`);

            const copyRes = await new Promise((resolve) => {
              chromeAPI.runtime.sendMessage({
                action: "bridgeCommand",
                payload: { tabId: sourceId, command: "clickCopyButton", payload: { type: "ai", index: targetBtn.index } }
              }, resolve);
            });

            if (!copyRes || copyRes.status !== "success" || !copyRes.text) {
              log("Error: Failed to copy the last AI response text.", "error");
              return;
            }

            const copiedText = copyRes.text;
            log(`Copied ${copiedText.length} characters successfully.`, "success");

            // D. Switch focus to the TARGET tab to write text
            log(`Activating Target Tab ${targetId}...`);
            await chromeAPI.tabs.update(targetId, { active: true });
            await new Promise(resolve => setTimeout(resolve, 80));

            // E. Hydrate the prompt input of target tab
            log("Hydrating prompt input in target tab...");
            const writeRes = await new Promise((resolve) => {
              chromeAPI.runtime.sendMessage({
                action: "bridgeCommand",
                payload: { tabId: targetId, command: "writeToInput", payload: { text: copiedText } }
              }, resolve);
            });

            if (writeRes && writeRes.status === "success") {
              log("Context transfer completed successfully.", "success");
            } else {
              log("Error: Failed to write copied text into the target tab input.", "error");
            }

          } catch (err) {
            log(`Context transfer interrupted: ${err.message}`, "error");
          } finally {
            // 2. Restore focus back to original active tab if switched away
            if (originalTabId && originalTabId !== targetId) {
              await chromeAPI.tabs.update(originalTabId, { active: true });
            }
          }
        });
      }
    }
  };
})();

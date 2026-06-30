// Workspace Manager - Context Transfer Module
// Handles copying the last AI response from a Complete source tab and transferring it to an Empty target tab

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
      const promptTextarea = container.querySelector('#textarea-transfer-prompt');
      const logBox = container.querySelector('#transfer-log');

      function log(msg, type = "info") {
        const time = new Date().toLocaleTimeString();
        const prefix = type === "error" ? "❌ " : (type === "success" ? "✅ " : "ℹ️ ");
        const text = `[${time}] ${prefix}${msg}\n`;
        if (logBox) {
          if (logBox.innerText === "Select valid tabs and click the paper plane to Execute.") {
            logBox.innerText = "";
          }
          logBox.innerText += text;
          logBox.scrollTop = logBox.scrollHeight;
        }
      }

      // 1. Hydrate and Persist Transfer Prompt Text
      if (promptTextarea && chromeAPI && chromeAPI.storage && chromeAPI.storage.local) {
        chromeAPI.storage.local.get(['transferPromptText'], (data) => {
          promptTextarea.value = data.transferPromptText || "Here is the previous conversation context:";
        });

        promptTextarea.addEventListener('input', () => {
          chromeAPI.storage.local.set({ transferPromptText: promptTextarea.value });
        });
      }

      // Update button visual state based on selection validity
      function updateButtonState() {
        if (!executeBtn) return;
        const sourceVal = sourceSelect ? sourceSelect.value : "";
        const targetVal = targetSelect ? targetSelect.value : "";

        if (sourceVal && targetVal && sourceVal !== targetVal) {
          executeBtn.disabled = false;
          executeBtn.style.color = "var(--accent-indigo, #6366f1)";
          executeBtn.style.borderColor = "var(--accent-indigo, #6366f1)";
          executeBtn.style.background = "rgba(99, 102, 241, 0.15)";
          executeBtn.style.cursor = "pointer";
        } else {
          executeBtn.disabled = true;
          executeBtn.style.color = "#64748b";
          executeBtn.style.borderColor = "var(--border-color)";
          executeBtn.style.background = "rgba(255,255,255,0.03)";
          executeBtn.style.cursor = "not-allowed";
        }
      }

      async function scanTabs() {
        if (!chromeAPI || !chromeAPI.tabs) return;
        try {
          const allTabs = await chromeAPI.tabs.query({});
          const aiTabs = allTabs.filter(isSupportedAiTab);
          const tabStates = window.__agy_tab_states || {};

          console.log("[ContextTransferModule] Scanning tabs with states cache:", tabStates);

          const populateSelect = (selectEl, defaultText, filterFn) => {
            if (!selectEl) return;
            const currentValue = selectEl.value;
            selectEl.innerHTML = `<option value="">${defaultText}</option>`;
            
            aiTabs.forEach(tab => {
              const tabState = tabStates[tab.id] || "empty"; // default to empty if unknown
              if (filterFn(tabState)) {
                const option = document.createElement('option');
                option.value = tab.id;
                option.textContent = `${tab.title.substring(0, 16)}... (ID: ${tab.id})`;
                selectEl.appendChild(option);
              }
            });

            // Maintain previously selected value if still present in selection list
            const hasOption = Array.from(selectEl.options).some(opt => opt.value === currentValue);
            if (currentValue && hasOption) {
              selectEl.value = currentValue;
            } else {
              selectEl.value = "";
            }
          };

          // FROM can only be populated from "complete" tabs
          populateSelect(sourceSelect, "Select complete source...", (state) => state === "complete");

          // TO can only be populated from "empty" or "newchat" tabs
          populateSelect(targetSelect, "Select empty target...", (state) => state === "empty" || state === "newchat");

          updateButtonState();
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

      // Listen for global tab state cache hydration events to reactively rebuild dropdowns
      document.addEventListener('agyTabStatesHydrated', scanTabs);

      if (sourceSelect) sourceSelect.addEventListener('change', updateButtonState);
      if (targetSelect) targetSelect.addEventListener('change', updateButtonState);

      if (executeBtn) {
        executeBtn.addEventListener('click', async () => {
          const sourceId = sourceSelect ? parseInt(sourceSelect.value, 10) : NaN;
          const targetId = targetSelect ? parseInt(targetSelect.value, 10) : NaN;

          if (isNaN(sourceId) || isNaN(targetId)) {
            log("Error: Select a Complete source and an Empty target tab first.", "error");
            return;
          }

          const prefixPrompt = promptTextarea ? promptTextarea.value.trim() : "";
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

            const turnsList = listRes.list;
            log(`Found ${turnsList.length} total message turns to migrate...`);

            let consolidatedText = prefixPrompt ? `${prefixPrompt}\n\n` : "";

            for (let i = 0; i < turnsList.length; i++) {
              const turn = turnsList[i];
              log(`Copying Turn ${i + 1}/${turnsList.length} (Type: ${turn.type})...`);

              const copyRes = await new Promise((resolve) => {
                chromeAPI.runtime.sendMessage({
                  action: "bridgeCommand",
                  payload: { tabId: sourceId, command: "clickCopyButton", payload: { type: turn.type, index: turn.index } }
                }, resolve);
              });

              if (copyRes && copyRes.status === "success" && copyRes.text) {
                const prefix = turn.type === "user" ? "user said:\n" : "ai responsed:\n";
                consolidatedText += `${prefix}${copyRes.text}\n`;
              } else {
                log(`Warning: Failed to copy turn ${i + 1}`, "error");
              }

              // Pause 100ms between program clicks to avoid clipboard locks
              await new Promise(r => setTimeout(r, 100));
            }

            log(`Reconstructed conversation history successfully (${consolidatedText.length} chars).`, "success");

            // D. Switch focus to the TARGET tab to write text
            log(`Activating Target Tab ${targetId}...`);
            await chromeAPI.tabs.update(targetId, { active: true });
            await new Promise(resolve => setTimeout(resolve, 80));

            // E. Hydrate the prompt input of target tab
            log("Hydrating prompt input in target tab...");
            const writeRes = await new Promise((resolve) => {
              chromeAPI.runtime.sendMessage({
                action: "bridgeCommand",
                payload: { tabId: targetId, command: "writeToInput", payload: { text: consolidatedText } }
              }, resolve);
            });

            if (writeRes && writeRes.status === "success") {
              log("Input hydrated. Submitting prompt...", "success");

              // F. Send clickSend message to submit in target tab
              const sendRes = await new Promise((resolve) => {
                chromeAPI.runtime.sendMessage({
                  action: "bridgeCommand",
                  payload: { tabId: targetId, command: "clickSend" }
                }, resolve);
              });

              if (sendRes && sendRes.status === "success") {
                log("Context transfer completed and sent successfully.", "success");
              } else {
                log("Warning: Failed to trigger submit in target tab.", "error");
              }
            } else {
              log("Error: Failed to write copied text into target tab input.", "error");
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

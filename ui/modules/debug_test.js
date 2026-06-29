// Workspace Manager - Debug Test Module UI Handler
// Connects the interactive Debug Suite view to the bridge.js content script and background messaging bus

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;
  let activeTabId = null;
  let activeObserverRunning = false;

  window.DebugTestModule = {
    init(container) {
      console.log("[DebugTestModule] Initializing Debug Test Panel...");
      if (!container) return;

      const logOutput = container.querySelector('#debug-log-output');

      // Helper to append logs to console area
      function log(text, type = 'info') {
        const div = document.createElement('div');
        div.className = `console-log-entry console-log-${type}`;
        div.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        logOutput.appendChild(div);
        logOutput.scrollTop = logOutput.scrollHeight;
      }

      function clearLogs() {
        logOutput.innerHTML = '';
        log("Console logs cleared. Ready.");
      }

      // Visual Helper: set status badge style and text
      function setStatus(selector, text, type) {
        const badge = container.querySelector(selector);
        if (badge) {
          badge.textContent = text;
          badge.className = `dbg-status-badge ${type}`;
        }
      }

      // Visual Helper: update traffic light indicator
      function setTrafficLight(state) {
        const light = container.querySelector('#dbg-traffic-light');
        const textEl = container.querySelector('#dbg-traffic-text');
        if (!light || !textEl) return;

        if (state === 'inactive') {
          light.className = 'traffic-light light-inactive';
          textEl.textContent = 'Inactive';
        } else if (state === 'idle' || state === 'complete') {
          light.className = 'traffic-light light-complete';
          textEl.textContent = 'Observing (Idle)';
        } else if (state === 'working' || state === 'generating') {
          light.className = 'traffic-light light-working';
          textEl.textContent = 'Generating...';
        } else if (state === 'newchat') {
          light.className = 'traffic-light light-newchat';
          textEl.textContent = 'New Chat (Empty)';
        }
      }

      // Visual Helper: update code preview box
      function showPreview(selector, text, isError = false) {
        const preview = container.querySelector(selector);
        if (preview) {
          preview.textContent = text;
          preview.classList.remove('dbg-hidden');
          if (isError) {
            preview.style.color = 'var(--accent-rose)';
            preview.style.borderColor = 'rgba(244, 63, 94, 0.3)';
          } else {
            preview.style.color = '#38bdf8';
            preview.style.borderColor = 'var(--border-color)';
          }
        }
      }

      // Query active target tab
      async function resolveTargetTab() {
        return new Promise((resolve) => {
          chromeAPI.tabs.query({ active: true, currentWindow: false }, (tabs) => {
            const normalTabs = (tabs || []).filter(t => t.url && !t.url.includes("manager.html"));
            if (normalTabs.length > 0) {
              activeTabId = normalTabs[0].id;
              resolve(normalTabs[0]);
            } else {
              chromeAPI.tabs.query({ active: true }, (allActive) => {
                const target = (allActive || []).find(t => t.url && !t.url.includes("manager.html"));
                if (target) {
                  activeTabId = target.id;
                  resolve(target);
                } else {
                  resolve(null);
                }
              });
            }
          });
        });
      }

      // Wrapper to send bridge commands via background script
      async function runBridgeCommand(command, payload = {}) {
        const tab = await resolveTargetTab();
        if (!tab) {
          log("Error: No active AI target tab located. Focus a ChatGPT/Claude/Gemini tab first.", "error");
          return null;
        }

        log(`Routing command "${command}" to target tab ${tab.id} ("${tab.title}")...`);
        return new Promise((resolve) => {
          chromeAPI.runtime.sendMessage({
            action: "bridgeCommand",
            payload: { tabId: tab.id, command, payload }
          }, (res) => {
            if (chromeAPI.runtime.lastError) {
              log(`Dispatcher Error: ${chromeAPI.runtime.lastError.message}`, "error");
              resolve(null);
            } else if (res && res.status === "error") {
              log(`Bridge Execution Error: ${res.error}`, "error");
              resolve(res);
            } else {
              resolve(res);
            }
          });
        });
      }

      // Bind Clear Log Button
      const btnClear = container.querySelector('#btn-dbg-clear-logs');
      if (btnClear) btnClear.addEventListener('click', clearLogs);

      // Bind Copy Logs Button
      const btnCopyLogs = container.querySelector('#btn-dbg-copy-logs');
      if (btnCopyLogs) {
        btnCopyLogs.addEventListener('click', () => {
          const entries = Array.from(logOutput.querySelectorAll('.console-log-entry'))
            .map(el => el.textContent)
            .join('\n');
          navigator.clipboard.writeText(entries || logOutput.textContent).then(() => {
            const oldText = btnCopyLogs.textContent;
            btnCopyLogs.textContent = "Copied!";
            setTimeout(() => { btnCopyLogs.textContent = oldText; }, 1000);
          });
        });
      }

      // ================= PART A: Website Test (DOM Automation) =================
      
      // Ping Handshake
      const btnPing = container.querySelector('#btn-dbg-ping');
      if (btnPing) {
        btnPing.addEventListener('click', async () => {
          setStatus('#dbg-ping-status', 'Connecting...', 'working');
          const res = await runBridgeCommand("ping");
          if (res && res.status === "pong") {
            log(`✓ Ping handshake successful. Connected to: ${res.url}`, "success");
            setStatus('#dbg-ping-status', '✓ Connected', 'success');
          } else {
            log("✗ Ping handshake failed.", "error");
            setStatus('#dbg-ping-status', '✗ Failed', 'error');
          }
        });
      }

      // Write Input
      const btnWrite = container.querySelector('#btn-dbg-write');
      const inputText = container.querySelector('#input-dbg-text');
      if (btnWrite && inputText) {
        btnWrite.addEventListener('click', async () => {
          setStatus('#dbg-write-status', 'Writing...', 'working');
          const text = inputText.value || "Hello from Workspace Manager Bridge!";
          const res = await runBridgeCommand("writeToInput", { text });
          if (res && res.status === "success") {
            log(`✓ Hydrated input field with text: "${text}"`, "success");
            setStatus('#dbg-write-status', '✓ Success', 'success');
          } else {
            log("✗ Input hydration failed.", "error");
            setStatus('#dbg-write-status', '✗ Failed', 'error');
          }
        });
      }

      // Submit Trigger
      const btnSend = container.querySelector('#btn-dbg-send');
      if (btnSend) {
        btnSend.addEventListener('click', async () => {
          setStatus('#dbg-send-status', 'Sending...', 'working');
          const res = await runBridgeCommand("clickSend");
          if (res && res.status === "success") {
            log("✓ Submission triggered.", "success");
            setStatus('#dbg-send-status', '✓ Dispatched', 'success');
          } else {
            log("✗ Submission dispatcher failed.", "error");
            setStatus('#dbg-send-status', '✗ Failed', 'error');
          }
        });
      }

      // Generation Monitoring
      const btnObserve = container.querySelector('#btn-dbg-observe');
      if (btnObserve) {
        btnObserve.addEventListener('click', async () => {
          setTrafficLight('inactive');
          const res = await runBridgeCommand("observeGenerationState");
          if (res && res.status === "success") {
            activeObserverRunning = true;
            log("✓ observeGenerationState registered. MutationObserver active.", "success");
            setTrafficLight('idle');
          } else {
            log("✗ Failed to set up state observation.", "error");
            setTrafficLight('inactive');
          }
        });
      }

      // Scan Copy Buttons
      const btnScanButtons = container.querySelector('#btn-dbg-scan-buttons');
      const selectCopyButton = container.querySelector('#select-dbg-copy-button');
      if (btnScanButtons && selectCopyButton) {
        btnScanButtons.addEventListener('click', async () => {
          log("Scanning active tab for copy buttons...");
          const res = await runBridgeCommand("getCopyButtonsList");
          if (res && res.status === "success" && res.list) {
            selectCopyButton.innerHTML = '';
            if (res.list.length === 0) {
              const opt = document.createElement('option');
              opt.value = '';
              opt.textContent = 'No copy buttons found.';
              selectCopyButton.appendChild(opt);
              log("Scan complete. 0 copy buttons found.", "working");
            } else {
              res.list.forEach(btnInfo => {
                const opt = document.createElement('option');
                opt.value = `${btnInfo.type}:${btnInfo.index}`;
                opt.textContent = btnInfo.label;
                selectCopyButton.appendChild(opt);
              });
              log(`Scan complete. Found ${res.list.length} copy buttons.`, "success");
            }
          } else {
            log("✗ Scan failed or no tab connected. Trigger Ping Handshake first.", "error");
          }
        });
      }

      // Copy Turn
      const btnCopy = container.querySelector('#btn-dbg-copy');
      if (btnCopy && selectCopyButton) {
        btnCopy.addEventListener('click', async () => {
          const val = selectCopyButton.value;
          if (!val) {
            log("Error: Scan page and select a valid copy button first.", "error");
            showPreview('#dbg-copy-preview', "Error: Select a button from dropdown first.", true);
            return;
          }
          const [type, idxStr] = val.split(':');
          const index = parseInt(idxStr, 10);
          log(`Clicking copy button of type "${type}" at index ${index}...`);
          
          showPreview('#dbg-copy-preview', 'Awaiting copy capture event...');
          const res = await runBridgeCommand("clickCopyButton", { type, index });
          if (res && res.status === "success" && res.text) {
            log(`✓ Copy captured successfully!`, "success");
            showPreview('#dbg-copy-preview', res.text);
          } else {
            log("✗ Copy capture failed.", "error");
            showPreview('#dbg-copy-preview', `Copy failed. ${res?.error || "Interception timeout."}`, true);
          }
        });
      }

      // Reset Tab
      const btnReset = container.querySelector('#btn-dbg-reset');
      if (btnReset) {
        btnReset.addEventListener('click', async () => {
          setStatus('#dbg-reset-status', 'Resetting...', 'working');
          const res = await runBridgeCommand("clickNewChat");
          if (res && res.status === "success") {
            log("✓ New Chat reset triggered.", "success");
            setStatus('#dbg-reset-status', '✓ Reset', 'success');
          } else {
            log("✗ New Chat reset action failed.", "error");
            setStatus('#dbg-reset-status', '✗ Failed', 'error');
          }
        });
      }

      // ================= PART B: Browser Test (Background APIs) =================

      // Fetch Active Tabs
      const btnFetchTabs = container.querySelector('#btn-dbg-fetch-tabs');
      if (btnFetchTabs) {
        btnFetchTabs.addEventListener('click', () => {
          showPreview('#dbg-tabs-status', 'Fetching tabs registry data...');
          chromeAPI.runtime.sendMessage({ action: 'getTestTrackerLogs' }, (res) => {
            if (chromeAPI.runtime.lastError) {
              log(`Background messaging failed: ${chromeAPI.runtime.lastError.message}`, "error");
              showPreview('#dbg-tabs-status', `Error: ${chromeAPI.runtime.lastError.message}`, true);
            } else {
              log("✓ Background active tabs successfully queried.", "success");
              showPreview('#dbg-tabs-status', JSON.stringify(res, null, 2));
            }
          });
        });
      }

      // Scan Browser Tabs
      const btnScanTabs = container.querySelector('#btn-dbg-scan-tabs');
      const selectSwitchTab = container.querySelector('#select-dbg-switch-tab');
      if (btnScanTabs && selectSwitchTab) {
        btnScanTabs.addEventListener('click', () => {
          log("Scanning browser tabs...");
          chromeAPI.tabs.query({}, (tabs) => {
            selectSwitchTab.innerHTML = '';
            const normalTabs = (tabs || []).filter(t => t.url && !t.url.includes("manager.html"));
            if (normalTabs.length === 0) {
              const opt = document.createElement('option');
              opt.value = '';
              opt.textContent = 'No normal tabs found.';
              selectSwitchTab.appendChild(opt);
              log("Scan complete. 0 normal tabs found.", "working");
            } else {
              normalTabs.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.title || t.url} (ID: ${t.id})`;
                selectSwitchTab.appendChild(opt);
              });
              log(`Scan complete. Found ${normalTabs.length} tabs.`, "success");
            }
          });
        });
      }

      // Switch Focus
      const btnSwitchTab = container.querySelector('#btn-dbg-switch-tab');
      if (btnSwitchTab && selectSwitchTab) {
        btnSwitchTab.addEventListener('click', () => {
          const val = selectSwitchTab.value;
          if (!val) {
            setStatus('#dbg-switch-status', '✗ Select Tab', 'error');
            return;
          }
          const tabId = parseInt(val, 10);
          setStatus('#dbg-switch-status', 'Switching...', 'working');
          chromeAPI.runtime.sendMessage({
            action: 'switchTab',
            payload: { tabId }
          }, (res) => {
            if (res && res.status === "success") {
              log(`✓ Focus successfully switched to Tab ID ${tabId}.`, "success");
              setStatus('#dbg-switch-status', '✓ Switched', 'success');
            } else {
              log(`✗ Focus switch failed: ${res?.error || "Unknown error"}`, "error");
              setStatus('#dbg-switch-status', '✗ Failed', 'error');
            }
          });
        });
      }

      // Test Clipboard OS Bypass
      const btnBypass = container.querySelector('#btn-dbg-clip-bypass');
      if (btnBypass) {
        btnBypass.addEventListener('click', () => {
          setStatus('#dbg-clip-bypass-status', 'Testing...', 'working');
          document.dispatchEvent(new CustomEvent("agyCopyCaptured", {
            detail: "[Mocked OS Bypass Clipboard Content: Verification Succeeded!]"
          }));
          setTimeout(() => {
            setStatus('#dbg-clip-bypass-status', '✓ Intercepted', 'success');
          }, 400);
        });
      }

      // Test Router Navigation
      const btnRouter = container.querySelector('#btn-dbg-router');
      if (btnRouter) {
        btnRouter.addEventListener('click', () => {
          setStatus('#dbg-router-status', 'Testing...', 'working');
          document.dispatchEvent(new CustomEvent("agyNavigation", {
            detail: { url: window.location.href + "#/mock_routing_state_change" }
          }));
          setTimeout(() => {
            setStatus('#dbg-router-status', '✓ Routed', 'success');
          }, 400);
        });
      }

      // Listen for observation state broadcast changes
      chromeAPI.runtime.onMessage.addListener((message) => {
        if (message.action === "bridge_state_change") {
          log(`[Notification] Generation Observer reported: "${message.payload.state}"`, "success");
          setTrafficLight(message.payload.state);
        } else if (message.action === "bridge_log") {
          log(message.payload.text, message.payload.type || "info");
        }
      });
    }
  };
})();

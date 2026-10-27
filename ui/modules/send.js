// Workspace Manager - Send Module
// One composer for many chatbot tabs: pick tabs, send, watch each tab's status, jump to a tab,
// Replaces the Broadcast view and the Orchestrator's tab monitor.

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  const SITES = [
    { name: "ChatGPT", domains: ["chatgpt.com"] },
    { name: "Claude", domains: ["claude.ai"] },
    { name: "Gemini", domains: ["gemini.google.com"] },
    { name: "Copilot", domains: ["copilot.com", "copilot.microsoft.com"] }
  ];

  function siteOf(tab) {
    if (!tab.url) return null;
    try {
      const host = new URL(tab.url).hostname;
      return SITES.find(site => site.domains.some(d => host === d || host.endsWith('.' + d))) || null;
    } catch (e) {
      return null;
    }
  }

  const STATUS = {
    newchat: { text: "Empty", cls: "status-empty" },
    empty: { text: "Empty", cls: "status-empty" },
    working: { text: "Working…", cls: "status-working" },
    complete: { text: "Done", cls: "status-done" },
    idle: { text: "Done", cls: "status-done" }
  };

  function bridge(tabId, command, payload) {
    return new Promise((resolve) => {
      chromeAPI.runtime.sendMessage({ action: "bridgeCommand", payload: { tabId, command, payload } }, (res) => {
        if (chromeAPI.runtime.lastError) {
          resolve({ status: "error", error: chromeAPI.runtime.lastError.message });
        } else {
          resolve(res || { status: "error" });
        }
      });
    });
  }

  window.SendModule = {
    init(container) {
      const listEl = container.querySelector('#send-tabs-list');
      const promptInput = container.querySelector('#send-prompt');
      const sendBtn = container.querySelector('#btn-send');
      const selectAllBtn = container.querySelector('#btn-send-select-all');
      const statusLine = container.querySelector('#send-status');
      const styleLineEl = container.querySelector('#send-style-line');

      // Answer styles: chosen with the Answer button (or ;; → Styles), added as the message's last line
      let styleLine = '';
      async function refreshStyleLine() {
        styleLine = await PickerTray.line('send');
      }
      if (window.PickerTray) {
        container.querySelector('#send-answer-slot').replaceWith(PickerTray.answerButton({ place: 'send' }));
        styleLineEl.replaceWith(PickerTray.chips('send'));
        PickerTray.attach(promptInput, { surface: 'send', place: 'send' });
        document.addEventListener('wmStyleChoice', (e) => { if (e.detail.place === 'send') refreshStyleLine(); });
        refreshStyleLine();
      }

      const observedTabs = new Set();
      const unchecked = new Set(); // tabs the user deselected; new tabs start selected
      let busy = false;

      function setStatusLine(text, kind = "") {
        if (!statusLine) return;
        statusLine.textContent = text;
        statusLine.className = `status-line ${kind}`;
      }

      function selectedTabIds() {
        return Array.from(container.querySelectorAll('.send-tab-checkbox:checked')).map(cb => parseInt(cb.value, 10));
      }

      function updateSendButton() {
        const n = selectedTabIds().length;
        sendBtn.textContent = n === 1 ? "Send to 1 tab" : `Send to ${n} tabs`;
        sendBtn.disabled = busy || n === 0;
      }

      function renderStatus(tabId) {
        const chip = container.querySelector(`#send-status-${tabId}`);
        if (!chip) return;
        const info = STATUS[window.__agy_tab_states?.[tabId]] || { text: "—", cls: "status-unknown" };
        chip.textContent = info.text;
        chip.className = `status-chip ${info.cls}`;
      }

      async function renderTabs() {
        if (!chromeAPI || !chromeAPI.tabs || !listEl) return;
        const allTabs = await chromeAPI.tabs.query({});
        const aiTabs = allTabs.filter(tab => siteOf(tab));

        listEl.innerHTML = '';
        if (aiTabs.length === 0) {
          listEl.innerHTML = `
            <div class="empty-state">
              <p>No chatbot tabs are open.</p>
              <p class="muted">Open one or more of these, then come back:</p>
              <div class="site-links">
                <a href="https://chatgpt.com/" target="_blank">ChatGPT</a>
                <a href="https://gemini.google.com/app" target="_blank">Gemini</a>
                <a href="https://claude.ai/new" target="_blank">Claude</a>
                <a href="https://copilot.com/" target="_blank">Copilot</a>
              </div>
            </div>`;
          updateSendButton();
          return;
        }

        aiTabs.forEach(tab => {
          const site = siteOf(tab);
          const row = document.createElement('div');
          row.className = 'tab-row';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.className = 'send-tab-checkbox';
          checkbox.value = tab.id;
          checkbox.checked = !unchecked.has(tab.id);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) unchecked.delete(tab.id); else unchecked.add(tab.id);
            updateSendButton();
          });

          const name = document.createElement('button');
          name.className = 'tab-name';
          name.title = "Go to this tab";
          name.innerHTML = `<span class="site-name"></span><span class="tab-title"></span>`;
          name.querySelector('.site-name').textContent = site.name;
          name.querySelector('.tab-title').textContent = tab.title || tab.url;
          name.addEventListener('click', () => {
            chromeAPI.runtime.sendMessage({ action: 'switchTab', payload: { tabId: tab.id } });
          });

          const chip = document.createElement('span');
          chip.id = `send-status-${tab.id}`;
          chip.className = 'status-chip';

          row.append(checkbox, name, chip);
          listEl.appendChild(row);
          renderStatus(tab.id);

          // Start watching this tab's generation state (content script is injected on demand)
          if (!observedTabs.has(tab.id)) {
            observedTabs.add(tab.id);
            bridge(tab.id, "observeGenerationState").then(res => {
              if (res.status !== "success") {
                observedTabs.delete(tab.id);
                const failedChip = container.querySelector(`#send-status-${tab.id}`);
                if (failedChip) {
                  failedChip.textContent = "Reload tab";
                  failedChip.className = "status-chip status-error";
                  failedChip.title = `Could not connect to this tab: ${res.error || "no response"}`;
                }
              }
            });
          }
        });
        updateSendButton();
      }

      // Focus each tab in turn (sites ignore synthetic input in background tabs), type, send, then restore focus.
      async function sendToTabs(tabIds, text) {
        if (busy) return;
        busy = true;
        updateSendButton();
        setStatusLine(`Sending to ${tabIds.length} tab(s)…`);

        const [activeTab] = await chromeAPI.tabs.query({ active: true, lastFocusedWindow: true });
        const failed = [];
        try {
          for (const tabId of tabIds) {
            await chromeAPI.tabs.update(tabId, { active: true });
            await new Promise(r => setTimeout(r, 80));
            const writeRes = await bridge(tabId, "writeToInput", { text });
            const sendRes = writeRes.status === "success" ? await bridge(tabId, "clickSend") : writeRes;
            if (sendRes.status !== "success") {
              const tab = await chromeAPI.tabs.get(tabId).catch(() => null);
              failed.push(siteOf(tab || {})?.name || `tab ${tabId}`);
            }
          }
        } catch (err) {
          failed.push(err.message);
        } finally {
          if (activeTab && !tabIds.includes(activeTab.id)) {
            await chromeAPI.tabs.update(activeTab.id, { active: true }).catch(() => {});
          }
          busy = false;
          updateSendButton();
        }

        if (failed.length === 0) {
          setStatusLine(`Sent. You'll get a notification when answers are ready.`, "ok");
        } else {
          setStatusLine(`Could not send to: ${failed.join(", ")}. Try reloading that tab.`, "error");
        }
        return failed.length === 0;
      }

      sendBtn.addEventListener('click', async () => {
        const text = promptInput.value.trim();
        if (!text) {
          setStatusLine("Type a prompt first.", "error");
          promptInput.focus();
          return;
        }
        const ok = await sendToTabs(selectedTabIds(), StylesRegistry.applyLine(text, styleLine));
        if (ok) promptInput.value = "";
      });

      promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          sendBtn.click();
        }
      });

      selectAllBtn.addEventListener('click', () => {
        const boxes = Array.from(container.querySelectorAll('.send-tab-checkbox'));
        const allOn = boxes.every(cb => cb.checked);
        boxes.forEach(cb => {
          cb.checked = !allOn;
          const id = parseInt(cb.value, 10);
          if (cb.checked) unchecked.delete(id); else unchecked.add(id);
        });
        updateSendButton();
      });

      // Re-render on tab changes, but only when something relevant changed (avoid flicker on every update)
      let renderTimer = null;
      function scheduleRender() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(renderTabs, 150);
      }
      if (chromeAPI && chromeAPI.tabs) {
        chromeAPI.tabs.onUpdated.addListener((tabId, changeInfo) => {
          if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') {
            if (changeInfo.status === 'complete') observedTabs.delete(tabId); // page reloaded: observe again
            scheduleRender();
          }
        });
        chromeAPI.tabs.onCreated.addListener(scheduleRender);
        chromeAPI.tabs.onRemoved.addListener((tabId) => {
          observedTabs.delete(tabId);
          unchecked.delete(tabId);
          scheduleRender();
        });
      }

      // Status updates arrive through manager.js, which keeps window.__agy_tab_states
      document.addEventListener('agyTabStatesHydrated', () => {
        Object.keys(window.__agy_tab_states || {}).forEach(id => renderStatus(id));
      });

      renderTabs();
    }
  };
})();

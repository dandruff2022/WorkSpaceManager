// Workspace Manager - Workflow Engine (background)
// Runs one Projects step: open a chat tab, send the message, wait for the answer, read it with the copy button,
// parse the expected block (asking once with %fix if missing) and save the result into the project.
// Needs WorkflowPrompts and ProjectStore (loaded before this file with importScripts).

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;

  const SITES = {
    chatgpt: { name: 'ChatGPT', newChatUrl: 'https://chatgpt.com/', tempChatUrl: 'https://chatgpt.com/?temporary-chat=true' },
    gemini: { name: 'Gemini', newChatUrl: 'https://gemini.google.com/app' }
  };
  const LABELS = { split: 'tasks', task: 'result', 'mem-update': 'mem', resume: null };
  const ANSWER_TIMEOUT_MS = 5 * 60 * 1000;
  const POLL_MS = 2000;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Sites ignore synthetic input in background tabs, so only one step at a time may bring its tab to the front
  let focusChain = Promise.resolve();
  function withFocus(fn) {
    const run = focusChain.then(fn, fn);
    focusChain = run.catch(() => {});
    return run;
  }

  function notifyUi(projectId) {
    chromeAPI.runtime.sendMessage({ action: 'workflowUpdate', payload: { projectId } }).catch(() => {});
  }

  function sendToTab(tabId, command, payload) {
    return new Promise((resolve) => {
      chromeAPI.tabs.sendMessage(tabId, { action: `bridge_${command}`, payload }, (res) => {
        if (chromeAPI.runtime.lastError) resolve({ status: 'error', error: chromeAPI.runtime.lastError.message });
        else resolve(res || { status: 'error', error: 'No response' });
      });
    });
  }

  async function bridge(tabId, command, payload) {
    let res = await sendToTab(tabId, command, payload);
    if (res.status === 'error' && /Receiving end|Could not establish/i.test(res.error || '') && typeof ensureContentScript === 'function') {
      await ensureContentScript(tabId).catch(() => {});
      res = await sendToTab(tabId, command, payload);
    }
    return res;
  }

  async function tabExists(tabId) {
    try { await chromeAPI.tabs.get(tabId); return true; } catch (e) { return false; }
  }

  async function waitUntil(check, timeoutMs, what) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await check()) return;
      await sleep(500);
    }
    throw new Error(`Timed out waiting for ${what}`);
  }

  async function snapshot(tabId) {
    const res = await bridge(tabId, 'getGenerationSnapshot');
    return res.status === 'success' ? res.snapshot : null;
  }

  async function openChat(ai, kind) {
    const site = SITES[ai];
    if (!site) throw new Error(`Unsupported AI: ${ai}`);
    const url = (kind === 'mem-update' && site.tempChatUrl) ? site.tempChatUrl : site.newChatUrl;
    const win = await chromeAPI.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
    const tab = await chromeAPI.tabs.create({ url, active: false, ...(win ? { windowId: win.id } : {}) });
    await waitUntil(async () => (await chromeAPI.tabs.get(tab.id)).status === 'complete', 30000, `${site.name} to load`);
    await waitUntil(async () => !!(await snapshot(tab.id))?.hasInput, 20000, `the ${site.name} message box`);
    return tab.id;
  }

  // Bring the tab to the front of its window, type, send, then give the front back to the tab that had it
  function typeAndSend(tabId, text) {
    return withFocus(async () => {
      const tab = await chromeAPI.tabs.get(tabId);
      const [previous] = await chromeAPI.tabs.query({ active: true, windowId: tab.windowId });
      await chromeAPI.tabs.update(tabId, { active: true });
      try {
        await sleep(300);
        let res = await bridge(tabId, 'writeToInput', { text });
        if (res.status !== 'success') { await sleep(1000); res = await bridge(tabId, 'writeToInput', { text }); }
        if (res.status !== 'success') throw new Error('Could not type into the message box');
        // The send button can lag behind the typed text (and a synthetic Enter is ignored), so press send until
        // the page shows the message went out: the box is empty, the URL changed or the stop button is up
        const before = await snapshot(tabId);
        let sent = false;
        for (let attempt = 0; attempt < 6 && !sent; attempt++) {
          await sleep(attempt === 0 ? 400 : 1000);
          res = await bridge(tabId, 'clickSend');
          await sleep(700);
          const after = await snapshot(tabId);
          sent = !!after && (after.hasStop || after.inputLength === 0 || (before && after.url !== before.url));
        }
        if (!sent) throw new Error('Could not press send (the message is still in the box)');
      } finally {
        if (previous && previous.id !== tabId) await chromeAPI.tabs.update(previous.id, { active: true }).catch(() => {});
      }
    });
  }

  // Done = a new answer copy button is there and no stop button, for two polls in a row
  async function waitForAnswer(tabId, baseCount) {
    const start = Date.now();
    let stable = 0;
    while (Date.now() - start < ANSWER_TIMEOUT_MS) {
      await sleep(POLL_MS);
      if (!(await tabExists(tabId))) throw new Error('The chat tab was closed');
      const snap = await snapshot(tabId);
      if (!snap) { stable = 0; continue; }
      if (!snap.hasStop && snap.copyCount > baseCount) {
        if (++stable >= 2) return snap;
      } else {
        stable = 0;
      }
    }
    throw new Error('No answer after 5 minutes');
  }

  // Prefer the site's own copy (raw Markdown with the fences the parsers need). If that only gave rendered DOM
  // text, retry once with the tab and its window in front, since some sites only write the clipboard when focused.
  async function readLastAnswer(tabId) {
    let res = await bridge(tabId, 'clickCopyButton', { type: 'ai', index: -1 });
    if (res.status !== 'success' || !res.text || res.source !== 'clipboard') {
      const focused = await withFocus(async () => {
        const tab = await chromeAPI.tabs.get(tabId);
        const [previous] = await chromeAPI.tabs.query({ active: true, windowId: tab.windowId });
        const previousWindow = await chromeAPI.windows.getLastFocused().catch(() => null);
        await chromeAPI.tabs.update(tabId, { active: true });
        await chromeAPI.windows.update(tab.windowId, { focused: true }).catch(() => {});
        try {
          await sleep(400);
          return await bridge(tabId, 'clickCopyButton', { type: 'ai', index: -1 });
        } finally {
          if (previous && previous.id !== tabId) await chromeAPI.tabs.update(previous.id, { active: true }).catch(() => {});
          if (previousWindow && previousWindow.id !== tab.windowId) await chromeAPI.windows.update(previousWindow.id, { focused: true }).catch(() => {});
        }
      });
      if (focused.status === 'success' && focused.text && (focused.source === 'clipboard' || !res.text)) res = focused;
    }
    if (res.status !== 'success' || !res.text) throw new Error(`Could not read the answer: ${res.error || 'empty'}`);
    return res.text;
  }

  function parseAnswer(kind, text) {
    const P = self.WorkflowPrompts;
    if (kind === 'split') return P.parseTasks(text);
    if (kind === 'task') return P.parseBlock(text, 'result', { fallback: true });
    if (kind === 'mem-update') return P.parseMemoryAnswer(text);
    return text;
  }

  async function applyResult(projectId, step, parsed) {
    const store = self.ProjectStore;
    if (step.kind === 'split') {
      // Alternate AIs so the plan uses both providers by default; the user can change it before running
      await store.setTasks(projectId, parsed.map((t, i) => ({ ...t, ai: i % 2 === 0 ? 'chatgpt' : 'gemini' })));
    } else if (step.kind === 'task' && step.taskId) {
      await store.updateTask(projectId, step.taskId, { status: 'done', result: parsed });
    } else if (step.kind === 'mem-update') {
      await store.addMemoryVersion(projectId, parsed, SITES[step.ai].name, 'AI update');
    }
  }

  async function markTask(projectId, step, patch) {
    if (step.kind === 'task' && step.taskId) await self.ProjectStore.updateTask(projectId, step.taskId, patch).catch(() => {});
  }

  async function runStep(projectId, step) {
    const store = self.ProjectStore;
    const update = async (patch) => {
      Object.assign(step, patch);
      await store.updateStep(projectId, step.id, patch);
      notifyUi(projectId);
    };
    const label = LABELS[step.kind];
    let tabId = null;

    try {
      await markTask(projectId, step, { status: 'running', result: null, stepId: step.id });
      tabId = await openChat(step.ai, step.kind);
      await update({ tabId });
      const base = (await snapshot(tabId))?.copyCount || 0;
      await typeAndSend(tabId, step.message);

      if (step.kind === 'resume') {
        // The user keeps talking in this chat: show it and stop here
        const tab = await chromeAPI.tabs.update(tabId, { active: true });
        await chromeAPI.windows.update(tab.windowId, { focused: true }).catch(() => {});
        await update({ status: 'done', url: tab.url || null });
        tabId = null; // the user's chat now, never auto-closed
        return;
      }

      await update({ status: 'waiting' });
      let snap = await waitForAnswer(tabId, base);
      await update({ status: 'reading', url: snap.url });
      let answer = await readLastAnswer(tabId);
      let parsed = parseAnswer(step.kind, answer);
      let archived = answer;

      if (!parsed && label) {
        await update({ status: 'waiting', note: 'Asked again for the block' });
        await typeAndSend(tabId, self.WorkflowPrompts.buildFix(label));
        snap = await waitForAnswer(tabId, snap.copyCount);
        await update({ status: 'reading' });
        const fixAnswer = await readLastAnswer(tabId);
        archived = `${answer}\n\n---\n\n${fixAnswer}`;
        parsed = parseAnswer(step.kind, fixAnswer);
      }

      const archiveId = await store.saveArchive(archived);
      if (!parsed) {
        await markTask(projectId, step, { status: 'needs-you' });
        await update({ status: 'needs-you', archiveId, error: `No ${label} block in the answer` });
        tabId = null; // keep the tab so the user can look
        return;
      }
      await applyResult(projectId, step, parsed);
      await update({ status: 'done', archiveId });
    } catch (err) {
      await markTask(projectId, step, { status: 'needs-you' });
      await update({ status: 'error', error: err.message }).catch(() => {});
      tabId = null;
    } finally {
      if (tabId !== null) {
        const { keepWorkerTabs } = await chromeAPI.storage.local.get(['keepWorkerTabs']);
        if (!keepWorkerTabs) await chromeAPI.tabs.remove(tabId).catch(() => {});
      }
      notifyUi(projectId);
    }
  }

  const claimedTasks = new Set();

  async function startStep(projectId, { kind, ai, message, taskId = null }) {
    if (!LABELS.hasOwnProperty(kind)) throw new Error(`Unknown step kind: ${kind}`);
    if (!SITES[ai]) throw new Error(`Unsupported AI: ${ai}`);
    if (!message || !message.trim()) throw new Error('Empty message');
    if (taskId) {
      // Checked synchronously first so two quick requests can't both pass the stored-status check
      if (claimedTasks.has(taskId)) throw new Error('This task is already being started');
      claimedTasks.add(taskId);
      setTimeout(() => claimedTasks.delete(taskId), 3000);
      const project = await self.ProjectStore.get(projectId);
      const task = project && project.tasks.find(t => t.id === taskId);
      if (!task) throw new Error('Task not found');
      if (task.status === 'running') throw new Error(`"${task.title}" is already running`);
      await self.ProjectStore.updateTask(projectId, taskId, { status: 'running', result: null });
    }
    const step = await self.ProjectStore.addStep(projectId, { kind, ai, taskId, message, status: 'sending' });
    notifyUi(projectId);
    runStep(projectId, step); // runs on; progress goes to storage and workflowUpdate messages
    return step;
  }

  async function openStepChat(projectId, stepId) {
    const project = await self.ProjectStore.get(projectId);
    const step = project && project.steps.find(s => s.id === stepId);
    if (!step) throw new Error('Step not found');
    if (step.tabId !== null && await tabExists(step.tabId)) {
      const tab = await chromeAPI.tabs.update(step.tabId, { active: true });
      await chromeAPI.windows.update(tab.windowId, { focused: true }).catch(() => {});
      return;
    }
    if (!step.url) throw new Error('This chat was not saved');
    await chromeAPI.tabs.create({ url: step.url, active: true });
  }

  // Steps cut off by a service worker restart can't be resumed; show them as needing the user
  async function recoverInterrupted() {
    const store = self.ProjectStore;
    for (const project of await store.list()) {
      for (const step of project.steps) {
        if (['sending', 'waiting', 'reading'].includes(step.status)) {
          await store.updateStep(project.id, step.id, { status: 'error', error: 'Interrupted (the extension restarted)' });
          await markTask(project.id, step, { status: 'needs-you' });
        }
      }
    }
  }

  // Message API used by the Projects screen (and the dev harness). Returns true if the message was handled.
  const handlers = {
    wf_list: async () => ({ projects: await self.ProjectStore.list() }),
    wf_get: async (p) => ({ project: await self.ProjectStore.get(p.projectId) }),
    wf_create: async (p) => ({ project: await self.ProjectStore.create(p.title, p.memory) }),
    wf_rename: async (p) => { await self.ProjectStore.rename(p.projectId, p.title); return {}; },
    wf_remove: async (p) => { await self.ProjectStore.remove(p.projectId); return {}; },
    wf_getCurrent: async () => ({ projectId: await self.ProjectStore.getCurrentId() }),
    wf_setCurrent: async (p) => { await self.ProjectStore.setCurrentId(p.projectId); return {}; },
    wf_editMemory: async (p) => ({ version: await self.ProjectStore.editMemory(p.projectId, p.text) }),
    wf_undoMemory: async (p) => ({ version: await self.ProjectStore.undoMemory(p.projectId) }),
    wf_setTasks: async (p) => { await self.ProjectStore.setTasks(p.projectId, p.tasks); return {}; },
    wf_updateTask: async (p) => { await self.ProjectStore.updateTask(p.projectId, p.taskId, p.patch); return {}; },
    wf_removeTask: async (p) => { await self.ProjectStore.removeTask(p.projectId, p.taskId); return {}; },
    wf_run: async (p) => ({ step: await startStep(p.projectId, p) }),
    wf_openChat: async (p) => { await openStepChat(p.projectId, p.stepId); return {}; },
    wf_getArchive: async (p) => ({ text: await self.ProjectStore.getArchive(p.archiveId) }),
    // Dev harness: pick up code changes without visiting chrome://extensions
    wf_devReload: async () => { setTimeout(() => chromeAPI.runtime.reload(), 200); return {}; }
  };

  function handleMessage(message, sendResponse) {
    const handler = handlers[message.action];
    if (!handler) return false;
    handler(message.payload || {})
      .then(result => {
        if (message.action !== 'wf_list' && message.action !== 'wf_get' && message.payload?.projectId) notifyUi(message.payload.projectId);
        sendResponse({ status: 'success', ...result });
      })
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true;
  }

  self.WorkflowEngine = { handleMessage, recoverInterrupted, SITES };
})();

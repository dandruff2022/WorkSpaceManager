// Workspace Manager - Workflow Engine (background)
// Runs one Projects step: open a chat tab, send the message, wait for the answer, read it with the copy button,
// parse the expected block (asking once with %fix if missing) and save the result into the project.
// A finished Combine starts the memory update by itself, as a chore in a temporary chat.
// Needs WorkflowPrompts and ProjectStore (loaded before this file with importScripts).

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;

  const SITES = {
    chatgpt: { name: 'ChatGPT', newChatUrl: 'https://chatgpt.com/', tempChatUrl: 'https://chatgpt.com/?temporary-chat=true' },
    gemini: { name: 'Gemini', newChatUrl: 'https://gemini.google.com/app' }
  };
  const LABELS = { split: 'tasks', task: 'result', combine: null, 'mem-update': 'mem', resume: null };
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

  // Temporary chats keep chores out of the user's chat history. ChatGPT has a URL for it; Gemini has a button.
  // Returns whether the chat really is temporary (if Gemini's button is missing, the chore runs in a normal chat).
  async function openChat(ai, { temporary = false } = {}) {
    const site = SITES[ai];
    if (!site) throw new Error(`Unsupported AI: ${ai}`);
    const url = (temporary && site.tempChatUrl) ? site.tempChatUrl : site.newChatUrl;
    const win = await chromeAPI.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
    const tab = await chromeAPI.tabs.create({ url, active: false, ...(win ? { windowId: win.id } : {}) });
    await waitUntil(async () => (await chromeAPI.tabs.get(tab.id)).status === 'complete', 30000, `${site.name} to load`);
    await waitUntil(async () => !!(await snapshot(tab.id))?.hasInput, 20000, `the ${site.name} message box`);
    let isTemporary = temporary && !!site.tempChatUrl;
    if (temporary && !site.tempChatUrl) {
      isTemporary = (await bridge(tab.id, 'startTemporaryChat')).status === 'success';
      if (isTemporary) {
        await sleep(1000);
        await waitUntil(async () => !!(await snapshot(tab.id))?.hasInput, 10000, `the ${site.name} message box`);
      }
    }
    return { tabId: tab.id, temporary: isTemporary };
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

  // Bring a tab to the front for a moment so the site renders (Gemini doesn't render answers in hidden tabs)
  function peek(tabId) {
    return withFocus(async () => {
      const tab = await chromeAPI.tabs.get(tabId);
      const [previous] = await chromeAPI.tabs.query({ active: true, windowId: tab.windowId });
      await chromeAPI.tabs.update(tabId, { active: true });
      try {
        await sleep(1500);
        return await snapshot(tabId);
      } finally {
        if (previous && previous.id !== tabId) await chromeAPI.tabs.update(previous.id, { active: true }).catch(() => {});
      }
    });
  }

  // Done = a new answer copy button is there and no stop button, for two polls in a row.
  // A tab that shows neither progress nor an answer for a few polls gets a peek.
  async function waitForAnswer(tabId, baseCount) {
    const start = Date.now();
    let stable = 0;
    let idle = 0;
    while (Date.now() - start < ANSWER_TIMEOUT_MS) {
      await sleep(POLL_MS);
      if (!(await tabExists(tabId))) throw new Error('The chat tab was closed');
      let snap = await snapshot(tabId);
      if (snap && !snap.hasStop && snap.copyCount <= baseCount && ++idle >= 3) {
        idle = 0;
        snap = await peek(tabId);
      }
      if (!snap) { stable = 0; continue; }
      if (snap.hasStop) idle = 0;
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

  async function applyResult(projectId, step, parsed, answer) {
    const store = self.ProjectStore;
    if (step.kind === 'split') {
      // Alternate AIs so the plan uses both providers by default; the user can change it before running
      await store.setTasks(projectId, parsed.map((t, i) => ({ ...t, ai: i % 2 === 0 ? 'chatgpt' : 'gemini' })));
      // The plan may also settle preferences or decisions (an optional mem block before the tasks block).
      // Saved only if the memory is still the one the plan was made from.
      const mem = self.WorkflowPrompts.parseMemoryAnswer(answer || '', { labelledOnly: true });
      if (mem) {
        const project = await store.get(projectId);
        const latest = project.memory[project.memory.length - 1];
        if ((!step.baseAt || latest.at === step.baseAt) && mem.trim() !== latest.text.trim()) {
          await store.addMemoryVersion(projectId, mem, SITES[step.ai].name, 'with the plan');
        }
      }
    } else if (step.kind === 'task' && step.taskId) {
      await store.updateTask(projectId, step.taskId, { status: 'done', result: parsed });
    } else if (step.kind === 'mem-update') {
      // Don't overwrite a memory that changed while this update ran (an edit, an undo or another update)
      const project = await store.get(projectId);
      const latest = project.memory[project.memory.length - 1];
      if (step.baseAt && latest.at !== step.baseAt) throw new Error('The memory changed while this update ran. Try again.');
      await store.addMemoryVersion(projectId, parsed, SITES[step.ai].name, step.parentId ? 'after Combine' : 'AI update');
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
      const chat = await openChat(step.ai, { temporary: await useTemporaryChat(step.kind) });
      tabId = chat.tabId;
      await update({ tabId, temporary: chat.temporary });
      const base = (await snapshot(tabId))?.copyCount || 0;
      await typeAndSend(tabId, step.message);

      if (step.kind === 'resume') {
        // The user keeps talking in this chat: show it and stop here
        const tab = await chromeAPI.tabs.update(tabId, { active: true });
        await chromeAPI.windows.update(tab.windowId, { focused: true }).catch(() => {});
        // The chat gets its own URL a moment after sending; save that one so "Open chat" finds it later
        let url = tab.url || null;
        for (let i = 0; i < 20 && (!url || url.split('?')[0] === SITES[step.ai].newChatUrl); i++) {
          await sleep(500);
          url = (await chromeAPI.tabs.get(tabId).catch(() => ({}))).url || url;
        }
        await update({ status: 'done', url });
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
      if (step.kind === 'combine') {
        // The user may keep talking in this chat, so it stays open; the memory catches up in a chore
        await update({ status: 'done', archiveId });
        tabId = null;
        startMemoryChore(projectId, step, answer).catch(async (err) => {
          await store.addStep(projectId, { kind: 'mem-update', ai: step.ai, parentId: step.id, status: 'error', error: err.message });
          notifyUi(projectId);
        });
        return;
      }
      if (!parsed) {
        await markTask(projectId, step, { status: 'needs-you' });
        await update({ status: 'needs-you', archiveId, error: `No ${label} block in the answer` });
        tabId = null; // keep the tab so the user can look
        return;
      }
      await applyResult(projectId, step, parsed, archived);
      await update({ status: 'done', archiveId });
    } catch (err) {
      await markTask(projectId, step, { status: 'needs-you' });
      await update({ status: 'error', error: err.message }).catch(() => {});
      tabId = null;
    } finally {
      if (tabId !== null) {
        const { keepWorkerTabs } = await chromeAPI.storage.local.get(['keepWorkerTabs']);
        if (!keepWorkerTabs) {
          await chromeAPI.tabs.remove(tabId).catch(() => {});
          await store.updateStep(projectId, step.id, { tabId: null }).catch(() => {});
        }
      }
      notifyUi(projectId);
    }
  }

  // Combine and Continue are the user's own chats. Memory updates are always temporary; Plan and tasks are
  // temporary unless the user turned that off (their answers are saved in the project either way).
  async function useTemporaryChat(kind) {
    if (kind === 'mem-update') return true;
    if (kind !== 'split' && kind !== 'task') return false;
    const { tempChatsForWork } = await chromeAPI.storage.local.get(['tempChatsForWork']);
    return tempChatsForWork !== false;
  }

  async function choresAiFor(project) {
    const { choresAi } = await chromeAPI.storage.local.get(['choresAi']);
    return SITES[choresAi] ? choresAi : (project.mainAi || 'chatgpt');
  }

  // After Combine (or "Ask AI to tidy"): rewrite the memory from the task results and the final answer, if any.
  // One chore per project at a time; each builds its message from the memory as it is when its turn comes.
  const choreChains = new Map();
  function startMemoryChore(projectId, combineStep, finalAnswer) {
    const run = (choreChains.get(projectId) || Promise.resolve()).then(async () => {
      const project = await self.ProjectStore.get(projectId);
      if (!project) return;
      const P = self.WorkflowPrompts;
      const results = project.tasks.filter(t => t.status === 'done' && t.result).map(t => ({ title: t.title, text: t.result }));
      if (finalAnswer) results.push({ title: 'Final answer (combined)', text: finalAnswer });
      const latest = project.memory[project.memory.length - 1];
      const step = await startStep(projectId, {
        kind: 'mem-update', ai: await choresAiFor(project), message: P.buildMemUpdate(latest.text, results),
        parentId: combineStep ? combineStep.id : null, baseAt: latest.at
      });
      await step.finished;
    });
    choreChains.set(projectId, run.catch(() => {}));
    return run;
  }

  // "Try again" on a failed chore: rebuild it from the Combine answer and the memory as it is now
  async function retryChore(projectId, combineStepId) {
    const project = await self.ProjectStore.get(projectId);
    const combine = project && project.steps.find(s => s.id === combineStepId && s.kind === 'combine');
    if (!combine || !combine.archiveId) throw new Error('The Combine answer was not saved');
    const answer = await self.ProjectStore.getArchive(combine.archiveId);
    startMemoryChore(projectId, combine, answer).catch(async (err) => {
      await self.ProjectStore.addStep(projectId, { kind: 'mem-update', ai: combine.ai, parentId: combine.id, status: 'error', error: err.message });
      notifyUi(projectId);
    });
  }

  // "Ask AI to tidy": the same chore without a Combine, from whatever results the project has
  async function tidyMemory(projectId) {
    const project = await self.ProjectStore.get(projectId);
    if (!project) throw new Error('Project not found');
    if (project.steps.some(s => s.kind === 'mem-update' && ['sending', 'waiting', 'reading'].includes(s.status))) {
      throw new Error('A memory update is already running');
    }
    startMemoryChore(projectId, null, null).catch(async (err) => {
      await self.ProjectStore.addStep(projectId, { kind: 'mem-update', ai: project.mainAi || 'chatgpt', status: 'error', error: err.message });
      notifyUi(projectId);
    });
  }

  const claimedTasks = new Set();

  async function startStep(projectId, { kind, ai, message, taskId = null, parentId = null, baseAt = null }) {
    if (!LABELS.hasOwnProperty(kind)) throw new Error(`Unknown step kind: ${kind}`);
    if (!SITES[ai]) throw new Error(`Unsupported AI: ${ai}`);
    if (!message || !message.trim()) throw new Error('Empty message');
    if (kind === 'split') {
      // A new plan replaces the task list, so it can't run while tasks or a Combine are still working
      const project = await self.ProjectStore.get(projectId);
      if (project && (project.tasks.some(t => t.status === 'running') || project.steps.some(s => s.kind === 'combine' && ['sending', 'waiting', 'reading'].includes(s.status)))) {
        throw new Error('Wait until the running tasks finish before planning again');
      }
    }
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
    if (kind === 'split' && !baseAt) {
      // Remember which memory the plan was made from (its optional mem block is only saved over that one)
      const project = await self.ProjectStore.get(projectId);
      if (project && project.memory.length) baseAt = project.memory[project.memory.length - 1].at;
    }
    const step = await self.ProjectStore.addStep(projectId, { kind, ai, taskId, parentId, baseAt, message, status: 'sending' });
    notifyUi(projectId);
    // Runs on; progress goes to storage and workflowUpdate messages. Callers inside the engine can await `finished`.
    const finished = runStep(projectId, step);
    return Object.defineProperty(step, 'finished', { value: finished, enumerable: false });
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
    if (step.temporary) throw new Error('That was a temporary chat; it closes for good. Use "Full answer" to read it.');
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
    wf_setOptions: async (p) => ({ project: await self.ProjectStore.setOptions(p.projectId, p.patch || {}) }),
    wf_remove: async (p) => { await self.ProjectStore.remove(p.projectId); return {}; },
    wf_getCurrent: async () => ({ projectId: await self.ProjectStore.getCurrentId() }),
    wf_setCurrent: async (p) => { await self.ProjectStore.setCurrentId(p.projectId); return {}; },
    wf_editMemory: async (p) => ({ version: await self.ProjectStore.editMemory(p.projectId, p.text) }),
    wf_undoMemory: async (p) => ({ version: await self.ProjectStore.undoMemory(p.projectId) }),
    wf_setTasks: async (p) => { await self.ProjectStore.setTasks(p.projectId, p.tasks); return {}; },
    wf_updateTask: async (p) => { await self.ProjectStore.updateTask(p.projectId, p.taskId, p.patch); return {}; },
    wf_removeTask: async (p) => { await self.ProjectStore.removeTask(p.projectId, p.taskId); return {}; },
    wf_run: async (p) => ({ step: await startStep(p.projectId, p) }),
    wf_retryChore: async (p) => { await retryChore(p.projectId, p.combineStepId); return {}; },
    wf_tidyMemory: async (p) => { await tidyMemory(p.projectId); return {}; },
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

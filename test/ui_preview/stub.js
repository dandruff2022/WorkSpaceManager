// Fake chrome API + sample project for headless screenshots of the Projects screen (test/ui_preview/run.sh)
(() => {
  const data = {};
  const area = {
    get: async (keys) => { const out = {}; [].concat(keys || Object.keys(data)).forEach(k => { if (k in data) out[k] = JSON.parse(JSON.stringify(data[k])); }); return out; },
    set: async (obj) => { Object.assign(data, JSON.parse(JSON.stringify(obj))); }
  };
  const store = createProjectStore(area);
  const noop = { addListener() {} };
  const listeners = [];
  const notify = (message) => listeners.forEach(fn => fn(message));
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const handlers = {
    wf_list: async () => ({ projects: await store.list() }),
    wf_getCurrent: async () => ({ projectId: await store.getCurrentId() }),
    wf_setCurrent: async (p) => {
      // Reproduce a progress reload while the current-project write is still pending.
      notify({ action: 'workflowUpdate', payload: { projectId: await store.getCurrentId() } });
      await pause(60);
      await store.setCurrentId(p.projectId);
      return {};
    },
    wf_getArchive: async () => ({ text: 'Full answer text…' }),
    wf_setOptions: async (p) => ({ project: await store.setOptions(p.projectId, p.patch) }),
    wf_notesList: async () => ({ notes: await notes().list() }),
    wf_noteSaveText: async (p) => ({ note: await notes().saveText(p.noteId, p.text) })
  };
  // Notes store on the same fake storage (utils/notes_store.js loads after this file)
  let notesStore = null;
  const notes = () => notesStore || (notesStore = NotesRegistry.createNotesStore(area, { onChange: () => notify({ action: 'notesUpdate' }) }));
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(msg, cb) {
        const h = handlers[msg.action];
        const p = h ? h(msg.payload || {}).then(r => ({ status: 'success', ...r })) : Promise.resolve({ status: 'success' });
        if (cb) p.then(cb);
        return p;
      },
      onMessage: { addListener(fn) { listeners.push(fn); } }, getURL: (s) => s
    },
    storage: {
      local: {
        get(keys, cb) { const p = area.get(keys); if (cb) p.then(cb); return p; },
        set(obj, cb) { const p = area.set(obj); if (cb) p.then(cb); return p; }
      },
      onChanged: noop
    },
    tabs: { query: async () => [], onUpdated: noop, onCreated: noop, onRemoved: noop },
    windows: { getLastFocused: async () => null, onFocusChanged: noop, WINDOW_ID_NONE: -1 }
  };

  // Other pages: #library (Prompts tab), #library-styles, #send-answer (Answer tray open)
  const click = (sel) => { const node = document.querySelector(sel); if (node) node.click(); };
  const PAGES = {
    library: () => click('.nav-item[data-target="skills"]'),
    'library-styles': () => { click('.nav-item[data-target="skills"]'); click('.lib-tab[data-tab="styles"]'); setTimeout(() => click('#styles-list [data-id="my-formal"]'), 100); },
    'send-picker': () => {
      click('.nav-item[data-target="send"]');
      const ta = document.querySelector('#send-prompt');
      ta.focus(); ta.value = 'Plan a weekend trip ;;'; ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.dispatchEvent(new Event('input'));
      setTimeout(() => ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })), 200);
    },
    'send-answer': () => { click('.nav-item[data-target="send"]'); setTimeout(() => click('#view-send .answer-btn'), 100); },
    notes: () => click('.nav-item[data-target="notes"]'),
    'notes-proposal': () => click('.nav-item[data-target="notes"]'),
    'notes-view': () => click('.nav-item[data-target="notes"]')
  };

  // Notes for #notes (plain) and #notes-proposal (an AI proposal waiting to be applied)
  function seedNotes(withProposal) {
    const now = Date.now();
    const v = (text, by, ago, note) => ({ text, by, at: now - ago, note });
    const trip = 'weekend in hangzhou\n- west lake early, before crowds\n- try longjing tea at meijiawu\n- budget about 1500 yuan, train both ways\nmaybe skip lingyin if it rains';
    const markdown = '# Weekend in Hangzhou\n\n- West Lake before the crowds\n- Try Longjing tea\n\n[Train times](https://example.com/trains)\n\n- [ ] Book the train tickets\n- [x] Check the weekend weather\n* [ ] Pack a raincoat';
    const text = location.hash === '#notes-view' ? markdown : trip;
    const tidy = 'Weekend in Hangzhou\n- West Lake early, before the crowds\n- Try Longjing tea at Meijiawu\n- Budget about 1500 yuan, train both ways\n- Maybe skip Lingyin Temple if it rains';
    data.notes = {
      n1: { id: 'n1', title: '', text, versions: [v(text, 'you', 3600e3, 'created')], createdAt: now - 3600e3, updatedAt: now - 60e3,
        edit: withProposal ? { status: 'ready', instruction: 'tidy', part: null, base: trip, ai: 'chatgpt', at: now - 30e3, proposal: tidy, replacement: tidy } : null },
      n2: { id: 'n2', title: 'Reading list', text: 'Designing Data-Intensive Applications\nhttps://example.com/paper.pdf', versions: [v('x', 'you', 86400e3, 'created')], createdAt: now - 86400e3, updatedAt: now - 86400e3, edit: null },
      n3: { id: 'n3', title: 'Kept from Projects', text: 'Final answer: day 1 West Lake, day 2 Grand Canal…', versions: [v('x', 'you', 172800e3, 'saved from Projects')], createdAt: now - 172800e3, updatedAt: now - 172800e3, edit: null }
    };
  }

  // States: #empty, #new (just created), default (tasks running), #combine (tasks done), #combined (final answer + memory update)
  window.__seed = (async () => {
    const hash = location.hash.slice(1);
    // "#running-mem", "#combined-mem": that state with the Memory card open
    const state = hash.replace(/-mem$/, '');
    if (hash.endsWith('-mem')) window.addEventListener('load', () => setTimeout(() => click('#btn-proj-mem-toggle'), 400));
    if (state === 'empty') return;
    if (state === 'checks') {
      seedNotes(false);
      await store.create('Second project', WorkflowPrompts.emptyMemory('Second project', 'Different goal'));
      window.__previewStore = store;
      window.__previewUpdate = notify;
    }
    if (state.startsWith('notes')) seedNotes(state === 'notes-proposal');
    if (PAGES[state]) {
      data.styles = { custom: [{ id: 'my-formal', name: 'Formal tone', group: 'approach', text: 'Use a formal, polite tone.' }], edits: { short: { name: 'Short', text: 'Keep it short: under 100 words.' } } };
      data.styleChoice = { send: ['short', 'zh', 'sources'] };
      window.addEventListener('load', () => setTimeout(PAGES[state], 300));
      if (state !== 'send-picker') return;
    }
    const P = WorkflowPrompts;
    const v0 = P.emptyMemory('Saturday in Chicago', 'Plan a one-day trip to Chicago on Saturday, back by 9 pm, no car, about $80.');
    const p = await store.create('Saturday in Chicago', v0);
    await store.setCurrentId(p.id);
    if (state === 'new') return;
    await store.setTasks(p.id, [
      { title: 'Check Saturday weather', task: 'Find the forecast for Saturday in Chicago.', needs: ['Goal'], ret: 'Forecast, source link', ai: 'gemini' },
      { title: 'Find activities', task: 'List 3 museum or outdoor options under $80 reachable without a car.', needs: ['Goal', 'Preferences'], ret: 'Name, price, indoor/outdoor, links', ai: 'chatgpt' }
    ]);
    const pr = await store.get(p.id);
    const s1 = await store.addStep(p.id, { kind: 'split', ai: 'chatgpt', message: P.buildSplit(v0, { short: true }), status: 'done' });
    await store.updateStep(p.id, s1.id, { status: 'done', archiveId: 'a1', url: 'https://chatgpt.com/c/1' });
    const s2 = await store.addStep(p.id, { kind: 'task', ai: 'gemini', taskId: pr.tasks[0].id, message: 'x', status: 'done', archiveId: 'a2' });
    await store.updateTask(p.id, pr.tasks[0].id, { status: 'done', stepId: s2.id, result: '12°C, rain after 2 pm — not good for outdoor plans.\nSource: https://weather.gov' });
    const s3 = await store.addStep(p.id, { kind: 'task', ai: 'chatgpt', taskId: pr.tasks[1].id, message: 'x', status: 'waiting', tabId: 7 });
    await store.updateTask(p.id, pr.tasks[1].id, { status: 'running', stepId: s3.id });
    if (state !== 'combine' && state !== 'combined') return;
    await store.updateStep(p.id, s3.id, { status: 'done', archiveId: 'a3', tabId: null });
    await store.updateTask(p.id, pr.tasks[1].id, { status: 'done', result: 'Art Institute $32 indoor; Field Museum $30 indoor' });
    if (state !== 'combined') return;
    const c = await store.addStep(p.id, { kind: 'combine', ai: 'chatgpt', message: 'x', status: 'done', archiveId: 'a4', url: 'https://chatgpt.com/c/2', tabId: 9 });
    const v1 = v0.replace('## Decisions\n(none)', '## Decisions\n- Indoor activities only 〔AI · basis: weather task〕')
      .replace('## Open questions\n(none)', '## Open questions\nWhich museum, or both?')
      .replace('Just started.', 'Day plan written: Art Institute 10–1, Field Museum 2–5, train home by 8.');
    await store.addMemoryVersion(p.id, v1, 'Gemini', 'AI update');
    await store.addStep(p.id, { kind: 'mem-update', ai: 'gemini', parentId: c.id, temporary: true, message: 'x', status: 'done' });
  })();
})();

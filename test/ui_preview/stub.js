// Fake chrome API + sample project for headless screenshots of the Projects screen (test/ui_preview/run.sh)
(() => {
  const data = {};
  const area = {
    get: async (keys) => { const out = {}; [].concat(keys || Object.keys(data)).forEach(k => { if (k in data) out[k] = JSON.parse(JSON.stringify(data[k])); }); return out; },
    set: async (obj) => { Object.assign(data, JSON.parse(JSON.stringify(obj))); }
  };
  const store = createProjectStore(area);
  const noop = { addListener() {} };
  const handlers = {
    wf_list: async () => ({ projects: await store.list() }),
    wf_getCurrent: async () => ({ projectId: await store.getCurrentId() }),
    wf_getArchive: async () => ({ text: 'Full answer text…' })
  };
  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(msg, cb) {
        const h = handlers[msg.action];
        const p = h ? h(msg.payload || {}).then(r => ({ status: 'success', ...r })) : Promise.resolve({ status: 'success' });
        if (cb) p.then(cb);
        return p;
      },
      onMessage: noop, getURL: (s) => s
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

  window.__seed = (async () => {
    if (location.hash === '#empty') return;
    const P = WorkflowPrompts;
    const v0 = P.emptyMemory('Saturday in Chicago', 'Plan a one-day trip on Saturday, back by 9 pm.')
      .replace('## Preferences\n', '## Preferences\nNo car; about $80; likes museums.\n')
      .replace(/## Open questions\n\(none\)/, '## Open questions\nIndoor or outdoor?');
    const p = await store.create('Saturday in Chicago', v0);
    await store.setCurrentId(p.id);
    await store.setTasks(p.id, [
      { title: 'Check Saturday weather', task: 'Find the forecast for Saturday in Chicago.', needs: ['Goal'], ret: 'Forecast, source link', ai: 'gemini' },
      { title: 'Find activities', task: 'List 3 museum or outdoor options under $80 reachable without a car.', needs: ['Goal', 'Preferences'], ret: 'Name, price, indoor/outdoor, links', ai: 'chatgpt' }
    ]);
    const pr = await store.get(p.id);
    const s1 = await store.addStep(p.id, { kind: 'split', ai: 'chatgpt', message: P.buildSplit(v0, { short: true }), status: 'done' });
    await store.updateStep(p.id, s1.id, { status: 'done', archiveId: 'a1', url: 'https://chatgpt.com/c/1' });
    const s2 = await store.addStep(p.id, { kind: 'task', ai: 'gemini', taskId: pr.tasks[0].id, message: 'x', status: 'done' });
    await store.updateStep(p.id, s2.id, { status: 'done', archiveId: 'a2' });
    await store.updateTask(p.id, pr.tasks[0].id, { status: 'done', result: '12°C, rain after 2 pm — not good for outdoor plans.\nSource: https://weather.gov' });
    const s3 = await store.addStep(p.id, { kind: 'task', ai: 'chatgpt', taskId: pr.tasks[1].id, message: 'x', status: 'waiting' });
    await store.updateTask(p.id, pr.tasks[1].id, { status: 'running' });
    if (location.hash === '#updated') {
      await store.updateStep(p.id, s3.id, { status: 'done' });
      await store.updateTask(p.id, pr.tasks[1].id, { status: 'done', result: 'Art Institute $32 indoor' });
      const v1 = v0.replace('## Decisions\n(none)', '## Decisions\n- Indoor activities only 〔AI · basis: weather task〕')
        .replace('Indoor or outdoor?', 'Which museum, or both?\nRemoved "Indoor or outdoor?": settled by the weather result.')
        .replace('Just started.', 'Candidates: Art Institute $32, Field Museum $30 (both indoor).');
      await store.addMemoryVersion(p.id, v1, 'Gemini', 'AI update');
      await store.addStep(p.id, { kind: 'mem-update', ai: 'gemini', message: 'x', status: 'error', error: 'No mem block in the answer' });
    }
  })();
})();

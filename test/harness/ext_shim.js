// Runs the real manager UI on http://localhost (for demos / Claude in Chrome) by sending its chrome.runtime
// messages through content.js's agyTestRequest relay to the real extension. Needs "Dev harness" on.
// Storage is a page-local stand-in (settings only); engine progress is polled since broadcasts don't reach the page.
(() => {
  const listeners = [];
  const local = { preferredMode: 'panel' };
  const noop = { addListener() {} };

  function relay(action, payload) {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      document.addEventListener('agyTestResponse_' + id, (e) => resolve(JSON.parse(e.detail)), { once: true });
      document.dispatchEvent(new CustomEvent('agyTestRequest', { detail: JSON.stringify({ id, action, payload }) }));
    });
  }

  window.chrome = {
    runtime: {
      lastError: null,
      sendMessage(msg, cb) {
        const p = /^(wf_|bridgeCommand)/.test(msg.action) ? relay(msg.action, msg.payload) : Promise.resolve({ status: 'success' });
        if (cb) p.then(cb);
        return p;
      },
      onMessage: { addListener(fn) { listeners.push(fn); } },
      getURL: (s) => s
    },
    storage: {
      local: {
        get(keys, cb) {
          const out = {};
          [].concat(keys || Object.keys(local)).forEach(k => { if (k in local) out[k] = local[k]; });
          const p = Promise.resolve(out); if (cb) p.then(cb); return p;
        },
        set(obj, cb) { Object.assign(local, obj); const p = Promise.resolve(); if (cb) p.then(cb); return p; }
      },
      onChanged: noop
    },
    tabs: { query: async () => [], onUpdated: noop, onCreated: noop, onRemoved: noop },
    windows: { getLastFocused: async () => null, onFocusChanged: noop, WINDOW_ID_NONE: -1 }
  };

  setInterval(async () => {
    const res = await relay('wf_getCurrent', {});
    if (res.status === 'success' && res.projectId) {
      listeners.forEach(fn => fn({ action: 'workflowUpdate', payload: { projectId: res.projectId } }));
    }
  }, 2000);
})();

# Tests and dev tools

| File | What it is |
|---|---|
| `workflow_prompts.test.js` | Node tests for prompt builders and parsers: `node test/workflow_prompts.test.js` |
| `project_store.test.js` | Node tests for the Projects store (in-memory storage stub): `node test/project_store.test.js` |
| `ui_preview/run.sh` + `stub.js` | Headless Chrome screenshots of the manager with fake data and a fake `chrome` API → `/tmp/wm_preview/` |
| `harness/index.html` | Bare dev page: raw project state + buttons for each step kind; `window.harness` for scripts |
| `harness/ext_shim.js` + `demo.sh` | The **real** manager UI on localhost, wired to the real extension |
| `api_tester.js`, `bridge_tester.js`, `sandbox_tester.js` | Old Phase 1 console scripts (paste into DevTools); kept for reference, not maintained |

## Live runs (real extension, real ChatGPT/Gemini)

1. Load the unpacked extension; open the manager with `?debug` (e.g. `ui/manager.html?mode=window&debug`) and turn on
   **Dev harness** in Settings.
2. Serve the repo root: `python3 -m http.server 8765 --bind 127.0.0.1`.
3. Either page talks to the background through `content.js`'s `agyTestRequest` relay (localhost + Dev harness only):
   - `http://localhost:8765/test/harness/` — raw state and step buttons.
   - `sh test/harness/demo.sh` builds `ui/_demo.html` (git-ignored) → open
     `http://localhost:8765/ui/_demo.html?mode=window` for the real Projects page. Progress is polled every 2 s.
4. After changing extension code, from either page:
   `chrome.runtime.sendMessage({action: 'wf_devReload'})` (demo page) or `harness.call('wf_devReload')`, wait ~3 s,
   reload the page (rebuild `_demo.html` if `ui/` changed).
5. Read state from the console: `wf_getCurrent`, then `wf_get {projectId}`; full answers via `wf_getArchive {archiveId}`.

Limits: Settings changed on the demo page stay in the page (the shim's storage is local), and Claude in Chrome
can't open extension pages, which is why these localhost pages exist.

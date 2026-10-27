# Workspace Manager — guide for coding agents

Read this first. It says what the project is now, where things live, how to test, and which docs matter for which
task. `CLAUDE.md` imports this file.

## What it is (October 2026)

A Chrome MV3 extension that works on top of AI chat sites (ChatGPT and Gemini tested; Claude and Copilot have profiles
but are untested). The manager opens in Chrome's side panel by default, or as a separate window.

| Page in the manager | What it does | State |
|---|---|---|
| **Projects** (default) | A piece of work as a step line: Describe → Plan → Run tasks → Combine → Continue. The extension opens chats, sends, waits, reads the answer, keeps a versioned project memory. | Phase 3 / 3.1, branch `phase-3-projects`, trial (v0.7) |
| **Send** | One prompt to several open chat tabs, live status per tab | Released in v0.6.0 |
| **Library** | Tabs Prompts (`@redo`, `@check`…) and Styles (answer styles → one `Output requirements:` line); picked with `;;` on chat sites and in our boxes, styles also via the `≡ Answer` button | Prompts released in v0.6.0; Styles = Phase 3.2 Step A (trial) |
| **Settings** | Panel/window, pop-up key, notifications, Projects options | — |

Hidden but kept in the code: Context Transfer, Broadcast, Orchestrator (`ui/modules/{context_transfer,broadcast,orchestrator}.js`).
Don't extend them; the Projects workflow replaced their ideas.

Why Projects exists: the user owns the workflow (memory, tasks, history live in the extension), so they can switch AI
provider halfway and stay in control. Design history: `doc/plan/phase_3_plan.md`, `doc/plan/phase_3.1_flow_plan.md`.

## Where things live

```
manifest.json            MV3; content scripts: bridge.js + styles_registry, library, picker_core, autocomplete + content.js (isolated), main_world.js (MAIN)
background.js            service worker: site profiles seed, side panel / window, message router, security gate,
                         importScripts the three Projects files below
bridge.js                content script: page primitives (writeToInput, clickSend, clickCopyButton, getGenerationSnapshot,
                         startTemporaryChat, …) driven by the active site profile's selectors
main_world.js            MAIN world: intercepts clipboard writes so copy buttons can be read
content.js               relays captured copies; dev-harness relay (agyTestRequest) for localhost
utils/
  workflow_prompts.js    Projects prompt text (%split %task %combine %mem-update %resume %fix), builders, parsers, diff
  project_store.js       Projects storage (projects, memory versions, tasks, steps, archives); serialized writes
  workflow_engine.js     runs one step: open chat → type+send → wait → copy-read → parse (%fix once) → save;
                         Combine starts the memory chore; temp-chat rules; wf_* message API
  site_profiles_registry.js, skills_registry.js   site profiles, saved prompts (15 starters)
  styles_registry.js     answer styles (built-ins, groups, per-place choice, the `Output requirements:` line)
  library.js             `query()` over prompts/styles/notes/memory for the picker (also `library_query` in background)
  picker_core.js         the one `;;` picker (list, groups, keys, ticks); autocomplete.js = its site overlay
ui/
  manager.html/.css/.js  the manager page; manager.js registers modules and Settings
  modules/projects.js    Projects step line (flowState() derives the steps from project data)
  modules/send.js        Send page
  modules/library_page.js, skills.js   Library page (tabs; Styles tab in library_page.js, Prompts tab in skills.js)
  modules/picker_tray.js the picker as an inline tray in our boxes + the `≡ Answer` button and style chips
  modules/markdown_view.js  small DOM-building Markdown renderer (memory read view)
presets/*.json           site profile presets (selectors); background.js seeds the same defaults
test/                    see test/README.md
doc/                     plans, roadmap, logs, experiments (below)
```

### Projects in one paragraph

A project = `memory[]` (markdown with 5 sections: Goal, Preferences, Decisions, Current state, Open questions; every
version kept) + `tasks[]` + `steps[]` (every message sent, with status, AI, chat URL, archived full answer). The UI
sends `wf_run {kind, ai, message, taskId}`; kinds are `split`, `task`, `combine`, `mem-update`, `resume`. Answers
must end in a fenced block (`tasks`, `result`, `mem`) except `combine` and `resume`. Plan, tasks and memory updates
run in **temporary chats** by default (ChatGPT `?temporary-chat=true`; Gemini clicks its Temporary chat button);
Combine and Continue are normal chats the user keeps. After Combine, the engine updates the memory by itself (one
chore at a time per project, refused if the memory changed meanwhile); the Plan answer may also carry a `mem` block
(saved the same way), and "Ask AI to tidy" (`wf_tidyMemory`) runs the chore by hand. **Progress** (plan, task
status + first line of each result, next step) is built from project data by `WorkflowPrompts.buildProgress`, never
stored, and added when the memory is shown, inserted with `;;` or used by Continue.

### Storage keys (`chrome.storage.local`)

`projects`, `archives`, `currentProjectId` (Projects) · `keepWorkerTabs`, `tempChatsForWork` (default on),
`choresAi` (`same`|`chatgpt`|`gemini`), `devHarness` · `preferredMode` (`panel`|`window`), `siteProfiles`, `skills`,
`skillsDefaultsVersion`, `styles` ({custom, edits}), `styleChoice` ({site, send, projects}), `autocompleteTriggerChar`, `enableWebpageAutocomplete`, `notifyWhenDone`.

### Security gate

`background.js` allows `bridgeCommand`, `switchTab` and `wf_*` only from extension pages, or from
`http://localhost` / `127.0.0.1` when the `devHarness` setting is on. Keep new privileged actions behind it.

## How to test

| What | How |
|---|---|
| Unit tests | `node test/workflow_prompts.test.js`, `node test/project_store.test.js`, `node test/library.test.js` |
| Screenshots of the Projects UI with fake data | `sh test/ui_preview/run.sh` → `/tmp/wm_preview/*.png` (states: `#new`, default, `#combine`, `#combined`, `#empty`, `#library`, `#library-styles`, `#send-answer`; light/dark; 380px panel) |
| Real UI against the real extension | see "Live runs" in `test/README.md` (localhost + dev harness) |

Live-run gotchas (all learned the hard way):
- Claude in Chrome can't open `chrome-extension://` or `chrome://` pages; use the localhost pages instead.
- After changing extension code: call `wf_devReload` from a localhost page, wait ~3 s, then reload the page.
- The Projects page re-renders on every update, so element refs from `find` go stale; click via JS
  (`[...document.querySelectorAll('#proj-flow button')].find(b => b.textContent.startsWith('Plan with')).click()`).
- Gemini doesn't render answers in hidden tabs; the engine "peeks" (brings the tab forward 1.5 s).
- Typing needs the tab in front for a moment; steps share a focus lock (`withFocus`).
- On the localhost demo page, Settings are page-local and do **not** reach the extension; change real settings in
  the extension's own Settings page (or rely on defaults).
- Live runs create real chats in the user's ChatGPT/Gemini accounts; prefer small tasks and tell the user.
- Testing the `;;` picker on a real site: Enter in the message box sends. Before pressing Enter, install a guard in the
  page that blocks the send request (ChatGPT: `fetch` POST to `/backend-api/f/conversation`; Gemini: XHR to
  `StreamGenerate`). ProseMirror reads several DOM edits made in one go as one change and can turn a cross-paragraph
  change into an Enter key (ChatGPT then sends the old text); edit rich editors one step per tick (`SitePicker.applyStyles`).

## Docs: what to read for which task

| Task | Read |
|---|---|
| How the pieces fit (contexts, messages, data model, dependencies, toolchain) | `doc/architecture.md` |
| Next phase (Library: prompts, styles, notes, one picker) | `doc/plan/phase_3.2_library_plan.md`, then `phase_3.2a_polish_plan.md` |
| Anything in Projects | `doc/plan/phase_3.1_flow_plan.md`, then `phase_3_plan.md`; prompt wording rationale in `doc/experiments/memory_workflow/prompts_v2.md` |
| What's done / next | `doc/roadmap.md` (the "Phase 3 (new)" section) |
| Why something was done | latest `doc/log/*.md` (newest: `2026_10_27_12.md`) |
| Site selectors broke | `presets/*.json`, `background.js` default profiles, `doc/debug_skill.md` |
| Original vision (dated) | `doc/specification.md` — Firefox-era spec; the Orchestrator/Context Transfer parts are superseded |

## Conventions

- Plans go in `doc/plan/`; every code change gets a log entry in `doc/log/YYYY_MM_DD_HH.md` following `doc/SKILL.md`;
  tick `doc/roadmap.md` as work lands.
- Match the surrounding code: plain JS, no build step, no dependencies; small helper `el()` builds DOM in modules.
- Commit on the feature branch; never push, merge, tag or release without the user's explicit OK.
- The user reads Chinese answers by preference and decides UX; keep explanations short and plain.

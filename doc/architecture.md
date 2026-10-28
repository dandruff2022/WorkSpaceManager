# Architecture, toolchain and dependencies

State as of 2026-10-26, branch `phase-3-projects` (v0.6.0 released features + the Projects trial). For a quick map
of files and conventions, see `AGENTS.md`; this document explains how the pieces fit together.

## 1. Runtime contexts

A Chrome MV3 extension has four places where code runs. Each file belongs to exactly one:

```
┌──────────────────────────── Chrome ────────────────────────────────────────────────────────────┐
│                                                                                                │
│  Manager page (side panel or window)        Background service worker                          │
│  ui/manager.html                            background.js                                      │
│   ├ ui/manager.js (shell, nav, Settings)     ├ importScripts: workflow_prompts.js,             │
│   ├ ui/modules/projects.js                   │   project_store.js, workflow_engine.js           │
│   ├ ui/modules/send.js                       ├ message router + security gate                  │
│   ├ modules/library_page.js + skills.js      ├ side panel / window switching                   │
│   └ utils/workflow_prompts.js (builders)     ├ tab tracking, "answer ready" notifications      │
│              │  chrome.runtime messages      └ seeds site profiles on install/update            │
│              └──────────────────────────────►            │ chrome.tabs.sendMessage              │
│                                                          ▼                                     │
│  Chat site tab (chatgpt.com, gemini.google.com, …)                                             │
│   ├ isolated world: bridge.js (page primitives), picker files (;; overlay), content.js         │
│   └ MAIN world:     main_world.js (wraps clipboard writes, SPA navigation)                     │
│                                                                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Context | Can do | Can't do |
|---|---|---|
| Manager page | UI, `chrome.storage`, messages to background | Touch chat pages directly |
| Background | Open/focus/close tabs, message any tab, notifications, storage | See page DOM; it may be stopped by Chrome at any time (state lives in storage) |
| Isolated content script | Read/write the page DOM, `chrome.runtime` messages | Call the page's own JS functions |
| MAIN world script | Wrap the page's `navigator.clipboard` | Use extension APIs (talks to `content.js` via `CustomEvent`) |

## 2. Site abstraction: profiles + bridge

Every chat site is described by a **site profile** (`presets/*.json`; the same defaults are seeded into storage by
`background.js` `onInstalled`, key `siteProfiles`): domain, new-chat URL and CSS selectors for the input, send,
stop, copy (AI vs. user), message turns, new chat and (Gemini) temporary chat.

`bridge.js` picks the profile matching the page host and exposes generic commands, called as messages
`bridge_<command>`:

| Command | Does |
|---|---|
| `writeToInput`, `clickSend` | Type into the box (handles textarea and contenteditable / React), press send |
| `clickCopyButton {type, index}` | Click a copy button and capture what the site writes to the clipboard (via `main_world.js`); falls back to DOM text. Returns `source: 'clipboard'|'dom'` |
| `getGenerationSnapshot` | Quiet poll: stop button visible, number of AI copy buttons, input present/length, URL |
| `startTemporaryChat` | Click the profile's temporary-chat button (Gemini) |
| `clickNewChat`, `clickStopButton`, `scrollToBottom`, `scanInitialState`, `getConversationTurnCount`, `getCopyButtonsList`, `ping` | As named |
| `observeGenerationState` | MutationObserver that reports `working`/`done` changes (`bridge_state_change`) for the Send page |

So site differences live only in selectors; when a site changes its page, fix the profile, not the engine.

## 3. Message routing and the security gate

All messages go through `chrome.runtime`. The background router (`background.js`):

1. Checks the sender for privileged actions (`/^(bridgeCommand|switchTab|wf_)/`): allowed from extension pages, or
   from `http://localhost` / `127.0.0.1` pages only when the `devHarness` setting is on. Anything else is refused,
   so a random web page can't drive the user's chat tabs.
2. Gives `wf_*` messages to `WorkflowEngine.handleMessage`.
3. `bridgeCommand {tabId, command, payload}` → injects the content scripts if missing (`ensureContentScript`) →
   forwards `bridge_<command>` to the tab → returns its answer.
4. `bridge_state_change` from a tab → triggers an "answer ready" notification if appropriate → rebroadcasts to the
   manager page.
5. `switchTab`, `switchViewMode`, `closeDetached`, `querySkills` (for the `;;` pop-up) as named.

`content.js` also relays `agyTestRequest` DOM events from localhost pages into runtime messages (dev harness only).

## 4. Features and their flows

### Library and the `;;` picker — v0.6, extended in Phase 3.2
Kinds of saved text: Prompts `@` (`utils/skills_registry.js`, `skills` key; 15 starters, the original 4
`@redo @continue @shorten @check` can't be deleted), Styles `≡` (`utils/styles_registry.js`, answer styles that become
one last line `Output requirements: …`), Memory `◆` (project memory, labelled `[Project memory vN: Title]`), Notes `✎`
(`utils/notes_store.js`, labelled `[Note: Title]`). `utils/library.js` `query()` turns them into picker items; `utils/picker_core.js` renders the one picker.
- Chat sites: `utils/autocomplete.js` (`SitePicker`) shows it as an overlay in a shadow root, asks the background
  `library_query` (read-only; `querySkills` is an alias), inserts prompts/memory as a paragraph and writes/replaces/removes
  the styles line. Stateless: the line in the box is the state (the last ticks are kept in `styleChoice.site`).
- Our pages: `ui/modules/picker_tray.js` shows it as an inline tray above the box and adds the `≡ Answer` button
  (Send, Projects steps, Combine). Stateful: ticks are `styleChoice.send` / `.projects`, applied when the message is built.
- Library page (`ui/modules/library_page.js` + `skills.js`): tabs Prompts / Styles; built-ins editable with Reset; the ✎
  in a picker row dispatches `wmOpenLibrary {group, id}` to open the item there.

### Notes — Phase 3.2 Step B
The user's own notes (`ui/modules/notes.js`): list with search, editor that saves as you type (one version per burst of
typing, 5 min), versions with Restore, Undo, Delete. Only the background owns the store (`self.NotesStore`, made in
`background.js` with an `onChange` hook that broadcasts `notesUpdate`); pages read and write through `wf_note*`
messages, so the page, the engine and the context menu never overwrite each other.
- **AI edit, on request only**: Tidy / Rephrase / Structure / own words, for the selection or the whole note →
  `wf_noteEdit` → engine `editNote` → one temporary chat on the chores AI (`askOnce`, `%fix` once) → answer in a
  ```` ```note ```` block → stored as a proposal in `note.edit` → the page shows a line diff → Apply
  (`wf_noteApplyEdit`, puts a part back into the note as it is now) or Discard. A late answer for a discarded request
  is dropped (`setEdit(…, onlyAt)`).
- **In**: right-click selected text on any page → "Save to Notes" (context menu, with the page URL); "Save to Notes" on
  a full answer in Projects.
- **Out**: `;;` everywhere (Notes tab of the picker); "Start a project" fills the new-project form with the note.

### Send — v0.6
`ui/modules/send.js` lists open chat tabs, sends one prompt to the ticked ones through `bridgeCommand`
(`writeToInput` + `clickSend`), and starts `observeGenerationState` on each; status chips update from
`bridge_state_change`. Only works while the manager page is open.

### Projects — v0.7 trial
Three layers:

| Layer | File | Role |
|---|---|---|
| Prompts | `utils/workflow_prompts.js` | Fixed prompt text (`TEXT.split/splitMem/task/combine/memUpdate/memStyle/resume/short/fix`), `buildProgress`/`withProgress`, message builders, block parsers (`extractBlock` with nesting), memory section parser and diff. Pure functions, shared by page and worker, Node-testable. |
| Store | `utils/project_store.js` | `createProjectStore(area)` over `chrome.storage.local` (or a stub in tests). All writes go through a lock. |
| Engine | `utils/workflow_engine.js` | Runs steps in the background, independent of the page being open. |
| UI | `ui/modules/projects.js` | `flowState(project)` derives the step line; builds messages for the user to read/edit; sends `wf_run`. |

**Data model** (key `projects`, one object per project):
```
project { id, title, mainAi, planSkipped, createdAt, updatedAt,
          memory: [{ v, text, by, at, note }],                 ← every version kept; undo pops the last
          tasks:  [{ id, title, task, needs[], ret, ai, status: todo|running|done|needs-you, result, stepId }],
          steps:  [{ id, kind, ai, taskId, parentId, temporary, baseAt, message, status, url, tabId,
                     archiveId, error, startedAt, endedAt }] }
archives { id: full answer text }                               ← key `archives`, referenced by step.archiveId
```

**One step** (`runStep`):
```
open chat tab (inactive, last-focused window; temporary chat for split/task/mem-update unless turned off)
  → wait for page load + message box
  → typeAndSend: [focus lock] bring tab forward, write, press send until the page confirms, give focus back
  → (resume: show the tab, save its real URL, done)
  → waitForAnswer: poll snapshot every 2 s; done = new copy button + no stop button, twice; peek after 3 idle polls
  → readLastAnswer: copy button (prefer clipboard Markdown; retry with tab+window focused)
  → parse the expected block; if missing, send %fix once in the same chat
  → archive the full answer; apply (set tasks / task result / new memory version)
  → close the tab (unless keepWorkerTabs, Combine, Continue, or something needs the user)
```
Step status: `sending → waiting → reading → done | needs-you | error`. Progress is written to storage and announced
with `workflowUpdate`; the page reloads the project on each. On worker restart, `recoverInterrupted` marks
unfinished steps as interrupted.

**After Combine**: the engine queues a memory update ("chore") per project: built from the latest memory + task
results + the final answer, run on the chores AI (`choresAi`, default the project's main AI) in a temporary chat, and
refused if the memory changed while it ran (`baseAt`).
**Other memory updates**: the Plan answer may carry a `mem` block before `tasks` (saved only over the memory the plan
started from, `baseAt` set by `startStep`); "Ask AI to tidy" (`wf_tidyMemory`) runs the same chore without a Combine.
**Progress** (`WorkflowPrompts.buildProgress(project)`: plan, each task's status and first result line, Combine,
next step) is derived from project data, never stored, and appended when the memory is shown (rendered by
`ui/modules/markdown_view.js`), inserted with `;;`, or sent with Continue.

**Message API** (`wf_*`): `list get create rename setOptions remove getCurrent setCurrent editMemory undoMemory
setTasks updateTask removeTask run retryChore openChat getArchive devReload`.

## 5. Storage keys

| Key | Owner | Meaning |
|---|---|---|
| `projects`, `archives`, `currentProjectId` | Projects store | see data model |
| `keepWorkerTabs` (false), `tempChatsForWork` (true), `choresAi` ('same') | Projects settings | engine reads them per step |
| `devHarness` (false) | Settings (debug only) | allows localhost dev pages |
| `siteProfiles` | background seed | site selectors |
| `skills`, `skillsDefaultsVersion` | skills registry | saved prompts; starters added once per version |
| `styles` ({custom, edits}), `styleChoice` ({site, send, projects}) | styles registry | answer styles; ticks per place (Projects default: Short) |
| `notes` ({id: {id, title, text, versions[{text, by, at, note}], edit, createdAt, updatedAt}}) | notes store (background) | the user's notes; `edit` = AI request/proposal |
| `preferredMode` ('panel'), `panelDefaultV07`, `triggerMigratedV06` | background | view mode + one-time migrations |
| `autocompleteTriggerChar` (';;'), `enableWebpageAutocomplete`, `notifyWhenDone` | Settings | v0.6 options |

## 6. Dependencies

**Runtime: none.** Plain JavaScript loaded directly by Chrome — no npm packages, no bundler, no framework, no
build step. Files share code through globals (`self.WorkflowPrompts`, `self.ProjectStore`, `window.ProjectsModule`)
and also `module.exports` where Node tests need them.

Browser requirements: Chrome with MV3, side panel API (Chrome 114+). Permissions: `tabs`, `storage`, `scripting`,
`sidePanel`, `unlimitedStorage`, `notifications`, `contextMenus` ("Save to Notes"); host access `<all_urls>` (content scripts on chat sites).
Firefox keys exist in the manifest (`sidebar_action`, background `scripts`) but Firefox is untested.

## 7. Toolchain

| Tool | Used for |
|---|---|
| Node (v24 here; any recent) | `node test/*.test.js` — no test framework, plain `assert` |
| Google Chrome (headless) | `test/ui_preview/run.sh` screenshots |
| `python3 -m http.server` | Serves the repo for the localhost harness and demo pages |
| Claude in Chrome | Drives live runs on the localhost pages (it can't open extension pages) |
| git | Feature branches per phase; nothing is pushed without the user's OK |
| Sub-agents (optional, in `claude-all`) | `gpt-reviewer` for independent review, `gemini-worker` for checkable chores |

Loading the extension: `chrome://extensions` → Developer mode → Load unpacked → repo root. Reload there, or from a
localhost dev page with `wf_devReload`. See `test/README.md` for the live-run steps.

## 8. Known constraints

- Typing requires the tab in front briefly; steps share a focus lock, so the user sees short tab switches.
- Gemini draws answers only in visible tabs → the engine peeks.
- Selectors break when sites change; Claude and Copilot profiles are not re-tested.
- Temporary chats can't be reopened; full answers stay in `archives`.
- `chrome.storage.local` holds everything (projects + archives) — fine for now; no export yet.

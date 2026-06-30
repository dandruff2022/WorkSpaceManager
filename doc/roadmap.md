# Workspace Manager: Project Roadmap

---

## Phase 0.5 — Extension Setup

Basic browser extension scaffolding and shell UI. No functional automation yet — goal is a working, launchable extension with the correct window type and navigation structure in place.

### Milestones

- [x] **Dev Tooling Setup**
  - Initialize Firefox extension project structure (`manifest.json`, background script, content script entry points).
  - Configure a development workflow with hot-reload (e.g., `web-ext` CLI).

- [x] **Detached Window & Side Panel**
  - Implement toolbar icon click handler that opens the manager UI (defaults to Detached Window mode via `browser.windows.create()` with `type: "popup"`).
  - Add option to toggle/switch presentation modes between Detached Window (default) and a Side Panel docked on the right side of the browser.
  - Ensure the window/panel persists and has appropriate close/toggle buttons.
  - Prevent duplicates: re-focus/re-open the existing manager instance if already open.

- [x] **Basic Layout**
  - Implement the two-panel shell: fixed left sidebar navigation + right content area.
  - Add navigation items for all five modules: Context Transfer, Broadcast, Orchestrator, Skills, Connection.
  - Each nav item switches the content area to a placeholder view (name + "coming soon").
  - Apply base dark-mode / glassmorphism styling tokens (colors, fonts, spacing).


---

## Phase 1 — Browser Bridge & Automation Primitives

This phase focuses exclusively on **interfacing with the browser and AI websites**. Prove the automation approach works, build and document every reusable web/browser interaction primitive the project depends on, and create functional layout placeholders for each module. Nothing should be automated in any module without first being validated here.

---

### Milestone 1.1 — AI Website Connection & Automation Testing Script

Develop and validate a comprehensive, console-injectable test runner script (`test/sandbox_tester.js`) to discover and test DOM selectors directly inside target AI websites (ChatGPT, Claude, Gemini, Copilot).

- [x] **Milestone 1.1.1 — Test Script Planning & Comment-Only Blueprint**
  - Create the skeleton structure of `test/sandbox_tester.js` composed entirely of detailed documentation comments detailing the complete test process.
  - Draft a thorough workflow that starts from a complete new chat, testing individual automation units (pasting/writing text, clicking send buttons, resetting chats, reading/copying text, reading ai status(empty, working, complete)) and chained interactions (sequential multi-turn copying).
  - Define strategies within the comments to handle tricky layout cases—such as inline code blocks(might have its own copy button and confuse the script), uploaded images/files, and collapsible segments—to ensure selectors correctly isolate main conversation text and buttons without timeline corruption.

- [ ] **Milestone 1.1.2 — Console Automation Test Script Implementation**
  - Program the testing logic in `test/sandbox_tester.js` using raw JS execution.
  - Prefix the script with a long, detailed system prompt block instructing any AI model how to modify and repair the script's selectors in case of layout drift.
  - Implement browser popups (`alert` / `confirm` dialogs) for each unit test step to prompt user confirmation of successful interactions (writing, sending, resetting, copying).
  - Implement successful-run JSON configuration file generation containing verified DOM selectors and flags.
  - Log helpful debugging info and self-correction prompts: upon failure, print instructions directing the user to copy/paste the script and error log into an AI tool for auto-updating.

- [ ] **Milestone 1.1.3 — Platform Verification & Default Config Export**
  - Execute the script manually in developer consoles on four mainstream AI platforms: ChatGPT, Claude, Gemini, and Copilot.
  - Refine selectors and rewrite rules until the script passes completely on all four sites.
  - Export and save the four `.json` configurations inside the extension resources as built-in default settings.

---

### Milestone 1.2 — Browser APIs & Tab Status Integration (Sandbox Testing)

Validate browser-level integration APIs in isolation using a temporary content/background script:

- [ ] **Tab activation capture** — monitor `chrome.tabs.onActivated` events when manually switching browser tabs; confirm active manager UI receives tab IDs.
- [ ] **Tab lifecycle tracking** — hook `chrome.tabs.onCreated`, `onRemoved`, and `onUpdated` to track tab openings, closures, and title changes (syncing nodes live).
- [ ] **Clipboard interception mechanism** — verify that `navigator.clipboard.writeText` can be overridden/intercepted inside the page context without corrupting the OS clipboard.
- [ ] **SPA navigation detection** — override `history.pushState` and `replaceState` to detect when a single-page application routes to a new conversation (New Chat detection).

---

### Milestone 1.3 — Interaction Primitive Library (bridge.js)

Implement a shared module (`bridge.js`) exposing typed, reusable functions. Every module in the project must use these functions — no module should re-implement raw DOM automation.

#### Web Interactions (Content Script — runs inside AI tab)

| Function | Used By | Description |
| :--- | :--- | :--- |
| `writeToInput(text)` | All modules | React value setter + bubbling `input` event. Hydrates the page's state and enables the send button. |
| `clickSend()` | All modules | Calls `.click()` on the mapped send button (primary). Falls back to `keydown Enter` on textarea if the profile has the fallback flag set. |
| `clickCopyButton(type, index)` | Context Transfer, Orchestrator | `type` can be `'user'` or `'ai'`. Simulates a `.click()` on the nth mapped copy button of that type. Intercepts `navigator.clipboard.writeText` to capture text in memory. |
| `getConversationTurnCount()` | Context Transfer | Counts the number of rendered message pairs (User + AI) in the DOM to determine the iteration limit for history reconstruction. |
| `clickNewChat()` | Orchestrator | Simulates a `.click()` on the mapped new chat button. |
| `clickStopButton()` | Orchestrator | Simulates a `.click()` on the stop generation button. Used to interrupt the chatbot before injecting a `Redo` or `Continue` action. |
| `scrollToBottom()` | Orchestrator | Locates the chat interface's scroll container and sets `scrollTop = scrollHeight` to force the view to the latest message. |
| `observeGenerationState(onChange)` | Orchestrator | Attaches a `MutationObserver` to the response container. Calls `onChange("working")` when the stop button appears; calls `onChange("complete")` when a copy button appears on the latest response. |
| `scanInitialState()` | Orchestrator | Called once on content script injection. Inspects the DOM for existing conversation history. Returns `"empty"` if no messages exist, or `"complete"` if a conversation is already present. Used to set the correct node state when the extension first connects to a tab. |
| `observeNavigation(onChange)` | Orchestrator | Hooks `history.pushState` / `replaceState`. Calls `onChange("new-chat")` when the URL changes to a new session, triggering node → Empty transition and edge cleanup. |
| `interceptClipboard(onWrite)` | All read operations | Injects a script into the page context that wraps `navigator.clipboard.writeText`. Calls `onWrite(text)` with the intercepted value before it reaches the OS clipboard. |

#### Browser API Interactions (Background Script — extension runtime)

| Function | Used By | Description |
| :--- | :--- | :--- |
| `tabs.query()` | Connection, Context Transfer, Broadcast, Orchestrator | Lists all open tabs across all windows. Requires `"tabs"` permission + host permissions (`"<all_urls>"` or per-domain) in `manifest.json` — without these, `url` and `title` fields are stripped, breaking domain filtering and tab labels. |
| `tabs.update({ active: true })` | Context Transfer, Broadcast, Orchestrator | Switches browser focus to a target tab programmatically (extension → browser direction). |
| `tabs.onActivated` | Orchestrator | Fires when the user manually clicks a tab in the browser (browser → extension direction). Used for bidirectional node-tab sync: updates the selected node in the Orchestrator graph to match whichever AI tab the user switched to. Non-AI tabs are ignored. Updates the active manager UI (window or panel). |
| `tabs.onCreated` | Orchestrator | Adds a new flat node to the graph when a connected AI tab is opened. |
| `tabs.onRemoved` | Orchestrator | Removes the node and cleans up all its edges when a tab is closed. |
| `tabs.onUpdated` | Orchestrator, Connection | Detects tab title changes (for node label sync) and URL changes (delegated to `observeNavigation`). |
| `tabs.sendMessage()` / `runtime.sendMessage()` | All modules | Message bus between background script, content scripts, and the detached window. All automation calls are routed through here. |
| `runtime.onMessage` | Background script | Central dispatcher: receives action requests from the manager UI (window/panel), routes them to the correct content script in the correct tab. |
| `storage.local.get/set` | Connection, Skills, Context Transfer | Persists site profiles, user preferences (including preferred view mode: window vs side panel), custom skills, and the saved Transfer Prompt. |
| `windows.create()` / `windows.update()` / `sidebarAction` | Phase 0.5 (already done) | Opens/focuses the detached window or opens/toggles the side panel on the right. |
| `scripting.executeScript()` | All modules | Dynamically injects content scripts into a target tab on demand when automation is needed. |
| `ensureContentScript(tabId)` | All modules | Pings the target tab to verify the content script is active; dynamically injects `content.js` using `scripting.executeScript()` if the handshake fails. |

#### Message Protocol

All communication between the manager UI (detached window or side panel) and content scripts is routed through the background script using a typed message schema:

```
{ action: string, tabId: number, payload: object }
```

Document every `action` string used across all modules (e.g., `"write"`, `"send"`, `"copy"`, `"newChat"`, `"observeState"`, `"stopObserving"`).

---

### Milestone 1.4 — Interactive Module Placeholders & API Integration Examples

Using the working scaffolding UI implemented and interfaces designed in Phase 0.5, add functional layout placeholders to each module. These placeholders should feature interactive controls (like buttons and inputs) bound to example implementations of the browser/tab automation interfaces that will be used in the corresponding modules, demonstrating real-world usage.

- [ ] **Broadcast Module Placeholder**
  - Add UI controls simulating input and target tab selection.
  - Implement a demonstration button showcasing `tabs.query()` to get connected tabs and a mock injection cycle (simulated pasting to an input area).
- [ ] **Context Transfer Module Placeholder**
  - Add interactive dropdowns for "From" and "To" tabs.
  - Implement a mock transfer action showing sequential browser focus transitions and simulated input writing.
- [ ] **Orchestrator Module Placeholder**
  - Add static node placeholders representing different states (Empty, Working, Complete, Waiting).
  - Implement buttons for testing task breakdown generation, node renaming, and mock tab activation sync.
- [ ] **Skills & Connection Module Placeholders**
  - Include placeholder lists for Custom/System skills and registered profiles.
  - For the Connection module, provide a JSON input textarea field to paste or load generated `.json` website configurations to register website DOM selector profiles manually, showing a mock validation result.

---

## Phase 2 — Internal State & Data Management

While Phase 1 handled interfacing with the browser and AI websites, Phase 2 focuses on constructing the internal state, data structures, and data management logic. Once these are correctly handled, the UI will be built on top of them.

### Milestone 2.1 — Internal State & Data Structures

Design and implement the logic for managing application state using the available browser extension storage and memory APIs.

- [ ] **Ephemeral Orchestrator Node Graph**
  - **Structure**: A forest of strict trees where each node maps 1:1 to an active AI tab. Nodes track `tabId`, `parentId`, `executionState` (Empty, Working, Complete, Waiting), and an independent `editorCache` string. Edges track visual flow states (Staged, Active, Dimmed).
  - **Lifecycle & Management**: Completely ephemeral in-memory state. Rebuilt from `tabs.query` on window open. Managed bidirectionally: switching browser tabs updates the active node, and clicking a node switches the browser tab. Edges never break automatically on send; they only sever when a tab is closed or a node transitions to `Empty` via a "New Chat" action.
- [ ] **Persistent Skills Registry**
  - **Structure**: A dictionary mapping `@keywords` to prompt templates, segmented into read-only System skills (e.g., `@redo`, `@format`) and mutable Custom user skills.
  - **Lifecycle & Management**: Persisted in `storage.local`. System skills are bootstrapped on install/update. Custom skills undergo CRUD operations through the UI and are immediately synced to local storage to persist across extension restarts.
- [ ] **Site Profiles & Connection State**
  - **Structure**: **Site Profiles** persist DOM element selectors (Input, Send, New Chat, Copy buttons) and fallback flags (e.g., Enter key simulation). **Active Connections** is an in-memory list tracking which open browser tabs match these profiles and whether the user has toggled them "on" for the current session.
  - **Lifecycle & Management**: Site profiles persist in `storage.local` and are imported/updated via JSON config files. The Active Connections list is dynamically synchronized in real-time with browser events (`tabs.onCreated`, `tabs.onRemoved`, `tabs.onUpdated`).
- [ ] **Module-Specific Drafts & Configurations**
  - **Structure & Management**:
    - **Context Transfer**: The overarching *Transfer Prompt* buffer is saved on-edit to `storage.local` to survive closures. The "From" / "To" active selections are ephemeral memory states.
    - **Broadcast**: The *Broadcast Prompt* is saved on-edit to `storage.local`. The selected checklist of target tabs is ephemeral memory state, strictly validated against the Active Connections Registry before dispatch.

### Milestone 2.2 — Skills Module UI

Build the UI for the Skills module over the newly implemented state management.

- [ ] **System vs Custom Skills Lists** — Display read-only system skills and provide CRUD UI for custom skills.
- [ ] **UI State Binding** — Connect the UI controls to the local storage accessors defined in Milestone 2.1.

### Milestone 2.3 — Connection Module UI

With state management solidified and primitives validated, implement the full Connection Module UI.

- [ ] **Connected Websites list** — CRUD list of registered site profiles; "Import Config" button to load JSON settings.
- [ ] **JSON Import Interface** — Text area/file input to paste/load the `.json` config generated by the sandbox test script.
- [ ] **Manual configuration editor** — View and manually edit the CSS selectors (Input, Send, New Chat, Copy buttons) for any profile.
- [ ] **Config validation & status indicator** — Basic validator to check if imported JSON matches the required schema.
- [ ] **Connected Tabs panel** — lists open tabs matching registered domains; checkbox per tab to toggle connection status; updates live via `tabs.onCreated` / `tabs.onRemoved`.

---

## Phase 3 — Context Transfer & Broadcast Integration

Implement UI and functionality for **Context Transfer** and **Broadcast**. Collect issues and difficulties met during implementation to pave the way for the harder parts (like the Orchestrator).

### Milestone 3.1 — Context Transfer Module Implementation

- [ ] **UI Assembly** — Build the Context Transfer interface (From/To selectors and transfer action button).
- [ ] **Functional Wiring** — Connect the UI to the internal state and interaction primitives to execute end-to-end conversation extraction, tab switching, and injection sequences.

### Milestone 3.2 — Broadcast Module Implementation

- [ ] **UI Assembly** — Build the Broadcast interface (target tab checklist, prompt editor, and broadcast action button).
- [ ] **Functional Wiring** — Connect the UI to the interaction primitives to execute prompt deployment across multiple selected tabs.

### Milestone 3.3 — Issue Tracking & Retrospective

- [ ] **Collect Implementation Issues** — Document edge cases, bugs, and API limitations encountered during the development of Context Transfer and Broadcast.
- [ ] **Assess Risk for Orchestrator** — Use the collected data to refine the technical approach and de-risk the subsequent development of the complex Orchestrator module.

---

## Phase 4 — Orchestration

Build the Orchestrator module, the crown jewel of the extension, to coordinate complex, multi-tab AI workflows. This phase realizes the visual navigation graph, strict tree management, bidirectional tab synchronization, and advanced parsing behaviors (dispatch, breakdown, merge) defined in the specification.

### Milestone 4.1 — Orchestrator UI Shell & Canvas

- [ ] **Split Layout** — Implement the horizontal split layout featuring the Navigation Graph canvas on the top and the Node Action Center on the bottom.
- [ ] **WYSIWYG Editor Cache** — Build a single, flat text area for the Action Center. Ensure its contents uniquely persist in memory per node, dynamically swapping when the user selects different nodes, and clearing upon a successful "Send".

### Milestone 4.2 — Graph Core & Node Rendering

- [ ] **1:1 Node Mapping** — Ensure nodes start completely flat and map exactly 1:1 to open AI tabs. 
- [ ] **Node Execution States** — Implement dynamic rendering for the four states: **Empty** (hollow/outline, dispatch-eligible), **Working** (spinner/pulse), **Complete** (checkmark/glow), and **Waiting** (clock/hourglass).
- [ ] **Bidirectional Sync** — Wire the UI so that clicking a node programmatically switches browser focus and auto-scrolls to the bottom of the chat; conversely, switching browser tabs updates the active highlighted node.

### Milestone 4.3 — Edge Drawing & Graph Lifecycles

- [ ] **Visual Edge Connectors** — Implement the three edge states: **Staged** (dotted line, user-draggable), **Active** (solid arrow), and **Dimmed** (faded arrow, naturally dimming with subsequent interactions).
- [ ] **Strict Targeting Constraints** — Enforce that Dispatch edges require an `Empty` target, while manual Merge edges require a `non-Empty` target.
- [ ] **Persistent Structure** — Program the edge lifecycle rule: edges never break on standard sends or state changes; they only break explicitly when a node transitions to `Empty` (via New Chat) or when its corresponding browser tab closes.
- [ ] **Dynamic Cascading Layout** — As edges form, automatically reposition nodes from a flat list into a left-to-right cascading tree.

### Milestone 4.4 — Base Action Center Mechanics

- [ ] **Send Execution** — Implement the critical path: on Send, submit the editor cache to the active tab's input box, trigger the website's send button, and transition the node to `Working`.
- [ ] **New Chat Trigger** — Implement the `New Chat` action: trigger the mapped website button, reset the node to `Empty`, break all connected edges, and clear the prompt cache.
- [ ] **General Skills Hookup** — Wire up the buttons for `@redo`, `@shorten` (which should visually highlight when a dispatched child completes), and `@continue` to inject into the cache without sending.

### Milestone 4.5 — Complex Dispatch (`@format` & `@breakdown`)

- [ ] **Strict Read Rule** — Implement the mechanical foundation for all orchestration reads: **only read the last AI response** via the copy-button mapping.
- [ ] **Breakdown Assistance** — Implement the `Task Breakdown` button which injects `@breakdown` into the cache to have the AI plan its work prior to formatting.
- [ ] **Dispatch Parsing & Limit Enforcements** — Implement the `Dispatch` action (`@format`). Upon completion, parse the final AI response by splitting on `===`. Extract the `Title` and `Task` fields. Enforce a strict maximum limit of 3 tasks.
- [ ] **Graph Mutation (Spawning Children)** — For each extracted task: draw a Staged line to an `Empty` node (defaulting to available tabs in order), populate the child's editor cache with the extracted `Task`, rename the child node using the `Title`, and transition the parent node to `Waiting`.

### Milestone 4.6 — Complex Merge Behaviors (`@merge`)

- [ ] **Child-to-Parent Auto-Targeting** — When merging a dispatched child's result, auto-target the edge to the parent node without requiring dragging.
- [ ] **Edge Reversal** — Upon successful merge submission, visually reverse the parent→child Active arrow into a child→parent Active arrow.
- [ ] **Independent Merging** — Allow users to drag a Staged line from any node to any `non-Empty` target node to combine unrelated threads.
- [ ] **Data Appending** — Implement the core merge logic: read the child's last AI response, prepend the `@merge` prompt, and **append** it to the target parent's editor cache alongside a clean visual separator (`--- [Child Name Result] ---`).

### Milestone 4.7 — Error Recovery & Usage Patterns

- [ ] **Non-Intrusive Error Recovery** — Build the fallback UX for `@format` parsing failures (e.g., 0 tasks extracted) or limit excesses (>3 tasks). Display a visual warning and highlight the **Redo** and **Continue** buttons.
- [ ] **Undo / Rollback Actions** — Ensure that triggering `Redo` clears the parent cache to restart, while triggering `Continue` abandons the dispatch, clears pending child caches, and removes staged lines.
- [ ] **Pattern Validation** — Conduct final end-to-end testing against the three primary workflows defined in the spec: Single-tab skill injection, Two-tab side exploration (with manual merge), and Full orchestration cascading.

---

## Future Goals

### Future Plan 1 — "Get-Help" Code Assistant & Auto-Patching

Extend the Workspace Manager with a contextual developer assistant module that leverages open AI tabs in the background to automatically get coding help and patch files directly in the user's workspace.

#### **Design & Workflow**
1. **Background Relay Chat**: A chat interface in the extension popup/sidepanel redirects user prompts to active AI tabs (ChatGPT/Claude/Gemini/Copilot) running in the background.
2. **Context Aggregator**: The extension scans the local workspace file system via the Node/Python sidecar, bundles relevant file contents as code context, and prepends it to the prompt.
3. **Structured Prompt Format**: Injects strict formatting rules (e.g. asking for unified diffs or JSON blocks) to ensure the AI's response is structured.
4. **Scraper & Parser**: Scrapes the final AI response, extracts the code diffs, and feeds them to the sidecar.
5. **Interactive Staging**: Displays a side-by-side Git-style diff in the extension UI, letting the user inspect and approve proposed patches before they are written to disk.

#### **Concerns & Mitigations**
* **Security Sandboxing (Manifest V3)**: Extension context cannot execute dynamically fetched code (`eval` is blocked).
  * *Mitigation*: The extension's execution code remains static. It acts only as an orchestrator and UI. All file operations and system-level edits are performed on localhost by the sidecar process, keeping the browser sandbox fully secure.
* **Parsing Fragility**: LLMs may fail to follow formatting instructions, returning loose explanations or corrupted diffs.
  * *Mitigation*: Fall back to a fuzzy patch parser, or provide a "Repair Prompt" action that tells the AI exactly which part of its output failed to parse so it can correct itself.
* **Overwriting Safety**: Direct file writes can cause data loss.
  * *Mitigation*: Never write directly to disk without user approval. Force a mandatory human-in-the-loop preview step before executing any patch write.

### Future Plan 2 — Global Split-Pane Canvas Integration

Unify the spatial concept of AI tab nodes by turning the Orchestrator graph canvas into a persistent split-pane sidebar visible across all primary tabs (Broadcast, Context Transfer, Orchestrator).

#### **Design & Workflow**
1. **Persistent Left Panel**: A persistent vertical column displaying the open tabs as active node boxes with color-coded generation states.
2. **Context-Sensitive Actions**:
   * **In Broadcast**: Nodes show checkbox overlays. Clicking a node selects it for prompt dispatch.
   * **In Context Transfer**: Supports dragging connection lines from one node (Source) to another (Target) to execute context transfers.
   * **In Orchestrator**: Expands to full canvas showing cascading execution trees.

#### **Concerns & Mitigations**
* **Popup Real Estate Constraints**: The Chrome popup has a strict 800px width limit.
  * *Mitigation*: Use a clean 30:70 split pane layout, keeping the canvas narrow and focused on node boxes, reserving the wide pane for prompt editors.
* **Modal Context Confusion**: Multi-use gestures (clicking vs dragging) can confuse users.
  * *Mitigation*: Dynamically change node visual indicators (checkboxes vs connector handles) based on the active tab header.

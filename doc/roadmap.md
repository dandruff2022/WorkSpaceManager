# Workspace Manager: Project Roadmap

---

## Phase 0.5 — Extension Setup

Basic browser extension scaffolding and shell UI. No functional automation yet — goal is a working, launchable extension with the correct window type and navigation structure in place.

### Milestones

- [ ] **Dev Tooling Setup**
  - Initialize Firefox extension project structure (`manifest.json`, background script, content script entry points).
  - Configure a development workflow with hot-reload (e.g., `web-ext` CLI).

- [ ] **Detached Window & Side Panel**
  - Implement toolbar icon click handler that opens the manager UI (defaults to Detached Window mode via `browser.windows.create()` with `type: "popup"`).
  - Add option to toggle/switch presentation modes between Detached Window (default) and a Side Panel docked on the right side of the browser.
  - Ensure the window/panel persists and has appropriate close/toggle buttons.
  - Prevent duplicates: re-focus/re-open the existing manager instance if already open.

- [ ] **Basic Layout**
  - Implement the two-panel shell: fixed left sidebar navigation + right content area.
  - Add navigation items for all five modules: Context Transfer, Broadcast, Orchestrator, Skills, Connection.
  - Each nav item switches the content area to a placeholder view (name + "coming soon").
  - Apply base dark-mode / glassmorphism styling tokens (colors, fonts, spacing).


---

## Phase 1 — Browser Bridge & Automation Primitives

This phase focuses exclusively on **interfacing with the browser and AI websites**. Prove the automation approach works, build and document every reusable web/browser interaction primitive the project depends on, and create functional layout placeholders for each module. Nothing should be automated in any module without first being validated here.

---

### Milestone 1.1 — Proof of Concept (Sandbox Testing)

Before any UI is built, validate each automation primitive in isolation using a standalone content script injected into a live AI tab. Document the result (pass / fail / caveat) for each test.

- [ ] **Write test** — inject text via React value setter + bubbling `input` event; confirm send button becomes enabled.
- [ ] **Submit test (primary)** — call `.click()` on send button after write; confirm message is submitted.
- [ ] **Submit test (fallback)** — dispatch synthetic `keydown Enter` on textarea; confirm message is submitted.
- [ ] **Copy test** — programmatically `.click()` a mapped copy button; confirm clipboard is populated with clean text.
- [ ] **Generation state detection** — attach `MutationObserver` to the response container; confirm it correctly signals `Working` (stop button appears) and `Complete` (copy button appears on latest response).
- [ ] **Initial Empty state scan** — on content script injection, inspect the DOM to determine whether any conversation history exists; confirm the correct `Empty` vs `Complete` state is reported back for node initialization.
- [ ] **SPA navigation detection** — hook `history.pushState` / `replaceState` overrides; confirm "New Chat" route change fires the detection callback and transitions the node to `Empty`.
- [ ] **Tab activation capture** — confirm `tabs.onActivated` fires when the user manually clicks a browser tab; confirm the active manager UI (window or panel) receives the event and updates the selected Orchestrator node accordingly.
- [ ] **Clipboard intercept** — mock `navigator.clipboard.writeText` inside the page context via an injected script; confirm the captured text matches the copy button output without touching the OS clipboard.

---

### Milestone 1.2 — Interaction Primitive Library

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
| `injectPickerOverlay(onSelect)` | Connection (Visual Picker) | Injects a hover-highlight overlay over the entire page. On element click, captures and returns the best stable CSS selector for that element, then removes the overlay. |
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

#### Message Protocol

All communication between the manager UI (detached window or side panel) and content scripts is routed through the background script using a typed message schema:

```
{ action: string, tabId: number, payload: object }
```

Document every `action` string used across all modules (e.g., `"write"`, `"send"`, `"copy"`, `"newChat"`, `"observeState"`, `"stopObserving"`, `"injectPicker"`).

---

### Milestone 1.3 — Interactive Module Placeholders & API Integration Examples

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
  - Include buttons to trigger demo interactions with local extension storage.

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
  - **Lifecycle & Management**: Site profiles persist in `storage.local` and are modified only via the Connection Wizard. The Active Connections list is dynamically synchronized in real-time with browser events (`tabs.onCreated`, `tabs.onRemoved`, `tabs.onUpdated`).
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

- [ ] **Connected Websites list** — CRUD list of registered site profiles; "New..." entry to launch wizard.
- [ ] **Visual Picker overlay** — "Pick Element" button activates `injectPickerOverlay()` in the target tab; captured selector auto-fills the mapping field.
- [ ] **Manual selector input** — text field accepting CSS Selector or XPath for each required binding.
- [ ] **Interaction method auto-detection** — during the Submit Test, if primary click fails within 3 seconds, silently retry with Enter fallback and record the fallback flag in the profile.
- [ ] **Connection Test Wizard** — three-step in-window wizard (Write → Submit → Copy), each step with a "Run Test" button and a "✓ Confirmed" gate; passing all three saves the profile.
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

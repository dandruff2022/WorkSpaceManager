# Phase 2.1 Planning Blueprint: Internal State & Data Management

This document outlines the design and implementation strategy for the application state, data structures, and storage logic in Phase 2.1.

---

## 1. Site Profiles Setup

This section describes how the extension matches open browser tabs to registered AI websites (using "Site Profiles").

### 1.1 Existing Assets
* **Pre-configured Website Settings (Site Profiles)**: Default HTML button selectors for ChatGPT, Claude, Gemini, and Copilot are loaded into `chrome.storage.local` under the `siteProfiles` key on startup (see [background.js](../../background.js#L80-L159)).
* **JSON Profile Validator**: Interactive validation code in the Connection tab checks if pasted configuration text contains required fields (see [connection.js](../../ui/modules/connection.js#L9-L49)).

### 1.2 Data Structure Design: Site Profiles Manager (`SiteProfilesRegistry`)

The `SiteProfilesRegistry` handles site settings metadata.

```
+-------------------------------------------------------------------------------+
|                             SiteProfilesRegistry                              |
+-------------------------------------------------------------------------------+
|  - profiles: Map<SiteName, SiteProfile>                                       |
+-------------------------------------------------------------------------------+
|  + load(): Promise<void>              --> Loads from storage.local            |
|  + save(): Promise<void>              --> Saves to storage.local              |
|  + getProfileForUrl(url): SiteProfile  --> Matches tab domains                |
|  + getAllProfiles(): SiteProfile[]     --> Returns list for UI                |
|  + addOrUpdateProfile(json): Promise   --> Imports & validates new settings   |
|  + deleteProfile(name): Promise       --> Deletes site profiles               |
+-------------------------------------------------------------------------------+
```

* **SiteProfile Schema**:
  * `siteName` (string): Friendly name (e.g. `"ChatGPT"`).
  * `domain` (string): URL hostname pattern to match (e.g. `"chatgpt.com"`).
  * `newChatUrl` (string): The URL for resetting conversations.
  * `selectors` (object): Map of DOM selectors (`inputSelector`, `sendButtonSelector`, `messageTurnSelector`, etc.).
  * `flags` (object): Custom behavior flags (e.g., `useEnterFallback`).
* **Storage Location**: Saved permanently in **`chrome.storage.local`** under the `siteProfiles` key so profiles survive extension updates.
* **Access Methods**:
  * `async load()`: Fetches profiles from local storage, seeding defaults if empty.
  * `async save()`: Writes the current profile map to local storage.
  * `getProfileForUrl(url)`: Extracts the hostname from a URL and returns the matching profile (or a fallback generic profile).
  * `getAllProfiles()`: Returns an array of profiles for listing.
  * `async addOrUpdateProfile(profileObj)`: Validates and saves a profile.
  * `async deleteProfile(siteName)`: Removes a profile.

### 1.3 How Site Profiles Are Used
* **Command Forwarding & Injection**: Before executing a script, the extension background script queries `SiteProfilesRegistry.getProfileForUrl(tab.url)` to retrieve the CSS selectors required to interact with the target chatbot.
* **UI Listing**: The Connection module UI lists all registered profiles and provides manual edit/delete buttons for each.

---

## 2. Persistent Skills Registry

This section describes how the extension stores, manages, and executes reusable prompt templates (macros) triggered by `@keywords`.

### 2.0 Skill Structure & Interaction Design
* **How Skills Work**:
  * A **Skill** is a reusable prompt macro mapped to a specific `@keyword` (e.g., `@redo`, `@continue`) or `%keyword` (e.g., `%format`, `%merge`, `%transfer`).
  * Skills act as context templates. Instead of submitting prompts directly to an AI chat, selecting a skill hydrates the current node's editor cache. This gives the user full control to inspect, edit, or prepend custom instructions to the template before executing the call.
* **Interactions**:
  * **User-to-Editor Injection**: Selecting a skill from the Action Center's dropdown populates the text area cache.
  * **Inline Autocomplete Trigger**: Typing the `@` symbol in any prompt input or editor triggers a VS Code-style autocomplete suggestion dropdown (showing up to 6 custom or system skills starting with `@` matching the typed prefix). Users can navigate the list using the Up/Down arrow keys and select an item. Selecting a skill immediately replaces the typed `@keyword` string at the cursor position with the full prompt template content. To ensure visual clarity, the injected prompt template is wrapped with a blank line before and after, formatting it as a distinct, separate paragraph. Note that `%`-prefixed skills (such as `%format` and `%merge`) are excluded from this menu, as they cannot be triggered directly from the editor.
  * **System-Skill Action Buttons**: In the Orchestrator module, specific system skills are exposed as dedicated action buttons (such as **Dispatch**, **Merge**, **Shorten**, and **Task Breakdown**). Clicking one of these buttons automatically injects the corresponding system skill's template prompt content (such as `%format` for Dispatch, or `%merge` for Merge) directly into the text editor textbox provided for interaction.
  * **System automation runs**: Built-in orchestration scripts query system skills to automatically format, shorten, or merge context blocks.
* **System vs. Custom Usages**:
  * **General Helper Skills**: Standalone conversational tools like `@redo` (re-executes last turn with higher fidelity), `@continue` (resumes prior context after a detour), and `@shorten` (summarizes text or conversation logs).
  * **Orchestration Workflow Skills**: Built-in prompts used systematically by the engine, such as `@breakdown` (splits tasks), `%format` (structures JSON task lists), `%merge` (prefixes child data), and `%transfer` (structures migrated history).
  * **Custom Skills**: User-authored templates (e.g. `@review`, `@summarize`) managed in the settings tab.

### 2.1 Existing Assets
* **System Prompt Placeholders**: The registry layout in [manager.html](../../ui/manager.html#L258-L291) displays default placeholder cards for macros like `@redo` and `@breakdown`.
* **Registry Placeholder Script**: The macro loader is currently defined as a stub inside [skills.js](../../ui/modules/skills.js).

### 2.2 Data Structure Design: Skills Registry (`SkillsRegistry`)

The `SkillsRegistry` manages all system-default and user-defined prompt templates.

```
+-------------------------------------------------------------------------------+
|                                 SkillsRegistry                                |
+-------------------------------------------------------------------------------+
|  - skills: Map<Keyword, SkillTemplate>                                        |
+-------------------------------------------------------------------------------+
|  + load(): Promise<void>              --> Loads from storage & seeds defaults |
|  + save(): Promise<void>              --> Saves all skills to storage.local   |
|  + getSkill(keyword): SkillTemplate    --> Returns template details           |
|  + getAllSkills(): SkillTemplate[]    --> Returns all registered skills       |
|  + getMatchingSkills(prefix, limit): SkillTemplate[]                          |
|                                       --> Matches prefix for autocomplete     |
|  + addOrUpdateSkill(keyword, prompt, desc): Promise<void>                     |
|  + deleteSkill(keyword): Promise<boolean>                                     |
+-------------------------------------------------------------------------------+
```

* **SkillTemplate Schema**:
  * `keyword` (string): The trigger identifier starting with `@` or `%` (e.g. `"@redo"`, `"%format"`).
  * `prompt` (string): The full template prompt injected into the text editor.
  * `description` (string): A short summary of what the template does.
* **Storage Location**:
  * All skills (both system defaults and custom user macros) are stored in **`chrome.storage.local`** under the `skills` key. The registry is populated with default system skills on first installation or if the storage key is missing.
* **Access Methods**:
  * `async load()`: Fetches skills from local storage, seeding the default templates if the key is empty.
  * `async save()`: Writes the entire skills map to local storage.
  * `getSkill(keyword)`: Retrieves the prompt template details matching the keyword.
  * `getAllSkills()`: Returns an array of all registered skills for listing.
  * `getMatchingSkills(prefix, limit)`: Filters the skills map, returning up to `limit` (default 6) skills whose keyword starts with `@` and matches the search prefix.
  * `async addOrUpdateSkill(keyword, prompt, description)`: Validates and saves a skill.
  * `async deleteSkill(keyword)`: Removes a skill.

### 2.3 How Skills Are Used
1. **Prompt Injections**: The Orchestrator's Node Action Center queries `SkillsRegistry.getAllSkills()` to populate its Skills dropdown. Selecting a skill inserts its `prompt` template text directly into the WYSIWYG text area.
2. **Library Configuration UI**: The Skills Registry panel lists all active prompt templates. Users can add, modify, or remove items, which triggers `addOrUpdateCustomSkill()` and updates local storage.
3. **Automated Sub-tasks**: Orchestrator action buttons (like Task Breakdown or Context Transfer) fetch system prompt templates (such as the `%transfer` prompt template or the `%merge` and `%format` templates) from the registry to structure content before sending.

---

## 3. Ephemeral Orchestrator Node Graph & Connection State

This section describes how we dynamically discover open AI browser tabs via domain whitelisting (Connection State) and coordinate them as an in-memory visual hierarchy (Orchestrator Node Graph).

```
+-------------------------------------------------------------------------------+
|                            OrchestratorNodeRegistry                           |
+-------------------------------------------------------------------------------+
|  - nodes: Map<TabId, OrchestratorNode>                                        |
|  - edges: Map<EdgeId, OrchestratorEdge>                                       |
|  - activeTabId: TabId | null                                                  |
+-------------------------------------------------------------------------------+
|  /* --- Public API (External Access) --- */                                   |
|  + load(): Promise<void>              --> Init scan of all browser windows    |
|  + getNodes(): OrchestratorNode[]     --> Lists all active discovered nodes   |
|  + getEdges(): OrchestratorEdge[]     --> Lists all current graph edges       |
|  + getNode(tabId): OrchestratorNode   --> Returns single node details         |
|  + addEdge(sourceId, targetId, state) --> Creates a staged/active connection  |
|  + removeEdge(sourceId, targetId)     --> Removes a specific edge             |
|  + updateNodeState(tabId, state)      --> Updates execution status            |
|  + updateNodeEditorCache(tabId, text) --> Saves draft editor content          |
|  + selectNode(tabId): Promise<void>   --> Focuses tab in browser window       |
|  + clearGraph(): void                 --> Resets graph to flat initial state  |
|                                                                               |
|  /* --- Internal State & Lifecycle Event Handlers --- */                       |
|  - handleTabCreated(tab): void        --> Auto-detects & mounts matching tab  |
|  - handleTabUpdated(tabId, info, tab) --> Checks URL changes (mount/dismount) |
|  - handleTabRemoved(tabId): void      --> Cleans node & breaks attached edges |
|  - handleTabActivated(info): void     --> Syncs selected node status on switch|
|  - autoFilterTab(tab): boolean        --> Queries SiteProfilesRegistry match  |
|  - breakAllConnectedEdges(tabId): void--> Helper to scrub edges on node reset |
+-------------------------------------------------------------------------------+
```

### 3.1 Existing Assets
* **Tab Status Tracker**: A global cache in the popup's memory tracks whether open AI tabs are idle or busy (see [manager.js](../../ui/manager.js#L209-L261)).

### 3.2 Data Structure Design: Node Graph Registry (`OrchestratorNodeRegistry`)
* **OrchestratorNode Schema**:
  * `tabId` (number): Mapping 1:1 to the browser tab ID.
  * `url` (string): Active URL of the tab.
  * `title` (string): Visual tab title.
  * `parentId` (number|null): Link to parent node.
  * `executionState` (string): `"empty"`, `"working"`, `"complete"`, or `"waiting"`.
  * `editorCache` (string): Current text draft buffer.
* **OrchestratorEdge Schema**:
  * `id` (string): Unique identifier (e.g. `"sourceId-targetId"`).
  * `sourceId` (number): ID of the source node.
  * `targetId` (number): ID of the target node.
  * `state` (string): `"staged"`, `"active"`, or `"dimmed"`.
* **Storage Location**: **In-memory only** (ephemeral popup state). The node connections, active editor caches, parent-child hierarchies, and edges reset when the manager popup/side panel is closed or reloaded.
* **Auto-Discovery via SiteProfilesRegistry**:
  * The checklist is deprecated. Discoverability is fully automated by checking tab URLs against the configured profiles database.
  * A tab is automatically registered as a graph node if `SiteProfilesRegistry.getProfileForUrl(tab.url)` returns a valid profile. This allows newly added custom user platforms to be dynamically recognized.
* **Lifecycle State Transitions**:
  * **Load/Initialization**: `load()` queries browser tabs via `chrome.tabs.query()`. If a tab URL matches a profile in `SiteProfilesRegistry`, it is instantiated as an `OrchestratorNode`.
  * **Tab Created**: `handleTabCreated()` intercepts new tabs. If the URL matches a registered profile, it mounts the tab as a new independent node.
  * **Tab Updated**: `handleTabUpdated()` checks if a tab's URL redirected. If a non-AI tab redirects to a profile-matched domain, it mounts a node. If a matched tab redirects away, it dismounts the node.
  * **Tab Removed**: `handleTabRemoved()` runs on tab closure. It purges the node, calls `breakAllConnectedEdges()` to remove any associated edges, and triggers a graph layout refresh.
  * **Tab Activated**: `handleTabActivated()` keeps graph selection in sync when users switch tabs inside the browser window.

### 3.3 How Node Graph States Are Used
1. **Dynamic Visualization Graph**: The main navigation canvas queries `getNodes()` and `getEdges()` to draw the tree layout. Node selections and key clicks trigger `selectNode(tabId)` to focus the active tab.
2. **Orchestrator Workflow Actions**: 
  * **Dispatch**: Matches the parsed output of `%format` against `Empty` nodes, drawing `staged` (dotted) parent-to-child edges and setting `parentId` connections.
  * **Merge**: Clicking Merge on a child copies the AI output, prepends `%merge`, appends it to the parent node's `editorCache`, and reverses the edge direction.
3. **Tab Event Synchronization**: Event listeners bind browser-level events (`chrome.tabs.onUpdated`, `chrome.tabs.onRemoved`, `chrome.tabs.onActivated`) directly to the registry's internal event handlers to keep popup states in sync with browser reality.

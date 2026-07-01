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

This section describes how we track open AI browser tabs (Connection State) and coordinate them as a visual graph hierarchy (Orchestrator Node Graph).

```
+-------------------------------------------------------------------------------+
|                            OrchestratorNodeRegistry                           |
+-------------------------------------------------------------------------------+
|  - sessionConnectedTabs: Set<TabId>   --> In-memory checked tabs              |
|  - openAiTabs: Map<TabId, OrchestratorNode>                                    |
+-------------------------------------------------------------------------------+
|  + syncWithBrowserTabs(): Promise     --> Scans browser via tabs.query        |
|  + toggleTabConnection(id, state)     --> Checks/unchecks tab in session list |
|  + isTabConnected(id): boolean        --> Verifies if tab is active           |
|  + getConnectedTabs(): TabObject[]    --> Feeds target lists (e.g. Broadcast) |
|  + getOpenAiTabs(): TabObject[]       --> Lists tabs for Connection Checklist |
|  + handleTabRemoved(id)               --> Automatic cleanup on close          |
+-------------------------------------------------------------------------------+
```

### 3.1 Existing Assets
* **Tab Status Tracker**: A global cache in the popup's memory tracks whether open AI tabs are idle or busy (see [manager.js](../../ui/manager.js#L209-L261)).

### 3.2 Data Structure Design: Node Graph Registry (`OrchestratorNodeRegistry`)
* **OrchestratorNode Schema**:
  * `tabId` (number): Mapping 1:1 to the browser tab ID.
  * `parentId` (number|null): ID of parent node.
  * `executionState` (string): `"empty"`, `"working"`, `"complete"`, or `"waiting"`.
  * `editorCache` (string): Current text draft buffer.
* **Storage Location**: **In-memory only** (ephemeral popup state). The node connections and active checklists reset when the manager popup is closed or the side panel reloads.
* **Access Methods**:
  * `async syncWithBrowserTabs()`: Queries open tabs via browser APIs and populates the `openAiTabs` map.
  * `toggleTabConnection(tabId, isConnected)`: Adds or removes `tabId` from the `sessionConnectedTabs` Set.
  * `isTabConnected(tabId)`: Returns if the tab is checked/connected.
  * `getConnectedTabs()`: Returns open tabs that are checked.
  * `getOpenAiTabs()`: Returns all open tabs matching registered domains.
  * `handleTabRemoved(tabId)`: Cleans up node connections and removes `tabId` from session sets when a tab is closed.

### 3.3 How Node Graph States Are Used
1. **Connection Checklist UI**: The checklist UI in the Connection panel queries the Orchestrator's `getOpenAiTabs()` and binds toggles to `toggleTabConnection(tabId, state)`.
2. **Tab Lifecycle Listeners**: We hook `chrome.tabs.onRemoved` to run `OrchestratorNodeRegistry.handleTabRemoved(tabId)` so disconnected/closed tabs are scrubbed from the active node graph and connection set.
3. **Workflow Targeting**: Broadcast and Context Transfer query `OrchestratorNodeRegistry.getConnectedTabs()` to target only the checked tabs.

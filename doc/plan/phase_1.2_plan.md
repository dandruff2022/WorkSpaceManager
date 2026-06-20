# Phase 1.2 Planning Blueprint: Browser APIs & Tab Status Integration

This document outlines the detailed architecture, implementation specifications, and verification workflows for **Milestone 1.2 — Browser APIs & Tab Status Integration (Sandbox Testing)**. 

---

## 1. Domain A: Ephemeral Tab Registry (Lifecycle & Tracking)

### 1.1 Requirements & Objectives
1. **Focus Tracking**: Detect tab activation changes using `chrome.tabs.onActivated` to update the active tab reference.
2. **Lifecycle Syncing**: Monitor `chrome.tabs.onCreated`, `chrome.tabs.onUpdated`, and `chrome.tabs.onRemoved` to maintain a live list of open tabs.
3. **Startup Scan**: Query all open tabs using `chrome.tabs.query` when the background script starts, populating the ephemeral registry dynamically.

### 1.2 Implementation Specification (`background.js`)
* **Tab Tracker Structure**: Keep a global, in-memory `Map` tracking tab metadata:
  * Key: `tabId` (Integer)
  * Value: Object containing `url` (String), `title` (String), and `windowId` (Integer).
  * Tracker Logs: Keep counters for `activatedCount` and `lifecycleCount` to support test assertions.
* **Startup Initializer**:
  * Execute a startup function when the service worker launches or upon installation.
  * Query `chrome.tabs.query({}, ...)` to populate the map with any pre-existing tabs.
* **Event Listeners**:
  * `chrome.tabs.onCreated`: Add tab to registry.
  * `chrome.tabs.onRemoved`: Remove tab from registry.
  * `chrome.tabs.onUpdated`: Update URL and title in registry.
  * `chrome.tabs.onActivated`: Increment activation logs and update focused tab state.

### 1.3 Verification Flow
* **Test Step**: The user is prompted via a console test runner to open a new tab, switch tabs, switch back, and click OK.
* **Assertion**: The test runner queries background logs using `chrome.runtime.sendMessage({ action: "getTestTrackerLogs" })` and asserts that lifecycle and activation counters are greater than zero.

---

## 2. Domain B: Programmatic Tab Switching

### 2.1 Requirements & Objectives
* Enable the extension to focus a specific target tab programmatically using the tab's unique identifier.
* Ensure that if the target tab resides in a background window, the parent window is brought to the front.

### 2.2 Implementation Specification (`background.js`)
* **Message Handler**: Setup a message listener for action `"switchTab"` with payload containing the target `tabId`.
* **Focus Logic**:
  * Call `chrome.tabs.update(tabId, { active: true })`.
  * In the callback, if the tab object is valid, focus the window it belongs to by calling `chrome.windows.update(tab.windowId, { focused: true })`.
  * Respond to the caller indicating success or failure.

### 2.3 Verification Flow
* **Test Step**: The test script queries the background tab list, identifies the newly created tab's ID, and triggers a programmatic focus switch.
* **Assertion**: The browser switches active view to the new tab, pauses, and then programmatically switches back to the test runner tab.

---

## 3. Domain C: Main-World Clipboard Interception (OS Bypass)

### 3.1 Requirements & Objectives
* Intercept copy commands triggered by page scripts.
* Support a selective **OS Bypass Mode**. When enabled via a global flag (`window.__agy_intercept_active = true`), copy actions capture text into the extension's memory *without* writing the text to the operating system's clipboard, preventing user clipboard contamination during automated runs.

### 3.2 Technical & Security Architecture
Because content scripts run in an isolated execution sandbox, we must inject a helper script directly into the webpage's **Main World** context to wrap the `navigator.clipboard` object.

```
┌────────────────────────────────────────────────────────┐
│                   TARGET WEBPAGE TAB                   │
├────────────────────────────┬───────────────────────────┤
│         MAIN WORLD         │       ISOLATED WORLD      │
│      (Webpage Scope)       │     (Content Script)      │
├────────────────────────────┼───────────────────────────┤
│  navigator.clipboard.      │  document.addEventListener │
│  writeText(text)           │  ("agyCopyCaptured")      │
│         │                  │            │              │
│         ├─[Bypass true?]───┼────────────┘              │
│         │   (Yes: resolve) │                           │
│         ▼                  ▼                           │
│  [Native writeText]   chrome.runtime.sendMessage(...)  │
└────────────────────────────────────────────────────────┘
```

#### Content Script Injection (`content.js`)
* Inject an IIFE (Immediately Invoked Function Expression) inside a dynamic `<script>` tag appended directly to `document.documentElement` at start.
* **Clipboard Wrapper Logic**:
  * Back up the original `navigator.clipboard.writeText`.
  * Override `navigator.clipboard.writeText` to:
    1. Dispatch a CustomEvent (`"agyCopyCaptured"`) with the copied text payload.
    2. Check the global override flag `window.__agy_intercept_active`.
    3. If active, resolve the promise immediately (bypassing the native writer).
    4. If inactive, execute the native `writeText` function.

### 3.3 Verification Flow
* **Test Step 1 (Normal Mode)**: Programmatically copy `"Hello OS Clipboard"`. Assert `agyCopyCaptured` CustomEvent triggers with matching string, and OS clipboard contains it.
* **Test Step 2 (Bypass Mode)**: Set `__agy_intercept_active = true`. Programmatically copy `"Secret Internal Data"`. Assert `agyCopyCaptured` CustomEvent captures it, but the OS clipboard does not change.

---

## 4. Domain D: SPA Navigation Tracking

### 4.1 Requirements & Objectives
* Intercept client-side routing changes triggered by single-page application (SPA) routing frameworks (e.g. `history.pushState` and `history.replaceState`) to detect when a website navigates to a new URL path without triggering a full page reload.

### 4.2 Implementation Specification (`content.js`)
* **Main World Navigation Wrappers**:
  * Inside the injected main-world script, wrap `window.history.pushState` and `window.history.replaceState`.
  * Each wrapper must invoke the native function, then dispatch a CustomEvent (`"agyNavigation"`) containing the destination URL path.
* **Isolated World Listener**:
  * The content script listens for `"agyNavigation"`.
  * It relays the URL change event back to the background script, verifying that routing transitions are tracked in real-time.

### 4.3 Verification Flow
* **Test Step**: Programmatically trigger `history.pushState({}, "", "/test-new-chat")`.
* **Assertion**: Verify that the content script captures the `"agyNavigation"` custom event with the exact path `/test-new-chat`, then calls `history.replaceState` to revert the path.

---

## 5. Interactive Testing Suite (`test/api_tester.js`)

A single console-injectable validation script will execute all testing phases sequentially, using browser alerts and confirmations:

* **Phase 1: Environment Handshake**: Show a welcome prompt explaining the testing sequence and verify connection to the extension's background context.
* **Phase 2: Tab Lifecycle & Programmatic Switching**:
  1. Prompt the user to open a new browser tab and return to the test page.
  2. Send a message to `background.js` querying tab tracking metrics. Verify that `onCreated` was logged.
  3. Obtain the new tab's ID and send a `"switchTab"` message to focus it.
  4. Wait 1.5 seconds, then focus back to the test runner tab programmatically.
  5. Verify that `onActivated` logs incremented.
* **Phase 3: Clipboard Interception (Normal)**:
  1. Copy a test string under normal conditions.
  2. Assert the CustomEvent is fired and caught.
  3. Verify the clipboard contains the copied text.
* **Phase 4: Clipboard Interception (Bypass)**:
  1. Set the bypass flag.
  2. Copy a secret string.
  3. Assert the CustomEvent captures it, but verify the OS clipboard was not modified.
* **Phase 5: SPA Navigation**:
  1. Execute `pushState` to a test path.
  2. Verify that the routing hook triggers the navigation event.
  3. Revert the URL state.
* **Phase 6: Results Dashboard**: Compile all results and display a visual PASS/FAIL report.

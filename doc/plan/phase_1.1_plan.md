# Phase 1.1 Planning Blueprint: Console Sandbox Tester

This document outlines the detailed step-by-step test process, environment requirements, and edge-case handling rules for the console-injectable test script (`test/sandbox_tester.js`) used to discover and validate DOM selectors on mainstream AI websites.

---

## 1. Test Environment Setup & Self-Correction

* **Execution Entry**: Run manually inside the browser developer console (F12) of a blank/clean conversation page on the target AI platform (ChatGPT, Claude, Gemini, or Copilot).
* **AI-Assisted Self-Correction Prompt**: If any step fails during execution, copy the console log output and paste it into an AI assistant with the following prompt:
  > "The Workspace Manager sandbox test script failed with the logged errors. Please review the DOM selector mappings for [TARGET SITE], find the corrected selectors using modern DOM standards, and output an updated selector structure. Ensure you return a valid JSON profile configuration matching the required schema."

---

## 2. Step-by-Step Test Process Workflow

### Phase 1: Environment & Helpers Handshake
* Verify that execution takes place in the target tab.
* Hook and override page-context APIs (`navigator.clipboard.writeText`, `history.pushState`, and `history.replaceState`) in the webpage's actual **Main World** context using a dynamically injected script tag.
* Establish custom listener events (`WM_INTERCEPTED_COPY`, `WM_SPA_NAVIGATED`) to pass captured data across the Isolated World boundary to the testing runner.

### Phase 2: Detecting Context & Initializing Config
* Read `window.location.hostname` to auto-detect target platform configuration (ChatGPT, Claude, Gemini, Copilot).
* Initialize the target site's DOM selector registry map.

### Phase 3: Test 1 - Initial State Scan & Empty DOM Validation
* Query message turn elements via the mapped `messageTurnSelector`.
* Verify that the active message count is `0`.
* If count > 0, prompt the user with a popup requesting confirmation to reset or clear history before continuing.

### Phase 4: Test 2 - New Chat Reset Trigger
* Locate the "New Chat" button and simulate a programmatic `.click()`.
* Wait for routing transitions and verify the DOM is empty and the URL points to the base path.
* Ask the user to confirm successful reset using a browser `confirm()` popup.

### Phase 5: Test 3 - Text Injection & State Hydration (`writeToInput`)
* Locate the chat text input element (contenteditable div or textarea).
* Programmatically write the message: `"[WorkspaceManager connection test - Turn 1]"`.
* Dispatch standard bubbling `input` and `change` events (as well as selection range inserts for contenteditable rich textareas) to hydrate the framework state.
* Verify that the site's "Send" button switches to an active (non-disabled) state.
* Request user confirmation via popup.

### Phase 6: Test 4 - Primary Submit Simulation (`clickSend` - Primary)
* Locate the Send button and trigger a programmatic `.click()`.
* Verify that the input box is cleared.
* Request user confirmation via popup.

### Phase 7: Test 5 - Generation State Detection (`MutationObserver`)
* Attach a DOM mutation monitor watching for active response generation markers (appearance of the "Stop Generation" button, disabling of the input area).
* Signal and log `"SIGNAL: Working"` to the console.
* Monitor until generation completes (Stop button disappears and Copy buttons appear).
* Signal and log `"SIGNAL: Complete"` to the console.

### Phase 8: Test 6 - Copy Intercept & Memory Storage (`clickCopyButton` & `interceptClipboard`)
* Wait for the active turn to finish.
* Identify the copy button of the latest message turn (filtering out block-level code copy buttons).
* Programmatically click the copy button while the clipboard API override is active.
* Intercept and push the copied text content to an in-memory queue.
* Prompt the user to confirm the intercepted text matches the chatbot output.

### Phase 9: Test 7 - Chained Interactions & Multi-Turn Sequence
* Inject a second turn prompt: `"[WorkspaceManager connection test - Turn 2]"`.
* Submit utilizing the fallback method: dispatch a synthetic keydown `Enter` event directly on the input box.
* Wait for generation state to resolve to completed.
* Sequentially execute programmatic copy calls for both Turn 1 and Turn 2.
* Assert that intercepted texts match the corresponding turn outputs in order.

---

## 3. Handling Tricky Layout Cases

### 3.1 Code Block Selectors
* Markdown code blocks (`<pre>`, `<code>`) often render separate "Copy Code" elements.
* The script must use selector filtering checks (e.g. `.closest('pre')` or `.closest('code')`) to ensure code block copy buttons do not pollute the message copy sequence query.

### 3.2 Inline Images & Files
* Pasted images or attached files can generate thumbnails in the input box and download icons in the output turns.
* Selector filters must isolate the primary send action and text-based response segments, avoiding conflicts with file-handling SVGs.

### 3.3 Collapsible Panels & Layout Resizing
* Responsive containers or side drawers should not hide main elements or break active DOM queries.

---

## 4. JSON Configuration Schema Output

Upon passing all tests successfully, the script compiles and outputs the verified settings in the following JSON format:

```json
{
  "siteName": "ChatGPT",
  "domain": "chatgpt.com",
  "selectors": {
    "inputSelector": "[CSS Selector]",
    "sendButtonSelector": "[CSS Selector]",
    "newChatButtonSelector": "[CSS Selector]",
    "copyButtonSelector": "[CSS Selector]",
    "userCopyButtonSelector": "[CSS Selector]",
    "stopButtonSelector": "[CSS Selector]",
    "messageTurnSelector": "[CSS Selector]"
  },
  "flags": {
    "useEnterFallback": false
  }
}
```

The script displays this configuration inside a modal textbox overlay in the page DOM for easy copying.

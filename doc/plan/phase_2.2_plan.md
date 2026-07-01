# Phase 2.2 Implementation Plan — Skills Module UI & Editor Autocomplete

This document details the blueprint for implementing the user interface for the **Skills Module** and the **VS Code-style inline autocomplete** behavior.

---

## 1. UI Architecture & CRUD Bindings (`ui/modules/skills.js`)

We will rebuild [skills.js](../../ui/modules/skills.js) to manage system-default and custom prompts.

### 1.1 UI Elements in `manager.html`
Let's update [manager.html](../../ui/manager.html#L259-L292) to support the active editing view:
* **Left Hand Panel**: A scrollable list displaying all registered skills in alphabetical order. Items will feature:
  * The `@keyword` or `%keyword` prefix in a bold theme.
  * A brief, truncated description preview.
  * A visual category indicator (e.g., custom vs. system).
* **Right Hand Panel**: An interactive form for adding, editing, or viewing details:
  * **Keyword Field**: Text input (e.g., `@my_macro`). Enabled only for custom skills (system skills can have their templates edited, but not their trigger keywords renamed).
  * **Description Field**: Text input.
  * **Prompt Text Field**: Multi-line `<textarea>` to edit the long prompt template.
  * **Form Controls**: **Save** button (validates and updates), **Delete** button (hidden/disabled for system keys), and **Add Custom Skill** button (clears form for a new entry).

### 1.2 Form Validation Rules
Before executing `SkillsRegistry.addOrUpdateSkill()`, the form will validate:
1. **Keyword Format**: Must start with `@` or `%`.
2. **Whitespace**: Keyword must not contain spaces or special characters (except `_` or `-`).
3. **Empty Inputs**: Keyword and Prompt Text cannot be empty.
4. **Duplicate Keys**: If creating a new skill, warns if the keyword is already registered.

### 1.3 Autocomplete Configuration Setting
* We will add an option inside the Skills tab interface (e.g. in the sidebar list header) to configure the **Autocomplete Trigger Character**:
  * **Trigger Key Input**: User can choose `@` (default), `#`, `/`, or any other symbol.
  * **Storage**: Saved in `chrome.storage.local` under the `autocompleteTriggerChar` key, defaulting to `@` if not present.

---

## 2. VS Code-Style Autocomplete Module (`utils/autocomplete.js`)

We will implement a reusable autocomplete controller class `SkillsAutocomplete` that can attach to both standard textareas (popup) and webpage input containers (content script).

### 2.1 Caret Coordinates Calculation
To render the autocomplete suggestion box directly below the active cursor caret:
* **Standard `<textarea>` (Popup)**:
  * Creates a hidden mirror `div` copying all layout styles (padding, font, line-height, borders, font-size, width, word-wrap) of the source `<textarea>`.
  * Injects the text up to the cursor position into the mirror.
  * Injects an inline marker element (`<span>|</span>`) at the cursor position.
  * Appends the mirror to the document body, reads `getBoundingClientRect()` of the marker relative to the textarea, and then cleans up.
* **`contenteditable` `<div>` (Webpage)**:
  * Uses browser `window.getSelection()` and `Selection.getRangeAt(0)` to dynamically query the selection boundary box (`range.getBoundingClientRect()`) of the caret.

### 2.2 Dropdown Visual Design (HTML/CSS)
* The dropdown will be a globally mounted `div` (`id="agy-autocomplete-dropdown"`) styled to match the extension's premium dark-mode / glassmorphism aesthetic:
  * Backdrop filter blur (`backdrop-filter: blur(12px)`).
  * Border color matching the active theme (`rgba(255,255,255,0.08)`).
  * High `z-index: 999999` to ensure it floats on top of all webpage elements.
* **Layout**: Two-line list items showing:
  * Line 1: `keyword` (bold glowing text).
  * Line 2: `description` (truncated gray label).

### 2.3 Keyboard Event Interception & State Machine
The autocomplete controller operates under three states: `CLOSED`, `TRIGGERED`, and `ACTIVE`.

```
        Trigger Key typed
CLOSED ───────────────────▶ TRIGGERED (query matching)
         ◀────────────────
          Esc / Backspace (empty)
```

While in the `TRIGGERED` state, the handler intercepts keypresses on the active input element:
* **`ArrowDown` / `ArrowUp`**: Focuses the next/previous matching skill in the dropdown. Prevents default browser scroll behaviors.
* **`Enter` / `Tab`**: Injects the selected skill's prompt in place. Prevents default newline/tab insertion.
* **`Escape`**: Immediately hides the dropdown and returns to `CLOSED` state.
* **Click-Out**: A document-level click listener closes the dropdown if the user clicks anywhere outside the input or menu.

### 2.4 Prompt Injection Rules (Paragraph Formatting)
When a skill is committed:
1. Read the text before and after the cursor: `[Text Before] [TriggerChar]keyword [Text After]`.
2. Grab the prompt template associated with the skill.
3. Wrap the prompt template with **blank lines before and after**:
   ```
   \n\n[PROMPT_TEMPLATE_CONTENT]\n\n
   ```
4. Replace the `[TriggerChar]keyword` string with the wrapped template.
5. Restore focus to the input and place the cursor immediately after the injected block (using standard cursor placement for textareas or `Selection` range collapsed state for contenteditables).

### 2.5 Unified Webpage Chatbox Autocomplete (Web Context)
To support typing `@` directly inside ChatGPT, Claude, Gemini, and Copilot:
1. **Content Script Loading**: We include `utils/autocomplete.js` in the content scripts configuration.
2. **Abstracted Data Lookups**: The `SkillsAutocomplete` class queries matching skills via a callback.
   * In the popup, it queries `SkillsRegistry.getMatchingSkills(prefix)` directly.
   * In the content script, it sends a message `chrome.runtime.sendMessage({ action: "querySkills", prefix })` to the background script, which queries the registry and responds.
3. **Abstracted Inputs**: Supports modifying both `value` (for `<textarea>`) and calling DOM input event dispatches (like `bridge.js`'s React value setter) to guarantee that the website detects the text injection.

## 3. Sequence of Implementation & Debug Stages

To ensure rapid verification and isolate bugs early, the implementation is broken down into three independent stages, each paired with a verification checklist.

### Stage 1: Skills CRUD Management UI (Extension Context Only)
* **Tasks**:
  * Build the split panel UI inside the Skills section of `ui/manager.html`.
  * Write the list rendering, form populating, and CRUD binding code in `ui/modules/skills.js`.
  * Implement the Autocomplete Trigger Character configuration setting dropdown.
* **Debug Guide**:
  1. Open the Workspace Manager popup and select the **Skills** tab.
  2. Click any default system skill (e.g. `@redo`). Verify that details populate in the right panel form, and that the Keyword field is locked and the Delete button is disabled.
  3. Click **Add Custom Skill**. Input a valid custom keyword (e.g. `@review`) and a prompt template, then click **Save**. Verify that it appears in the list.
  4. Try adding a skill with an invalid keyword format (e.g. `invalid_macro` without prefix, or with spaces). Check that validation alerts prevent saving.
  5. Close and reopen the popup. Confirm all custom skill edits persisted.

### Stage 2: Autocomplete Caret Detection & Injection (Popup Textarea Test)
* **Tasks**:
  * Implement the core `SkillsAutocomplete` class and Caret Position detection in `utils/autocomplete.js`.
  * Add the CSS rules for `#agy-autocomplete-dropdown` inside `ui/manager.css`.
  * Mount the autocomplete listener inside the popup manager on the Broadcast page textarea (`#textarea-broadcast-prompt`).
* **Debug Guide**:
  1. Open the **Broadcast** tab inside the manager popup.
  2. Type the trigger character (e.g., `@`). Verify that the dropdown list appears directly underneath the caret.
  3. Navigate up and down using the **ArrowUp / ArrowDown** keys. Confirm that cursor scrolling in the textarea is suppressed.
  4. Press **Escape**. Confirm the menu closes immediately.
  5. Type `@re`. Select `@redo` from the list and press **Enter** or **Tab**. Confirm that:
     * The `@re` text is removed.
     * The full `@redo` prompt is injected.
     * The injected prompt is wrapped by a blank line before and after.
     * The caret is focused immediately after the trailing newline.

### Stage 3: Unified Webpage Autocomplete (AI Site Context Test)
* **Tasks**:
  * Implement the `querySkills` listener in `background.js` to bridge lookups from webpage content scripts.
  * Inject the `utils/autocomplete.js` class and dynamic styling inside webpage contexts (via `manifest.json` content scripts).
  * Bind the autocomplete class to webpage chatboxes (handling `contenteditable` inputs).
* **Debug Guide**:
  1. Open ChatGPT, Claude, or Gemini in your browser window.
  2. Type the trigger character inside the main chat input field. Verify that the dropdown mounts on the webpage DOM and aligns below the cursor.
  3. Select a skill (e.g. `@shorten`) and press **Enter**.
  4. Verify that the input element value is correctly updated, the text matches the wrapped prompt, the cursor is positioned at the end, and the website's native UI registers the text (e.g. the site's "Send" button becomes active).
  5. Modify the Trigger Character setting in the popup (e.g. to `#`). Return to the webpage and verify that typing `#` now triggers the autocomplete menu.

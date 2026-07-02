# Phase 2.2 Debug Plan — Autocomplete Conflicts

This debug plan implements the **Quick Debug Loop** (`doc/debug_skill.md`) to analyze and resolve integration conflicts (Form Submit on Enter, Focus Shift on Tab, and Trigger remnant characters) across AI chat interfaces (ChatGPT, Claude, Gemini, Copilot).

---

## 1. Diagnostics & Hypotheses

### Hypothesis 1: Event Bubbling Causes Form Submit & Focus Shift
* **Assumption**: Typing `Enter` or `Tab` when the suggestion dropdown is visible executes `e.preventDefault()`, but the website's keydown listener (or the browser's default focus engine) still catches the event bubble.
* **Instrumentation Test**: We will instrument [autocomplete.js](../../utils/autocomplete.js) with detailed logging tags (`[SkillsAutocomplete] [DEBUG]`) in `handleKeyDown(e)` to log:
  1. If `Enter` or `Tab` keydown capture is successfully intercepted.
  2. If the dropdown state is `TRIGGERED` when the keypress occurs.

### Hypothesis 2: Local Node Selection Breaks on ContentEditable nested Spans
* **Assumption**: Modern AI chatboxes wrap input text dynamically in React/Svelte state-driven `<span>` tags. When our code queries the current text node offset, it only highlights the segment inside that specific text node, leaving the trigger prefix (e.g. `@` or `#`) untouched if it resides in an adjacent node.
* **Instrumentation Test**: Log `[SkillsAutocomplete] [DEBUG]` before replacing text in `commitSelection()`:
  1. The selected `Selection.focusNode` tag name, text content, and offset index.
  2. The text values inside the adjacent nodes.

---

## 2. Iterative Debug & Instrumentation Design

### Stage A: Add Console Logging Instrumentation (Batch Print)
We will add non-destructive console log groups inside `utils/autocomplete.js` to observe states live:
1. `[SkillsAutocomplete] [INPUT] Text before caret: "..." | lastTriggerIndex: N | searchPrefix: "..."`
2. `[SkillsAutocomplete] [KEYDOWN] Key: "..." | Intercepted: true/false | State: "..."`
3. `[SkillsAutocomplete] [SELECTION] focusNode: "..." | offset: N | parent: "..."`

### Stage B: Fix 1 — Suppress Keyboard Event Propagation (Suppression Fix)
We will test wrapping keyboard event interception with complete event death:
```javascript
e.preventDefault();
e.stopPropagation();
e.stopImmediatePropagation();
```
We bind this to keydown events during the **capture phase** (`useCapture = true`) to intercept keypresses before they bubble to the website's React handlers.

### Stage C: Fix 2 — Global character-offset replacement (ContentEditable Fix)
Instead of replacing text inside a single text node, we will implement `setRangeByGlobalOffsets(container, startOffset, endOffset)`:
* Recursively traverses all child text nodes of the editable input box.
* Tallies global character indexes to create a continuous range.
* Deletes the trigger keyword across node splits.

---

## 3. Sequence of Debug Verification Tasks

1. [ ] **Apply Instrumentation**: Add console group log statements to `utils/autocomplete.js`.
2. [ ] **Test Key Interception (Fix 1)**: Verify if `Enter`/`Tab` are fully suppressed inside ChatGPT/Claude without sending message drafts or shifting element focus.
3. [ ] **Test Global Selection Range (Fix 2)**: Check if `@` trigger characters are successfully removed from Claude's chatbox.
4. [ ] **Verify Settings Sync**: Test custom trigger keys (like `#`) to ensure they avoid conflict with native `@GPTs` dropdown menus.

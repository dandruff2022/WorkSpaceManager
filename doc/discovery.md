# DOM Automation Discovery Log

This file records empirical tests of our automation primitives against live AI website DOMs to validate the Extension's element mapping strategy.

---

## 1. ChatGPT (OpenAI)

**DOM Structure:**
- The conversation is completely flat; `<article>` tags have been removed in recent updates.
- Conversation turns are separated by obfuscated flexbox utility classes (e.g., `text-token-text-secondary`, `touch:-me-2`).

**Copy Buttons:**
- Assistant Copy Buttons: `button[aria-label="Copy response"][data-testid="copy-turn-action-button"]`
- User Copy Buttons: `button[aria-label="Copy message"][data-testid="copy-turn-action-button"]`
- *Code block* copy buttons are distinct (usually `aria-label="Copy code"`).

**Validation against proposed simulation:**
- **Are buttons clickable?** Yes. Calling `.click()` natively on these buttons triggers the React state to copy the text to the clipboard without requiring an `isTrusted` hardware event.
- **Is the structure sequential?** Yes. Despite the lack of wrapper `<article>` tags, the `button` elements themselves appear in the DOM exactly chronologically. If a user maps the last user and assistant copy buttons, `document.querySelectorAll()` will return the full list of message copy buttons in perfect chronological order, enabling easy index-based traversal.

---

## 2. Claude (Anthropic)

**DOM Structure:**
- Claude uses more semantic component wrappers, with distinct font/styling blocks separating user prompts from Claude's answers.

**Copy Buttons:**
- Claude heavily uses `data-testid="action-bar-copy"`.
- Main message copy buttons usually have `aria-label="Copy"`.
- *Note:* Claude's DOM contains many more copy buttons on average (specifically on individual code blocks, which might have `aria-label="Copy to clipboard"`). 

**Validation against proposed simulation:**
- **Are buttons clickable?** Yes. Calling `.click()` executes the copy action. However, testing reveals Claude's clipboard execution is **asynchronous** (likely awaiting a Promise resolution or React state update before writing to `navigator.clipboard.writeText`). Our `interceptClipboard` primitive must accommodate this by awaiting the write over a short timeout rather than executing synchronously.
- **Is the structure sequential?** Yes. Claude's copy buttons are strictly ordered in the DOM. By allowing the user to map the *last* 3 copy buttons (as designed in the Connection Module), the extension can easily filter out code-block copy buttons by comparing common parent/sibling DOM signatures, leaving a clean, chronologically ordered list of main message copy buttons.

---

## 3. Gemini (Google)

**DOM Structure:**
- Built using Angular Material (`mat-mdc-*` and `ng-star-inserted` classes). 
- CSS classes are heavily dynamic/obfuscated by the framework builder.

**Copy Buttons:**
- Assistant Copy Buttons: `button[aria-label="Copy"]`
- User Copy Buttons: `button[aria-label="Copy prompt"]`
- *Note:* Unlike previous versions of Gemini where "Copy" was hidden inside a "More" dropdown menu, the current live version has placed the buttons directly on the message surface.

**Validation against proposed simulation:**
- **Are buttons clickable?** Yes. Natively calling `.click()` successfully triggers the copy action.
- **Is the structure sequential?** Yes. The DOM structure retains perfect chronological top-to-bottom sequence matching the visual layout. Because Gemini's CSS classes are highly unstable across builds (`_ngcontent-ng-c...`), our extension's visual picker must heavily prioritize `aria-label` attributes over CSS classes when generating the stable selector paths for Gemini.

// Workspace Manager - ";;" picker on chat sites (overlay renderer)
// Places the shared picker (utils/picker_core.js) above the site's message box, inside a shadow root so the site's
// CSS and ours never mix. Prompts and memory go in at the caret as their own paragraph; styles become one visible
// last line "Output requirements: …" (no interception of the site's send button).

(function (global) {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  function isDarkPage() {
    for (const node of [document.body, document.documentElement]) {
      if (!node) continue;
      const nums = (getComputedStyle(node).backgroundColor.match(/[\d.]+/g) || []).map(Number);
      if (nums.length >= 3 && (nums.length < 4 || nums[3] > 0)) {
        return 0.299 * nums[0] + 0.587 * nums[1] + 0.114 * nums[2] < 128;
      }
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  class SitePicker {
    constructor(element) {
      this.el = element;
      this.trigger = ';;';
      this.picker = null;
      this.host = null;
      this.styles = [];
      this.seq = 0;
      this.dismissedAt = -1;
      this.onKey = (e) => this.handleKey(e);
      this.onMove = () => this.position();

      if (chromeAPI && chromeAPI.storage && chromeAPI.storage.local) {
        chromeAPI.storage.local.get(['autocompleteTriggerChar'], (data) => {
          this.trigger = data.autocompleteTriggerChar || ';;';
        });
        chromeAPI.storage.onChanged.addListener((changes) => {
          if (changes.autocompleteTriggerChar) this.trigger = changes.autocompleteTriggerChar.newValue || ';;';
        });
      }
      element.addEventListener('input', () => this.onInput());
      element.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== this.el) this.close(); }, 150));
    }

    isEditable() {
      return this.el.isContentEditable || this.el.getAttribute('contenteditable') === 'true';
    }

    text() {
      return this.isEditable() ? this.el.innerText : this.el.value;
    }

    // Rich editors keep one element per line (p/div); range text has no line breaks, so measure within the line
    lineOf(node) {
      const elNode = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      const block = elNode && elNode.closest('p, div, li, pre, h1, h2, h3, h4, h5, h6');
      return block && block !== this.el && this.el.contains(block) ? block : this.el;
    }

    // [text before, text after] the selection, within the current line for rich editors
    around() {
      if (!this.isEditable()) {
        return [this.el.value.substring(0, this.el.selectionStart), this.el.value.substring(this.el.selectionEnd)];
      }
      const sel = window.getSelection();
      if (!sel.rangeCount) return ['', ''];
      const range = sel.getRangeAt(0);
      const line = this.lineOf(range.startContainer);
      const r1 = document.createRange();
      r1.selectNodeContents(line);
      r1.setEnd(range.startContainer, range.startOffset);
      const r2 = document.createRange();
      r2.selectNodeContents(this.lineOf(range.endContainer));
      r2.setStart(range.endContainer, range.endOffset);
      return [r1.toString(), r2.toString()];
    }

    textBeforeCaret() {
      return this.around()[0];
    }

    async onInput() {
      const found = PickerCore.detectTrigger(this.textBeforeCaret(), this.trigger);
      if (!found) { this.dismissedAt = -1; this.close(); return; }
      if (found.start === this.dismissedAt) return;
      const seq = ++this.seq;
      const res = await new Promise((resolve) => {
        chromeAPI.runtime.sendMessage({ action: 'library_query', context: { surface: 'site' }, text: found.query }, (r) => {
          resolve(chromeAPI.runtime.lastError ? null : r);
        });
      });
      if (seq !== this.seq || !res || !res.items) return;
      this.styles = res.styles || [];
      if (!this.picker) {
        const inBox = StylesRegistry.idsFromLine(this.styles, StylesRegistry.lastLine(this.text()));
        this.open(inBox.length ? inBox : (res.choice || []));
      }
      this.picker.setItems(res.items, res.groups);
      this.position();
    }

    open(ticks) {
      this.host = document.createElement('div');
      this.host.setAttribute('data-workspace-manager', 'picker');
      Object.assign(this.host.style, { position: 'fixed', zIndex: '2147483647', left: '0', top: '0' });
      const shadow = this.host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = PickerCore.CSS + '.wmp { box-shadow: 0 8px 28px rgba(0,0,0,.18); }';
      shadow.appendChild(style);
      this.picker = PickerCore.create({
        root: shadow,
        dark: isDarkPage(),
        ticks,
        normalize: (ids) => StylesRegistry.normalizeChoice(this.styles, ids),
        onInsert: (item) => this.insertItem(item),
        onApplyStyles: (ids) => this.applyStyles(ids),
        onClose: () => this.dismiss()
      });
      document.documentElement.appendChild(this.host);
      window.addEventListener('keydown', this.onKey, true);
      window.addEventListener('resize', this.onMove);
      window.addEventListener('scroll', this.onMove, true);
    }

    position() {
      if (!this.host) return;
      const rect = this.el.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 300), 480, window.innerWidth - 16);
      const left = Math.min(Math.max(rect.left, 8), window.innerWidth - width - 8);
      const above = rect.top > 200;
      const room = above ? rect.top - 16 : window.innerHeight - rect.bottom - 16;
      Object.assign(this.host.style, {
        width: width + 'px', left: left + 'px',
        top: above ? 'auto' : (rect.bottom + 8) + 'px',
        bottom: above ? (window.innerHeight - rect.top + 8) + 'px' : 'auto'
      });
      this.picker.el.style.setProperty('--wmp-max', Math.max(120, Math.min(300, room - 30)) + 'px');
    }

    handleKey(e) {
      if (!this.picker || document.activeElement !== this.el) return;
      let used = e.key === 'Enter';   // even if handling fails, Enter must never reach the site (it sends)
      try {
        used = this.picker.handleKey(e);
      } catch (err) {
        console.error('[Workspace Manager] picker key failed:', err);
      }
      if (used) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }

    dismiss() {
      const found = PickerCore.detectTrigger(this.textBeforeCaret(), this.trigger);
      this.dismissedAt = found ? found.start : -1;
      this.close();
    }

    close() {
      this.seq++;
      if (!this.picker) return;
      window.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('resize', this.onMove);
      window.removeEventListener('scroll', this.onMove, true);
      this.host.remove();
      this.picker = null;
      this.host = null;
    }

    // Select ";;query" (trigger up to the caret); returns false when it's gone.
    // eatSpace: also take the space before it when nothing follows on the line (styles leave no trailing space)
    selectTrigger(eatSpace) {
      if (!this.isEditable()) {
        const end = this.el.selectionEnd;
        let start = this.el.value.substring(0, end).lastIndexOf(this.trigger);
        if (start === -1) return false;
        const rest = this.el.value.substring(end).split('\n')[0];
        if (eatSpace && start > 0 && this.el.value[start - 1] === ' ' && !rest.trim()) start--;
        this.el.focus();
        this.el.setSelectionRange(start, end);
        return true;
      }
      const sel = window.getSelection();
      if (!sel.rangeCount) return false;
      const range = sel.getRangeAt(0);
      const found = findPrecedingTrigger(range.startContainer, range.startOffset, this.trigger);
      if (!found) return false;
      const r = document.createRange();
      const eat = eatSpace && found.index > 0 && found.node.data[found.index - 1] === ' ' && !this.around()[1].trim();
      r.setStart(found.node, eat ? found.index - 1 : found.index);
      r.setEnd(range.startContainer, range.startOffset);
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    }

    insertItem(item) {
      this.close();
      if (!this.selectTrigger()) return;
      const [before, after] = this.around();
      document.execCommand('insertText', false, Library.paragraphText(before, after, item.insert.text));
    }

    async applyStyles(ids) {
      this.close();
      if (this.selectTrigger(true)) document.execCommand('delete');
      const line = StylesRegistry.buildLine(this.styles, ids);
      if (this.isEditable()) {
        // Let the editor read the first edit before the second. ProseMirror reads DOM edits made in one go as one
        // change; "delete ;; in the first paragraph + empty the last one" then looks like an Enter key and ChatGPT
        // sends the message (seen live).
        await new Promise(resolve => setTimeout(resolve, 50));
        if (!document.contains(this.el)) return;
        this.applyLineEditable(line);
      } else {
        const value = this.el.value;
        const caret = this.el.selectionStart;
        const next = StylesRegistry.applyLine(value, line);
        if (next !== value) {
          this.el.select();
          if (next) document.execCommand('insertText', false, next); else document.execCommand('delete');
          const at = Math.min(caret, next.length);
          this.el.setSelectionRange(at, at);
        }
      }
      if (global.StylesStore) global.StylesStore.setChoice('site', ids).catch(() => {});
    }

    // Rich editors (ProseMirror on ChatGPT, Quill on Gemini): edit through the selection so the editor notices.
    // Only change text inside the line, never remove its block (a removed paragraph is a cross-block change, which
    // ProseMirror may also read as Enter). Removing the styles leaves an empty line; the sites trim it on send.
    applyLineEditable(line) {
      const prefix = StylesRegistry.LINE_PREFIX;
      const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
      let found = null;
      while (walker.nextNode()) {
        if (walker.currentNode.data.trim().startsWith(prefix)) found = walker.currentNode;
      }
      const sel = window.getSelection();
      const r = document.createRange();
      if (found) {
        r.selectNodeContents(found);
        sel.removeAllRanges();
        sel.addRange(r);
        if (line) document.execCommand('insertText', false, line); else document.execCommand('delete');
      } else if (line) {
        r.selectNodeContents(this.el);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
        document.execCommand('insertText', false, (this.el.innerText.trim() ? '\n\n' : '') + line);
      }
    }
  }

  // Last text node inside a subtree
  function getLastTextNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return node;
    for (let i = node.childNodes.length - 1; i >= 0; i--) {
      const text = getLastTextNode(node.childNodes[i]);
      if (text) return text;
    }
    return null;
  }

  // Walks back from the caret to the nearest trigger (text may be split across nodes in rich editors)
  function findPrecedingTrigger(startNode, startOffset, triggerChar) {
    let node = startNode;
    let offset = startOffset;

    if (node.nodeType !== Node.TEXT_NODE) {
      if (offset > 0 && node.childNodes[offset - 1]) {
        const lastText = getLastTextNode(node.childNodes[offset - 1]);
        if (lastText) {
          node = lastText;
          offset = lastText.textContent.length;
        }
      }
    }

    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const idx = node.textContent.substring(0, offset).lastIndexOf(triggerChar);
        if (idx !== -1) return { node, index: idx };
      }
      if (node.previousSibling) {
        const prev = node.previousSibling;
        const lastText = getLastTextNode(prev);
        if (lastText) {
          node = lastText;
          offset = lastText.textContent.length;
        } else {
          node = prev;
          offset = 0;
        }
      } else {
        node = node.parentNode;
        offset = 0;
        if (!node || node.isContentEditable === false || node.tagName === 'BODY') break;
      }
    }
    return null;
  }

  global.SitePicker = SitePicker;
})(typeof self !== 'undefined' ? self : this);

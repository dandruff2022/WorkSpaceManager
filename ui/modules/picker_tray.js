// Workspace Manager - Picker tray (manager renderer) and the Answer button
// The shared picker (utils/picker_core.js) as an inline tray that opens right above the input and pushes the page
// down, so it never overlaps or gets clipped in the narrow side panel. On our pages styles are stateful: a tick
// changes the place's Answer choice (Send, Projects), which is applied when the message is assembled.

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  let trigger = ';;';
  let cssAdded = false;
  const openTrays = new Set();

  if (chromeAPI && chromeAPI.storage) {
    chromeAPI.storage.local.get(['autocompleteTriggerChar'], (data) => { trigger = data.autocompleteTriggerChar || ';;'; });
    if (chromeAPI.storage.onChanged) {
      chromeAPI.storage.onChanged.addListener((changes) => {
        if (changes.autocompleteTriggerChar) trigger = changes.autocompleteTriggerChar.newValue || ';;';
      });
    }
  }

  function addCss() {
    if (cssAdded) return;
    cssAdded = true;
    const style = document.createElement('style');
    style.textContent = PickerCore.CSS;
    document.head.appendChild(style);
  }

  function isDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function call(action, payload = {}) {
    return new Promise((resolve) => {
      chromeAPI.runtime.sendMessage({ action, payload }, (res) => {
        resolve(chromeAPI.runtime.lastError ? { status: 'error' } : (res || { status: 'error' }));
      });
    });
  }

  let styles = [];
  async function loadData() {
    await SkillsRegistry.load();
    styles = await StylesStore.list();
    const list = await call('wf_list');
    return { skills: SkillsRegistry.skills, styles, projects: list.projects || [] };
  }

  async function choice(place) {
    return StylesStore.getChoice(place);
  }

  // Everyone showing a place's choice (Answer buttons, previews) listens to 'wmStyleChoice'
  async function setChoice(place, ids) {
    const saved = await StylesStore.setChoice(place, ids);
    document.dispatchEvent(new CustomEvent('wmStyleChoice', { detail: { place, ids: saved } }));
    return saved;
  }

  async function line(place) {
    const list = await StylesStore.list();
    return StylesRegistry.buildLine(list, await choice(place));
  }

  // Answer buttons on the page; pages re-render, so drop the ones no longer shown
  const answerButtons = new Set();
  document.addEventListener('wmStyleChoice', (e) => {
    for (const b of answerButtons) {
      if (!b.btn.isConnected) answerButtons.delete(b);
      else if (b.place === e.detail.place) b.refresh(e.detail.ids);
    }
  });

  function openInLibrary(item) {
    document.dispatchEvent(new CustomEvent('wmOpenLibrary', { detail: { group: item.group, id: item.id } }));
  }

  function makeTray(before, opts) {
    addCss();
    const tray = document.createElement('div');
    tray.className = 'picker-tray';
    before.parentNode.insertBefore(tray, before);
    const picker = PickerCore.create({
      root: tray,
      dark: isDark(),
      ticks: opts.ticks,
      normalize: (ids) => StylesRegistry.normalizeChoice(styles, ids),
      liveStyles: true,
      doneButton: opts.doneButton,
      onInsert: opts.onInsert || (() => {}),
      onApplyStyles: opts.onApplyStyles,
      onClose: opts.onClose,
      onEdit: openInLibrary
    });
    const handle = { tray, picker };
    openTrays.add(handle);
    handle.remove = () => { openTrays.delete(handle); picker.destroy(); tray.remove(); };
    return handle;
  }

  // ";;" in one of our text boxes. opts: { surface, place, projectId?: () => id, onClose?: () => void }
  function attach(input, opts) {
    if (input.__wmPicker) return;
    input.__wmPicker = true;
    let open = null;
    let seq = 0;
    let dismissedAt = -1;
    let stylesChanged = false;

    function close() {
      seq++;
      if (!open) return;
      open.remove();
      open = null;
      if (opts.onClose) opts.onClose();
    }

    function found() {
      return PickerCore.detectTrigger(input.value.substring(0, input.selectionStart), trigger);
    }

    // Take ";;query" out of the box (after styles were picked, or before inserting an item)
    function removeTrigger() {
      const f = found();
      if (!f) return null;
      input.focus();
      input.setSelectionRange(f.start, input.selectionStart);
      return f;
    }

    function dismiss() {
      if (stylesChanged && removeTrigger()) document.execCommand('delete');
      const f = found();
      dismissedAt = f ? f.start : -1;
      stylesChanged = false;
      close();
    }

    input.addEventListener('input', async () => {
      const f = found();
      if (!f) { dismissedAt = -1; stylesChanged = false; close(); return; }
      if (f.start === dismissedAt) return;
      const mine = ++seq;
      const data = await loadData();
      const ticks = await choice(opts.place);
      if (mine !== seq) return;
      const items = Library.query(data, { surface: opts.surface, projectId: opts.projectId ? opts.projectId() : null }, f.query);
      if (!open) {
        open = makeTray(input, {
          ticks,
          onInsert: (item) => {
            close();
            if (!removeTrigger()) return;
            const before = input.value.substring(0, input.selectionStart);
            const after = input.value.substring(input.selectionEnd);
            document.execCommand('insertText', false, Library.paragraphText(before, after, item.insert.text));
          },
          onApplyStyles: (ids) => { stylesChanged = true; setChoice(opts.place, ids); },
          onClose: dismiss
        });
      }
      open.picker.setItems(items);
    });

    input.addEventListener('keydown', (e) => {
      if (open && open.picker.handleKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    input.addEventListener('blur', () => setTimeout(() => {
      if (open && document.activeElement !== input) dismiss();
    }, 150));
  }

  // "≡ Answer: Short · With sources ▾" — opens the Styles tray above `trayBefore` (default: the button's row).
  // opts: { place, trayBefore?, open?, onToggle?(open), onClose?() }
  function answerButton(opts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn answer-btn';
    btn.setAttribute('aria-haspopup', 'true');
    let tray = null;

    async function refresh(ids) {
      const list = await StylesStore.list();
      const picked = ids || await choice(opts.place);
      const text = StylesRegistry.label(list, picked) || 'Normal';
      btn.replaceChildren();
      const sym = document.createElement('span');
      sym.className = 'answer-sym';
      sym.textContent = '≡';
      const label = document.createElement('span');
      label.className = 'answer-label';
      label.textContent = `Answer: ${text}`;
      btn.append(sym, label, document.createTextNode(' ▾'));
      btn.title = picked.length ? StylesRegistry.buildLine(list, picked) : 'No answer style: the AI answers its usual way';
    }

    function closeTray() {
      if (!tray) return;
      tray.remove();
      tray = null;
      btn.setAttribute('aria-expanded', 'false');
      if (opts.onToggle) opts.onToggle(false);
      if (opts.onClose) opts.onClose();
    }

    async function openTray() {
      const data = await loadData();
      const before = opts.trayBefore || btn.closest('.composer-footer, .flow-actions') || btn.parentElement;
      tray = makeTray(before, {
        ticks: await choice(opts.place),
        doneButton: true,
        onApplyStyles: (ids) => setChoice(opts.place, ids),
        onClose: closeTray
      });
      tray.picker.setItems(Library.query(data, { surface: 'step' }, ''));
      tray.tray.tabIndex = 0;
      tray.tray.addEventListener('keydown', (e) => {
        if (tray && tray.picker.handleKey(e)) { e.preventDefault(); e.stopPropagation(); }
      });
      tray.tray.focus();
      btn.setAttribute('aria-expanded', 'true');
      if (opts.onToggle) opts.onToggle(true);
    }

    btn.addEventListener('click', () => { if (tray) closeTray(); else openTray(); });
    answerButtons.add({ btn, place: opts.place, refresh });
    refresh();
    if (opts.open) setTimeout(() => { if (btn.isConnected && !tray) openTray(); }, 0);
    return btn;
  }

  window.PickerTray = {
    attach,
    answerButton,
    choice,
    setChoice,
    line,
    // True while a tray is open inside `root` (pages hold re-renders so the tray isn't thrown away)
    isOpenIn(root) {
      return [...openTrays].some(t => root.contains(t.tray));
    }
  };
})();

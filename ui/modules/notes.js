// Workspace Manager - Notes page
// The user's own notes: list with search, an editor that saves as you type, versions and undo. The AI edits a note
// only when asked (picked tweaks + own words, for the selection or the whole note); its answer is shown
// as a diff to apply or discard. "Start a project" hands the note to Projects as a new project's goal.

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
  const AI_NAMES = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
  const SAVE_DELAY_MS = 600;

  function call(action, payload = {}) {
    return new Promise((resolve) => {
      chromeAPI.runtime.sendMessage({ action, payload }, (res) => {
        if (chromeAPI.runtime.lastError) resolve({ status: 'error', error: chromeAPI.runtime.lastError.message });
        else resolve(res || { status: 'error', error: 'No response' });
      });
    });
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function timeOf(ms) {
    const d = new Date(ms);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  window.NotesModule = {
    init(container) {
      const $ = id => container.querySelector('#' + id);
      const R = window.NotesRegistry;   // pure helpers only; notes are read and written through the background
      const textEl = $('note-text');
      const titleEl = $('note-title');
      const viewEl = $('note-view');
      let editing = false;

      let notes = [];
      let current = null;          // the open note as last read from storage
      let savedText = '';          // what storage has for the open note, as far as this page knows
      let saveTimer = null;
      let titleTimer = null;
      let selection = null;        // { start, end, text } of the last non-empty selection in the editor

      function setStatus(text, kind = '') {
        $('note-status').textContent = text;
        $('note-status').className = `status-line ${kind}`;
      }

      // ---------- List ----------

      function renderList() {
        const q = $('note-search').value.trim().toLowerCase();
        const shown = notes.filter(n => !q || R.titleOf(n).toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
        const list = $('notes-list');
        list.replaceChildren();
        if (!notes.length) list.appendChild(el('div', { class: 'empty-note' }, 'No notes yet.'));
        else if (!shown.length) list.appendChild(el('div', { class: 'empty-note' }, 'No note matches.'));
        for (const n of shown) {
          const preview = n.text.split('\n').map(l => l.trim()
            .replace(/^#{1,6}\s*/, '').replace(/^(?:[-*]|\d+\.)\s+/, '')
            .replace(/^\[[ xX]\]\s*/, '').replace(/\*\*/g, ''))
            .filter(Boolean).slice((n.title || '').trim() ? 0 : 1).join(' ');
          const card = el('div', { class: 'prompt-card note-card' + (current && n.id === current.id ? ' selected' : ''), 'data-id': n.id, onclick: () => open(n.id) },
            el('div', { class: 'prompt-card-header' },
              el('strong', { class: 'prompt-card-key note-card-title' }, R.titleOf(n)),
              n.edit && n.edit.status === 'ready' ? el('span', { class: 'tag tag-edited' }, 'AI proposal') : el('span', { class: 'muted small' }, timeOf(n.updatedAt))),
            el('div', { class: 'prompt-card-desc' }, preview || ' '));
          list.appendChild(card);
        }
      }

      // ---------- Editor ----------

      function showEditor(on) {
        $('note-body').hidden = !on;
        $('note-empty').hidden = on;
      }

      async function open(id, { focus = false } = {}) {
        await flush();
        await dropIfEmpty(current && current.id !== id ? current.id : null);
        current = notes.find(n => n.id === id) || null;
        selection = null;
        $('note-history').hidden = true;
        setStatus('');
        if (!current) { showEditor(false); renderList(); return; }
        showEditor(true);
        titleEl.value = current.title || '';
        textEl.value = savedText = current.text;
        setEditing(focus || !current.text.trim());
        updateScope();
        renderEditor();
        renderList();
        if (focus) textEl.focus();
      }

      function renderView() {
        viewEl.replaceChildren(MarkdownView.render(textEl.value, { onToggle: async (lineIndex, checked) => {
          if (!current) return;
          textEl.value = R.toggleTask(textEl.value, lineIndex, checked);
          renderView();
          await saveNow();
        } }));
      }

      function setEditing(on, focus = false) {
        editing = on;
        textEl.hidden = !on;
        viewEl.hidden = on;
        $('btn-note-edit').textContent = on ? 'Done' : 'Edit';
        if (!on) { selection = null; renderView(); }
        if (on && focus) {
          textEl.focus();
          textEl.setSelectionRange(textEl.value.length, textEl.value.length);
        }
        updateScope();
      }

      // A note left empty and untitled isn't worth keeping
      async function dropIfEmpty(id) {
        const n = id && notes.find(x => x.id === id);
        if (n && !n.text.trim() && !(n.title || '').trim() && !n.edit) {
          await call('wf_noteRemove', { noteId: id });
          notes = notes.filter(x => x.id !== id);
        }
      }

      async function flush() {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; await saveNow(); }
        if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; await saveTitle(); }
      }

      async function saveNow() {
        if (!current) return;
        const text = textEl.value;
        if (text === savedText) return;
        savedText = text;
        const res = await call('wf_noteSaveText', { noteId: current.id, text });
        if (res.status === 'success') setStatus('Saved', 'ok');
        else { savedText = null; setStatus(`Not saved: ${res.error}`, 'error'); }
      }

      async function saveTitle() {
        if (!current) return;
        await call('wf_noteRename', { noteId: current.id, title: titleEl.value });
      }

      function renderEditor() {
        $('btn-note-undo').disabled = !current || current.versions.length < 2;
        if (!editing) renderView();
        renderProposal();
        if (!$('note-history').hidden) renderHistory();
      }

      // ---------- Ask AI ----------

      function updateScope() {
        if (!editing) { selection = null; $('note-ai-scope').textContent = 'AI · whole note:'; return; }
        const start = textEl.selectionStart;
        const end = textEl.selectionEnd;
        if (document.activeElement === textEl || selection === null) {
          selection = end > start && textEl.value.slice(start, end).trim() ? { start, end, text: textEl.value.slice(start, end) } : null;
        }
        $('note-ai-scope').textContent = selection ? 'AI · selection:' : 'AI · whole note:';
      }

      async function ask(instruction) {
        if (!current) return;
        if (!instruction.tweaks.length && !instruction.text.trim()) return;
        await flush();
        const res = await call('wf_noteEdit', { noteId: current.id, instruction, part: selection });
        if (res.status !== 'success') setStatus(res.error, 'error');
        else { $('note-ai-custom').value = ''; updateAsk(); }
      }

      function renderProposal() {
        const box = $('note-proposal');
        const edit = current && current.edit;
        box.hidden = !edit;
        if (!edit) return;
        const what = WorkflowPrompts.noteEditLabel(edit.instruction);
        const scope = edit.part ? 'the selected part' : 'the whole note';
        const ai = AI_NAMES[edit.ai] || 'The AI';
        const head = $('note-proposal-head');
        const diffEl = $('note-proposal-diff');
        diffEl.replaceChildren();
        $('btn-note-apply').hidden = edit.status !== 'ready';
        $('btn-note-discard').textContent = edit.status === 'running' ? 'Cancel' : (edit.status === 'error' ? 'Dismiss' : 'Discard');
        box.className = 'note-proposal' + (edit.status === 'error' ? ' is-error' : '');
        if (edit.status === 'running') {
          head.textContent = `${ai} is working on ${what} for ${scope} (temporary chat)…`;
          return;
        }
        if (edit.status === 'error') {
          head.textContent = `${what} did not work: ${edit.error || 'unknown error'}`;
          return;
        }
        const changed = current.text !== edit.base;
        head.replaceChildren(el('strong', {}, `${ai}: ${what}, ${scope}`));
        if (changed) head.appendChild(el('span', { class: 'muted small' }, edit.part ? ' · you edited the note since; Apply puts the new part into your latest text' : ' · you edited the note since; Apply replaces those edits'));
        // The change against the text it was made from. In each changed run, old and new lines alternate
        // (old line, its new version, …) so a rewrite of every line still reads line by line.
        const lines = R.diffLines(edit.base, edit.proposal);
        let same = 0;
        let dels = [];
        let adds = [];
        const row = (type, text) => diffEl.appendChild(el('div', { class: type === 'add' ? 'diff-add' : 'diff-del' }, text || ' '));
        const flush = () => {
          if (same) diffEl.appendChild(el('div', { class: 'diff-same muted' }, `… ${same} unchanged line${same === 1 ? '' : 's'}`));
          same = 0;
          for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
            if (i < dels.length) row('del', dels[i]);
            if (i < adds.length) row('add', adds[i]);
          }
          dels = [];
          adds = [];
        };
        for (const line of lines) {
          if (line.type === 'same') { if (dels.length || adds.length) flush(); same++; continue; }
          if (same) flush();
          (line.type === 'del' ? dels : adds).push(line.text);
        }
        flush();
        if (!lines.some(l => l.type !== 'same')) diffEl.appendChild(el('div', { class: 'muted' }, 'No changes.'));
      }

      async function apply() {
        const edit = current && current.edit;
        if (!edit || edit.status !== 'ready') return;
        await flush();
        const res = await call('wf_noteApplyEdit', { noteId: current.id });
        if (res.status !== 'success') return setStatus(res.error, 'error');
        setStatus('Applied. Undo brings back the old text.', 'ok');
      }

      // ---------- Versions ----------

      function renderHistory() {
        const box = $('note-history');
        box.replaceChildren();
        const versions = current.versions.map((v, i) => ({ v, i })).reverse();
        for (const { v, i } of versions) {
          const isCurrent = i === current.versions.length - 1;
          box.appendChild(el('div', { class: 'history-row note-version', title: v.text.slice(0, 400) },
            el('span', {}, `${timeOf(v.at)} · ${v.by === 'you' ? 'you' : v.by} · ${v.note || ''}`),
            isCurrent ? el('span', { class: 'muted small' }, 'current')
              : el('button', { class: 'btn-link', onclick: async () => { await flush(); await call('wf_noteRestore', { noteId: current.id, index: i }); setStatus('Restored as a new version.', 'ok'); } }, 'Restore')));
        }
      }

      // ---------- Load and react to storage ----------

      async function reload() {
        const res = await call('wf_notesList');
        if (res.status !== 'success') return setStatus(`Could not load notes: ${res.error}`, 'error');
        notes = res.notes;
        if (current) {
          const fresh = notes.find(n => n.id === current.id);
          if (!fresh) { current = null; showEditor(false); renderList(); return; }
          current = fresh;
          // Take the stored text unless the user has typed something not saved yet
          if (textEl.value === savedText && fresh.text !== savedText) {
            textEl.value = savedText = fresh.text;
            selection = null;
            updateScope();
          }
          if (document.activeElement !== titleEl) titleEl.value = fresh.title || '';
          renderEditor();
        }
        renderList();
      }

      textEl.addEventListener('input', () => {
        setStatus('');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, SAVE_DELAY_MS);
      });
      for (const ev of ['select', 'keyup', 'mouseup', 'focus']) textEl.addEventListener(ev, updateScope);
      viewEl.addEventListener('click', (e) => {
        if (!e.target.closest('a, input')) setEditing(true, true);
      });
      $('btn-note-edit').addEventListener('click', () => {
        if (editing) flush();
        setEditing(!editing, !editing);
      });
      textEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); flush(); setEditing(false); }
      });
      textEl.addEventListener('blur', (e) => {
        flush();
        // Keep the textarea selection while the user asks the AI what to do with it.
        if (!e.relatedTarget?.closest('.note-ai, .tweak-tray, #btn-note-edit')) setEditing(false);
      });
      titleEl.addEventListener('input', () => {
        clearTimeout(titleTimer);
        titleTimer = setTimeout(() => { titleTimer = null; saveTitle(); }, SAVE_DELAY_MS);
      });

      $('note-search').addEventListener('input', renderList);
      $('btn-note-new').addEventListener('click', async () => {
        await flush();
        const res = await call('wf_noteCreate', {});
        if (res.status !== 'success') return setStatus(res.error, 'error');
        await reload();
        await open(res.note.id, { focus: true });
      });
      let tweakIds = [];
      function updateAsk() {
        $('btn-note-ask').disabled = !tweakIds.length && !$('note-ai-custom').value.trim();
      }
      $('note-tweak-slot').appendChild(PickerTray.tweakControl({ trayBefore: container.querySelector('.note-ai') }));
      PickerTray.choice('tweaks').then(ids => { tweakIds = ids; updateAsk(); });
      document.addEventListener('wmStyleChoice', (e) => {
        if (e.detail.place === 'tweaks') { tweakIds = e.detail.ids; updateAsk(); }
      });
      $('note-ai-custom').addEventListener('input', updateAsk);
      $('note-ai-form').addEventListener('submit', (e) => {
        e.preventDefault();
        ask({ tweaks: tweakIds.slice(), text: $('note-ai-custom').value });
      });
      $('btn-note-apply').addEventListener('click', apply);
      $('btn-note-discard').addEventListener('click', () => current && call('wf_noteDiscardEdit', { noteId: current.id }));
      $('btn-note-undo').addEventListener('click', async () => {
        if (!current) return;
        await flush();
        await call('wf_noteUndo', { noteId: current.id });
        setStatus('Went back one version.', 'ok');
      });
      $('btn-note-versions').addEventListener('click', () => {
        const box = $('note-history');
        box.hidden = !box.hidden;
        if (!box.hidden) renderHistory();
      });
      $('btn-note-project').addEventListener('click', async () => {
        if (!current || !textEl.value.trim()) return setStatus('Write something first.', 'error');
        await flush();
        document.dispatchEvent(new CustomEvent('wmNewProject', { detail: { title: (current.title || '').trim(), goal: textEl.value.trim() } }));
      });
      $('btn-note-delete').addEventListener('click', async () => {
        const btn = $('btn-note-delete');
        if (!current) return;
        if (btn.dataset.confirm !== 'yes') {
          btn.dataset.confirm = 'yes';
          btn.textContent = 'Click again to delete';
          setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Delete'; }, 3000);
          return;
        }
        btn.dataset.confirm = '';
        btn.textContent = 'Delete';
        clearTimeout(saveTimer);
        saveTimer = null;
        const id = current.id;
        current = null;
        await call('wf_noteRemove', { noteId: id });
        await reload();
        await open(notes[0] ? notes[0].id : null);
      });

      // The background sends this after every change to notes (typing here, AI edits, right-click saves)
      chromeAPI.runtime.onMessage.addListener((message) => {
        if (message.action === 'notesUpdate') reload();
      });

      // ✎ on a note in a picker, or a note saved from elsewhere: open it here
      document.addEventListener('wmOpenLibrary', async (e) => {
        const { group, id } = e.detail || {};
        if (group !== 'notes') return;
        const nav = document.querySelector('.nav-item[data-target="notes"]');
        if (nav) nav.click();
        await reload();
        await open(id);
      });

      reload().then(() => { if (!current && notes.length) open(notes[0].id); else showEditor(!!current); });
    }
  };
})();

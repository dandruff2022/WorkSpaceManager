// Workspace Manager - Notes store
// The user's own notes: plain text, edited by hand (autosave), changed by the AI only on request and only after the
// user applies its proposal. Every change is a version, so an AI edit (or anything else) can be undone.
// Storage key `notes`: { [id]: { id, title, text, versions: [{ text, by, at, note }], createdAt, updatedAt, edit? } }
// `text` is always the last version's text. `edit` is a running or finished AI edit request (see workflow_engine.js).

(function (global) {
  // Typing keeps changing the same version until the user pauses this long; then the next edit starts a new one
  const TYPING_MERGE_MS = 5 * 60 * 1000;
  const MAX_VERSIONS = 50;

  function clone(obj) {
    return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
  }

  function makeId() {
    return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // A note without a title shows its first line
  function titleOf(note) {
    const t = (note.title || '').trim();
    if (t) return t;
    const line = (note.text || '').split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
    return line ? (line.length > 60 ? line.slice(0, 59) + '…' : line) : 'Untitled note';
  }

  // Change only the checklist marker on a source line (the renderer supplies its zero-based index).
  function toggleTask(text, lineIndex, checked) {
    const lines = String(text || '').split(/(\r\n|\r|\n)/);
    if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex * 2 >= lines.length) return text;
    const at = lineIndex * 2;
    lines[at] = lines[at].replace(/^(\s*(?:[-*•]|\d+[.)])\s+\[)([ xX])(\]\s+)/, (_, before, mark, after) =>
      before + ((checked === undefined ? mark === ' ' : checked) ? 'x' : ' ') + after);
    return lines.join('');
  }

  // Line diff (LCS) for showing an AI proposal: [{ type: 'same' | 'add' | 'del', text }]
  function diffLines(oldText, newText) {
    const a = String(oldText || '').split('\n');
    const b = String(newText || '').split('\n');
    const n = a.length;
    const m = b.length;
    // Long notes: fall back to "all removed, all added" rather than a big table
    if (n * m > 400000) return a.map(text => ({ type: 'del', text })).concat(b.map(text => ({ type: 'add', text })));
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { out.push({ type: 'same', text: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: 'del', text: a[i++] });
      else out.push({ type: 'add', text: b[j++] });
    }
    while (i < n) out.push({ type: 'del', text: a[i++] });
    while (j < m) out.push({ type: 'add', text: b[j++] });
    return out;
  }

  // Put the AI's rewrite of a part back into the full text. part = { start, end, text } as it was when asked.
  // Returns null when that part is no longer there (the note changed meanwhile).
  function replacePart(fullText, part, replacement) {
    const text = String(fullText || '');
    if (!part) return replacement;
    if (text.slice(part.start, part.end) === part.text) {
      return text.slice(0, part.start) + replacement + text.slice(part.end);
    }
    const at = text.indexOf(part.text);
    if (at === -1 || text.indexOf(part.text, at + 1) !== -1) return null;   // gone, or not unique
    return text.slice(0, at) + replacement + text.slice(at + part.text.length);
  }

  // options.onChange(): called after every write
  function createNotesStore(area, options = {}) {
    const changed = () => { if (options.onChange) options.onChange(); };
    let queue = Promise.resolve();
    function withLock(fn) {
      const run = queue.then(() => fn());
      queue = run.catch(() => {});
      return run;
    }

    async function readAll() {
      const data = await area.get(['notes']);
      return data.notes || {};
    }

    // Change one note under the lock; fn(note, notes) may return a value
    function change(id, fn) {
      return withLock(async () => {
        const notes = await readAll();
        const note = notes[id];
        if (!note) throw new Error('Note not found');
        const result = fn(note, notes);
        await area.set({ notes });
        changed();
        return result === undefined ? clone(note) : clone(result);
      });
    }

    function pushVersion(note, text, by, why) {
      const now = Date.now();
      note.versions.push({ text, by, at: now, note: why || '' });
      if (note.versions.length > MAX_VERSIONS) note.versions.splice(0, note.versions.length - MAX_VERSIONS);
      note.text = text;
      note.updatedAt = now;
    }

    return {
      titleOf,

      // Newest first
      async list() {
        return clone(Object.values(await readAll()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      },

      async get(id) {
        const note = (await readAll())[id];
        return note ? clone(note) : null;
      },

      async create({ title = '', text = '', by = 'you', note = 'created' } = {}) {
        return withLock(async () => {
          const notes = await readAll();
          const now = Date.now();
          const created = { id: makeId(), title: String(title).trim(), text: String(text), versions: [{ text: String(text), by, at: now, note }], createdAt: now, updatedAt: now, edit: null };
          notes[created.id] = created;
          await area.set({ notes });
          changed();
          return clone(created);
        });
      },

      // Typing by the user: one version per burst of typing (see TYPING_MERGE_MS)
      async saveText(id, text) {
        return change(id, (note) => {
          const value = String(text);
          if (value === note.text) return note;
          const last = note.versions[note.versions.length - 1];
          if (last && last.by === 'you' && last.note === 'edited' && Date.now() - last.at < TYPING_MERGE_MS && note.versions.length > 1) {
            last.text = value;
            last.at = Date.now();
            note.text = value;
            note.updatedAt = last.at;
          } else {
            pushVersion(note, value, 'you', 'edited');
          }
        });
      },

      async rename(id, title) {
        return change(id, (note) => { note.title = String(title || '').trim(); note.updatedAt = Date.now(); });
      },

      // Text added from elsewhere (an answer, a selection on a page): its own version
      async append(id, text, by = 'you', why = 'added') {
        return change(id, (note) => {
          const body = String(text || '').trim();
          if (!body) return;
          pushVersion(note, note.text.trim() ? `${note.text.replace(/\s+$/, '')}\n\n${body}` : body, by, why);
        });
      },

      // The user applied an AI proposal
      async applyAi(id, text, ai, why) {
        return change(id, (note) => {
          pushVersion(note, String(text), ai || 'AI', why || 'AI edit');
          note.edit = null;
        });
      },

      // Back to the previous version (the last one is dropped; at least one stays)
      async undo(id) {
        return change(id, (note) => {
          if (note.versions.length > 1) note.versions.pop();
          note.text = note.versions[note.versions.length - 1].text;
          note.updatedAt = Date.now();
        });
      },

      // Restore an old version as a new one (nothing is lost)
      async restore(id, index) {
        return change(id, (note) => {
          const v = note.versions[index];
          if (!v) throw new Error('Version not found');
          if (v.text !== note.text) pushVersion(note, v.text, 'you', `restored from ${new Date(v.at).toLocaleString()}`);
        });
      },

      // AI edit request state: { status, instruction, part?, base, ai, proposal?, replacement?, error?, at }.
      // onlyAt: change it only if it is still the request started at that time (the user may have discarded it)
      async setEdit(id, edit, onlyAt) {
        return change(id, (note) => {
          if (onlyAt && (!note.edit || note.edit.at !== onlyAt)) return;
          note.edit = edit ? { ...(note.edit || {}), ...edit } : null;
        });
      },

      async remove(id) {
        return withLock(async () => {
          const notes = await readAll();
          delete notes[id];
          await area.set({ notes });
          changed();
        });
      }
    };
  }

  const NotesRegistry = { createNotesStore, titleOf, diffLines, replacePart, toggleTask, TYPING_MERGE_MS };
  // Only the background makes the store (background.js: self.NotesStore); pages write through wf_note* messages
  global.NotesRegistry = NotesRegistry;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotesRegistry;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));

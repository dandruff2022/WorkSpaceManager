// Workspace Manager - Styles Registry
// Answer styles ("how to answer"): built-ins + the user's own, the per-place choice, and the one
// "Output requirements:" line that carries them into a message. Pure functions + a small storage wrapper.

(function (global) {
  const LINE_PREFIX = 'Output requirements:';

  // Groups with `oneOf` allow a single pick (ticking one unticks the others); the rest combine freely.
  const GROUPS = {
    length: { name: 'Length', oneOf: true },
    language: { name: 'Language', oneOf: true },
    format: { name: 'Format', oneOf: false },
    approach: { name: 'Approach', oneOf: false }
  };

  const BUILT_INS = [
    { id: 'short', name: 'Short', group: 'length', text: 'Keep it short: under 150 words.' },
    { id: 'detailed', name: 'Detailed', group: 'length', text: 'Be thorough: cover edge cases and explain your reasoning.' },
    { id: 'direct', name: 'Straight to the point', group: 'format', text: 'Answer first; no preamble, no filler, no restating the question.' },
    { id: 'bullets', name: 'Bullet points', group: 'format', text: 'Use bullet points.' },
    { id: 'table', name: 'Table', group: 'format', text: 'Put comparisons and lists of options in a table.' },
    { id: 'steps', name: 'Step by step', group: 'format', text: 'Give numbered steps I can follow.' },
    { id: 'code-only', name: 'Code only', group: 'format', text: 'Reply with code only, with brief comments; no explanation outside the code.' },
    { id: 'sources', name: 'With sources', group: 'approach', text: 'Cite sources with links for factual claims.' },
    { id: 'examples', name: 'With examples', group: 'approach', text: 'Include a concrete example.' },
    { id: 'simple', name: 'Plain language', group: 'approach', text: 'Explain in plain language for a beginner; define any jargon.' },
    { id: 'confidence', name: 'Say how sure', group: 'approach', text: 'Say how confident you are and flag anything you could not verify.' },
    { id: 'ask-first', name: 'Ask first', group: 'approach', text: 'If my request is ambiguous, ask me up to 3 questions before answering.' },
    { id: 'zh', name: 'In Chinese', group: 'language', text: 'Answer in Simplified Chinese.' },
    { id: 'en', name: 'In English', group: 'language', text: 'Answer in English.' }
  ];

  // Projects used to default to "Short answers" on; keep that default there.
  const DEFAULT_CHOICE = { site: [], send: [], projects: ['short'] };

  // Stored shape (key `styles`): { custom: [{id, name, group, text}], edits: {builtInId: {name?, text?}} }
  function list(stored) {
    const s = stored || {};
    const edits = s.edits || {};
    const builtIns = BUILT_INS.map(b => ({ ...b, ...(edits[b.id] || {}), builtIn: true }));
    const custom = (s.custom || []).map(c => ({ group: 'approach', ...c, builtIn: false }));
    return builtIns.concat(custom);
  }

  // Keep known ids, in list order; in one-of groups the last picked id wins.
  function normalizeChoice(styles, ids) {
    const byId = new Map(styles.map(s => [s.id, s]));
    const picked = [];
    for (const id of ids || []) {
      const style = byId.get(id);
      if (!style || picked.includes(id)) continue;
      if (GROUPS[style.group]?.oneOf) {
        for (let i = picked.length - 1; i >= 0; i--) {
          if (byId.get(picked[i]).group === style.group) picked.splice(i, 1);
        }
      }
      picked.push(id);
    }
    const order = styles.map(s => s.id);
    return picked.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  function toggle(styles, ids, id) {
    const current = normalizeChoice(styles, ids);
    return current.includes(id) ? current.filter(x => x !== id) : normalizeChoice(styles, current.concat(id));
  }

  // The one line every surface uses: "Output requirements: Keep it short: under 150 words. Use bullet points."
  function buildLine(styles, ids) {
    const byId = new Map(styles.map(s => [s.id, s]));
    const texts = normalizeChoice(styles, ids).map(id => byId.get(id).text.trim()).filter(Boolean);
    return texts.length ? `${LINE_PREFIX} ${texts.join(' ')}` : '';
  }

  // Which styles a line holds (to pre-tick the picker from what's already in a chat box)
  function idsFromLine(styles, line) {
    if (!line || !line.trim().startsWith(LINE_PREFIX)) return [];
    const rest = line.trim().slice(LINE_PREFIX.length);
    return styles.filter(s => s.text && rest.includes(s.text.trim())).map(s => s.id);
  }

  // Short label for the Answer button: "Short · With sources"
  function label(styles, ids) {
    const byId = new Map(styles.map(s => [s.id, s]));
    return normalizeChoice(styles, ids).map(id => byId.get(id).name).join(' · ');
  }

  // Replace the last "Output requirements:" line of a message, add one at the end, or remove it (empty line)
  function applyLine(text, line) {
    const lines = (text || '').split('\n');
    let at = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith(LINE_PREFIX)) { at = i; break; }
    }
    if (at !== -1) {
      if (line) {
        lines[at] = line;
      } else {
        lines.splice(at, 1);
        // drop the blank line that separated it from the text above
        if (at > 0 && lines[at - 1].trim() === '' && (at >= lines.length || lines[at].trim() === '')) lines.splice(at - 1, 1);
      }
      return lines.join('\n').replace(/\s+$/, '');
    }
    if (!line) return text || '';
    const body = (text || '').replace(/\s+$/, '');
    return body ? `${body}\n\n${line}` : line;
  }

  function lastLine(text) {
    const lines = (text || '').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith(LINE_PREFIX)) return lines[i];
    }
    return '';
  }

  function makeId(name) {
    const base = (name || 'style').toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') || 'style';
    return `my-${base}-${Date.now().toString(36)}`;
  }

  // Storage wrapper (chrome.storage.local or a stub with get/set returning promises)
  function createStylesStore(area) {
    async function read() {
      const data = await area.get(['styles', 'styleChoice']);
      return { stored: data.styles || {}, choice: { ...DEFAULT_CHOICE, ...(data.styleChoice || {}) } };
    }
    return {
      async list() { return list((await read()).stored); },
      async getChoice(place) {
        const { stored, choice } = await read();
        return normalizeChoice(list(stored), choice[place] || []);
      },
      async setChoice(place, ids) {
        const { stored, choice } = await read();
        choice[place] = normalizeChoice(list(stored), ids);
        await area.set({ styleChoice: choice });
        return choice[place];
      },
      async save(style) {
        const { stored } = await read();
        const next = { custom: [...(stored.custom || [])], edits: { ...(stored.edits || {}) } };
        const clean = { name: (style.name || '').trim(), text: (style.text || '').trim(), group: GROUPS[style.group] ? style.group : 'approach' };
        if (!clean.name || !clean.text) throw new Error('A style needs a name and a text.');
        if (BUILT_INS.some(b => b.id === style.id)) {
          next.edits[style.id] = { name: clean.name, text: clean.text };
        } else {
          const id = style.id || makeId(clean.name);
          const i = next.custom.findIndex(c => c.id === id);
          if (i === -1) next.custom.push({ id, ...clean }); else next.custom[i] = { id, ...clean };
          style = { ...style, id };
        }
        await area.set({ styles: next });
        return style.id;
      },
      async remove(id) {
        const { stored } = await read();
        const next = { custom: [...(stored.custom || [])], edits: { ...(stored.edits || {}) } };
        if (BUILT_INS.some(b => b.id === id)) delete next.edits[id];   // built-in: back to the original
        else next.custom = next.custom.filter(c => c.id !== id);
        await area.set({ styles: next });
      }
    };
  }

  const StylesRegistry = {
    LINE_PREFIX, GROUPS, BUILT_INS, DEFAULT_CHOICE,
    list, normalizeChoice, toggle, buildLine, idsFromLine, label, applyLine, lastLine, createStylesStore
  };

  global.StylesRegistry = StylesRegistry;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    global.StylesStore = createStylesStore(chrome.storage.local);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = StylesRegistry;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));

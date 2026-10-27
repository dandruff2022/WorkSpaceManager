// Workspace Manager - Picker core
// The one ";;" picker: list, groups, keyboard, ticks for styles, and its look. Two renderers place it:
// utils/autocomplete.js (floating overlay in a shadow root on chat sites) and ui/modules/picker_tray.js
// (inline tray in the manager). Renderers own placement and what "insert" means for their input.

(function (global) {
  const KINDS = {
    prompts: { name: 'Prompts', symbol: '@' },
    styles: { name: 'Styles', symbol: '≡' },
    notes: { name: 'Notes', symbol: '✎' },
    memory: { name: 'Memory', symbol: '◆' }
  };

  const FOOTER = '↑↓ choose · Enter insert · Space tick style · Tab next group · Esc close';

  // Kind colors (light / dark) are the same everywhere: prompts indigo, styles teal, notes amber, memory green
  const CSS = `
.wmp { --wmp-bg:#fff; --wmp-fg:#18181b; --wmp-muted:#71717a; --wmp-border:#e2e2e6; --wmp-sel:rgba(0,0,0,.06);
  --k-prompts:#4f46e5; --k-styles:#0f766e; --k-notes:#b45309; --k-memory:#15803d;
  font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--wmp-fg);
  background: var(--wmp-bg); border: 1px solid var(--wmp-border); border-radius: 8px; overflow: hidden;
  display: flex; flex-direction: column; text-align: left; }
.wmp.dark { --wmp-bg:#212124; --wmp-fg:#f4f4f5; --wmp-muted:#a1a1aa; --wmp-border:#3a3a40; --wmp-sel:rgba(255,255,255,.08);
  --k-prompts:#818cf8; --k-styles:#2dd4bf; --k-notes:#fbbf24; --k-memory:#4ade80; }
.wmp-list { overflow-y: auto; max-height: var(--wmp-max, 260px); padding: 4px; }
.wmp-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px 2px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .04em; color: var(--wmp-muted); }
.wmp-head .wmp-sym { color: var(--k); font-size: 13px; text-transform: none; }
.wmp-apply { margin-left: auto; text-transform: none; letter-spacing: 0; font-size: 12px; font-weight: 600;
  color: var(--k); background: none; border: 1px solid var(--k); border-radius: 6px; padding: 1px 8px; cursor: pointer; }
.wmp-row { display: flex; align-items: baseline; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer;
  border-left: 2px solid transparent; }
.wmp-row.sel { background: var(--wmp-sel); border-left-color: var(--k); }
.wmp-title { font-weight: 600; white-space: nowrap; color: var(--wmp-fg); }
.wmp-row.k-prompts .wmp-title { color: var(--k); }
.wmp-prev { color: var(--wmp-muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.wmp-size { color: var(--wmp-muted); font-size: 11px; white-space: nowrap; }
.wmp-tick { width: 14px; height: 14px; flex: none; align-self: center; border: 1.5px solid var(--wmp-muted); border-radius: 4px;
  display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: transparent; }
.wmp-row.ticked .wmp-tick { background: var(--k); border-color: var(--k); color: var(--wmp-bg); }
.wmp-edit { color: var(--wmp-muted); background: none; border: 0; cursor: pointer; padding: 0 2px; font-size: 12px; visibility: hidden; }
.wmp-row:hover .wmp-edit, .wmp-row.sel .wmp-edit { visibility: visible; }
.wmp-empty { padding: 10px 8px; color: var(--wmp-muted); }
.wmp-foot { border-top: 1px solid var(--wmp-border); padding: 4px 10px; font-size: 11px; color: var(--wmp-muted);
  display: flex; gap: 8px; align-items: center; }
.wmp-foot span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wmp-done { color: var(--k-styles); background: none; border: 0; font-weight: 600; cursor: pointer; font-size: 12px; }
.k-prompts { --k: var(--k-prompts); } .k-styles { --k: var(--k-styles); }
.k-notes { --k: var(--k-notes); } .k-memory { --k: var(--k-memory); }
`;

  // "…text ;;que" → { start, query }. The trigger must start a word; the query has no spaces.
  function detectTrigger(textBefore, trigger) {
    if (!trigger || trigger === 'disabled' || trigger === 'None') return null;
    const at = (textBefore || '').lastIndexOf(trigger);
    if (at === -1) return null;
    const before = at > 0 ? textBefore.charAt(at - 1) : '';
    if (before && !/\s/.test(before)) return null;
    const query = textBefore.slice(at + trigger.length);
    if (!/^@?[\w一-鿿-]*$/.test(query)) return null;
    return { start: at, query };
  }

  function h(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // options:
  //   root           element to render into
  //   dark           dark colors
  //   ticks          style ids ticked at open
  //   normalize(ids) one-of rules for styles (StylesRegistry.normalizeChoice bound to the list)
  //   liveStyles     apply every tick at once (stateful pages) instead of on Enter / Apply (chat sites)
  //   doneButton     show "Done" in the footer (Answer button mode)
  //   onInsert(item), onApplyStyles(ids), onClose(), onEdit(item) (optional ✎ on rows)
  function create(options) {
    const o = options;
    const box = h('div', 'wmp' + (o.dark ? ' dark' : ''));
    const listEl = h('div', 'wmp-list');
    const foot = h('div', 'wmp-foot');
    foot.appendChild(h('span', '', FOOTER));
    if (o.doneButton) {
      const done = h('button', 'wmp-done', 'Done');
      done.type = 'button';
      done.addEventListener('mousedown', (e) => { e.preventDefault(); o.onClose(); });
      foot.appendChild(done);
    }
    box.append(listEl, foot);
    o.root.appendChild(box);

    let items = [];
    let index = 0;
    const normalize = o.normalize || (ids => ids);
    let ticks = normalize(o.ticks || []);
    let appliedTicks = ticks.join(',');

    function rows() { return items; }

    function render() {
      listEl.textContent = '';
      if (!items.length) {
        listEl.appendChild(h('div', 'wmp-empty', 'Nothing here yet — create one in Library.'));
        return;
      }
      let group = null;
      items.forEach((item, i) => {
        if (item.group !== group) {
          group = item.group;
          const head = h('div', `wmp-head k-${group}`);
          head.append(h('span', 'wmp-sym', KINDS[group].symbol), document.createTextNode(KINDS[group].name));
          if (group === 'styles' && !o.liveStyles && ticks.join(',') !== appliedTicks) {
            const apply = h('button', 'wmp-apply', 'Apply ↵');
            apply.type = 'button';
            apply.addEventListener('mousedown', (e) => { e.preventDefault(); o.onApplyStyles(ticks.slice()); });
            head.appendChild(apply);
          }
          listEl.appendChild(head);
        }
        const row = h('div', `wmp-row k-${item.group}` + (i === index ? ' sel' : '') + (item.group === 'styles' && ticks.includes(item.id) ? ' ticked' : ''));
        if (item.group === 'styles') row.appendChild(h('span', 'wmp-tick', '✓'));
        row.appendChild(h('span', 'wmp-title', item.group === 'memory' ? item.title : item.title));
        row.appendChild(h('span', 'wmp-prev', item.preview || ''));
        if (item.size) row.appendChild(h('span', 'wmp-size', item.size));
        if (o.onEdit && item.group !== 'memory') {
          const edit = h('button', 'wmp-edit', '✎');
          edit.type = 'button';
          edit.title = 'Edit in Library';
          edit.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); o.onEdit(item); });
          row.appendChild(edit);
        }
        row.title = item.group === 'styles' ? item.preview : '';
        row.addEventListener('mousedown', (e) => { e.preventDefault(); index = i; choose(false); });
        row.addEventListener('mouseenter', () => { if (index !== i) { index = i; markSelected(); } });
        listEl.appendChild(row);
      });
      markSelected();
    }

    function markSelected() {
      const els = listEl.querySelectorAll('.wmp-row');
      els.forEach((el, i) => el.classList.toggle('sel', i === index));
      const sel = els[index];
      if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
    }

    function toggleTick(id) {
      ticks = ticks.includes(id) ? ticks.filter(x => x !== id) : normalize(ticks.concat(id));
      if (o.liveStyles) { appliedTicks = ticks.join(','); o.onApplyStyles(ticks.slice()); }
      render();
    }

    // byKey: Enter on a style applies (ticking the row first if nothing changed); a click only ticks
    function choose(byKey) {
      const item = items[index];
      if (!item) return;
      if (item.group !== 'styles') { o.onInsert(item); return; }
      if (!byKey || o.liveStyles) { toggleTick(item.id); return; }
      if (ticks.join(',') === appliedTicks && !ticks.includes(item.id)) ticks = normalize(ticks.concat(item.id));
      o.onApplyStyles(ticks.slice());
    }

    function jumpGroup(dir) {
      if (!items.length) return;
      const groups = [...new Set(items.map(i => i.group))];
      const cur = groups.indexOf(items[index].group);
      const next = groups[(cur + dir + groups.length) % groups.length];
      index = items.findIndex(i => i.group === next);
      markSelected();
    }

    return {
      el: box,
      setItems(next) {
        const keep = items[index] && next.findIndex(i => i.group === items[index].group && i.id === items[index].id);
        items = next;
        index = keep > 0 ? keep : 0;
        render();
      },
      setTicks(ids) { ticks = normalize(ids || []); appliedTicks = ticks.join(','); render(); },
      getTicks() { return ticks.slice(); },
      // Returns true when the key was used (the renderer then stops it from reaching the page)
      handleKey(e) {
        switch (e.key) {
          case 'ArrowDown': if (items.length) { index = (index + 1) % items.length; markSelected(); } return true;
          case 'ArrowUp': if (items.length) { index = (index - 1 + items.length) % items.length; markSelected(); } return true;
          case 'Tab': jumpGroup(e.shiftKey ? -1 : 1); return true;
          case 'Enter': if (e.shiftKey || e.isComposing) return false; choose(true); return true;
          case 'Escape': o.onClose(); return true;
          case ' ':
            if (items[index] && items[index].group === 'styles') { toggleTick(items[index].id); return true; }
            return false;
          default: return false;
        }
      },
      destroy() { box.remove(); }
    };
  }

  const PickerCore = { KINDS, FOOTER, CSS, detectTrigger, create };
  global.PickerCore = PickerCore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PickerCore;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));

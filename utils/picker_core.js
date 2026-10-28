// Workspace Manager - Picker core
// The one ";;" picker: list, groups, keyboard, ticks for styles, and its look. Two renderers place it:
// utils/autocomplete.js (floating overlay in a shadow root on chat sites) and ui/modules/picker_tray.js
// (inline tray in the manager). Renderers own placement and what "insert" means for their input.

(function (global) {
  const KINDS = {
    prompts: { name: 'Prompts', symbol: '@' },
    styles: { name: 'Styles', symbol: '≡' },
    tweaks: { name: 'Tweaks', symbol: '✎' },
    notes: { name: 'Notes', symbol: '✎' },
    memory: { name: 'Memory', symbol: '◆' }
  };

  const ORDER = ['prompts', 'styles', 'notes', 'memory', 'tweaks'];
  const STYLE_GROUP_ORDER = ['length', 'language', 'format', 'approach'];

  // Footer hints per tab (styles differ between chat sites, where ticks apply on Enter, and our pages, where they're live)
  function footerText(tab, liveStyles, tabs) {
    const nav = tabs > 1 ? '←→ tabs · ' : '';
    if (!['styles', 'tweaks'].includes(tab)) return `${nav}↑↓ choose · Enter insert · Esc close`;
    return liveStyles ? `${nav}↑↓ choose · Space or Enter tick · Esc close` : `${nav}↑↓ choose · Space tick · Enter apply · Esc close`;
  }
  const FOOTER = footerText('prompts', false, 4);

  // Kind colors (light / dark) are the same everywhere: prompts indigo, styles teal, notes amber, memory green
  const CSS = `
.wmp { --wmp-bg:#fff; --wmp-fg:#18181b; --wmp-muted:#71717a; --wmp-border:#e2e2e6; --wmp-sel:rgba(0,0,0,.06);
  --k-prompts:#4f46e5; --k-styles:#0f766e; --k-notes:#b45309; --k-memory:#15803d;
  font: 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: var(--wmp-fg);
  background: var(--wmp-bg); border: 1px solid var(--wmp-border); border-radius: 8px; overflow: hidden;
  display: flex; flex-direction: column; text-align: left; }
.wmp.dark { --wmp-bg:#212124; --wmp-fg:#f4f4f5; --wmp-muted:#a1a1aa; --wmp-border:#3a3a40; --wmp-sel:rgba(255,255,255,.08);
  --k-prompts:#818cf8; --k-styles:#2dd4bf; --k-notes:#fbbf24; --k-memory:#4ade80; }
.wmp-tabs { display: flex; gap: 2px; padding: 4px 6px 0; border-bottom: 1px solid var(--wmp-border); overflow-x: auto; }
.wmp-tab { display: inline-flex; align-items: center; gap: 4px; background: none; border: 0; border-bottom: 2px solid transparent;
  margin-bottom: -1px; padding: 5px 8px; font: inherit; font-size: 12px; color: var(--wmp-muted); cursor: pointer; white-space: nowrap; }
.wmp-tab:hover { color: var(--wmp-fg); }
.wmp-tab.on { color: var(--wmp-fg); border-bottom-color: var(--k); font-weight: 600; }
.wmp-tab.none { opacity: .45; }
.wmp-tab .wmp-sym { color: var(--k); font-weight: 700; }
.wmp-count { font-size: 11px; color: var(--wmp-muted); font-weight: 400; }
.wmp-apply { margin-left: auto; align-self: center; font-size: 12px; font-weight: 600; color: var(--k-styles); background: none;
  border: 1px solid var(--k-styles); border-radius: 6px; padding: 1px 8px; cursor: pointer; white-space: nowrap; }
.wmp-list { overflow-y: auto; max-height: var(--wmp-max, 260px); padding: 4px; }
.wmp-head { display: flex; align-items: baseline; gap: 6px; padding: 6px 8px 2px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .04em; color: var(--wmp-muted); }
.wmp-head .wmp-rule { text-transform: none; letter-spacing: 0; font-weight: 400; }
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
.k-tweaks { --k: var(--k-notes); } .k-notes { --k: var(--k-notes); } .k-memory { --k: var(--k-memory); }
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

  // Styles tab: sorted by style group (Length, Language, Format, Approach), each under a small header
  function styleSections(list) {
    const groups = (global.StylesRegistry && global.StylesRegistry.GROUPS) || {};
    const order = STYLE_GROUP_ORDER.concat(Object.keys(groups).filter(g => !STYLE_GROUP_ORDER.includes(g)));
    return list.slice().sort((a, b) => order.indexOf(a.styleGroup) - order.indexOf(b.styleGroup));
  }

  // The tab a picker opens on: the last one used in this page (people who mostly pick styles land there)
  let lastTab = null;

  // options:
  //   root           element to render into
  //   dark           dark colors
  //   ticks          style ids ticked at open
  //   normalize(ids) one-of rules for styles (StylesRegistry.normalizeChoice bound to the list)
  //   liveStyles     apply every tick at once (stateful pages) instead of on Enter / Apply (chat sites)
  //   doneButton     show "Done" in the footer (Answer button mode)
  //   onInsert(item), onApplyStyles(ids), onClose(), onEdit(item) (optional ✎ on rows)
  // setItems(items, groups): items already filtered by the query; groups = the tabs to show (groups that have
  // anything at all), so tabs don't come and go while typing.
  function create(options) {
    const o = options;
    const box = h('div', 'wmp' + (o.dark ? ' dark' : ''));
    const tabsEl = h('div', 'wmp-tabs');
    tabsEl.setAttribute('role', 'tablist');
    const listEl = h('div', 'wmp-list');
    const foot = h('div', 'wmp-foot');
    const footText = h('span', '');
    foot.appendChild(footText);
    if (o.doneButton) {
      const done = h('button', 'wmp-done', 'Done');
      done.type = 'button';
      done.addEventListener('mousedown', (e) => { e.preventDefault(); o.onClose(); });
      foot.appendChild(done);
    }
    box.append(tabsEl, listEl, foot);
    o.root.appendChild(box);

    let items = [];
    let tabs = [];
    let tab = null;
    let shown = [];
    let index = 0;
    const normalize = o.normalize || (ids => ids);
    let ticks = normalize(o.ticks || []);
    let appliedTicks = ticks.join(',');

    const inTab = (g) => items.filter(i => i.group === g);

    function setTab(g, keepIndex) {
      tab = g;
      lastTab = g;
      shown = g === 'styles' ? styleSections(inTab(g)) : inTab(g);
      if (!keepIndex) index = 0;
      index = Math.min(index, Math.max(0, shown.length - 1));
      render();
    }

    function renderTabs() {
      tabsEl.textContent = '';
      tabsEl.hidden = tabs.length < 2;
      for (const g of tabs) {
        const count = inTab(g).length;
        const b = h('button', `wmp-tab k-${g}` + (g === tab ? ' on' : '') + (count ? '' : ' none'));
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(g === tab));
        b.append(h('span', 'wmp-sym', KINDS[g].symbol), document.createTextNode(KINDS[g].name), h('span', 'wmp-count', String(count)));
        b.addEventListener('mousedown', (e) => { e.preventDefault(); setTab(g); });
        tabsEl.appendChild(b);
      }
      if (tab === 'styles' && !o.liveStyles && ticks.join(',') !== appliedTicks) {
        const apply = h('button', 'wmp-apply', 'Apply ↵');
        apply.type = 'button';
        apply.addEventListener('mousedown', (e) => { e.preventDefault(); o.onApplyStyles(ticks.slice()); });
        if (tabs.length < 2) { tabsEl.hidden = false; tabsEl.style.borderBottom = '0'; }
        tabsEl.appendChild(apply);
      }
    }

    function render() {
      renderTabs();
      footText.textContent = footerText(tab, o.liveStyles, tabs.length);
      listEl.textContent = '';
      if (!shown.length) {
        listEl.appendChild(h('div', 'wmp-empty', items.length ? 'No matches here. Try another tab.' : 'Nothing here yet. Add some in Library.'));
        return;
      }
      const ruleGroups = o.ruleGroups || (global.StylesRegistry && global.StylesRegistry.GROUPS) || {};
      let section = null;
      shown.forEach((item, i) => {
        if (['styles', 'tweaks'].includes(item.group) && item.styleGroup !== section) {
          section = item.styleGroup;
          const g = ruleGroups[section];
          const head = h('div', 'wmp-head', g ? g.name : section);
          if (g && (g.oneOf || item.group === 'tweaks')) head.appendChild(h('span', 'wmp-rule', g.oneOf ? '· pick one' : '· combine freely'));
          listEl.appendChild(head);
        }
        const row = h('div', `wmp-row k-${item.group}` + (i === index ? ' sel' : '') + (['styles', 'tweaks'].includes(item.group) && ticks.includes(item.id) ? ' ticked' : ''));
        if (['styles', 'tweaks'].includes(item.group)) row.appendChild(h('span', 'wmp-tick', '✓'));
        row.appendChild(h('span', 'wmp-title', item.title));
        row.appendChild(h('span', 'wmp-prev', item.preview || ''));
        if (item.size) row.appendChild(h('span', 'wmp-size', item.size));
        if (o.onEdit && !['memory', 'tweaks'].includes(item.group)) {
          const edit = h('button', 'wmp-edit', '✎');
          edit.type = 'button';
          edit.title = 'Edit in Library';
          edit.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); o.onEdit(item); });
          row.appendChild(edit);
        }
        row.title = ['styles', 'tweaks'].includes(item.group) ? item.preview : '';
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
      const item = shown[index];
      if (!item) return;
      if (!['styles', 'tweaks'].includes(item.group)) { o.onInsert(item); return; }
      if (!byKey || o.liveStyles) { toggleTick(item.id); return; }
      if (ticks.join(',') === appliedTicks && !ticks.includes(item.id)) ticks = normalize(ticks.concat(item.id));
      o.onApplyStyles(ticks.slice());
    }

    function switchTab(dir) {
      if (tabs.length < 2) return;
      const at = tabs.indexOf(tab);
      setTab(tabs[(at + dir + tabs.length) % tabs.length]);
    }

    return {
      el: box,
      setItems(next, groups) {
        const had = items.length > 0;
        items = next;
        const present = ORDER.filter(g => next.some(i => i.group === g));
        tabs = ORDER.filter(g => (groups || present).includes(g) || present.includes(g));
        let want = tab || (tabs.includes(lastTab) ? lastTab : tabs[0]);
        // While typing, jump to the first tab with matches if this one has none ("@…" means Prompts)
        if (!inTab(want).length && present.length) want = present[0];
        const keep = had && want === tab && shown[index] ? shown[index].id : null;
        setTab(want || null);
        if (keep) {
          const i = shown.findIndex(x => x.id === keep);
          if (i > 0) { index = i; markSelected(); }
        }
      },
      setTicks(ids) { ticks = normalize(ids || []); appliedTicks = ticks.join(','); render(); },
      getTicks() { return ticks.slice(); },
      tab() { return tab; },
      // Returns true when the key was used (the renderer then stops it from reaching the page)
      handleKey(e) {
        switch (e.key) {
          case 'ArrowDown': if (shown.length) { index = (index + 1) % shown.length; markSelected(); } return true;
          case 'ArrowUp': if (shown.length) { index = (index - 1 + shown.length) % shown.length; markSelected(); } return true;
          case 'ArrowRight': if (tabs.length < 2) return false; switchTab(1); return true;
          case 'ArrowLeft': if (tabs.length < 2) return false; switchTab(-1); return true;
          case 'Tab': switchTab(e.shiftKey ? -1 : 1); return true;
          case 'Enter': if (e.shiftKey || e.isComposing) return false; choose(true); return true;
          case 'Escape': o.onClose(); return true;
          case ' ':
            if (shown[index] && ['styles', 'tweaks'].includes(shown[index].group)) { toggleTick(shown[index].id); return true; }
            return false;
          default: return false;
        }
      },
      destroy() { box.remove(); }
    };
  }

  const PickerCore = { KINDS, ORDER, FOOTER, CSS, detectTrigger, create };
  global.PickerCore = PickerCore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PickerCore;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));

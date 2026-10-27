// Workspace Manager - Library page
// One page for the saved text the user picks with ";;": the Prompts tab (ui/modules/skills.js) and the Styles tab
// (answer styles, below). Also opens an item when the ✎ in a picker row is clicked ('wmOpenLibrary').

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  const DESCRIPTIONS = {
    prompts: 'Saved prompts. On a supported chat site, type ;; in the message box to pick one (you can change the key in Settings).',
    styles: 'How the AI should answer. Ticked styles become one last line of the message; on our pages the "≡ Answer" button picks them, on chat sites ;; does.'
  };

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function initStyles(container) {
    const listEl = container.querySelector('#styles-list');
    const form = container.querySelector('#style-form');
    const title = container.querySelector('#style-editor-title');
    const nameInput = container.querySelector('#input-style-name');
    const groupSelect = container.querySelector('#select-style-group');
    const groupHint = container.querySelector('#style-group-hint');
    const textInput = container.querySelector('#textarea-style-text');
    const preview = container.querySelector('#style-line-preview');
    const deleteBtn = container.querySelector('#btn-delete-style');
    const resetBtn = container.querySelector('#btn-reset-style');
    const addBtn = container.querySelector('#btn-add-style');
    const GROUPS = StylesRegistry.GROUPS;

    let styles = [];
    let selectedId = null;

    for (const [id, g] of Object.entries(GROUPS)) {
      const opt = el('option', '', g.name);
      opt.value = id;
      groupSelect.appendChild(opt);
    }

    function ruleOf(group) {
      return GROUPS[group] && GROUPS[group].oneOf ? 'pick one' : 'combine freely';
    }

    function original(id) {
      return StylesRegistry.BUILT_INS.find(b => b.id === id) || null;
    }

    function isEdited(style) {
      const o = original(style.id);
      return !!o && (o.name !== style.name || o.text !== style.text);
    }

    function render() {
      listEl.replaceChildren();
      for (const [group, g] of Object.entries(GROUPS)) {
        const inGroup = styles.filter(s => s.group === group);
        if (!inGroup.length) continue;
        const head = el('div', 'lib-group-head');
        head.append(el('span', '', g.name), el('span', 'lib-group-rule', ruleOf(group)));
        listEl.appendChild(head);
        for (const style of inGroup) {
          const card = el('div', 'prompt-card' + (style.id === selectedId ? ' selected' : ''));
          card.dataset.id = style.id;
          const header = el('div', 'prompt-card-header');
          const badge = el('span', 'tag' + (isEdited(style) ? ' tag-edited' : ''),
            style.builtIn ? (isEdited(style) ? 'Built-in · edited' : 'Built-in') : 'Yours');
          header.append(el('strong', 'prompt-card-key', style.name), badge);
          card.append(header, el('div', 'prompt-card-desc', style.text));
          card.addEventListener('click', () => select(style.id));
          listEl.appendChild(card);
        }
      }
    }

    function updatePreview() {
      const text = textInput.value.trim();
      preview.textContent = text ? `${StylesRegistry.LINE_PREFIX} … ${text}` : '';
      groupHint.textContent = `Styles in this group: ${ruleOf(groupSelect.value)}.`;
    }

    function select(id) {
      const style = styles.find(s => s.id === id);
      if (!style) return;
      selectedId = id;
      render();
      title.textContent = style.name;
      nameInput.value = style.name;
      groupSelect.value = style.group;
      groupSelect.disabled = style.builtIn;      // built-ins keep their group (only name and text are stored)
      textInput.value = style.text;
      deleteBtn.style.display = style.builtIn ? 'none' : 'block';
      resetBtn.hidden = !isEdited(style);
      updatePreview();
    }

    function startNew() {
      selectedId = null;
      render();
      title.textContent = 'New style';
      nameInput.value = '';
      groupSelect.value = 'approach';
      groupSelect.disabled = false;
      textInput.value = '';
      deleteBtn.style.display = 'none';
      resetBtn.hidden = true;
      updatePreview();
      nameInput.focus();
    }

    async function reload(keepId) {
      styles = await StylesStore.list();
      if (keepId && styles.some(s => s.id === keepId)) select(keepId);
      else render();
    }

    textInput.addEventListener('input', updatePreview);
    groupSelect.addEventListener('change', updatePreview);
    addBtn.addEventListener('click', startNew);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const id = await StylesStore.save({ id: selectedId, name: nameInput.value, group: groupSelect.value, text: textInput.value });
        await reload(id);
      } catch (err) {
        alert(err.message);
      }
    });

    deleteBtn.addEventListener('click', async () => {
      const style = styles.find(s => s.id === selectedId);
      if (!style || style.builtIn) return;
      if (!confirm(`Delete the style "${style.name}"?`)) return;
      await StylesStore.remove(style.id);
      await reload();
      startNew();
    });

    resetBtn.addEventListener('click', async () => {
      if (!original(selectedId)) return;
      await StylesStore.remove(selectedId);   // built-in: drops the edit
      await reload(selectedId);
    });

    // Styles can change from elsewhere (another manager window); keep the list fresh
    if (chromeAPI && chromeAPI.storage && chromeAPI.storage.onChanged) {
      chromeAPI.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.styles) reload(selectedId);
      });
    }

    reload().then(() => select(styles[0] && styles[0].id));

    return {
      async open(id) {
        await reload(id);
        const card = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (card) { card.scrollIntoView({ block: 'nearest' }); card.classList.add('flash'); }
      }
    };
  }

  window.LibraryPageModule = {
    async init(container) {
      const tabs = [...container.querySelectorAll('.lib-tab')];
      const description = container.querySelector('#lib-description');

      function showTab(name) {
        for (const tab of tabs) {
          const on = tab.dataset.tab === name;
          tab.classList.toggle('active', on);
          tab.setAttribute('aria-selected', String(on));
        }
        container.querySelector('#lib-prompts').hidden = name !== 'prompts';
        container.querySelector('#lib-styles').hidden = name !== 'styles';
        description.textContent = DESCRIPTIONS[name];
      }
      tabs.forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

      const stylesTab = initStyles(container);
      await window.SkillsModule.init(container);

      // ✎ in a picker row: go to the Library page and open that item
      document.addEventListener('wmOpenLibrary', (e) => {
        const { group, id } = e.detail || {};
        if (group !== 'prompts' && group !== 'styles') return;
        const nav = document.querySelector('.nav-item[data-target="skills"]');
        if (nav) nav.click();
        showTab(group);
        if (group === 'prompts') window.SkillsModule.select(id);
        else stylesTab.open(id);
      });
    }
  };
})();

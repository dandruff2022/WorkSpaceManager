// Workspace Manager - Markdown view
// Small renderer for the memory and answers: headings, bullet and numbered lists, paragraphs, fenced code, bold,
// italic, inline code, links and bare URLs. Builds DOM nodes (never innerHTML), so model text can't inject markup.

(() => {
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeUrl(url) {
    return /^https?:\/\//i.test(url) ? url : null;
  }

  function link(text, url) {
    const a = el('a', '', text);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  // Inline: `code`, **bold**, *italic* / _italic_, [text](url), bare URLs, 〔AI · basis: …〕 tags
  const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(〔[^〕]*〕)|((?:^|(?<=[\s(]))[*_][^*_\s][^*_]*[*_](?=[\s.,;:!?)]|$))/g;

  function inline(parent, text) {
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const t = m[0];
      if (m[1]) parent.appendChild(el('code', '', t.slice(1, -1)));
      else if (m[2]) inline(parent.appendChild(el('strong')), t.slice(2, -2));
      else if (m[3]) {
        const [, label, url] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        parent.appendChild(safeUrl(url) ? link(label, url) : document.createTextNode(label));
      } else if (m[4]) parent.appendChild(link(t, t));
      else if (m[5]) parent.appendChild(el('span', 'md-tag', t));
      else inline(parent.appendChild(el('em')), t.slice(1, -1));
      last = m.index + t.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    return parent;
  }

  // Returns a DocumentFragment
  function render(md, { onToggle, hideBasis = false } = {}) {
    const frag = document.createDocumentFragment();
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    let para = null;
    let list = null;
    const endBlocks = () => { para = null; list = null; };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let basis = '';
      if (hideBasis) line = line.replace(/\s*[〔(]AI\s*·\s*basis:\s*([^〕)\n]*)[〕)]/gi, (_, text) => { basis = text.trim(); return ''; });
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        endBlocks();
        const body = [];
        while (++i < lines.length && !new RegExp('^\\s*' + fence[1][0] + '{' + fence[1].length + ',}\\s*$').test(lines[i])) body.push(lines[i]);
        frag.appendChild(el('pre', 'md-pre', body.join('\n')));
        continue;
      }
      if (!line.trim()) { endBlocks(); continue; }
      const heading = line.match(/^(#{1,4})\s+(.*)$/);
      if (heading) {
        endBlocks();
        frag.appendChild(inline(el('h' + Math.min(6, heading[1].length + 2), 'md-h'), heading[2].trim()));
        continue;
      }
      const item = line.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/);
      if (item) {
        para = null;
        const ordered = /\d/.test(item[2]);
        const tag = ordered ? 'OL' : 'UL';
        const nested = item[1].length >= 2 && list && list.lastElementChild;
        let target = list;
        if (nested) {
          const parentLi = list.lastElementChild;
          target = parentLi.querySelector(':scope > ul, :scope > ol') || parentLi.appendChild(el(tag.toLowerCase(), 'md-list'));
        } else if (!list || list.tagName !== tag) {
          list = frag.appendChild(el(tag.toLowerCase(), 'md-list'));
          target = list;
        }
        const task = item[3].match(/^\[([ xX])\]\s+(.*)$/);
        const li = el('li', task ? 'md-task' : '');
        if (task) {
          const checked = task[1].toLowerCase() === 'x';
          li.classList.toggle('md-task-done', checked);
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = checked;
          box.disabled = !onToggle;
          box.setAttribute('aria-label', task[2]);
          const lineIndex = i;
          if (onToggle) box.addEventListener('change', () => onToggle(lineIndex, box.checked));
          li.appendChild(box);
          li.appendChild(inline(el('span', 'md-task-text'), task[2]));
        } else inline(li, item[3]);
        if (basis) li.title = basis;
        target.appendChild(li);
        continue;
      }
      list = null;
      if (para) para.appendChild(document.createTextNode(' '));
      else para = frag.appendChild(el('p', 'md-p'));
      inline(para, line.trim());
      if (basis) para.title = [para.title, basis].filter(Boolean).join('; ');
    }
    return frag;
  }

  window.MarkdownView = { render };
})();

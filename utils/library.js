// Workspace Manager - Library
// One query for "what can I insert here?" across the kinds of saved text (Prompts, Styles, Memory; Notes in 3.2 B).
// Each kind is a provider that turns stored data into picker items. Pure functions, shared by the background
// (library_query), the pages and Node tests.

(function (global) {
  // Group names and symbols live in utils/picker_core.js (KINDS)
  const GROUP_ORDER = ['prompts', 'styles', 'notes', 'memory'];

  // Which groups each writing surface offers (only redundant ones are left out)
  const SURFACE_GROUPS = {
    site: ['prompts', 'styles', 'notes', 'memory'],
    send: ['prompts', 'styles', 'notes', 'memory'],
    instruction: ['prompts', 'styles', 'notes', 'memory'],  // minus the current project's memory
    step: ['styles']
  };

  function words(text) {
    const t = (text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function firstLine(text, max = 90) {
    const line = (text || '').split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
    return line.length > max ? line.slice(0, max - 1) + '…' : line;
  }

  // Labelled blocks tell the AI "this is material", and tell the user where it came from
  // Progress (utils/workflow_prompts.js) goes along when it's loaded, so the memory makes sense at any stage
  function labelMemory(project, version) {
    const P = global.WorkflowPrompts;
    const text = P && P.withProgress ? P.withProgress(version.text, project) : (version.text || '').trim();
    return `[Project memory v${version.v}: ${project.title}]\n${text}`;
  }

  const providers = {
    prompts(data) {
      return Object.values(data.skills || {})
        .filter(s => (s.keyword || '').startsWith('@'))
        .sort((a, b) => a.keyword.localeCompare(b.keyword))
        .map(s => ({
          group: 'prompts', id: s.keyword, title: s.keyword, preview: s.description || firstLine(s.prompt),
          insert: { mode: 'paragraph', text: s.prompt }
        }));
    },
    styles(data) {
      return (data.styles || []).map(s => ({
        group: 'styles', id: s.id, title: s.name, preview: s.text, styleGroup: s.group,
        insert: { mode: 'requirement', text: s.text }
      }));
    },
    notes() {
      return [];
    },
    memory(data, context) {
      const skip = context.surface === 'instruction' ? context.projectId : null;
      return (data.projects || [])
        .filter(p => p.id !== skip && Array.isArray(p.memory) && p.memory.length)
        .map(p => {
          const version = p.memory[p.memory.length - 1];
          const goal = (version.text.match(/##\s*Goal\s*\n([\s\S]*?)(\n##|$)/) || [])[1];
          return {
            group: 'memory', id: p.id, title: p.title, preview: firstLine(goal || version.text),
            size: `v${version.v} · ${words(version.text)} words`,
            insert: { mode: 'paragraph', text: labelMemory(p, version) }
          };
        });
    }
  };

  function score(item, q) {
    if (!q) return 1;
    const title = item.title.toLowerCase().replace(/^@/, '');
    if (title.startsWith(q)) return 3;
    if (title.includes(q)) return 2;
    if ((item.preview || '').toLowerCase().includes(q)) return 1;
    return 0;
  }

  // data: {skills, styles (StylesRegistry.list), projects}; context: {surface, projectId?}
  // text: what the user typed after the trigger ("@re" limits to Prompts); group: optional one group only
  function query(data, context, text, group) {
    const ctx = context || {};
    let q = (text || '').trim().toLowerCase();
    let only = group || null;
    if (q.startsWith('@')) { only = 'prompts'; q = q.slice(1); }
    const allowed = (SURFACE_GROUPS[ctx.surface] || SURFACE_GROUPS.site).filter(g => !only || g === only);
    const out = [];
    for (const g of GROUP_ORDER) {
      if (!allowed.includes(g)) continue;
      const items = providers[g](data, ctx)
        .map(item => ({ item, s: score(item, q) }))
        .filter(x => x.s > 0);
      if (q) items.sort((a, b) => b.s - a.s);
      out.push(...items.map(x => x.item));
    }
    return out;
  }

  // The picker's tabs: groups with anything in them for this surface (before any query)
  function groupsWithItems(data, context) {
    return [...new Set(query(data, context, '').map(i => i.group))];
  }

  // Text to insert at the caret so the item sits in its own paragraph
  function paragraphText(before, after, text) {
    const b = before || '';
    const body = (text || '').trim();
    let prefix = '';
    if (b.trim()) prefix = b.endsWith('\n\n') ? '' : (b.endsWith('\n') ? '\n' : '\n\n');
    const suffix = (after || '').trim() ? '\n\n' : '';
    return prefix + body + suffix;
  }

  const Library = { GROUP_ORDER, SURFACE_GROUPS, providers, query, groupsWithItems, paragraphText, labelMemory, firstLine, words };

  global.Library = Library;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Library;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));

// Workspace Manager - Workflow Prompts
// Prompt templates, message builders, and parsers for the Projects memory workflow

(function (global) {
  const SECTIONS = ['Goal', 'Preferences', 'Decisions', 'Current state', 'Open questions'];

  const TEXT = {
    split: "Split this project into at most 2 independent subtasks for separate fresh chats. Explain briefly, then end with one fenced block labeled tasks: tasks separated by a line ===, each with Title:, Task: (self-contained), Needs: (section names from: Goal, Preferences, Decisions, Current state, Open questions), Return: (what the hand-off must keep, including source links).",
    splitMem: "If planning settles preferences, decisions or open questions, put the whole updated memory in a fenced block labeled mem (same headings, short bullet points) before the tasks block; otherwise leave it out.",
    task: "You handle one subtask of a larger project. Use only the context below; if something essential is missing, say so. In the result block keep every item listed in Return, with source links and what you could not verify.",
    result: "End your answer with exactly one fenced block labeled result. Put nothing after it, no follow-up question.",
    memUpdate: "Update the project memory using ONLY the old memory and the new material below; ignore anything else. Output only one fenced block labeled mem with the same headings. Mark each new decision with 〔AI · basis: …〕. If you remove an open question, add one line saying why. Leave everything else unchanged.",
    memStyle: "Write every section as short bullet points, one line each; keep the whole memory under 250 words. Current state says where things stand in one or two lines.",
    resume: "This is the memory of a project done in other chats. Decisions are settled; do not re-derive them. Continue from Current state.",
    combine: "This is the memory of a project and the results of its subtasks, each done in a separate chat. Combine them into one final answer for the Goal. Decisions are settled; do not re-derive them. Keep source links. Point out where results conflict and what is still missing.",
    noteEdit: "Edit the user's note as asked below. Keep their meaning, facts, links and language; add nothing new. Output only one fenced block labeled note with the full edited text, nothing before or after it.",
    notePart: "Edit only the part marked PART. The rest of the note is context; do not output it. Output only one fenced block labeled note with the edited part, nothing before or after it.",
    short: "Keep the answer under 150 words outside the block.",
    fix: function (label) {
      return `Your last answer did not end with the required fenced block labeled ${label}. Output only that block now, with no text before or after it.`;
    }
  };

  // Generate starter markdown for a new project
  function emptyMemory(title, goal) {
    const t = (title || '').trim();
    const g = (goal || '').trim();
    const lines = [
      `# Project: ${t}`,
      '## Goal'
    ];
    if (g) {
      lines.push(g);
    }
    lines.push('## Preferences');
    lines.push('## Decisions');
    lines.push('(none)');
    lines.push('## Current state');
    lines.push('Just started.');
    lines.push('## Open questions');
    lines.push('(none)');
    return lines.join('\n');
  }

  // Parse markdown memory into canonical sections and extras
  function parseMemory(md) {
    if (typeof md !== 'string') {
      return {
        title: '',
        sections: {
          'Goal': '',
          'Preferences': '',
          'Decisions': '',
          'Current state': '',
          'Open questions': ''
        },
        order: [],
        extra: {}
      };
    }

    const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    let title = '';
    const sections = {
      'Goal': '',
      'Preferences': '',
      'Decisions': '',
      'Current state': '',
      'Open questions': ''
    };
    const order = [];
    const extra = {};

    let currentKey = null;
    let isCanonical = false;
    let currentBodyLines = [];
    const preHeadingLines = [];
    let foundFirstHeading = false;

    function flushCurrent() {
      if (currentKey === null) return;
      const body = currentBodyLines.join('\n').trim();
      if (isCanonical) {
        sections[currentKey] = body;
      } else {
        extra[currentKey] = body;
      }
      currentBodyLines = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!foundFirstHeading) {
        const projMatch = line.match(/^#\s*Project:\s*(.*)$/i);
        if (projMatch) {
          title = projMatch[1].trim();
          continue;
        }
      }

      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const rawHeading = headingMatch[2].trim();
        const canonical = SECTIONS.find(s => s.toLowerCase() === rawHeading.toLowerCase());

        if (!foundFirstHeading) {
          foundFirstHeading = true;
          const pre = preHeadingLines.join('\n').trim();
          if (pre) {
            extra[''] = pre;
          }
        }

        flushCurrent();

        if (canonical) {
          currentKey = canonical;
          isCanonical = true;
          order.push(canonical);
        } else {
          currentKey = rawHeading;
          isCanonical = false;
          order.push(rawHeading);
        }
        continue;
      }

      if (!foundFirstHeading) {
        preHeadingLines.push(line);
      } else {
        currentBodyLines.push(line);
      }
    }

    if (!foundFirstHeading) {
      const pre = preHeadingLines.join('\n').trim();
      if (pre) {
        extra[''] = pre;
      }
    }

    flushCurrent();

    return { title, sections, order, extra };
  }

  // Pick only requested canonical sections in canonical order
  function pickSections(md, names) {
    if (!md || typeof md !== 'string') return '';
    if (!names || !Array.isArray(names) || names.length === 0) {
      return md.trim();
    }

    const requested = new Set();
    for (const name of names) {
      if (typeof name !== 'string') continue;
      const match = SECTIONS.find(s => s.toLowerCase() === name.trim().toLowerCase());
      if (match) {
        requested.add(match);
      }
    }

    const parsed = parseMemory(md);
    const out = [];
    if (parsed.title) {
      out.push(`# Project: ${parsed.title}`);
    }

    for (const sec of SECTIONS) {
      if (requested.has(sec)) {
        out.push(`## ${sec}`);
        const body = parsed.sections[sec];
        if (body) {
          out.push(body);
        }
      }
    }

    return out.join('\n');
  }

  // Strip single enclosing fence block if the whole text is wrapped in one
  function stripFence(md) {
    if (typeof md !== 'string') return '';
    const trimmed = md.trim();
    const lines = trimmed.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) return trimmed;

    const firstMatch = lines[0].match(/^\s*(`{3,}|~{3,})/);
    if (!firstMatch) return trimmed;

    const fenceChar = firstMatch[1][0];
    const fenceLen = firstMatch[1].length;

    const lastMatch = lines[lines.length - 1].match(/^\s*(`{3,}|~{3,})\s*$/);
    if (!lastMatch) return trimmed;

    if (lastMatch[1][0] !== fenceChar || lastMatch[1].length < fenceLen) {
      return trimmed;
    }

    return lines.slice(1, -1).join('\n').trim();
  }

  // Answer styles arrive as one ready line (options.requirements, from StylesRegistry.buildLine) and always go
  // last; the older options.short keeps its original layout.
  function hasLine(options) {
    return !!options && typeof options.requirements === 'string';
  }

  function withLine(parts, options) {
    const line = (options.requirements || '').trim();
    return parts.concat(line ? [line] : []).filter(p => p && p.trim().length > 0).join('\n\n');
  }

  // Progress: what the project has done so far, written from its data (no AI), so the memory makes sense at any
  // moment. Not stored; added when the memory is shown, inserted elsewhere or used to continue.
  const PROGRESS_HEADING = '## Progress (kept by the extension)';
  const AI_NAMES = { chatgpt: 'ChatGPT', gemini: 'Gemini' };

  function oneLine(text, max = 140) {
    const lines = String(text || '').split('\n').filter(l => !/^\s*(#|`{3,}|~{3,})/.test(l));
    const line = lines.map(l => l.replace(/^[>*\-\s]+/, '').replace(/[*_`]/g, '').trim()).find(Boolean) || '';
    return line.length > max ? line.slice(0, max - 1) + '…' : line;
  }

  function progressResult(task) {
    const normalize = text => text.replace(/[#*]/g, '').replace(/^\s*Title:\s*/i, '').trim().toLowerCase();
    const title = normalize(task.title || '');
    const candidates = readableAnswer('task', task.result || '').split('\n')
      .map(line => line.trim()).filter(line => line && !/^\s*[#*]*\s*Title:/i.test(line) && normalize(line) !== title).slice(0, 3);
    return oneLine(candidates.find(line => /\d/.test(line)) || candidates[0] || '');
  }

  function buildProgress(project) {
    if (!project) return '';
    const tasks = project.tasks || [];
    const steps = project.steps || [];
    const last = (test) => steps.slice().reverse().find(test) || null;
    const lines = [];
    if (tasks.length === 0) {
      lines.push(project.planSkipped ? '- No plan: working in one chat.' : '- Not planned yet.');
    } else {
      const done = tasks.filter(t => t.status === 'done').length;
      lines.push(`- Plan: ${tasks.length} task${tasks.length === 1 ? '' : 's'}, ${done} done.`);
      for (const t of tasks) {
        const ai = AI_NAMES[t.ai] ? ` (${AI_NAMES[t.ai]})` : '';
        if (t.status === 'done') lines.push(`- Done: ${t.title}${ai}: ${progressResult(t) || 'no result text'}`);
        else if (t.status === 'running') lines.push(`- Running: ${t.title}${ai}`);
        else if (t.status === 'needs-you') lines.push(`- Needs a look: ${t.title}${ai}`);
        else lines.push(`- To do: ${t.title}`);
      }
    }
    const combine = last(s => s.kind === 'combine');
    if (combine && combine.status === 'done') lines.push(`- Combined into a final answer${AI_NAMES[combine.ai] ? ' (' + AI_NAMES[combine.ai] + ')' : ''}.`);
    const resume = last(s => s.kind === 'resume' && s.status === 'done');
    if (resume) lines.push(`- Continued in a new chat${AI_NAMES[resume.ai] ? ' (' + AI_NAMES[resume.ai] + ')' : ''}.`);
    let next;
    if (tasks.length === 0) next = project.planSkipped ? 'Keep going in a new chat.' : 'Plan the work, or skip planning.';
    else if (!tasks.every(t => t.status === 'done')) next = 'Finish the tasks.';
    else if (!combine || combine.status !== 'done') next = 'Combine the results.';
    else next = 'Keep going in a new chat.';
    lines.push(`- Next: ${next}`);
    return PROGRESS_HEADING + '\n' + lines.join('\n');
  }

  // Memory text plus Progress (for reading, inserting and continuing; never sent to the memory update itself)
  function withProgress(memory, project) {
    const progress = buildProgress(project);
    return [(memory || '').trim(), progress].filter(Boolean).join('\n\n');
  }

  // Builder for split prompt
  function buildSplit(memory, options) {
    if (hasLine(options)) return withLine([TEXT.split + ' ' + TEXT.splitMem, (memory || '').trim()], options);
    const short = !!(options && options.short);
    let msg = TEXT.split + '\n\n' + (memory || '').trim();
    if (short) {
      msg += '\n\nOutput requirements:\n' + TEXT.short;
    }
    return msg;
  }

  // Builder for task prompt
  function buildTask(memory, task, options) {
    const short = !!(options && options.short);
    const t = task || {};
    const pickedMem = pickSections(memory, t.needs);
    const taskBlock = `Title: ${t.title || ''}\nTask: ${t.task || ''}\nReturn: ${t.ret || t.return || ''}`.trim();
    if (hasLine(options)) return withLine([TEXT.task, pickedMem, taskBlock, TEXT.result], options);
    const reqs = short
      ? `Output requirements:\n${TEXT.short}\n${TEXT.result}`
      : `Output requirements:\n${TEXT.result}`;

    const parts = [
      TEXT.task,
      pickedMem,
      taskBlock,
      reqs
    ].filter(p => p && p.trim().length > 0);

    return parts.join('\n\n');
  }

  // Builder for memory update prompt
  function buildMemUpdate(memory, results) {
    const parts = [
      TEXT.memUpdate + ' ' + TEXT.memStyle,
      'Old memory:\n' + (memory || '').trim()
    ];
    const matBlocks = (results || []).map(r => `### ${r.title}\n${(r.text || '').trim()}`);
    const newMat = matBlocks.length > 0 ? 'New material:\n' + matBlocks.join('\n\n') : 'New material:';
    parts.push(newMat);
    return parts.join('\n\n');
  }

  // Builder for resume prompt
  function buildResume(memory, instruction, options) {
    if (hasLine(options)) return withLine([TEXT.resume, (memory || '').trim(), (instruction || '').trim()], options);
    const short = !!(options && options.short);
    const parts = [
      TEXT.resume,
      (memory || '').trim(),
      (instruction || '').trim()
    ];
    if (short) {
      parts.push('Output requirements:\n' + TEXT.short);
    }
    return parts.join('\n\n');
  }

  // Builder for combine prompt: the answer is the final result in plain text, no block needed
  function buildCombine(memory, results, instruction, options) {
    const short = !!(options && options.short);
    const matBlocks = (results || []).map(r => `### ${r.title}\n${(r.text || '').trim()}`);
    if (hasLine(options)) {
      return withLine([TEXT.combine, (memory || '').trim(), 'Subtask results:\n' + matBlocks.join('\n\n'), (instruction || '').trim()], options);
    }
    const parts = [
      TEXT.combine,
      (memory || '').trim(),
      'Subtask results:\n' + matBlocks.join('\n\n'),
      (instruction || '').trim()
    ].filter(p => p.length > 0);
    if (short) {
      parts.push('Output requirements:\n' + TEXT.short);
    }
    return parts.join('\n\n');
  }

  // Built-in note tweaks; preferences are separate from note data and answer styles.
  const NOTE_TWEAK_GROUPS = {
    edit: { name: 'Edit', oneOf: false },
    language: { name: 'Language', oneOf: true }
  };
  const NOTE_TWEAKS = [
    { id: 'tidy', name: 'Tidy', group: 'edit', text: 'Tidy it: fix typos and grammar, keep the wording otherwise.' },
    { id: 'rephrase', name: 'Rephrase', group: 'edit', text: 'Rephrase it so it reads clearly.' },
    { id: 'structure', name: 'Structure', group: 'edit', text: 'Structure it: short headings and bullet points, same content.' },
    { id: 'shorter', name: 'Shorter', group: 'edit', text: 'Shorten it: cut repetition, keep every fact.' },
    { id: 'checklist', name: 'Checklist', group: 'edit', text: 'Turn action items into - [ ] checklist lines.' },
    { id: 'en', name: 'In English', group: 'language', text: 'Translate into English, keep formatting.' },
    { id: 'zh', name: 'In Chinese', group: 'language', text: 'Translate into Chinese, keep formatting.' }
  ];

  function normalizeNoteTweaks(ids) {
    const picked = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      const item = NOTE_TWEAKS.find(t => t.id === id);
      if (!item) continue;
      for (let i = picked.length - 1; i >= 0; i--) {
        const old = NOTE_TWEAKS.find(t => t.id === picked[i]);
        if (old.id === id || (NOTE_TWEAK_GROUPS[item.group].oneOf && old.group === item.group)) picked.splice(i, 1);
      }
      picked.push(id);
    }
    return picked;
  }

  function noteInstruction(request) {
    // Read old stored proposals and callers as well as the structured request.
    if (typeof request === 'string') return NOTE_TWEAKS.some(t => t.id === request)
      ? { tweaks: [request], text: '' } : { tweaks: [], text: request.trim() };
    return { tweaks: normalizeNoteTweaks(Array.isArray(request) ? request : request && request.tweaks), text: String(request && request.text || '').trim() };
  }

  function noteEditLabel(request) {
    const { tweaks } = noteInstruction(request);
    return tweaks.map(id => NOTE_TWEAKS.find(t => t.id === id).name).join(' + ') || 'AI edit';
  }

  // part = { text } when only a selection is edited
  function buildNoteEdit(noteText, instruction, part) {
    const { tweaks, text } = noteInstruction(instruction);
    const parts = tweaks.map(id => NOTE_TWEAKS.find(t => t.id === id).text);
    if (text) parts.push('Also: ' + text.replace(/\s*\n\s*/g, ' '));
    const ask = 'Request: ' + parts.join('; ');
    if (part && part.text) {
      return [TEXT.notePart, ask, 'Note:\n' + (noteText || '').trim(), 'PART:\n' + part.text.trim()].join('\n\n');
    }
    return [TEXT.noteEdit, ask, 'Note:\n' + (noteText || '').trim()].join('\n\n');
  }

  function parseNoteAnswer(text) {
    const block = parseBlock(text, 'note', { fallback: true });
    return block && block.trim() ? block.replace(/\s+$/, '') : null;
  }

  // Builder for fix prompt
  function buildFix(label) {
    return TEXT.fix(label);
  }

  // Parse fenced block by label (or fallback to last block)
  function parseBlock(text, label, options) {
    if (typeof text !== 'string') return null;
    const fallback = !!(options && options.fallback);
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Find this block's own closing fence: tagged fences inside (```python) open nested blocks, bare ones close them
    function extractBlock(openIdx, fenceChar, fenceLen) {
      const ch = fenceChar === '~' ? '~' : '`';
      const nestedOpenRe = new RegExp('^\\s*' + ch + '{3,}\\s*\\S+\\s*$');
      const closeRe = new RegExp('^\\s*' + ch + '{' + fenceLen + ',}\\s*$');
      const bareRe = new RegExp('^\\s*' + ch + '{3,}\\s*$');
      let depth = 0;
      let closeIdx = -1;
      for (let i = openIdx + 1; i < lines.length; i++) {
        if (nestedOpenRe.test(lines[i])) depth++;
        else if (depth > 0 && bareRe.test(lines[i])) depth--;
        else if (closeRe.test(lines[i])) { closeIdx = i; break; }
      }
      const innerLines = closeIdx !== -1
        ? lines.slice(openIdx + 1, closeIdx)
        : lines.slice(openIdx + 1);
      return innerLines.join('\n');
    }

    if (label) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const openRe = new RegExp('^\\s*(`{3,}|~{3,})\\s*' + escaped + '\\s*$', 'i');
      let targetOpenIdx = -1;
      let targetChar = '';
      let targetLen = 0;

      for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(openRe);
        if (m) {
          targetOpenIdx = i;
          targetChar = m[1][0];
          targetLen = m[1].length;
          break;
        }
      }

      if (targetOpenIdx !== -1) {
        return extractBlock(targetOpenIdx, targetChar, targetLen);
      }
    }

    if (!fallback) {
      return null;
    }

    const topBlocks = [];
    let nesting = 0;
    let currentOpen = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^\s*(`{3,}|~{3,})(?:\s*(\S+))?\s*$/);
      if (m) {
        const fenceChar = m[1][0];
        const fenceLen = m[1].length;
        const tag = m[2] || '';

        if (tag) {
          if (nesting === 0) {
            currentOpen = { idx: i, char: fenceChar, len: fenceLen, tag };
          }
          nesting++;
        } else {
          if (nesting === 0) {
            currentOpen = { idx: i, char: fenceChar, len: fenceLen, tag: '' };
            nesting = 1;
          } else {
            nesting--;
            if (nesting === 0 && currentOpen) {
              topBlocks.push(currentOpen);
              currentOpen = null;
            }
          }
        }
      }
    }

    if (nesting > 0 && currentOpen) {
      topBlocks.push(currentOpen);
    }

    if (topBlocks.length === 0) {
      return null;
    }

    // Only plain or markdown fences count as a mislabelled hand-off; a ```python block is never the answer
    const plain = topBlocks.filter(b => /^(|markdown|md|text|plaintext)$/i.test(b.tag || ''));
    if (plain.length === 0) return null;
    const lastBlock = plain[plain.length - 1];
    return extractBlock(lastBlock.idx, lastBlock.char, lastBlock.len);
  }

  // Parse tasks block into array of subtask descriptors
  function parseTasks(text) {
    if (typeof text !== 'string') return null;
    const blockText = parseBlock(text, 'tasks', { fallback: true });
    if (blockText === null) return null;

    const blockLines = blockText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const taskChunks = [];
    let currentChunkLines = [];

    for (const line of blockLines) {
      if (/^\s*={3,}\s*$/.test(line)) {
        taskChunks.push(currentChunkLines.join('\n'));
        currentChunkLines = [];
      } else {
        currentChunkLines.push(line);
      }
    }
    taskChunks.push(currentChunkLines.join('\n'));

    const tasks = [];
    for (const chunk of taskChunks) {
      if (!chunk.trim()) continue;
      const lines = chunk.split('\n');
      let currentField = null;
      const fieldLines = {
        title: [],
        task: [],
        needs: [],
        ret: []
      };

      for (const line of lines) {
        const m = line.match(/^\s*(Title|Task|Needs|Return)\s*:\s*(.*)$/i);
        if (m) {
          const fieldName = m[1].toLowerCase();
          if (fieldName === 'title') currentField = 'title';
          else if (fieldName === 'task') currentField = 'task';
          else if (fieldName === 'needs') currentField = 'needs';
          else if (fieldName === 'return') currentField = 'ret';
          if (m[2]) {
            fieldLines[currentField].push(m[2]);
          }
        } else if (currentField) {
          fieldLines[currentField].push(line);
        }
      }

      const title = fieldLines.title.join('\n').trim();
      if (!title) continue;

      // A task without instructions or a return list can't be run; treat the whole plan as malformed
      const task = fieldLines.task.join('\n').trim();
      const ret = fieldLines.ret.join('\n').trim();
      if (!task || !ret) return null;
      const rawNeeds = fieldLines.needs.join(' ').trim();
      const needs = [];
      if (rawNeeds) {
        const parts = rawNeeds.split(',');
        for (const part of parts) {
          const cleaned = part.trim();
          const match = SECTIONS.find(s => s.toLowerCase() === cleaned.toLowerCase());
          if (match && !needs.includes(match)) {
            needs.push(match);
          }
        }
      }

      tasks.push({ title, task, needs, ret });
    }

    if (tasks.length === 0) return null;
    return tasks;
  }

  // Presentation only: archives keep the exact answer for copying and inspection.
  function readableAnswer(kind, text) {
    text = String(text || '');
    const unfenced = value => value.replace(/^\s*(?:`{3,}|~{3,})[^\n]*$/gm, '').trim();
    if (kind === 'split') {
      const tasks = parseTasks(text);
      if (!tasks) return unfenced(text);
      const before = text.split(/^\s*(?:`{3,}|~{3,})/m)[0].trim();
      return [before, ...tasks.map(t => `**${t.title}**\n\n${t.task}`)].filter(Boolean).join('\n\n');
    }
    if (kind === 'task') return unfenced(text);
    if (kind === 'mem-update') return unfenced(text).replace(/\s*[〔(]AI\s*·\s*basis:[^〕)\n]*[〕)]/gi, '');
    return text;
  }

  // Parse memory update answer, validating required sections.
  // options.labelledOnly: only a block labelled mem counts (the plan answer, whose last block is the tasks block)
  function parseMemoryAnswer(text, options) {
    if (typeof text !== 'string') return null;
    const block = parseBlock(text, 'mem', { fallback: !(options && options.labelledOnly) });
    if (!block) return null;
    const stripped = stripFence(block);
    if (!stripped) return null;

    let sectionCount = 0;
    for (const sec of SECTIONS) {
      const escaped = sec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const headingRe = new RegExp('^#{1,3}\\s+' + escaped + '\\s*$', 'im');
      if (headingRe.test(stripped)) {
        sectionCount++;
      }
    }

    // A partial memory would silently drop sections, so all five are required
    if (sectionCount < SECTIONS.length) return null;
    return stripped;
  }

  // Compute section-by-section diff between two memory snapshots
  function diffMemory(oldMd, newMd) {
    const oldParsed = parseMemory(oldMd);
    const newParsed = parseMemory(newMd);

    const sectionKeys = [...SECTIONS];
    const seen = new Set(sectionKeys);

    const extraKeys = [
      ...Object.keys(oldParsed.extra || {}),
      ...Object.keys(newParsed.extra || {})
    ];
    for (const k of extraKeys) {
      if (!seen.has(k)) {
        seen.add(k);
        sectionKeys.push(k);
      }
    }

    function getLines(parsed, sec) {
      const raw = (sec in parsed.sections) ? parsed.sections[sec] : (parsed.extra[sec] || '');
      if (!raw) return [];
      return raw
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.trim().replace(/^[-*]\s+/, '').trim())
        .filter(line => line.trim().length > 0);
    }

    const result = [];
    for (const sec of sectionKeys) {
      const oldLines = getLines(oldParsed, sec);
      const newLines = getLines(newParsed, sec);

      const oldSet = new Set(oldLines);
      const newSet = new Set(newLines);

      const added = newLines.filter(l => !oldSet.has(l));
      const removed = oldLines.filter(l => !newSet.has(l));

      if (added.length > 0 || removed.length > 0) {
        result.push({
          section: sec,
          added,
          removed
        });
      }
    }

    return result;
  }

  // Count words outside the labelled block
  function countWordsOutside(text, label) {
    if (typeof text !== 'string') return 0;
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    let openIdx = -1;
    let targetChar = '';
    let targetLen = 0;

    if (label) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const openRe = new RegExp('^\\s*(`{3,}|~{3,})\\s*' + escaped + '\\s*$', 'i');
      for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(openRe);
        if (m) {
          openIdx = i;
          targetChar = m[1][0];
          targetLen = m[1].length;
          break;
        }
      }
    }

    if (openIdx === -1) {
      const trimmed = text.trim();
      return trimmed ? trimmed.split(/\s+/).length : 0;
    }

    const closeRe = new RegExp('^\\s*' + (targetChar === '~' ? '~' : '`') + '{' + targetLen + ',}\\s*$');
    let closeIdx = -1;
    for (let i = lines.length - 1; i > openIdx; i--) {
      if (closeRe.test(lines[i])) {
        closeIdx = i;
        break;
      }
    }

    const before = lines.slice(0, openIdx).join('\n').trim();
    const after = closeIdx !== -1 ? lines.slice(closeIdx + 1).join('\n').trim() : '';

    let count = 0;
    if (before) count += before.split(/\s+/).length;
    if (after) count += after.split(/\s+/).length;
    return count;
  }

  const WorkflowPrompts = {
    SECTIONS,
    TEXT,
    PROGRESS_HEADING,
    emptyMemory,
    parseMemory,
    buildProgress,
    withProgress,
    pickSections,
    stripFence,
    buildSplit,
    buildTask,
    buildMemUpdate,
    buildResume,
    buildCombine,
    buildFix,
    NOTE_TWEAKS,
    NOTE_TWEAK_GROUPS,
    normalizeNoteTweaks,
    noteInstruction,
    noteEditLabel,
    buildNoteEdit,
    parseNoteAnswer,
    parseBlock,
    readableAnswer,
    parseTasks,
    parseMemoryAnswer,
    diffMemory,
    countWordsOutside
  };

  // Export globally for browser / service worker and module.exports for Node
  global.WorkflowPrompts = WorkflowPrompts;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkflowPrompts;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));

// Workspace Manager - Projects Module
// One piece of work = memory (versioned) + tasks + activity. Each "Next step" button assembles a message the user
// can edit, then the background engine sends it, waits, reads the answer and saves the result.

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
  const P = window.WorkflowPrompts;

  const AI_NAMES = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
  const KIND_NAMES = { split: 'Split into tasks', task: 'Task', 'mem-update': 'Update memory', resume: 'Continue' };
  const STEP_STATUS = {
    sending: { text: 'Sending…', cls: 'status-working' },
    waiting: { text: 'Waiting for answer…', cls: 'status-working' },
    reading: { text: 'Reading…', cls: 'status-working' },
    done: { text: 'Done', cls: 'status-done' },
    'needs-you': { text: 'Needs you', cls: 'status-error' },
    error: { text: 'Failed', cls: 'status-error' }
  };
  const TASK_STATUS = {
    todo: { text: 'To do', cls: 'status-empty' },
    running: { text: 'Running…', cls: 'status-working' },
    done: { text: 'Done', cls: 'status-done' },
    'needs-you': { text: 'Needs you', cls: 'status-error' }
  };
  const HELP = {
    split: 'Asks the AI to split the project into up to 2 tasks that can run in separate chats. The tasks appear below.',
    task: 'Each task goes to a new chat on the AI picked in its card, with only the memory parts it needs.',
    'mem-update': 'A brand-new chat updates the memory from the finished task results. You can see what changed and undo it.',
    resume: 'Opens a new chat with the memory and your instruction, then takes you there to keep talking.'
  };

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
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  function chip(info) {
    return el('span', { class: `status-chip ${info.cls}` }, info.text);
  }

  function timeOf(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const currentMemory = (project) => project.memory[project.memory.length - 1];

  window.ProjectsModule = {
    init(container) {
      const $ = id => container.querySelector('#' + id);
      const selectEl = $('proj-select');
      const memoryEl = $('proj-memory');
      const composer = $('proj-composer');
      const messagesEl = $('proj-messages');
      const aiSelect = $('proj-ai');
      const shortBox = $('proj-short');
      const instructionEl = $('proj-instruction');

      let project = null;
      let projects = [];
      let composerKind = null;
      let memoryDirty = false;
      let shownChangesFor = null; // memory version whose diff is on screen
      let sending = false;

      function setMemStatus(text, kind = '') {
        $('proj-mem-status').textContent = text;
        $('proj-mem-status').className = `status-line ${kind}`;
      }

      async function load(projectId) {
        const list = await call('wf_list');
        if (list.status !== 'success') {
          setMemStatus(`Could not load projects: ${list.error}`, 'error');
          return;
        }
        projects = list.projects;
        if (projectId === undefined) projectId = (await call('wf_getCurrent')).projectId;
        const previousId = project ? project.id : null;
        project = projects.find(p => p.id === projectId) || projects[0] || null;
        if ((project ? project.id : null) !== previousId) {
          // Drafts belong to the project they were written for
          memoryDirty = false;
          shownChangesFor = null;
          if (composerKind !== null) closeComposer();
          setMemStatus('');
        }
        render();
      }

      function render() {
        selectEl.replaceChildren(...projects.map(p => el('option', { value: p.id }, p.title)));
        selectEl.hidden = projects.length === 0;
        $('proj-empty').hidden = projects.length > 0 || !$('proj-new-form').hidden;
        $('proj-main').hidden = !project;
        if (!project) return;
        selectEl.value = project.id;
        renderMemory();
        renderTasks();
        renderSteps();
        highlightNextStep();
      }

      function renderMemory() {
        const mem = currentMemory(project);
        $('proj-mem-version').textContent = `v${mem.v} · ${mem.v === 0 ? 'written by you' : (mem.by === 'you' ? 'edited by you' : 'updated by ' + mem.by)} · ${timeOf(mem.at)}`;
        if (!memoryDirty) memoryEl.value = mem.text;
        $('btn-proj-undo').hidden = project.memory.length < 2;
        $('btn-proj-mem-save').hidden = !memoryDirty;

        // After an AI update, show what changed until the user dismisses it
        const changes = $('proj-mem-changes');
        if (mem.v > 0 && mem.by !== 'you' && shownChangesFor !== -mem.v) {
          shownChangesFor = mem.v;
          changes.replaceChildren(
            el('div', { class: 'card-header' },
              el('strong', {}, `What ${mem.by} changed in v${mem.v}`),
              el('button', { class: 'btn-link', onclick: () => { shownChangesFor = -mem.v; changes.hidden = true; } }, 'Looks good')),
            renderDiff(project.memory[project.memory.length - 2].text, mem.text));
          changes.hidden = false;
        } else if (shownChangesFor !== mem.v) {
          changes.hidden = true;
        }
        if (!$('proj-history').hidden) renderHistory();
      }

      function renderDiff(oldText, newText) {
        const diff = P.diffMemory(oldText, newText);
        if (diff.length === 0) return el('p', { class: 'muted small' }, 'No changes.');
        return el('div', { class: 'diff' }, diff.map(d => el('div', {},
          el('div', { class: 'diff-section' }, d.section),
          d.removed.map(line => el('div', { class: 'diff-del' }, '− ' + line)),
          d.added.map(line => el('div', { class: /〔AI/.test(line) ? 'diff-add diff-ai' : 'diff-add' }, '+ ' + line))
        )));
      }

      function renderHistory() {
        const box = $('proj-history');
        const items = project.memory.slice().reverse().map((m, i, arr) => {
          const prev = arr[i + 1];
          const detail = el('div', { class: 'history-diff', hidden: true });
          const row = el('button', {
            class: 'history-row',
            onclick: () => {
              detail.hidden = !detail.hidden;
              if (!detail.hidden) detail.replaceChildren(prev ? renderDiff(prev.text, m.text) : el('pre', { class: 'small' }, m.text));
            }
          }, el('strong', {}, `v${m.v}`), ` · ${m.by}${m.note ? ' · ' + m.note : ''} · ${timeOf(m.at)}`);
          return el('div', {}, row, detail);
        });
        box.replaceChildren(...items);
      }

      function renderTasks() {
        const list = $('proj-tasks');
        if (project.tasks.length === 0) {
          list.replaceChildren(el('p', { class: 'muted small' }, 'No tasks yet. Use "Split into tasks", or just "Continue in…" for small work.'));
          return;
        }
        list.replaceChildren(...project.tasks.map(task => {
          const aiPick = el('select', {
            class: 'select', 'aria-label': 'AI for this task',
            onchange: () => call('wf_updateTask', { projectId: project.id, taskId: task.id, patch: { ai: aiPick.value } })
          }, Object.entries(AI_NAMES).map(([v, n]) => el('option', { value: v }, n)));
          aiPick.value = task.ai;
          aiPick.disabled = task.status === 'running';

          const redo = task.status === 'done' || task.status === 'needs-you'
            ? el('button', { class: 'btn-link', onclick: () => call('wf_updateTask', { projectId: project.id, taskId: task.id, patch: { status: 'todo' } }) }, 'Run again')
            : null;
          const remove = task.status !== 'running'
            ? el('button', { class: 'btn-link danger-link', onclick: () => call('wf_removeTask', { projectId: project.id, taskId: task.id }) }, 'Remove')
            : null;

          return el('div', { class: 'task-card' },
            el('div', { class: 'task-head' }, el('strong', { class: 'task-title' }, task.title), aiPick, chip(TASK_STATUS[task.status] || TASK_STATUS.todo)),
            el('details', {},
              el('summary', { class: 'muted small' }, 'Task details'),
              el('p', { class: 'small' }, task.task),
              el('p', { class: 'small muted' }, `Uses memory: ${task.needs.join(', ') || 'all'}`),
              el('p', { class: 'small muted' }, `Must return: ${task.ret}`)),
            task.result ? el('details', {}, el('summary', { class: 'small' }, 'Result'), el('pre', { class: 'result-text' }, task.result)) : null,
            el('div', { class: 'task-actions' }, redo, remove));
        }));
      }

      function renderSteps() {
        const list = $('proj-steps');
        if (project.steps.length === 0) {
          list.replaceChildren(el('p', { class: 'muted small' }, 'Nothing sent yet.'));
          return;
        }
        list.replaceChildren(...project.steps.slice().reverse().map(step => {
          const task = step.taskId && project.tasks.find(t => t.id === step.taskId);
          const what = step.kind === 'task' ? `Task: ${task ? task.title : '(removed)'}` : KIND_NAMES[step.kind];
          return el('div', { class: 'step-row' },
            el('span', { class: 'step-time muted small' }, timeOf(step.startedAt)),
            el('span', { class: 'step-what' }, what, el('span', { class: 'muted' }, ` · ${AI_NAMES[step.ai] || step.ai}`),
              step.error ? el('div', { class: 'small step-error' }, step.error) : null),
            chip(STEP_STATUS[step.status] || STEP_STATUS.error),
            el('span', { class: 'step-links' },
              (step.tabId !== null || step.url) ? el('button', { class: 'btn-link', onclick: () => openChat(step) }, 'Open chat') : null,
              step.archiveId ? el('button', { class: 'btn-link', onclick: () => showArchive(step, what) }, 'Full answer') : null,
              el('button', { class: 'btn-link', onclick: () => showText('Message sent', step.message) }, 'Sent')));
        }));
      }

      async function openChat(step) {
        const res = await call('wf_openChat', { projectId: project.id, stepId: step.id });
        if (res.status !== 'success') setMemStatus(res.error, 'error');
      }

      async function showArchive(step, what) {
        const res = await call('wf_getArchive', { archiveId: step.archiveId });
        showText(`${what} — full answer from ${AI_NAMES[step.ai]}`, res.text || res.error || '(empty)');
      }

      function showText(title, text) {
        $('proj-archive-title').textContent = title;
        $('proj-archive-text').textContent = text;
        $('proj-archive').showModal();
      }

      // Suggest the natural next step without forcing it
      function suggestedStep() {
        const tasks = project.tasks;
        if (tasks.some(t => t.status === 'running') || project.steps.some(s => ['sending', 'waiting', 'reading'].includes(s.status))) return null;
        if (tasks.length === 0) return 'split';
        if (tasks.some(t => t.status === 'todo')) return 'task';
        const lastTaskDone = Math.max(0, ...project.steps.filter(s => s.kind === 'task' && s.status === 'done').map(s => s.endedAt || 0));
        if (lastTaskDone > currentMemory(project).at) return 'mem-update';
        return 'resume';
      }

      function highlightNextStep() {
        const next = suggestedStep();
        container.querySelectorAll('.step-btn').forEach(btn => {
          btn.classList.toggle('btn-primary', btn.dataset.kind === next && composerKind === null);
          btn.classList.toggle('selected', btn.dataset.kind === composerKind);
        });
      }

      // Composer: build the message(s) for a step so the user can read and edit them before sending
      function memoryText() {
        return memoryDirty ? memoryEl.value : currentMemory(project).text;
      }

      function buildMessages(kind) {
        const opts = { short: shortBox.checked };
        const memory = memoryText();
        if (kind === 'split') return [{ text: P.buildSplit(memory, opts) }];
        if (kind === 'task') {
          return project.tasks.filter(t => t.status === 'todo').map(t => ({ task: t, text: P.buildTask(memory, t, opts) }));
        }
        if (kind === 'mem-update') {
          const results = project.tasks.filter(t => t.status === 'done' && t.result).map(t => ({ title: t.title, text: t.result }));
          return [{ text: P.buildMemUpdate(memory, results), empty: results.length === 0 }];
        }
        return [{ text: P.buildResume(memory, instructionEl.value.trim() || '(write your instruction here)', opts) }];
      }

      function openComposer(kind) {
        composerKind = kind;
        $('proj-composer-help').textContent = HELP[kind];
        instructionEl.hidden = kind !== 'resume';
        $('proj-ai-wrap').hidden = kind === 'task';
        shortBox.parentElement.hidden = kind === 'mem-update';
        if (kind === 'resume') {
          // Default to the other AI than the last step, to make switching provider the easy path
          const last = project.steps[project.steps.length - 1];
          if (last) aiSelect.value = last.ai === 'chatgpt' ? 'gemini' : 'chatgpt';
        }
        fillMessages();
        composer.hidden = false;
        highlightNextStep();
        if (kind === 'resume') instructionEl.focus();
      }

      function closeComposer() {
        composerKind = null;
        composer.hidden = true;
        highlightNextStep();
      }

      // Rebuild the assembled messages (memory, options or tasks changed); messages the user edited are kept
      function fillMessages() {
        const edited = {};
        messagesEl.querySelectorAll('textarea.step-message').forEach(a => { if (a.dataset.edited) edited[a.dataset.taskId] = a.value; });
        const msgs = buildMessages(composerKind);
        const sendBtn = $('btn-proj-send');
        if (composerKind === 'task' && msgs.length === 0) {
          messagesEl.replaceChildren(el('p', { class: 'muted small' }, 'No tasks to run. Split into tasks first, or click "Run again" on a task.'));
          sendBtn.disabled = true;
          return;
        }
        sendBtn.disabled = false;
        sendBtn.textContent = msgs.length > 1 ? `Send ${msgs.length} tasks` : 'Send';
        messagesEl.replaceChildren(...msgs.map(m => {
          const area = el('textarea', { class: 'text-input mono step-message', rows: 8, spellcheck: 'false' });
          area.dataset.taskId = m.task ? m.task.id : '';
          const key = area.dataset.taskId;
          area.value = key in edited ? edited[key] : m.text;
          if (key in edited) area.dataset.edited = '1';
          const wrap = msgs.length > 1
            ? el('details', {}, el('summary', { class: 'small' }, `${m.task.title} → ${AI_NAMES[m.task.ai]}`), area)
            : el('details', {}, el('summary', { class: 'small' }, 'Message that will be sent (you can edit it)'), area);
          if (m.empty) return el('div', {}, el('p', { class: 'status-line error' }, 'No finished task results yet. The memory will not change much.'), wrap);
          return wrap;
        }));
      }

      async function send() {
        if (sending) return;
        sending = true;
        $('btn-proj-send').disabled = true;
        try {
          await sendMessages();
        } finally {
          sending = false;
          $('btn-proj-send').disabled = false;
        }
      }

      async function sendMessages() {
        const areas = Array.from(messagesEl.querySelectorAll('textarea.step-message'));
        if (composerKind === 'resume' && !instructionEl.value.trim()) {
          instructionEl.focus();
          setMemStatus('Write what the AI should do next.', 'error');
          return;
        }
        if (memoryDirty) await saveMemory();
        const kind = composerKind;
        for (const area of areas) {
          const task = area.dataset.taskId && project.tasks.find(t => t.id === area.dataset.taskId);
          const res = await call('wf_run', {
            projectId: project.id, kind, ai: task ? task.ai : aiSelect.value, message: area.value, taskId: task ? task.id : null
          });
          if (res.status !== 'success') {
            setMemStatus(`Could not start: ${res.error}`, 'error');
            break;
          }
        }
        closeComposer();
      }

      async function saveMemory() {
        const res = await call('wf_editMemory', { projectId: project.id, text: memoryEl.value });
        if (res.status === 'success') {
          memoryDirty = false;
          setMemStatus('Saved.', 'ok');
        } else {
          setMemStatus(res.error, 'error');
        }
      }

      // Events
      selectEl.addEventListener('change', async () => {
        memoryDirty = false;
        closeComposer();
        await call('wf_setCurrent', { projectId: selectEl.value });
        load(selectEl.value);
      });

      $('btn-proj-new').addEventListener('click', () => {
        $('proj-new-form').hidden = false;
        $('proj-empty').hidden = true;
        $('proj-new-title').focus();
      });
      $('btn-proj-new-cancel').addEventListener('click', () => {
        $('proj-new-form').hidden = true;
        render();
      });
      $('btn-proj-create').addEventListener('click', async () => {
        const title = $('proj-new-title').value.trim() || 'Untitled project';
        const res = await call('wf_create', { title, memory: P.emptyMemory(title, $('proj-new-goal').value.trim()) });
        if (res.status !== 'success') return setMemStatus(res.error, 'error');
        $('proj-new-title').value = $('proj-new-goal').value = '';
        $('proj-new-form').hidden = true;
        await call('wf_setCurrent', { projectId: res.project.id });
        memoryDirty = false;
        await load(res.project.id);
        memoryEl.focus();
        setMemStatus('Add preferences and open questions if you like, then pick a next step.');
      });

      memoryEl.addEventListener('input', () => {
        memoryDirty = memoryEl.value !== currentMemory(project).text;
        $('btn-proj-mem-save').hidden = !memoryDirty;
        setMemStatus(memoryDirty ? 'Unsaved changes (saved when you send)' : '');
        if (composerKind !== null) fillMessages();
      });
      $('btn-proj-mem-save').addEventListener('click', saveMemory);
      $('btn-proj-undo').addEventListener('click', async () => {
        const mem = currentMemory(project);
        await call('wf_undoMemory', { projectId: project.id });
        memoryDirty = false;
        setMemStatus(`Removed v${mem.v}.`, 'ok');
      });
      $('btn-proj-history').addEventListener('click', () => {
        const box = $('proj-history');
        box.hidden = !box.hidden;
        if (!box.hidden) renderHistory();
      });
      $('btn-proj-delete').addEventListener('click', async () => {
        const btn = $('btn-proj-delete');
        if (btn.dataset.confirm !== 'yes') {
          btn.dataset.confirm = 'yes';
          btn.textContent = 'Click again to delete';
          setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Delete project'; }, 3000);
          return;
        }
        btn.dataset.confirm = '';
        btn.textContent = 'Delete project';
        await call('wf_remove', { projectId: project.id });
        load(null);
      });

      container.querySelectorAll('.step-btn').forEach(btn => btn.addEventListener('click', () => {
        if (composerKind === btn.dataset.kind) closeComposer(); else openComposer(btn.dataset.kind);
      }));
      $('btn-proj-cancel').addEventListener('click', closeComposer);
      $('btn-proj-send').addEventListener('click', send);
      shortBox.addEventListener('change', fillMessages);
      instructionEl.addEventListener('input', () => {
        // Keep the resume message in sync with the instruction unless the user already edited the message
        fillMessages();
      });
      messagesEl.addEventListener('input', (e) => { if (e.target.matches('textarea')) e.target.dataset.edited = '1'; });
      $('btn-proj-archive-close').addEventListener('click', () => $('proj-archive').close());

      // The engine reports progress; reload the shown project
      chromeAPI.runtime.onMessage.addListener((message) => {
        if (message.action === 'workflowUpdate' && project && message.payload?.projectId === project.id) load(project.id);
      });

      load();
    }
  };
})();

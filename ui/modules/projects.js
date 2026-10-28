// Workspace Manager - Projects Module
// One piece of work shown as a line of steps: Describe → Plan → Run tasks → Combine → Continue.
// The current step is open and highlighted; each step shows the message it will send (editable) before sending.
// The background engine sends it, waits, reads the answer and saves the result. Memory updates run as chores.

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
  const P = window.WorkflowPrompts;

  const AI_NAMES = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
  const KIND_NAMES = { split: 'Plan', task: 'Task', combine: 'Combine', 'mem-update': 'Memory update', resume: 'Continue' };
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
  const FLOW = ['describe', 'plan', 'tasks', 'combine', 'continue'];
  const FLOW_NAMES = { describe: 'Describe', plan: 'Plan', tasks: 'Run tasks', combine: 'Combine', continue: 'Continue' };

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
      else if (k === 'value') node.value = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }

  function chip(info) {
    return el('span', { class: `status-chip ${info.cls}` }, info.text);
  }

  function timeOf(ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const currentMemory = (project) => project.memory[project.memory.length - 1];
  const isActive = (step) => step && ['sending', 'waiting', 'reading'].includes(step.status);
  const lastStep = (project, test) => project.steps.slice().reverse().find(test) || null;

  // Where the project is, worked out from what it has: each flow step is done, current, running, future or skipped
  function flowState(project) {
    const tasks = project.tasks;
    const split = lastStep(project, s => s.kind === 'split');
    const combine = lastStep(project, s => s.kind === 'combine');
    const skipped = !!project.planSkipped && tasks.length === 0;
    const tasksDone = tasks.length > 0 && tasks.every(t => t.status === 'done');
    const lastTaskEnd = Math.max(0, ...project.steps.filter(s => s.kind === 'task' && s.status === 'done').map(s => s.endedAt || 0));
    const combineDone = tasksDone && !!combine && combine.status === 'done' && (combine.endedAt || 0) >= lastTaskEnd;
    // Combine is only finished once its memory update is saved, so Continue starts from the new memory
    const chore = combine && lastStep(project, s => s.kind === 'mem-update' && s.parentId === combine.id);

    const state = { describe: 'done' };
    if (skipped) state.plan = 'skipped';
    else if (isActive(split)) state.plan = 'running';
    else state.plan = tasks.length > 0 ? 'done' : 'current';

    if (skipped) state.tasks = 'skipped';
    else if (tasks.length === 0) state.tasks = 'future';
    else if (tasks.some(t => t.status === 'running')) state.tasks = 'running';
    else state.tasks = tasksDone ? 'done' : 'current';

    // (no chore a minute after Combine means it never started, e.g. the extension restarted in between)
    const choreStarting = combineDone && !chore && Date.now() - (combine.endedAt || 0) < 60000;
    if (skipped) state.combine = 'skipped';
    else if (isActive(combine) || choreStarting || isActive(chore)) state.combine = 'running';
    else if (!tasksDone) state.combine = 'future';
    else state.combine = combineDone && chore && chore.status === 'done' ? 'done' : 'current';

    state.continue = (skipped || state.combine === 'done') ? 'current' : 'future';
    const current = FLOW.find(k => state[k] === 'current' || state[k] === 'running');
    return { state, current, split, combine, chore, tasksDone, combineDone };
  }

  function seenKey(project) { return `wm_mem_seen_${project.id}`; }
  function seenVersion(project) { return parseInt(localStorage.getItem(seenKey(project)) || '0', 10); }

  window.ProjectsModule = {
    init(container) {
      const $ = id => container.querySelector('#' + id);
      const selectEl = $('proj-select');
      const memoryEl = $('proj-memory');
      const flowEl = $('proj-flow');

      let project = null;
      let projects = [];
      let memoryDirty = false;
      let memEditing = false;
      let busy = false;
      // Which flow step is open: null = the current one, 'none' = all folded
      let openKey = null;
      let lastCurrent = null;
      let lastPlanKey = null;
      // Drafts: instructions the user typed, messages they edited, open message boxes
      let drafts = { instruction: {}, edited: {}, openBoxes: new Set() };
      // Answer styles for Projects messages (Answer button), as the ready "Output requirements:" line
      let styleLine = '';
      let renderHeld = false;
      let loadVersion = 0;
      let selectedId;

      function setStatus(text, kind = '') {
        $('proj-status').textContent = text;
        $('proj-status').className = `status-line ${kind}`;
      }

      function setMemStatus(text, kind = '') {
        $('proj-mem-status').textContent = text;
        $('proj-mem-status').className = `status-line ${kind}`;
      }

      async function load(projectId) {
        const version = ++loadVersion;
        if (projectId !== undefined) selectedId = projectId;
        const list = await call('wf_list');
        if (version !== loadVersion) return;
        if (list.status !== 'success') {
          setStatus(`Could not load projects: ${list.error}`, 'error');
          return;
        }
        projects = list.projects;
        if (selectedId === undefined) selectedId = (await call('wf_getCurrent')).projectId;
        if (version !== loadVersion) return;
        projectId = selectedId;
        const previousId = project ? project.id : null;
        project = projects.find(p => p.id === projectId) || projects[0] || null;
        selectedId = project ? project.id : null;
        if ((project ? project.id : null) !== previousId) {
          // A picker from the old project must not hold the new project's flow on screen.
          if (window.PickerTray) PickerTray.closeIn(flowEl);
          flowEl.replaceChildren();
          renderHeld = false;
          // Drafts belong to the project they were written for
          memoryDirty = false;
          memEditing = false;
          openKey = null;
          lastCurrent = null;
          lastPlanKey = null;
          drafts = { instruction: {}, edited: {}, openBoxes: new Set() };
          setStatus('');
          setMemStatus('');
        }
        render();
      }

      function render() {
        selectEl.replaceChildren(...projects.map(p => el('option', { value: p.id }, p.title)));
        selectEl.hidden = projects.length === 0;
        $('proj-empty').hidden = projects.length > 0 || !$('proj-new-form').hidden;
        $('proj-main').hidden = !project || !$('proj-new-form').hidden;
        if (!project) return;
        selectEl.value = project.id;
        $('proj-main-ai').value = project.mainAi || 'chatgpt';
        renderFlow();
        renderMemory();
        renderSteps();
      }

      // ---------- Step line ----------

      function mainAi() { return project.mainAi || 'chatgpt'; }

      function memoryText() {
        return memoryDirty ? memoryEl.value : currentMemory(project).text;
      }

      function renderFlow() {
        const flow = flowState(project);
        const planKey = flow.split ? `${flow.split.id}:${flow.split.status}` : null;
        const planFinished = lastPlanKey && planKey !== lastPlanKey && ['done', 'needs-you', 'error'].includes(flow.split?.status);
        lastPlanKey = planKey;
        // Preserve a picker while typing, but never let it hide the next workflow step.
        if (!planFinished && flow.current === lastCurrent && window.PickerTray && PickerTray.isOpenIn(flowEl)) { renderHeld = true; return; }
        renderHeld = false;
        if (planFinished || flow.current !== lastCurrent) {
          if (window.PickerTray) PickerTray.closeIn(flowEl);
          // The project moved on: show the new current step
          lastCurrent = flow.current;
          openKey = planFinished && flow.split.status !== 'done' ? 'plan' : null;
        }
        // Keep focus and caret in the box the user is typing in across re-renders
        const active = document.activeElement;
        const focusKey = active && flowEl.contains(active) ? active.dataset.key : null;
        const caret = focusKey ? [active.selectionStart, active.selectionEnd] : null;

        flowEl.replaceChildren(...FLOW.map((key, i) => {
          const state = flow.state[key];
          const open = openKey === null ? key === flow.current : openKey === key;
          const dot = state === 'done' ? '✓' : state === 'skipped' ? '–' : String(i + 1);
          const head = el('button', {
            class: 'flow-head', 'aria-expanded': open ? 'true' : 'false',
            onclick: () => { openKey = open ? 'none' : key; renderFlow(); }
          },
          el('span', { class: 'flow-dot' }, dot),
          el('span', { class: 'flow-name' }, FLOW_NAMES[key]),
          el('span', { class: 'flow-summary muted small' }, summaryOf(key, state, flow)));
          return el('li', { class: `flow-step flow-${state}${open ? ' flow-open' : ''}` },
            head, open ? el('div', { class: 'flow-body' }, bodyOf(key, state, flow)) : null);
        }));

        if (focusKey) {
          const box = flowEl.querySelector(`[data-key="${focusKey}"]`);
          if (box) {
            box.focus();
            if (caret && box.setSelectionRange) box.setSelectionRange(caret[0], caret[1]);
          }
        }
      }

      function summaryOf(key, state, flow) {
        const tasks = project.tasks;
        if (key === 'describe') return goalLine();
        if (key === 'plan') {
          if (state === 'skipped') return 'Skipped — one chat';
          if (state === 'running') return `${AI_NAMES[flow.split.ai]} is planning…`;
          if (state === 'done') return `${tasks.length} task${tasks.length === 1 ? '' : 's'}${flow.split ? ' · ' + AI_NAMES[flow.split.ai] : ''}`;
          return flow.split && !isActive(flow.split) && flow.split.status !== 'done' ? 'Last try failed' : 'Split the work into tasks';
        }
        if (key === 'tasks') {
          if (state === 'skipped') return '';
          if (state === 'future') return 'After the plan';
          const done = tasks.filter(t => t.status === 'done').length;
          const running = tasks.filter(t => t.status === 'running').length;
          return `${done}/${tasks.length} done${running ? ` · ${running} running` : ''}`;
        }
        if (key === 'combine') {
          if (state === 'skipped') return '';
          if (state === 'future') return 'Merge the task results into the final answer';
          if (state === 'running') return isActive(flow.combine) ? `${AI_NAMES[flow.combine.ai]} is combining…` : 'Updating the memory…';
          if (state === 'done') return `Final answer · ${AI_NAMES[flow.combine.ai]}`;
          if (flow.combineDone) return 'The memory update failed';
          return flow.combine && flow.combine.status !== 'done' && flow.combine.endedAt ? 'Last try failed' : 'Merge the task results into the final answer';
        }
        return 'Keep going in a new chat with the memory';
      }

      function goalLine() {
        const goal = (P.parseMemory(currentMemory(project).text).sections.Goal || '').trim().split('\n')[0];
        return goal ? `“${goal.length > 70 ? goal.slice(0, 70) + '…' : goal}”` : project.title;
      }

      function bodyOf(key, state, flow) {
        if (key === 'describe') return describeBody();
        if (key === 'plan') return planBody(state, flow);
        if (key === 'tasks') return tasksBody(state);
        if (key === 'combine') return combineBody(state, flow);
        return continueBody(flow);
      }

      function describeBody() {
        return [
          el('p', { class: 'small' }, (P.parseMemory(currentMemory(project).text).sections.Goal || '').trim() || '(no goal written)'),
          el('button', { class: 'btn-link', onclick: () => openMemory(true, true) }, 'Edit the goal in Memory')
        ];
      }

      function planBody(state, flow) {
        const parts = [];
        if (flow.split) parts.push(stepLine(flow.split));
        const failed = flow.split && ['needs-you', 'error'].includes(flow.split.status);
        if (failed) parts.push(el('p', { class: 'small step-error' },
          `Planning did not finish: ${flow.split.error || 'No usable task list was saved'}. Read the full answer, try again, or skip planning.`));
        if (state === 'running') return parts;
        if (state === 'skipped') {
          parts.push(el('p', { class: 'muted small' }, 'No plan: the work happens in one chat (Continue).'),
            el('div', { class: 'flow-actions' }, el('button', { class: 'btn', onclick: () => setOptions({ planSkipped: false }) }, 'Plan it after all')));
          return parts;
        }
        const working = project.tasks.some(t => t.status === 'running') || isActive(flow.combine);
        parts.push(el('p', { class: 'muted small' },
          state !== 'done' ? `${AI_NAMES[mainAi()]} splits the work into up to 2 tasks that run in separate chats.`
            : working ? 'You can plan again when the running tasks finish.' : 'Planning again replaces the current tasks.'));
        parts.push(messageBox('split', builtMessage('split')));
        parts.push(el('div', { class: 'flow-actions' },
          answerToggle(),
          el('span', { class: 'spacer' }),
          state === 'done' ? null : el('button', { class: 'btn', disabled: busy, onclick: () => setOptions({ planSkipped: true }) }, 'Skip — do it in one chat'),
          el('button', { class: 'btn btn-primary', disabled: busy || working, onclick: () => send('split') },
            `${failed ? 'Try again' : state === 'done' ? 'Plan again' : 'Plan'} with ${AI_NAMES[mainAi()]}`)));
        return parts;
      }

      function tasksBody(state) {
        if (state === 'skipped') return el('p', { class: 'muted small' }, 'Skipped.');
        if (state === 'future') return el('p', { class: 'muted small' }, 'The tasks appear here after the plan.');
        const parts = [el('div', { class: 'task-list' }, project.tasks.map(taskRow))];
        const todo = project.tasks.filter(t => t.status === 'todo');
        if (todo.length > 0) {
          parts.push(el('p', { class: 'muted small' }, 'Each task goes to a new chat on its AI, with only the memory parts it needs.'));
          parts.push(...todo.map(t => messageBox(`task:${t.id}`, builtMessage(`task:${t.id}`), `Message for “${t.title}” → ${AI_NAMES[t.ai]}`)));
          parts.push(el('div', { class: 'flow-actions' },
            answerToggle(),
            el('span', { class: 'spacer' }),
            el('button', { class: 'btn btn-primary', disabled: busy, onclick: () => send('task') },
              todo.length === 1 ? 'Run the task' : `Run ${todo.length} tasks`)));
        }
        return parts;
      }

      function taskRow(task) {
        const aiPick = el('select', {
          class: 'select', 'aria-label': 'AI for this task', disabled: task.status === 'running',
          onchange: () => call('wf_updateTask', { projectId: project.id, taskId: task.id, patch: { ai: aiPick.value } })
        }, Object.entries(AI_NAMES).map(([v, n]) => el('option', { value: v }, n)));
        aiPick.value = task.ai;
        const step = task.stepId && project.steps.find(s => s.id === task.stepId);

        return el('div', { class: 'task-card' },
          el('div', { class: 'task-head' }, el('strong', { class: 'task-title' }, task.title), aiPick, chip(TASK_STATUS[task.status] || TASK_STATUS.todo)),
          step && task.status !== 'todo' ? stepLine(step, { compact: true }) : null,
          el('details', {},
            el('summary', { class: 'muted small' }, 'Task details'),
            el('p', { class: 'small' }, task.task),
            el('p', { class: 'small muted' }, `Uses memory: ${task.needs.join(', ') || 'all'}`),
            el('p', { class: 'small muted' }, `Must return: ${task.ret}`)),
          task.result ? el('details', {}, el('summary', { class: 'small' }, 'Result'), el('pre', { class: 'result-text' }, task.result)) : null,
          el('div', { class: 'task-actions' },
            task.status === 'done' || task.status === 'needs-you'
              ? el('button', { class: 'btn-link', onclick: () => call('wf_updateTask', { projectId: project.id, taskId: task.id, patch: { status: 'todo' } }) }, 'Run again')
              : null,
            task.status !== 'running'
              ? el('button', { class: 'btn-link danger-link', onclick: () => call('wf_removeTask', { projectId: project.id, taskId: task.id }) }, 'Remove')
              : null));
      }

      function combineBody(state, flow) {
        if (state === 'skipped') return el('p', { class: 'muted small' }, 'Skipped.');
        const parts = [];
        if (flow.combine) {
          parts.push(stepLine(flow.combine, { answerLabel: 'Final answer' }));
          if (flow.chore) parts.push(choreLine(flow.chore, flow.combine));
          else if (flow.combineDone && state === 'current') {
            parts.push(el('div', { class: 'step-line chore-line' }, el('span', { class: 'small step-error' }, 'The memory update did not start.'),
              el('button', { class: 'btn-link', onclick: () => retryChore(flow.combine) }, 'Try again')));
          }
        }
        if (state === 'running') return parts;
        if (state === 'future') {
          parts.push(el('p', { class: 'muted small' }, 'Opens when every task is done.'));
          return parts;
        }
        parts.push(el('p', { class: 'muted small' },
          `${AI_NAMES[mainAi()]} merges the task results into one answer, in a chat you can keep talking in. The memory is updated after that.`));
        parts.push(instructionBox('combine', 'Anything to add? e.g. one page, as a table (optional)'));
        parts.push(messageBox('combine', builtMessage('combine')));
        parts.push(el('div', { class: 'flow-actions' },
          answerToggle(),
          el('span', { class: 'spacer' }),
          el('button', { class: 'btn btn-primary', disabled: busy, onclick: () => send('combine') },
            `${state === 'done' ? 'Combine again' : 'Combine'} with ${AI_NAMES[mainAi()]}`)));
        return parts;
      }

      function continueBody(flow) {
        const parts = [];
        const resumes = project.steps.filter(s => s.kind === 'resume').slice(-3).reverse();
        parts.push(el('p', { class: 'muted small' }, 'Starts a new chat with the memory and your instruction, then takes you there.'));
        if (flow.combineDone) {
          parts.push(el('p', { class: 'small' },
            flow.combine.archiveId ? el('button', { class: 'btn-link inline-link', onclick: () => showArchive(flow.combine, 'Combine') }, 'Read the final answer') : null,
            (flow.combine.tabId !== null || flow.combine.url) ? [', or keep talking in the ',
              el('button', { class: 'btn-link inline-link', onclick: () => openChat(flow.combine) }, 'Combine chat')] : null,
            '.'));
        }
        parts.push(instructionBox('resume', 'What should the AI do next? e.g. Turn this into a checklist'));
        parts.push(messageBox('resume', builtMessage('resume')));
        parts.push(el('div', { class: 'flow-actions' },
          answerToggle(),
          el('span', { class: 'spacer' }),
          Object.entries(AI_NAMES).map(([ai, name]) => el('button', {
            class: ai === mainAi() ? 'btn btn-primary' : 'btn', disabled: busy, onclick: () => send('resume', ai)
          }, `Continue in ${name}`))));
        if (resumes.length) parts.push(el('div', { class: 'flow-past' }, resumes.map(s => stepLine(s))));
        return parts;
      }

      // One sent step: status, AI, and links to its chat and full answer
      function stepLine(step, { compact = false, answerLabel = 'Full answer' } = {}) {
        const name = KIND_NAMES[step.kind];
        return el('div', { class: 'step-line' },
          compact ? null : chip(STEP_STATUS[step.status] || STEP_STATUS.error),
          el('span', { class: 'small' }, compact
            ? `Sent ${timeOf(step.startedAt)}${isActive(step) ? ' · ' + STEP_STATUS[step.status].text : ''}`
            : `${name} · ${AI_NAMES[step.ai] || step.ai}${step.temporary ? ' · temporary chat' : ''} · ${timeOf(step.startedAt)}`),
          step.error ? el('span', { class: 'small step-error' }, step.error) : null,
          el('span', { class: 'step-links' },
            (step.tabId !== null || (step.url && !step.temporary)) ? el('button', { class: 'btn-link', onclick: () => openChat(step) }, 'Open chat') : null,
            step.archiveId ? el('button', { class: 'btn-link', onclick: () => showArchive(step, name) }, answerLabel) : null));
      }

      function choreLine(chore, combine) {
        const mem = currentMemory(project);
        const saved = chore.status === 'done';
        return el('div', { class: 'step-line chore-line' },
          chip(STEP_STATUS[chore.status] || STEP_STATUS.error),
          el('span', { class: 'small' }, saved ? `Memory updated to v${mem.v} by ${AI_NAMES[chore.ai]}` : `Updating memory · ${AI_NAMES[chore.ai]}${chore.temporary ? ' · temporary chat' : ''}`),
          chore.error ? el('span', { class: 'small step-error' }, chore.error) : null,
          el('span', { class: 'step-links' },
            saved ? el('button', { class: 'btn-link', onclick: () => openMemory(true) }, 'See changes') : null,
            !saved && chore.tabId !== null ? el('button', { class: 'btn-link', onclick: () => openChat(chore) }, 'Open chat') : null,
            !isActive(chore) && !saved ? el('button', { class: 'btn-link', onclick: () => retryChore(combine) }, 'Try again') : null));
      }

      function instructionBox(key, placeholder) {
        const box = el('textarea', {
          class: 'text-input instruction-box', rows: 2, placeholder: placeholder + ' — ;; for saved prompts and notes',
          'data-key': `instr:${key}`, value: drafts.instruction[key] || '',
          oninput: (e) => {
            drafts.instruction[key] = e.target.value;
            refreshMessages();
          }
        });
        if (window.PickerTray) {
          PickerTray.attach(box, { surface: 'instruction', place: 'projects', projectId: () => project && project.id, onClose: releaseRender });
        }
        return box;
      }

      // The message a step would send, from the current memory, instruction and answer styles
      function builtMessage(key, resumeFallback = '(write your instruction above)') {
        const memory = memoryText();
        const opts = { requirements: styleLine };
        if (key === 'split') return P.buildSplit(memory, opts);
        if (key.startsWith('task:')) return P.buildTask(memory, project.tasks.find(t => `task:${t.id}` === key) || {}, opts);
        if (key === 'combine') {
          const results = project.tasks.filter(t => t.status === 'done' && t.result).map(t => ({ title: t.title, text: t.result }));
          return P.buildCombine(memory, results, drafts.instruction.combine || '', opts);
        }
        return P.buildResume(P.withProgress(memory, project), drafts.instruction.resume || resumeFallback, opts);
      }

      // Update the shown messages in place (no re-render, so typing and an open tray are kept)
      function refreshMessages() {
        flowEl.querySelectorAll('textarea[data-key^="msg:"]').forEach(area => {
          const key = area.dataset.key.slice(4);
          if (!(key in drafts.edited)) area.value = builtMessage(key);
        });
      }

      function releaseRender() {
        if (renderHeld) setTimeout(() => { if (!PickerTray.isOpenIn(flowEl)) renderFlow(); }, 0);
      }

      // The assembled message, editable; edits are kept until it is sent or reset
      function messageBox(key, built, label = 'Message that will be sent (you can edit it)') {
        const edited = key in drafts.edited;
        const area = el('textarea', {
          class: 'text-input mono step-message', rows: 8, spellcheck: 'false', 'data-key': `msg:${key}`,
          value: edited ? drafts.edited[key] : built,
          oninput: (e) => {
            const first = !(key in drafts.edited);
            drafts.edited[key] = e.target.value;
            if (first) renderFlow();
          }
        });
        const box = el('details', {
          open: drafts.openBoxes.has(key),
          ontoggle: (e) => { if (e.target.open) drafts.openBoxes.add(key); else drafts.openBoxes.delete(key); }
        },
        el('summary', { class: 'small' }, label, edited ? el('span', { class: 'muted' }, ' · edited') : null),
        area,
        edited ? el('button', { class: 'btn-link', onclick: () => { delete drafts.edited[key]; renderFlow(); } }, 'Undo my edits') : null);
        return box;
      }

      // "≡ Answer: Short ▾": one choice for all Projects messages (remembered); shown in each message's last line
      function answerToggle() {
        return window.PickerTray ? PickerTray.answerControl({ place: 'projects', onClose: releaseRender }) : null;
      }

      // ---------- Sending ----------

      function messageFor(key, built) {
        return key in drafts.edited ? drafts.edited[key] : built;
      }

      async function send(kind, ai) {
        if (busy) return;
        if (kind === 'resume' && !(drafts.instruction.resume || '').trim() && !('resume' in drafts.edited)) {
          setStatus('Write what the AI should do next.', 'error');
          const box = flowEl.querySelector('[data-key="instr:resume"]');
          if (box) box.focus();
          return;
        }
        busy = true;
        setStatus('');
        renderFlow();
        try {
          if (memoryDirty) {
            await saveMemory();
            if (memoryDirty) return;
            await load(project.id);
          }
          const runs = [];
          if (kind === 'split') {
            runs.push({ key: 'split', ai: mainAi(), message: messageFor('split', builtMessage('split')) });
          } else if (kind === 'task') {
            for (const t of project.tasks.filter(t => t.status === 'todo')) {
              runs.push({ key: `task:${t.id}`, ai: t.ai, taskId: t.id, message: messageFor(`task:${t.id}`, builtMessage(`task:${t.id}`)) });
            }
          } else if (kind === 'combine') {
            runs.push({ key: 'combine', ai: mainAi(), message: messageFor('combine', builtMessage('combine')) });
          } else {
            runs.push({ key: 'resume', ai, message: messageFor('resume', builtMessage('resume', '')) });
          }
          for (const run of runs) {
            const res = await call('wf_run', { projectId: project.id, kind, ai: run.ai, message: run.message, taskId: run.taskId || null });
            if (res.status !== 'success') {
              setStatus(`Could not start: ${res.error}`, 'error');
              break;
            }
            delete drafts.edited[run.key];
            drafts.openBoxes.delete(run.key);
          }
          if (kind === 'combine' || kind === 'resume') drafts.instruction[kind] = '';
        } finally {
          busy = false;
          await load(project.id);
        }
      }

      async function retryChore(combine) {
        const res = await call('wf_retryChore', { projectId: project.id, combineStepId: combine.id });
        if (res.status !== 'success') setStatus(`Could not start: ${res.error}`, 'error');
      }

      async function setOptions(patch) {
        const res = await call('wf_setOptions', { projectId: project.id, patch });
        if (res.status !== 'success') setStatus(res.error, 'error');
        await load(project.id);
      }

      async function openChat(step) {
        const res = await call('wf_openChat', { projectId: project.id, stepId: step.id });
        if (res.status !== 'success') setStatus(res.error, 'error');
      }

      async function showArchive(step, what) {
        const res = await call('wf_getArchive', { archiveId: step.archiveId });
        showText(`${what} — full answer from ${AI_NAMES[step.ai]}`, res.text || res.error || '(empty)', `${what} (${AI_NAMES[step.ai]})`);
      }

      let shownText = null;
      function showText(title, text, noteTitle) {
        shownText = { title: `${project.title}: ${noteTitle || title}`, text };
        $('proj-archive-title').textContent = title;
        $('proj-archive-text').textContent = text;
        $('proj-archive-status').textContent = '';
        $('btn-proj-archive-note').disabled = false;
        $('proj-archive').showModal();
      }

      // ---------- Memory (folded by default) ----------

      function openMemory(open, editing) {
        if (editing) setEditing(true);
        $('proj-mem-body').hidden = !open;
        $('btn-proj-mem-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) $('btn-proj-mem-toggle').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      // Read view (rendered, with Progress) by default; Edit switches to the raw text
      function setEditing(on) {
        memEditing = on;
        if (!on) { memoryDirty = false; setMemStatus(''); }
        renderMemory();
        if (on) memoryEl.focus();
      }

      function renderMemoryView(mem) {
        const view = $('proj-mem-view');
        const text = mem.text.replace(/^#\s*Project:.*\n?/i, '');
        view.replaceChildren(MarkdownView.render(text));
        const progress = el('div', { class: 'mem-progress' });
        progress.appendChild(MarkdownView.render(P.buildProgress(project)));
        view.appendChild(progress);
      }

      function renderMemory() {
        const mem = currentMemory(project);
        $('proj-mem-version').textContent = `v${mem.v} · ${mem.v === 0 ? 'written by you' : (mem.by === 'you' ? 'edited by you' : 'updated by ' + mem.by)} · ${timeOf(mem.at)}`;
        if (!memoryDirty) memoryEl.value = mem.text;
        const editing = memEditing || memoryDirty;
        memoryEl.hidden = !editing;
        $('proj-mem-view').hidden = editing;
        if (!editing && window.MarkdownView) renderMemoryView(mem);
        $('btn-proj-mem-edit').hidden = editing;
        $('btn-proj-mem-cancel').hidden = !editing;
        $('btn-proj-tidy').hidden = editing || !project.tasks.some(t => t.status === 'done');
        $('btn-proj-undo').hidden = editing || project.memory.length < 2;
        $('btn-proj-mem-save').hidden = !memoryDirty;
        const tidy = project.steps.slice().reverse().find(s => s.kind === 'mem-update' && !s.parentId);
        if (tidy && !editing && (tidy.startedAt || 0) > (mem.at || 0)) {
          if (['sending', 'waiting', 'reading'].includes(tidy.status)) setMemStatus(`${AI_NAMES[tidy.ai] || tidy.ai} is tidying the memory…`);
          else if (tidy.status !== 'done') setMemStatus(`Tidying failed: ${tidy.error || 'no answer'}`, 'error');
        }

        // After an AI update, show what changed until the user says it looks good
        const unseen = mem.v > 0 && mem.by !== 'you' && mem.v > seenVersion(project);
        $('proj-mem-new').hidden = !unseen;
        const changes = $('proj-mem-changes');
        changes.hidden = !unseen;
        if (unseen) {
          changes.replaceChildren(
            el('div', { class: 'card-header' },
              el('strong', {}, `What ${mem.by} changed in v${mem.v}`),
              el('button', { class: 'btn-link', onclick: () => { localStorage.setItem(seenKey(project), String(mem.v)); renderMemory(); } }, 'Looks good')),
            renderDiff(project.memory[project.memory.length - 2].text, mem.text));
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

      async function saveMemory() {
        const res = await call('wf_editMemory', { projectId: project.id, text: memoryEl.value });
        if (res.status === 'success') {
          memoryDirty = false;
          memEditing = false;
          setMemStatus('Saved.', 'ok');
        } else {
          setMemStatus(res.error, 'error');
        }
      }

      // ---------- History (every step, folded) ----------

      function renderSteps() {
        const list = $('proj-steps');
        $('proj-log-count').textContent = project.steps.length ? `${project.steps.length} step${project.steps.length === 1 ? '' : 's'}` : '';
        if (project.steps.length === 0) {
          list.replaceChildren(el('p', { class: 'muted small' }, 'Nothing sent yet.'));
          return;
        }
        list.replaceChildren(...project.steps.slice().reverse().map(step => {
          const task = step.taskId && project.tasks.find(t => t.id === step.taskId);
          const what = step.kind === 'task' ? `Task: ${task ? task.title : '(removed)'}` : KIND_NAMES[step.kind];
          return el('div', { class: 'step-row' },
            el('span', { class: 'step-time muted small' }, timeOf(step.startedAt)),
            el('span', { class: 'step-what' }, what, el('span', { class: 'muted' }, ` · ${AI_NAMES[step.ai] || step.ai}${step.temporary ? ' · temporary' : ''}`),
              step.error ? el('div', { class: 'small step-error' }, step.error) : null),
            chip(STEP_STATUS[step.status] || STEP_STATUS.error),
            el('span', { class: 'step-links' },
              (step.tabId !== null || (step.url && !step.temporary)) ? el('button', { class: 'btn-link', onclick: () => openChat(step) }, 'Open chat') : null,
              step.archiveId ? el('button', { class: 'btn-link', onclick: () => showArchive(step, what) }, 'Full answer') : null,
              el('button', { class: 'btn-link', onclick: () => showText('Message sent', step.message) }, 'Sent')));
        }));
      }

      // ---------- Events ----------

      selectEl.addEventListener('change', async () => {
        const id = selectEl.value;
        selectedId = id;
        const res = await call('wf_setCurrent', { projectId: id });
        if (selectedId !== id) return;
        if (res.status !== 'success') return setStatus(res.error, 'error');
        load(id);
      });

      $('proj-main-ai').addEventListener('change', (e) => setOptions({ mainAi: e.target.value }));

      $('btn-proj-new').addEventListener('click', () => {
        $('proj-new-form').hidden = false;
        render();
        $('proj-new-goal').focus();
      });
      $('btn-proj-new-cancel').addEventListener('click', () => {
        $('proj-new-form').hidden = true;
        render();
      });
      $('btn-proj-create').addEventListener('click', async () => {
        const goal = $('proj-new-goal').value.trim();
        if (!goal) {
          $('proj-new-goal').focus();
          return;
        }
        const firstLine = goal.split('\n')[0];
        const title = $('proj-new-title').value.trim() || (firstLine.length > 48 ? firstLine.slice(0, 48) + '…' : firstLine);
        const res = await call('wf_create', { title, memory: P.emptyMemory(title, goal) });
        if (res.status !== 'success') return setStatus(res.error, 'error');
        $('proj-new-title').value = $('proj-new-goal').value = '';
        $('proj-new-form').hidden = true;
        await call('wf_setCurrent', { projectId: res.project.id });
        await load(res.project.id);
      });

      $('btn-proj-mem-toggle').addEventListener('click', () => openMemory($('proj-mem-body').hidden));
      $('btn-proj-log-toggle').addEventListener('click', () => {
        const body = $('proj-log-body');
        body.hidden = !body.hidden;
        $('btn-proj-log-toggle').setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
      });

      memoryEl.addEventListener('input', () => {
        memoryDirty = memoryEl.value !== currentMemory(project).text;
        $('btn-proj-mem-save').hidden = !memoryDirty;
        setMemStatus(memoryDirty ? 'Unsaved changes (saved when you send)' : '');
        renderFlow();
      });
      $('btn-proj-mem-save').addEventListener('click', saveMemory);
      $('btn-proj-mem-edit').addEventListener('click', () => setEditing(true));
      $('btn-proj-mem-cancel').addEventListener('click', () => { setEditing(false); renderFlow(); });
      $('btn-proj-tidy').addEventListener('click', async () => {
        const res = await call('wf_tidyMemory', { projectId: project.id });
        setMemStatus(res.status === 'success' ? 'Asked the AI to tidy the memory (temporary chat)…' : res.error, res.status === 'success' ? '' : 'error');
      });
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
      $('btn-proj-archive-close').addEventListener('click', () => $('proj-archive').close());
      $('btn-proj-archive-note').addEventListener('click', async () => {
        if (!shownText) return;
        const res = await call('wf_noteCreate', { title: shownText.title, text: shownText.text, note: 'saved from Projects' });
        if (res.status !== 'success') { $('proj-archive-status').textContent = res.error; return; }
        $('proj-archive-status').textContent = 'Saved to Notes';
        $('btn-proj-archive-note').disabled = true;
      });

      // "Start a project" on a note: the new-project form, filled in
      document.addEventListener('wmNewProject', (e) => {
        const { title = '', goal = '' } = e.detail || {};
        const nav = document.querySelector('.nav-item[data-target="projects"]');
        if (nav) nav.click();
        $('proj-new-form').hidden = false;
        $('proj-new-goal').value = goal;
        $('proj-new-title').value = title;
        render();
        $('proj-new-goal').focus();
      });

      if (window.PickerTray) {
        const loadStyles = async () => { styleLine = await PickerTray.line('projects'); if (project) refreshMessages(); };
        document.addEventListener('wmStyleChoice', (e) => { if (e.detail.place === 'projects') loadStyles(); });
        loadStyles();
      }

      // The engine reports progress; reload the shown project
      chromeAPI.runtime.onMessage.addListener((message) => {
        if (message.action === 'workflowUpdate' && project && message.payload?.projectId === project.id) load(selectedId);
      });

      load();
    }
  };
})();

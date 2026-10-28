// Real UI against the preview's fake store. Run via check.sh; never contacts the extension or an AI site.
window.addEventListener('load', async () => {
  if (location.hash !== '#checks') return;
  const results = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = selector => document.querySelector(selector);
  const check = (ok, label) => { if (!ok) throw new Error(label); results.push(label); };
  const update = async id => { window.__previewUpdate({ action: 'workflowUpdate', payload: { projectId: id } }); await wait(100); };
  try {
    await window.__seed;
    await wait(200);
    const store = window.__previewStore;
    const original = await store.getCurrentId();
    const second = (await store.list()).find(p => p.id !== original).id;
    const choose = async id => { $('#proj-select').value = id; $('#proj-select').dispatchEvent(new Event('change')); await wait(180); };
    await choose(second);
    check($('#proj-select').value === second && await store.getCurrentId() === second, 'project choice persists through a progress reload during setCurrent');
    check($('#proj-flow').textContent.includes('Different goal') && !$('#proj-flow').textContent.includes('Check Saturday weather'), 'flow belongs to the chosen project');
    check($('#proj-memory').value.includes('Different goal') && $('#proj-steps').textContent.includes('Nothing sent yet'), 'memory and history switch too');
    await choose(original);
    await choose(second);
    const answer = $('#proj-flow .answer-btn');
    answer.click();
    await wait(100);
    check(PickerTray.isOpenIn($('#proj-flow')), 'plan Answer picker is open');
    await store.setTasks(second, [{ title: 'New task', task: 'Do it', needs: ['Goal'], ret: 'result', ai: 'chatgpt' }]);
    const split = await store.addStep(second, { kind: 'split', ai: 'chatgpt', status: 'done', message: 'x' });
    await update(second);
    check($('.flow-open .flow-name').textContent === 'Run tasks' && $('#proj-flow').textContent.includes('Run the task'), 'Plan success opens Run tasks even with an Answer picker open');
    const details = $('#proj-flow .task-card > details');
    details.open = true;
    const message = details.querySelector('details');
    message.open = true;
    await wait(50);
    const editor = message.querySelector('textarea');
    editor.focus();
    editor.value = 'My edited task message';
    editor.dispatchEvent(new Event('input'));
    await wait(50);
    check($('#proj-flow .task-card > details').open && $('#proj-flow textarea').value === 'My edited task message', 'Task message edits keep Task details open across re-renders');
    // Switch away while an old project's picker is open.
    [...document.querySelectorAll('.flow-head')].find(b => b.textContent.includes('Plan')).click();
    $('#proj-flow .answer-btn').click();
    await wait(100);
    await choose(original);
    check(!$('#proj-flow').textContent.includes('New task'), 'old project picker cannot hold the old flow on screen');
    await choose(second);
    await store.setTasks(second, []);
    for (const status of ['needs-you', 'error']) {
      await store.updateStep(second, split.id, { status: 'waiting' });
      await update(second);
      [...document.querySelectorAll('.flow-head')].find(b => b.textContent.includes('Describe')).click();
      await store.updateStep(second, split.id, { status, error: 'No tasks block in the answer', archiveId: 'a1' });
      await update(second);
      const flow = $('#proj-flow').textContent;
      check($('.flow-open .flow-name').textContent === 'Plan' && flow.includes('Planning did not finish') && flow.includes('Full answer') && flow.includes('Try again') && flow.includes('Skip'), status + ' offers reason, answer, retry and skip');
    }
    // Stored answers are readable by default, with an exact original still available.
    [...document.querySelectorAll('#proj-steps .step-links button')].find(b => b.textContent === 'Full answer').click();
    await wait(100);
    check($('#proj-archive').open && $('#proj-archive-text strong').textContent === 'Check Saturday weather', 'Plan answer renders task titles');
    check(!$('#proj-archive-text').textContent.includes('Needs:') && !$('#proj-archive-text').textContent.includes('```'), 'Plan hides workflow fields and fences');
    $('#btn-proj-archive-original').click();
    check($('#proj-archive-text pre').textContent.includes('```tasks'), 'Show original preserves the full archive');
    $('#btn-proj-archive-original').click();
    check(!$('#proj-archive-text pre') && $('#btn-proj-archive-copy'), 'Rendered view and Copy are available');
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { copied = text; } } });
    $('#btn-proj-archive-copy').click();
    await wait(20);
    check(copied.includes('```tasks') && copied.includes('Needs: Goal'), 'Copy uses the original stored answer');
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
    else delete navigator.clipboard;
    check(!$('#btn-proj-archive-note'), 'Answers are not saved to Notes');
    $('#btn-proj-archive-close').click();
    const base = (await store.get(second)).memory[0].text;
    await store.addMemoryVersion(second, base.replace('Different goal', '- Different goal').replace('## Decisions\n(none)', '## Decisions\n- Indoors only 〔AI · basis: forecast〕'), 'ChatGPT', 'AI update');
    await store.setTasks(second, [{ title: 'Ready', task: 'x', needs: ['Goal'], ret: 'x', ai: 'chatgpt' }]);
    const ready = (await store.get(second)).tasks[0];
    await store.updateTask(second, ready.id, { status: 'done', result: '2 options' });
    const combine = await store.addStep(second, { kind: 'combine', ai: 'chatgpt', status: 'done', archiveId: 'a4', message: 'x' });
    const chore = await store.addStep(second, { kind: 'mem-update', ai: 'gemini', status: 'waiting', parentId: combine.id, temporary: true, tabId: 7, message: 'x' });
    await update(second);
    check($('.chore-line').textContent === 'Updating the project memory…' && !$('.chore-line .status-chip') && !$('.chore-line button'), 'Combine hides memory-update machinery while running');
    await store.updateStep(second, chore.id, { status: 'done' });
    await update(second);
    check($('.flow-open .flow-name').textContent === 'Continue', 'Memory update completion opens Continue');
    const buttons = [...document.querySelectorAll('.flow-open .flow-buttons .btn')];
    check(buttons[0].textContent === 'Continue in Gemini' && buttons[1].textContent === 'Continue in ChatGPT' && buttons[1].classList.contains('btn-primary'), 'Continue has secondary first and primary last on its own action row');
    $('#btn-proj-mem-toggle').click();
    check($('#proj-mem-changes').textContent.includes('What changed') && $('#proj-mem-changes .diff-new').textContent === 'New', 'Memory changes have a readable New marker');
    check(!$('#proj-mem-changes').textContent.includes('Different goal'), 'Bullet-only Goal change is not shown');
    check(!$('#proj-mem-view').textContent.includes('basis:') && $('#proj-mem-view [title="forecast"]'), 'Memory basis is hidden in a tooltip');
    check(!/^v\d/.test($('#proj-mem-version').textContent), 'Memory header omits the version number');
    [...document.querySelectorAll('#proj-steps .step-row')].find(row => row.textContent.includes('Combine')).querySelectorAll('button')[0].click();
    await wait(100);
    check($('#proj-archive-text .md-h') && $('#proj-archive-text ol'), 'Combine answer renders headings and numbered lists');
    const rect = $('#proj-archive').getBoundingClientRect();
    check(rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth, 'Answer dialog fits the viewport');
    $('#btn-proj-archive-close').click();
    document.querySelector('.content-area').scrollTop = 400;
    $('.nav-item[data-target="notes"]').click();
    check(document.querySelector('.content-area').scrollTop === 0, 'Navigation resets scroll');
    check(!$('#note-view').hidden && $('#note-text').hidden, 'existing note opens in read view');
    $('#note-view').click();
    check(!$('#note-text').hidden && document.activeElement === $('#note-text') && $('#note-text').selectionStart === $('#note-text').value.length, 'read click opens editor focused at end');
    const text = '# Checklist\n\n- [ ] **first**\n* [X] second\n1. [ ] third\n\n[Link](https://example.com)\n\n```\n- [ ] not a checkbox\n```';
    $('#note-text').value = text;
    $('#note-text').dispatchEvent(new Event('input'));
    $('#note-text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(100);
    check($('#note-text').hidden && $('#note-view input').disabled === false && $('#note-view').querySelectorAll('input').length === 3, 'Escape renders interactive bullet and numbered tasks, not fenced code');
    $('#note-view input').click();
    await wait(100);
    const note = (await chrome.runtime.sendMessage({ action: 'wf_notesList' })).notes.find(n => n.id === 'n1');
    check(note.text === text.replace('- [ ] **first**', '- [x] **first**') && !$('#note-view').hidden, 'checkbox persists changed source without entering edit mode');
    check($('#note-view a').target === '_blank', 'rendered links open a new tab');
    $('#note-view a').addEventListener('click', e => e.preventDefault());
    $('#note-view a').click();
    check(!$('#note-view').hidden, 'links do not enter edit mode');
    const memory = MarkdownView.render('- [ ] read only');
    check(memory.querySelector('input').disabled, 'memory checkboxes are disabled by default');
    $('#btn-note-edit').click();
    const ta = $('#note-text');
    ta.setSelectionRange(0, 11);
    ta.dispatchEvent(new Event('select'));
    $('#note-ai-custom').focus();
    check(!ta.hidden && $('#note-ai-scope').textContent.includes('selection'), 'AI controls preserve textarea selection');
    $('#btn-note-edit').click();
    check($('#note-ai-scope').textContent.includes('whole note'), 'read mode uses the whole note');
    $('#btn-note-edit').click();
    $('#note-title').focus();
    check(!$('#note-view').hidden, 'blur outside AI controls returns to read mode');
    $('#btn-note-edit').click();
    ta.setSelectionRange(0, 11);
    ta.dispatchEvent(new Event('select'));
    $('#note-tweak-slot .answer-btn').click();
    await wait(100);
    check(document.documentElement.scrollWidth <= window.innerWidth, 'Tweak control does not overflow');
    check(document.querySelector('.tweak-tray').textContent.includes('combine freely'), 'Tweak tray shows Edit rules');
    check(!ta.hidden && $('#note-ai-scope').textContent.includes('selection'), 'Tweak tray preserves selection scope');
    const tick = name => [...document.querySelectorAll('.tweak-tray .wmp-row')].find(row => row.querySelector('.wmp-title').textContent === name).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    tick('Tidy');
    await wait(100);
    check(!$('#btn-note-ask').disabled && (await chrome.storage.local.get('tweakChoice')).tweakChoice.includes('tidy'), 'Tweak tick enables Ask and persists');
    tick('In English');
    tick('In Chinese');
    await wait(100);
    const pickedTweaks = (await chrome.storage.local.get('tweakChoice')).tweakChoice;
    check(pickedTweaks.includes('zh') && !pickedTweaks.includes('en') && pickedTweaks.includes('tidy'), 'Language replaces previous language without removing Edit tweaks');
    document.querySelector('.tweak-tray').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(!document.querySelector('.tweak-tray'), 'Escape closes Tweak tray');
    while (document.querySelector('#note-tweak-slot .answer-chip-x')) {
      document.querySelector('#note-tweak-slot .answer-chip-x').click();
      await wait(50);
    }
    check(!(await chrome.storage.local.get('tweakChoice')).tweakChoice.length, 'Removing chips persists the empty tweak choice');
    check($('#btn-note-ask').disabled, 'No tweaks or own words disables Ask');
    $('#note-ai-custom').value = 'Keep my tone';
    $('#note-ai-custom').dispatchEvent(new Event('input'));
    check(!$('#btn-note-ask').disabled, 'Own words alone enables Ask');
    // Exercise actual panel and window layouts, including a long scrollable answer.
    for (const width of [380, 900]) {
      for (const state of ['new', 'answer-plan', 'answer-combine', 'combined-mem', 'continue', 'running']) {
        const frame = document.createElement('iframe');
        frame.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:850px;border:0`;
        frame.src = location.pathname + '?mode=window#' + state;
        const loaded = new Promise(resolve => frame.onload = resolve);
        document.body.appendChild(frame);
        await loaded;
        await wait(600);
        const doc = frame.contentDocument;
        const content = doc.querySelector('.content-area');
        check(doc.documentElement.scrollWidth <= width && content.scrollWidth <= content.clientWidth, `${state} has no horizontal overflow at ${width}px`);
        if (state.startsWith('answer-')) {
          const dialog = doc.querySelector('#proj-archive');
          const rect = dialog.getBoundingClientRect();
          const body = doc.querySelector('#proj-archive-text');
          check(dialog.open && rect.top >= 0 && rect.bottom <= 850 && rect.left >= 0 && rect.right <= width && body.scrollWidth <= body.clientWidth, `${state} dialog stays inside ${width}px viewport`);
          if (state === 'answer-combine') check(body.scrollHeight > body.clientHeight, 'Long Combine answer scrolls inside its dialog');
        }
        if (state === 'running') {
          const head = doc.querySelector('.task-head');
          const status = head.querySelector('.status-chip').getBoundingClientRect();
          const actions = head.querySelector('.task-actions').getBoundingClientRect();
          check(actions.top < status.bottom && actions.bottom > status.top, `Task actions share the status row at ${width}px`);
        }
        if (state === 'continue') {
          const buttons = [...doc.querySelectorAll('.continue-actions .flow-buttons .btn')].map(b => b.getBoundingClientRect());
          check(buttons.length === 2 && buttons[0].top === buttons[1].top && buttons[0].height === buttons[1].height, `Continue buttons share a row and height at ${width}px`);
        }
        frame.remove();
      }
    }
    document.body.dataset.checks = 'passed';
  } catch (err) {
    document.body.dataset.checks = 'failed';
    results.push('FAIL: ' + err.message);
  }
  const output = document.createElement('pre');
  output.id = 'checks-output';
  output.textContent = results.join('\n');
  document.body.appendChild(output);
});

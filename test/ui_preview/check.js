// Real UI against the preview's fake store. Run via check.sh; never contacts the extension or an AI site.
window.addEventListener('load', async () => {
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
    $('.nav-item[data-target="notes"]').click();
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

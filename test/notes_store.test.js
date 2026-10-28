// Unit tests for the Notes store (versions, undo, AI edit state), the line diff, part replacement,
// the note-edit prompt and the Notes provider of the Library.
// Runs with: node test/notes_store.test.js

const assert = require('node:assert');
const N = require('../utils/notes_store.js');
const P = require('../utils/workflow_prompts.js');
const Library = require('../utils/library.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(err);
    failed++;
  }
}

function createStubArea() {
  const data = {};
  return {
    data,
    async get(keys) { const out = {}; [].concat(keys).forEach(k => { if (k in data) out[k] = JSON.parse(JSON.stringify(data[k])); }); return out; },
    async set(obj) { Object.assign(data, JSON.parse(JSON.stringify(obj))); }
  };
}

async function runTests() {
  await test('1. Create, type (one version per burst), rename, list newest first', async () => {
    const store = N.createNotesStore(createStubArea());
    const a = await store.create({ text: 'first' });
    assert.strictEqual(a.versions.length, 1);
    await store.saveText(a.id, 'first draft');
    await store.saveText(a.id, 'first draft, more');
    let got = await store.get(a.id);
    assert.strictEqual(got.text, 'first draft, more');
    assert.strictEqual(got.versions.length, 2, 'typing merges into one version after the created one');
    await store.rename(a.id, '  Ideas  ');
    const b = await store.create({ title: 'B', text: 'b' });
    const list = await store.list();
    assert.deepStrictEqual(list.map(n => n.id).sort(), [a.id, b.id].sort());
    got = await store.get(a.id);
    assert.strictEqual(got.title, 'Ideas');
  });

  await test('2. titleOf falls back to the first line', () => {
    assert.strictEqual(N.titleOf({ title: '', text: '\n# Trip ideas\nmore' }), 'Trip ideas');
    assert.strictEqual(N.titleOf({ title: '', text: '' }), 'Untitled note');
    assert.strictEqual(N.titleOf({ title: 'T', text: 'x' }), 'T');
  });

  await test('3. AI apply, undo and restore keep every version', async () => {
    const store = N.createNotesStore(createStubArea());
    const n = await store.create({ text: 'teh plan' });
    await store.setEdit(n.id, { status: 'running', at: 1 });
    await store.applyAi(n.id, 'the plan', 'ChatGPT', 'Tidy');
    let got = await store.get(n.id);
    assert.strictEqual(got.text, 'the plan');
    assert.strictEqual(got.edit, null, 'applying clears the request');
    assert.strictEqual(got.versions[got.versions.length - 1].by, 'ChatGPT');
    await store.undo(n.id);
    got = await store.get(n.id);
    assert.strictEqual(got.text, 'teh plan');
    await store.undo(n.id);
    got = await store.get(n.id);
    assert.strictEqual(got.versions.length, 1, 'undo keeps at least one version');
    await store.saveText(n.id, 'changed');
    await store.restore(n.id, 0);
    got = await store.get(n.id);
    assert.strictEqual(got.text, 'teh plan');
    assert.strictEqual(got.versions.length, 3, 'restore adds a version');
  });

  await test('4. A late AI answer for a discarded request is ignored', async () => {
    const store = N.createNotesStore(createStubArea());
    const n = await store.create({ text: 'x' });
    await store.setEdit(n.id, { status: 'running', at: 100 });
    await store.setEdit(n.id, null);
    await store.setEdit(n.id, { status: 'ready', proposal: 'y' }, 100);
    assert.strictEqual((await store.get(n.id)).edit, null);
    await store.setEdit(n.id, { status: 'running', at: 200 });
    await store.setEdit(n.id, { status: 'ready', proposal: 'y' }, 100);
    assert.strictEqual((await store.get(n.id)).edit.status, 'running', 'an older request does not overwrite a newer one');
    await store.setEdit(n.id, { status: 'ready', proposal: 'y' }, 200);
    assert.strictEqual((await store.get(n.id)).edit.proposal, 'y');
  });

  await test('5. Append adds text after a blank line as its own version', async () => {
    const store = N.createNotesStore(createStubArea());
    const n = await store.create({ text: 'one\n' });
    await store.append(n.id, '  two  ', 'you', 'added');
    const got = await store.get(n.id);
    assert.strictEqual(got.text, 'one\n\ntwo');
    assert.strictEqual(got.versions.length, 2);
  });

  await test('6. diffLines marks added and removed lines', () => {
    const d = N.diffLines('a\nb\nc', 'a\nB\nc\nd');
    assert.deepStrictEqual(d, [
      { type: 'same', text: 'a' }, { type: 'del', text: 'b' }, { type: 'add', text: 'B' },
      { type: 'same', text: 'c' }, { type: 'add', text: 'd' }
    ]);
    assert.deepStrictEqual(N.diffLines('x', 'x'), [{ type: 'same', text: 'x' }]);
  });

  await test('7. replacePart: same place, moved, gone or ambiguous', () => {
    const part = { start: 4, end: 7, text: 'teh' };
    assert.strictEqual(N.replacePart('fix teh typo', part, 'the'), 'fix the typo');
    assert.strictEqual(N.replacePart('please fix teh typo', part, 'the'), 'please fix the typo', 'found after text was added before it');
    assert.strictEqual(N.replacePart('fix the typo', part, 'the'), null, 'gone');
    assert.strictEqual(N.replacePart('teh and teh', { start: 0, end: 3, text: 'xyz' }, 'q'), null);
    assert.strictEqual(N.replacePart('a teh b teh', { start: 0, end: 3, text: 'teh' }, 'the'), null, 'moved and not unique');
  });

  await test('8. Note-edit prompt: whole note, part, own words; parser reads the note block', () => {
    const whole = P.buildNoteEdit('teh plan', 'tidy');
    assert.ok(whole.startsWith(P.TEXT.noteEdit));
    assert.ok(whole.includes(P.NOTE_ACTIONS.tidy));
    assert.ok(whole.includes('Note:\nteh plan'));
    const part = P.buildNoteEdit('line one\nteh plan', 'make it formal', { text: 'teh plan' });
    assert.ok(part.startsWith(P.TEXT.notePart));
    assert.ok(part.includes('Request: make it formal'));
    assert.ok(part.endsWith('PART:\nteh plan'));
    assert.strictEqual(P.parseNoteAnswer('Sure.\n```note\nthe plan\n- a\n```\n'), 'the plan\n- a');
    assert.strictEqual(P.parseNoteAnswer('no block here'), null);
  });

  await test('9. Library: notes become labelled inserts; empty notes are left out', () => {
    const data = { notes: [
      { id: 'n1', title: 'Weekend ideas', text: 'Hike\nMuseum', updatedAt: 2 },
      { id: 'n2', title: '', text: 'Call the bank tomorrow', updatedAt: 1 },
      { id: 'n3', title: 'Empty', text: '   ', updatedAt: 3 }
    ] };
    const items = Library.query(data, { surface: 'site' }, '').filter(i => i.group === 'notes');
    assert.deepStrictEqual(items.map(i => i.id), ['n1', 'n2']);
    assert.strictEqual(items[0].insert.text, '[Note: Weekend ideas]\nHike\nMuseum');
    assert.strictEqual(items[1].title, 'Call the bank tomorrow');
    assert.deepStrictEqual(Library.groupsWithItems(data, { surface: 'send' }), ['notes']);
    assert.strictEqual(Library.query(data, { surface: 'step' }, '').length, 0, 'not offered for assembled step messages');
    assert.deepStrictEqual(Library.query(data, { surface: 'site' }, 'museum').map(i => i.id), ['n1']);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

runTests();

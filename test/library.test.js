// Unit tests for StylesRegistry, Library (providers, query, insert text) and the starter prompts
// Runs with: node test/library.test.js

const assert = require('node:assert');
const S = require('../utils/styles_registry.js');
const Library = require('../utils/library.js');
const P = require('../utils/workflow_prompts.js');
const SkillsRegistry = require('../utils/skills_registry.js');

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
  const styles = S.list({});

  await test('1. Built-in styles have unique ids, known groups and one-sentence texts', () => {
    const ids = new Set(styles.map(s => s.id));
    assert.strictEqual(ids.size, styles.length);
    styles.forEach(s => {
      assert(S.GROUPS[s.group], `unknown group ${s.group}`);
      assert(s.text.endsWith('.'), s.id);
      assert(!s.text.includes('\n'), s.id);
    });
  });

  await test('2. One-of groups keep the last pick; order follows the list', () => {
    assert.deepStrictEqual(S.normalizeChoice(styles, ['sources', 'short', 'detailed']), ['detailed', 'sources']);
    assert.deepStrictEqual(S.normalizeChoice(styles, ['zh', 'en', 'nope', 'zh']), ['zh']);
    assert.deepStrictEqual(S.toggle(styles, ['short'], 'detailed'), ['detailed']);
    assert.deepStrictEqual(S.toggle(styles, ['short', 'table'], 'table'), ['short']);
  });

  await test('3. The requirements line: one line, empty for no styles, read back to ids', () => {
    const line = S.buildLine(styles, ['sources', 'short']);
    assert.strictEqual(line, 'Output requirements: Keep it short: under 150 words. Cite sources with links for factual claims.');
    assert.strictEqual(S.buildLine(styles, []), '');
    assert.deepStrictEqual(S.idsFromLine(styles, line), ['short', 'sources']);
    assert.strictEqual(S.label(styles, ['sources', 'short']), 'Short · With sources');
  });

  await test('4. applyLine adds, replaces (never duplicates) and removes the last line', () => {
    const a = S.applyLine('Plan my trip', 'Output requirements: X.');
    assert.strictEqual(a, 'Plan my trip\n\nOutput requirements: X.');
    const b = S.applyLine(a, 'Output requirements: Y.');
    assert.strictEqual(b, 'Plan my trip\n\nOutput requirements: Y.');
    assert.strictEqual(S.applyLine(b, ''), 'Plan my trip');
    assert.strictEqual(S.applyLine('', 'Output requirements: X.'), 'Output requirements: X.');
    assert.strictEqual(S.applyLine('Hi', ''), 'Hi');
    assert.strictEqual(S.lastLine(b), 'Output requirements: Y.');
  });

  await test('5. Styles store: per-place choice (Projects defaults to Short), custom styles, built-in edits and reset', async () => {
    const area = createStubArea();
    const store = S.createStylesStore(area);
    assert.deepStrictEqual(await store.getChoice('projects'), ['short']);
    assert.deepStrictEqual(await store.getChoice('send'), []);
    await store.setChoice('send', ['table', 'short', 'detailed']);
    assert.deepStrictEqual(await store.getChoice('send'), ['detailed', 'table']);
    assert.deepStrictEqual(await store.getChoice('projects'), ['short']);

    const id = await store.save({ name: 'Formal', text: 'Use a formal tone.', group: 'format' });
    assert((await store.list()).some(s => s.id === id && !s.builtIn));
    await store.save({ id: 'short', name: 'Short', text: 'Under 80 words.' });
    assert.strictEqual((await store.list()).find(s => s.id === 'short').text, 'Under 80 words.');
    await store.remove('short');
    assert.strictEqual((await store.list()).find(s => s.id === 'short').text, S.BUILT_INS[0].text);
    await store.remove(id);
    assert(!(await store.list()).some(s => s.id === id));
    await assert.rejects(store.save({ name: '', text: 'x' }));
  });

  const data = {
    skills: SkillsRegistry.defaults,
    styles,
    projects: [
      { id: 'p1', title: 'Note app pick', memory: [{ v: 1, text: '# Project: Note app pick\n## Goal\nPick a note app\n## Decisions\n' }, { v: 2, text: '# Project: Note app pick\n## Goal\nPick a note app for my phone\n## Decisions\n- Obsidian' }] },
      { id: 'p2', title: 'Empty', memory: [] }
    ]
  };

  await test('6. Query: groups in order, "@" limits to Prompts, search ranks title prefixes first', () => {
    const all = Library.query(data, { surface: 'site' }, '');
    const groups = [...new Set(all.map(i => i.group))];
    assert.deepStrictEqual(groups, ['prompts', 'styles', 'memory']);
    const at = Library.query(data, { surface: 'site' }, '@re');
    assert(at.length > 0 && at.every(i => i.group === 'prompts'));
    assert.strictEqual(at[0].id, '@redo');
    const sh = Library.query(data, { surface: 'send' }, 'short');
    assert.strictEqual(sh[0].id, '@shorten');
    assert(sh.some(i => i.id === 'short' && i.group === 'styles'));
  });

  await test('7. Memory items are labelled with version and size; context hides the current project or other groups', () => {
    const mem = Library.query(data, { surface: 'site' }, '', 'memory');
    assert.strictEqual(mem.length, 1);
    assert.strictEqual(mem[0].size, 'v2 · 18 words');
    assert.strictEqual(mem[0].preview, 'Pick a note app for my phone');
    assert(mem[0].insert.text.startsWith('[Project memory v2: Note app pick]\n# Project: Note app pick'));
    assert.strictEqual(Library.query(data, { surface: 'instruction', projectId: 'p1' }, '', 'memory').length, 0);
    assert(Library.query(data, { surface: 'step' }, '').every(i => i.group === 'styles'));
  });

  await test('8. paragraphText puts an item in its own paragraph', () => {
    assert.strictEqual(Library.paragraphText('', '', 'X'), 'X');
    assert.strictEqual(Library.paragraphText('Hello', '', 'X'), '\n\nX');
    assert.strictEqual(Library.paragraphText('Hello\n', 'more', 'X'), '\nX\n\n');
    assert.strictEqual(Library.paragraphText('Hello\n\n', '', ' X \n'), 'X');
  });

  await test('9. Starter prompts: 15, all "@" keywords matching their keys, with descriptions', () => {
    const list = Object.entries(SkillsRegistry.defaults);
    assert.strictEqual(list.length, 15);
    list.forEach(([key, s]) => {
      assert.strictEqual(s.keyword, '@' + key);
      assert(s.description && s.prompt.length > 40, key);
    });
  });

  await test('10. Project builders put the style line last (and keep the old short layout)', () => {
    const memory = '# Project: T\n## Goal\nG\n## Decisions\n';
    const line = S.buildLine(styles, ['short', 'zh']);
    const task = P.buildTask(memory, { title: 'A', task: 'Do A', needs: ['Goal'], ret: 'r' }, { requirements: line });
    assert(task.endsWith(P.TEXT.result + '\n\n' + line));
    assert(P.buildSplit(memory, { requirements: '' }).endsWith('## Decisions'));
    assert(P.buildCombine(memory, [{ title: 'A', text: 'a' }], 'one page', { requirements: line }).endsWith('one page\n\n' + line));
    assert(P.buildResume(memory, 'next', { requirements: line }).endsWith('next\n\n' + line));
    assert(P.buildSplit(memory, { short: true }).endsWith('Output requirements:\n' + P.TEXT.short));
  });

  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

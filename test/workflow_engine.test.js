// Duplicate Plan requests must be refused before opening a chat. No browser or real storage involved.
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

async function run() {
  let project = { tasks: [], steps: [], memory: [{ at: 1 }] };
  let reads = 0;
  let writes = 0;
  let release;
  let gate = new Promise(resolve => { release = resolve; });
  const self = { ProjectStore: {
    async get() { reads++; await gate; return project; },
    async addStep() { writes++; throw new Error('Test stop before opening a chat'); }
  } };
  const chrome = { runtime: { sendMessage: async () => ({}) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../utils/workflow_engine.js'), 'utf8'), { self, chrome, setTimeout });
  const call = () => new Promise(resolve => self.WorkflowEngine.handleMessage({ action: 'wf_run', payload: {
    projectId: 'p1', kind: 'split', ai: 'chatgpt', message: 'Plan it'
  } }, resolve));
  const first = call();
  const second = await call();
  assert.match(second.error, /already being started/);
  assert.strictEqual(reads, 1, 'the second request cannot reach the async store check');
  release();
  assert.match((await first).error, /Test stop/);
  assert.strictEqual(writes, 1);
  gate = Promise.resolve();
  for (const status of ['sending', 'waiting', 'reading']) {
    project.steps = [{ kind: 'split', status }];
    assert.match((await call()).error, /Wait until/);
  }
  assert.strictEqual(writes, 1, 'active plans cannot add another step');
  project.steps = [{ kind: 'split', status: 'done' }];
  assert.match((await call()).error, /Test stop/, 'a finished plan can be retried');
  assert.strictEqual(writes, 2, 'claims are released even when starting fails');
  console.log('Plan concurrency regression passed; no chats opened');
}
run().catch(err => { console.error(err); process.exitCode = 1; });

// Unit tests for ProjectStore
// Runs with: node test/project_store.test.js

const assert = require('node:assert');
const { createProjectStore, currentMemory } = require('../utils/project_store.js');

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

// In-memory stub area simulating chrome.storage.local with async 0-5ms delay and deep cloning
function createStubArea() {
  const storage = {};
  const delay = () => new Promise(r => setTimeout(r, Math.floor(Math.random() * 6)));

  return {
    async get(keys) {
      await delay();
      const res = {};
      const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(storage));
      for (const k of keyList) {
        if (storage[k] !== undefined) {
          res[k] = JSON.parse(JSON.stringify(storage[k]));
        }
      }
      return res;
    },
    async set(obj) {
      await delay();
      for (const [k, v] of Object.entries(obj)) {
        storage[k] = JSON.parse(JSON.stringify(v));
      }
    }
  };
}

async function runTests() {
  await test('create, list, get, and rename projects', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);

    const p1 = await store.create('Project 1', 'Goal: build an app');
    assert(p1.id.startsWith('p_'), 'project id should start with p_');
    assert.strictEqual(p1.title, 'Project 1');
    assert.strictEqual(p1.memory.length, 1);
    assert.strictEqual(p1.memory[0].v, 0);
    assert.strictEqual(p1.memory[0].text, 'Goal: build an app');
    assert.strictEqual(p1.memory[0].by, 'you');
    assert.strictEqual(p1.memory[0].note, 'initial');
    assert.deepStrictEqual(p1.tasks, []);
    assert.deepStrictEqual(p1.steps, []);

    // Create a second project slightly later to verify sort order
    await new Promise(r => setTimeout(r, 10));
    const p2 = await store.create('Project 2', 'Goal: second project');

    const list = await store.list();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].id, p2.id, 'list should be sorted by updatedAt desc');
    assert.strictEqual(list[1].id, p1.id);

    const fetchedP1 = await store.get(p1.id);
    assert.strictEqual(fetchedP1.id, p1.id);
    assert.strictEqual(fetchedP1.title, 'Project 1');

    const nonExistent = await store.get('p_does_not_exist');
    assert.strictEqual(nonExistent, null);

    // Rename
    const renamed = await store.rename(p1.id, 'Project 1 Renamed');
    assert.strictEqual(renamed.title, 'Project 1 Renamed');
    assert(renamed.updatedAt >= p1.updatedAt);

    // Current project pointer
    assert.strictEqual(await store.getCurrentId(), null);
    await store.setCurrentId(p1.id);
    assert.strictEqual(await store.getCurrentId(), p1.id);
    await store.setCurrentId(null);
    assert.strictEqual(await store.getCurrentId(), null);
  });

  await test('memory versions, identical-text skip, and undo (never below one)', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);
    const p = await store.create('Memory Test', 'Initial memory v0');

    assert.strictEqual(currentMemory(p), 'Initial memory v0');
    assert.strictEqual(store.currentMemory(p), 'Initial memory v0');

    // Add version v1
    const v1 = await store.addMemoryVersion(p.id, 'Memory v1 updated', 'Gemini', 'split notes');
    assert.strictEqual(v1.v, 1);
    assert.strictEqual(v1.text, 'Memory v1 updated');
    assert.strictEqual(v1.by, 'Gemini');
    assert.strictEqual(v1.note, 'split notes');

    // Edit memory (convenience wrapper) -> v2
    const v2 = await store.editMemory(p.id, 'Memory v2 edited');
    assert.strictEqual(v2.v, 2);
    assert.strictEqual(v2.text, 'Memory v2 edited');
    assert.strictEqual(v2.by, 'you');
    assert.strictEqual(v2.note, 'edited');

    let currentP = await store.get(p.id);
    assert.strictEqual(currentP.memory.length, 3);
    assert.strictEqual(currentMemory(currentP), 'Memory v2 edited');

    // Identical text skip: adding identical text returns last version without creating new entry
    const skipped = await store.addMemoryVersion(p.id, 'Memory v2 edited', 'ChatGPT', 'redundant');
    assert.strictEqual(skipped.v, 2);
    assert.strictEqual(skipped.text, 'Memory v2 edited');
    currentP = await store.get(p.id);
    assert.strictEqual(currentP.memory.length, 3, 'length should not increase on identical text');

    // Undo memory: undoes v2 -> current is v1
    const undoneToV1 = await store.undoMemory(p.id);
    assert.strictEqual(undoneToV1.v, 1);
    assert.strictEqual(undoneToV1.text, 'Memory v1 updated');
    currentP = await store.get(p.id);
    assert.strictEqual(currentP.memory.length, 2);

    // Undo memory: undoes v1 -> current is v0
    const undoneToV0 = await store.undoMemory(p.id);
    assert.strictEqual(undoneToV0.v, 0);
    assert.strictEqual(undoneToV0.text, 'Initial memory v0');
    currentP = await store.get(p.id);
    assert.strictEqual(currentP.memory.length, 1);

    // Undo memory when length is 1: should never go below 1
    const keptV0 = await store.undoMemory(p.id);
    assert.strictEqual(keptV0.v, 0);
    assert.strictEqual(keptV0.text, 'Initial memory v0');
    currentP = await store.get(p.id);
    assert.strictEqual(currentP.memory.length, 1, 'memory must never drop below 1 version');
  });

  await test('tasks set, update, and remove', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);
    const p = await store.create('Tasks Test', 'Goal');

    const tasks = await store.setTasks(p.id, [
      { title: 'Task 1', task: 'Do something', needs: ['Goal'] },
      { title: 'Task 2', task: 'Do next', ai: 'gemini', status: 'running' }
    ]);

    assert.strictEqual(tasks.length, 2);
    assert(tasks[0].id.startsWith('t_'), 'task id should start with t_');
    assert.strictEqual(tasks[0].title, 'Task 1');
    assert.strictEqual(tasks[0].ai, 'chatgpt', 'default AI should be chatgpt');
    assert.strictEqual(tasks[0].status, 'todo', 'default status should be todo');
    assert.deepStrictEqual(tasks[0].needs, ['Goal']);
    assert.strictEqual(tasks[0].result, null);
    assert.strictEqual(tasks[0].stepId, null);

    assert.strictEqual(tasks[1].ai, 'gemini');
    assert.strictEqual(tasks[1].status, 'running');

    // Update task
    const updated = await store.updateTask(p.id, tasks[0].id, {
      status: 'done',
      result: 'Finished successfully'
    });
    assert.strictEqual(updated.status, 'done');
    assert.strictEqual(updated.result, 'Finished successfully');

    // Remove task
    const removed = await store.removeTask(p.id, tasks[1].id);
    assert.strictEqual(removed, true);

    const currentP = await store.get(p.id);
    assert.strictEqual(currentP.tasks.length, 1);
    assert.strictEqual(currentP.tasks[0].id, tasks[0].id);
  });

  await test('steps add and update with endedAt handling', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);
    const p = await store.create('Steps Test', 'Goal');

    const step = await store.addStep(p.id, {
      kind: 'split',
      message: 'Split memory into tasks'
    });

    assert(step.id.startsWith('s_'), 'step id should start with s_');
    assert.strictEqual(step.kind, 'split');
    assert.strictEqual(step.ai, 'chatgpt');
    assert.strictEqual(step.status, 'sending');
    assert.strictEqual(step.message, 'Split memory into tasks');
    assert(typeof step.startedAt === 'number');
    assert.strictEqual(step.endedAt, null);

    // Update with non-terminal status keeps endedAt null
    const waiting = await store.updateStep(p.id, step.id, { status: 'waiting' });
    assert.strictEqual(waiting.status, 'waiting');
    assert.strictEqual(waiting.endedAt, null);

    // Update with terminal status sets endedAt automatically
    const done = await store.updateStep(p.id, step.id, { status: 'done' });
    assert.strictEqual(done.status, 'done');
    assert(typeof done.endedAt === 'number');
    assert(done.endedAt >= done.startedAt);

    // Explicit endedAt is preserved
    const custom = await store.updateStep(p.id, step.id, { status: 'error', endedAt: 99999 });
    assert.strictEqual(custom.status, 'error');
    assert.strictEqual(custom.endedAt, 99999);
  });

  await test('concurrent addStep x10 all persisted', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);
    const p = await store.create('Concurrency Test', 'Goal');

    const addPromises = [];
    for (let i = 0; i < 10; i++) {
      addPromises.push(store.addStep(p.id, { message: `Step number ${i}` }));
    }

    const addedSteps = await Promise.all(addPromises);
    assert.strictEqual(addedSteps.length, 10);

    const savedProject = await store.get(p.id);
    assert.strictEqual(savedProject.steps.length, 10, 'all 10 concurrent steps must be persisted');

    const messages = savedProject.steps.map(s => s.message);
    for (let i = 0; i < 10; i++) {
      assert(messages.includes(`Step number ${i}`), `Missing step message ${i}`);
    }
  });

  await test('archives save/get and removal with project', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);
    const p = await store.create('Archive Test', 'Goal');

    const archId1 = await store.saveArchive('Full raw answer 1');
    const archId2 = await store.saveArchive('Full raw answer 2 (independent)');
    assert(archId1.startsWith('a_'), 'archive id should start with a_');
    assert(archId2.startsWith('a_'), 'archive id should start with a_');

    assert.strictEqual(await store.getArchive(archId1), 'Full raw answer 1');
    assert.strictEqual(await store.getArchive(archId2), 'Full raw answer 2 (independent)');
    assert.strictEqual(await store.getArchive('a_non_existent'), null);

    // Link archId1 to step in p
    await store.addStep(p.id, { archiveId: archId1 });

    // Remove project p
    await store.remove(p.id);

    // archId1 should be removed as it was referenced by p.steps
    assert.strictEqual(await store.getArchive(archId1), null, 'archive referenced by deleted project step must be removed');
    // archId2 was not referenced by p, so it remains
    assert.strictEqual(await store.getArchive(archId2), 'Full raw answer 2 (independent)', 'unreferenced archive must stay');
  });

  await test('returned objects are copies (mutating them does not change storage)', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);
    const p = await store.create('Isolation Test', 'Original memory');

    // Mutate local reference of project
    p.title = 'Hacked Title';
    p.memory.push({ v: 99, text: 'Hacked memory' });
    p.tasks.push({ title: 'Hacked task' });
    p.steps.push({ message: 'Hacked step' });

    const fresh = await store.get(p.id);
    assert.strictEqual(fresh.title, 'Isolation Test');
    assert.strictEqual(fresh.memory.length, 1);
    assert.strictEqual(fresh.memory[0].text, 'Original memory');
    assert.strictEqual(fresh.tasks.length, 0);
    assert.strictEqual(fresh.steps.length, 0);

    // Mutate step returned from addStep
    const step = await store.addStep(p.id, { message: 'Legit step' });
    step.message = 'Tampered step message';

    const fresh2 = await store.get(p.id);
    assert.strictEqual(fresh2.steps[0].message, 'Legit step');

    // Mutate tasks returned from setTasks
    const tasks = await store.setTasks(p.id, [{ title: 'Task A' }]);
    tasks[0].title = 'Tampered task title';

    const fresh3 = await store.get(p.id);
    assert.strictEqual(fresh3.tasks[0].title, 'Task A');
  });

  await test('not-found errors for unknown ids', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);
    const p = await store.create('Existing Project', 'Memory');

    await assert.rejects(async () => {
      await store.rename('unknown_id', 'New Title');
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.remove('unknown_id');
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.setCurrentId('unknown_id');
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.addMemoryVersion('unknown_id', 'Text', 'you', '');
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.undoMemory('unknown_id');
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.setTasks('unknown_id', []);
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.updateTask('unknown_id', 't_1', {});
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.removeTask('unknown_id', 't_1');
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.addStep('unknown_id', {});
    }, { message: 'Project not found' });

    await assert.rejects(async () => {
      await store.updateStep('unknown_id', 's_1', {});
    }, { message: 'Project not found' });

    // Task / step not found within existing project
    await assert.rejects(async () => {
      await store.updateTask(p.id, 't_unknown', {});
    }, { message: 'Task not found' });

    await assert.rejects(async () => {
      await store.removeTask(p.id, 't_unknown');
    }, { message: 'Task not found' });

    await assert.rejects(async () => {
      await store.updateStep(p.id, 's_unknown', {});
    }, { message: 'Step not found' });
  });

  await test('project options: main AI and skipped plan', async () => {
    const area = createStubArea();
    const store = createProjectStore(area);
    const p = await store.create('Opts', 'm');
    assert.strictEqual(p.mainAi, 'chatgpt');
    assert.strictEqual(p.planSkipped, false);
    await store.setOptions(p.id, { mainAi: 'gemini' });
    const q = await store.setOptions(p.id, { planSkipped: true });
    assert.strictEqual(q.mainAi, 'gemini');
    assert.strictEqual(q.planSkipped, true);
  });

  await test('legacy memory and archives stay intact when updated to four sections and undone', async () => {
    const P = require('../utils/workflow_prompts.js');
    const store = createProjectStore(createStubArea());
    const fresh = P.emptyMemory('Old project', 'Study');
    const legacy = fresh.replace('## Open questions', '## Current state\nJust started.\n## Open questions');
    const project = await store.create('Old project', legacy);
    const archive = '```mem\n' + legacy + '\n```';
    const id = await store.saveArchive(archive);
    await store.addMemoryVersion(project.id, fresh, 'ChatGPT', 'AI update');
    const updated = await store.get(project.id);
    assert.strictEqual(updated.memory[0].text, legacy);
    assert.strictEqual(currentMemory(updated), fresh);
    assert.strictEqual(await store.getArchive(id), archive);
    await store.undoMemory(project.id);
    assert.strictEqual(currentMemory(await store.get(project.id)), legacy);
  });

  console.log(`\nTests completed: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

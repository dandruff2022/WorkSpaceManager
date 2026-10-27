// Workspace Manager - Project Store
// Persistence layer for Projects, Memory versions, Tasks, Steps, and Archives

(function (global) {
  'use strict';

  // Helper to deep copy objects
  function clone(obj) {
    if (obj === undefined) return undefined;
    return JSON.parse(JSON.stringify(obj));
  }

  // Generates short prefixed random IDs
  function makeId(prefix) {
    const rand = Math.random().toString(36).substring(2, 8);
    return `${prefix}${Date.now().toString(36)}_${rand}`;
  }

  // Extracts current memory text from the latest version
  function currentMemory(project) {
    if (!project || !Array.isArray(project.memory) || project.memory.length === 0) {
      return '';
    }
    const last = project.memory[project.memory.length - 1];
    return (last && typeof last.text === 'string') ? last.text : '';
  }

  function createProjectStore(area) {
    if (!area || typeof area.get !== 'function' || typeof area.set !== 'function') {
      throw new Error('ProjectStore requires a storage area with get and set methods');
    }

    // Promise chain lock for serializing mutations
    let queue = Promise.resolve();
    function withLock(fn) {
      const run = queue.then(() => fn());
      queue = run.catch(() => {});
      return run;
    }

    // Storage read helper
    async function readKeys(keys) {
      const data = await area.get(keys);
      return data || {};
    }

    return {
      currentMemory,

      // List all projects sorted by updatedAt descending
      async list() {
        const data = await readKeys(['projects']);
        const projects = data.projects || {};
        const sorted = Object.values(projects).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return clone(sorted);
      },

      // Get project by id or null if not found
      async get(id) {
        if (!id) return null;
        const data = await readKeys(['projects']);
        const projects = data.projects || {};
        const project = projects[id];
        return project ? clone(project) : null;
      },

      // Create a new project with initial memory version v0
      async create(title, memoryText) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const now = Date.now();
          const project = {
            id: makeId('p_'),
            title: String(title || 'Untitled'),
            createdAt: now,
            updatedAt: now,
            memory: [
              {
                v: 0,
                text: typeof memoryText === 'string' ? memoryText : '',
                by: 'you',
                at: now,
                note: 'initial'
              }
            ],
            mainAi: 'chatgpt',
            planSkipped: false,
            tasks: [],
            steps: []
          };
          projects[project.id] = project;
          await area.set({ projects });
          return clone(project);
        });
      },

      // Rename project
      async rename(id, title) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');
          project.title = String(title || '');
          project.updatedAt = Date.now();
          await area.set({ projects });
          return clone(project);
        });
      },

      // Remove project and associated step archives
      // Project-level settings the UI may change; other fields have their own methods
      async setOptions(id, patch) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');
          if (patch.mainAi !== undefined) project.mainAi = String(patch.mainAi);
          if (patch.planSkipped !== undefined) project.planSkipped = !!patch.planSkipped;
          project.updatedAt = Date.now();
          await area.set({ projects });
          return clone(project);
        });
      },

      async remove(id) {
        return withLock(async () => {
          const data = await readKeys(['projects', 'archives', 'currentProjectId']);
          const projects = data.projects || {};
          const archives = data.archives || {};
          let currentProjectId = data.currentProjectId || null;
          const project = projects[id];
          if (!project) throw new Error('Project not found');

          if (Array.isArray(project.steps)) {
            for (const step of project.steps) {
              if (step.archiveId && archives[step.archiveId]) {
                delete archives[step.archiveId];
              }
            }
          }
          delete projects[id];
          if (currentProjectId === id) {
            currentProjectId = null;
          }
          await area.set({ projects, archives, currentProjectId });
          return true;
        });
      },

      // Get current active project ID
      async getCurrentId() {
        const data = await readKeys(['currentProjectId']);
        return data.currentProjectId || null;
      },

      // Set current active project ID
      async setCurrentId(id) {
        return withLock(async () => {
          if (id !== null && id !== undefined) {
            const data = await readKeys(['projects']);
            const projects = data.projects || {};
            if (!projects[id]) throw new Error('Project not found');
          }
          const currentProjectId = id || null;
          await area.set({ currentProjectId });
          return currentProjectId;
        });
      },

      // Add new memory version; skips if identical to last version
      async addMemoryVersion(id, text, by, note) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');
          if (!Array.isArray(project.memory)) project.memory = [];

          const last = project.memory[project.memory.length - 1];
          const strText = String(text ?? '');
          if (last && last.text === strText) {
            return clone(last);
          }

          const v = last && typeof last.v === 'number' ? last.v + 1 : project.memory.length;
          const version = {
            v,
            text: strText,
            by: by || 'you',
            at: Date.now(),
            note: note || ''
          };
          project.memory.push(version);
          project.updatedAt = Date.now();
          await area.set({ projects });
          return clone(version);
        });
      },

      // Undo last memory version (keeps at least one)
      async undoMemory(id) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');
          if (!Array.isArray(project.memory) || project.memory.length === 0) return null;

          if (project.memory.length > 1) {
            project.memory.pop();
            project.updatedAt = Date.now();
            await area.set({ projects });
          }
          const current = project.memory[project.memory.length - 1];
          return clone(current);
        });
      },

      // Edit memory (convenience wrapper for addMemoryVersion by 'you')
      async editMemory(id, text) {
        return this.addMemoryVersion(id, text, 'you', 'edited');
      },

      // Set tasks list with defaulted properties and IDs
      async setTasks(id, tasks) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');

          const list = Array.isArray(tasks) ? tasks : [];
          project.tasks = list.map(t => ({
            id: t.id || makeId('t_'),
            title: t.title || '',
            task: t.task || '',
            needs: Array.isArray(t.needs) ? [...t.needs] : [],
            ret: t.ret !== undefined ? t.ret : (t.return !== undefined ? t.return : ''),
            ai: t.ai || 'chatgpt',
            status: t.status || 'todo',
            result: t.result !== undefined ? t.result : null,
            stepId: t.stepId !== undefined ? t.stepId : null
          }));
          project.updatedAt = Date.now();
          await area.set({ projects });
          return clone(project.tasks);
        });
      },

      // Update a single task by taskId
      async updateTask(id, taskId, patch) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');
          if (!Array.isArray(project.tasks)) project.tasks = [];

          const task = project.tasks.find(t => t.id === taskId);
          if (!task) throw new Error('Task not found');
          Object.assign(task, patch);
          project.updatedAt = Date.now();
          await area.set({ projects });
          return clone(task);
        });
      },

      // Remove a task from project
      async removeTask(id, taskId) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');
          if (!Array.isArray(project.tasks)) project.tasks = [];

          const idx = project.tasks.findIndex(t => t.id === taskId);
          if (idx === -1) throw new Error('Task not found');
          project.tasks.splice(idx, 1);
          project.updatedAt = Date.now();
          await area.set({ projects });
          return true;
        });
      },

      // Add a step with defaults
      async addStep(id, step) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');
          if (!Array.isArray(project.steps)) project.steps = [];

          const stepObj = step || {};
          const newStep = {
            id: stepObj.id || makeId('s_'),
            kind: stepObj.kind || 'task',
            ai: stepObj.ai || 'chatgpt',
            taskId: stepObj.taskId !== undefined ? stepObj.taskId : null,
            parentId: stepObj.parentId !== undefined ? stepObj.parentId : null,
            temporary: !!stepObj.temporary,
            baseAt: stepObj.baseAt !== undefined ? stepObj.baseAt : null,
            status: stepObj.status || 'sending',
            message: stepObj.message || '',
            url: stepObj.url !== undefined ? stepObj.url : null,
            tabId: stepObj.tabId !== undefined ? stepObj.tabId : null,
            archiveId: stepObj.archiveId !== undefined ? stepObj.archiveId : null,
            error: stepObj.error !== undefined ? stepObj.error : null,
            startedAt: stepObj.startedAt || Date.now(),
            endedAt: stepObj.endedAt !== undefined ? stepObj.endedAt : null
          };

          if (['done', 'needs-you', 'error'].includes(newStep.status) && !newStep.endedAt) {
            newStep.endedAt = Date.now();
          }

          project.steps.push(newStep);
          project.updatedAt = Date.now();
          await area.set({ projects });
          return clone(newStep);
        });
      },

      // Update a step; automatically sets endedAt on terminal status
      async updateStep(id, stepId, patch) {
        return withLock(async () => {
          const data = await readKeys(['projects']);
          const projects = data.projects || {};
          const project = projects[id];
          if (!project) throw new Error('Project not found');
          if (!Array.isArray(project.steps)) project.steps = [];

          const step = project.steps.find(s => s.id === stepId);
          if (!step) throw new Error('Step not found');
          Object.assign(step, patch);
          if (['done', 'needs-you', 'error'].includes(step.status) && !step.endedAt) {
            step.endedAt = Date.now();
          }
          project.updatedAt = Date.now();
          await area.set({ projects });
          return clone(step);
        });
      },

      // Save an archive entry
      async saveArchive(text) {
        return withLock(async () => {
          const data = await readKeys(['archives']);
          const archives = data.archives || {};
          const id = makeId('a_');
          archives[id] = {
            id,
            text: String(text ?? ''),
            at: Date.now()
          };
          await area.set({ archives });
          return id;
        });
      },

      // Get an archive entry by id
      async getArchive(id) {
        if (!id) return null;
        const data = await readKeys(['archives']);
        const archives = data.archives || {};
        return archives[id] ? archives[id].text : null;
      }
    };
  }

  // Exports
  const root = typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this);
  root.createProjectStore = createProjectStore;
  root.currentMemory = currentMemory;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    root.ProjectStore = createProjectStore(chrome.storage.local);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createProjectStore, currentMemory };
  }
})(typeof self !== 'undefined' ? self : this);

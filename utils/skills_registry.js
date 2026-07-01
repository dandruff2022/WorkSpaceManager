// Workspace Manager - Skills Registry
// Manages system and user-defined prompt templates in local storage

(function (global) {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  const defaultSkills = {
    redo: {
      keyword: "@redo",
      prompt: "The previous response did not fully meet the requirements. Redo the last instruction I provided. Follow that instruction more carefully this time, paying close attention to every detail and constraint. Output only the complete reworked result — do not include explanations, apologies, or references to the previous attempt.",
      description: "Retry the last instruction with higher fidelity."
    },
    continue: {
      keyword: "@continue",
      prompt: "The previous messages were a temporary detour from our main conversation. Disregard the detour entirely and return to the topic we were discussing before it. Resume from where we left off on the original topic, as if the detour never happened. Do not summarize or reference the detour.",
      description: "Abandon the current detour and resume the prior topic."
    },
    breakdown: {
      keyword: "@breakdown",
      prompt: "Review the plan we have discussed so far. Divide it into up to 3 discrete, independent subtasks that could each be handled by a separate assistant. For each subtask, provide a short descriptive title and a clear, self-contained task description that includes all the context needed to complete it without access to this conversation. Output only the subtasks — do not include commentary or ask follow-up questions.",
      description: "Split the current plan into independent subtasks."
    },
    shorten: {
      keyword: "@shorten",
      prompt: "Condense your most recent response into a brief summary. Keep only the essential outcome, key findings, or final result. Remove all intermediate reasoning, examples, and verbose explanations. The summary should be short enough to be read at a glance alongside several other similar summaries. Output only the condensed summary.",
      description: "Compress the last response into a brief summary."
    },
    transfer: {
      keyword: "%transfer",
      prompt: "Below is context migrated from a previous conversation. Treat it as established background for this session. Do not re-derive, question, or summarize it — simply continue the work from where it left off.\n\n--- Transferred Context ---\n",
      description: "Prefix for injecting prior conversation context."
    },
    format: {
      keyword: "%format",
      prompt: "Re-output the subtask assignments you just described, using exactly the following structured format. Each task must be separated by a line containing only ===. Each task must have a Title: line and a Task: line. The Task description must be fully self-contained — include all necessary context so the recipient can complete it without access to this conversation. Output a maximum of 3 tasks. Do not include any text outside of this structure.\n\n===\nTitle: [Short descriptive title]\nTask: [Complete, self-contained task description with all required context]\n===",
      description: "Re-format subtasks into a machine-parseable structure."
    },
    merge: {
      keyword: "%merge",
      prompt: "The following content is the completed result of an external subtask performed by another assistant. It is being merged into your context as reference material. Read and absorb it, but do not respond to it yet — wait for further instructions on how to use it.\n\n--- External Subtask Result ---\n",
      description: "Prefix for appending a child task's result."
    }
  };

  const SkillsRegistry = {
    skills: {},

    // Load skills from local storage
    async load() {
      return new Promise((resolve) => {
        if (!chromeAPI || !chromeAPI.storage || !chromeAPI.storage.local) {
          console.warn("[SkillsRegistry] Storage API not available. Using default skills in-memory.");
          this.skills = { ...defaultSkills };
          resolve();
          return;
        }

        chromeAPI.storage.local.get("skills", async (data) => {
          if (!data.skills || Object.keys(data.skills).length === 0) {
            // Seed defaults if empty
            this.skills = { ...defaultSkills };
            await this.save();
            console.log("[SkillsRegistry] Storage empty. Seeded defaults.");
          } else {
            this.skills = data.skills;
            console.log(`[SkillsRegistry] Loaded ${Object.keys(this.skills).length} skills.`);
          }
          resolve();
        });
      });
    },

    // Save skills to local storage
    async save() {
      return new Promise((resolve, reject) => {
        if (!chromeAPI || !chromeAPI.storage || !chromeAPI.storage.local) {
          console.warn("[SkillsRegistry] Storage API not available. Save aborted.");
          resolve();
          return;
        }

        chromeAPI.storage.local.set({ skills: this.skills }, () => {
          if (chromeAPI.runtime.lastError) {
            reject(new Error(chromeAPI.runtime.lastError.message));
          } else {
            console.log("[SkillsRegistry] Skills saved successfully.");
            resolve();
          }
        });
      });
    },

    // Retrieves a single skill details by keyword
    getSkill(keyword) {
      if (!keyword) return null;
      const key = keyword.startsWith('@') || keyword.startsWith('%') ? keyword.substring(1) : keyword;
      return this.skills[key.toLowerCase()] || null;
    },

    // Returns all skills as an array
    getAllSkills() {
      return Object.values(this.skills);
    },

    // Filters skills matching search prefix, restricted to keywords starting with '@'
    getMatchingSkills(prefix, limit = 6) {
      // Strip any leading trigger characters (@, #, /, %, etc.)
      const cleanPrefix = (prefix || "").replace(/^[@#/%]/, '').toLowerCase();
      
      const list = Object.values(this.skills).filter(skill => {
        const keyword = skill.keyword || "";
        const cleanKeyword = keyword.replace(/^[@#/%]/, '').toLowerCase();
        // Match only user-callable skills (starting with '@')
        return keyword.startsWith('@') && cleanKeyword.startsWith(cleanPrefix);
      });

      return list.slice(0, limit);
    },

    // Adds or updates a skill configuration
    async addOrUpdateSkill(keyword, prompt, description = "") {
      if (!keyword || !prompt) {
        throw new Error("Invalid skill: Must contain keyword and prompt.");
      }
      
      if (!keyword.startsWith('@') && !keyword.startsWith('%')) {
        throw new Error("Invalid keyword: Must start with '@' or '%'.");
      }

      const cleanKeyword = keyword.toLowerCase().trim();
      const key = cleanKeyword.substring(1);

      this.skills[key] = {
        keyword: cleanKeyword,
        prompt: prompt,
        description: description
      };

      await this.save();
      return this.skills[key];
    },

    // Deletes a skill configuration
    async deleteSkill(keyword) {
      if (!keyword) return false;
      const key = (keyword.startsWith('@') || keyword.startsWith('%') ? keyword.substring(1) : keyword).toLowerCase();
      
      if (this.skills[key]) {
        delete this.skills[key];
        await this.save();
        return true;
      }
      return false;
    }
  };

  // Export globally
  global.SkillsRegistry = SkillsRegistry;
})(typeof self !== 'undefined' ? self : this);

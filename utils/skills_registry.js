// Workspace Manager - Skills Registry
// Manages system and user-defined prompt templates in local storage

(function (global) {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  const defaultSkills = {
    redo: {
      keyword: "@redo",
      prompt: "The previous response did not fully meet the requirements. Redo the last instruction I provided. Follow that instruction more carefully this time, paying close attention to every detail and constraint. Output only the complete reworked result — do not include explanations, apologies, or references to the previous attempt.",
      description: "Try the last request again, more carefully."
    },
    continue: {
      keyword: "@continue",
      prompt: "The previous messages were a temporary detour from our main conversation. Disregard the detour entirely and return to the topic we were discussing before it. Resume from where we left off on the original topic, as if the detour never happened. Do not summarize or reference the detour.",
      description: "Go back to the earlier topic after a side question."
    },
    shorten: {
      keyword: "@shorten",
      prompt: "Condense your most recent response into a brief summary. Keep only the essential outcome, key findings, or final result. Remove all intermediate reasoning, examples, and verbose explanations. The summary should be short enough to be read at a glance alongside several other similar summaries. Output only the condensed summary.",
      description: "Shorten the last answer to a quick summary."
    },
    check: {
      keyword: "@check",
      prompt: "Critically review your most recent response. List any factual errors, weak reasoning, or missing points, then give a corrected version. If nothing needs fixing, say so in one sentence.",
      description: "Ask the AI to check and correct its last answer."
    },
    summarize: {
      keyword: "@summarize",
      prompt: "Summarize our conversation so far: the question, the key points and conclusions, and anything still open. Use short bullet points.",
      description: "Recap the conversation so far."
    },
    explain: {
      keyword: "@explain",
      prompt: "Explain the following in plain language, as if to a smart beginner. Start with a one-sentence summary, then the key ideas, then one concrete example. Define any jargon you use.\n\n",
      description: "Explain something simply, with an example."
    },
    improve: {
      keyword: "@improve",
      prompt: "Improve the writing below: make it clearer and more concise, fix grammar, keep my meaning and tone. Give the revised version first, then list the main changes in up to 3 bullets.\n\n",
      description: "Polish a piece of writing."
    },
    translate: {
      keyword: "@translate",
      prompt: "Translate the text below. If it is in Chinese, translate it into natural English; otherwise into natural Simplified Chinese. Keep the formatting. Output only the translation.\n\n",
      description: "Translate between Chinese and English."
    },
    compare: {
      keyword: "@compare",
      prompt: "Compare the options below in a table: key differences, pros, cons, cost and who each is best for. Then recommend one for my situation and say why in two sentences.\n\n",
      description: "Compare options and recommend one."
    },
    critique: {
      keyword: "@critique",
      prompt: "Act as a tough but fair critic of the idea or plan below. List its weakest assumptions, the main risks and what could go wrong, most serious first. Then suggest how to fix the top three.\n\n",
      description: "Find the weak spots in an idea or plan."
    },
    checklist: {
      keyword: "@checklist",
      prompt: "Turn your last answer into a step-by-step checklist I can follow, with checkboxes. Keep each step to one line.",
      description: "Make the last answer an actionable checklist."
    },
    ask_me: {
      keyword: "@ask_me",
      prompt: "Before you answer, ask me the questions you need to give a really good answer (at most 5, most important first). Wait for my replies.",
      description: "Let the AI ask clarifying questions first."
    },
    better_prompt: {
      keyword: "@better_prompt",
      prompt: "Rewrite the prompt below so an AI assistant gives the best possible answer: state the goal, context, constraints and the output format. Output only the improved prompt.\n\n",
      description: "Turn a rough request into a strong prompt."
    },
    code_review: {
      keyword: "@code_review",
      prompt: "Review the code below. List bugs, edge cases, security issues and readability problems, most serious first, each with a one-line fix. Then give the corrected code.\n\n",
      description: "Review code for bugs and fixes."
    },
    debug: {
      keyword: "@debug",
      prompt: "Help me debug. Below are the error and the relevant code. Explain the most likely cause, how to confirm it, and the fix. If you need more information, say exactly what.\n\n",
      description: "Find the cause of an error."
    }
  };

  // Bump when new starter prompts are added; existing users get the missing ones once
  const DEFAULTS_VERSION = 2;

  const LEGACY_DEFAULT_KEYS = ["breakdown", "transfer", "format", "merge"];

  const SkillsRegistry = {
    skills: {},
    defaults: defaultSkills,

    // Load skills from local storage
    async load() {
      return new Promise((resolve) => {
        if (!chromeAPI || !chromeAPI.storage || !chromeAPI.storage.local) {
          console.warn("[SkillsRegistry] Storage API not available. Using default skills in-memory.");
          this.skills = { ...defaultSkills };
          resolve();
          return;
        }

        chromeAPI.storage.local.get(["skills", "skillsDefaultsVersion"], async (data) => {
          if (!data.skills || Object.keys(data.skills).length === 0) {
            // Seed defaults if empty
            this.skills = { ...defaultSkills };
            await this.save();
            chromeAPI.storage.local.set({ skillsDefaultsVersion: DEFAULTS_VERSION });
            console.log("[SkillsRegistry] Storage empty. Seeded defaults.");
          } else {
            this.skills = data.skills;
            if ((data.skillsDefaultsVersion || 1) < DEFAULTS_VERSION) {
              for (const key in defaultSkills) {
                if (!this.skills[key]) this.skills[key] = { ...defaultSkills[key] };
              }
              await this.save();
              chromeAPI.storage.local.set({ skillsDefaultsVersion: DEFAULTS_VERSION });
            }
            // v0.6: drop workflow-only defaults from hidden modules (Context Transfer, Orchestrator)
            let migrated = false;
            for (const key of LEGACY_DEFAULT_KEYS) {
              if (this.skills[key]) { delete this.skills[key]; migrated = true; }
            }
            if (migrated) await this.save();
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
  if (typeof module !== 'undefined' && module.exports) module.exports = SkillsRegistry;
})(typeof self !== 'undefined' ? self : this);

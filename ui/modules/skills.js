// Workspace Manager - Skills Registry Module
// Handles the CRUD interface for prompt templates in the manager popup

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  // List of protected default system skills
  const SYSTEM_KEYWORDS = ["@redo", "@continue", "@shorten", "@check"];

  window.SkillsModule = {
    async init(container) {
      console.log("[SkillsModule] Initializing Skills Registry UI...");

      const skillsList = container.querySelector('#skills-list');
      const skillForm = container.querySelector('#skill-form');
      const keywordInput = container.querySelector('#input-skill-keyword');
      const descInput = container.querySelector('#input-skill-desc');
      const promptTextarea = container.querySelector('#textarea-skill-prompt');
      const deleteBtn = container.querySelector('#btn-delete-skill');
      const saveBtn = container.querySelector('#btn-save-skill');
      const addSkillBtn = container.querySelector('#btn-add-skill-trigger');
      // Trigger key and on/off switch live in the Settings view
      const triggerSelect = document.getElementById('select-trigger-char');
      const editorTitle = container.querySelector('#skill-editor-title');

      let selectedKeyword = null;

      // 1. Load Skills Registry
      if (typeof SkillsRegistry !== 'undefined') {
        try {
          await SkillsRegistry.load();
        } catch (err) {
          console.error("[SkillsModule] Failed to load registry:", err);
        }
      }

      // 2. Load Autocomplete Trigger Key & Webpage Enabled Setting
      if (chromeAPI && chromeAPI.storage && chromeAPI.storage.local) {
        const webpageCheckbox = document.getElementById('checkbox-enable-webpage');

        chromeAPI.storage.local.get(['autocompleteTriggerChar', 'enableWebpageAutocomplete'], (data) => {
          if (triggerSelect) {
            triggerSelect.value = data.autocompleteTriggerChar || "@";
          }
          if (webpageCheckbox) {
            webpageCheckbox.checked = data.enableWebpageAutocomplete !== false;
          }
        });

        if (triggerSelect) {
          triggerSelect.addEventListener('change', () => {
            chromeAPI.storage.local.set({ autocompleteTriggerChar: triggerSelect.value }, () => {
              console.log(`[SkillsModule] Autocomplete trigger key set to: ${triggerSelect.value}`);
            });
          });
        }

        if (webpageCheckbox) {
          webpageCheckbox.addEventListener('change', () => {
            chromeAPI.storage.local.set({ enableWebpageAutocomplete: webpageCheckbox.checked }, () => {
              console.log(`[SkillsModule] enableWebpageAutocomplete set to: ${webpageCheckbox.checked}`);
            });
          });
        }
      }

      // 3. Render the list of skills
      function renderSkillsList() {
        if (!skillsList) return;
        skillsList.innerHTML = "";

        const allSkills = typeof SkillsRegistry !== 'undefined' ? SkillsRegistry.getAllSkills() : [];
        
        // Sort alphabetically by keyword name
        allSkills.sort((a, b) => a.keyword.localeCompare(b.keyword));

        if (allSkills.length === 0) {
          skillsList.innerHTML = `<div class="empty-note">No saved prompts yet.</div>`;
          return;
        }

        allSkills.forEach(skill => {
          const isSystem = SYSTEM_KEYWORDS.includes(skill.keyword.toLowerCase());
          
          const card = document.createElement('div');
          card.className = 'prompt-card' + (selectedKeyword === skill.keyword ? ' selected' : '');

          const header = document.createElement('div');
          header.className = 'prompt-card-header';

          const keyLabel = document.createElement('strong');
          keyLabel.className = 'prompt-card-key';
          keyLabel.textContent = skill.keyword;

          const badge = document.createElement('span');
          badge.className = 'tag';
          badge.textContent = isSystem ? "Built-in" : "Yours";

          header.appendChild(keyLabel);
          header.appendChild(badge);

          const descLabel = document.createElement('div');
          descLabel.className = 'prompt-card-desc';
          descLabel.textContent = skill.description || "No description.";

          card.appendChild(header);
          card.appendChild(descLabel);

          card.addEventListener('click', () => {
            selectSkill(skill.keyword);
          });

          skillsList.appendChild(card);
        });
      }

      // 4. Select a skill to display in the editor form
      function selectSkill(keyword) {
        selectedKeyword = keyword;
        renderSkillsList();

        if (typeof SkillsRegistry === 'undefined') return;

        const skill = SkillsRegistry.getSkill(keyword);
        if (!skill) return;

        if (editorTitle) editorTitle.textContent = skill.keyword;
        if (keywordInput) {
          keywordInput.value = skill.keyword;
          keywordInput.disabled = true; // Lock keyword input for editing
        }
        if (descInput) descInput.value = skill.description || "";
        if (promptTextarea) promptTextarea.value = skill.prompt || "";

        // Check if system skill to lock deletion
        const isSystem = SYSTEM_KEYWORDS.includes(skill.keyword.toLowerCase());
        if (deleteBtn) {
          deleteBtn.style.display = isSystem ? "none" : "block";
        }
      }

      // 5. Setup Form for Adding a New Custom Skill
      function clearFormForNew() {
        selectedKeyword = null;
        renderSkillsList();

        if (editorTitle) editorTitle.textContent = "New prompt";
        if (keywordInput) {
          keywordInput.value = "";
          keywordInput.disabled = false; // Enable keyword editing for new custom skills
          keywordInput.focus();
        }
        if (descInput) descInput.value = "";
        if (promptTextarea) promptTextarea.value = "";
        if (deleteBtn) deleteBtn.style.display = "none";
      }

      // 6. Form Submission Event Handler (Create / Update)
      if (skillForm) {
        skillForm.addEventListener('submit', async (e) => {
          e.preventDefault();

          if (typeof SkillsRegistry === 'undefined') {
            alert("Registry class not available.");
            return;
          }

          const keyword = keywordInput.value.trim();
          const desc = descInput.value.trim();
          const prompt = promptTextarea.value.trim();

          // Validation check
          if (!keyword || !prompt) {
            alert("Please fill in the keyword and the prompt text.");
            return;
          }

          if (!keyword.startsWith('@')) {
            alert("The keyword must start with @ (for example @summarize).");
            return;
          }

          if (keyword.includes(" ")) {
            alert("The keyword cannot contain spaces.");
            return;
          }

          try {
            // If editing an existing skill
            if (selectedKeyword) {
              await SkillsRegistry.addOrUpdateSkill(selectedKeyword, prompt, desc);
              console.log(`Updated skill: ${selectedKeyword}`);
            } else {
              // Creating a new custom skill
              if (SkillsRegistry.getSkill(keyword)) {
                alert(`The keyword '${keyword}' is already registered.`);
                return;
              }
              await SkillsRegistry.addOrUpdateSkill(keyword, prompt, desc);
              console.log(`Created new skill: ${keyword}`);
              selectedKeyword = keyword;
            }

            renderSkillsList();
            selectSkill(selectedKeyword);
          } catch (err) {
            alert(`Error saving skill: ${err.message}`);
          }
        });
      }

      // 7. Delete Event Handler
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (!selectedKeyword) return;
          
          if (SYSTEM_KEYWORDS.includes(selectedKeyword.toLowerCase())) {
            alert("Built-in prompts cannot be deleted.");
            return;
          }

          if (confirm(`Delete the prompt ${selectedKeyword}?`)) {
            try {
              const success = await SkillsRegistry.deleteSkill(selectedKeyword);
              if (success) {
                console.log(`Deleted skill: ${selectedKeyword}`);
                clearFormForNew();
              } else {
                alert("Failed to delete skill.");
              }
            } catch (err) {
              alert(`Error deleting skill: ${err.message}`);
            }
          }
        });
      }

      // 8. Bind Add Custom Skill Trigger Button
      if (addSkillBtn) {
        addSkillBtn.addEventListener('click', clearFormForNew);
      }

      // Initialize render list and load redos as default focused view
      renderSkillsList();
      if (typeof SkillsRegistry !== 'undefined' && SkillsRegistry.getSkill("@redo")) {
        selectSkill("@redo");
      } else {
        clearFormForNew();
      }
    }
  };
})();

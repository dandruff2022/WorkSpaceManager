// Workspace Manager - Skills Registry Module
// Handles the CRUD interface for prompt templates in the manager popup

(() => {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  // List of protected default system skills
  const SYSTEM_KEYWORDS = ["@redo", "@continue", "@breakdown", "@shorten", "%transfer", "%format", "%merge"];

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
      const triggerSelect = container.querySelector('#select-trigger-char');
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

      // 2. Load Autocomplete Trigger Key Setting
      if (triggerSelect && chromeAPI && chromeAPI.storage && chromeAPI.storage.local) {
        chromeAPI.storage.local.get(['autocompleteTriggerChar'], (data) => {
          triggerSelect.value = data.autocompleteTriggerChar || "@";
        });

        triggerSelect.addEventListener('change', () => {
          chromeAPI.storage.local.set({ autocompleteTriggerChar: triggerSelect.value }, () => {
            console.log(`[SkillsModule] Autocomplete trigger key set to: ${triggerSelect.value}`);
          });
        });
      }

      // 3. Render the list of skills
      function renderSkillsList() {
        if (!skillsList) return;
        skillsList.innerHTML = "";

        const allSkills = typeof SkillsRegistry !== 'undefined' ? SkillsRegistry.getAllSkills() : [];
        
        // Sort alphabetically by keyword name
        allSkills.sort((a, b) => a.keyword.localeCompare(b.keyword));

        if (allSkills.length === 0) {
          skillsList.innerHTML = `<div style="font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 20px;">No prompt macros found.</div>`;
          return;
        }

        allSkills.forEach(skill => {
          const isSystem = SYSTEM_KEYWORDS.includes(skill.keyword.toLowerCase());
          
          const card = document.createElement('div');
          card.style.display = "flex";
          card.style.flexDirection = "column";
          card.style.padding = "8px 12px";
          card.style.background = selectedKeyword === skill.keyword ? "rgba(99, 102, 241, 0.12)" : "rgba(255, 255, 255, 0.02)";
          card.style.border = selectedKeyword === skill.keyword ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid var(--border-color)";
          card.style.borderRadius = "6px";
          card.style.cursor = "pointer";
          card.style.transition = "all 0.2s ease";

          const header = document.createElement('div');
          header.style.display = "flex";
          header.style.justifyContent = "space-between";
          header.style.alignItems = "center";

          const keyLabel = document.createElement('strong');
          keyLabel.style.fontSize = "12px";
          keyLabel.style.color = skill.keyword.startsWith('%') ? "var(--accent-purple)" : "var(--accent-indigo)";
          keyLabel.textContent = skill.keyword;

          const badge = document.createElement('span');
          badge.style.fontSize = "9px";
          badge.style.padding = "2px 5px";
          badge.style.borderRadius = "4px";
          badge.style.fontWeight = "600";
          if (isSystem) {
            badge.style.background = "rgba(99, 102, 241, 0.15)";
            badge.style.color = "var(--text-secondary)";
            badge.textContent = "SYSTEM";
          } else {
            badge.style.background = "rgba(16, 185, 129, 0.15)";
            badge.style.color = "#10b981";
            badge.textContent = "CUSTOM";
          }

          header.appendChild(keyLabel);
          header.appendChild(badge);

          const descLabel = document.createElement('div');
          descLabel.style.fontSize = "10px";
          descLabel.style.color = "var(--text-muted)";
          descLabel.style.marginTop = "4px";
          descLabel.style.whiteSpace = "nowrap";
          descLabel.style.overflow = "hidden";
          descLabel.style.textOverflow = "ellipsis";
          descLabel.textContent = skill.description || "No description provided.";

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

        if (editorTitle) editorTitle.textContent = `Edit Skill: ${skill.keyword}`;
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

        if (editorTitle) editorTitle.textContent = "Add Custom Skill";
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
            alert("Keyword and Prompt Template are required.");
            return;
          }

          if (!keyword.startsWith('@') && !keyword.startsWith('%')) {
            alert("Keyword must start with '@' or '%'.");
            return;
          }

          if (keyword.includes(" ")) {
            alert("Keyword cannot contain spaces.");
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
            alert("Protected system skills cannot be deleted.");
            return;
          }

          if (confirm(`Are you sure you want to delete the custom skill '${selectedKeyword}'?`)) {
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

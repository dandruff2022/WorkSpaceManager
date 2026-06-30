// Workspace Manager - Connection & Selector Module
// Validates selector profiles and displays registry of connected platform profiles

(() => {
  window.ConnectionModule = {
    init(container) {
      console.log("[ConnectionModule] Initializing Connection & Selector UI...");

      const importTextarea = container.querySelector('#textarea-profile-import');
      const validateBtn = container.querySelector('#btn-validate-profile');
      const validationBadge = container.querySelector('#profile-validation-badge');

      if (validateBtn && importTextarea && validationBadge) {
        validateBtn.addEventListener('click', () => {
          const rawText = importTextarea.value.trim();
          if (!rawText) {
            validationBadge.textContent = "Empty JSON";
            validationBadge.className = "dbg-status-badge error";
            return;
          }

          try {
            const profile = JSON.parse(rawText);
            
            // Validate required fields
            const requiredFields = ["siteName", "selectors"];
            const missingFields = requiredFields.filter(field => !profile[field]);
            if (missingFields.length > 0) {
              throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
            }

            const requiredSelectors = ["inputSelector", "sendButtonSelector", "messageTurnSelector"];
            const missingSelectors = requiredSelectors.filter(sel => !profile.selectors[sel]);
            if (missingSelectors.length > 0) {
              throw new Error(`Missing selectors: ${missingSelectors.join(", ")}`);
            }

            // Success validation
            validationBadge.textContent = "Valid Profile Layout";
            validationBadge.className = "dbg-status-badge success";
            
          } catch (err) {
            // Failure validation
            validationBadge.textContent = `Invalid: ${err.message}`;
            validationBadge.className = "dbg-status-badge error";
          }
        });
      }
    }
  };
})();

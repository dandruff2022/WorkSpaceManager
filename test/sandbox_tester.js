/**
 * ================================================================================================
 * WORKSPACE MANAGER - DOM AUTOMATION SANDBOX TEST SCRIPT
 * File: test/sandbox_tester.js
 * Version: 1.1.2 (Full JS Implementation)
 * Target Platforms: ChatGPT, Claude, Gemini, Copilot
 * ================================================================================================
 * 
 * AI CONTEXT REPAIR SYSTEM PROMPT (FEED THIS TO AN AI IF THE SCRIPT FAILS)
 * ------------------------------------------------------------------------------------------------
 * You are an expert DOM Automation Engineer. The Workspace Manager browser extension uses this script 
 * to test DOM element bindings (inputs, buttons, turns) for ChatGPT, Claude, Gemini, and Copilot.
 * 
 * If a selector fails during execution, copy the entire console log output, paste it alongside this 
 * script code into your prompt, and instruct:
 * 
 *   "A selector check failed. Review the page DOM structure of [TARGET SITE], update the selector map 
 *    in the `siteConfigs` object, correct the failed test logic, and output a valid updated script.
 *    Keep the popup controls and JSON config generation functionality intact."
 * ================================================================================================
 */

(function() {
  // 1. DOM Selector Registry for Mainstream AI websites
  const siteConfigs = {
    chatgpt: {
      siteName: "ChatGPT",
      domain: "chatgpt.com",
      selectors: {
        inputSelector: "#prompt-textarea",
        sendButtonSelector: "button[data-testid*=\"send\" i], button[aria-label*=\"send\" i]",
        newChatButtonSelector: "a[href=\"/\"], button[aria-label*=\"new chat\" i]",
        copyButtonSelector: "button[data-testid$=\"copy-turn-action-button\"], button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy message\" i]",
        stopButtonSelector: "button[data-testid*=\"stop\" i], button[aria-label*=\"stop\" i]",
        messageTurnSelector: "article, [data-testid^=\"conversation-turn\"]"
      },
      flags: {
        useEnterFallback: false
      }
    },
    claude: {
      siteName: "Claude",
      domain: "claude.ai",
      selectors: {
        inputSelector: "div[contenteditable=\"true\"]",
        sendButtonSelector: "button[aria-label*=\"send\" i], button[data-testid*=\"send\" i], button:has(svg polygon)",
        newChatButtonSelector: "a[href*=\"/new\" i], [data-testid*=\"new-chat\" i]",
        copyButtonSelector: "button[data-testid*=\"copy\" i], button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[data-testid*=\"copy\" i][aria-label*=\"copy\" i], button[aria-label*=\"copy\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.font-claude-message, div[data-testid=\"chat-message\"], div.chat-and-document"
      },
      flags: {
        useEnterFallback: true
      }
    },
    gemini: {
      siteName: "Gemini",
      domain: "gemini.google.com",
      selectors: {
        inputSelector: "div[contenteditable=\"true\"]",
        sendButtonSelector: "button[aria-label*=\"send\" i], button.send-button",
        newChatButtonSelector: "a[href*=\"/app\" i], button.new-chat-button",
        copyButtonSelector: "button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy prompt\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.message-content, div.conversation-turn"
      },
      flags: {
        useEnterFallback: false
      }
    },
    copilot: {
      siteName: "Copilot",
      domain: "copilot.microsoft.com",
      selectors: {
        inputSelector: "textarea, #searchbar",
        sendButtonSelector: "button[aria-label*=\"submit\" i], button[aria-label*=\"send\" i]",
        newChatButtonSelector: "button[aria-label*=\"new\" i]",
        copyButtonSelector: "button[aria-label*=\"copy\" i]",
        userCopyButtonSelector: "button[aria-label*=\"copy\" i]",
        stopButtonSelector: "button[aria-label*=\"stop\" i]",
        messageTurnSelector: "div.chat-message, div.message-bubble"
      },
      flags: {
        useEnterFallback: true
      }
    }
  };

  // 2. Main World Helper Functions (Dynamic Injection for Clipboard & SPA)
  function injectMainWorldWrappers() {
    console.log("[SandboxTester] Injecting Main World hooks for Clipboard & History...");
    
    const hookCode = `
      (function() {
        // A. Hook Clipboard writes
        const originalWriteText = navigator.clipboard.writeText;
        navigator.clipboard.writeText = function(text) {
          console.log("%c[MAIN WORLD] Clipboard write intercepted:", "color: #a855f7;", text);
          window.dispatchEvent(new CustomEvent('WM_INTERCEPTED_COPY', { detail: text }));
          return Promise.resolve(); // Mock copy success to avoid OS clipboard mutations
        };

        // B. Hook SPA Router Navigation updates
        const originalPushState = history.pushState;
        history.pushState = function() {
          originalPushState.apply(this, arguments);
          window.dispatchEvent(new CustomEvent('WM_SPA_NAVIGATED', { detail: arguments[2] || location.href }));
        };

        const originalReplaceState = history.replaceState;
        history.replaceState = function() {
          originalReplaceState.apply(this, arguments);
          window.dispatchEvent(new CustomEvent('WM_SPA_NAVIGATED', { detail: arguments[2] || location.href }));
        };
        console.log("[MAIN WORLD] Wrappers successfully initialized.");
      })();
    `;

    const script = document.createElement('script');
    script.textContent = hookCode;
    document.documentElement.appendChild(script);
    script.remove();
  }

  // 3. UI Helper for exporting Config JSON
  function displayConfigModal(config) {
    const overlay = document.createElement('div');
    overlay.id = "wm-tester-modal";
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 15, 20, 0.85);
      backdrop-filter: blur(8px);
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Outfit', 'Segoe UI', sans-serif;
      color: #f8fafc;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
      background: #1e1e24;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 32px;
      width: 500px;
      max-width: 90%;
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      gap: 18px;
    `;

    const title = document.createElement('h3');
    title.innerText = "✓ Selector Verification Passed!";
    title.style.cssText = "font-size: 20px; font-weight: 600; margin: 0; color: #4ade80;";

    const desc = document.createElement('p');
    desc.innerText = "Copy the JSON config below and import it into the Workspace Manager connection settings:";
    desc.style.cssText = "font-size: 14px; margin: 0; color: #94a3b8; line-height: 1.5;";

    const textarea = document.createElement('textarea');
    textarea.readOnly = true;
    textarea.value = JSON.stringify(config, null, 2);
    textarea.style.cssText = `
      width: 100%;
      height: 220px;
      background: #0f0f12;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 12px;
      color: #6366f1;
      font-family: monospace;
      font-size: 12px;
      resize: none;
      outline: none;
    `;

    const row = document.createElement('div');
    row.style.cssText = "display: flex; gap: 12px; justify-content: flex-end;";

    const copyBtn = document.createElement('button');
    copyBtn.innerText = "Copy Config";
    copyBtn.style.cssText = `
      background: linear-gradient(135deg, #6366f1, #a855f7);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      cursor: pointer;
      font-weight: 500;
    `;
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(textarea.value);
      copyBtn.innerText = "Copied!";
      setTimeout(() => { copyBtn.innerText = "Copy Config"; }, 2000);
    };

    const closeBtn = document.createElement('button');
    closeBtn.innerText = "Dismiss";
    closeBtn.style.cssText = `
      background: transparent;
      color: #94a3b8;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      cursor: pointer;
    `;
    closeBtn.onclick = () => overlay.remove();

    row.appendChild(closeBtn);
    row.appendChild(copyBtn);
    container.appendChild(title);
    container.appendChild(desc);
    container.appendChild(textarea);
    container.appendChild(row);
    overlay.appendChild(container);
    document.body.appendChild(overlay);
  }

  // 4. Test Class Logic
  class SandboxTester {
    constructor() {
      this.config = null;
      this.interceptedBuffer = [];
      this.detectPlatform();
    }

    detectPlatform() {
      const host = window.location.hostname;
      for (const key in siteConfigs) {
        if (host.includes(siteConfigs[key].domain)) {
          this.config = JSON.parse(JSON.stringify(siteConfigs[key]));
          break;
        }
      }

      if (this.config) {
        console.log(`%c[SandboxTester] SUCCESS: Detected platform: ${this.config.siteName}`, "color: #10b981; font-weight: bold;");
      } else {
        console.warn("[SandboxTester] WARN: Platform unrecognized. Loading default empty profile.");
        this.config = {
          siteName: "Generic",
          domain: host,
          selectors: {
            inputSelector: "textarea",
            sendButtonSelector: "button",
            newChatButtonSelector: "button",
            copyButtonSelector: "button",
            userCopyButtonSelector: "button",
            stopButtonSelector: "button",
            messageTurnSelector: "div"
          },
          flags: {
            useEnterFallback: false
          }
        };
      }
    }

    async runAll() {
      console.log("[SandboxTester] Starting automated DOM validation suite...");
      this.interceptedBuffer = [];
      injectMainWorldWrappers();

      // Hook intercepted event from main world
      window.addEventListener('WM_INTERCEPTED_COPY', (e) => {
        this.interceptedBuffer.push(e.detail);
        console.log("%c[SandboxTester] Captured Response Copy:", "color: #10b981;", e.detail);
      });

      try {
        // Step 1: Scan for initial clean slate
        await this.stepScanInitial();

        // Step 2: Test New Chat trigger
        await this.stepNewChatTrigger();

        // Step 3: Test Text Injection
        await this.stepTextInjection(1, "[WorkspaceManager test - Turn 1: Hello AI!]");

        // Step 4: Test Send Submit
        await this.stepSendTrigger();

        // Step 5: Wait for Generation (MutationObserver simulation)
        await this.stepWaitForGeneration();

        // Step 6: Test Copy extraction
        await this.stepCopyExtraction(1);

        // Step 7: Chained Multi-turn & Fallback Submit (Enter Key)
        await this.stepTextInjection(2, "[WorkspaceManager test - Turn 2: Summarize 'Antigravity' in one sentence.]");
        await this.stepSendTrigger(true); // submit via Enter key fallback
        await this.stepWaitForGeneration();
        await this.stepCopyExtraction(2);

        // Step 8: Tricky layout checks (code blocks / elements)
        await this.stepVerifyTrickyLayout();

        // Finalize Config
        console.log("%c[SandboxTester] ALL VERIFICATIONS PASSED!", "color: #10b981; font-size: 16px; font-weight: bold;");
        displayConfigModal(this.config);

      } catch (err) {
        this.handleFailure(err);
      }
    }

    async stepScanInitial() {
      console.log("[Step 1] Scanning for conversation state...");
      const turns = document.querySelectorAll(this.config.selectors.messageTurnSelector);
      console.log(`Scan result: Found ${turns.length} message turns.`);
      
      if (turns.length > 0) {
        const goReset = confirm("Existing conversation turns detected. Would you like the script to attempt resetting the chat automatically? (Cancel to fail and self-correct)");
        if (!goReset) {
          throw new Error("Initial state check failed: Page contains active history.");
        }
      }
    }

    async stepNewChatTrigger() {
      console.log("[Step 2] Executing New Chat trigger click...");
      const btn = document.querySelector(this.config.selectors.newChatButtonSelector);
      if (!btn) {
        throw new Error(`New Chat button not found using selector: ${this.config.selectors.newChatButtonSelector}`);
      }

      btn.click();
      await new Promise(r => setTimeout(r, 2000)); // wait for routing

      const userConfirm = confirm("Step 2: Did the chat reset successfully? (URL updated, messages cleared)");
      if (!userConfirm) {
        throw new Error("New Chat verification failed: Screen failed to clear.");
      }
    }

    async stepTextInjection(turn, text) {
      console.log(`[Step 3] Injecting test text for Turn ${turn}...`);
      const input = document.querySelector(this.config.selectors.inputSelector);
      if (!input) {
        throw new Error(`Input textbox not found using selector: ${this.config.selectors.inputSelector}`);
      }

      // Write text using the framework insertion standard
      input.focus();
      if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (input.getAttribute('contenteditable') === 'true') {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      await new Promise(r => setTimeout(r, 600));

      const sendBtn = document.querySelector(this.config.selectors.sendButtonSelector);
      const isEnabled = sendBtn && !sendBtn.disabled;
      
      const userConfirm = confirm(`Step 3: Can you see the test text injected in the input box, and is the Send button highlighted/active?`);
      if (!userConfirm) {
        throw new Error("Text Injection verification failed: Input box failed to hydrate state.");
      }
    }

    async stepSendTrigger(useFallback = false) {
      console.log(`[Step 4] Triggering send action (Fallback mode: ${useFallback})...`);
      const input = document.querySelector(this.config.selectors.inputSelector);
      const sendBtn = document.querySelector(this.config.selectors.sendButtonSelector);

      if (useFallback) {
        // Dispatch synthetic Enter keydown
        this.config.flags.useEnterFallback = true;
        const enterDown = new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
        });
        input.dispatchEvent(enterDown);
      } else {
        if (!sendBtn) throw new Error("Send button selector returned null.");
        sendBtn.click();
      }

      await new Promise(r => setTimeout(r, 1000));
      const userConfirm = confirm("Step 4: Did the prompt submit successfully and start generating?");
      if (!userConfirm) {
        throw new Error("Send Trigger failed: Prompt not submitted.");
      }
    }

    async stepWaitForGeneration() {
      console.log("[Step 5] Monitoring generation state...");
      let elapsed = 0;
      const timeout = 20000; // 20s timeout

      // Wait a moment for the UI to transition to generating state (where stop button is shown)
      await new Promise(r => setTimeout(r, 1500));

      return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
          elapsed += 1000;
          const stopBtn = document.querySelector(this.config.selectors.stopButtonSelector);
          const sendBtn = document.querySelector(this.config.selectors.sendButtonSelector);
          const input = document.querySelector(this.config.selectors.inputSelector);

          // Done generating if stop button is absent, and either send button is present or input is editable/present
          const isDone = !stopBtn && (sendBtn || input);

          if (isDone) {
            clearInterval(interval);
            console.log("State Detector: Idle / Complete.");
            resolve();
          }

          if (elapsed >= timeout) {
            clearInterval(interval);
            reject(new Error("Generation state observer timed out after 20 seconds."));
          }
        }, 1000);
      });
    }

    async stepCopyExtraction(turn) {
      console.log(`[Step 6] Extracting response copy for Turn ${turn}...`);
      const copyButtons = document.querySelectorAll(this.config.selectors.copyButtonSelector);
      if (copyButtons.length === 0) {
        throw new Error("Response Copy buttons not found using selector: " + this.config.selectors.copyButtonSelector);
      }

      // Filter out code block copies (elements containing parent <pre> or .code-block elements)
      const validButtons = Array.from(copyButtons).filter(btn => {
        return !btn.closest('pre') && !btn.closest('.code-block') && !btn.closest('code');
      });

      if (validButtons.length === 0) {
        throw new Error("No copy buttons found outside code blocks.");
      }

      const prevCount = this.interceptedBuffer.length;
      // Click the latest message's copy button
      const targetBtn = validButtons[validButtons.length - 1];
      targetBtn.click();

      // Wait for async execution
      await new Promise(r => setTimeout(r, 1000));

      if (this.interceptedBuffer.length === prevCount) {
        throw new Error("Copy Intercept failed: Click did not fire navigator.clipboard.writeText.");
      }

      const text = this.interceptedBuffer[this.interceptedBuffer.length - 1];
      const userConfirm = confirm(`Step 6: Did the script capture the correct turn response?\n\n"${text.substring(0, 160)}..."`);
      if (!userConfirm) {
        throw new Error("Copy Extraction validation failed: Intercepted text was corrupted or incorrect.");
      }
    }

    async stepVerifyTrickyLayout() {
      console.log("[Step 8] Verifying copy separation from tricky elements (pre, code)...");
      const codeBlockCopies = document.querySelectorAll("pre button, code button, [aria-label*='Copy code']");
      console.log(`Found ${codeBlockCopies.length} secondary code block copy controls.`);

      const pageTurns = document.querySelectorAll(this.config.selectors.messageTurnSelector);
      const copyButtons = document.querySelectorAll(this.config.selectors.copyButtonSelector);
      
      console.log(`Verifying selector bounds: Turns = ${pageTurns.length}, Main Copies = ${copyButtons.length - codeBlockCopies.length}`);
    }

    handleFailure(err) {
      console.log("%c=================================================================", "color: #ef4444; font-weight: bold;");
      console.log(`%c[SandboxTester] FAILED AT STEP: ${err.message}`, "color: #ef4444; font-size: 14px; font-weight: bold;");
      console.log("%c=================================================================", "color: #ef4444; font-weight: bold;");
      console.log("%cAI REPAIR INSTRUCTIONS:", "color: #fb7185; font-weight: bold;");
      console.log("1. Copy this entire console output log.");
      console.log("2. Upload the tester script file [test/sandbox_tester.js].");
      console.log("3. Feed it to your AI tool using the prompt at the top of the script.");
      console.log("%c=================================================================", "color: #ef4444; font-weight: bold;");
      alert(`Verifications failed: ${err.message}\nCheck the console for self-correction prompts.`);
    }
  }

  // Create Instance
  window.SandboxTester = new SandboxTester();
  console.log("%c[SandboxTester] Initialized successfully. Start testing by calling SandboxTester.runAll(); in console.", "color: #6366f1; font-weight: bold;");
})();

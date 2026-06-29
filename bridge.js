// Workspace Manager - Bridge Content Script
// Exposes automation primitives and handles incoming commands

(() => {
  console.log("[Workspace Manager Bridge] Initializing DOM automation library...");

  const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;
  let activeProfile = null;
  let activeObserver = null;

  // 1. Load and Match Site Profile
  async function initProfile() {
    return new Promise((resolve) => {
      chromeAPI.storage.local.get("siteProfiles", (data) => {
        const host = window.location.hostname;
        const profiles = data.siteProfiles || {};
        
        for (const key in profiles) {
          const profile = profiles[key];
          if (host.includes(profile.domain)) {
            activeProfile = profile;
            console.log(`[Workspace Manager Bridge] Matched site profile: ${profile.siteName}`);
            break;
          }
        }

        if (!activeProfile) {
          console.warn("[Workspace Manager Bridge] Domain unrecognized. Using generic selector defaults.");
          activeProfile = {
            siteName: "Generic",
            domain: host,
            newChatUrl: "/",
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
              useEnterFallback: false,
              postSubmitDelayMs: 0
            }
          };
        }
        resolve();
      });
    });
  }

  // Initialize immediately
  initProfile();

  // 2. DOM Utilities
  function findParentTurn(element) {
    if (!element || !activeProfile) return null;

    // A. Standard closest lookup using profile selector
    const turnSelector = activeProfile.selectors.messageTurnSelector;
    let turn = element.closest(turnSelector);
    const turnClassName = turn && typeof turn.className === 'string' ? turn.className : '';
    const isReactions = turn && (turnClassName.includes('reactions') || turn.getAttribute('data-testid')?.includes('reactions'));

    if (turn && !isReactions) {
      return turn;
    }

    // B. Walk-up loop skipping utility panels/bars
    let current = element;
    while (current) {
      const className = typeof current.className === 'string' ? current.className : '';
      const dataTestId = current.getAttribute ? current.getAttribute('data-testid') : null;
      const skip = className.includes('reactions') || className.includes('actions') || className.includes('controls') || 
                   (dataTestId && (dataTestId.includes('reactions') || dataTestId.includes('actions') || dataTestId.includes('controls')));

      if (!skip) {
        if (className.includes('message') || className.includes('turn')) {
          return current;
        }
        if (dataTestId && (dataTestId.includes('message') || dataTestId.includes('turn'))) {
          return current;
        }
      }
      current = current.parentElement || (current.parentNode && current.parentNode.host) || null;
    }

    return element.parentElement || (element.parentNode && element.parentNode.host) || element;
  }

  function getValidCopyButtons(container = document) {
    if (!activeProfile) return [];
    const copyButtons = container.querySelectorAll(activeProfile.selectors.copyButtonSelector);
    return Array.from(copyButtons).filter(btn => {
      return !btn.closest('pre') && !btn.closest('.code-block') && !btn.closest('code');
    });
  }

  function getValidUserCopyButtons(container = document) {
    if (!activeProfile || !activeProfile.selectors.userCopyButtonSelector) return [];
    const copyButtons = container.querySelectorAll(activeProfile.selectors.userCopyButtonSelector);
    return Array.from(copyButtons).filter(btn => {
      return !btn.closest('pre') && !btn.closest('.code-block') && !btn.closest('code');
    });
  }

  function getCopyButtonsList() {
    const aiBtns = getValidCopyButtons();
    const userBtns = getValidUserCopyButtons();
    
    const buttons = [];
    
    aiBtns.forEach((btn, index) => {
      buttons.push({
        element: btn,
        type: 'ai',
        index: index,
        label: `AI Response #${index + 1}`
      });
    });
    
    userBtns.forEach((btn, index) => {
      buttons.push({
        element: btn,
        type: 'user',
        index: index,
        label: `User Input #${index + 1}`
      });
    });
    
    // Sort by their DOM appearance order (top-down)
    buttons.sort((a, b) => {
      const pos = a.element.compareDocumentPosition(b.element);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    
    return buttons.map(b => ({
      type: b.type,
      index: b.index,
      label: b.label
    }));
  }

  // 3. Web Interaction Implementation
  function writeToInput(text) {
    if (!activeProfile) return false;
    const input = document.querySelector(activeProfile.selectors.inputSelector);
    if (!input) {
      console.warn("Input element not found for writeToInput");
      return false;
    }

    input.focus();
    if (input.getAttribute('contenteditable') === 'true') {
      // ContentEditable Div Rich-Text update
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    } else if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      // React controlled component state bypass setter
      const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(input, text);
      } else {
        input.value = text;
      }
    } else {
      input.value = text;
    }

    // Dispatch hydration events
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function clickSend() {
    if (!activeProfile) return false;
    const input = document.querySelector(activeProfile.selectors.inputSelector);
    
    // Step 1: Check shortcut flag to bypass click entirely
    if (activeProfile.flags && activeProfile.flags.useEnterFallback === true) {
      if (input) {
        simulateEnter(input);
        return true;
      }
    }

    // Step 2: Fallback click send
    const btn = document.querySelector(activeProfile.selectors.sendButtonSelector);
    if (btn && btn.offsetWidth > 0 && btn.offsetHeight > 0 && !btn.disabled) {
      btn.click();
      return true;
    }

    // Step 3: Keypress event simulation fallback
    if (input) {
      simulateEnter(input);
      return true;
    }
    return false;
  }

  function simulateEnter(element) {
    const enterDown = new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, ArabianCode: 13, which: 13, bubbles: true, cancelable: true
    });
    element.dispatchEvent(enterDown);
  }

  async function clickCopyButton(type = 'ai', index = -1) {
    if (!activeProfile) return null;
    const isUser = type === 'user';
    const buttons = isUser ? getValidUserCopyButtons() : getValidCopyButtons();
    
    if (buttons.length === 0) {
      throw new Error(`No copy buttons of type ${type} found outside code blocks.`);
    }

    // Use latest turn if index is negative or out of bounds
    const targetIdx = (index < 0 || index >= buttons.length) ? (buttons.length - 1) : index;
    const targetBtn = buttons[targetIdx];

    // Pre-resolve parent turn element before clicking
    const targetTurn = findParentTurn(targetBtn);

    return new Promise((resolve, reject) => {
      let copyInterceptionHandled = false;

      // Event listener for main-world custom clipboard relay event
      const onCopyEvent = (e) => {
        copyInterceptionHandled = true;
        document.removeEventListener('agyCopyCaptured', onCopyEvent);
        resolve(e.detail);
      };
      document.addEventListener('agyCopyCaptured', onCopyEvent);

      // Perform action click
      targetBtn.click();

      // Fallback scraper after 1000ms delay
      setTimeout(() => {
        if (!copyInterceptionHandled) {
          document.removeEventListener('agyCopyCaptured', onCopyEvent);
          console.log("[Workspace Manager Bridge] Clipboard capture timed out. Using DOM fallback Scraper...");
          
          if (targetTurn) {
            // Find inner markdown or message text container
            const contentEl = targetTurn.querySelector('.markdown, .message-content, [class*="markdown" i], [class*="message" i]') || targetTurn;
            const text = contentEl.innerText || contentEl.textContent || "";
            if (text) {
              resolve(text);
            } else {
              reject(new Error("Copy Intercept fallback: DOM scraping returned empty text."));
            }
          } else {
            reject(new Error("Copy Intercept failed: No clipboard event caught, and parent message turn could not be resolved."));
          }
        }
      }, 1000);
    });
  }

  function scanInitialState() {
    if (!activeProfile) return "empty";
    const turns = document.querySelectorAll(activeProfile.selectors.messageTurnSelector);
    return turns.length > 0 ? "complete" : "empty";
  }

  function getConversationTurnCount() {
    const copyBtns = getValidCopyButtons();
    const seenTurns = new Set();
    
    copyBtns.forEach(btn => {
      const turnEl = findParentTurn(btn);
      if (turnEl) seenTurns.add(turnEl);
    });

    return seenTurns.size;
  }

  function clickNewChat() {
    if (!activeProfile) return false;
    const btn = document.querySelector(activeProfile.selectors.newChatButtonSelector);
    if (btn) {
      btn.click();
      return true;
    }

    // URL Navigation Fallback
    const redirectUrl = activeProfile.newChatUrl || "/";
    window.location.href = redirectUrl;
    return true;
  }

  function clickStopButton() {
    if (!activeProfile) return false;
    const btns = document.querySelectorAll(activeProfile.selectors.stopButtonSelector);
    const activeBtn = Array.from(btns).find(btn => btn.offsetWidth > 0 || btn.offsetHeight > 0);
    if (activeBtn) {
      activeBtn.click();
      return true;
    }
    return false;
  }

  // Observe navigation change helper
  function observeNavigation(onChange) {
    document.addEventListener("agyNavigation", (e) => {
      onChange(e.detail);
    });
  }

  function scrollToBottom() {
    // Attempt standard scroll approaches
    const scrollers = document.querySelectorAll('main, [class*="scroll" i], [id*="scroll" i]');
    let scrolled = false;
    for (const scroller of scrollers) {
      if (scroller.scrollHeight > scroller.clientHeight) {
        scroller.scrollTop = scroller.scrollHeight;
        scrolled = true;
      }
    }
    if (!scrolled) {
      window.scrollTo(0, document.body.scrollHeight);
    }
    return true;
  }

  function observeGenerationState(onChange) {
    if (!activeProfile) return;
    if (activeObserver) {
      activeObserver.disconnect();
      activeObserver = null;
    }

    let isGenerating = false;
    let baseCount = getValidCopyButtons().length;
    const delay = activeProfile.flags ? (activeProfile.flags.postSubmitDelayMs || 0) : 0;

    activeObserver = new MutationObserver(() => {
      // Delay observation checks to allow frontend state updates (important for Claude)
      setTimeout(() => {
        if (!activeProfile) return;
        const stopBtns = document.querySelectorAll(activeProfile.selectors.stopButtonSelector);
        const hasStopBtn = Array.from(stopBtns).some(btn => btn.offsetWidth > 0 || btn.offsetHeight > 0);
        const currentCount = getValidCopyButtons().length;

        if (hasStopBtn && !isGenerating) {
          isGenerating = true;
          onChange("working");
        } else if (!hasStopBtn && isGenerating && currentCount > baseCount) {
          isGenerating = false;
          baseCount = currentCount;
          onChange("complete");
        }
      }, delay);
    });

    activeObserver.observe(document.body, { childList: true, subtree: true });
    console.log("[Workspace Manager Bridge] State MutationObserver attached.");
  }

  // 4. Message Communication Handler
  chromeAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only intercept command actions
    if (message.action && message.action.startsWith("bridge_")) {
      const cmd = message.action.replace("bridge_", "");
      console.log(`[Workspace Manager Bridge] Executing command primitive: ${cmd}`, message.payload);

      // Perform safety handshake
      if (!activeProfile) {
        initProfile().then(() => executeCommand(cmd, message.payload, sendResponse));
        return true;
      }

      executeCommand(cmd, message.payload, sendResponse);
      return true; // async sendResponse
    }
  });

  async function executeCommand(cmd, payload, sendResponse) {
    try {
      switch (cmd) {
        case "ping":
          sendResponse({ status: "pong", url: window.location.href });
          break;
        case "writeToInput":
          const writeOk = writeToInput(payload.text);
          sendResponse({ status: writeOk ? "success" : "error" });
          break;
        case "clickSend":
          const sendOk = clickSend();
          sendResponse({ status: sendOk ? "success" : "error" });
          break;
        case "clickCopyButton":
          const text = await clickCopyButton(payload.type, payload.index);
          sendResponse({ status: "success", text });
          break;
        case "getCopyButtonsList":
          const list = getCopyButtonsList();
          sendResponse({ status: "success", list });
          break;
        case "scanInitialState":
          const state = scanInitialState();
          sendResponse({ status: "success", state });
          break;
        case "getConversationTurnCount":
          const count = getConversationTurnCount();
          sendResponse({ status: "success", count });
          break;
        case "clickNewChat":
          const resetOk = clickNewChat();
          sendResponse({ status: resetOk ? "success" : "error" });
          break;
        case "clickStopButton":
          const stopOk = clickStopButton();
          sendResponse({ status: stopOk ? "success" : "error" });
          break;
        case "scrollToBottom":
          const scrollOk = scrollToBottom();
          sendResponse({ status: scrollOk ? "success" : "error" });
          break;
        case "observeGenerationState":
          observeGenerationState((state) => {
            chromeAPI.runtime.sendMessage({ action: "bridge_state_change", payload: { state } }).catch(() => {});
          });
          sendResponse({ status: "success" });
          break;
        default:
          sendResponse({ status: "error", error: `Unknown command primitive: ${cmd}` });
      }
    } catch (err) {
      console.error(`[Workspace Manager Bridge] Command ${cmd} failed:`, err);
      sendResponse({ status: "error", error: err.message });
    }
  }

})();

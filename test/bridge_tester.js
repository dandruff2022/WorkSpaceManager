/**
 * Workspace Manager - Milestone 1.3 Bridge Primitive Library Tester
 * Run this script inside the extension manager popup/sidebar page devtools console (F12).
 */
(async function() {
  console.log("%c[BridgeTester] Initializing Milestone 1.3 Library Verification...", "color: #a855f7; font-weight: bold;");

  const chromeAPI = typeof chrome !== 'undefined' ? chrome : browser;
  if (!chromeAPI || !chromeAPI.runtime) {
    console.error("[BridgeTester] Must be executed in extension page context (popup/sidebar console).");
    return;
  }

  const results = {
    pingHandshake: false,
    writeToInput: false,
    clickSend: false,
    observeGenerationState: false,
    clickCopyButton: false,
    getConversationTurnCount: false,
    clickNewChat: false
  };

  const delay = ms => new Promise(res => setTimeout(res, ms));

  // Helper to send bridge command via background script forwarding
  function callBridge(tabId, command, payload = {}) {
    return new Promise((resolve) => {
      chromeAPI.runtime.sendMessage({
        action: "bridgeCommand",
        payload: { tabId, command, payload }
      }, (response) => {
        if (chromeAPI.runtime.lastError) {
          resolve({ status: "error", error: chromeAPI.runtime.lastError.message });
        } else {
          resolve(response || { status: "error", error: "No response" });
        }
      });
    });
  }

  // 1. Get Target Active Tab
  const tabs = await new Promise(r => chromeAPI.tabs.query({ active: true, currentWindow: false }, r));
  // Fallback to active tab in current window if popup is docked/undocked
  const normalTabs = tabs.filter(t => t.url && !t.url.includes("manager.html"));
  
  if (normalTabs.length === 0) {
    console.error("[BridgeTester] Failed to locate a target AI page tab. Please focus a tab running ChatGPT, Claude, Gemini, or Copilot in the main browser window, then reopen the manager popup and execute this script.");
    return;
  }

  const targetTab = normalTabs[0];
  const tabId = targetTab.id;
  console.log(`[BridgeTester] Found target tab: ID=${tabId}, Title="${targetTab.title}", URL=${targetTab.url}`);

  alert(
    "Welcome to the Milestone 1.3 Bridge Library Test Harness.\n\n" +
    `Target Tab: "${targetTab.title}"\n\n` +
    "This script will test the dynamic bridge.js script injection, message routing protocol, and the following interaction primitives:\n" +
    "1. ping (Handshake)\n" +
    "2. writeToInput (Text Injection)\n" +
    "3. observeGenerationState (Observation Setup)\n" +
    "4. clickSend (Submit Trigger)\n" +
    "5. clickCopyButton (Extraction Fallbacks)\n" +
    "6. getConversationTurnCount (History Count)\n" +
    "7. clickNewChat (Session Reset)\n\n" +
    "Press OK to begin."
  );

  // --- Step 1: Handshake (Ping) ---
  console.log("[BridgeTester] Test 1: Pinging target content script...");
  const pingRes = await callBridge(tabId, "ping");
  console.log("[BridgeTester] Ping response:", pingRes);
  if (pingRes && pingRes.status === "pong") {
    results.pingHandshake = true;
    console.log("✓ Ping handshake succeeded.");
  } else {
    console.error("✗ Ping handshake failed. Aborting further checks.");
    return;
  }

  // --- Step 2: Text Injection (writeToInput) ---
  const textToWrite = `[WorkspaceManager Bridge Test - Turn 1 - Local time ${new Date().toLocaleTimeString()}]`;
  console.log(`[BridgeTester] Test 2: Writing input to page: "${textToWrite}"...`);
  const writeRes = await callBridge(tabId, "writeToInput", { text: textToWrite });
  console.log("[BridgeTester] writeToInput response:", writeRes);

  const confirmWrite = confirm(
    "[Step 2 Verification]\n\n" +
    `Check the target tab: "${targetTab.title}".\n` +
    `Did the text "${textToWrite}" get injected into the input box, and is the submit/send button now highlighted/active?`
  );
  if (confirmWrite && writeRes && writeRes.status === "success") {
    results.writeToInput = true;
    console.log("✓ writeToInput succeeded.");
  }

  // --- Step 3: Generation Observer Setup ---
  console.log("[BridgeTester] Test 3: Setting up state observer...");
  let stateNotificationReceived = null;
  
  // Set up message receiver in popup console context to catch forwarded state updates
  const stateListener = (message) => {
    if (message.action === "bridge_state_change") {
      console.log(`%c[BridgeTester] State notification received: "${message.payload.state}"`, "color: #10b981; font-weight: bold;");
      stateNotificationReceived = message.payload.state;
    }
  };
  chromeAPI.runtime.onMessage.addListener(stateListener);

  const observeRes = await callBridge(tabId, "observeGenerationState");
  console.log("[BridgeTester] observeGenerationState registration response:", observeRes);
  if (observeRes && observeRes.status === "success") {
    results.observeGenerationState = true;
    console.log("✓ observeGenerationState registration succeeded.");
  }

  // --- Step 4: Submission Trigger (clickSend) ---
  console.log("[BridgeTester] Test 4: Triggering send action click...");
  const sendRes = await callBridge(tabId, "clickSend");
  console.log("[BridgeTester] clickSend response:", sendRes);
  if (sendRes && sendRes.status === "success") {
    results.clickSend = true;
    console.log("✓ clickSend action triggered.");
  }

  alert(
    "[Step 4 Wait]\n\n" +
    "The prompt has been submitted. The test script will now monitor active generation.\n" +
    "Wait until the AI response generation completes, then click OK."
  );

  // --- Step 5: Copy Extraction (clickCopyButton) ---
  console.log("[BridgeTester] Test 5: Triggering copy button click...");
  const copyRes = await callBridge(tabId, "clickCopyButton", { type: "ai", index: -1 });
  console.log("[BridgeTester] clickCopyButton response:", copyRes);

  const confirmCopy = confirm(
    "[Step 5 Verification]\n\n" +
    `Did the script successfully capture the AI response?\n\n` +
    `Captured output: "${copyRes.text ? copyRes.text.substring(0, 150) : "null"}..."`
  );
  if (confirmCopy && copyRes && copyRes.status === "success" && copyRes.text) {
    results.clickCopyButton = true;
    console.log("✓ clickCopyButton succeeded.");
  }

  // --- Step 6: History Count (getConversationTurnCount) ---
  console.log("[BridgeTester] Test 6: Querying conversation turn count...");
  const countRes = await callBridge(tabId, "getConversationTurnCount");
  console.log("[BridgeTester] getConversationTurnCount response:", countRes);
  
  const expectedCount = countRes.count || 0;
  const confirmCount = confirm(
    "[Step 6 Verification]\n\n" +
    `The script resolved ${expectedCount} conversation turns (User+AI pairs) on the page.\n` +
    "Does this count match the visible number of turns?"
  );
  if (confirmCount && countRes && countRes.status === "success") {
    results.getConversationTurnCount = true;
    console.log("✓ getConversationTurnCount succeeded.");
  }

  // Clean up state listener
  chromeAPI.runtime.onMessage.removeListener(stateListener);

  // --- Step 7: Tab Reset (clickNewChat) ---
  console.log("[BridgeTester] Test 7: Triggering new chat click...");
  const resetRes = await callBridge(tabId, "clickNewChat");
  console.log("[BridgeTester] clickNewChat response:", resetRes);

  await delay(2000); // wait for load
  const confirmReset = confirm(
    "[Step 7 Verification]\n\n" +
    "Check the target tab.\n" +
    "Did the chat reset successfully (conversation history cleared, blank session loaded)?"
  );
  if (confirmReset && resetRes && resetRes.status === "success") {
    results.clickNewChat = true;
    console.log("✓ clickNewChat succeeded.");
  }

  // Compile Pass/Fail dashboard
  const finalReport = 
    "=== Milestone 1.3 Bridge Primitive Library Results ===\n" +
    `1. Ping Handshake (Message Routing):   ${results.pingHandshake ? "PASS" : "FAIL"}\n` +
    `2. writeToInput (Text Injection):      ${results.writeToInput ? "PASS" : "FAIL"}\n` +
    `3. clickSend (Submit Dispatch):        ${results.clickSend ? "PASS" : "FAIL"}\n` +
    `4. observeGenerationState (Observer):  ${results.observeGenerationState ? "PASS" : "FAIL"}\n` +
    `5. clickCopyButton (Extraction):       ${results.clickCopyButton ? "PASS" : "FAIL"}\n` +
    `6. getConversationTurnCount (History):  ${results.getConversationTurnCount ? "PASS" : "FAIL"}\n` +
    `7. clickNewChat (Session Reset):       ${results.clickNewChat ? "PASS" : "FAIL"}\n\n` +
    `Observer Captured Notification:         ${stateNotificationReceived ? "YES (" + stateNotificationReceived + ")" : "NO"}\n\n` +
    "All results printed to console logs.";

  alert(finalReport);
  console.log("%c" + finalReport, "color: #10b981; font-weight: bold;");
})();

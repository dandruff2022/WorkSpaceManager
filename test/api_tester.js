/**
 * Workspace Manager - Milestone 1.2 Interactive Validation Script
 * Run this in the page console with the extension loaded.
 */
(async function() {
  console.log("%c[ApiTester] Initializing Milestone 1.2 Verification...", "color: #00bcd4; font-weight: bold;");

  const results = {
    tabActivated: false,
    tabLifecycle: false,
    tabProgrammaticSwitch: false,
    clipboardIntercepted: false,
    clipboardBypassed: false,
    spaNavigationCaptured: false
  };

  const delay = ms => new Promise(res => setTimeout(res, ms));

  // Helper function to send messages to background script via content script event relay
  function sendMessageToExtension(action, payload = {}) {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).substring(2, 9);
      const responseHandler = (e) => {
        try {
          resolve(JSON.parse(e.detail));
        } catch (err) {
          console.error("Error parsing response:", err);
          resolve({ error: "Parse error" });
        }
      };
      document.addEventListener("agyTestResponse_" + id, responseHandler, { once: true });
      document.dispatchEvent(new CustomEvent("agyTestRequest", {
        detail: JSON.stringify({ id, action, payload })
      }));
    });
  }

  alert(
    "Welcome to the Milestone 1.2 Interactive Test Harness.\n\n" +
    "This script will verify:\n" +
    "1. Tab Lifecycle & Startup Scan Sync\n" +
    "2. Programmatic Tab Switching (Focus/Unfocus)\n" +
    "3. Clipboard Interception (Normal vs. OS-Bypass)\n" +
    "4. SPA Routing Interception (History Hook)\n\n" +
    "Press OK to begin."
  );

  // --- Step 1: Tab Lifecycle & Switching ---
  const tabConfirm = confirm(
    "[Step 1: Tab Lifecycle & Switching]\n\n" +
    "Instructions:\n" +
    "1. Open a new tab in this browser window.\n" +
    "2. Switch back to this tab and press OK."
  );
  
  if (tabConfirm) {
    try {
      // Query tracker logs from background
      let response = await sendMessageToExtension("getTestTrackerLogs");
      console.log("[ApiTester] Background logs (before programmatic switch):", response);

      if (response && response.lifecycleCount > 0) {
        results.tabLifecycle = true;
      }

      // Query active tabs to find the newly created tab
      const lastTabId = response.lastCreatedTabId;
      if (lastTabId) {
        console.log(`[ApiTester] Attempting to switch focus programmatically to tab ID: ${lastTabId}...`);
        await sendMessageToExtension("switchTab", { tabId: lastTabId });
        await delay(1500);

        // Switch focus back to ourselves
        const ownTabId = response.callerTabId;
        console.log(`[ApiTester] Attempting to switch focus back to own tab ID: ${ownTabId}...`);
        await sendMessageToExtension("switchTab", { tabId: ownTabId });
        await delay(500);

        // Verify focus switches logged in background
        response = await sendMessageToExtension("getTestTrackerLogs");
        if (response && response.activatedCount >= 2) {
          results.tabActivated = true;
          results.tabProgrammaticSwitch = true;
        }
      } else {
        console.warn("[ApiTester] No newly created tab ID found. Make sure you opened a new tab.");
      }
    } catch (e) {
      console.warn("Could not query background script. Ensure extension is loaded!", e);
    }
  }

  // --- Step 2: Clipboard Interception (Normal) ---
  alert(
    "[Step 2a: Clipboard Interception - Normal]\n\n" +
    "We will test normal copy capture. Writing 'Hello OS Clipboard' to clipboard...\n" +
    "Press OK to execute."
  );

  let copyData = null;
  const copyHandler = (e) => { copyData = e.detail; };
  document.addEventListener("agyCopyCaptured", copyHandler, { once: true });

  try {
    await navigator.clipboard.writeText("Hello OS Clipboard");
  } catch (e) {
    console.warn("Native clipboard write blocked by browser gesture rules, checking event capture anyway...", e);
  }

  await delay(100);
  if (copyData === "Hello OS Clipboard") {
    results.clipboardIntercepted = true;
    console.log("✓ Clipboard copy captured successfully.");
  }

  // --- Step 3: Clipboard Interception (Bypass) ---
  alert(
    "[Step 2b: Clipboard Interception - OS Bypass]\n\n" +
    "We will now activate OS-Bypass mode. Writing 'Secret Internal Data' to clipboard...\n" +
    "Press OK to execute."
  );

  window.__agy_intercept_active = true;
  copyData = null;
  document.addEventListener("agyCopyCaptured", copyHandler, { once: true });

  try {
    await navigator.clipboard.writeText("Secret Internal Data");
    await delay(100);
    
    const capturedFine = (copyData === "Secret Internal Data");
    let osVal = "";
    try {
      osVal = await navigator.clipboard.readText();
    } catch(err) {
      osVal = prompt("Interception complete. Paste (Ctrl+V) here to check OS clipboard:", "");
    }

    const bypassedFine = (osVal !== "Secret Internal Data");
    if (capturedFine && bypassedFine) {
      results.clipboardBypassed = true;
      console.log("✓ OS Clipboard bypass verified!");
    } else {
      console.warn(`[ApiTester] OS Clipboard bypass failed. Captured: ${capturedFine}, OS Value: '${osVal}'`);
    }
  } catch (e) {
    console.error("Bypass copy test failed:", e);
  } finally {
    window.__agy_intercept_active = false;
  }

  // --- Step 4: SPA Navigation ---
  alert(
    "[Step 3: SPA Routing Interception]\n\n" +
    "Triggering history.pushState to '/test-new-chat'...\n" +
    "Press OK to execute."
  );

  let navDetected = false;
  document.addEventListener("agyNavigation", (e) => {
    if (e.detail.includes("/test-new-chat")) navDetected = true;
  }, { once: true });

  history.pushState({}, "", "/test-new-chat");
  await delay(100);

  if (navDetected) {
    results.spaNavigationCaptured = true;
    console.log("✓ SPA Routing pushState intercepted.");
  }

  // Revert path
  history.replaceState({}, "", window.location.pathname.replace("/test-new-chat", ""));

  // --- Summary ---
  const report = 
    "=== Milestone 1.2 Verification Results ===\n" +
    `1. Tab Startup/Lifecycle Sync:  ${results.tabLifecycle ? "PASS" : "FAIL"}\n` +
    `2. Tab Focus Tracked:           ${results.tabActivated ? "PASS" : "FAIL"}\n` +
    `3. Tab Programmatic Switch:      ${results.tabProgrammaticSwitch ? "PASS" : "FAIL"}\n` +
    `4. Clipboard Intercept:         ${results.clipboardIntercepted ? "PASS" : "FAIL"}\n` +
    `5. Clipboard OS Bypass:         ${results.clipboardBypassed ? "PASS" : "FAIL"}\n` +
    `6. SPA Navigation Track:        ${results.spaNavigationCaptured ? "PASS" : "FAIL"}\n\n` +
    "Check devtools console for detailed logs.";

  alert(report);
  console.log("%c" + report, "color: #4caf50; font-weight: bold;");
})();

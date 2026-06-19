# Phase 0.5 Implementation Plan: Extension Setup & UI Shell

This document outlines the step-by-step implementation plan for **Phase 0.5 — Extension Setup** of the Workspace Manager. The goal is to build a fully launchable browser extension with a functional toolbar entry point, detached window management, side panel integration, and a premium dark-mode/glassmorphism UI shell.

---

## 1. Project Directory Structure

We will create the following extension structure inside the root directory:

```text
E:\WorkSpace\WorkSpace\WorkSpaceManager\
├── doc/
│   ├── log/                       # Development logs and testing results
│   └── plan/
│       └── phase_0.5_plan.md      # This implementation plan
├── manifest.json                  # Cross-browser Manifest V3 definition
├── background.js                  # Background script for window lifecycle & toggle control
├── content.js                     # Content script (placeholder for page automation)
└── ui/
    ├── manager.html               # UI shell HTML
    ├── manager.css                # Base styling & theme tokens (glassmorphism / dark mode)
    └── manager.js                 # Navigation and view toggle logic
```

---

## 2. Detailed Implementation Steps

### Step 2.1 — Manifest Configuration (`manifest.json`)
* **Specification**: Configure a cross-browser Manifest V3 script.
* **Details**:
  * Include permissions: `"tabs"`, `"storage"`, `"scripting"`, `"sidePanel"` (for Chromium).
  * Declare `background.service_worker` (Chromium) and `background.scripts` (Firefox compatibility fallback, if testing in Firefox Developer Edition/Nightly).
  * Configure `action` with a default icon and default title ("Open Workspace Manager").
  * Specify `host_permissions`: `["<all_urls>"]` (or target domains like `*://*.openai.com/*`, `*://*.anthropic.com/*` for safety).
  * Define `sidebar_action` (Firefox specific) or configure Chrome's `sidepanel` properties.

### Step 2.2 — Background Script (`background.js`)
* **Specification**: Manage window launching, side panel toggling, and prevent duplicate instances.
* **Details**:
  * **Detached Window Logic**:
    * Maintain a global reference `managerWindowId = null`.
    * When the toolbar icon is clicked, check if `managerWindowId` exists.
    * If it exists, try to focus it using `chrome.windows.update(managerWindowId, { focused: true })`.
    * If focusing fails (meaning the window was closed), or if it doesn't exist, create a new window:
      ```javascript
      chrome.windows.create({
        url: chrome.runtime.getURL("ui/manager.html?mode=window"),
        type: "popup",
        width: 850,
        height: 600
      }, (win) => {
        managerWindowId = win.id;
      });
      ```
  * **Side Panel Toggle Logic**:
    * Provide a messaging listener to switch from Window Mode to Side Panel Mode and vice-versa.
    * In Chromium: Use `chrome.sidePanel.open({ tabId })` or set active side panel options.
    * In Firefox: Communicate with the sidebar or open the panel.
    * Handle fallback when one view closes and the other opens.

### Step 2.3 — Scaffolding UI HTML (`ui/manager.html`)
* **Specification**: A two-panel shell with fixed sidebar navigation and a main content container.
* **Details**:
  * Include Google Fonts link for the **Outfit** or **Inter** font family.
  * **Left Sidebar Navigation**:
    * Brand / Logo section (e.g., "Workspace Manager").
    * A list of five navigation items representing:
      * Context Transfer
      * Broadcast
      * Orchestrator
      * Skills
      * Connection
    * A bottom switcher control: "View Mode: [Detached Window | Side Panel]".
  * **Right Content Area**:
    * Layout container matching active selections.
    * Five separate wrapper `div` elements, toggled via `.active` class rules.
    * Each tab has a header, descriptive text, and a placeholder label ("Coming Soon in Phase X").

### Step 2.4 — Scaffolding UI CSS (`ui/manager.css`)
* **Specification**: Design a premium dark-mode, glassmorphism layout with smooth transitions.
* **Details**:
  * **Color Tokens**:
    * Backgrounds: Sleek translucent grays (`rgba(20, 20, 25, 0.75)` with `backdrop-filter: blur(16px)`).
    * Primary Accents: Glowing violet/blue gradients (`linear-gradient(135deg, #6366f1, #a855f7)`).
    * Text Colors: High-contrast white (`#f8fafc`) for headers, muted gray (`#94a3b8`) for secondary elements.
    * Borders: Soft reflective gray-white overlays (`rgba(255, 255, 255, 0.08)`).
  * **Layout Structure**:
    * Flexbox layout splitting the viewport: left panel is `260px` fixed width, right panel takes the remaining screen size (`flex-grow: 1`).
    * Full responsive adaptation to ensure resizing (e.g., down to `300px` width in Side Panel mode) does not cause layout wrapping or broken visual components.
  * **Aesthetic Polish**:
    * Subtle box-shadow glows.
    * Hover transitions (`transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`) on menu buttons.
    * Linear background animations on action headers.

### Step 2.5 — Interactive Controller (`ui/manager.js`)
* **Specification**: Handle navigation swaps, read view modes from URL query params, and persist settings.
* **Details**:
  * Read parameter `?mode=window` or `?mode=panel` to set base styles or layout options.
  * Bind click listeners to left sidebar navigation tabs.
  * Switch `.active` class on the clicked navigation button and its corresponding right panel container.
  * Set up local storage listener (`chrome.storage.local`) to remember user preferences (e.g., active view mode preference).

---

## 3. Work Verification Criteria

1. **Successful Loading**: The extension loads cleanly in Chromium (`chrome://extensions/`) and Firefox (`about:debugging`) with zero initial load errors.
2. **Launch & Focus**: Clicking the browser action toolbar icon launches a detached popup window. Clicking it again focuses the existing popup instead of spawning a duplicate.
3. **View Mode Switching**: Toggle buttons in the UI can request switching/closing window modes.
4. **Navigation Integration**: Clicking each menu item smoothly highlights the selected option and swaps the content panel on the right side.
5. **Visual Validation**: The layout scaling, colors, borders, font weights, and glassmorphism elements conform to the design system.

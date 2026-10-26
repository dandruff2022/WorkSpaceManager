# Phase 2.5 Plan — Demo Release (v0.6.0)

Goal: in one 3–5 hour session, turn the paused prototype into a small, working, public demo that a stranger can
understand from the GitHub page alone. Ship fewer features that work, hide the rest, and collect ideas for later.

Written 2026-10-26, after a three-month pause. Context: since v0.5 the providers cut free usage and added built-in
agentic modes, so the heavy multi-tab orchestration design no longer fits. This plan keeps the parts that still help
a user today.

---

## 1. Scope

| Area | Decision | Why |
|---|---|---|
| `@` prompt autocomplete + prompt library (Skills) | **Keep — headline feature** | Works; reuse saved prompts on any chatbot site |
| Simulated typing / clicking (`bridge.js`, site profiles) | **Keep — engine** | No API keys; drives the real web pages |
| Live tab monitor (empty / generating / done) | **Keep** | Works; useful while waiting on several chats |
| Broadcast (one prompt → many tabs) | **Keep, merged with the monitor** | Natural pair: send, then watch |
| Connection (site profiles) | **Keep, moved to Settings** | Infrastructure, not a daily screen |
| Context Transfer | **Hide** | "Copy the whole chat" is slow and fragile; rethink later |
| Orchestrator | **Hide** | Not implemented; design is outdated |
| Debug Test | **Unchanged** (debug mode only) | Developer tool |

Hidden modules keep their code and docs; only the navigation entry is removed. Workflow-only skills that serve hidden
modules (`%transfer`, `%format`, `%merge`, `@breakdown`) are removed from the default prompt list.

---

## 2. Usage redesign — what the simulated actions are for

The v0.5 engine can type, send, read status, start a new chat, and copy the last answer. v0.5 used these mainly for
orchestration. For the demo, they serve three plain user stories:

1. **"Ask several AIs the same thing."** One composer in the manager → pick tabs → Send. Each tab shows a live status
   chip. Clicking a tab row jumps to that tab.
2. **"Tell me when it's done."** When a monitored tab goes from *generating* to *done* and the user is not looking at
   it, show a system notification (click → focus the tab). Small change, large daily value.
3. **"Same follow-up everywhere."** Each tab row gets small quick-action buttons that send a saved prompt to that tab
   (default: `@continue`, `@shorten`), plus "send to all" on the composer.

Anything beyond these goes to the brainstorm list (§6), not this release.

---

## 3. UI rework (plain and intuitive)

- **Navigation:** three entries instead of five — **Send** (broadcast + monitor), **Prompts** (skills), **Settings**
  (sites, view mode, autocomplete trigger key). Opens on **Send**.
- **Plain wording:** no internal terms in the UI ("Skills" → "Prompts", "Broadcast" → "Send", "Connection" → "Sites").
  Each screen gets one sentence telling the user what it does.
- **Plainer look:** drop glassmorphism blur and glow gradients; flat surfaces, one accent color, system font. Follow the
  OS light/dark setting.
- **Empty states:** when no chatbot tab is open, show "Open ChatGPT, Claude, Gemini or Copilot in a tab" with links,
  instead of an empty list.
- **New icon:** simple, readable at 16 px (e.g. an `@` inside a chat bubble). Export PNGs at 16/32/48/128 — Chrome does
  not accept SVG for extension icons, so the current `icon.svg` likely shows as a blank/default icon.

---

## 4. Work steps

| # | Step | Est. | User involvement |
|---|---|---|---|
| 1 | Merge `demo-fixes-2026-10` into a release branch; bump to 0.6.0 | 10 min | — |
| 2 | Smoke-test the engine on all four sites; fix broken selectors | 45 min | Load the extension, click through, paste debug reports |
| 3 | Hide Context Transfer / Orchestrator; trim default prompts | 20 min | — |
| 4 | UI rework (§3): 3-tab nav, Send screen, plain theme, empty states | 75 min | Look at screenshots, say what feels off |
| 5 | Done notifications + per-tab quick actions (§2) | 45 min | Try it once |
| 6 | Icon set (PNG) | 15 min | Pick one of 2–3 options |
| 7 | README: one-line pitch, GIFs, install, supported sites, limits, roadmap | 45 min | Record 2 GIFs (I script the steps) |
| 8 | Update `roadmap.md`, tag `v0.6.0`, GitHub release with zip | 15 min | Approve push / release |

Total ≈ 4.5 h. If time runs short, cut step 5 first, then the quick-action half of it.

---

## 5. Release checklist

- [ ] Fresh "Load unpacked" from the release zip works in Chrome (and Firefox temporary add-on, best effort)
- [ ] `@` autocomplete works on ChatGPT, Claude, Gemini, Copilot
- [ ] Send to 2+ tabs works; statuses update; done notification fires
- [ ] No hidden module reachable from the UI; no console errors on open
- [ ] README GIFs render on GitHub; known limits listed (selectors break when sites change their pages)

---

## 6. After the release — brainstorm list (not in scope)

- Compare view: read the last answer from each tab and show them side by side in the manager.
- Lighter context transfer: carry only a summary or the last answer, not the full chat.
- Prompt chains: send prompt A, wait for done, then send B (a simple, linear successor to the orchestrator).
- Self-repairing site profiles when a page layout changes (Future Plan 1).
- Prompt library import/export and sharing.
- Chrome Web Store / Firefox Add-ons listing.

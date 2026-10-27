# Phase 3 Plan — Projects: a workflow you own (v0.7.0 trial)

Goal: a first, half-automatic version of the memory-centred workflow that the user can try inside the extension.
Each step is one button; the extension assembles the message, opens the chat, sends, waits, reads the answer and
parses it; the user looks at the result between steps.

Written 2026-10-26 after a design discussion and two rounds of live prompt tests (see §7). Replaces the old
Phase 3–4 (Context Transfer, task-tree Orchestrator), which stay on hold.

---

## 1. Why this exists

Provider "work" modes run inside one vendor. This extension keeps the **whole workflow on the user's side**: the plan
(tasks), the progress (memory, versioned), the routing (which AI does which step) and the record (what was sent, who
answered, full answer text). Any AI can do the next step, so the user can switch provider halfway, and can see and
change every step: edit the message before sending, review memory changes, pick the AI per task, or do a step by hand.

Pitch: *Your AI workflow, your control: plan, memory and history stay with you; any AI can do the next step.*

## 2. Concepts

| Thing | What it is | Lives |
|---|---|---|
| **Project** | One piece of work: memory + tasks + step log | extension storage |
| **Memory** | Markdown with five sections: Goal, Preferences, Decisions, Current state, Open questions | versioned (v0, v1, …) |
| **Task** | Title, Task, Needs (memory sections), Return, assigned AI, status, result | inside the project |
| **Step** | One send: kind, AI, chat URL, message sent, status, archive id | project log |
| **Archive** | Full text of an answer, read through the copy button | referenced by steps |
| **Script prompts** | `%split %task %result %mem-update %resume %fix` and modifier `+short` (texts from `doc/experiments/memory_workflow/prompts_v2.md`) | code constants this phase |

AI-made decisions are written by the AI with a `〔AI · basis: …〕` tag and applied right away; the user reviews the diff
and can undo. (User decision, 2026-10-26: "AI makes its decisions, I review.")

## 3. What the user sees — new **Projects** screen

Order in the sidebar: Projects, Send, Prompts, Settings. Works in the window and the side panel.

1. **Project bar**: pick a project, "New project" (title + optional starting memory; an empty template is filled in).
2. **Memory card**: editable text, version label ("v2 · updated by Gemini"), **History** (list of versions; click one to
   see what changed against the previous one; **Undo last update**).
3. **Next step** card with four buttons. Each opens a small composer: the assembled message is shown in a text box
   (editable), an AI picker (ChatGPT / Gemini), a "+short" tick, and **Send**:
   - **Split into tasks** → `%split` + memory → reads the `tasks` block → task cards appear.
   - **Run tasks** (on the task list) → each task: `%task` + its Needs sections + task + output rules, in a new chat
     on its assigned AI. Sends one after another, then waits for all. Each card shows status and its `result`.
   - **Update memory** → new chat: `%mem-update` + current memory + finished results → reads the `mem` block → saves
     a new version and shows the diff.
   - **Continue in…** → new chat: `%resume` + memory + the user's instruction (+short optional) → switches the user to
     that chat to keep talking.
4. **Activity**: one line per step (time, kind, AI, status), with **Open chat** (switches to the tab, or reopens the
   saved URL) and **Full answer** (shows the archive).

Rules behind the buttons:
- Answers are read with the copy button (raw Markdown). The parser takes the **last** fenced block with the expected
  label (falls back to the last fenced block) and ignores anything after it.
- No block found → send `%fix` once in the same chat; still nothing → mark the step "Needs you" and show the full answer.
- Worker chats are opened as new tabs in the background window and **closed after their result is read** (the chat
  URL stays in the log). Setting: "Keep worker tabs open". ChatGPT memory updates use a temporary chat
  (`?temporary-chat=true`) if that works, to keep the user's history clean.
- Status tracking moves to the background, so it no longer needs the manager open (also fixes the v0.6 limit).

Not in this phase: prompt library types (`@` / `+` / `%` in the `;;` pop-up), user notes, local folder sync, one-click
full automation, Claude/Copilot support for Projects.

## 4. Technical design

- `utils/workflow_prompts.js` — prompt texts, message assembly (wrapper → memory sections → task → "Output
  requirements:" line), parsers: `parseTasks`, `parseBlock(label)`, `parseMemory` (sections), `diffMemory`.
  Pure functions, loadable in the worker, the page and Node.
- `utils/project_store.js` — projects, memory versions, steps, archives in `chrome.storage.local`
  (`projects`, `archives`).
- `utils/workflow_engine.js` (background, `importScripts`) — `runStep(projectId, step)`: open or reuse a tab, wait for
  the content script, focus → `writeToInput` → `clickSend` → restore focus, wait for `working → complete`
  (timeout 5 min, keep-alive ping while waiting), `clickCopyButton('ai', -1)`, parse, `%fix` if needed, save. Emits
  `workflowUpdate` messages to the UI.
- `ui/modules/projects.js` + section in `ui/manager.html` + styles in `ui/manager.css`.
- **Dev test harness** (for Claude in Chrome, which cannot open `chrome-extension://` pages):
  `test/harness/index.html` served on `http://localhost:8765`, talking to the background through
  `externally_connectable`. The background only answers when **Dev harness** is switched on in Settings (visible with
  `?debug`), so no web page can drive chat tabs in normal use.

## 5. Work steps

| # | Step | Check |
|---|---|---|
| 0 | Branch `phase-3-projects` from `release/v0.6.0` | — |
| 1 | `workflow_prompts.js` + Node tests for parsers (fixtures from the round-2 logs, incl. Gemini follow-up text, missing block, nested fences) | `node test/workflow_prompts.test.js` passes |
| 2 | `project_store.js` | Node test with a storage stub |
| 3 | Engine in background + harness + Dev harness setting | harness can run one step on ChatGPT |
| 4 | **Primitive check** via harness on ChatGPT and Gemini: copy-read returns Markdown with the fenced block; `complete` fires only after a web-search answer is fully done; new tab + temporary chat | fix selectors / state logic if needed |
| 5 | Projects screen | headless screenshots, light/dark, panel width |
| 6 | End-to-end via harness with Claude in Chrome: a small task (split → 2 tasks on ChatGPT + Gemini → update memory → continue on the other AI) | log in `doc/log/` with what broke |
| 7 | User tries the Projects screen by hand | user feedback |
| 8 | Log, roadmap, README section | — |

Estimated 5–7 hours of agent work before step 7.

## 6. Risks

- Copy-button reading or "done" detection may be wrong on current sites (never re-tested since 10/14) → step 4 first.
- Many tabs and chats per task (user's side note, to be discussed) → worker tabs auto-close, temporary chats.
- The service worker may stop during long waits → keep-alive while a step runs; steps resume as "Needs you" if lost.
- Free-plan limits: a small project costs about 5–6 messages.

## 7. Evidence from the prompt tests

`doc/experiments/memory_workflow/`: round 1 (CHI paper, by GPT) found memory drift (proposals turned into decisions,
an open question silently removed, earlier chat leaking in) and lossy hand-offs. Prompts v2 fixed these in round 2
(Chicago trip, blog post): `+short` held answers to 16–85 words, hand-offs kept all Return items and links, memory
updates tagged decisions and explained removed questions, and resuming on the other site did not re-argue decisions.
Gemini's trailing "follow-up" line is the web page's suggestion chips, not model output.

# Phase 3.2 Plan — Library: prompts, answer styles, notes, one picker everywhere

Written 2026-10-26 after a design discussion with the user (agreed; implement next, branch `phase-3-projects` or a new
`phase-3.2-library` branched from it). Read `AGENTS.md` and `doc/architecture.md` first.

## 1. The four kinds of saved text (user's definitions)

| Kind | UI name | Symbol · color | What it is | Who changes it |
|---|---|---|---|---|
| Prompt | **Prompts** | `@` · indigo (accent) | Asks the AI to *do* something; can be sent alone (`@check`, `@paper_read`) | User (Library) |
| Answer style | **Styles** ("Answer: …") | `≡` (sliders) · teal | *How* to answer (short, with sources, table, Chinese…); only attached to another message; several can combine | User (Library) |
| Note | **Notes** | `✎` · amber | The user's own jotted memos and random thoughts. Mostly edited by hand; sometimes the user asks the AI to tidy/rephrase/structure a part | User; AI only on request, with diff + undo |
| Project memory | **Memory** (keep the name inside Projects) | `◆` · green | Posterior view of a project: goal, decisions, current state. Updated by AI chores (Phase 3.1) | AI (chores) + user |

Script prompts (`%split %task %combine %mem-update %resume %fix`) stay code constants, hidden from users.
"Auto-evolving" belongs to Memory only; Notes never change by themselves.

## 2. Consistency rules (the core of this phase)

### 2.1 What is shared, and why
**Rule: anything that becomes text in a message is shared; operations are not.** Text sources = Prompts, Styles, Notes,
Memory. Operations (run tasks, combine, save an answer, bring into a project) depend on where they are and stay with
the object they act on: answer operations next to answers, project operations in Projects.
User-facing promise: *"Wherever you write to an AI, `;;` gets you anything you saved."*

| Where the user writes | Prompts | Styles | Notes | Memory |
|---|---|---|---|---|
| Chat site input | ✓ | ✓ | ✓ | ✓ (pick a project) |
| Send composer | ✓ | ✓ | ✓ | ✓ |
| Projects instruction boxes (Combine, Continue) | ✓ | ✓ | ✓ | hidden for the current project (already in the message) |
| Projects assembled messages (Plan, tasks, Combine…) | — | ✓ (via the Answer button) | — | — |
| Notes editor | no picker: not a message to an AI | | | |

Groups are hidden only where redundant; order and look never change.

### 2.2 How a style gets into a message
- **Chat sites: stateless.** Choosing styles inserts/updates one visible last line `Output requirements: short; with
  sources` in the input. No interception of the site's send button or Enter key (fragile and invisible). The picker
  pre-ticks the last styles used on sites.
- **Our pages: stateful.** A persistent **Answer button** `≡ Answer: short · sources ▾` next to each Send button;
  remembered per place (Send, Projects); applied when the message is assembled and visible in the message preview.
- Same user rule both ways: **the style is always the last line of your message, and you can see it.**
- One function builds that line for both (`WorkflowPrompts.buildRequirements(styles)` or a Library helper), so the
  text is identical everywhere. Projects' "Short answers" checkbox is replaced by the Answer button; `+short` becomes
  the built-in style "Short".

### 2.3 Shared interaction logic (identical everywhere)
| Action | Behaviour |
|---|---|
| Open | Type `;;` (configurable trigger); on our pages the Answer button opens the same picker on the Styles group |
| Filter | Keep typing after `;;` → search across all groups; `;;@` limits to Prompts (keeps the v0.6 habit) |
| Switch group | Tab / Shift+Tab: Prompts → Styles → Notes → Memory |
| Choose | ↑↓ move, Enter insert, Esc close |
| Styles | Space ticks/unticks without closing; Enter applies |
| Insert position | Prompts, Notes, Memory: at the caret as their own paragraph. Styles: replace or add the last `Output requirements:` line |
| After insert | Caret after the inserted text; inserted text briefly highlighted (our pages; on sites where feasible) |
| Every row | ✎ opens it in the manager; long items show the first lines and size (e.g. "v3 · 420 words") |
| Nothing saved | "Nothing here yet — create one in Library" |

### 2.4 Shared visual cues
1. **Symbol + color per kind** (table in §1) used everywhere: picker group headers and rows, Library tabs, sidebar
   nav icons, Projects memory card, Answer button.
2. **Labelled inserted blocks** (works on any site, survives site redesigns, tells the AI it's material not orders):
   - Note → `[Note: Weekend ideas]` + text
   - Memory → `[Project memory v3: Note app pick]` + text
   - Style → `Output requirements: …` (one line)
   - Prompt → inserted as is (it *is* what the user says)
3. Same footer hint: `↑↓ choose · Enter insert · Space tick style · Esc close`.
4. Same words everywhere: Prompts, Styles / Answer, Notes, Memory.

### 2.5 Allowed differences
| | Chat site | Our side panel / window |
|---|---|---|
| Picker placement | Floating overlay above the input, in a **shadow DOM** (site CSS can't touch it, ours can't leak) | **Inline tray** that expands right above the input and pushes content down — never overlaps or clips in the narrow panel |
| Density / theme | Compact; follows the site's light/dark; small accent use | Full design system |
| Persistent controls | None. Optional faint `;;` hint at the input corner when focused (no state) | Answer button next to every Send |

## 3. Entry points (where to view and edit)

Sidebar: **Projects · Notes · Send · Library · Settings** (check the 380px panel; nav icons already hide under 440px).

| Kind | Main place | Shortcuts |
|---|---|---|
| Notes | **Notes** page (daily writing surface) | ✎ in the picker |
| Memory | **Projects** memory card only | shown with version in the picker |
| Prompts | **Library** → Prompts tab (the current Prompts page, renamed) | ✎ in the picker |
| Styles | **Library** → Styles tab | "Manage styles…" at the bottom of the Styles group / Answer panel |

## 4. Architecture (for maintenance)

- **Providers.** One provider per kind: `prompts` (skills registry), `styles` (new registry, built-ins + custom),
  `notes` (new store), `memory` (from `ProjectStore`). One query, answered by the background:
  `library_query {context: {surface: 'site'|'send'|'instruction'|'step', projectId?}, text, group?}` →
  `[{group, id, title, preview, size, insert: {mode: 'paragraph'|'requirement', text}}]`. Adding a kind later =
  add a provider; no surface changes. Replaces `querySkills` (keep it as an alias for one release).
- **One picker, two renderers.** Shared logic module (filtering, grouping, keyboard, insertion rules):
  `utils/picker_core.js`. Renderers: overlay (site, shadow DOM) and inline tray (manager). `utils/autocomplete.js`
  becomes the site renderer on top of the core; the manager's `setupPopupAutocomplete` switches to the tray and is
  attached to Send, Projects instruction boxes, and future composers.
- **Insertion helpers** shared by both: insert paragraph at caret (textarea + contenteditable, reuse bridge's React-safe
  write), replace/add the requirements line.
- **Storage:** `styles` (custom styles + built-in overrides), `notes` (`{id, title, text, tags?, versions[{text, by, at}],
  updatedAt}`), `styleChoice` (`{send: [...], projects: [...], site: [...]}`).
- **Site injection kept minimal:** the picker (needs the profile's input selector, already there) and, in step B, the
  answer buttons (need the copy-button selector, already there). No new selectors to chase.

## 5. Steps

### Step A — Styles + one picker everywhere
1. Styles registry: built-ins *Short*, *Detailed*, *With sources*, *Table*, *In Chinese* (length is one-of:
   Short/Normal/Detailed; the rest multi-select), custom styles; requirements-line builder; Node tests.
2. Library page: rename Prompts → Library with tabs Prompts / Styles (style editor: name, text, group).
3. `picker_core.js` + inline tray renderer; Answer button + panel; wire into Send and Projects (replace "Short answers",
   remember per place).
4. Site overlay renderer on the core (shadow DOM), groups Prompts / Styles / Notes (empty for now) / Memory;
   labelled inserts; stateless requirements line.
5. `library_query` in background with context filtering; `querySkills` alias.
6. Tests: Node (providers, requirements line, insertion rules on plain strings), headless screenshots (tray in panel,
   overlay page), live on ChatGPT + Gemini inputs (textarea + contenteditable) via the localhost harness.

### Step B — Notes
1. Notes store (versions kept) + Notes page: list (search), editor (plain textarea, autosave), delete.
2. AI edit on request: select text (or whole note) → "Tidy / Rephrase / Structure / custom" → engine step kind
   `note-edit` on the chores AI in a temporary chat → answer in a `note` block → diff view → apply / undo. Never
   automatic.
3. "Bring into project": start a new project from a note (note → Goal + material) or attach to the current one as
   material for its next step.
4. Answer buttons on chat sites (next to the site's copy button, shadow DOM): **Save to Notes** (new note or append)
   and **Bring into project**. Uses the existing copy-read path.
5. Notes in the picker (labelled inserts).

## 6. Defaults agreed (2026-10-26)
- Style choice is remembered per place (site, Send, Projects separately).
- Note AI edits use the chores AI in a temporary chat.
- No `.md` export / folder sync this phase (todo).

## 7. Not in this phase (todo)
- `.md` export/import and local folder sync for Notes and Library.
- Compare answers side by side; cross-check one AI's answer with another (`@check` across tabs) — Send page ideas.
- Tags/topics for notes and prompts beyond simple search.
- Tightening the memory-update prompt (decisions one line each).

## 8. Verify
- Unit tests pass; screenshots light/dark at 380px and window width (tray never clips; overlay above site input).
- Live: `;;` on ChatGPT and Gemini inserts a prompt, a labelled memory, and the requirements line (ticking twice
  replaces, not duplicates); Answer button in Send and Projects changes the assembled message; a Projects run with
  Styles works end to end; Notes AI edit shows a diff and undo restores.

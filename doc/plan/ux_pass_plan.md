# UX pass before v0.7 (round 1)

Goal: a college student from any major understands the extension in 10 minutes. No raw internal text (fenced
blocks, `+ -` diffs, `(AI · basis: …)` tags, "temporary chat", "chore") in front of the user unless they ask for it;
fewer stray buttons; tidy alignment at 380px (side panel) and in the window.

Found in a walkthrough on 2026-10-27 (localhost panel page, real extension, project "Intro Psychology midterm",
Plan → 2 tasks → Combine → memory update). Screens referenced by the area they are in.

## Fixes

### 1. Answers are shown rendered, not as raw text (biggest)
Today `showText()` (`ui/modules/projects.js` ~565) puts the answer in a monospace `<pre>`-like box, so a Plan answer
shows the whole ```` ``` ```` block with `Title:/Task:/Needs:/Return:/===`, a task answer shows its ```` ```result ````
fence, and the Combine "Final answer" shows `##` and `1.` as plain text. The task "Result" disclosure in Run tasks is
the same.
- Add `readableAnswer(kind, text)` (in `utils/workflow_prompts.js`, unit-tested) that turns a stored answer into
  Markdown for people:
  - `split`: the explanation before the block, then each task as `**Title**` + the Task text (drop Needs/Return
    lines, drop `===`, drop the fence); if parsing fails, the text without fence lines.
  - `task`: the text with the ```` ```result ```` / ```` ``` ```` fence lines removed (content kept).
  - `mem-update`: the explanation (if any) and the memory without the fence; strip `(AI · basis: …)` tags.
  - `combine`, `resume`, anything else: unchanged.
  Also used for the task "Result" disclosure.
- `showText()` renders with `MarkdownView.render(...)` in the normal UI font (same look as the memory read view).
  Add a small "Copy" button in the dialog head (copies the original stored text) and a "Show original" link that
  swaps to today's monospace raw view (for people who want it). "Message sent" (the Sent link) may stay raw.
- The dialog must fit the 380px panel: head wraps cleanly, body scrolls, no part of it off screen (today the
  dialog head/body cut at the top in the panel).

### 2. Notes are the user's own, not an answer bin
Remove the "Save to Notes" button from the answer dialog (projects.js `showText` + `#btn-proj-archive-note`,
`#proj-archive-status` in `ui/manager.html`). The right-click "Save to Notes" on web pages stays (the user picks the
text). Update the Notes page intro if it mentions answers. Keep "Start a project" from a note.

### 3. Memory "What changed" reads like a change list, not a code diff
`renderMemoryView` / the "new changes" box (projects.js ~590–620; CSS in `ui/manager.css`) shows `+ -` lines in
monospace with red strike-through. Instead: normal font; per section heading, show added items with a small green
"New" marker and removed items struck through in muted grey; no `+`/`-` characters; unchanged sections are
skipped. Compare items with the leading `- ` bullet removed and whitespace trimmed, so "Goal: text" → "- text" is
**not** shown as a change (today it is).
- In the memory read view, hide `(AI · basis: …)` tags; put the basis text in the item's `title` (tooltip).
- Header line: drop "v0/v1" (`$('proj-mem-version')`, ~602): "Written by you · 09:14" / "Updated by ChatGPT · 09:18".
  Versions stay reachable through the "Versions" button.
- One-line explanation under the Memory heading, muted: "What every AI gets told about this project."

### 4. Hide internal chores and jargon
- Combine card (~417): while the memory updates show one muted line "Updating the project memory…", no status
  pill, no AI name, no "temporary chat", no Open chat. When done: "Memory updated" + link "See changes" that
  opens the Memory section. Errors still show with their message.
- Step lines and History (~405, ~686): drop "· temporary chat" / "· temporary" text. Rename the "Sent" link to
  "Message". History entry "Memory update" → "Memory updated".
- Task details (~335): "Uses memory: Goal, Current state" → "Gets from memory: Goal, Current state"; "Must return:"
  → "Asked to return:".
- Plan card text: "ChatGPT splits the work into up to 2 tasks that run in separate chats." →
  "ChatGPT breaks the work into 1–2 parts. Each part runs in its own chat, then the answers are combined."
- Run tasks: remove the separate "Message for “…” → ChatGPT" disclosures under the task list (~311); put that
  message editor inside each task's "Task details" instead (same `messageBox(...)` key, so edits still work).
  Replace "Each task goes to a new chat on its AI, with only the memory parts it needs." with
  "Each part runs in a new chat. You can pick the AI for each."

### 5. Small bugs seen
- Describe line shows `"- Help me prepare…"` after a memory update: strip a leading `- ` / `* ` from the Goal line.
- Project names: when the user leaves the name empty, the select shows the goal cut mid-word
  ("Help me prepare for my Intro"). Use the first sentence of the goal, cut at a word boundary to ≤ 32 chars with
  "…". (Only for new projects; don't rename existing ones.)
- Progress lines repeat the task title ("Done: 5-Day … Study Plan (ChatGPT): Title: 5-Day … Study Plan"). In
  `buildProgress`, skip result lines that start with `Title:` or equal the task title (case-insensitive, ignoring
  `#`, `*`, `Title:`), take the next non-empty line; prefer a line containing a digit among the first 3 candidates.
  Add unit tests.
- Switching pages (top nav) keeps the old scroll position, so Notes/Library open in the middle. Scroll the page to
  the top on every nav switch.
- Done steps can be clicked to reopen them, but nothing shows that. Add a small chevron (▸ closed, ▾ open) at the
  end of the step's title row for steps that can open.

### 6. Alignment (380px and window)
One rule for every step card's action area: the Answer control (button + chips) on its own row at the left; then a
row aligned right with secondary buttons first and the primary button last, same height, wrapping together.
Apply to Plan ("Skip — do it in one chat" + "Plan with ChatGPT"), Run tasks ("Run 2 tasks"), Combine, Continue
("Continue in Gemini" secondary + "Continue in ChatGPT" primary on one row). Task rows: put "Run again" and
"Remove" on the same row as the task's "Sent … Full answer" line or at the right of the status row — no row that
holds only a lone red "Remove". Check light and dark, 380px and 900px.

## Out of scope this round
Dropping "Current state" from memory (prompt change; next round), ChatGPT UI junk in copied answers, README/GIF.

## Done when
- Node tests pass (`notes_store`, `library`, `workflow_prompts`, `project_store`, `workflow_engine`), new tests for
  `readableAnswer` and the Progress line choice.
- `sh test/ui_preview/run.sh` and `sh test/ui_preview/check.sh` pass; preview states updated so the answer dialog
  (rendered) and memory changes are covered; screenshots looked at in the panel width, light and dark.
- Log entry in `doc/log/` and roadmap line.

# Round 2

Seen after round 1 (live, same test project): answers and memory changes now read well. Left:

1. **Memory says less, and only what matters.** The memory update copied the whole study plan into Decisions, so
   Memory repeats the final answer. And "Current state" repeats Progress (built by the extension).
   - New memories have 4 sections: Goal, Preferences, Decisions, Open questions (`SECTIONS`, `emptyMemory`). Old
     memories that still have "Current state" keep working: parse it, keep it in the stored text, but don't ask the
     AI for it and don't show it in the read view (Progress replaces it). Nothing is migrated in storage.
   - Prompts (`TEXT` in `utils/workflow_prompts.js`): `split` Needs list without Current state; `memStyle` →
     "Write every section as short bullet points, one line each; keep the whole memory under 150 words. Decisions
     are choices and settled facts, not the content of answers (the answers are kept elsewhere)."; `resume` →
     "…Decisions are settled; do not re-derive them. Continue from Progress." (Progress is already added by
     `buildResume`; check it is); `memUpdate` adds nothing else. Update `prompts_v2.md` only if it lists these.
   - Tests in `test/workflow_prompts.test.js` / `project_store.test.js` that expect 5 sections: update; add one for
     an old 5-section memory still parsing and rendering without Current state.
2. **"(none)" is not content.** In the memory change list and the read view, treat `(none)` / `- (none)` / empty
   as empty: no "New (none)" item, no struck-through "(none)"; a section going from (none) to items shows only the
   new items. In the read view, empty sections are hidden (keep Goal always).
3. **Dialog titles in plain words**: "Plan · ChatGPT", "Final answer · ChatGPT", "Task: <title> · Gemini",
   "Memory update · ChatGPT", "Message you sent" (instead of "… — full answer from …").
4. **Continue card**: one primary button "Continue in ChatGPT" (main AI) and, under it, a small link
   "or continue in Gemini" (the other AI). No two-line buttons at 380px.
5. **Empty Projects page**: inside the "No projects yet." box add a primary button "Start your first project"
   (opens the new-project form, same as "+ New project") and a muted line "Sign in to ChatGPT or Gemini in this
   browser first; the extension uses your own accounts."

# Round 3

Seen after round 2 (live: new project with Gemini as main AI, Plan → 2 tasks (ChatGPT + Gemini) → Combine →
memory update all worked; memory is now short; answers read well). Left:

1. **Plan card at 380px**: the "Skip — do it in one chat" button text is cut ("…in one ch"). Label it
   "Skip: use one chat" and let action buttons never clip text (wrap the row instead; check every step card).
2. **Progress shows only facts the extension knows.** The first-line summary of each result is unreliable (repeats
   the title, or picks "Missing Context: …"). In `buildProgress`: "Done: <task title> (<AI>)" with no summary
   line; drop the summary-line picker and its tests (keep tests for the rest). Heading in the memory view:
   "Progress" (not "Progress (kept by the extension)"); put "Kept by the extension from the steps above." in the
   heading's `title` tooltip.
3. **The `;;` picker on chat sites must stay on screen.** On ChatGPT's empty temporary chat in a short window
   (~600px tall) the overlay opens above the message box and its top (tabs row) is cut off by the viewport. In
   `utils/autocomplete.js` (site overlay; core in `utils/picker_core.js`): open above when there is room, else
   below; and cap its height to the space available (min ~180px), list scrolls. Same for the inline tray only if it
   has the same issue. Add a check to test/ui_preview/check.js if there is a practical way (a small fake page with
   the input near the top and near the bottom); otherwise a unit-level position function with a test.
4. **Library → Styles intro** in plain words: "Pick how you want answers: short, in Chinese, as a table… In this
   panel use the ≡ Answer button; on a chat site type ;;." (keep it one or two lines).
5. **Notes list preview** shows raw Markdown ("- [ ] reread ch 6 …"). Strip list/check/heading markers
   (`- [ ] `, `- [x] `, `- `, `* `, `1. `, `#`s, `**`) from the one-line preview.

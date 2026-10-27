# Phase 3.2 A+ — picker tabs, Answer chips, memory that makes sense at any moment

Decided with the user on 2026-10-27, after the first live test of Step A. Notes (Step B) are unchanged and come next.

## 1. `;;` picker: tabs on top
- A tab row: `@ Prompts` `≡ Styles` `✎ Notes` `◆ Memory`. Each tab shows a count, and only tabs that have items are shown.
- The list below shows one group only. Styles are listed under small headers (Length · pick one, Language · pick one,
  Format, Approach).
- Keys:
  - ←/→ or Tab/Shift+Tab switch tabs; ↑↓ choose; Space ticks a style; Enter inserts or applies; Esc closes.
  - When a query is typed, a tab with no matches is dimmed; the first tab with matches opens.
- Mouse: click a tab.
- It opens on the last used tab, so someone who mostly uses styles lands there.

## 2. Answer styles as chips
- The button reads `≡ Answer ▾`, or `≡ Answer · 3 ▾` when styles are on.
- Below it (Send) or next to it (Projects), each picked style is shown as a chip with ✕ to remove it.
- The long "Added as the last line: …" preview is removed; the full line is in the chip row's tooltip.
- Chips wrap in the 380px panel.

## 3. Memory
1. **Progress, always fresh, no AI.** Built from project data by `WorkflowPrompts.buildProgress(project)`: the plan,
   each task's status and the first line of its result, Combine, and what's next.
   - It is not stored. It is added at read time to the memory view, the `;;` memory insert and Continue.
   - It is not added to Plan, task, Combine or memory-update messages, which already carry what they need.
2. **AI sections only change at real checkpoints.**
   - Plan: the plan answer may include a ```` ```mem ```` block before ```` ```tasks ```` when it settles preferences,
     decisions or open questions. It is saved as a new version only if the memory didn't change meanwhile.
   - Combine: a chore updates the memory, as today.
   - Tasks don't touch the AI sections; their results are in Progress.
3. **Shorter text**: every section as short bullets, about 250 words in all (memory-update and plan prompts).
4. **Rendered view**: the memory is shown rendered (headings, bullets, bold, links, code) by a small renderer of our own
   that builds DOM (no innerHTML, no dependency). "Edit" switches to the textarea.
5. **"Ask AI to tidy"**: a small link next to Versions / Undo runs a memory-update chore from the done task results.
   It is a way to recover, not part of the normal flow.

## Not now
- Notes (Step B), "AI suggests the next step" (`idea_next_step_suggestions.md`).

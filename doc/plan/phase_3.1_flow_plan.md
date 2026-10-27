# Phase 3.1 Plan — Projects as a step-by-step flow

Written 2026-10-26 after the user's first hand trial of the Projects screen (v0.7 trial, branch `phase-3-projects`).
Agreed in discussion; implement next.

## User feedback (trial)
1. Wants to write one sentence and let the AI do the work, not fill the memory first.
2. ("Need to open ChatGPT first" — turned out to be unfamiliarity; no bug.)
3. "Split into tasks" still looks active after splitting.
4. Next-step buttons are a pile: no linear flow, no "you are here".
5. After running tasks, no next step: where is the aggregation?
6. Why pick an AI both in Next step and in the tasks?
7. Wants the current step highlighted/expanded in Activity.

## Design
One vertical step line replaces the Next-step buttons and the Activity list:

```
 Teach my mom Splendor                 Main AI: ChatGPT ▾
 ✓ 1 Describe      "teach my mom Splendor"
 ✓ 2 Plan          ChatGPT · 2 tasks             (redo)
 ● 3 Run tasks     running 1/2
     ├ Rules guide         Gemini   ✓ result
     └ Teaching session    ChatGPT  ⏳
   4 Combine       merge results into the final answer
   5 Continue      [in ChatGPT] [in Gemini]
 ▸ Memory v1 (AI-updated · see changes)
 ▸ History
```

- **Describe**: new project asks only "What do you want to get done?" (becomes Goal). Memory is written by the AI
  as work goes on; memory card collapsed by default (open to view/edit, history, undo, diff after updates).
- **Plan**: split into tasks on the main AI; option "Skip — do it in one chat" (goes straight to Continue-style chat).
  When done: ✓ with a summary and a small "redo".
- **Run tasks**: task rows under the step, each with its own AI picker (default alternates). Progress shown inline.
- **Combine** (new, the aggregation): main AI, normal chat the user can keep talking in; prompt `%combine` = memory +
  task results → final answer. At the same time the memory update runs automatically as a chore (below). Replaces the
  "Update memory" button.
- **Continue**: two buttons, "Continue in ChatGPT" / "Continue in Gemini" (`%resume` + memory + instruction).
- Done steps fold with ✓; current step expanded + highlighted; future steps grey. The running step shows its live
  status ("Waiting for answer…", "Open chat", "Full answer"). Full step list moves into a collapsed **History**.
- Each step still shows the assembled message (editable) before sending.

## Choosing AIs (three places only)
- **Main AI** (top of the project): Plan, Combine.
- **Per task** (task rows): the provider-switching point.
- **Chores AI** (Settings, default "same as main AI"): memory updates. Runs in a **temporary chat** on both sites so
  chores don't pollute history:
  - ChatGPT: `https://chatgpt.com/?temporary-chat=true` (verified working).
  - Gemini: no URL; click `button[aria-label="Temporary chat"]` on `gemini.google.com/app` after load (verified
    2026-10-26: page shows "Temporary chats don't appear in recent chats…", URL stays `/app`). Add a bridge command
    and a profile selector for it.
  - Temporary chats usually can't be reopened later; the archive keeps the full answer.
- `%fix` stays in the same chat that missed the block.

## Implementation notes
- `workflow_prompts.js`: add `TEXT.combine` + `buildCombine(memory, results, instruction)`; result text is the final
  answer (no block required) — keep it natural language, no parse; archive it.
- Engine: `combine` kind (like resume: show the chat to the user, wait for the answer, archive it), then start a
  `mem-update` chore automatically on the chores AI. Gemini temp chat support in `openChat`.
- Store: project `mainAi`; setting `choresAi` ('same' | 'chatgpt' | 'gemini').
- UI: rewrite `ui/modules/projects.js` render around a step model derived from project state:
  describe → plan (or skipped) → tasks → combine → continue.
- Verify: headless screenshots (light/dark, panel width), then a live run via the harness.

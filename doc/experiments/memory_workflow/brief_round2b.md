# Round 2b browser test brief (writing task)

You play the WorkSpaceManager extension's script plus the user orchestrating chat tabs. Test the prompts in
prompts_v2.md (same folder) on real ChatGPT and Gemini. Write no code.

Browser: Claude in Chrome tools (load with ToolSearch in one call: tabs_context_mcp, navigate, computer, find,
get_page_text, tabs_create_mcp, tabs_close_mcp, javascript_tool, browser_batch). Call tabs_context_mcp with
createIfEmpty first and create your own tabs. ChatGPT: https://chatgpt.com/ in "Chat" mode (never "Work").
Gemini: https://gemini.google.com/u/2/app (always /u/2). The user authorized sending these test prompts. No personal
data, no terms or settings changes; on login wall, CAPTCHA or quota message, stop and report. Close tabs you created.
To send multi-line text: focus the input, insert with javascript_tool document.execCommand('insertText', false, text),
click the send button. Wait until generation finishes, then read only the last answer (get_page_text). Screenshots at
scale 0.5. About 8-10 sent messages total.

Assembled messages: wrapper prompt, then memory sections, then the action/task, then a final "Output requirements:"
line with modifiers (+short) and the %result rule where a block is needed.

Memory v0:
```
# Project: beginner blog post on vector databases
## Goal
Write a ~600-word blog post that explains vector databases to undergrads who know basic Python but not ML.
## Preferences
Friendly tone; one concrete everyday analogy; one tiny code example; no vendor marketing.
## Decisions
(none)
## Current state
Just started.
## Open questions
Which analogy? Which library for the code example?
```

Steps:
1. Split (ChatGPT main chat): %split + memory v0. Parse the tasks block.
2. Dispatch, each in a NEW chat: task 1 on Gemini, task 2 on ChatGPT. Each gets %task + only its Needs sections +
   task + "Output requirements:" +short and %result. Check: Return items kept? links kept? anything after the block?
   did +short work?
3. Memory update in a BRAND-NEW Gemini chat: %mem-update + memory v0 + both result blocks. Check: decisions tagged?
   removed questions explained? anything invented or dropped? sections kept?
4. Resume on the other site, a NEW ChatGPT chat: %resume + updated memory + "Write the full blog post." +
   Output requirements: %result (block = the post title + a 2-line summary); do NOT add +short here. Check: does it continue, or re-derive or question settled decisions?
5. %fix: if any answer broke the block rule, send %fix there and record whether it worked. If none broke, skip.

Log to doc/experiments/memory_workflow/round2b_log.md (same folder): per step the prompt actually sent, the last answer
trimmed to the relevant part (max ~30 lines), whether the block parsed, observations. End with a short comparison to
round 1 (the findings listed at the top of prompts_v2.md) and any prompt wording you would change, as concrete edits.
Final reply ≤ 15 lines.

Extra check for this writing task: in step 4, does the post actually use the analogy and library chosen in memory,
and does it respect every Preference? This task has no web facts, so note how the split and decisions differ from a
search task.

## Context budget (a previous run died with "prompt too long" before writing anything)
- Append to the log file right after EACH step; never keep the log only in your head.
- Never use get_page_text or read_page on chat pages, and take at most one screenshot per step (scale 0.3).
- Read only the last answer with javascript_tool, returning at most 3000 chars:
  ChatGPT: `[...document.querySelectorAll('[data-message-author-role="assistant"]')].pop()?.innerText.slice(0,3000)`
  Gemini: `[...document.querySelectorAll('model-response')].pop()?.innerText.slice(0,3000)`
  If the ChatGPT selector returns nothing, try `[...document.querySelectorAll('article')].pop()?.innerText`.
- Check "still generating" with javascript_tool (a visible stop button), polling every ~8 s, not with screenshots.
- Leftover tabs from the failed run (titles starting "Chicago") may exist: ignore them, and close them at the end.

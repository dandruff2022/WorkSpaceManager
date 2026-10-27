# Idea: AI suggests the next step (not started; discuss after Phase 3.2 Step A)

Raised by the user on 2026-10-27.

## The idea
The flow is fairly fixed today: Plan (split) → Run tasks → Combine → Continue. Instead, each prompt we send (and
maybe the memory) asks the AI to also say what it would do next, chosen from the actions the user can take at that
point. The worker chat gives it, and sometimes the chores chat does too (memory update). The UI then adapts: for
example it highlights the suggested button.

## First thoughts (Claude)
- It fits "the user owns the workflow": the AI suggests, the user decides. It should only highlight, never run
  anything by itself.
- Give the AI a closed list of the actions allowed right now (e.g. `split`, `run-task <id>`, `redo-task <id>`,
  `add-task`, `combine`, `continue`, `ask-user`) and ask for a small fenced block, e.g. ```` ```next ````, with an
  action and a one-line reason. This is easy to parse and check, and has the same shape as `tasks` / `result` / `mem`.
- Store the suggestion on the step (`steps[].next`), not in memory. Memory holds lasting facts, and a suggestion is
  stale after the next step. "Open questions" in memory already covers what is undecided.
- Things to settle: the cost (extra words in every answer, and possible parse failures), what to show when the worker
  and the chores chat disagree, and whether it replaces the fixed order or only re-orders and highlights it.
- A cheap first try: only the Combine and task answers return `next`, and the UI highlights the suggested button and
  shows the reason as a tooltip.

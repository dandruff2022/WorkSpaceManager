# Script prompts v2 (after round 1)

Round 1 findings that drove these changes: memory update promoted worker proposals to decisions, silently removed an
open question and used earlier chat context; result blocks dropped candidates and links (120-word cap vs 3 items);
Gemini added a follow-up question after the block; "short" in Preferences was ignored.

- %result (format rule appended to any prompt that needs a hand-off):
  "End your answer with exactly one fenced block labeled result. Put nothing after it, no follow-up question."
- %split:
  "Split this project into at most 2 independent subtasks for separate fresh chats. Explain briefly, then end with one
  fenced block labeled tasks: tasks separated by a line ===, each with Title:, Task: (self-contained), Needs: (section
  names from: Goal, Preferences, Decisions, Open questions), Return: (what the hand-off must keep,
  including source links)."
- %task (header for a sub-agent):
  "You handle one subtask of a larger project. Use only the context below; if something essential is missing, say so.
  In the result block keep every item listed in Return, with source links and what you could not verify."
- %mem-update (always sent in a brand-new chat):
  "Update the project memory using ONLY the old memory and the new material below; ignore anything else. Output only
  one fenced block labeled mem with the same headings. Mark each new decision with 〔AI · basis: …〕. If you remove an
  open question, add one line saying why. Leave everything else unchanged."
- Memory style (appended to %mem-update):
  "Write every section as short bullet points, one line each; keep the whole memory under 150 words. Decisions
  are choices and settled facts, not the content of answers (the answers are kept elsewhere)."
- %resume:
  "This is the memory of a project done in other chats. Decisions are settled; do not re-derive them. Continue from
  Progress."
- %fix:
  "Your last answer did not end with the required fenced block labeled X. Output only that block now, nothing else."
- +short (modifier, appended at the end under "Output requirements:"):
  "Keep the answer under 150 words outside the block."

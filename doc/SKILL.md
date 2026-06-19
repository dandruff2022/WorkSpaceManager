---
name: code-edit-report
description: Keep a concise project report/log whenever Codex creates, edits, deletes, refactors, fixes, formats, tests, or otherwise changes code or code-adjacent project files. Use for any coding task that modifies source files, tests, configuration, build scripts, generated assets, documentation tied to code changes, or repository structure so the log records the goal, timing, changes, findings, validation, conclusion, next work Codex can continue, points for human reflection, and required human action.
---

# Code Edit Report

## Core Rule

Append a code-edit report entry for every task that changes files in a code workspace. Use a readable work-session report, similar to an engineering or research notebook, rather than a terse change ledger. Treat the report as human-readable project memory, not as a substitute for git history.

For tiny edits, one completed entry before the final response is enough. For long, risky, or interrupted edits, add a planned or checkpoint entry first, then add a completed entry when the work finishes.

## Log Location

Use the first applicable location:

1. Continue an existing project edit log if one is already present.
2. Use `doc/log/{edit start timestamp YYYY_MM_DD_HH}.md` at the workspace, create log folder if needed.

Do not store secrets, tokens, private keys, or large diffs in the log. Summarize sensitive findings without copying sensitive values.

## Required Entry Fields

Every completed entry must include:

- Goal: what the user wanted or what problem the edit addressed.
- Timing: local start and end times when known. Include the timezone and duration when practical.
- Status: planned, checkpoint, or completed.
- What changed: files created, changed, or deleted, with a short behavioral summary for each.
- What was found: important facts discovered while reading, testing, or debugging.
- Validation: commands or checks performed and their results. Say why validation was skipped when it was not run.
- Conclusion: what changed and whether the goal is satisfied.
- Next steps - Codex can proceed: concrete follow-up work Codex can perform without additional human input. Use "None" when no autonomous continuation is useful.
- Next steps - Human reflection: questions, tradeoffs, or observations worth human consideration, even when no immediate action is required. Use "None" when there is nothing meaningful to reflect on.
- Human action: what the human should review, run, approve, provide, or decide. Use "None" only when no human action is needed.

Keep human reflection distinct from human action. Reflection supports judgment; human action records a concrete request or dependency.

## Workflow

1. Before editing, identify the user's goal in one sentence, capture the local start time, and decide whether the task needs a planned/checkpoint entry.
2. Make the code changes using normal repository practices.
3. Inspect the actual changed files before logging. Prefer `git status --short` plus your own summary.
4. Record validation evidence and separate autonomous next work from human reflection and required human action.
5. Append a completed log entry before the final response.
6. Mention the log path in the final response when the skill created a new log or used a fallback path.

## Script

Prefer the bundled script for consistent formatting:

```bash
python scripts/append_code_edit_log.py \
  --title "Login redirect correction" \
  --goal "Fix login redirect after session expiry" \
  --started-at "2026-06-19 09:15:00 CDT" \
  --modified "src/auth/session.ts: refreshed redirect handling" \
  --modified "tests/auth/session.test.ts: added expired-session case" \
  --found "The expired-session branch returned before storing the target URL." \
  --validation "pytest tests/auth/session.test.ts: passed" \
  --conclusion "Redirect now preserves the intended destination." \
  --next-codex "Run the full auth test suite." \
  --reflect "Consider whether all authentication redirects should preserve query parameters." \
  --human "Review the login redirect behavior in staging." \
  --git-status
```

Resolve `scripts/append_code_edit_log.py` relative to this skill directory. Run it from the workspace root unless the user or repository clearly uses another root.

Use repeated flags for multiple values:

- `--modified`
- `--found`
- `--validation`
- `--next-codex` (preferred; `--next` remains an alias)
- `--reflect`
- `--human`

Useful optional flags:

- `--status planned|checkpoint|completed`
- `--title "Work session title"`
- `--started-at "YYYY-MM-DD HH:MM:SS TZ"`
- `--duration "8m 34s"`
- `--log path/to/log.md`
- `--timezone America/Chicago`
- `--git-status`

## Manual Fallback

If the script cannot run, append this Markdown shape manually:

```markdown
## Work session title

- Status: completed
- Start local time: YYYY-MM-DD HH:MM:SS TZ
- End local time: YYYY-MM-DD HH:MM:SS TZ
- Duration: 8m 34s

### Goal

- One-sentence goal.

### What changed

- path/to/file: what changed

### What was found

- Important discovery

### Validation

- Command or check: result

### Conclusion

- What is true now.

### Next steps

**Codex can proceed:**

- Autonomous follow-up work or None

**Human reflection:**

- Question, tradeoff, or observation to consider, or None

### Human action

- Review, run, approve, provide, decide, or None
```

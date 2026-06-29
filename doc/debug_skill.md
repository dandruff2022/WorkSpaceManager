---
name: quick-debug-loop
description: Rapid iterative debugging using human-in-the-loop visual checkpoints, instrumentation-first validation, and incremental isolation. Activate when diagnosing failures in browser extensions or multi-context web automation.
---

# Quick Debug Skill

**Terminology:**
- **Edit journal**: The persistent project history that records what was attempted, what worked, and what was ruled out (e.g., `doc/log/` entries).
- **Debug report**: The diagnostic output displayed in a popup modal overlay. The user clicks the copy button in the modal and pastes the report back to the agent as prompt context.

## 1. Visual Debug Loop

When debugging browser-facing features, wire up a **button → script → report → copy → paste** feedback cycle:

1. Provide an interactive button in the UI that executes the debug/test script on click.
2. The script collects diagnostics and displays a modal overlay with a formatted debug report and a one-click copy button.
3. The user copies the debug report and pastes it back to the agent as prompt context.
4. The agent compares the new debug report against the previous one to determine what changed, what didn't, and what to try next.

This loop replaces blind guessing with observable evidence. Each cycle should produce a debug report that is different from the last — if it isn't, the instrumentation is insufficient (see §4).

**Concrete patterns from this project:**
- `SandboxTester` uses `confirm()` dialogs as lightweight visual checkpoints between automated steps so the user can verify DOM state before the script proceeds.
- `displayConfigModal()` renders the popup modal overlay with a read-only textarea and a one-click copy button — this is the primary debug report delivery mechanism.
- `handleFailure()` aggregates all diagnostic context into the popup modal so the full error summary is copyable in one action.

## 2. Escalation Flow — Think First, Search Last

Follow this order strictly:

1. **Think hard locally.** Read the code, read the debug report, and reason about the root cause before touching anything.
2. **Add instrumentation.** Update the debug report content surfaced in the popup modal to validate or invalidate the hypothesis. Supplement with `console.log` statements for detailed traces when needed, but ensure key diagnostics appear in the copyable popup report. Give this to the user to test.
3. **Compare debug reports.** When the user provides the new debug report, compare it against the previous one. Identify what moved, what stayed the same, and refine the hypothesis.
4. **Repeat steps 1–3.** Most issues can be solved through local reasoning and better instrumentation without external research.
5. **Search online only when stuck.** Only search the web after multiple rounds have failed to identify the issue, or when the agent has a specific guess that needs external confirmation (e.g., a browser API quirk, a CSP rule). Do not search speculatively.
6. **Fix only when confident.** Whether the root cause was found locally or via search, only write a fix implementation when the agent is highly confident and the guess has been validated through instrumentation.

## 3. Instrumentation vs. Fix Changes

These are fundamentally different types of edits:

- **Instrumentation changes** (adding/updating `console.log`, debug report fields, diagnostic alerts): Multiple instrumentation changes can be batched in a single round because they are non-destructive print statements that do not conflict with each other.
- **Fix changes** (modifying logic, selectors, control flow, world targets): Strictly one fix per round. Each fix targets a single hypothesis. This separation ensures we can precisely attribute success or failure to that specific change.

Never mix multiple fix hypotheses in one round. If a round contains a fix, the debug report from that round validates or invalidates exactly that one fix.

## 4. Instrumentation First, Fix Second

- Before writing any fix, add at least one instrumentation statement that would confirm or deny the assumption behind that fix.
- Only implement a fix once the debug report validates the root cause.
- If the debug report hasn't changed across multiple attempts, **stop fixing and improve the instrumentation.** Unchanging debug reports mean the instrumentation isn't observing the right thing — the agent is guessing instead of testing.

**Structured instrumentation rules:**
- Tag every output with its source context: `[SandboxTester]`, `[ConnectionModule]`, `[ContentScript]`, etc.
- Use severity levels: `[INFO]` for flow, `[DEBUG]` for state dumps, `[WARN]` for fallbacks, `[ERROR]` for failures.
- Use `console.group()` / `console.groupEnd()` to nest multi-step operations.
- Use `%c` styling to visually distinguish success (green), warnings (orange), and errors (red) in the console.

## 5. Quick Cycles — One Hypothesis Per Round

1. Form one hypothesis about the root cause.
2. Add instrumentation to confirm or deny that hypothesis. Do not write a fix yet.
3. Run the visual debug loop. Read the new debug report.
4. If the hypothesis is confirmed, write a minimal fix targeting only that cause.
5. If the hypothesis is denied, note it as ruled out in the edit journal and move to the next candidate.

**Boundary probing**: Browser extension workflows cross multiple execution contexts (Extension UI → Background Service Worker → Content Script → Page Main World). When a feature fails, probe each boundary with a simple echo/heartbeat before assuming the bug is in application logic. Verify the message even arrives before debugging what happens after.

## 6. Code Cleaning & Record Keeping

- **Rollback failed fixes immediately.** If a change doesn't resolve the issue, revert it before trying the next thing. Stale experimental code accumulates and obscures the real problem.
- **CRITICAL: Keep the edit journal, discard the code.** Every single attempt — successful or failed, correct or incorrect — MUST be recorded in the edit journal (`doc/log/`) immediately in the same turn it is executed. The edit journal is the persistent memory of the project; keeping it up-to-date for every trial is a strict requirement.
- **Short leash on unclear fixes.** If it's ambiguous whether an approach works after one or two iterations, revert and try a different angle.

---
name: running-agent-verify
description: Run the project's quick verification suite and interpret the results. Use after implementing any backend code, before marking a task as complete, when checking if the codebase is in a valid state, or before emitting a handoff. Runs lint, type-check, and unit tests and returns a structured pass/fail report.
---

Run the verification suite and report results in a structured format that the orchestrator and other agents can act on.

## Command

```bash
rtk npm run agent:verify:quick
```

If `rtk` is not available, fall back to:
```bash
npm run agent:verify:quick
```

## Interpreting Output

### PASS

All three checks pass: lint, type-check, and unit tests. Report:

```
✅ verify:quick PASS
- Lint: 0 errors, 0 warnings
- Type-check: 0 errors
- Tests: N passed, 0 failed (Xs)
```

Set `self_check.tests_run: true, tests_passed: true` in the handoff.

### FAIL — Classify the Error

**TypeScript errors** (`TS2XXX`):
```
❌ verify:quick FAIL — TypeScript
- src/modules/trips/service.ts:45 — TS2345: Argument of type 'string' is not assignable to parameter of type 'TripStatus'
Action required: fix type error before proceeding
```

**Lint errors** (ESLint):
```
❌ verify:quick FAIL — Lint
- src/modules/trips/service.ts:89 — no-explicit-any: Unexpected any
Action required: replace with specific type
```

**Test failures**:
```
❌ verify:quick FAIL — Tests
- FAIL src/modules/trips/__tests__/trips.service.test.ts
  ✕ should throw INVALID_TRIP_TRANSITION (23ms)
    Expected: "INVALID_TRIP_TRANSITION"
    Received: "TRIP_NOT_FOUND"
Action required: fix test or fix implementation
```

## What to Do with Results

- **PASS** → set `self_check.tests_passed: true`, proceed to next step
- **FAIL** → do NOT emit the handoff, fix the issue first, re-run verify
- **FAIL after 2 fix attempts** → emit handoff with `status: "failed"`, include the raw error in `self_check.details`

## Never

- Never emit a handoff with `self_check.tests_run: true` without actually running this command
- Never mark a task complete if verify:quick fails
- Never skip verify to save time — a broken codebase blocks every other agent

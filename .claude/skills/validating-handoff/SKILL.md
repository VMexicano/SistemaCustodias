---
name: validating-handoff
description: Validate that an agent handoff JSON contains all required fields and correct values before it is passed to the next agent. Use when an agent has finished its work and is about to emit a handoff, or when the orchestrator receives a handoff and needs to verify it. Rejects incomplete handoffs immediately with a specific error message so the emitting agent can correct them.
---

A handoff is the only communication channel between agents. A missing `self_check` or an undefined `status` means the orchestrator cannot act correctly — it either skips a human-in-the-loop checkpoint or dispatches to the wrong agent. Validate before passing.

## Required Fields — All Agents

Every handoff must have all of these, regardless of agent:

```
agent         — one of: planner | architect | backend | qa | mobile | devops
task_id       — format: {MODULE}-{NNN} (e.g. TRIPS-001, SPRINT-1-PLAN)
task_type     — one of: FEATURE | QA_ONLY | HOTFIX | MIGRATION
phase         — one of: planning | implementation | qa | deploy | retrospective
status        — one of: completed | partial | failed | blocked | waiting_dependency
self_check    — object with: tests_run (bool), tests_passed (bool), details (string)
artifacts     — array of strings (may be empty [], never null or missing)
next_agent    — string or null (never missing)
notes         — non-empty string (minimum one sentence)
```

## Validation Rules

### `self_check` validation

```
tests_run must be boolean (not string "true")
tests_passed must be boolean
details must be a non-empty string

IF agent is backend, qa, or devops:
  tests_run must be true
  (if false → reject: "backend/qa/devops must run tests before emitting handoff")

IF agent is planner or architect:
  tests_run may be false, but details must explain why
  (acceptable: "Planner does not execute code. Checklist validated at 100%.")
```

### `status` + `self_check` consistency

```
IF status is "completed":
  self_check.tests_passed must be true
  (if false → reject: "status 'completed' requires tests_passed: true")

IF status is "partial":
  self_check.tests_passed must be false
  coverage object must be present (for qa agent)

IF status is "failed":
  self_check.details must describe the specific error
  (if details is generic like "error occurred" → reject: "provide specific error in details")
```

### Optional fields — validate when present

```
waiting_for: must have agent, artifact, task_id — all non-empty
unblocks: must be array of task_id strings
irreversible_flags: must be array of strings from: [pricing_snapshot, db_migration, schema_change]
unplanned_dependency: must have requires and impact — both non-empty strings
coverage (qa agent): each value must be a number 0-100
feedback (qa agent, partial status): must have iteration (1-3), max_iterations (3), gaps (array)
```

## Rejection Format

When a handoff fails validation, return this to the emitting agent:

```
❌ HANDOFF REJECTED — {agent}

Missing or invalid fields:
- {field}: {specific problem}
- {field}: {specific problem}

Required action: correct the above and re-emit the handoff.
The orchestrator will not accept this handoff until all fields are valid.
```

## Acceptance Format

When a handoff passes validation:

```
✅ HANDOFF VALID — {agent} | {task_id} | {status}

Routing to: {next_agent}
Irreversible flags: {list or "none"}
Human-in-the-loop required: {yes — reason | no}
```

## Human-in-the-loop Triggers

Flag these for the orchestrator automatically:

```
irreversible_flags is non-empty               → pause before devops
status is "blocked"                           → immediate human escalation
unplanned_dependency is present               → immediate human escalation
qa handoff with status "partial", iteration 3 → human escalation with debt report
```

## Quick Reference — Common Mistakes

| Mistake | Correct |
|---|---|
| `"tests_run": "true"` (string) | `"tests_run": true` (boolean) |
| `"artifacts": null` | `"artifacts": []` |
| `"next_agent": ""` | `"next_agent": null` |
| Missing `notes` field | `"notes": "Task complete. No blockers."` |
| `status: "done"` | `status: "completed"` |
| `status: "pass"` | `status: "completed"` |
| `irreversible_flags: "pricing_snapshot"` (string) | `irreversible_flags: ["pricing_snapshot"]` (array) |

---
name: evaluating-test-coverage
description: Run test coverage analysis and evaluate results against project-defined thresholds. Use when the QA agent needs to determine if coverage requirements are met, identify specific coverage gaps with file locations, or generate structured feedback for the backend agent in the Generator loop. Returns pass/fail per module and a prioritized list of uncovered branches.
---

Coverage is not a vanity metric in this project. TripStateMachine at 99% means one branch of trip cancellation is untested in production. Evaluate with that severity in mind.

## Command

```bash
rtk npm run test:coverage
```

## Thresholds — Hard Limits

| Module | Lines | Branches | Status if below |
|---|---|---|---|
| `TripStateMachine` | **100%** | **100%** | FAIL — no exceptions |
| `PricingEngine` | **100%** | **100%** | FAIL — no exceptions |
| `PaymentService` | **95%** | **90%** | FAIL |
| Global (all files) | **75%** | **70%** | FAIL |

A module at 99.9% on TripStateMachine is a FAIL. There is no rounding up.

## Reading the Coverage Report

The command produces a per-file table. For each file below threshold:

1. Note the file path and current percentages
2. Look at the "Uncovered Lines" column — these are the specific line numbers
3. Read those lines in the source file — identify the branch or function
4. Map the uncovered code to a test case description

## Structured Feedback Format (for Generator loop)

When coverage fails, produce this exact format for the backend agent:

```markdown
## Coverage Gaps — {module} | Iteration {N}/3

### Summary
- TripStateMachine: {X}% lines, {Y}% branches (umbral: 100%/100%) ❌
- Global: {X}% lines (umbral: 75%) ✅/❌

### Gaps — ordered by priority

#### [CRÍTICO] {file path}:{line range}
**Qué no está cubierto:** {branch condition or function name}
**Regla de negocio relacionada:** {R-XXX-YYY from business-rules.md, if applicable}
**Test sugerido:**
```typescript
it('{should description}', async () => {
  // Arrange
  // Act
  // Assert
});
```

#### [MEDIO] {file path}:{line}
...

### Diagnóstico
{Is this a missing test, or missing implementation? Be specific.}
{Example: "Lines 145-162 have no tests because the function was added after the test suite was written."}
{Example: "Branch at line 89 is unreachable — the guard at line 71 already handles this case. This may be dead code."}

### Iteraciones
- Esta iteración: {N}
- Restantes: {3-N}
- Si iteración 3 falla: escalar al humano con este reporte
```

## Pass Report Format

When all thresholds are met:

```markdown
## Coverage PASS — {module}

| Module | Lines | Branches | Status |
|---|---|---|---|
| TripStateMachine | 100% | 100% | ✅ |
| PricingEngine | 100% | 100% | ✅ |
| PaymentService | 96% | 91% | ✅ |
| Global | 78% | 73% | ✅ |

All thresholds met. Module approved.
```

Set `status: "completed"` and `self_check.tests_passed: true` in the handoff.

## Diagnosing Persistent Gaps

If iteration 3 is reached without convergence, the gap is likely not a missing test but a structural issue:

- **Untestable code** — function has no injectable dependencies, making mocking impossible
- **Dead code** — branch that can never be reached given the current business logic
- **Missing implementation** — the test reveals that a business rule hasn't been coded yet

Report the diagnosis to the human with a recommendation: fix the code structure, delete the dead code, or implement the missing logic.

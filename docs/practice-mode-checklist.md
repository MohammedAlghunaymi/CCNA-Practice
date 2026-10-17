# Practice mode — build checklist (complete)

Source plan: `C:\Users\Admin\AppData\Local\Temp\opencode\practice-plan.md`.
Council: 4 cycles. All 15 earlier criticals confirmed closed; the 8 Cycle-4
criticals were fixed before any code was written.

Outcome: 470 tests across 22 files (baseline 384 / 15).

## P1 — restructure, landing page stops lying
- [x] Move Home.jsx + Exam.jsx under src/features/
- [x] Add src/lib/bank.js (BANK, BY_ID, byDomain, counts)
- [x] Add PracticeHome + LearnMode stubs
- [x] AppRouter: hoisted `routes` in router/routes.jsx, four routes
- [x] Home: live counts + distinct suffixes, /practice CTA, tile retitle
- [x] Rewire Exam.jsx specifiers to bank.js
- [x] Repoint tests (exam :5 :329, preamble :4, rationale :2 :10)
- [x] check-anti-rot: :43 fail-closed, Gate 2 scoped, :45-46 deleted, comments
- [x] docs/PROJECT.md 7g layout
- [x] New tests: bank.test.js, home.test.jsx, router.test.jsx
- [x] Commit `36b311c`

## P2 — PracticeHome category index
- [x] Six cards in counts order, live counts, links
- [x] tests/practiceHome.test.jsx
- [x] Commit `e694a01`

## P3 — LearnMode pager + the reveal (P4 folded in)
- [x] Pager, empty-domain guard, non-MCQ fallback, clamped nav, h1
- [x] revealedIds Set, options disabled once revealed
- [x] Verdict via isCorrectSet, written to storage
- [x] src/lib/progress.js — merge-on-write, null-safe, domain-scoped cursor
- [x] rationaleToShow(option) shared with Exam.jsx Result
- [x] tests/learnMode.test.jsx, tests/progress.test.js,
      tests/learnMode.injected.test.jsx, tests/rationale.test.js
- [x] Commit `dc78ed4`

## P5 + P6 — progress on the index, and "most missed"
- [x] Per-domain `N of M answered`, counted by each question's own domain
- [x] Reset control, two presses, removeItem
- [x] Panel rows `missed w of a answered`, rate-sorted, capped at 5
- [x] Header `k of the N this bank covers`, empty state
- [x] tests/practiceHome.test.jsx (11 + 8 cases)
- [x] Commit (see git log)

## Deviations from the plan, and why
1. **`progress.js` and the reveal moved forward into P3.** Every part of the
   record is consumed by `LearnMode`, and a "Show answer" button with nothing to
   reveal is not a shippable commit. P4 is folded in; P6 is what remained.
2. **P5 and P6 committed together.** Both are one panel on one page; splitting
   would ship a reset button whose purpose nothing on screen yet explains.
3. **The pager prints per-option verdict markers.** They are the reveal itself,
   matching `Exam.jsx`'s review. What stays absent is every aggregate: no score,
   no percentage, no timer.
4. **`rationaleToShow` takes one argument**, not `(option, isCorrect)`, so the
   caller cannot pass the same fact twice under two names.

## Known, deliberate
- `validate:bank` 10/14 and `validate:review` 0/1 stay red. Only 1 of the 4 bank
  failures is placeholder-rationale work; the other 3 need new questions. That is
  Track 2 content, not this work.
- Per-option rationales render for nothing today: all 507 wrong options hold the
  placeholder and none of the 170 correct options carries one. The path is built
  and the injected test proves it fires.
# Practice mode — build checklist

Source plan: `C:\Users\Admin\AppData\Local\Temp\opencode\practice-plan.md` (final, 8
Cycle-4 criticals applied). Council: 4 cycles, all earlier criticals confirmed closed.

Status key: `[ ]` open `[~]` in progress `[x]` done

## P1 — restructure, landing page stops lying, nothing breaks
- [ ] Move Home.jsx + Exam.jsx under src/features/
- [ ] Add src/lib/bank.js (BANK, BY_ID, byDomain, counts)
- [ ] Add PracticeHome + LearnMode stubs
- [ ] AppRouter: hoisted `routes`, four routes
- [ ] Home: live counts + distinct suffixes, /practice CTA, tile retitle
- [ ] Rewire Exam.jsx specifiers to bank.js
- [ ] Repoint tests (exam :5 :329, preamble :4, rationale :2 :10)
- [ ] check-anti-rot: :43 fail-closed, Gate 2 scoped, :45-46 deleted, comments
- [ ] docs/PROJECT.md 7g layout
- [ ] New tests: bank.test.js, home.test.jsx, router.test.jsx
- [ ] Gates green
- [ ] Commit P1
  - [ ] Repo matches (`git rev-parse --show-toplevel` = ccna-practice)
  - [ ] Verification actually ran, with real results, or `Verified: none - <reason>`
  - [ ] Foreign hunks in files I edited, named before staging
  - [ ] Stage exact paths (`git add -- <path>`), never `-A`
  - [ ] Style matched from `git log --oneline -20 --format=%s`
  - [ ] Commit, then push to the tracked upstream
  - [ ] Report short hash and `git show --stat`

## P2 — PracticeHome category index
- [ ] Six cards in counts order, live counts, links
- [ ] tests/practiceHome.test.jsx
- [ ] Gates green
- [ ] Commit P2 (same sub-steps)

## P3 — LearnMode pager
- [ ] Pager, empty-domain guard, non-MCQ fallback, clamped nav
- [ ] revealedIds Set, options disabled once revealed
- [ ] Verdict via isCorrectSet, written silently
- [ ] tests/learnMode.test.jsx (reveal lifecycle, revisit, writes, mcq-multi, cursor)
- [ ] Gates green
- [ ] Commit P3 (same sub-steps)

## P4 — reveal
- [ ] rationaleToShow(option) in src/lib/rationale.js
- [ ] Result refactored to call it
- [ ] tests/rationale.test.js synthetic cases
- [ ] tests/learnMode.injected.test.jsx
- [ ] Gates green
- [ ] Commit P4 (same sub-steps)

## P5 — progress
- [ ] src/lib/progress.js: read/write/clear, PRACTICE_SCHEMA_VERSION
- [ ] read-modify-write, null-safe
- [ ] Domain-scoped cursor, cumulative answers
- [ ] PracticeHome fraction + reset control
- [ ] tests/progress.test.js
- [ ] Gates green
- [ ] Commit P5 (same sub-steps)

## P6 — most missed, provenance, objective
- [ ] Panel rows, rate sort, k/N header, empty state
- [ ] Provenance line on LearnMode
- [ ] tests/practiceHome.test.jsx additions
- [ ] Gates green
- [ ] Commit P6 (same sub-steps)

## Session end
- [ ] Append entry to C:\Users\Admin\opencode-work\Important\SESSION-HISTORY.md
- [ ] Commit + push memory repo
# Growing the bank

> Two procedures: adding a rung to the question ladder, and migrating to the
> next blueprint. Both are config-only by design. Neither needs a redesign, and
> neither should ever be done by hand-editing a generated table.

## Why this file exists

The bank starts at 60 questions and the ladder runs to 600. That growth must not
turn into a rewrite every time a rung is added, and it must not quietly let the
project outgrow what it has verified. So both the allocation and the coverage
minimums are **generated and frozen**, and every procedure below is a config edit
followed by a regeneration you are expected to read as a diff.

## Adding a rung

The ladder is currently:

| Milestone | Questions | Per-topic minimums | Each question seen |
|---|---|---|---|
| pilot | 60 | 1 everywhere (documented exception) | n/a |
| v1 | 300 | 1–3, balanced | 30.0–35.2% |
| later | 450 | 2–5, balanced | 20.7–23.8% |
| frontier | 600 | 3–8, balanced | 16.1–17.1% |

To add one, for example 900:

1. **Add the milestone** to `src/config/bank.config.json`:

   ```json
   "beyond": {
     "target": 900,
     "floorPerObjective": 4,
     "examLength": 100,
     "scope": "all",
     "description": "…"
   }
   ```

   `floorPerObjective` is the minimum for the **reference domain** — the one with
   the worst weight-to-topic ratio, Network Fundamentals at 20% weight across 35
   topics. Every other domain is scaled from it.

2. **Add the matching floors row** to `config.floorsByMilestone`. Compute it
   with the formula rather than by eye:

   ```js
   import { balancedFloors } from './src/lib/allocation.js'
   balancedFloors({ leafs, weights, floorPerObjective: 4 })
   ```

   Floors are stored explicitly rather than derived at read time on purpose. The
   arithmetic form makes the knob inert — `round(2 × 1.75 × 0.1 / 20)` is `0`,
   so most cells would round to zero and silently disable coverage for that
   domain. Storing them keeps the intent reviewable, and
   `scripts/allocate-bank.mjs` re-derives and **rejects the build** if the stored
   row disagrees with the formula.

3. **Regenerate and read the diff:**

   ```bash
   node scripts/allocate-bank.mjs --force
   node scripts/allocate-bank.mjs --check   # verify without writing
   ```

   The script refuses to run without `--force` when the frozen allocation would
   change, because silently relabelling a whole bank mid-milestone is exactly the
   churn that guard exists to prevent.

4. **Confirm supply meets demand.** The script exits non-zero if any domain holds
   fewer questions than its draw quota for the milestone's `examLength`.
   `validateBank` check 10 enforces the same invariant in CI. A rung whose
   floors overshoot its target fails at step 3 rather than shipping.

5. **Run the gates.** `npm test` and `npm run validate:bank` at the new milestone.

### Sizing the authoring work

The cost model is per question, so a rung's cost is `(target − current) × 13–19
minutes`. That figure covers authoring, documentation cross-check **and** review
together; do not add review time on top of it. A 300-question rung beyond the
pilot is therefore roughly 52–76 h, or 13–19 four-hour sessions.

Add a **mid-block checkpoint** at roughly half the rung. An interrupted
300-question run should still leave a bank that draws cleanly rather than one
that only satisfies its gates on the final batch.

### What the ladder does not fix

Balancing holds the spread between domains to roughly 1.2×; a uniform floor left
it at 1.9× and **size alone never closes that gap**, because it is a ratio of
topics to exam weight rather than a function of bank size. If variety in
Security Fundamentals or IP Connectivity ever matters more than coverage of
Network Fundamentals, raise those domains' floors above the balanced curve rather
than adding questions uniformly.

## Migrating to the next blueprint

The v1.1 blueprint ends **2027-02-02** and v2.0 begins **2027-02-03**. When Cisco
publishes the v2.0 exam topics, `src/data/objectives.json` becomes a
versioned file and the active blueprint becomes a switch.

1. **Add `src/data/objectives.v2.0.json`** alongside the existing file, with
   `meta.blueprintVersion: "2.0"`. Paraphrase every description and cite the v2.0
   PDF in `meta.blueprintSource`.
2. **Count the topics honestly.** The number in `meta.leafCount` is the
   **leaf-only** count: lettered sub-objectives and unlettered leaf objectives
   each count once; non-leaf parents are containers and do not count. The current
   file holds 97 leaves, 14 non-leaf parents and 111 nodes total. `validateBank`
   check 11 fails a declared count that disagrees with the data, so a miscount
   cannot reach a milestone.
3. **Add a milestone per exam version.** v2.0 gets its own rung rather than
   rewriting `v1`'s target, so the v1.1 bank stays verifiable against the
   blueprint it was written for.
4. **Re-run the allocation and read the diff.** A changed topic count changes
   every floor contribution, so the per-domain totals move even when the target
   does not.
5. **Reconcile the documentation.** `npm run validate:docs` fails unless
   `PROJECT.md` enumerates every topic in the active blueprint and the generated
   appendix is current. Removed topics must be deleted, not left behind.

### Graded inferences to re-verify at v2.0

These are the claims in `PROJECT.md` §6 that are **not** anchored to an official
Cisco statement, and each should be re-checked rather than assumed to carry over:

- **(b) one-way navigation for multiple-choice and drag-drop items.** Cisco
  publishes the no-return rule for performance-based lab items only
  (`blogs.cisco.com/learning`, 2022-07-07). The extension to the MCQ engine is an
  inference, and both the Cisco and Pearson VUE candidate-rules agreements are
  silent on navigation entirely. A v2.0 candidate handbook stating the rule
  directly would upgrade this from inference to published fact.
- **(d) absence of flag-for-review and of a pre-submit review screen.**
  Community-reported only.
- **(e) the "proficiency" label and the six-domain mapping** of the score report.
  Cisco publishes that a per-section breakout exists; the wording and the mapping
  are not published.
- **IP Services hands-on.** Currently deferred, and the reason is recorded as an
  effort decision rather than a blueprint fact: the v1.1 blueprint *does* give
  domain 4 three configure-and-verify objectives (4.1 NAT, 4.2 NTP, 4.6 DHCP
  client and relay), plus 4.8 SSH which is configure-only. Adding IPS hands-on
  means giving it a non-zero cell in the N=100 matrix, which changes every
  domain's draw quota and cascades through the whole allocation — so it is a
  deliberate change, not a correction. Automation stays excluded on a factual
  basis: 6.5, 6.6 and 6.7 carry no configure-and-verify verb.

## What the ladder guarantees, and what it does not

The bank guarantees **coverage**, not novelty. At 600 questions an individual
question still appears in roughly 16–17% of sittings, so repeated questions
between attempts are expected and disclosed rather than papered over. At any rung
a small residual share of items may carry a wrong answer key; with one maintainer
reviewing their own work this is a process guarantee, not expert sign-off.
# CCNA 200-301 v1.1 Practice Simulator

A practice and exam simulator for the **CCNA 200-301 v1.1** exam. The goal is
that the format, pressure and navigation match the real thing: 120 minutes,
one-way navigation, auto-submit, all four of Cisco's published item types, and
hands-on tasks where you configure a device yourself.

> **Status: early build.** The scaffold, blueprint dataset, allocation engine and
> all eight blocking gates are in place, along with a **169-question bank** and a
> working **20-question practice exam**. The full exam-day experience — timing,
> reload-safe progress, drag-drop and hands-on grading — is not built yet. See
> [`docs/PROJECT.md`](docs/PROJECT.md) for the full plan and current phase, and
> [`docs/GROWTH.md`](docs/GROWTH.md) for what still blocks the 60-question pilot.

## Legal

This project is **not affiliated with or endorsed by Cisco Systems, Inc.**
CCNA is a registered trademark of Cisco Systems, Inc.

**No Cisco exam content is reproduced.** Objective IDs, domain names and domain
weights are taken from the [publicly published exam
blueprint](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf)
as short factual labels; objective descriptions are paraphrased here rather than
copied.

### Where the questions come from

The current 169-question bank is **not original work**. It was adopted from
[`Onesayi/ccna-simulator`](https://github.com/Onesayi/ccna-simulator) at pinned
commit [`6efca4f`](https://github.com/Onesayi/ccna-simulator/tree/6efca4f15e8ccf01fb44973b46bb26922797965a),
an MIT-licensed project. Each question was re-keyed to this project's v1.1
blueprint objective ids and given a written explanation for its correct answer.

- Every question carries an `upstream` block naming the source project, the exact
  commit, the upstream id and the licence. `npm test` fails if one goes missing.
- [`docs/ADOPTED.md`](docs/ADOPTED.md) holds the full per-question mapping,
  including the five items that were **dropped** and why.
- [`review/batches/upstream.json`](review/batches/upstream.json) records the
  review state honestly: `pending`, not `signed-off`, because no human has yet
  checked the technical accuracy of these items.

No exam dumps. Nothing scraped from a paid or leaked source. Where content is
not original, it is attributed, pinned to a commit, and licensed.

The long-term intent is to author the remaining questions here from the public
blueprint, with every distractor justifying why it is wrong.

## Getting started

Requires Node 22 or newer.

```bash
git clone https://github.com/MohammedAlghunaymi/CCNA-Practice.git
cd CCNA-Practice
npm ci
npm run dev
```

Then open <http://localhost:5173>.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run docs:generate` | Regenerate `docs/NOT-EMULATED.md` and the PROJECT.md objective appendix from source data |
| `npm run validate` | Run the eight blocking gates in sequence. CI runs a ninth step first, `npm run docs:generate -- --check`, which this does not include |

## The eight gates

Nothing merges unless all eight pass, locally and in CI.

| Gate | Enforces |
|---|---|
| `npm run lint` | ESLint, including the React hooks rules |
| `npm test` | Unit tests over the allocation engine, IPv4 maths, verification, schema logic, question provenance, and exam scoring and draw |
| `npm run build` | The app compiles |
| `npm run validate:bank` | No duplicate ids or stems, every answer resolves, every wrong option justifies itself, every objective exists, arithmetic agrees with real IPv4 maths, coverage floors and blueprint proportions |
| `npm run validate:review` | No question batch merges without a signed-off review record |
| `npm run validate:docs` | This README's sibling `docs/PROJECT.md` enumerates all 97 sub-objectives, and generated docs match their source data |
| `npm run validate:anti-rot` | The Phase 1 scope cut recorded in `docs/PROJECT.md` §14 is not silently reverted, and the generated allocation numbers still match the formula |
| `npm run license:check` | Every direct dependency is MIT, every question file carries a provenance header, no exam-dump references in `src/` |

## How the question bank is organised

The bank is mapped to Cisco's blueprint rather than to ad-hoc categories.

- **`src/data/objectives.json`** — all 97 sub-objectives across the six weighted domains, with paraphrased descriptions.
- **`src/config/bank.config.json`** — milestone targets, the exam's domain×format matrix, and the frozen per-domain allocation.
- **`src/data/questions/<domain>.json`** — the questions themselves, one file per domain so diffs stay readable.

Allocation is deterministic and reproducible: every sub-objective gets a floor of
2 questions (196 of the 300), and the remaining 104–106 is apportioned by blueprint
weight using largest-remainder. All of it is integer arithmetic, because float
division can invert the ordering and silently change the answer.

| Domain | Weight | In bank | v1 target |
|---|---|---|---|
| Network Fundamentals | 20% | 33 | 91 |
| Network Access | 20% | 37 | 53 |
| IP Connectivity | 25% | 31 | 64 |
| IP Services | 10% | 32 | 29 |
| Security Fundamentals | 15% | 24 | 36 |
| Automation & Programmability | 10% | 12 | 27 |
| **Total** | 100% | **169** | **300** |

The 169 adopted questions were re-keyed by blueprint coverage rather than by
proportion, which is why IP Services currently holds more than its target while
Automation holds less. Allocation targets what the bank is *heading toward*;
the draw is what enforces blueprint proportions at test time.

The bank is deliberately *not* distributed in blueprint proportions — coverage
across 97 sub-objectives forces some domains to be over-represented. The exam
draw is what enforces blueprint proportions at test time.

## Licence

[MIT](LICENSE) © 2026 Mohammed Alghunaymi
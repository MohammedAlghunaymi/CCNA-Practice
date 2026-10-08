# CCNA 200-301 v1.1 Practice Simulator

A practice and exam simulator for the **CCNA 200-301 v1.1** exam, built so the
format, pressure and navigation match the real thing: 120 minutes, one-way
navigation, auto-submit, all four of Cisco's published item types, and
hands-on tasks where you configure a device yourself.

> **Status: early build.** The scaffold, blueprint dataset, allocation engine
> and all seven CI gates are in place. The exam-day shell and question bank are
> still to come — see [`docs/PROJECT.md`](docs/PROJECT.md) for the full plan
> and current phase.

## Legal

This project is **not affiliated with or endorsed by Cisco Systems, Inc.**
CCNA is a registered trademark of Cisco Systems, Inc.

Every question is **original**, written from Cisco's
[publicly published exam blueprint](https://learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf).
**No Cisco exam content is reproduced.** Objective IDs, domain names and domain
weights are taken from the blueprint as short factual labels; objective
descriptions are paraphrased here rather than copied.

No exam dumps, no scraped question banks, no copied assets.

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
| `npm run validate` | Run every gate in sequence — same as CI |

## The seven gates

Nothing merges unless all seven pass, locally and in CI.

| Gate | Enforces |
|---|---|
| `npm run lint` | ESLint, including the React hooks rules |
| `npm test` | Unit tests over the allocation engine, IPv4 maths, verification and schema logic |
| `npm run build` | The app compiles |
| `npm run validate:bank` | No duplicate ids or stems, every answer resolves, every wrong option justifies itself, every objective exists, arithmetic agrees with real IPv4 maths, coverage floors and blueprint proportions |
| `npm run validate:review` | No question batch merges without a signed-off review record |
| `npm run validate:docs` | This README's sibling `docs/PROJECT.md` enumerates all 97 sub-objectives, and generated docs match their source data |
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

| Domain | Weight | v1 bank |
|---|---|---|
| Network Fundamentals | 20% | 91 |
| Network Access | 20% | 53 |
| IP Connectivity | 25% | 64 |
| IP Services | 10% | 29 |
| Security Fundamentals | 15% | 36 |
| Automation & Programmability | 10% | 27 |
| **Total** | 100% | **300** |

The bank is deliberately *not* distributed in blueprint proportions — coverage
across 97 sub-objectives forces some domains to be over-represented. The exam
draw is what enforces blueprint proportions at test time.

## Licence

[MIT](LICENSE) © 2026 Mohammed Alghunaymi
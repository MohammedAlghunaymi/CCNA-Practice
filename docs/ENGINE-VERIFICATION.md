# Engine verification

Is `Onesayi/ccna-simulator`'s engine worth adopting, or do we build Phases 4–5 ourselves?

- **Subject:** [`Onesayi/ccna-simulator`](https://github.com/Onesayi/ccna-simulator), author Alistair Nhiwatiwa
- **Commit:** `6efca4f15e8ccf01fb44973b46bb26922797965a` (MIT)
- **Run:** 2026-10-11 · node v24.15.0 · npm 11.15.0 · scratch clone outside this repo, `--ignore-scripts`
- **Cost:** 4.3 h budgeted, ~2.2 h actual

---

## Technical verdict: NOT VIABLE (3 of 4 gates pass, G2 fails)

## Recommendation: **BUILD** — keep the engine as reference material

Per the published rule, `ADOPT` requires a `VIABLE` technical verdict, ≥15% midpoint saving, **and** provenance of >90 days old or >20 stars. Two conditions fail independently:

1. **G2 fails.** The engine's single runtime dependency, `yaml`, is **ISC**, not MIT. Vendoring the engine makes it a *direct* dependency of this repo, and `scripts/license-check.mjs` hard-fails direct non-MIT dependencies.
2. **Provenance fails.** 6 days old, 3 stars, 1 fork, one author. The question bank was already adopted under the same caveat recorded in `ADOPTED.md`.

G2 is the softer of the two — ISC is a permissive licence and the engine itself is sound — but amending our own MIT-only gate is a policy decision for the owner, not something this verification should make silently. Left intact, the gate says no.

---

## Gate results

| Gate | Question | Result | Evidence |
|---|---|---|---|
| **G1** | Does it work? | **PASS** | `npm test` 29 files / **746 tests** green in 4.22 s · typecheck clean in both workspaces under `strict` · build ✓ 706 ms · smoke HTTP 200, JS 1,612,726 B, CSS 35,171 B, `<title>CCNA Simulator` |
| **G2** | Legally clean? | **FAIL** | `yaml` 2.9.1 is **ISC**; all other shipped deps MIT |
| **G3** | Core objective-free? | **PASS** | 69 core files: 0 `objective`, 0 `blueprint`, 0 `DOMAINS`, 0 `DomainId`, 0 `exam/` imports. v2.0 coupling confined to `labs/types.ts`, `labs/catalog/*`, `labs/progress.ts`, `index.ts` |
| **G4** | Catalog sound? | **PASS** | 64 labs, 64 in `ORDER`, 0 duplicate ids, 0 malformed `blueprint[]`, **0 dangling** question→lab refs (61 distinct refs, all resolve), kinds ∈ {guided 39, troubleshoot 21, challenge 4} |

### Coverage (informational, not gated)

| Metric | Actual | Upstream threshold |
|---|---|---|
| Lines | **96.88%** | 95 |
| Statements | **93.04%** | 90 |
| Functions | **93.78%** | 90 |
| Branches | **85.14%** | 80 |

All four exceed upstream's own declared thresholds.

---

## G2 in detail

Engine `dependencies`: **`yaml` alone** — zero further runtime deps. App dependencies (only if we also take their UI): `@xterm/xterm` MIT, `@xterm/addon-fit` MIT, `@xyflow/react` MIT, `react` MIT, `react-dom` MIT, `zustand` MIT.

Full installed tree, 83 packages: 61 MIT · 10 ISC · 6 Apache-2.0 · 2 MPL-2.0 · 2 BSD-3-Clause · 2 undeclared. Nearly all non-MIT entries are build toolchain we would not vendor — `typescript` (Apache-2.0), `lightningcss` (MPL-2.0), `playwright` (Apache-2.0).

The blocker is specifically `yaml`, used in engine source at `services/ansible.ts` (4 sites), `labs/run.ts`, `labs/operations.ts`. Vendoring makes it direct; our gate is direct-is-MIT.

**Escape routes, if adoption is ever revisited:** (a) amend `license-check.mjs` to accept ISC as MIT-equivalent, with the reasoning written down; (b) vendor the engine minus the YAML-dependent paths (Ansible automation and YAML briefings); (c) depend on the engine rather than vendoring it, keeping `yaml` transitive — our gate treats transitive as advisory.

## G3 in detail

Scope: `capture/ cli/ core/ devices/ ipv6/ routing/ services/ switching/ wireless/` plus `labs/checks.ts`, `labs/run.ts`, `labs/progress.ts`, `index.ts` — 69 files. Excluded: `exam/` and `labs/catalog/`, examined separately.

`checks.ts` imports `Check` from `./types` **type-only**; its 15 runtime imports are all protocol modules (`core/`, `switching/`, `devices/`, `cli/`, `services/`). It carries no blueprint reference.

Seven objective-shaped literals were found and all are benign:

| File | Literal | What it actually is |
|---|---|---|
| `capture/dissect.ts:47` | `'802.11'` | Wi-Fi standard |
| `core/frames.ts:353` | `"128.1"` | STP priority, in a doc comment |
| `devices/ip-device.ts:630` | `'0000.0000.0000'` | MAC address |
| `services/management.ts:54` | `'2.0' '1.5' '1.99'` | SSH protocol version labels |
| `services/restconf.ts:72` | `'17.9'` | IOS version |
| `labs/checks.ts:691,697` | `'2.4'` | **Wi-Fi radio band** (`band: '2.4' \| '5'`), not blueprint 2.4 |

Genuine v2.0 coupling is confined to four places, all outside the reusable simulation surface:

- `labs/types.ts` — `DOMAINS` (5 domains), `DomainId`, `LabDefinition.blueprint`
- `labs/catalog/*` — per-lab `blueprint[]`
- `labs/progress.ts` — imports `DOMAINS`/`DomainId`/`blueprint` for catalog progress bars; discardable UI
- `index.ts` — barrel re-export of `./exam`

**This is the finding that matters most for Plan 2.** The engine's simulation core is genuinely reusable and blueprint-free. Its *catalog metadata* is not, and re-keying it is the entire 25–45 h estimate.

## G4 in detail — re-key debt inventory

64 labs across upstream's five v2.0 domains: `1.0` 12 · `2.0` 11 · `3.0` 12 · `4.0` 22 · `5.0` 7.

**46 distinct upstream blueprint tokens** are referenced across the catalog. Heaviest: `1.6` and `2.4` (7 labs each), `4.7` (6), `1.5`/`1.7`/`2.1.b`/`3.1`/`3.2.b`/`3.3.a`/`4.1`/`5.6` (5 each). Thirteen tokens appear in exactly one lab.

Every one of these needs a content-based decision against v1.1 — the same hazard already documented in `ADOPTED.md`, where upstream `3.3` is OSPF but v1.1 `3.3` is static routing. Domain `5.0` ("AI, and Network Operations and Management", 7 labs) is v2.0-only material with no v1.1 equivalent and is the likeliest source of unmappable labs.

---

## Two harness bugs caught during this run

Recorded because either would have produced a false **clean** result, which is the failure mode a gate exists to prevent.

1. **Piping file paths to `Select-String` searches the path text, not the file.** The first A2 sweep reported `objective 0 / blueprint 0 / exam imports 0 / literals 0`. A control against a known-positive (`'2.4'` in `checks.ts`) returned 2 hits via `-Path` and 0 via the pipe. All three A2 sweeps were invalid and were re-run with `-Path`.
2. **The first catalog parser matched `id:` inside `ssid:`**, inventing two phantom labs (`Staff`, `Corp`), and rejected `2.1.b` as a malformed token when upstream's letter-suffix form is legitimate. 66 "labs" and 47 false failures. Corrected to a negative lookbehind plus per-lab slicing; result is a clean 64.

Neither would have been visible without an explicit positive control and a cross-check against the `ORDER` list.

---

## Reproducibility

| | |
|---|---|
| Upstream `package-lock.json` | present at the pinned commit; `npm ci` reproduced the tree in 3.4 s |
| Packages installed | 84 (`added 84 packages, and audited 87 packages`) |
| Vulnerabilities reported by npm | 0 |
| Engine tests | 29 `.test.ts` files, 746 tests |
| App tests | 4 Playwright `.spec.ts` (not run — needs `npx playwright install chromium`) |

Scratch clone retained at `%TEMP%/opencode/engine-verify/ccna-simulator` with the two audit scripts (`a2_audit.py`, `a9_catalog.py`).

---

## What was *not* tested

- Playwright e2e suite (4 specs) — deferred; needs a Chromium download
- Real-lab hands-on verification — G4 was redefined to objective catalog integrity, since upstream's own suite already proves labs solve in their harness
- Any lab re-keyed to v1.1 — that is Plan 2's first task, and the 25–45 h figure remains unvalidated

## What this gate bought

Three of four gates pass, so the engine is technically real and well-tested. The reusability claim — the load-bearing assumption of every previous plan — is **confirmed**: the simulation core carries no v2.0 coupling.

Adoption still loses, on our own licence gate and on provenance. But we now know the engine's 64 labs, its `Check` union and its IOS semantics are available to *read and imitate* without inheriting a maintenance obligation. That is worth the 2.2 hours, and it is the part this project actually keeps.
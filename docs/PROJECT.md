# CCNA Practice — Project Document

> The authoritative plan for this repository. Everything below is the agreed
> scope; anything not written here is out of scope.

## 1. What this is

A browser-based **CCNA 200-301 v1.1 exam simulator** reproducing the conditions, formats and hands-on tasks of the real certification exam. A rehearsal, not a quiz app.

## 2. Problem

Candidates practise on material differing from the exam where it matters: no timer pressure, no linear navigation, no configuring tasks, results shown as a percentage when the real exam gives pass/fail plus per-domain proficiency. That gap is avoidable.

## 3. Goals, each with its acceptance test

| Goal | Acceptance test |
|---|---|
| **G1** Format, pressure and navigation mirror the real exam | Owner walks a 100-item exam drawn from the real bank end-to-end; `tests/exam.test.jsx` asserts one-way enforcement and auto-submit at 0:00 |
| **G2** All four exam formats implemented, drawn in defined proportions | `drawExam.test.ts` asserts the §7b matrix cell-by-cell — every domain×format cell and every domain total |
| **G3** Hands-on tasks where the student configures a device via CLI or GUI | All 15 shipped tasks run end-to-end and grade via machine-checkable `expectedState` |
| **G4** Every question maps to an official sub-objective ID | `validate:bank` fails on any unmapped ID; `validate:docs` fails unless this file enumerates all 97 |
| **G5** Every shipped question passed all gates and its batch's review record | `validate:review` fails if any merged batch lacks `status: "signed-off"` |
| **G6** MIT, and nothing unattributed | `license:check` fails on any non-MIT direct dependency, missing provenance header, or adopted question absent from `docs/ADOPTED.md` |

## 4. Non-goals

Reproducing Cisco's actual exam questions · certifying anyone · v2.0 · Packet Tracer parity · hotspot/diagram-click items (not among Cisco's four published item types) · emulating DHCP snooping and DAI

## 5. Legal position

Code original, MIT. **The question bank is not original work** — see §5a. Objective **descriptions paraphrased in our own words**; we reproduce only the objective IDs, the six domain names and the domain weights — short factual labels rather than expression. Cisco's blueprint wording is quoted in §6 with citation; IOS syntax is factual interface notation. Blueprint source: `learningcontent.cisco.com/documents/marketing/exam-topics/200-301-CCNA-v1.1.pdf`. "CCNA" is Cisco's trademark, used descriptively; non-affiliation notice, no Cisco logos. No dumps, nothing scraped from a paid or leaked source, no copied assets.

### 5a. The adopted bank — what it is and where it came from

All 169 shipped questions were adopted from [`Onesayi/ccna-simulator`](https://github.com/Onesayi/ccna-simulator), an MIT-licensed project, at pinned commit `6efca4f`, authored by Alistair Nhiwatiwa. Each carries an `upstream` block naming the source project, the exact commit, the upstream id and the licence; `docs/ADOPTED.md` holds the per-question mapping, including the five items dropped and why. `validateBank` check 13 fails if any adopted question is missing from that registry, and `review/batches/upstream.json` records the review state as `pending` rather than `signed-off`, because no human has yet checked these items' technical accuracy.

Re-keying each adopted item to this project's v1.1 blueprint objective ids and writing an explanation for its correct answer is our work; the questions themselves are not. The long-term intent is to author the remaining questions here from the public blueprint. **Any future statement that the bank is original is false until that has happened**, and `license:check` scopes its provenance checks to `src/`, so it will not catch the claim — it is on the reader of this document.

## 6. The exam we're mirroring

**Published by Cisco** (`learningnetwork.cisco.com/s/ccna-exam-topics`, `/s/certification-exam-tutorials`, `learningcontent.cisco.com/…/200-301-CCNA-v1.1.pdf`): 120 minutes · domain weights NF 20% / NA 20% / IPC 25% / IPS 10% / SEC 15% / Auto 10% · v1.1 last test **February 2, 2027**, v2.0 first test **February 3, 2027** · item types per Cisco's exam tutorial: *"multiple-choice single answer, multiple-choice multiple answers, drag & drop, and labs"* · "Pass/fail results are **typically** available online within 48 hours" · *"Passing scores are set by using statistical analysis… Cisco does not publish exam passing scores."*

### Evidence, graded by what each source actually covers

Sources differ in scope, so a single published/not-published split would be dishonest. Each claim below is graded against the source that carries it.

**(a) No back navigation for performance-based lab items — CISCO-PUBLISHED.** Anna Rubin, *Manager, Associate and Professional Certifications*, "New Performance-Based Lab Exam Items Build Opportunities", `blogs.cisco.com/learning`, 2022-07-07: *"Candidates can skip any item and move to the next item, but they cannot go back to a previous item."*
*Qualifier:* an authored Learning & Certifications blog post, not exam policy documentation; its declared subject is the lab environment; it covers all Associate and Professional exams without naming 200-301 v1.1. Neither the Cisco Candidate Rules Agreement nor the Pearson VUE Candidate Rules Agreement mentions navigation at all.

**(b) The same rule applied to multiple-choice and drag-drop — SOURCE-PENDING, and we implement it anyway.** The quoted sentence follows an enumeration of all three item types (*"candidates may encounter performance-based labs, multiple-choice items, and drag-and-drop items… Candidates can skip any item"*), which reads as exam-wide, and July 2022 is contemporaneous with v1.1. But no Cisco page states the MCQ rule directly. The emulator implements one-way navigation because no credible source reports otherwise. **This is a graded inference, not a confirmed fact**, and it is recorded as one.

**(c) No per-item time limit — CISCO-PUBLISHED, and exam-scoped.** Same post: *"the whole exam is timed, but candidates have no limits on how long they spend on each question."* The 5–7 minutes quoted alongside it is a **design target for labs** (*"designed to give candidates 5-7 minutes to complete"*), not an enforced limit, so the emulator shows it as a soft advisory and never as a lock.

**(d) COMMUNITY-REPORTED.** The absence of a flag-for-review affordance and the absence of a pre-submit review screen. No Cisco page and not the blog above address either.

**(e) The score report — MIXED.** *Cisco-published:* *"candidates receive a score report along with their performance breakout by exam section"* (Exam, Testing, and Certification Policies). *Community-reported:* the label **proficiency**, and the mapping of those sections onto the six blueprint domains.

**Community-reported, never confirmed by Cisco:** question count 100–120 (default 100) · hands-on items 2–5 per exam · passing scaled score 825/1000 — Cisco states outright that it does not publish passing scores.

## 7a. Exam-day shell and scoring

Persistent header with countdown timer and question counter. **During the exam pass navigation is one-way: the student may advance only.** There is no back control, no flag-for-review affordance and no pre-submit review screen. A confirmation on the first advance states the student cannot return. Auto-submit fires when the timer reaches 0:00.

There is **no per-item timer**. Per §6(c) the whole exam is timed but candidates have no limit per question, so the only countdown is the whole-exam one. Hands-on items carry a soft elapsed-time advisory at 5 and 7 minutes matching Cisco's stated lab design target; it never locks, grades or ends the item.

Per §6(b) the one-way model is a graded inference rather than a confirmed fact, and `docs/GROWTH.md` carries it as a v2.0 item to re-verify.

**Per-question scoring — all-or-nothing, no partial credit:**

| Format | Correct iff |
|---|---|
| `mcq-single` | the single correct key is selected |
| `mcq-multi` | the selected key **set equals** the correct key set exactly |
| `drag-drop` | **slot *i* holds `pairs[i].right`** — the binding is positional, not membership; repeated text is legal on either side |
| `hands-on` | the `expectedState` predicate holds against final device state |

**Domain contract:**
1. Every item declares exactly one `domain`.
2. Each domain's denominator is **its quota from the §7b matrix, not the number of items actually drawn.**
3. Unanswered items are incorrect.
4. `W = Σ_d (weight_d × correct_d / quota_d)`
5. **Pass** = `W ≥ 82.5%` **AND** no domain below 60% of its quota
6. **Below threshold** = any domain under 60%, reported per domain
7. **Rounding:** a domain needs at least `ceil(0.60 × quota_d)` correct answers, so a pass is never granted on a fraction. Pilot quotas give IPS 4 and SEC 6.

**Provenance:** 82.5% mirrors the community-reported 825/1000; Cisco states outright that it does not publish passing scores. The 60% domain floor is our own choice with no published basis. Both labelled in code and UI — the first as community-derived, the second as this project's choice — never as "approximate", which implies an official figure we do not have.

**Full-length exams require the v1 bank.** A 100-item exam cannot be filled from 60 questions, so pilot exams run at reduced N with the same domain weights and format ratios scaled to N, are labelled **practice mode**, apply no pass rule, and render a **practice result** — per-domain percentages, no verdict, no scaling.

**Auto-submit during a hands-on item:** graded against `expectedState` **as of the moment the timer reaches 0:00** — partial work earns nothing. The result screen states how many hands-on items were auto-submitted mid-task.

## 7b. Question formats — the four Cisco names, full domain × format matrix

Global at N=100: `mcq-single` 62 · `mcq-multi` 20 · `drag-drop` 14 · `hands-on` 4.

| Domain | Drawn | single | multi | drag-drop | hands-on |
|---|---|---|---|---|---|
| Network Fundamentals | 20 | 12 | 4 | 3 | 1 |
| Network Access | 20 | 12 | 4 | 3 | 1 |
| IP Connectivity | 25 | 15 | 5 | 4 | 1 |
| IP Services | 10 | 7 | 2 | 1 | 0 |
| Security Fundamentals | 15 | 9 | 3 | 2 | 1 |
| Automation & Programmability | 10 | 7 | 2 | 1 | 0 |
| **Total** | **100** | **62** | **20** | **14** | **4** |

Target time each: single 45 s · multi 65 s · drag-drop 100 s · hands-on 6 min. **Budget: 62×45 s (46.5) + 20×65 s (21.7) + 14×100 s (23.3) + 4×6 min (24) = 115.5 min of 120, ~4.5 min slack.**

**Hands-on pool: 15 tasks, 12 CLI and 3 WLC** — Network Fundamentals 4 CLI · Network Access 3 CLI + 1 WLC · IP Connectivity 3 CLI · Security Fundamentals 2 CLI + 2 WLC. Each exam draws exactly one from each of those four domains; IP Services and Automation never supply hands-on because they contain no configure-and-verify objective.

`show-output` is a **presentation modifier, not a type** — a question carries `"preamble": "show-output"` and is still an `mcq-single` or `mcq-multi`. There is a second variant, `"show-json"`, for Automation items presenting REST/Ansible/Python output.

**Per-domain output floors, enforced by `validateBank` check 11 at milestone close:** at least **2** items carrying `show-output` in each CLI domain — NF, NA, IPC, IPS, SEC (10 minimum) — and at least **2** carrying `show-json` in AUTO. IPS is included because the v1.1 blueprint gives domain 4 three configure-and-verify objectives (4.1 NAT, 4.2 NTP, 4.6 DHCP client and relay); 4.8 SSH is configure-only and is not counted as such. AUTO is excluded from `show-output` on a factual basis: 6.5, 6.6 and 6.7 contain no configure-and-verify verb, so an IOS-CLI floor there would demand content the blueprint does not describe.

**Sourcing, one of three, recorded per item on the question itself under `sources[]`:** a capture the author actually ran, recording platform, IOS version and command; Cisco's own published sample output in the linked command reference; or authored as `[illustrative]` with a visible marker. The third category is allowed and disclosed because Cisco's command references frequently describe fields without shipping version-exact literal output. `validateBank` check 12 fails any illustrative-sourced item whose **stem, or whose `preambleText` payload, lacks the marker** — the disclosure has to qualify the output it sits next to, and the output renders above the stem. `kind` is matched case-insensitively at that check, so a capitalised `Illustrative` is accepted by the schema and caught here rather than slipping between the two.

**Quota assignment order:** `drawExam` fixes the per-domain quota from blueprint weights → the per-format quota from the matrix → then selects questions, applying the low-frequency objective bias **within** a domain×format cell whose count is already fixed. Neither proportion set can drift.

## 7c. Practice mode

Browse by domain or sub-objective. Per-objective mastery. Show/hide answer with explanation. Wrong-answer queue.

## 7d. CLI emulator — bounded by two enumerated lists

**Config families (16):** interfaces and `no shutdown` · `switchport mode`/access/trunk and native VLAN · `vlan` creation · `channel-group` (LACP) · spanning-tree guards · static routes (default/network/host/floating) · single-area OSPFv2 · IPv6 addressing · DHCP client and relay · inside NAT (static/pool) · NTP · SSH · local passwords · ACLs · port security · CDP/LLDP enablement.

**Rendered show commands (4), for student feedback only:** `show running-config` · `show ip interface brief` · `show ip route` · `show vlan brief`. Grading reads device state directly via `expectedState`; **no grading path parses show output**, so this is a bounded state machine, not an IOS clone.

**Deliberately not emulated** — declared as data in `src/data/not-emulated.json`, with `docs/NOT-EMULATED.md` generated from it: DHCP snooping and DAI (5.7 — port security *is* emulated), TFTP/FTP (4.9), syslog (4.5), SNMP (4.4), QoS PHB (4.7), wireless RF behaviour (2.6). **The five configure-and-verify objectives 2.4, 2.5, 4.6, 5.6 and 5.7 have no dedicated verification output; students verify them via `show running-config`.**

**Adopt-vs-build:** real IOS cannot run in-browser; containerlab/CML/GNS3 require Docker, defeating a local-first browser tool.

## 7e. WLC GUI — bounded

Scope is **WLAN creation only**: profile name, SSID, status, VLAN ID, WPA2 Personal with PSK, QoS class, 802.11ax/DTIM. No RF, channel, power, roaming or client-tracking. **Navigation follows Cisco's AireOS Configuration Guide: `WLANs` → `New`, with `General`, `Security`, `QoS` and `Advanced` as tabs inside the WLAN editor** (Security is a child of a WLAN, not its parent). Three tasks. Dedicated `WlcState`. Each stem names the interface (AireOS or Catalyst 9800-CL). No browser-runnable WLC emulator exists, so this is built — and it is small because the scope is narrow.

## 7f. Architecture

`LabHarness` holds N devices and routes CLI input to the focused one. `DeviceState` is one router/switch, split into sub-reducers (`interfaces`, `vlan`, `routing`, `services`, `security`). `WlcState` separate. `CliEngine` parses input → `DeviceState`; `WlcGui` → `WlcState`.

## 7g. Repository layout

```
src/
  data/objectives.json, not-emulated.json
  data/questions/<domain>.json
  config/bank.config.json          # milestone, frozen allocation, named pilot subset
  lib/{blueprint,drawExam,score,validateQuestion,expectedState,allocation,ipv4,verify,sessionStore}.js
  device/harness/LabHarness.js
  device/state/{interfaces,vlan,routing,services,security}.js
  device/cli/{parser,commands/config,commands/render}.js
  device/wlc/wlcState.js
  features/{practice,exam}/
  pages/, router/
tests/
scripts/{allocate-bank,validate-bank,validate-review,validate-docs,license-check,generate-docs}.mjs
review/batches/<batch-id>.json
docs/{PROJECT,NOT-EMULATED,GROWTH}.md   # NOT-EMULATED generated from not-emulated.json
```

## 8. Question bank

**Target ladder: 60 → 300 → 450 → 600 questions across the 97 testable topics (NF 35, NA 16, IPC 19, IPS 9, SEC 10, Auto 8).**

### Counting rule for "97"

97 is the **leaf-only** count: every lettered sub-objective (`1.1.a`) and every unlettered leaf objective (`1.4`, `1.6`, `2.3`) counts once, while non-leaf parents (`1.1`, `2.1`, `6.3`) are containers and do **not** count. Verified against `objectives.json`: 97 leaves, 14 non-leaf parents, 111 nodes total. `validateBank` check 11 fails if a declared `leafCount` drifts from the counted data, because those numbers are duplicated metadata and nothing else checks them.

### Per-topic minimums are balanced, not uniform

The blueprint is lopsided: Network Fundamentals holds 35 of the 97 topics but only 20% of the exam, while Security Fundamentals holds 10 topics and 15% of the exam. A single global floor therefore over-stocks NF with questions a candidate rarely draws and under-stocks SEC with questions they see repeatedly. So the minimum is scaled per domain by weight-to-topic ratio, with `floorPerObjective` anchoring the domain with the worst ratio (NF).

The floors are **stored explicitly** in `config.floorsByMilestone` and verified against `balancedFloors()`, rather than derived at read time — deriving them arithmetically makes the knob inert, because `round(2 × 1.75 × 0.1/20)` is 0 and most cells would round to zero, silently disabling coverage.

| Milestone | Floors NF/NA/IPC/IPS/SEC/AUTO |
|---|---|
| pilot | 1 / 1 / 1 / 1 / 1 / 1 |
| v1 | 1 / 2 / 2 / 2 / 3 / 2 |
| later | 2 / 4 / 5 / 4 / 5 / 4 |
| frontier | 3 / 7 / 7 / 6 / 8 / 7 |

**The pilot is a documented exception:** the balanced rule needs 62 questions to cover its 32 topics and cannot fit in a 60-question milestone, so the pilot uses a uniform floor of 1 and says so in config.

### The allocation and the exam draw are two sides of one contract

`allocation_d = floor_d × leaves_d + largestRemainder(target − Σ floor_d × leaves_d, weight_d)`, surplus seats to descending remainder with ties broken by domain name ascending. `scripts/allocate-bank.mjs` computes this and freezes it into `bank.config.json`; **these tables are generated output, not hand-maintained.** Integer arithmetic throughout — with float division 106 × 0.15 lands on 15.899999999999999 and the largest-remainder ordering can invert.

Supply must also meet demand: a milestone can hit its target and still be undrawable, which is exactly what the shipped pilot config did — it asked for 15 IP Connectivity questions from a bank holding 14. `validateBank` check 10 now fails when any domain's supply falls below its draw quota for that milestone's exam length.

| Milestone | Questions | NF | NA | IPC | IPS | SEC | AUTO | Each question seen |
|---|---|---|---|---|---|---|---|---|
| pilot | 60 | 12 | 12 | 15 | 6 | 9 | 6 | n/a |
| v1 | 300 | 61 | 58 | 71 | 31 | 50 | 29 | 30.0–35.2% |
| later | 450 | 91 | 85 | 121 | 46 | 65 | 42 | 20.7–23.8% |
| frontier | 600 | 117 | 124 | 148 | 60 | 89 | 62 | 16.1–17.1% |

"Each question seen" is `draw_quota_d ÷ bank_d` — the chance one authored question appears in one sitting. **The bank guarantees coverage, not novelty:** you will see repeated questions between attempts. Balancing holds that spread to roughly 1.2× across domains; a uniform floor left it at 1.9× with no amount of size. Adding a rung is a config change only — see `docs/GROWTH.md`.

**Milestones**

| Milestone | Target | Topics in scope | Per-topic minimum | Exam length |
|---|---|---|---|---|
| Pilot | 60 | the 32 named explicitly in `config.bank.config.json` | 1 | 60 |
| v1 | 300 | all 97 | 1–3, balanced per domain | 100 |
| Later | 450 | all 97 | 2–5, balanced per domain | 100 |
| Frontier | 600 | all 97 | 3–8, balanced per domain | 100 |

**The pilot's 32-topic subset is forced, not chosen.** A 60-question exam draws 60 from a 60-question bank, so each domain's allocation must equal its draw quota *exactly*. Choosing NF 7 / NA 6 / IPC 8 / IPS 3 / SEC 5 / AUTO 3 is the only split where the formula lands on 12/12/15/6/9/6.

## 9. Schema

Every wrong option carries a `rationale`; if one cannot be articulated the question is rewritten. Computational questions carry machine-checkable `verify` assertions evaluated against real IPv4 arithmetic. Hands-on questions carry an `expectedState` predicate in a small **declarative, JSON-serialisable DSL** — never a JS function — so it lives in the question file and diffs in review.

## 10. Quality gates

`npm run lint` · `npm run test` · `npm run build` · `npm run validate:bank` · `npm run validate:review` · `npm run validate:docs` · `npm run validate:anti-rot` · `npm run license:check` — **all eight must pass before push, on every pull request.** CI runs a ninth step, `npm run docs:generate -- --check`, ahead of them; `npm run validate` does not, so the two are not the same sequence.

`validate:bank` is **milestone-aware**, reading the current milestone from `config/bank.config.json`. Numbered as `src/lib/validateBank.js` numbers them. It emits **14** criteria per run, plus a 15th at milestone close:

1. duplicate ids (`:52`)
2. duplicate stems (`:59`)
3. **shape** — schema violations, including a hands-on task lacking a valid `expectedState` (`:69`)
4. **objective mapping** — an unmapped ID, or a domain that disagrees with its objective (`:77`)
5. failed `verify` assertions (`:85`)
6. an in-scope topic below the milestone's per-topic minimum, read from `floorsByMilestone` — never a global constant (`:97`)
7. a per-domain format count below its matrix cell, scaled to current bank size (`:143`)
8. **proportional drift** `|count_d − target_d × (current_total / milestone_target)| > ±2` (`:163`)
9. **declared topic counts drifting** from the counted `isLeaf` entries (`:201`)
10. **supply failing to cover the exam draw** — any domain holding fewer questions than its quota for that milestone's exam length (`:213`)
11. **`show-output`/`show-json` floors per domain**, at milestone close (`:237`)
12. **an `[illustrative]`-sourced item whose stem or `preambleText` lacks the marker** (`:268`)
13. **an adopted question missing from `docs/ADOPTED.md`** (`:283`)
14. **a wrong option still carrying the placeholder rationale** (`:308`)
15. at milestone close only: **the exact total** (`:329`)

Three deliberate carve-outs, all stated so they cannot be abused to ship a bad bank:

- **Allocation drift is informational until the milestone is 25% underway.** Authoring goes domain by domain, and at a small bank size a ±2 proportional tolerance is tighter than any real batching strategy can meet. Past 25% it is enforced; the exact-total check at milestone close is what actually guarantees the finished bank matches the allocation.
- **The exact-total and preamble-floor checks run only when a milestone is closed**, never per batch. Mid-milestone authoring goes domain by domain, so a domain not yet reached would fail a floor it has had no chance to satisfy.

An empty bank passes the coverage check rather than reporting 32 phantom violations; the floor activates on the first question. Completeness still comes from the milestone-close total.

## 11. Verification

1. Automated gates (§10)
2. Documentation cross-check at authoring time for any question depending on a specific Cisco default or behaviour — the common case, not an exception
3. **Batch review:** batches of ≤40, each with **100% review before merge**, recorded as `review/batches/<batch-id>.json`; `validate:review` enforces it
4. **Milestone sample:** a random **15% of the cumulative bank** re-reviewed — with one maintainer this is a re-read, not an independent second opinion
5. **Hands-on: 100% review** of all 15 tasks
6. `not-emulated.json` records gaps against the objectives they affect

**Cost model.** Written items: authoring with doc cross-check ≈ 8–12 min, review ≈ 5–7 min, **combined 13–19 min per question**; a 40-question batch ≈ 9–13 h. CLI hands-on task ≈ 1.5–2 h. WLC hands-on task ≈ 3–4 h.

**Stated limitation:** if a residual 2% of shipped questions have a wrong answer key, then at 300 questions a student drawing 100 has roughly a **90% chance of encountering at least one**. Items are marked `reviewed` — a process guarantee, not expert sign-off.

## 12. Phases — effort in hours, cost model applied to stated quantities; one session = 4 h

| # | Deliverable | Hours | Exit criteria |
|---|---|---|---|
| 0 | Toolchain + CI + nine artifacts: Node 22 LTS, Vite, React 19, Tailwind v4, Vitest, ESLint; GitHub Actions; **this document**, incl. the appendix below generated from `objectives.json`; `not-emulated.json`; `bank.config.json`; `allocate-bank.mjs`; four validators; README with `git clone && npm ci && npm run dev` | **14** | CI green on empty bank; all four validators exercised |
| 1 | Exam-day shell over the real bank: session store with `SCHEMA_VERSION` and clock tolerance 1 · exam shell with paired assertions 1 · result screen 1 · full-length walk and auto-submit proof 1 | **4** | Owner walks a 100-item exam drawn from the real bank end-to-end; `tests/exam.test.jsx` green |
| 2 | Pilot bank: 60 questions over the 32-topic subset, all three authored formats. 60 × 13–19 min, in batches of ≤40. **Absorbs the Phase 1 deferrals** — see §14 | **24–30** | `validate:bank` green at pilot target with all 14 checks; pilot exams in practice mode |
| 3 | Capture/transcribe/verify the 10 `show-output` + 2 `show-json` items with per-item `sources[]` 5 · generated `NOT-EMULATED.md` 1 · scoring verified per authored format 2 · acting on pilot feedback 4 | **12** | all three authored formats render and score correctly |
| 4 | Emulator core: 5 `DeviceState` sub-reducers, `LabHarness`, `CliEngine`, `expectedState.js`, 16 config families (2.5–3.5 h each), 10 h engine, 8 h renderers, golden fixtures | **58–74** | all 16 families mutate state correctly; 4 renderers byte-match fixtures |
| 5 | 15 hands-on tasks: 12 CLI × 1.5–2 h + 3 WLC × 3–4 h + `WlcState` 6 h + `WlcGui` (the WLAN-creation GUI of §7e, **not estimated** — §12's 33–42 h covers only the three priced items) | **33–42** + `WlcGui` | all 15 tasks run end-to-end and grade via `expectedState`; `WlcGui` creates a WLAN whose fields mutate `WlcState`, with Security a child of the WLAN editor |
| 6 | Bank growth 60 → 300 in batches of ≤40. 240 × 13–19 min | **52–76** | supply covers the 100-question draw at v1; drift within ±2 |
| 7 | Ambiguity pass 3 h + 15% sample 4.5 h + rotation 2 h + CONTRIBUTING 2 h + **5 h rework budget** (inclusive of eight-gate re-runs, 2 amendment rounds per batch; a third round escalates to a design change) | **17** | 15% milestone sample re-read |
| 8 | Bank growth 300 → 450. Parameterised re-run of Phase 6 against the `later` rung. 150 × 13–19 min, mid-block checkpoint at +75 | **32.5–47.5** | supply covers the draw at `later` |
| 9 | Bank growth 450 → 600. Parameterised re-run against `frontier`. 150 × 13–19 min, mid-block checkpoint at +75 | **32.5–47.5** | supply covers the draw at `frontier` |

**Totals: 279–364 h = 70–91 four-hour sessions.** Phases 0–7 are **214–269 h (54–68 sessions)**; adding both growth rungs is 279–364 h (70–91). Phases 1–2 alone — the first usable product — are **28–34 h (7–9 sessions)**. Phases 0–3 (**54–60 h, 14–15 sessions**) ship a format-faithful practice exam over 60 questions. The emulator and task library (Phases 4–5, **91–116 h**) are the dominant fidelity cost and deliberately come last. Every phase boundary is an independently usable stopping point, and Phases 8–9 carry a mid-block checkpoint so an interrupted run still lands on a coherent bank.

## 13. Non-negotiables

1. No unattributed third-party content — `license:check` fails on any non-MIT **direct** dependency or missing provenance header, and `validate:bank` check 13 fails on an adopted question absent from `docs/ADOPTED.md`; transitive licences are advisory only, because the Vite/Tailwind trees include ISC packages. See §5a: the bank is adopted, not original
2. No question without an explanation and distractor rationales
3. No question without passing all eight gates
4. One-way navigation during the exam pass: no back control, no flag-for-review affordance, no pre-submit review screen. Recorded in §6(b) as a graded inference, not a confirmed fact
5. Timer and auto-submit behave as the real thing; unanswered items grade incorrect; mid-task expiry earns no partial credit and is disclosed
6. Full-length results are pass/fail plus per-domain proficiency — never a scaled score or percentage; practice-mode results carry no verdict
7. All eight gates green before push
8. Any fact not published by Cisco is labelled community-reported, observed or inferred, in code and UI — and §6 grades each claim by the scope of the source carrying it, so a blog post's silence is never read as Cisco policy

## 14. Decisions

| Decision | Outcome |
|---|---|
| Fidelity | Full — all four formats plus hands-on CLI and WLC GUI |
| Diagrams | Text only; hotspot items deferred |
| Multi-device | Terminal tabs, settled. `DeviceState` is one device; `LabHarness` holds the array |
| Deployment | Local first; none until Phase 7 |
| License | MIT, `Copyright (c) 2026 Mohammed Alghunaymi` |
| Repo | `MohammedAlghunaymi/CCNA-Practice`, public |
| Pass threshold | `W ≥ 82.5%` AND no domain below 60%; both labelled approximate |
| **Git identity** | **Open** — user chooses global config vs per-commit |
| **Bank ladder** | 60 → 300 → 450 → 600, each rung a config-only addition. Further rungs are a procedure, not a redesign — `docs/GROWTH.md` |
| **IP Services hands-on** | **Deferred** — the blueprint does give domain 4 configure-and-verify objectives; adding it changes the N=100 matrix and cascades through the allocation. Backlog entry in `GROWTH.md` |
| **Phase 1 scope, reviewed** | **Cut from four steps to four steps' worth of work.** Phase 1 originally built a fixture corpus, a cell-aware draw, non-multiple-choice graders and a frozen `expectedState` evaluator — for formats the bank contains none of: 169 questions, 168 `mcq-single`, 1 `mcq-multi`, 0 drag-drop, 0 hands-on. Council review reduced it to the session store, an injectable paper length, one-way navigation, the result screen and a full-length walk. Phase 2 absorbs the deferrals and its hours rise to match, so **every §12 total is unchanged**: the work moved, it did not disappear. |
| **Deferred to Phase 2 with the Phase 1 cut** | Non-multiple-choice schema, graders and renderers; the frozen `expectedState` evaluator (its nine operators stay frozen in `questionSchema.js:19-29`); cell-aware draw and the G2 matrix assertion; cross-tab coordination; the abandoned-record sweep; the §13 #6 no-percentage rule, which binds a shipped full-length mode that does not exist. The domain-proportion drift at n=100 (NF 19 against the matrix's 20) is the coverage floor at `selectQuestions.js:111`, not a missing dimension, and is carried forward unfixed |
| **Home tile overstates the paper length** | `Home.jsx:73-74` renders `config.exam.defaultLength` — 100 — while the runner defaults to 20. Known and left: aligning them means re-labelling the tile or defaulting the runner to 100, and the latter would break the fifteen `of 20` assertions in `tests/exam.test.jsx` for no Phase 1 benefit |

<!-- BEGIN GENERATED OBJECTIVE APPENDIX -->

## Appendix: all 97 sub-objectives

<!-- GENERATED - source: src/data/objectives.json -->

### Network Fundamentals — 20% (35 sub-objectives)

| ID | Description |
|---|---|
| `1.1.a` | Routers forward traffic between networks using a routing table |
| `1.1.b` | Layer 2 switches forward frames by MAC address; Layer 3 switches forward packets by IP address |
| `1.1.c` | Next-generation firewalls and intrusion prevention systems inspect traffic and block or flag threats |
| `1.1.d` | Access points provide wireless connectivity to a wired LAN |
| `1.1.e` | Controllers centralise policy and configuration, such as Cisco DNA Center and a wireless LAN controller |
| `1.1.f` | Endpoints are devices that originate and consume traffic, such as hosts, phones and printers |
| `1.1.g` | Servers host applications and services for clients |
| `1.1.h` | Power over Ethernet delivers power and data over the same cable run |
| `1.2.a` | Two-tier architecture is a flat access layer over a single distribution or core layer |
| `1.2.b` | Three-tier architecture separates access, distribution and core roles |
| `1.2.c` | Spine-leaf connects every leaf to every spine for predictable latency |
| `1.2.d` | A WAN connects sites over distance using carrier infrastructure |
| `1.2.e` | A small office/home office typically uses one device performing several roles |
| `1.2.f` | On-premises and cloud describe where workloads and data physically live |
| `1.3.a` | Single-mode fibre, multimode fibre and copper trade off distance, cost and light source |
| `1.3.b` | Ethernet shared media and point-to-point differ in how bandwidth is shared |
| `1.4` | Identify interface and cable issues such as collisions, errors, duplex mismatch and speed mismatch |
| `1.5` | Compare TCP to UDP across reliability, ordering and overhead |
| `1.6` | Configure and verify IPv4 addressing and subnetting |
| `1.7` | Describe private IPv4 addressing and the intent of the reserved ranges |
| `1.8` | Configure and verify IPv6 addressing and prefix |
| `1.9.a` | Unicast covers global, unique-local and link-local scopes |
| `1.9.b` | Anycast makes one address reachable from many locations |
| `1.9.c` | Multicast delivers one sender to many receivers by group membership |
| `1.9.d` | Modified EUI-64 derives an IPv6 interface identifier from a MAC address |
| `1.10` | Verify IP parameters for a client operating system such as Windows, macOS or Linux |
| `1.11.a` | Nonoverlapping Wi-Fi channels, such as 1, 6 and 11, avoid co-channel interference |
| `1.11.b` | The SSID is the network name broadcast by an access point |
| `1.11.c` | Radio frequency behaviour including interference and signal characteristics |
| `1.11.d` | Encryption protects wireless traffic over the air |
| `1.12` | Virtualization fundamentals covering server virtualization, containers and VRFs |
| `1.13.a` | MAC learning and aging is how a switch populates and expires table entries |
| `1.13.b` | Frame switching forwards a frame out the correct port |
| `1.13.c` | Frame flooding sends out all ports when the destination is unknown |
| `1.13.d` | The MAC address table maps destinations to learned ports |

### Network Access — 20% (16 sub-objectives)

| ID | Description |
|---|---|
| `2.1.a` | Access ports carry data and voice traffic for a single VLAN |
| `2.1.b` | The default VLAN exists on a switch out of the box |
| `2.1.c` | InterVLAN connectivity routes between VLANs via a Layer 3 device |
| `2.2.a` | Trunk ports carry multiple VLANs over one link |
| `2.2.b` | 802.1Q VLAN tagging frames with a VLAN identifier |
| `2.2.c` | The native VLAN crosses a trunk untagged |
| `2.3` | Configure and verify Layer 2 discovery protocols, CDP and LLDP |
| `2.4` | Configure and verify Layer 2 and Layer 3 EtherChannel using LACP |
| `2.5.a` | Root port, root bridge and the other spanning tree port roles |
| `2.5.b` | Port states and whether each forwards or blocks |
| `2.5.c` | PortFast marks an edge port that cannot create a loop |
| `2.5.d` | Root guard, loop guard, BPDU filter and BPDU guard |
| `2.6` | Cisco wireless architectures and access point modes |
| `2.7` | Physical infrastructure connections of WLAN components, covering access points, controllers, access and trunk ports, and link aggregation groups |
| `2.8` | Network device management access via Telnet, SSH, HTTP, HTTPS, console, TACACS+ or RADIUS, and cloud-managed access |
| `2.9` | Interpreting the wireless LAN GUI configuration for client connectivity |

### IP Connectivity — 25% (19 sub-objectives)

| ID | Description |
|---|---|
| `3.1.a` | Routing protocol code identifies how a route was learned |
| `3.1.b` | The prefix is the network portion of a routing table entry |
| `3.1.c` | The network mask states how much of the address is prefix |
| `3.1.d` | The next hop is the address traffic is forwarded to |
| `3.1.e` | Administrative distance expresses preference between sources of routes |
| `3.1.f` | The metric expresses cost within a single routing protocol |
| `3.1.g` | The gateway of last resort is the fallback when no route matches |
| `3.2.a` | Longest prefix match selects the most specific route |
| `3.2.b` | Administrative distance is the first decision between routes |
| `3.2.c` | The routing protocol metric breaks the tie within one protocol |
| `3.3.a` | A default route matches anything not matched more specifically |
| `3.3.b` | A network route points at an entire subnet |
| `3.3.c` | A host route points at a single address |
| `3.3.d` | A floating static stays dormant via a higher administrative distance |
| `3.4.a` | Neighbour adjacencies form over hello and dead intervals |
| `3.4.b` | Point-to-point is an OSPF network type |
| `3.4.c` | Broadcast networks and DR/BDR election |
| `3.4.d` | Router ID selection |
| `3.5` | Purpose, functions and concepts of first hop redundancy protocols |

### IP Services — 10% (9 sub-objectives)

| ID | Description |
|---|---|
| `4.1` | Configure and verify inside source NAT using static mappings and address pools |
| `4.2` | Configure and verify NTP in client and server modes |
| `4.3` | The role of DHCP and DNS within the network |
| `4.4` | The function of SNMP in network operations |
| `4.5` | Syslog features including facilities and severity levels |
| `4.6` | Configure and verify DHCP client and relay |
| `4.7` | Per-hop behaviour for QoS: classification, marking, queuing, congestion, policing and shaping |
| `4.8` | Configure network devices for remote access using SSH |
| `4.9` | The capabilities and functions of TFTP and FTP in the network |

### Security Fundamentals — 15% (10 sub-objectives)

| ID | Description |
|---|---|
| `5.1` | Key security concepts: threats, vulnerabilities, exploits and mitigation techniques |
| `5.2` | Security program elements covering user awareness, training and physical access control |
| `5.3` | Configure and verify device access control using local passwords |
| `5.4` | Password policy elements: management, complexity, and alternatives such as multifactor authentication, certificates and biometrics |
| `5.5` | IPsec remote access and site-to-site VPNs |
| `5.6` | Configure and verify access control lists |
| `5.7` | Configure and verify Layer 2 security features: DHCP snooping, dynamic ARP inspection and port security |
| `5.8` | Compare authentication, authorization and accounting concepts |
| `5.9` | Wireless security protocols: WPA, WPA2 and WPA3 |
| `5.10` | Configure and verify a WLAN in the GUI using WPA2 PSK |

### Automation and Programmability — 10% (8 sub-objectives)

| ID | Description |
|---|---|
| `6.1` | How automation impacts network management |
| `6.2` | Compare traditional networks with controller-based networking |
| `6.3.a` | Separation of the control plane and the data plane |
| `6.3.b` | Northbound and southbound APIs |
| `6.4` | Generative and predictive AI, and machine learning in network operations |
| `6.5` | Characteristics of REST-based APIs: authentication types, CRUD, HTTP verbs and data encoding |
| `6.6` | Capabilities of configuration management mechanisms such as Ansible and Terraform |
| `6.7` | Components of JSON-encoded data |

<!-- END GENERATED OBJECTIVE APPENDIX -->
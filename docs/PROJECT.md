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
| **G1** Format, pressure and navigation mirror the real exam | Owner walks a 100-item fixture exam end-to-end; `exam.test.ts` asserts one-way enforcement, auto-submit at 0:00, review-screen jump-back |
| **G2** All four exam formats implemented, drawn in defined proportions | `drawExam.test.ts` asserts the §7b matrix cell-by-cell — every domain×format cell and every domain total |
| **G3** Hands-on tasks where the student configures a device via CLI or GUI | All 15 shipped tasks run end-to-end and grade via machine-checkable `expectedState` |
| **G4** Every question maps to an official sub-objective ID | `validate:bank` fails on any unmapped ID; `validate:docs` fails unless this file enumerates all 97 |
| **G5** Every shipped question passed all gates and its batch's review record | `validate:review` fails if any merged batch lacks `status: "signed-off"` |
| **G6** MIT, no third-party content | `license:check` fails on any non-MIT direct dependency or missing provenance header |

## 4. Non-goals

Reproducing Cisco's actual exam questions · certifying anyone · v2.0 · Packet Tracer parity · hotspot/diagram-click items (not among Cisco's four published item types) · emulating DHCP snooping and DAI

## 5. Legal position

Code and questions original, MIT. Objective **descriptions paraphrased in our own words**; we reproduce only the objective IDs, the six domain names and the domain weights — short factual labels rather than expression. Cisco's blueprint wording is quoted in §6 with citation; IOS syntax is factual interface notation. Blueprint source: Cisco Learning Network. "CCNA" is Cisco's trademark, used descriptively; non-affiliation notice, no Cisco logos. No dumps, no scraped questions, no copied assets.

## 6. The exam we're mirroring

**Published by Cisco** (`learningnetwork.cisco.com/s/ccna-exam-topics`, `/s/certification-exam-tutorials`, `learningcontent.cisco.com/…/200-301-CCNA-v1.1.pdf`): 120 minutes · domain weights NF 20% / NA 20% / IPC 25% / IPS 10% / SEC 15% / Auto 10% · v1.1 last test **February 2, 2027**, v2.0 first test **February 3, 2027** · item types per Cisco's exam tutorial: *"multiple-choice single answer, multiple-choice multiple answers, drag & drop, and labs"* · "Pass/fail results are **typically** available online within 48 hours."

**Observed exam practice, not restated on those pages:** one-way navigation during the exam pass; auto-submit at timer expiry; a pre-submit review screen; per-domain **proficiency** on the score report.

**Community-reported, not published by Cisco:** question count 100–120 (default 100) · hands-on items 2–5 per exam · passing scaled score 825/1000, never confirmed.

## 7a. Exam-day shell and scoring

Persistent header with countdown timer and question counter. During the exam pass navigation is one-way, with a confirmation dialog stating the student cannot return. Flag-for-review marks an item. A pre-submit review screen lists every item answered / unanswered / flagged and lets the student **jump to any flagged or unanswered item to answer it before submitting**. Auto-submit fires when the timer reaches 0:00.

**Per-question scoring — all-or-nothing, no partial credit:**

| Format | Correct iff |
|---|---|
| `mcq-single` | the single correct key is selected |
| `mcq-multi` | the selected key **set equals** the correct key set exactly |
| `drag-drop` | **every slot** holds a token declared in that item's `pairs` (positional; repeats legal either side) |
| `hands-on` | the `expectedState` predicate holds against final device state |

**Domain contract:**
1. Every item declares exactly one `domain`.
2. Each domain's denominator is **its quota from the §7b matrix, not the number of items actually drawn.**
3. Unanswered items are incorrect.
4. `W = Σ_d (weight_d × correct_d / quota_d)`
5. **Pass** = `W ≥ 82.5%` **AND** no domain below 60% of its quota
6. **Below proficiency** = any domain under 60%, reported per domain

**Provenance:** 82.5% mirrors the community-reported 825/1000, which Cisco has never confirmed; the 60% domain floor is our own choice with no published basis. Both labelled in the UI as approximations, not official cut scores.

**Full-length exams require the v1 bank.** A 100-item exam cannot be filled from 60 questions, so pilot exams run at reduced N with the same domain weights and format ratios scaled to N, are labelled **practice mode**, apply no pass rule, and render a **practice result** — per-domain percentages, no verdict, no scaling.

**Auto-submit during a hands-on item:** graded against `expectedState` **as of the moment the timer reaches 0:00** — partial work earns nothing. The result screen states how many hands-on items were auto-submitted mid-task. At 0:00 the review screen disables answering.

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

`show-output` is a **presentation modifier, not a type** — a question carries `"preamble": "show-output"` and is still an `mcq-single` or `mcq-multi`.

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
  lib/{blueprint,drawExam,score,validateQuestion,expectedState,allocation,ipv4,verify}.js
  device/harness/LabHarness.js
  device/state/{interfaces,vlan,routing,services,security}.js
  device/cli/{parser,commands/config,commands/render}.js
  device/wlc/wlcState.js
  features/{practice,exam}/
  pages/, router/
tests/
scripts/{allocate-bank,validate-bank,validate-review,validate-docs,license-check,generate-docs}.mjs
review/batches/<batch-id>.json
docs/{PROJECT,NOT-EMULATED}.md   # NOT-EMULATED generated from not-emulated.json
```

## 8. Question bank

**Target: 300 verified questions across 97 sub-objectives (leaf topics): NF 35, NA 16, IPC 19, IPS 9, SEC 10, Auto 8.**

**Allocation formula, verified to reproduce the table:** `allocation_d = (2 × leaves_d) + largestRemainder(300 − 194, weight_d)`. The 194 is `2 × 97`, the coverage floor. 106 × {20,20,25,10,15,10}% yields floors {21,21,26,10,15,10} = 103, so 3 seats go to the three largest fractional parts (SEC .9, IPS .6, Auto .6) → {21,21,26,11,16,11} = 106.

| Domain | Sub-obj | Weight | Floor | Remainder | Allocation | Drawn | Draw prob |
|---|---|---|---|---|---|---|---|
| Network Fundamentals | 35 | 20% | 70 | 21 | **91** | 20 | 22% |
| Network Access | 16 | 20% | 32 | 21 | **53** | 20 | 38% |
| IP Connectivity | 19 | 25% | 38 | 26 | **64** | 25 | 39% |
| IP Services | 9 | 10% | 18 | 11 | **29** | 10 | 34% |
| Security Fundamentals | 10 | 15% | 20 | 16 | **36** | 15 | 42% |
| Automation & Programmability | 8 | 10% | 16 | 11 | **27** | 10 | 37% |
| **Total** | **97** | 100% | 194 | 106 | **300** | **100** | |

`scripts/allocate-bank.mjs` computes this and writes it to `config/bank.config.json`, where it is frozen. **The table is generated output, not hand-maintained.** All apportionment uses integer arithmetic, because with float division 106 × 0.15 lands on 15.899999999999999 and the largest-remainder ordering can invert — which would make a published table unreproducible.

**Per-domain format floors** equal the §7b matrix cell counts, guaranteeing any draw can be filled; the four hands-on domains additionally carry the declared task pool.

**Exam variety, stated honestly:** an individual question is drawn in **22–42%** of attempts, Security Fundamentals worst at 42% (15 items from 36 questions). You will see repeated questions between attempts. **The bank guarantees coverage, not novelty.** At the 450-question milestone the same formula yields NF 121, NA 83, IPC 102, IPS 44, SEC 58, Auto 42, and every per-question draw probability falls to **17–26%** — meaningfully better, not transformative.

**Milestones**

| Milestone | Target | Sub-objectives in scope | Floor per in-scope sub-objective |
|---|---|---|---|
| Pilot | 60 | the 30 named explicitly in `config/bank.config.json` | ≥1 |
| v1 | 300 | all 97 | ≥2 |
| Later | 450 | all 97 | ≥2 |

## 9. Schema

Every wrong option carries a `rationale`; if one cannot be articulated the question is rewritten. Computational questions carry machine-checkable `verify` assertions evaluated against real IPv4 arithmetic. Hands-on questions carry an `expectedState` predicate in a small **declarative, JSON-serialisable DSL** — never a JS function — so it lives in the question file and diffs in review.

## 10. Quality gates

`npm run lint` · `npm run test` · `npm run build` · `npm run validate:bank` · `npm run validate:review` · `npm run validate:docs` · `npm run license:check` — **all seven must pass before push, on every pull request.**

`validate:bank` is **milestone-aware**, reading the current milestone from `config/bank.config.json`. It fails on: duplicate IDs or stems · schema violations · unmapped objective IDs · a domain that disagrees with its objective · failed `verify` assertions · hands-on tasks lacking a valid `expectedState` · an in-scope sub-objective below the milestone floor · a per-domain format count below its matrix cell · **proportional drift** `|count_d − target_d × (current_total / milestone_target)| > ±2`.

Two deliberate carve-outs, both stated so they cannot be abused to ship a bad bank:

- **Allocation drift is informational until the milestone is 25% underway.** Authoring goes domain by domain, and at a small bank size a ±2 proportional tolerance is tighter than any real batching strategy can meet. Past 25% it is enforced; the exact-total check at milestone close is what actually guarantees the finished bank matches the allocation.
- **The exact-total check runs only when a milestone is closed**, never per batch.

An empty bank passes the coverage check rather than reporting 97 phantom violations; the floor activates on the first question. Completeness still comes from the milestone-close total.

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
| 0 | Toolchain + CI + nine artifacts: Node 22 LTS, Vite, React 19, Tailwind v4, Vitest, ESLint; GitHub Actions; **this document**, incl. the appendix below generated from `objectives.json`; `not-emulated.json`; `bank.config.json`; `allocate-bank.mjs`; four validators; README with `git clone && npm ci && npm run dev` | **12** | CI green on empty bank; all four validators exercised |
| 1 | Exam-day shell over synthetic fixtures: timer, one-way nav, flag, review screen, auto-submit, scoring contract | 8 | Owner walks a 100-item fixture exam end-to-end; `exam.test.ts` green |
| 2 | Pilot bank: 60 questions over the 30-sub-objective subset, **all three authored formats (`mcq-single`, `mcq-multi`, `drag-drop`)**. 60 × 13–19 min | 13–19 | `validate:bank` green at pilot target; pilot exams in practice mode |
| 3 | `show-output` modifier, generated `NOT-EMULATED.md`, scoring verified per authored format, **plus acting on pilot feedback (4 h)** | 8 | all three authored formats render and score correctly |
| 4 | Emulator core: 5 `DeviceState` sub-reducers, `LabHarness`, `CliEngine`, `expectedState.js`, 16 config families (2.5–3.5 h each), 10 h engine, 8 h renderers, golden fixtures | 58–74 | all 16 families mutate state correctly; 4 renderers byte-match fixtures |
| 5 | 15 hands-on tasks: 12 CLI × 1.5–2 h + 3 WLC × 3–4 h + `WlcState` 6 h | 33–42 | all 15 tasks run end-to-end and grade via `expectedState` |
| 6 | Bank growth 60 → 300 in batches of ≤40. 240 × 13–19 min | 52–76 | every sub-objective ≥2 at v1; drift within ±2 |
| 7 | Ambiguity pass 3 h + 15% sample (45 × 6 min) 4.5 h + rotation 2 h + CONTRIBUTING 2 h | 12 | 15% milestone sample re-read |

**Honest scale: 196–251 hours, 49–63 four-hour sessions.** Phases 0–3 (**41–47 h, 11–12 sessions**) ship a usable, format-faithful practice exam over 60 questions and three formats. The emulator and task library (Phases 4–5, **91–116 h**) are the dominant fidelity cost and deliberately come last. Every batch merged in Phase 6 is independently usable, so the project can stop at any boundary.

## 13. Non-negotiables

1. No third-party content — `license:check` fails on any non-MIT **direct** dependency or missing provenance header; transitive licences are advisory only, because the Vite/Tailwind trees include ISC packages
2. No question without an explanation and distractor rationales
3. No question without passing all seven gates
4. One-way navigation during the exam pass; the pre-submit review screen is the only way back
5. Timer and auto-submit behave as the real thing; unanswered items grade incorrect; mid-task expiry earns no partial credit and is disclosed
6. Full-length results are pass/fail plus per-domain proficiency — never a scaled score or percentage; practice-mode results carry no verdict
7. All seven CI gates green before push
8. Any fact not published by Cisco is labelled community-reported or observed, in code and UI

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
| **Bank target beyond 300** | **Open** — 450 is a later milestone, not committed |
| **Scope beyond Phase 3** | **Open** — full 196–251 h, or the 41–47 h subset with hands-on deferred |

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
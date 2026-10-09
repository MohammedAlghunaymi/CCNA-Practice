/**
 * Corpus-level validation of the question bank.
 *
 * Every check here is milestone-aware. A partially merged batch inside a
 * milestone is judged on floors, coverage and *proportional* drift, never on a
 * count that only applies at milestone close. That is what lets incremental
 * batches merge instead of deadlocking the whole bank behind one gate.
 */
import { validateQuestionShape, validateObjectiveMapping } from './questionSchema.js'
import { evaluateVerify } from './verify.js'
import { proportionalDrift, examDrawQuota } from './allocation.js'

const DRIFT_TOLERANCE = 2

/**
 * Minimum questions per domain carrying each presentation preamble, enforced at
 * milestone close. CLI domains get IOS output; Automation gets JSON output
 * because 6.5-6.7 carry no configure-and-verify verb, so an IOS-CLI floor there
 * would force content the blueprint does not describe.
 */
const CLI_DOMAINS = ['NF', 'NA', 'IPC', 'IPS', 'SEC']
const JSON_DOMAINS = ['AUTO']
const PREAMBLE_FLOOR = 2

/**
 * @param {Object} input
 * @param {Array}  input.questions   every question across all domain files
 * @param {Object} input.objectives  indexObjectives() output
 * @param {Object} input.config      bank.config.json
 * @param {string} input.milestone   which milestone to judge against
 * @param {boolean} [input.checkTotal] enforce the exact total (milestone close only)
 * @param {boolean} [input.openBank]  allow shape errors while the bank is mid-authoring
 * @param {Array}    [input.adoptionRegistry] rows from docs/ADOPTED.md, to cross-check adopted questions
 */
export function validateBank({
  questions,
  objectives,
  config,
  milestone,
  checkTotal = false,
  adoptionRegistry = null,
}) {
  const results = []
  const record = (name, pass, detail) => results.push({ name, pass, detail })

  const spec = config.milestones[milestone]
  if (!spec) throw new Error(`unknown milestone "${milestone}" in bank.config.json`)

  const allocation = config.allocation?.byMilestone?.[milestone]
  const currentTotal = questions.length

  // ---- 1. duplicate ids -------------------------------------------------
  const idCounts = new Map()
  for (const q of questions) idCounts.set(q.id, (idCounts.get(q.id) ?? 0) + 1)
  const dupIds = [...idCounts.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`)
  record('Zero duplicate question IDs', dupIds.length === 0,
    dupIds.length ? `duplicates: ${dupIds.join(', ')}` : `${currentTotal} questions, ${idCounts.size} distinct ids`)

  // ---- 2. duplicate stems ------------------------------------------------
  const stemCounts = new Map()
  for (const q of questions) {
    const key = (q.prompt ?? '').trim().toLowerCase()
    stemCounts.set(key, (stemCounts.get(key) ?? 0) + 1)
  }
  const dupStems = [...stemCounts.entries()].filter(([, n]) => n > 1).map(([stem, n]) => `"${stem.slice(0, 48)}" x${n}`)
  record('Zero duplicate question prompts', dupStems.length === 0,
    dupStems.length ? `duplicates: ${dupStems.join(', ')}` : `${stemCounts.size} distinct stems`)

  // ---- 3. shape ---------------------------------------------------------
  const shapeErrors = []
  for (const q of questions) {
    for (const error of validateQuestionShape(q)) shapeErrors.push(`${q.id ?? '?'}: ${error}`)
  }
  record('Every question satisfies the schema', shapeErrors.length === 0,
    shapeErrors.length ? `${shapeErrors.length} error(s): ${shapeErrors.slice(0, 6).join('; ')}` : `${currentTotal} questions valid`)

  // ---- 4. objective mapping ---------------------------------------------
  const mappingErrors = []
  for (const q of questions) {
    for (const error of validateObjectiveMapping(q, objectives)) mappingErrors.push(`${q.id}: ${error}`)
  }
  record('Every question maps to a real sub-objective in its declared domain', mappingErrors.length === 0,
    mappingErrors.length ? `${mappingErrors.length} error(s): ${mappingErrors.slice(0, 6).join('; ')}` : 'all mapped')

  // ---- 5. computational assertions -------------------------------------
  const verifyErrors = []
  let verified = 0
  for (const q of questions) {
    if (!q.verify) continue
    verified++
    const result = evaluateVerify(q.verify)
    if (!result.pass) verifyErrors.push(`${q.id}: ${result.errors.join('; ')}`)
  }
  record('Every computational question agrees with real arithmetic', verifyErrors.length === 0,
    verifyErrors.length ? verifyErrors.slice(0, 6).join('; ') : `${verified} computational question(s) verified`)

  // ---- 6. coverage floor for in-scope sub-objectives ---------------------
  // Read the per-domain table, never a global constant: each milestone has its
  // own balanced minimums, and Q3 is the single source for them.
  const floorsByDomain = config.floorsByMilestone?.[milestone]
  if (!floorsByDomain) {
    throw new Error(
      `validateBank: floorsByMilestone has no entry for milestone "${milestone}"`
    )
  }

  const scopeIds = new Set()
  if (spec.scope === 'pilotSubset') {
    for (const id of config.pilotSubset) scopeIds.add(id)
  } else {
    for (const ids of Object.values(objectives.leafIdsByDomain)) for (const id of ids) scopeIds.add(id)
  }

  const countsByObjective = new Map()
  for (const q of questions) countsByObjective.set(q.objectiveId, (countsByObjective.get(q.objectiveId) ?? 0) + 1)

  // An empty bank has no coverage defect yet, and Phase 0 must be able to go
  // green before any question is authored. So the floor activates on the first
  // question rather than reporting 97 phantom violations. Completeness is still
  // guaranteed: the exact-total check runs at milestone close.
  const started = currentTotal > 0
  const underFloor = [...scopeIds].filter((id) => {
    const domain = objectives.domainById[id]
    const minimum = floorsByDomain[domain] ?? spec.floorPerObjective
    return (countsByObjective.get(id) ?? 0) < minimum
  })

  const minFloors = [...new Set(Object.values(floorsByDomain))]
  const floorLabel = minFloors.length === 1
    ? `${minFloors[0]} question(s)`
    : `at least ${Math.min(...minFloors)} question(s), rising per domain`

  record(
    `Every in-scope sub-objective has ${floorLabel}`,
    !started || underFloor.length === 0,
    !started
      ? `bank is empty; coverage activates on the first question. ${scopeIds.size} topics in scope.`
      : underFloor.length
        ? `${underFloor.length}/${scopeIds.size} below floor: ${underFloor.slice(0, 10).join(', ')}${underFloor.length > 10 ? ' ...' : ''}`
        : `${scopeIds.size} in-scope topics all at or above floor`
  )

  // ---- 7. per-domain format floors, scaled to current bank size ---------
  const matrix = config.exam.domainFormatMatrix
  const formatCounts = {}
  for (const q of questions) {
    formatCounts[q.domain] ??= {}
    formatCounts[q.domain][q.type] = (formatCounts[q.domain][q.type] ?? 0) + 1
  }

  const scale = currentTotal / config.exam.defaultLength
  const formatShortfalls = []
  for (const row of matrix) {
    for (const type of config.exam.types) {
      const needed = Math.ceil(row[type] * scale)
      const have = formatCounts[row.domain]?.[type] ?? 0
      if (have < needed) formatShortfalls.push(`${row.domain}/${type} has ${have}, needs ${needed}`)
    }
  }
  record('Per-domain format counts can fill the exam matrix', formatShortfalls.length === 0,
    formatShortfalls.length ? formatShortfalls.slice(0, 8).join('; ') : 'all domain x format cells satisfiable')

  // ---- 8. proportional allocation drift ---------------------------------
  // Authoring happens domain by domain, so at a small bank size a +/-2
  // proportional tolerance is tighter than any real batching strategy can meet
  // (at 10 questions it means +/-20% of the whole bank). Drift is therefore
  // enforced only once a milestone is meaningfully underway, and reported as
  // informational before that. The exact-total check at milestone close is
  // what actually guarantees the finished bank matches the allocation.
  const DRIFT_ENFORCE_FROM = 0.25

  if (allocation) {
    const progress = currentTotal / spec.target
    const enforce = progress >= DRIFT_ENFORCE_FROM

    const byDomain = {}
    for (const q of questions) byDomain[q.domain] = (byDomain[q.domain] ?? 0) + 1
    const drifted = []
    for (const [domain, target] of Object.entries(allocation.perDomain)) {
      const drift = proportionalDrift(byDomain[domain] ?? 0, target, currentTotal, spec.target)
      if (drift > DRIFT_TOLERANCE) {
        drifted.push(`${domain} drift ${drift.toFixed(1)} (have ${byDomain[domain] ?? 0}, target ${target})`)
      }
    }

    record(
      `Per-domain allocation drift within +/-${DRIFT_TOLERANCE} (proportional to progress)`,
      !enforce || drifted.length === 0,
      drifted.length === 0
        ? `all domains within tolerance at ${currentTotal}/${spec.target} questions`
        : enforce
          ? drifted.join('; ')
          : `informational only until ${Math.round(DRIFT_ENFORCE_FROM * 100)}% of the milestone ` +
            `(now ${Math.round(progress * 100)}%): ${drifted.join('; ')}`
    )
  } else {
    record('Per-domain allocation drift within +/-2', false,
      'no frozen allocation for this milestone; run scripts/allocate-bank.mjs')
  }

  // ---- 9. declared topic counts match the data --------------------------
  const leafCountErrors = objectives.leafCountErrors ?? []
  record(
    'Declared leaf counts match the counted testable topics',
    leafCountErrors.length === 0,
    leafCountErrors.length
      ? leafCountErrors.slice(0, 6).join('; ')
      : `${objectives.counts?.leafTotal ?? '?'} testable topics, ` +
        `${objectives.counts?.parentTotal ?? '?'} non-leaf parents, ` +
        `${objectives.counts?.nodeTotal ?? '?'} nodes`
  )

  // ---- 10. bank supply must cover the exam draw --------------------------
  // The demand side of the allocation contract. Without this a milestone can
  // close at its target and still be undrawable: the shipped pilot config asked
  // for 15 IP Connectivity questions from a bank holding 14.
  const examLength = spec.examLength ?? config.exam.defaultLength
  if (allocation) {
    const quota = examDrawQuota({ matrix: config.exam.domainFormatMatrix, length: examLength })
    const shortfalls = []
    for (const [domain, need] of Object.entries(quota)) {
      const supply = allocation.perDomain[domain] ?? 0
      if (supply < need) shortfalls.push(`${domain} needs ${need}, bank holds ${supply}`)
    }
    record(
      `Bank supply covers the ${examLength}-question exam draw for ${milestone}`,
      shortfalls.length === 0,
      shortfalls.length
        ? shortfalls.slice(0, 6).join('; ')
        : `every domain can supply its quota of a ${examLength}-question exam`
    )
  } else {
    record(`Bank supply covers the ${examLength}-question exam draw for ${milestone}`, false,
      'no frozen allocation for this milestone; run scripts/allocate-bank.mjs')
  }

  // ---- 11. show-output / show-json floors --------------------------------
  // Only enforceable once the batch is complete; mid-milestone authoring
  // domain by domain would otherwise fail on a domain not yet reached.
  const preambleCounts = {}
  for (const q of questions) {
    if (!q.preamble) continue
    preambleCounts[q.domain] ??= { 'show-output': 0, 'show-json': 0 }
    preambleCounts[q.domain][q.preamble] =
      (preambleCounts[q.domain][q.preamble] ?? 0) + 1
  }

  const floors = [
    ...CLI_DOMAINS.map((domain) => [domain, 'show-output']),
    ...JSON_DOMAINS.map((domain) => [domain, 'show-json']),
  ]
  const floorShortfalls = floors
    .filter(([domain, preamble]) => (preambleCounts[domain]?.[preamble] ?? 0) < PREAMBLE_FLOOR)
    .map(([domain, preamble]) => `${domain} has ${preambleCounts[domain]?.[preamble] ?? 0}, needs ${PREAMBLE_FLOOR} ${preamble}`)

  record(
    `Every CLI domain carries >=${PREAMBLE_FLOOR} show-output items and Automation >=${PREAMBLE_FLOOR} show-json`,
    !checkTotal || floorShortfalls.length === 0,
    !checkTotal
      ? `enforced at milestone close; currently ${Object.entries(preambleCounts)
          .flatMap(([domain, counts]) => Object.entries(counts).map(([p, n]) => `${domain}/${p}=${n}`))
          .join(', ') || 'no preamble items yet'}`
      : floorShortfalls.length
        ? floorShortfalls.join('; ')
        : 'all preamble floors met'
  )

  // ---- 12. illustrative items must disclose themselves --------------------
  const ILUSTRATIVE_MARKER = '[illustrative]'
  const unmarked = questions
    .filter((q) => Array.isArray(q.sources) && q.sources.some((s) => s.kind === 'illustrative'))
    .filter((q) => !String(q.prompt ?? '').includes(ILUSTRATIVE_MARKER))
    .map((q) => q.id)

  record(
    `Every [illustrative] item carries the ${ILUSTRATIVE_MARKER} marker in its stem`,
    unmarked.length === 0,
    unmarked.length
      ? `${unmarked.length} item(s) missing the marker: ${unmarked.slice(0, 6).join(', ')}`
      : `${questions.filter((q) => Array.isArray(q.sources)).length} sourced item(s) checked`
  )

  // ---- 13. adopted questions are recorded and attributed -------------------
  // An adopted question must name its source AND that source must be listed in
  // docs/ADOPTED.md. Schema validation already rejects a malformed `upstream`
  // block; this check is what stops the legal record drifting away from the
  // content, which is the failure that would actually matter.
  const adopted = questions.filter((q) => q.upstream)
  const registry = adoptionRegistry
  const unregistered = registry
    ? adopted
        .filter((q) => !registry.some((row) => row.upstreamId === q.upstream.id))
        .map((q) => `${q.id} -> ${q.upstream.id}`)
    : []

  record(
    'Every adopted question is registered in docs/ADOPTED.md',
    unregistered.length === 0,
    adopted.length === 0
      ? 'no adopted questions'
      : !registry
        ? `${adopted.length} adopted question(s); no adoption registry supplied, skipping`
        : unregistered.length
          ? `${unregistered.length} unregistered: ${unregistered.slice(0, 6).join(', ')}`
          : `all ${adopted.length} adopted questions registered in ADOPTED.md`
  )

  // ---- 14. no unshippable placeholder rationale ---------------------------
  // Adopted questions arrive with a single upstream explanation, not a
  // rationale per wrong option. Our own defence against a defensible second
  // answer is that rationale, so an unreplaced TODO must never reach a closed
  // milestone. This is why the adopted bank can sit in the repo now and still
  // be unmergeable at milestone close.
  const placeholders = questions
    .filter((q) =>
      q.options && Object.values(q.options).some((o) => o.rationale === 'TODO: explain why this is wrong')
    )
    .map((q) => q.id)

  record(
    'Every wrong option carries a real rationale',
    placeholders.length === 0,
    placeholders.length === 0
      ? `${questions.filter((q) => q.options).length} question(s) fully rationalised`
      : `${placeholders.length} option(s) still hold a TODO placeholder, ` +
        `first: ${placeholders.slice(0, 6).join(', ')}`
  )

  // ---- 15. exact total, milestone close only -----------------------------
  if (checkTotal) {
    record(`Total equals the ${milestone} target of ${spec.target}`, currentTotal === spec.target,
      currentTotal === spec.target ? `${currentTotal} questions` : `${currentTotal} vs target ${spec.target}`)
  }

  return {
    results,
    stats: {
      total: currentTotal,
      milestone,
      target: spec.target,
      examLength: spec.examLength ?? config.exam.defaultLength,
      floors: floorsByDomain,
      inScope: scopeIds.size,
    },
  }
}
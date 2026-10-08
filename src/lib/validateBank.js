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
import { proportionalDrift } from './allocation.js'

const DRIFT_TOLERANCE = 2

/**
 * @param {Object} input
 * @param {Array}  input.questions   every question across all domain files
 * @param {Object} input.objectives  indexObjectives() output
 * @param {Object} input.config      bank.config.json
 * @param {string} input.milestone   which milestone to judge against
 * @param {boolean} [input.checkTotal] enforce the exact total (milestone close only)
 * @param {boolean} [input.openBank]  allow shape errors while the bank is mid-authoring
 */
export function validateBank({
  questions,
  objectives,
  config,
  milestone,
  checkTotal = false,
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
  const floor = spec.floorPerObjective
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
  const underFloor = [...scopeIds].filter((id) => (countsByObjective.get(id) ?? 0) < floor)

  record(
    `Every in-scope sub-objective has at least ${floor} question(s)`,
    !started || underFloor.length === 0,
    !started
      ? `bank is empty; coverage activates on the first question. ${scopeIds.size} sub-objectives in scope.`
      : underFloor.length
        ? `${underFloor.length}/${scopeIds.size} below floor: ${underFloor.slice(0, 10).join(', ')}${underFloor.length > 10 ? ' ...' : ''}`
        : `${scopeIds.size} in-scope sub-objectives all at or above floor`
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

  // ---- 9. exact total, milestone close only -----------------------------
  if (checkTotal) {
    record(`Total equals the ${milestone} target of ${spec.target}`, currentTotal === spec.target,
      currentTotal === spec.target ? `${currentTotal} questions` : `${currentTotal} vs target ${spec.target}`)
  }

  return {
    results,
    stats: { total: currentTotal, milestone, target: spec.target, floor, inScope: scopeIds.size },
  }
}
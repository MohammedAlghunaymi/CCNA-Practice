/**
 * Single-question schema validation. Pure and dependency-free so it can be
 * unit-tested and reused by the CLI validator, the editor tooling and CI.
 *
 * Design rule from the plan: a question that cannot justify why each wrong
 * option is wrong does not ship. The rationale requirement is the main defence
 * against a defensible second answer slipping through.
 */

export const QUESTION_TYPES = ['mcq-single', 'mcq-multi', 'drag-drop', 'hands-on']
/**
 * `show-output` presents captured or transcribed IOS CLI output; `show-json`
 * presents REST/Ansible/Python JSON output. Automation objectives carry the
 * latter because they are not CLI configure-and-verify work.
 */
export const PREAMBLES = ['show-output', 'show-json', null]
export const SOURCE_KINDS = ['capture', 'published', 'illustrative']
export const DIFFICULTIES = ['easy', 'medium', 'hard']

export const EXPECTED_STATE_OPS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'exists',
  'notExists',
  'greaterThanOrEqual',
  'lessThanOrEqual',
  'truthy',
]

/** Structural validation of a single question object. Returns a string[]. */
export function validateQuestionShape(question) {
  const errors = []
  const q = question

  if (!q || typeof q !== 'object') return ['question is not an object']

  if (typeof q.id !== 'string' || !q.id.trim()) errors.push('id must be a non-empty string')
  if (typeof q.objectiveId !== 'string' || !q.objectiveId.trim()) {
    errors.push('objectiveId must be a non-empty string')
  }
  if (typeof q.domain !== 'string' || !q.domain.trim()) errors.push('domain must be a non-empty string')
  if (!QUESTION_TYPES.includes(q.type)) {
    errors.push(`type must be one of ${QUESTION_TYPES.join(', ')} (got ${JSON.stringify(q.type)})`)
  }
  if (!PREAMBLES.includes(q.preamble ?? null)) {
    errors.push(
      `preamble must be null, "show-output" or "show-json" (got ${JSON.stringify(q.preamble)})`
    )
  }
  if (q.preamble && q.type === 'hands-on') {
    errors.push('hands-on items carry their task in expectedState, not a show preamble')
  }
  errors.push(...validatePreambleDisclosure(q))
  if (typeof q.prompt !== 'string' || !q.prompt.trim()) errors.push('prompt must be a non-empty string')
  if (!DIFFICULTIES.includes(q.difficulty)) {
    errors.push(`difficulty must be one of ${DIFFICULTIES.join(', ')}`)
  }
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) {
    errors.push('explanation is required on every question')
  }
  if (typeof q.batch !== 'string' || !q.batch.trim()) errors.push('batch must be a non-empty string')
  errors.push(...validateProvenance(q))

  if (q.type === 'hands-on') {
    errors.push(...validateExpectedState(q.expectedState))
  } else {
    errors.push(...validateAnswerAndOptions(q))
  }

  if (q.type === 'drag-drop') {
    errors.push(...validatePairs(q))
    errors.push(...validateDragDropAnswer(q))
  }

  return errors
}

/**
 * Answer keys must resolve, and every wrong option must carry a rationale.
 * All-or-nothing scoring: `answer` is the exact set of correct keys.
 */
function validateAnswerAndOptions(q) {
  const errors = []

  if (q.type === 'drag-drop') return errors

  if (!q.options || typeof q.options !== 'object') {
    errors.push('options object is required')
    return errors
  }

  const keys = Object.keys(q.options)
  if (keys.length < 2) errors.push('at least two options are required')

  if (!Array.isArray(q.answer) || q.answer.length === 0) {
    errors.push('answer must be a non-empty array of option keys')
    return errors
  }

  const correct = []
  for (const [key, option] of Object.entries(q.options)) {
    if (!option || typeof option.text !== 'string' || !option.text.trim()) {
      errors.push(`option ${key} must have non-empty text`)
      continue
    }
    if (option.correct === true) {
      correct.push(key)
      if (q.type === 'mcq-single' && option.rationale) {
        errors.push(`option ${key} is correct; a correct option must not carry a rationale`)
      }
    } else {
      if (typeof option.rationale !== 'string' || !option.rationale.trim()) {
        errors.push(
          `option ${key} is wrong but has no rationale explaining why it is wrong`
        )
      }
    }
  }

  const answered = [...q.answer].sort()
  const expected = correct.sort()
  if (answered.length !== expected.length || answered.some((k, i) => k !== expected[i])) {
    errors.push(
      `answer [${answered.join(', ')}] does not match the correct options [${expected.join(', ')}]`
    )
  }

  if (q.type === 'mcq-single' && q.answer.length > 1) {
    errors.push('mcq-single must have exactly one correct answer')
  }

  return errors
}

/**
 * Drag-and-drop uses positional slots. Repeated text is legal on either side,
 * because chips are matched by position rather than by value.
 */
function validatePairs(q) {
  const errors = []
  if (!Array.isArray(q.pairs) || q.pairs.length === 0) {
    errors.push('drag-drop requires a non-empty pairs array')
    return errors
  }

  const seen = new Set()
  q.pairs.forEach((pair, index) => {
    if (!pair || typeof pair.left !== 'string' || !pair.left.trim()) {
      errors.push(`pairs[${index}] needs a non-empty left value`)
    }
    if (!pair || typeof pair.right !== 'string' || !pair.right.trim()) {
      errors.push(`pairs[${index}] needs a non-empty right value`)
    }
    const key = `${pair?.left}=>${pair?.right}`
    if (seen.has(key)) errors.push(`pairs[${index}] duplicates an earlier pairing (${key})`)
    seen.add(key)
  })

  return errors
}

/**
 * `preamble` is a tag, not a payload. It records that an item presents device
 * output; it says nothing about what that output is. `preambleText` carries the
 * payload the student actually reads, and it renders above the stem at both
 * render sites, which makes it a disclosure surface - so it cannot be
 * ungoverned.
 *
 *   1. `preambleText` is required, non-empty, whenever `preamble` is set.
 *   2. `sources` is required whenever there is anything to disclose - either
 *      signal, not just the first.
 *
 * The OR in rule 2 is the whole point. The hands-on rule above forbids the
 * `preamble` *flag*, not the payload, and `validateQuestionShape` rejects no
 * unknown keys, so without the OR an item could carry `preamble: null` plus a
 * rendered `preambleText` and cite nothing at all. Rendered payload implies
 * non-empty preambleText implies sources, so one rule closes the path.
 *
 * `kind` is compared lower-cased so a capitalised `Illustrative` is *accepted*
 * here rather than punished: the check that has to catch it is the marker
 * requirement, and that lives at validateBank.js:271, which does the same
 * normalisation.
 */
function validatePreambleDisclosure(q) {
  const errors = []
  const hasPreambleTag = (q.preamble ?? null) !== null
  const text = typeof q.preambleText === 'string' ? q.preambleText.trim() : ''

  if (hasPreambleTag && !text) {
    errors.push('preambleText is required and must be non-empty when preamble is set')
  }

  if (!hasPreambleTag && !text) return errors

  if (!Array.isArray(q.sources) || q.sources.length === 0) {
    errors.push('sources is required and must be non-empty when an item presents a preamble payload')
    return errors
  }

  q.sources.forEach((source, index) => {
    const at = `sources[${index}]`
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      errors.push(`${at} must be an object`)
      return
    }
    const kind = typeof source.kind === 'string' ? source.kind.trim().toLowerCase() : ''
    if (!SOURCE_KINDS.includes(kind)) {
      errors.push(
        `${at}.kind must be one of ${SOURCE_KINDS.join(', ')} (got ${JSON.stringify(source.kind)})`
      )
      return
    }
    // A capture is a claim that someone ran this, so it has to say on what.
    if (kind === 'capture') {
      for (const field of ['platform', 'iosVersion', 'command']) {
        if (typeof source[field] !== 'string' || !source[field].trim()) {
          errors.push(`${at} is a capture, so it needs a non-empty ${field}`)
        }
      }
    }
  })

  return errors
}

/**
 * A drag-drop key is positional: slot i names `pairs[i].right`. PROJECT.md:68
 * used to say this two ways at once - "every slot holds a token declared in that
 * item's `pairs` (positional; repeats legal either side)" - which reads as
 * membership and as positional simultaneously.
 *
 * This is the check `validateAnswerAndOptions` structurally cannot make: it
 * returns early for drag-drop above, before it ever looks at `answer`, so before
 * this function nothing validated the key at all.
 *
 * A key shorter than `pairs` is allowed and means those trailing slots were
 * never filled; grading is all-or-nothing, so any learner who fills them is
 * wrong on those slots. A key longer than `pairs` has no slot to point at.
 */
function validateDragDropAnswer(q) {
  const errors = []
  if (q.answer === undefined || q.answer === null) return errors

  if (!Array.isArray(q.answer) || q.answer.length === 0) {
    errors.push('drag-drop answer must be a non-empty array of tokens, one per slot')
    return errors
  }

  const pairs = Array.isArray(q.pairs) ? q.pairs : []
  if (q.answer.length > pairs.length) {
    errors.push(
      `answer has ${q.answer.length} tokens but the item declares only ${pairs.length} slot(s)`
    )
  }

  q.answer.forEach((token, slot) => {
    if (typeof token !== 'string' || !token.trim()) {
      errors.push(`answer[${slot}] must be a non-empty token`)
      return
    }
    const expected = pairs[slot]?.right
    if (slot < pairs.length && token !== expected) {
      errors.push(
        `answer[${slot}] is "${token}" but slot ${slot} holds "${expected}" - ` +
          'the key is positional (PROJECT.md 7a)'
      )
    }
  })

  return errors
}

/**
 * `expectedState` is a declarative, JSON-serialisable DSL so it can live in the
 * question file, diff cleanly in review, and be evaluated without executing
 * anything from the data directory.
 *
 * Shape: { all: [ { path, op, value? }, ... ] }  - every predicate must hold.
 */
function validateExpectedState(state) {
  const errors = []

  if (!state || typeof state !== 'object') {
    errors.push('hands-on question requires an expectedState predicate')
    return errors
  }
  if (!Array.isArray(state.all) || state.all.length === 0) {
    errors.push('expectedState.all must be a non-empty array of predicates')
    return errors
  }

  state.all.forEach((predicate, index) => {
    if (!predicate || typeof predicate !== 'object') {
      errors.push(`expectedState.all[${index}] must be an object`)
      return
    }
    if (typeof predicate.path !== 'string' || !predicate.path.trim()) {
      errors.push(`expectedState.all[${index}] needs a non-empty path`)
    }
    if (!EXPECTED_STATE_OPS.includes(predicate.op)) {
      errors.push(
        `expectedState.all[${index}].op must be one of ${EXPECTED_STATE_OPS.join(', ')}`
      )
    }
    const needsValue = !['exists', 'notExists', 'truthy'].includes(predicate.op)
    if (needsValue && (predicate.value === undefined || predicate.value === null)) {
      errors.push(`expectedState.all[${index}] op "${predicate.op}" requires a value`)
    }
  })

  return errors
}

/**
 * Provenance for adopted questions.
 *
 * A question carrying `upstream` was taken from a third-party MIT-licensed
 * project rather than authored here, so it has to say exactly where it came
 * from: which project, at which commit, and under which upstream id. That record
 * is what makes the adoption auditable rather than a claim in a README, and it
 * is why `validateBank` can cross-check it against docs/ADOPTED.md.
 *
 * Optional field `adapted` records work done on top of the upstream text beyond
 * the objective re-key, so a later reviewer can tell a re-key from a rewrite.
 */
function validateProvenance(q) {
  const errors = []
  if (q.upstream === undefined || q.upstream === null) return errors

  const u = q.upstream
  if (typeof u !== 'object' || Array.isArray(u)) {
    return ['upstream must be an object with project, commit, id and licence']
  }

  for (const field of ['project', 'commit', 'id', 'licence']) {
    if (typeof u[field] !== 'string' || !u[field].trim()) {
      errors.push(`upstream.${field} must be a non-empty string`)
    }
  }

  // A commit must be a full 40-character SHA. A branch or tag name would let the
  // referenced content move underneath us, which is the whole thing this record
  // exists to prevent.
  if (typeof u.commit === 'string' && u.commit.trim() && !/^[0-9a-f]{40}$/.test(u.commit.trim())) {
    errors.push(`upstream.commit must be a full 40-character SHA, got "${u.commit}"`)
  }

  if (u.adapted !== undefined && typeof u.adapted !== 'string') {
    errors.push('upstream.adapted, when present, must be a string describing the adaptation')
  }

  return errors
}

/** Objective IDs must exist in objectives.json and match the declared domain. */
export function validateObjectiveMapping(question, objectives) {
  const errors = []
  const objective = objectives.byId[question.objectiveId]

  if (!objective) {
    errors.push(`objectiveId "${question.objectiveId}" is not in objectives.json`)
    return errors
  }
  if (objective.domain !== question.domain) {
    errors.push(
      `objectiveId "${question.objectiveId}" belongs to domain ${objective.domain}, ` +
        `but the question declares ${question.domain}`
    )
  }
  return errors
}

/**
 * Index objectives.json into a fast lookup used by the validators.
 *
 * Also recounts the declared `leafCount` fields. The plan's "97 topics" is the
 * LEAF-ONLY count: lettered sub-objectives and unlettered leaf objectives each
 * count once, while non-leaf parents are containers and do not. The declared
 * numbers are duplicated metadata, so they can drift from the data, and nothing
 * else checks them.
 */
export function indexObjectives(objectives) {
  const byId = {}
  const domainById = {}
  const leavesByDomain = {}
  const leafIdsByDomain = {}
  const declaredLeafCount = objectives.meta?.leafCount
  const declaredDomainLeafCount = {}
  let leafTotal = 0
  let parentTotal = 0
  const leafCountErrors = []

  for (const domain of objectives.domains) {
    declaredDomainLeafCount[domain.id] = domain.leafCount
    const leaves = domain.objectives.filter((o) => o.isLeaf)
    leavesByDomain[domain.id] = leaves.length
    leafTotal += leaves.length
    if (domain.leafCount !== undefined && domain.leafCount !== leaves.length) {
      leafCountErrors.push(
        `domain ${domain.id} declares leafCount ${domain.leafCount} but holds ${leaves.length} testable topics`
      )
    }
    leafIdsByDomain[domain.id] = []
    for (const objective of domain.objectives) {
      byId[objective.id] = { ...objective, domain: domain.id }
      domainById[objective.id] = domain.id
      if (objective.isLeaf) leafIdsByDomain[domain.id].push(objective.id)
      else parentTotal++
    }
  }

  if (declaredLeafCount !== undefined && declaredLeafCount !== leafTotal) {
    leafCountErrors.push(
      `meta.leafCount declares ${declaredLeafCount} but the domains hold ${leafTotal} testable topics`
    )
  }

  return {
    byId,
    domainById,
    leavesByDomain,
    leafIdsByDomain,
    leafCountErrors,
    declaredLeafCount,
    declaredDomainLeafCount,
    counts: { leafTotal, parentTotal, nodeTotal: leafTotal + parentTotal },
  }
}
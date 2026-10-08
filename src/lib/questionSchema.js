/**
 * Single-question schema validation. Pure and dependency-free so it can be
 * unit-tested and reused by the CLI validator, the editor tooling and CI.
 *
 * Design rule from the plan: a question that cannot justify why each wrong
 * option is wrong does not ship. The rationale requirement is the main defence
 * against a defensible second answer slipping through.
 */

export const QUESTION_TYPES = ['mcq-single', 'mcq-multi', 'drag-drop', 'hands-on']
export const PREAMBLES = ['show-output', null]
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
    errors.push(`preamble must be null or "show-output" (got ${JSON.stringify(q.preamble)})`)
  }
  if (typeof q.prompt !== 'string' || !q.prompt.trim()) errors.push('prompt must be a non-empty string')
  if (!DIFFICULTIES.includes(q.difficulty)) {
    errors.push(`difficulty must be one of ${DIFFICULTIES.join(', ')}`)
  }
  if (typeof q.explanation !== 'string' || !q.explanation.trim()) {
    errors.push('explanation is required on every question')
  }
  if (typeof q.batch !== 'string' || !q.batch.trim()) errors.push('batch must be a non-empty string')

  if (q.type === 'hands-on') {
    errors.push(...validateExpectedState(q.expectedState))
  } else {
    errors.push(...validateAnswerAndOptions(q))
  }

  if (q.type === 'drag-drop') errors.push(...validatePairs(q))

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

/** Index objectives.json into a fast lookup used by the validators. */
export function indexObjectives(objectives) {
  const byId = {}
  const domainById = {}
  const leavesByDomain = {}
  const leafIdsByDomain = {}

  for (const domain of objectives.domains) {
    leavesByDomain[domain.id] = domain.objectives.filter((o) => o.isLeaf).length
    leafIdsByDomain[domain.id] = []
    for (const objective of domain.objectives) {
      byId[objective.id] = { ...objective, domain: domain.id }
      domainById[objective.id] = domain.id
      if (objective.isLeaf) leafIdsByDomain[domain.id].push(objective.id)
    }
  }

  return { byId, domainById, leavesByDomain, leafIdsByDomain }
}
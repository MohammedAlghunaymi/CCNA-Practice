/**
 * Exam scoring.
 *
 * All-or-nothing: a multi-answer item is correct only when the selected set is
 * exactly the answer key. There is no partial credit, which matches
 * `scoring.partialCredit: false` in bank.config.json. A defensible second
 * answer slipping through is the failure mode this rule is designed to make
 * visible rather than reward.
 *
 * Every returned field derives from a single pass over `questions`, so a
 * wrong-but-answered id and an unanswered id can never be confused downstream.
 */

/** True when the selected keys are exactly the answer key, ignoring order. */
export function isCorrectSet(selected, expected) {
  if (!Array.isArray(selected)) return false
  const a = [...selected].sort()
  const b = [...expected].sort()
  if (a.length !== b.length) return false
  return a.every((key, index) => key === b[index])
}

/**
 * Grade one drag-drop placement, positionally.
 *
 * Slot i must hold `pairs[i].right`. All-or-nothing, like every other format here
 * and matching `scoring.partialCredit: false`.
 *
 * Two consequences worth stating, because both are traps:
 *
 * - It is positional, not a set comparison. `isCorrectSet` would sort
 *   `[Y, X, Z]` equal to `[X, Y, Z]` and call it correct; here it is wrong,
 *   because the slots mean different things.
 * - An empty placement is UNANSWERED, not wrong. The stock path cannot make that
 *   distinction: `isUnanswered` is false for `{}` (it is neither undefined nor
 *   null), `isEmpty` is false for it (it is not an array), so control reaches
 *   `isCorrectSet`, which returns false for any non-array, and an untouched item
 *   would be marked wrong rather than left unanswered.
 *
 * Exported as a pure function so it can be unit-tested without the session
 * machinery. Wiring it into `scoreExam` is Round 3, when `hands-on` arrives and
 * the dispatch gains its first live caller.
 */
export function gradeDragDrop(pairs, placement) {
  const slots = Array.isArray(pairs) ? pairs : []
  const isPlacement = placement !== null && typeof placement === 'object' && !Array.isArray(placement)
  const placed = isPlacement ? Object.keys(placement) : []

  // No keys placed at all: the learner never touched the item. Reported
  // separately from wrong, because unanswered items grade incorrect overall
  // (PROJECT.md 7a.3) but are disclosed and counted differently.
  if (placed.length === 0) return 'unanswered'

  const wanted = slots.map((pair) => pair?.right)
  // A chip dropped into a slot the item never declared has no meaning, so a
  // placement longer than the slot list cannot be right.
  if (placed.length > wanted.length) return 'wrong'

  for (let i = 0; i < wanted.length; i++) {
    if (placement[i] !== wanted[i]) return 'wrong'
  }
  return 'correct'
}

/**
 * Score a drawn exam.
 *
 * @param {Object} args
 * @param {Array} args.questions the drawn questions, in exam order
 * @param {Object<string, string[]>} [args.answers] question id -> selected keys.
 *   A missing id, or an id mapped to an empty array, counts as unanswered.
 * @returns {{
 *   correct: number,
 *   total: number,
 *   perDomain: Object<string, { correct: number, total: number }>,
 *   wrongIds: string[],
 *   unansweredIds: string[],
 *   unsubmittedCount: number,
 *   selections: Object<string, string[]>,
 *   explanations: Object<string, string>
 * }}
 *   `selections` is what the candidate actually chose, per question, so the
 *   result screen can mark their own wrong picks without re-deriving them.
 *   `explanations` covers exactly the wrong and unanswered ids, never the whole
 *   bank, so the review screen shows a reason for each thing the candidate missed
 *   and nothing else.
 */
export function scoreExam({ questions, answers = {} }) {
  if (!Array.isArray(questions)) throw new Error('scoreExam: questions must be an array')

  const wrongIds = []
  const unansweredIds = []
  const explanations = {}
  const selections = {}
  const perDomain = {}
  let correct = 0

  for (const question of questions) {
    const domain = question.domain
    if (!perDomain[domain]) perDomain[domain] = { correct: 0, total: 0 }
    perDomain[domain].total += 1

    const selected = answers[question.id]
    const isUnanswered = selected === undefined || selected === null
    const isEmpty = Array.isArray(selected) && selected.length === 0

    if (selected !== undefined && selected !== null) selections[question.id] = selected

    if (isUnanswered || isEmpty) {
      unansweredIds.push(question.id)
      explanations[question.id] = question.explanation ?? ''
      continue
    }

    if (isCorrectSet(selected, question.answer)) {
      correct += 1
      perDomain[domain].correct += 1
    } else {
      wrongIds.push(question.id)
      explanations[question.id] = question.explanation ?? ''
    }
  }

  return {
    correct,
    total: questions.length,
    perDomain,
    wrongIds,
    unansweredIds,
    unsubmittedCount: unansweredIds.length,
    selections,
    explanations,
  }
}
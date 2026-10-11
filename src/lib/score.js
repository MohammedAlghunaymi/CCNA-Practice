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
 *   explanations: Object<string, string>
 * }}
 *   `explanations` covers exactly the wrong and unanswered ids, never the whole
 *   bank, so the review screen shows a reason for each thing the candidate missed
 *   and nothing else.
 */
export function scoreExam({ questions, answers = {} }) {
  if (!Array.isArray(questions)) throw new Error('scoreExam: questions must be an array')

  const wrongIds = []
  const unansweredIds = []
  const explanations = {}
  const perDomain = {}
  let correct = 0

  for (const question of questions) {
    const domain = question.domain
    if (!perDomain[domain]) perDomain[domain] = { correct: 0, total: 0 }
    perDomain[domain].total += 1

    const selected = answers[question.id]
    const isUnanswered = selected === undefined || selected === null
    const isEmpty = Array.isArray(selected) && selected.length === 0

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
    explanations,
  }
}
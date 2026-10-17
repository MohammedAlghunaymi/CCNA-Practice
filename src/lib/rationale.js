/**
 * The single definition of "this rationale is a placeholder".
 *
 * Every one of the 507 placeholder rationales in the bank is the identical
 * literal below — verified across all six domain files, with no other value
 * present. Matching that one constant is therefore sufficient for the bank as it
 * stands, and deliberately is not widened into a keyword family: a matcher for
 * `todo`/`tbd`/`fixme` prefixes also suppresses legitimate Cisco text such as
 * `XXX` ("any value") or `Fixme: none - confirmed with TAC`, which is worse
 * than the case it guards against.
 *
 * These functions are imported by the validator, the exam's review screen and
 * the practice pager, so the gate and both UIs cannot disagree about what counts
 * as a placeholder.
 */

export const PLACEHOLDER_RATIONALE = 'TODO: explain why this is wrong'

/** True only for the exact placeholder, after trimming surrounding whitespace. */
export function isPlaceholderRationale(rationale) {
  if (typeof rationale !== 'string') return false
  return rationale.trim() === PLACEHOLDER_RATIONALE
}

/**
 * What to show under a single option, or null for nothing.
 *
 * The four conjuncts are `Exam.jsx`'s own filter, moved here so the exam's review
 * screen and the practice pager cannot drift apart. Two of them are not about
 * placeholders at all:
 *
 *  - `option.correct` — a correct option gets no rationale row. `questionSchema.js`
 *    forbids one on an `mcq-single` correct option, but only for `mcq-single`;
 *    the bank happens to carry none on any of its 170 correct options, and this
 *    line is what keeps that a data fact rather than a dependency.
 *  - non-empty after trimming — an all-whitespace string is not a reason, and
 *    `tests/exam.test.jsx:160-169` already carries one as a regression.
 *
 * `option.correct` rather than `question.answer.includes(key)`: the schema
 * requires those two to agree (`questionSchema.js:122-128`, verified identical
 * across all 677 options), and taking one argument means the caller cannot pass
 * the same fact twice under two names.
 *
 * Callers that only have an option — not the question — can use this directly.
 */
export function rationaleToShow(option) {
  if (!option || option.correct) return null
  if (typeof option.rationale !== 'string') return null
  if (option.rationale.trim() === '') return null
  if (isPlaceholderRationale(option.rationale)) return null
  return option.rationale
}
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
 * One function, imported by both the validator and the result screen, so the
 * gate and the UI cannot disagree about what counts as a placeholder.
 */

export const PLACEHOLDER_RATIONALE = 'TODO: explain why this is wrong'

/** True only for the exact placeholder, after trimming surrounding whitespace. */
export function isPlaceholderRationale(rationale) {
  if (typeof rationale !== 'string') return false
  return rationale.trim() === PLACEHOLDER_RATIONALE
}
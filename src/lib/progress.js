/**
 * Practice progress: which questions have been answered, and where the reader
 * stopped.
 *
 * One record, one key, cumulative. Question ids are globally unique, so
 * `answers` accumulates across every domain the reader has visited — a student
 * who answers five Network Fundamentals questions and then opens IP
 * Connectivity has not lost the first five.
 *
 * `writeProgress` MERGES. The obvious implementation — build a whole record and
 * `setItem` it — silently destroys every other domain's answers on the next
 * write, because the record it built knows only about the question in front of
 * the reader. `Exam.jsx:100` does exactly that, and it can afford to: its record
 * is one paper. This one is not.
 *
 * The version constant is deliberately private to this module. Sharing
 * `Exam.jsx`'s would mean a future change to the exam record schema silently
 * wiped every student's practice history on the next exam deploy, with nothing
 * on screen to explain why their progress vanished.
 */

export const PROGRESS_KEY = 'practice.progress.v1'
const PRACTICE_SCHEMA_VERSION = 1

/**
 * Last record known to have been written, used when storage is unavailable —
 * private browsing, a full quota, a disabled-cookies profile. Mirrors the
 * memory fallback in `Exam.jsx:79`.
 */
let memoryFallback = null

/**
 * The stored record, or null when there is nothing usable.
 *
 * A missing key falls back to memory, so a session whose writes never reached
 * disk still reads back. A version mismatch does NOT: that is a deliberate
 * fresh start, and returning the old record would hand the reader a cursor and
 * an answers map in a shape nothing expects.
 *
 * `answers` is defaulted. A record with a matching `v` and no `answers` is
 * well-formed JSON, and `Object.keys(undefined)` throws at every call site that
 * reads it — the same guard `Exam.jsx:188` applies.
 */
export function readProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return memoryFallback
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== PRACTICE_SCHEMA_VERSION) return null
    return { ...parsed, answers: parsed.answers ?? {} }
  } catch {
    return memoryFallback
  }
}

/**
 * Merge a patch into the record and store the result.
 *
 * `patch.answers` is merged per question id; `domain` and `index` are replaced
 * when supplied. Absent fields keep their stored value, so a cursor write does
 * not drop answers and an answer write does not move the cursor.
 *
 * Null-safe by construction: `readProgress()` returns null for an absent key, so
 * `current?.answers` — not `current.answers` — is what makes the very first
 * answer of a fresh store work at all.
 *
 * Returns the record that is now stored.
 */
export function writeProgress(patch = {}) {
  const current = readProgress()
  const next = {
    v: PRACTICE_SCHEMA_VERSION,
    domain: patch.domain ?? current?.domain ?? null,
    index: patch.index ?? current?.index ?? 0,
    answers: { ...(current?.answers ?? {}), ...(patch.answers ?? {}) },
  }
  memoryFallback = next
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable. The memory copy above is the record for this session.
  }
  return next
}

/**
 * Where to resume within a domain.
 *
 * The stored cursor is honoured ONLY for the domain it was left in. That check
 * is the whole point: `Exam.jsx:187` clamps its index against a list built from
 * `stored.drawnIds`, so index and list are guaranteed to be the same collection
 * and the clamp is sound. This record has no `drawnIds` — the list comes from
 * the route — so a cursor carried from another domain would be clamped against
 * a collection it was never measured in, and resume the reader at the wrong
 * question. Silently wrong, not a crash, which is worse.
 *
 * A record for a different domain is not discarded here; only its cursor is
 * ignored. `answers` stays, because it is cumulative by design.
 */
export function resumeIndex(record, domainId, total) {
  if (!record || record.domain !== domainId) return 0
  if (!Number.isFinite(record.index)) return 0
  return Math.max(0, Math.min(Math.trunc(record.index), Math.max(0, total - 1)))
}

/** Forget everything. Removes the key outright rather than writing `{}`. */
export function clearProgress() {
  memoryFallback = null
  try {
    localStorage.removeItem(PROGRESS_KEY)
  } catch {
    // Nothing to clear if storage is unavailable; memory is already null.
  }
}
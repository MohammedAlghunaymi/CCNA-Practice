import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import objectives from '../../../data/objectives.json'
import { counts, BY_ID, BANK } from '../../../lib/bank.js'
import { readProgress, clearProgress } from '../../../lib/progress.js'

/**
 * How many of the blueprint's sub-objectives this bank actually holds a question
 * for. `objectives.json` says 97; the bank covers 63. The panel states the
 * denominator it is counting inside, because "you have missed 4 of 63" invites
 * the reader to treat the other 59 as covered.
 */
const COVERED_OBJECTIVES = new Set(BANK.map((q) => q.objectiveId)).size

const ROW_CAP = 5

/**
 * The category index: one card per blueprint domain, each linking into that
 * domain's pager.
 *
 * Counts come from `bank.counts`, which reads the loaded bank. They are not the
 * v1 allocation targets in `bank.config.json`, and the two disagree in both
 * directions — IPS is allocated 31 and holds 32 — so `Home.jsx` reports them
 * side by side under separate labels and this page reports only the real one.
 *
 * Card order is `counts` order, which `bank.js` derives from
 * `objectives.json`'s domain order. It is blueprint order (NF, NA, IPC, IPS,
 * SEC, AUTO), not alphabetical, and it is not incidental: the bank index's
 * order is a contract because practice progress persists a cursor into it.
 */
export default function PracticeHome() {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

  // Re-read rather than subscribing to storage: `clearProgress` is the only
  // writer this page triggers, and holding the record in state is what makes the
  // reset visibly do something.
  const [record, setRecord] = useState(() => readProgress())
  const [armed, setArmed] = useState(false)

  /**
   * Answers per domain, counted by each question's OWN domain.
   *
   * `progress.answers` is one cumulative map keyed by question id across every
   * domain the reader has visited. Counting its keys directly would give every
   * card the same running total, so a reader who answered five Network
   * Fundamentals questions would see IP Connectivity claim five as well. Each id
   * is resolved through `BY_ID` and tallied under the domain that question
   * belongs to; ids the bank no longer holds are skipped rather than counted
   * somewhere arbitrary.
   */
  const answered = useMemo(() => {
    const tally = Object.fromEntries(objectives.domains.map((d) => [d.id, 0]))
    for (const id of Object.keys(record?.answers ?? {})) {
      const question = BY_ID.get(id)
      if (question && question.domain in tally) tally[question.domain] += 1
    }
    return tally
  }, [record])

  const anyProgress = Object.keys(record?.answers ?? {}).length > 0

  /**
   * Per-objective misses and attempts.
   *
   * `a` counts every recorded answer carrying the objective, right or wrong;
   * `w` counts only the misses. Both come from the reader's own history, never
   * from the bank's size — an objective with six questions in the bank of which
   * the reader has attempted one must read "missed 1 of 1 answered", because
   * "missed 1 of 6" is a rate they did not earn and credits them with five
   * questions they never saw.
   */
  const tally = useMemo(() => {
    const byObjective = new Map()
    for (const [id, entry] of Object.entries(record?.answers ?? {})) {
      const question = BY_ID.get(id)
      if (!question) continue
      if (!byObjective.has(question.objectiveId)) {
        byObjective.set(question.objectiveId, { objectiveId: question.objectiveId, w: 0, a: 0 })
      }
      const row = byObjective.get(question.objectiveId)
      row.a += 1
      if (entry?.correct === false) row.w += 1
    }
    return [...byObjective.values()]
  }, [record])

  /**
   * Worst first, by rate and then by how little was attempted.
   *
   * Ranking by raw miss count puts every single-question objective last — the
   * bank has 18 of them — so a reader who missed their one question on six
   * objectives would rank below someone who missed four of eight, and a
   * five-row cap would hide exactly the rows worth seeing. Rate first, then
   * `a` ascending so a 1-of-1 outranks a 4-of-8, then the id so the order is
   * total and cannot drift between renders.
   */
  const missed = useMemo(
    () =>
      tally
        .filter((row) => row.w >= 1)
        .sort(
          (x, y) =>
            y.w / y.a - x.w / x.a || x.a - y.a || x.objectiveId.localeCompare(y.objectiveId)
        ),
    [tally]
  )

  const rows = missed.slice(0, ROW_CAP)

  // Two presses. The control discards the reader's entire cumulative history —
  // every answer, in every domain — and `removeItem` leaves no undo.
  const reset = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    clearProgress()
    setRecord(readProgress())
    setArmed(false)
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Practice by domain</h1>
        <p className="mt-2 text-sm text-text-muted">
          {total} questions across {objectives.domains.length} categories. No timer and no
          score &mdash; work through them and read the explanation.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link className="inline-block text-sm underline" to="/">
            Back to the overview
          </Link>
          {anyProgress && (
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-border px-3 py-1 text-sm"
            >
              {armed ? 'Click again to erase all practice progress' : 'Reset practice progress'}
            </button>
          )}
        </div>
      </header>

      <ul className="space-y-2">
        {objectives.domains.map((domain) => (
          <li key={domain.id}>
            <Link
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-accent"
              to={`/practice/${domain.id}`}
            >
              <span>
                <span className="font-medium">{domain.name}</span>
                <span className="ml-2 text-xs text-text-faint">
                  {domain.leafCount} sub-objectives &middot; {domain.weight}% of exam
                </span>
              </span>
              <span className="flex items-center gap-4 text-sm">
                <span className="font-mono text-accent">{counts[domain.id]} in bank</span>
                <span className="font-mono text-text-faint">
                  {answered[domain.id]} of {counts[domain.id]} answered
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* "Most missed", not "weak spots". One miss is a bad guess; what the rows
          show is a count with its own denominator attached, and no mastery claim
          is made anywhere on this page. */}
      <section aria-labelledby="missed-heading" className="mt-10">
        <h2 id="missed-heading" className="mb-1 text-lg font-semibold">
          Objectives you have missed &mdash; {missed.length} of the {COVERED_OBJECTIVES} this
          bank covers
        </h2>
        {missed.length === 0 ? (
          <p className="text-sm text-text-muted">Answer a question and this fills in.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {rows.map((row) => (
                // One text node, so the whole row is selectable, copyable and
                // queryable as a single string. Wrapping the id in a styled
                // span reads the same but splits the row in two, which is the
                // same trap `Exam.jsx` documents at its rationale list.
                <li key={row.objectiveId} className="text-sm">
                  {`${row.objectiveId} - missed ${row.w} of ${row.a} answered`}
                </li>
              ))}
            </ul>
            {/* Suppressed at five or fewer, so it never reads "+0 more". */}
            {missed.length > ROW_CAP && (
              <p className="mt-2 text-sm text-text-faint">
                +{missed.length - ROW_CAP} more
              </p>
            )}
          </>
        )}
      </section>
    </main>
  )
}
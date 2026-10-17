import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router'
import objectives from '../../../data/objectives.json'
import { byDomain } from '../../../lib/bank.js'
import { isCorrectSet } from '../../../lib/score.js'
import { rationaleToShow } from '../../../lib/rationale.js'
import { readProgress, writeProgress, resumeIndex } from '../../../lib/progress.js'

/**
 * The practice pager: one question at a time, with no timer and no score.
 *
 * Two rules here are load-bearing and neither is obvious:
 *
 * 1. `revealedIds` is a Set, not a boolean and not a single id. A boolean is
 *    never cleared, so Show Answer on Q1 would leave Q2 revealed. A single id
 *    fixes that but breaks the revisit: reveal Q1, reveal Q2, Prev — and a
 *    scalar now holds only Q2, so Q1's answer disappears *and* its options
 *    re-enable while the stored pick is re-supplied underneath. The reader could
 *    then overwrite a recorded answer with one chosen after reading the
 *    explanation, which is exactly what the disable rule exists to prevent.
 *
 * 2. Options are disabled once revealed, derived from the same `revealed` value
 *    as the reveal surface. An answer chosen after reading the explanation is
 *    not an unaided attempt, and recording it as one would quietly corrupt the
 *    "most missed" panel that reads this same record.
 *
 * The per-option verdict markers ("correct", "you chose this") are not a score.
 * They are the same two markers `Exam.jsx` prints in its review, and a
 * "Show answer" that does not say whether you were right is not practice. What
 * is deliberately absent is any aggregate: no running total, no percentage, no
 * timer.
 */
export default function LearnMode() {
  const { domainId } = useParams()
  const questions = useMemo(() => byDomain(domainId ?? ''), [domainId])
  const total = questions.length

  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState([])
  const [revealedIds, setRevealedIds] = useState(() => new Set())

  // Domain change re-resumes. The reveal set is cleared: it is per-visit state,
  // and carrying it across domains would reveal a question the reader has not
  // opened in this domain.
  useEffect(() => {
    setIndex(resumeIndex(readProgress(), domainId, total))
    setRevealedIds(new Set())
  }, [domainId, total])

  // Sync the visible pick with what is stored for the current question, so
  // navigating away and back shows the reader their own answer rather than an
  // empty list.
  useEffect(() => {
    const current = questions[index]
    if (!current) {
      setChosen([])
      return
    }
    setChosen(readProgress()?.answers?.[current.id]?.chosen ?? [])
  }, [index, questions])

  if (total === 0) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">Nothing to practise here</h1>
        <p className="mt-2 text-sm text-text-muted">
          The bank holds no questions for <span className="font-mono">{domainId}</span>.
        </p>
        <Link className="mt-6 inline-block text-sm underline" to="/practice">
          Back to the categories
        </Link>
      </main>
    )
  }

  const question = questions[index]
  const revealed = revealedIds.has(question.id)
  const atStart = index === 0
  const atEnd = index === total - 1

  const step = (delta) => {
    const next = Math.max(0, Math.min(index + delta, total - 1))
    if (next === index) return
    setIndex(next)
    writeProgress({ domain: domainId, index: next })
  }

  const pick = (key) => {
    if (revealed) return
    const next =
      question.type === 'mcq-multi'
        ? chosen.includes(key)
          ? chosen.filter((k) => k !== key)
          : [...chosen, key].sort()
        : [key]
    setChosen(next)
    writeProgress({
      answers: {
        [question.id]: { chosen: next, correct: isCorrectSet(next, question.answer) },
      },
    })
  }

  const reveal = () => setRevealedIds((s) => new Set(s).add(question.id))

  // A non-MCQ item has no `options` and no `answer`; both dereferences below
  // would throw on undefined. Same guard as `Exam.jsx:540`.
  const reviewable = Boolean(question.options) && Array.isArray(question.answer)
  const keys = reviewable ? Object.keys(question.options).sort() : []

  // Per-option rationales go through the shared selector so this and the exam's
  // review screen cannot drift. Today every one of the bank's 507 wrong options
  // holds the placeholder and all 170 correct options carry no rationale at all,
  // so nothing renders here for any question — and that is the correct outcome.
  // The point is that it renders the moment real rationales land, with no change
  // to this file, and that a student never sees the placeholder in the meantime.

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* The category's display name, not the route code: `NF` is an index key,
          and the reader arrived here from a card labelled "Network
          Fundamentals". */}
      <h1 className="text-2xl font-bold tracking-tight">
        {objectives.domains.find((d) => d.id === domainId)?.name ?? `Practice: ${domainId}`}
      </h1>
      <header className="mb-6 mt-1 flex items-baseline justify-between gap-4">
        <p className="text-sm text-text-muted">
          Question {index + 1} of {total}
        </p>
        <p className="text-xs text-text-faint">
          {question.objectiveId} &middot; {question.domain}
        </p>
      </header>

      <article className="rounded-lg border border-border bg-surface px-5 py-4">
        <p className="text-sm">{question.prompt}</p>

        {reviewable ? (
          <ul className="mt-4 space-y-2">
            {keys.map((key) => {
              const option = question.options[key]
              const isCorrect = question.answer.includes(key)
              const wasChosen = chosen.includes(key)
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-pressed={wasChosen}
                    disabled={revealed}
                    onClick={() => pick(key)}
                    className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm disabled:opacity-70 ${
                      wasChosen ? 'border-accent' : 'border-border'
                    }`}
                  >
                    <span>
                      <span className="font-mono font-semibold">{key}.</span>{' '}
                      {option.text}
                    </span>
                    {revealed && (
                      <span className="shrink-0 text-xs">
                        {isCorrect && <span className="text-pass">correct</span>}
                        {wasChosen && !isCorrect && (
                          <span className="text-fail">you chose this</span>
                        )}
                      </span>
                    )}
                  </button>
                  {/* One text node per rationale, so the reason is selectable,
                      copyable and queryable as a single string. */}
                  {revealed && rationaleToShow(option) && (
                    <p className="mt-1 pl-6 text-sm text-text-muted">
                      {rationaleToShow(option)}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-4 rounded-md border border-border px-3 py-2 text-sm text-text-faint">
            This item is a {question.type} task and offers no options to choose from.
          </p>
        )}

        {/* Ungated. The explanation is what covers the suppressed
            placeholders above, so it must render precisely when they were
            suppressed — which, today, is always. Gating it on
            `rationales.length > 0` (as Cycle 2 of the plan briefly had it)
            would leave the bank with no teaching content at all. */}
        {revealed && question.explanation && (
          <p className="mt-4 border-t border-border pt-3 text-sm leading-relaxed text-text-muted">
            {question.explanation}
          </p>
        )}
      </article>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atStart}
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={reveal}
          disabled={revealed}
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
        >
          Show answer
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={atEnd}
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
        >
          Next
        </button>
        {!revealed && chosen.length > 0 && (
          <span className="text-xs text-text-faint">
            Chosen. Show the answer when you are ready.
          </span>
        )}
      </div>

      {question.upstream && (
        <p className="mt-8 text-xs text-text-faint">
          Adopted from {question.upstream.project} at{' '}
          <span className="font-mono">{question.upstream.commit.slice(0, 7)}</span>.
        </p>
      )}

      <Link className="mt-6 inline-block text-sm underline" to="/practice">
        Back to the categories
      </Link>
    </main>
  )
}
import { useState, useMemo, useCallback } from 'react'
import nf from '../data/questions/nf.json' with { type: 'json' }
import na from '../data/questions/na.json' with { type: 'json' }
import ipc from '../data/questions/ipc.json' with { type: 'json' }
import ips from '../data/questions/ips.json' with { type: 'json' }
import sec from '../data/questions/sec.json' with { type: 'json' }
import auto from '../data/questions/auto.json' with { type: 'json' }
import { selectQuestions, isUint32, DrawError } from '../lib/selectQuestions.js'
import { scoreExam } from '../lib/score.js'
import { Link } from 'react-router'

const BANK = Object.values({ nf, na, ipc, ips, sec, auto }).flatMap((file) => file.questions)

const PAPER_LENGTH = 20

/**
 * The first working exam.
 *
 * Deliberately stateless: no timer, no attempt record, no reload recovery. A
 * refresh redraws the paper, which is the right trade at this stage — it proves
 * the draw and the scoring work end to end before any session machinery exists.
 * Everything below is component state and disappears on navigation.
 */

function freshSeed() {
  const forced = new URLSearchParams(window.location.search).get('seed')
  if (forced !== null) {
    const parsed = Number(forced)
    if (isUint32(parsed)) return parsed
  }
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/** Draw once per mount; a refresh is a new paper. */
function usePaper() {
  return useMemo(() => {
    try {
      return { questions: selectQuestions(BANK, PAPER_LENGTH, freshSeed()), error: null }
    } catch (error) {
      if (error instanceof DrawError) return { questions: [], error: error.message }
      throw error
    }
  }, [])
}

export default function Exam() {
  const { questions, error } = usePaper()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)

  const choose = useCallback((question, keys) => {
    setAnswers((prev) => ({ ...prev, [question.id]: keys }))
  }, [])

  function submit() {
    setResult(scoreExam({ questions, answers }))
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">Practice exam</h1>
        <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          Could not build a paper: {error}
        </p>
        <Link className="mt-4 inline-block text-sm underline" to="/">
          Back to blueprint
        </Link>
      </main>
    )
  }

  if (result) {
    return <Result result={result} questions={questions} />
  }

  const question = questions[index]
  const selected = answers[question.id] ?? []
  const answered = Object.keys(answers).length
  const isLast = index === questions.length - 1

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Practice exam</h1>
        <p className="mt-1 text-sm text-text-muted">
          {PAPER_LENGTH} questions &middot; question {index + 1} of {questions.length} &middot;{' '}
          {answered} answered
        </p>
      </header>

      <ProgressBar value={index + 1} total={questions.length} />

      <article className="mt-6 rounded-lg border border-border bg-surface px-5 py-5">
        <p className="text-xs text-text-faint">
          {question.domain} &middot; {question.objectiveId} &middot; {question.type}
        </p>
        <p className="mt-3 leading-relaxed">{question.prompt}</p>

        <ul className="mt-5 space-y-2">
          {Object.entries(question.options).map(([key, option]) => {
            const isSelected = selected.includes(key)
            return (
              <li key={key}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-text-faint'
                  }`}
                >
                  <input
                    className="mt-0.5"
                    type={question.type === 'mcq-multi' ? 'checkbox' : 'radio'}
                    name={question.id}
                    checked={isSelected}
                    onChange={() =>
                      choose(
                        question,
                        question.type === 'mcq-multi'
                          ? isSelected
                            ? selected.filter((k) => k !== key)
                            : [...selected, key]
                          : [key]
                      )
                    }
                  />
                  <span>
                    <span className="font-mono font-semibold">{key}.</span> {option.text}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        {question.type === 'mcq-multi' && (
          <p className="mt-4 text-xs text-text-faint">
            Select every correct option. No partial credit.
          </p>
        )}
      </article>

      <footer className="mt-6 flex items-center justify-between">
        <button
          className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40"
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
        >
          Previous
        </button>

        {isLast ? (
          <button
            className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-black"
            type="button"
            onClick={submit}
          >
            Submit exam
          </button>
        ) : (
          <button
            className="rounded-md bg-accent px-5 py-2 text-sm font-semibold text-black"
            type="button"
            onClick={() => setIndex((i) => i + 1)}
          >
            Next
          </button>
        )}
      </footer>

      <p className="mt-8 text-xs text-text-faint">
        This practice run is not timed and does not survive a refresh.
      </p>
    </main>
  )
}

function ProgressBar({ value, total }) {
  const pct = Math.round((value / total) * 100)
  return (
    <div
      className="h-1.5 w-full rounded-full bg-surface"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={total}
    >
      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  )
}

function Result({ result, questions }) {
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]))
  const missed = [...result.wrongIds, ...result.unansweredIds]
  const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0
  const summary = `${result.correct} of ${result.total} correct (${pct}%)`
  const unansweredNote =
    result.unsubmittedCount > 0 ? ` · ${result.unsubmittedCount} unanswered` : ''

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Result</h1>
        <p className="mt-2 text-sm text-text-muted">{`${summary}${unansweredNote}`}</p>
      </header>

      <section className="mt-6 rounded-lg border border-border bg-surface px-5 py-4">
        <h2 className="text-sm font-semibold">By domain</h2>
        <ul className="mt-3 space-y-2">
          {Object.entries(result.perDomain).map(([domain, tally]) => (
            <li key={domain} className="flex items-center justify-between text-sm">
              <span>{domain}</span>
              <span className="font-mono text-text-muted">
                {tally.correct} / {tally.total}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {missed.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Review what you missed</h2>
          <ul className="mt-4 space-y-4">
            {missed.map((id) => {
              const question = byId[id]
              const unanswered = result.unansweredIds.includes(id)
              return (
                <li
                  key={id}
                  className="rounded-lg border border-border bg-surface px-5 py-4"
                >
                  <p className="text-xs text-text-faint">
                    {question.domain} &middot; {question.objectiveId} &middot;{' '}
                    {unanswered ? 'not answered' : 'answered incorrectly'}
                  </p>
                  <p className="mt-2 text-sm">{question.prompt}</p>
                  <p className="mt-3 text-sm">
                    <span className="text-text-faint">Correct answer: </span>
                    <span className="font-mono">{question.answer.join(', ')}</span>
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">
                    {result.explanations[id]}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <Link className="mt-8 inline-block text-sm underline" to="/exam">
        Take another paper
      </Link>
    </main>
  )
}
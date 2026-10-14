import { useState, useEffect, useCallback } from 'react'
import nf from '../data/questions/nf.json' with { type: 'json' }
import na from '../data/questions/na.json' with { type: 'json' }
import ipc from '../data/questions/ipc.json' with { type: 'json' }
import ips from '../data/questions/ips.json' with { type: 'json' }
import sec from '../data/questions/sec.json' with { type: 'json' }
import auto from '../data/questions/auto.json' with { type: 'json' }
import config from '../config/bank.config.json' with { type: 'json' }
import { selectQuestions, isUint32, DrawError } from '../lib/selectQuestions.js'
import { scoreExam } from '../lib/score.js'
import { isPlaceholderRationale } from '../lib/rationale.js'
import { Link } from 'react-router'

const BANK = Object.values({ nf, na, ipc, ips, sec, auto }).flatMap((file) => file.questions)
const BY_ID = new Map(BANK.map((q) => [q.id, q]))

/**
 * The shipped default paper length.
 *
 * `config.exam.defaultLength` is 100, and is deliberately NOT what the runner
 * defaults to. It is read by `Home.jsx` and by `validateBank`, never here, so
 * changing the config changes nothing in the runner - and adopting 100 as the
 * component default would break the eleven `of 20` assertions in
 * `tests/exam.test.jsx` for no Phase 1 benefit. A full-length pass is a separate
 * shipped mode that does not exist yet.
 */
const DEFAULT_LENGTH = 20
const ATTEMPT_KEY = 'exam.active'
const SCHEMA_VERSION = 1
const TARGET_SECONDS = config.exam.targetSecondsPerItem

/**
 * The practice exam.
 *
 * Session state lives in one `localStorage` record rather than in component
 * state, so a refresh *or closing the page* resumes the same paper instead of
 * drawing a new one. Time is *measured* from stored deltas rather than counted
 * down, so a throttled background tab cannot silently grant extra time: every
 * tick recomputes from `remainingMs` and the clock, then writes both fields back
 * together.
 *
 * If storage is unavailable the same record is kept in memory, so a paper can
 * still be completed and abandoned without it.
 */

let memoryFallback = null

/**
 * Storage is authoritative whenever it works. The in-memory copy is only
 * consulted when a read actually throws, so it can never contradict the store
 * — and clearing the store genuinely resets the session. It is still written on
 * every successful save, so a store that breaks later still has the last record.
 */
function readActive() {
  try {
    const raw = localStorage.getItem(ATTEMPT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    // private browsing, quota, or corrupt JSON; the in-memory copy stands in
    return memoryFallback
  }
}

function writeActive(record) {
  memoryFallback = record
  try {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(record))
  } catch {
    // nothing persisted, but the in-memory copy is authoritative from here
  }
}

function clearActive() {
  memoryFallback = null
  try {
    localStorage.removeItem(ATTEMPT_KEY)
  } catch {
    // nothing to clean up if storage never worked
  }
}

function freshSeed() {
  const forced = new URLSearchParams(window.location.search).get('seed')
  if (forced !== null) {
    const parsed = Number(forced)
    if (isUint32(parsed)) return parsed
  }
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

/** Budget for the paper actually drawn, from the per-type seconds in config. */
function budgetFor(questions) {
  const seconds = questions.reduce((sum, q) => sum + (TARGET_SECONDS[q.type] ?? 45), 0)
  return seconds * 1000
}

/**
 * Remaining time, with both deltas floored first. Flooring is what makes a
 * backward clock change harmless: it contributes zero elapsed instead of
 * *adding* time. Without the floor a clock stepped back grants free minutes.
 */
function remainingFrom(state, now) {
  const elapsed = Math.max(0, now - state.lastTickAt)
  const sinceStart = Math.max(0, now - state.startedAt)
  return Math.max(0, Math.min(state.remainingMs - elapsed, state.budgetMs - sinceStart))
}

function recordFrom(state) {
  return {
    v: SCHEMA_VERSION,
    attemptId: state.attemptId,
    seed: state.seed,
    n: state.questions.length,
    drawnIds: state.questions.map((q) => q.id),
    budgetMs: state.budgetMs,
    startedAt: state.startedAt,
    remainingMs: state.remainingMs,
    lastTickAt: state.lastTickAt,
    index: state.index,
    answers: state.answers,
  }
}

/**
 * Resume a stored attempt if one is present and still valid; otherwise draw a
 * fresh paper and mint the record. An attempt restored already out of time
 * resolves to its result here, so the paper is never rendered in that state.
 */
/**
 *
 /**
 * Resume a stored attempt if one is present and still valid; otherwise draw a
 * fresh paper of `length` and mint the record. An attempt restored already out of
 * time resolves to its result here, so the paper is never rendered in that state.
 *
 * `length` is used only on the fresh-draw path: a resumed paper keeps whatever
 * length was drawn when the record was minted, so switching lengths mid-attempt
 * cannot truncate a paper in progress.
 */
function initialSession(length) {
  const stored = readActive()
  if (stored && stored.v === SCHEMA_VERSION && Array.isArray(stored.drawnIds)) {
    const questions = stored.drawnIds.map((id) => BY_ID.get(id)).filter(Boolean)
    if (questions.length === stored.drawnIds.length) {
      const now = Date.now()
      const base = {
        questions,
        attemptId: stored.attemptId,
        seed: stored.seed,
        budgetMs: stored.budgetMs,
        startedAt: stored.startedAt,
        remainingMs: stored.remainingMs,
        lastTickAt: stored.lastTickAt,
        index: Math.max(0, Math.min(stored.index ?? 0, questions.length - 1)),
        answers: stored.answers ?? {},
        // Not persisted, and deliberately false: the first advance already happened in
        // a previous mount, so resuming must not re-announce it. It is a
        // within-this-mount notice, not a property of the attempt.
        oneWayNoticed: false,
      }
      const remainingMs = remainingFrom(base, now)
      // `remainingMs` above is already net of elapsed time, so it is returned as
      // the new stored value with `lastTickAt` moved to now. Keeping the stale
      // tick would make the very next measurement subtract the same interval a
      // second time, which on a real reload jumps straight to 0:00.
      if (remainingMs <= 0) {
        clearActive()
        return { ...base, remainingMs: 0, result: scoreExam({ questions, answers: base.answers }) }
      }
      const resumed = { ...base, remainingMs, lastTickAt: now }
      writeActive(recordFrom(resumed))
      return resumed
    }
  }

  try {
    const seed = freshSeed()
    const questions = selectQuestions(BANK, length, seed)
    const now = Date.now()
    const fresh = {
      questions,
      attemptId: `a${now.toString(36)}`,
      seed,
      budgetMs: budgetFor(questions),
      startedAt: now,
      remainingMs: budgetFor(questions),
      lastTickAt: now,
      index: 0,
      answers: {},
      oneWayNoticed: false,
    }
    writeActive(recordFrom(fresh))
    return fresh
  } catch (error) {
    if (error instanceof DrawError) return { error: error.message }
    throw error
  }
}

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Exam({ length = DEFAULT_LENGTH }) {
  const [state, setState] = useState(() => initialSession(length))

  /**
   * Fold elapsed wall time into the stored fields on every tick, so the
   * baseline keeps moving forward.
   *
   * Deriving the remaining time on render instead would recompute it from an
   * unchanged baseline each time. That works while the clock only moves
   * forward, but if it is stepped backwards the floored elapsed time collapses
   * to zero and the reading snaps back to the full budget — handing back time
   * the candidate had already spent. Advancing the stored value is what makes
   * the flooring meaningful.
   */
  useEffect(() => {
    if (state.result || state.error) return undefined
    const update = () =>
      setState((prev) => {
        if (prev.result || prev.error) return prev
        const now = Date.now()
        return { ...prev, remainingMs: remainingFrom(prev, now), lastTickAt: now }
      })
    const id = setInterval(update, 1000)
    // A backgrounded tab has its timers throttled, so re-measure on return.
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
    }
  }, [state.result, state.error])

  // Persist every change, including each tick, so a refresh resumes from the
  // last measured moment rather than the last answer.
  useEffect(() => {
    if (state.result || state.error) return
    writeActive(recordFrom(state))
  }, [state])

  // Running out of time scores what the candidate actually answered.
  useEffect(() => {
    if (state.result || state.error || state.remainingMs > 0) return
    clearActive()
    setState((prev) => ({
      ...prev,
      remainingMs: 0,
      result: scoreExam({ questions: prev.questions, answers: prev.answers }),
    }))
  }, [state])

  // Persistence is handled by the effect above, so these only change state.
  const choose = useCallback((question, keys) => {
    setState((prev) => ({ ...prev, answers: { ...prev.answers, [question.id]: keys } }))
  }, [])

  // The index is clamped rather than trusted: it is read back from storage, and a
  // record left over from a different paper length could otherwise point past the
  // end of this one and crash the runner on `questions[index]`.
  // Forward-only, per §13 #4. There is no decrement path: the candidate advances
  // and cannot come back. `oneWayNoticed` is set on the first advance so the
  // confirmation fires exactly once, at the moment it is true.
  const go = useCallback((delta) => {
    setState((prev) => ({
      ...prev,
      index: Math.max(0, Math.min(prev.index + delta, prev.questions.length - 1)),
      oneWayNoticed: prev.oneWayNoticed || (prev.index === 0 && delta > 0),
    }))
  }, [])

  function submit() {
    clearActive()
    setState((prev) => ({
      ...prev,
      result: scoreExam({ questions: prev.questions, answers: prev.answers }),
    }))
  }

  function abandon() {
    clearActive()
    // `abandon()` is the one caller that re-invokes `initialSession` after mount,
    // so it is where an injected length would otherwise be silently lost and the
    // next paper would revert to the module default.
    setState(() => initialSession(length))
  }

  if (state.error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">Practice exam</h1>
        <p className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          Could not build a paper: {state.error}
        </p>
        <Link className="mt-4 inline-block text-sm underline" to="/">
          Back to blueprint
        </Link>
      </main>
    )
  }

  if (state.result) {
    return <Result result={state.result} questions={state.questions} />
  }

  const { questions, index, answers, remainingMs, budgetMs } = state
  const question = questions[index]
  const selected = answers[question.id] ?? []
  const answered = Object.keys(answers).length
  const isLast = index === questions.length - 1

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Practice exam</h1>
          <p className="mt-1 text-sm text-text-muted">
            {`question ${index + 1} of ${questions.length} · ${answered} answered`}
          </p>
        </div>
        <p
          className={`font-mono text-sm ${remainingMs < 60000 ? 'text-fail' : 'text-text-muted'}`}
          aria-label="Time remaining"
        >
          {formatClock(remainingMs)}
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
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-text ${
                    isSelected ? 'border-accent bg-accent/10' : 'border-border hover:border-text-faint'
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

      {/*
        §7a:56 requires a confirmation on the first advance stating the student
        cannot return. It is inline and non-blocking rather than `window.confirm`,
        which returns `undefined` under jsdom and would stall the advance with no
        visible cause. Shown on the question reached by that first advance and not
        after it, so it fires once at the moment it becomes true.
      */}
      {state.oneWayNoticed && index === 1 && (
        <p
          role="status"
          className="mt-6 rounded-md border border-border bg-surface px-4 py-3 text-sm"
        >
          From here you can only advance. You cannot return to{' '}
          {question.domain} {question.objectiveId} or change an answer you have
          already given.
        </p>
      )}

      <footer className="mt-6 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            className="rounded-md border border-border px-4 py-2 text-sm text-text-muted"
            type="button"
            onClick={abandon}
          >
            Abandon
          </button>
        </div>

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
            onClick={() => go(1)}
          >
            Next
          </button>
        )}
      </footer>

      <p className="mt-8 text-xs text-text-faint">
        {questions.length} questions, budget {formatClock(budgetMs)} for this paper. Progress
        survives a refresh and closing the page.
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

export function Result({ result, questions }) {
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
              const chosen = result.selections[id] ?? []
              // A placeholder is not a rationale, so it is never shown. The
              // question-level explanation below the list covers those.
              const rationales = Object.entries(question.options).filter(
                ([key, o]) =>
                  !question.answer.includes(key) &&
                  typeof o.rationale === 'string' &&
                  o.rationale.trim() !== '' &&
                  !isPlaceholderRationale(o.rationale)
              )
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

                  <ul className="mt-4 space-y-2">
                    {Object.entries(question.options).map(([key, option]) => {
                      const isCorrect = question.answer.includes(key)
                      const wasChosen = chosen.includes(key)
                      return (
                        <li
                          key={key}
                          className="flex items-start justify-between gap-3 text-sm"
                        >
                          <span>
                            <span className="font-mono font-semibold">{key}.</span>{' '}
                            {option.text}
                          </span>
                          <span className="shrink-0 text-xs">
                            {isCorrect && <span className="text-pass">correct</span>}
                            {wasChosen && !isCorrect && (
                              <span className="ml-2 text-fail">you chose this</span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  {rationales.length > 0 && (
                    <ul className="mt-3 space-y-2 border-l-2 border-border pl-4">
                      {rationales.map(([key, option]) => (
                        // One text node, so the reason is selectable, copyable and
                        // queryable as a single string.
                        <li key={key} className="text-sm text-text-muted">
                          {`${key}: ${option.rationale}`}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-3 text-sm leading-relaxed text-text-muted">
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
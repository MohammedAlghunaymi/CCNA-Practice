import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, cleanup, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import Exam, { Result } from '../src/features/exam/pages/Exam.jsx'
import { selectQuestions } from '../src/lib/selectQuestions.js'
import { scoreExam } from '../src/lib/score.js'
import { PLACEHOLDER_RATIONALE } from '../src/lib/rationale.js'
import config from '../src/config/bank.config.json' with { type: 'json' }
import nf from '../src/data/questions/nf.json' with { type: 'json' }
import na from '../src/data/questions/na.json' with { type: 'json' }
import ipc from '../src/data/questions/ipc.json' with { type: 'json' }
import ips from '../src/data/questions/ips.json' with { type: 'json' }
import sec from '../src/data/questions/sec.json' with { type: 'json' }
import auto from '../src/data/questions/auto.json' with { type: 'json' }

/**
 * End-to-end walk of the practice exam. This is the acceptance the whole
 * Stage 1-3 chain exists to satisfy: draw a paper, answer it, submit, and see
 * a reason for every item missed.
 */

const BANK = Object.values({ nf, na, ipc, ips, sec, auto }).flatMap((file) => file.questions)
const SEED = 12345
/** The exact paper every test here sees, so assertions can name its answers. */
const paper = selectQuestions(BANK, 20, SEED)
/** Budget the component should compute for this paper, derived independently. */
const BUDGET_MS =
  paper.reduce((sum, q) => sum + (config.exam.targetSecondsPerItem[q.type] ?? 45), 0) * 1000

/** Renders the runner at an explicit paper length, for the full-length criteria. */
function renderWithLength(length, seed = SEED) {
  window.history.pushState({}, '', `/exam?seed=${seed}`)
  return render(
    <MemoryRouter initialEntries={[`/exam?seed=${seed}`]}>
      <Routes>
        <Route path="/exam" element={<Exam length={length} />} />
      </Routes>
    </MemoryRouter>
  )
}

function renderExam(seed = SEED) {
  // MemoryRouter does not touch window.location, and the component reads the
  // `?seed=` debug override from there. Seed the URL directly so the test drives
  // the same paper it computed.
  window.history.pushState({}, '', `/exam?seed=${seed}`)
  return render(
    <MemoryRouter initialEntries={[`/exam?seed=${seed}`]}>
      <Routes>
        <Route path="/exam" element={<Exam />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  // The session now persists to localStorage, so a leftover attempt would
  // leak between tests. Clearing it is the only setup these tests need.
  localStorage.clear()
  cleanup()
})

describe('Exam page', () => {
  it('draws a 20-question paper with a running clock', () => {
    renderExam()
    expect(screen.getByRole('heading', { name: /practice exam/i })).toBeInTheDocument()
    expect(screen.getByText(/question 1 of 20/)).toBeInTheDocument()
    expect(screen.getByLabelText(/time remaining/i)).toBeInTheDocument()
  })

  it('restores the same paper, question and answers after a refresh', async () => {
    const user = userEvent.setup()
    const keys = Object.keys(paper[0].options)
    renderExam()

    const firstPrompt = document.querySelector('article p:nth-of-type(2)').textContent
    const firstKey = keys.find((k) => paper[0].answer.includes(k))
    await user.click(document.querySelectorAll('input')[keys.indexOf(firstKey)])
    await user.click(screen.getByRole('button', { name: 'Next' }))
    const secondPrompt = document.querySelector('article p:nth-of-type(2)').textContent

    cleanup()
    renderExam()

    // Same question on resume, and it is not the first question any more.
    expect(document.querySelector('article p:nth-of-type(2)').textContent).toBe(secondPrompt)
    expect(firstPrompt).not.toBe(secondPrompt)
    expect(screen.getByText(/question 2 of 20/)).toBeInTheDocument()

    // The answer given on question 1 survived the unmount/remount. There is no
    // back control any more, so the record is rewound to question 1 and the
    // question re-rendered. The seeding happens *after* the assertions above:
    // done before, it would break `question 2 of 20`.
    const stored = JSON.parse(localStorage.getItem('exam.active'))
    localStorage.setItem('exam.active', JSON.stringify({ ...stored, index: 0 }))
    cleanup()
    renderExam()

    expect(screen.getByText(/question 1 of 20/)).toBeInTheDocument()
    expect(document.querySelectorAll('input')[keys.indexOf(firstKey)]).toBeChecked()
  })

  it('clears the stored attempt on submit so the next paper is fresh', async () => {
    const user = userEvent.setup()
    renderExam()
    await user.click(document.querySelector('input'))

    const keys = Object.keys(paper[0].options)
    for (let i = 0; i < paper.length - 1; i += 1) {
      for (const key of paper[i].answer) {
        await user.click(document.querySelectorAll('input')[keys.indexOf(key)])
      }
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit exam' }))

    expect(localStorage.getItem('exam.active')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument()
  })

  it('abandons the attempt and starts a fresh paper', async () => {
    const user = userEvent.setup()
    renderExam()
    await user.click(document.querySelector('input'))
    expect(screen.getByText(/1 answered/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Abandon' }))

    expect(localStorage.getItem('exam.active')).not.toBeNull()
    expect(screen.getByText(/question 1 of 20/)).toBeInTheDocument()
    expect(screen.getByText(/0 answered/)).toBeInTheDocument()
  })

  it('shows why a chosen option was wrong, but never a placeholder', async () => {
    const user = userEvent.setup()
    const keys = Object.keys(paper[0].options)
    const wrongKey = keys.find((k) => !paper[0].answer.includes(k))

    renderExam()
    await user.click(document.querySelectorAll('input')[keys.indexOf(wrongKey)])
    for (let i = 0; i < paper.length - 1; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit exam' }))

    const review = screen.getByRole('heading', { name: /review what you missed/i }).closest('section')
    // The placeholder string must never reach the learner.
    expect(within(review).queryByText(/explain why this is wrong/)).not.toBeInTheDocument()
    // The candidate's own wrong pick is marked.
    expect(within(review).getAllByText(/you chose this/i).length).toBeGreaterThan(0)
    // The question-level explanation is present for each missed question.
    expect(within(review).getAllByText(paper[0].explanation).length).toBeGreaterThan(0)
  })

  it('renders a real rationale when one exists, and hides the placeholder beside it', () => {
    // Answer is B, so A/C/D are all wrong. A keeps the bank placeholder, C gets a
    // real reason, D is left empty. All three cases appear in one list, which is
    // what makes this a test of the filter rather than of rendering.
    const withRationale = {
      ...paper[0],
      answer: ['B'],
      options: {
        A: { ...paper[0].options.A, rationale: PLACEHOLDER_RATIONALE },
        B: { ...paper[0].options.B, rationale: undefined },
        C: { ...paper[0].options.C, rationale: 'Port security is a sticky-learn address limit.' },
        D: { ...paper[0].options.D, rationale: '   ' },
      },
    }
    const scored = scoreExam({ questions: [withRationale], answers: { [withRationale.id]: ['A'] } })
    // Result renders the "Take another paper" link, so it needs router context.
    render(
      <MemoryRouter>
        <Result result={scored} questions={[withRationale]} />
      </MemoryRouter>
    )

    expect(screen.getByText('C: Port security is a sticky-learn address limit.')).toBeInTheDocument()
    expect(screen.queryByText(`A: ${PLACEHOLDER_RATIONALE}`)).not.toBeInTheDocument()
    expect(screen.queryByText(/sticky-learn/, { selector: 'li' })).toBeInTheDocument()
    // Only the one real rationale rendered, not one per wrong option.
    expect(screen.getAllByText(/sticky-learn address limit/).length).toBe(1)
    // The question-level explanation still appears exactly once.
    expect(screen.getAllByText(withRationale.explanation)).toHaveLength(1)
  })

  it('counts answers and advances one question at a time', async () => {
    const user = userEvent.setup()
    renderExam()

    expect(screen.getByText(/0 answered/)).toBeInTheDocument()
    await user.click(document.querySelector('input'))
    expect(screen.getByText(/1 answered/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/question 2 of 20/)).toBeInTheDocument()

    // A fresh paper starts at question 1; clearing the store first is what makes
    // this a fresh one rather than a resumed attempt.
    cleanup()
    localStorage.clear()
    renderExam()
    expect(screen.getByText(/question 1 of 20/)).toBeInTheDocument()
    expect(screen.getByText(/0 answered/)).toBeInTheDocument()
  })

  it('offers Submit only on the final question', async () => {
    const user = userEvent.setup()
    renderExam()
    expect(screen.queryByRole('button', { name: 'Submit exam' })).not.toBeInTheDocument()

    for (let i = 0; i < 19; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText(/question 20 of 20/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit exam' })).toBeInTheDocument()
  }, 30000)

  it('scores a fully-correct paper as 20 of 20 with nothing to review', async () => {
    const user = userEvent.setup()
    // The seed is fixed, so the paper is known: answer every item by its key.
    renderExam()

    for (let i = 0; i < paper.length; i += 1) {
      const question = paper[i]
      const keys = Object.keys(question.options)
      for (const key of question.answer) {
        await user.click(document.querySelectorAll('input')[keys.indexOf(key)])
      }
      if (i < paper.length - 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    await user.click(screen.getByRole('button', { name: 'Submit exam' }))

    expect(screen.getByText(/20 of 20 correct \(100%\)/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /review what you missed/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /take another paper/i })).toBeInTheDocument()
  }, 60000)

  it('shows a reason and the correct key for every missed question', async () => {
    const user = userEvent.setup()
    renderExam()

    // Answer nothing, so all 20 items are missed.
    for (let i = 0; i < 19; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit exam' }))

    expect(screen.getByText(/0 of 20 correct \(0%\)/)).toBeInTheDocument()
    expect(screen.getByText(/20 unanswered/)).toBeInTheDocument()

    const section = screen.getByRole('heading', { name: /review what you missed/i }).closest('section')
    expect(within(section).getAllByText(/not answered/i)).toHaveLength(20)
    // Every missed item marks its correct options, so the count is the number of
    // correct keys in the paper — two for a multi-answer item, one otherwise.
    const correctKeys = paper.reduce((n, q) => n + q.answer.length, 0)
    expect(within(section).getAllByText('correct')).toHaveLength(correctKeys)
    // And every missed item carries a non-empty explanation of its own.
    for (const question of paper) {
      expect(within(section).getByText(question.explanation)).toBeInTheDocument()
    }
  }, 30000)

  /** The runner's remaining-time readout, in whole seconds. */
function readClockSeconds() {
  const [m, s] = screen.getByLabelText(/time remaining/i).textContent.trim().split(':').map(Number)
  return m * 60 + s
}

describe('Exam storage', () => {
  it('keeps the record in localStorage, not sessionStorage', async () => {
    const user = userEvent.setup()
    renderExam()
    // A tick has already elapsed, so the record has definitely been written.
    expect(localStorage.getItem('exam.active')).not.toBeNull()
    expect(sessionStorage.getItem('exam.active')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(JSON.parse(localStorage.getItem('exam.active')).index).toBe(1)
    expect(sessionStorage.getItem('exam.active')).toBeNull()
  })

  it('clears the localStorage record on submit', async () => {
    const user = userEvent.setup()
    renderExam()
    await user.click(document.querySelector('input'))
    expect(localStorage.getItem('exam.active')).not.toBeNull()

    for (let i = 0; i < 19; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }
    await user.click(screen.getByRole('button', { name: 'Submit exam' }))

    expect(localStorage.getItem('exam.active')).toBeNull()
    expect(sessionStorage.getItem('exam.active')).toBeNull()
  }, 30000)

  it('abandons to a fresh paper and a fresh record', async () => {
    const user = userEvent.setup()
    renderExam()
    await user.click(document.querySelector('input'))
    expect(screen.getByText(/1 answered/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Abandon' }))

    expect(screen.getByText(/0 answered/)).toBeInTheDocument()
    expect(screen.getByText(/question 1 of 20/)).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('exam.active')).answers).toEqual({})
  })

  /**
   * Store identity on its own is not enough: jsdom's `sessionStorage` survives
   * `cleanup()` exactly as `localStorage` does, so a UI-driven remount cannot tell
   * the two apart. `vi.resetModules()` clears the module-level `memoryFallback`,
   * so a fresh import that still resumes proves the value came out of storage
   * rather than out of process memory.
   */
  it('resumes the persisted attempt in a freshly evaluated module', async () => {
    const user = userEvent.setup()
    renderExam()
    await user.click(document.querySelectorAll('input')[1])
    await user.click(screen.getByRole('button', { name: 'Next' }))

    const before = JSON.parse(localStorage.getItem('exam.active'))
    cleanup()

    vi.resetModules()
    const { default: FreshExam } = await import('../src/features/exam/pages/Exam.jsx')
    render(
      <MemoryRouter initialEntries={[`/exam?seed=${SEED}`]}>
        <Routes>
          <Route path="/exam" element={<FreshExam />} />
        </Routes>
      </MemoryRouter>
    )

    const after = JSON.parse(localStorage.getItem('exam.active'))
    // Same attempt, same position, same answers. A redraw would share the paper -
    // the ?seed= draw is deterministic - but not the attemptId or the answers.
    expect(after.attemptId).toBe(before.attemptId)
    expect(after.index).toBe(1)
    expect(screen.getByText(/question 2 of 20/)).toBeInTheDocument()

    // Rewind the record to question 1 to check the answer survived; there is no
    // back control to click.
    localStorage.setItem('exam.active', JSON.stringify({ ...after, index: 0 }))
    cleanup()
    renderExam()
    expect(document.querySelectorAll('input')[1]).toBeChecked()
  })

  it('no longer claims progress dies with the tab', () => {
    renderExam()
    // Presence AND absence. Absence alone is defeatable: "not closing a tab" and
    // "not closing your browser" both keep the claim false and pass it.
    expect(document.body.textContent).toMatch(/survives\s+a\s+refresh\s+and\s+closing\s+the\s+page/)
    expect(document.body.textContent).not.toMatch(
      /not\s+closing\s+(the|a|your)\s+(tab|browser)/
    )
  })
})

/**
 * A backwards clock jump spanning a *reload* - the one clock case no existing
 * test covers. The backwards-jump test jumps without reloading, and the reloading
 * tests only move forward. Without the floors in `remainingFrom`, a backwards
 * jump across a reload restores the full budget and the follow-on tick costs
 * nothing.
 */
it('holds the clock when a backwards jump spans a reload, and still ticks down', () => {
  vi.useFakeTimers()
  try {
    const start = new Date('2026-01-01T12:00:00Z')
    vi.setSystemTime(start)
    renderExam()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    const beforeReload = readClockSeconds()

    cleanup()
    // An hour backwards, across the reload.
    vi.setSystemTime(new Date(start.getTime() - 3_600_000))
    renderExam()

    const afterReload = readClockSeconds()
    expect(afterReload).toBeLessThanOrEqual(beforeReload)

    // The distinguishing observable: the clock is held, not frozen. One further
    // tick must cost exactly one second.
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(readClockSeconds()).toBe(afterReload - 1)
  } finally {
    vi.useRealTimers()
  }
})

describe('Exam one-way navigation', () => {
  /**
   * Pinned by count, not by a bare existence check: baseline is 3
   * (Previous / Abandon / Next), so 2 is an assertion. `queryByRole` is
   * deliberately avoided - it filters on the accessibility tree, so `hidden`,
   * `aria-hidden` or `display:none` would all return null while the button is
   * still in the document.
   */
  it('has exactly two buttons on question 1 and no back control at all', () => {
    const { container } = renderExam()
    expect(container.querySelectorAll('button')).toHaveLength(2)
    expect(screen.queryByText(/previous/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abandon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('keeps the count at two all the way through the paper', async () => {
    const user = userEvent.setup()
    const { container } = renderExam()
    for (let i = 0; i < 19; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(container.querySelectorAll('button')).toHaveLength(2)
    }
    expect(screen.getByRole('button', { name: 'Submit exam' })).toBeInTheDocument()
    expect(container.querySelectorAll('button')).toHaveLength(2)
  }, 30000)

  /**
   * §7a:56: "A confirmation on the first advance states the student cannot
   * return." Asserted three ways on purpose. Role and visibility alone would be
   * met by a visible `role="status"` reading "Good luck"; the words are what
   * discharges the requirement. And a text-only check would be met by an
   * `sr-only` banner the student never sees, hence the visibility assertion.
   */
  it('states on the first advance that returning is not possible, then stops', async () => {
    const user = userEvent.setup()
    renderExam()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))

    const banner = screen.getByRole('status')
    expect(within(banner).getByText(/cannot return/i)).toBeInTheDocument()
    expect(banner).toBeVisible()

    // Later advances do not repeat it.
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not show the confirmation again after a resume', async () => {
    const user = userEvent.setup()
    renderExam()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    cleanup()
    renderExam()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Full-length exam', () => {
  /**
   * Scale, the one thing the 20-item walk does not cover. Auto-submit gets its
   * own criterion below: the 100-item budget is ~75 minutes, so it cannot be
   * reached inside this walk's window on real timers.
   */
  it('walks a 100-item paper end to end, answering and submitting', async () => {
    const user = userEvent.setup()
    renderWithLength(100)
    expect(screen.getByText(/question 1 of 100/)).toBeInTheDocument()

    for (let i = 0; i < PAPER_100.length - 1; i += 1) {
      const keys = Object.keys(PAPER_100[i].options)
      for (const key of PAPER_100[i].answer) {
        await user.click(document.querySelectorAll('input')[keys.indexOf(key)])
      }
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    // Last question, then submit.
    const last = PAPER_100[PAPER_100.length - 1]
    const lastKeys = Object.keys(last.options)
    for (const key of last.answer) {
      await user.click(document.querySelectorAll('input')[lastKeys.indexOf(key)])
    }
    await user.click(screen.getByRole('button', { name: 'Submit exam' }))

    expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument()
    expect(screen.getByText(/^100 of 100 correct \(100%\)$/)).toBeInTheDocument()
    expect(localStorage.getItem('exam.active')).toBeNull()
  }, 60000)

  /**
   * Auto-submit at 0:00, proven with a budget derived independently of the record
   * so a mis-scaled `budgetFor` cannot pass. Two halves: one second short of the
   * budget there is no Result; one second past it there is, with no Submit click.
   *
   * The clock is moved with `setSystemTime` and only two ticks are fired, rather
   * than advancing 4.5 million of fake time — same observable, four and a half
   * million fewer React renders.
   */
  it('auto-submits at 0:00 on a 100-item paper', () => {
    vi.useFakeTimers()
    try {
      const start = new Date('2026-01-01T12:00:00Z')
      vi.setSystemTime(start)
      renderWithLength(100)
      expect(screen.getByText(/question 1 of 100/)).toBeInTheDocument()

      // One tick's worth short of the budget: still running.
      vi.setSystemTime(new Date(start.getTime() + BUDGET_100_MS - 2000))
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.queryByRole('heading', { name: 'Result' })).not.toBeInTheDocument()

      // Past the budget: auto-submitted, with no Submit click anywhere.
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument()
      expect(localStorage.getItem('exam.active')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

it('cannot be advanced past the last question', () => {
    renderExam()

    // React batches these into one render, so every handler sees the same
    // starting index and `isLast` never flips to hide the Next button. Without
    // a clamp the index runs off the end and `questions[index]` crashes.
    act(() => {
      for (let i = 0; i < 40; i += 1) {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      }
    })

    expect(screen.getByText(/question 20 of 20/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit exam' })).toBeInTheDocument()
  })

it('clamps a stored index that points past the end of the paper', () => {
    renderExam()
    const stored = JSON.parse(localStorage.getItem('exam.active'))
    // A record left over from a longer paper, or edited by hand.
    localStorage.setItem('exam.active', JSON.stringify({ ...stored, index: 999 }))

    cleanup()
    renderExam()

    // The last question renders rather than `questions[999]` crashing.
    expect(screen.getByText(/question 20 of 20/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit exam' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })
/**
 * Budget for a 100-item paper, derived from the paper this seed draws.
 *
 * Derived, never read off the record: `budgetMs` in the store is whatever
 * `budgetFor` wrote, so advancing past it fires the auto-submit effect for *any*
 * budget, and a mis-scaled `budgetFor` would pass. Reading an independent figure
 * is what makes the criterion mean anything.
 */
const PAPER_100 = selectQuestions(BANK, 100, SEED)
const BUDGET_100_MS =
  PAPER_100.reduce((sum, q) => sum + (config.exam.targetSecondsPerItem[q.type] ?? 45), 0) * 1000

describe('Exam paper length', () => {
  it('defaults to a 20-item paper when no length is supplied', () => {
    renderExam()
    expect(screen.getByText(/question 1 of 20/)).toBeInTheDocument()
    expect(screen.getByText(/^20 questions, budget/)).toBeInTheDocument()
  })

  it('draws 100 questions when asked, and the footer counts the drawn paper', () => {
    renderWithLength(100)
    expect(screen.getByText(/question 1 of 100/)).toBeInTheDocument()
    expect(screen.getByText(/^100 questions, budget/)).toBeInTheDocument()
  })

  /**
   * The footer is asserted in BOTH directions on purpose. Reading 100 at
   * length 100 is what a hardcoded constant fails; reading 20 at the default is
   * what `{config.exam.defaultLength}` - 100 - fails, because it would make every
   * default paper advertise "100 questions". Either half alone passes vacuously.
   */
  it('counts the drawn paper rather than a constant or the config default', () => {
    cleanup()
    localStorage.clear()
    renderWithLength(100)
    expect(screen.getByText(/^100 questions, budget/)).toBeInTheDocument()

    cleanup()
    localStorage.clear()
    renderExam()
    expect(screen.getByText(/^20 questions, budget/)).toBeInTheDocument()
  })

  /**
   * `abandon()` is the only caller that re-runs `initialSession` after mount. A
   * `length` threaded only into the initial draw is lost here and the next paper
   * silently reverts to the module default.
   */
  it('keeps the injected length when the attempt is abandoned', async () => {
    const user = userEvent.setup()
    renderWithLength(100)
    expect(screen.getByText(/question 1 of 100/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Abandon' }))

    expect(screen.getByText(/question 1 of 100/)).toBeInTheDocument()
    expect(screen.getByText(/^100 questions, budget/)).toBeInTheDocument()
    expect(screen.getByText(/0 answered/)).toBeInTheDocument()
  }, 30000)
})

it('gives an attempt restored already out of time straight to its result, never the paper', () => {
    renderExam()
    // Age the stored attempt past its budget while it is off-screen.
    const stored = JSON.parse(localStorage.getItem('exam.active'))
    localStorage.setItem(
      'exam.active',
      JSON.stringify({ ...stored, remainingMs: 0, lastTickAt: stored.lastTickAt })
    )

    cleanup()
    renderExam()

    // The runner must never appear — not even for one frame — because the
    // question controls are what the candidate would answer into. The review
    // list legitimately quotes the prompt, so that is not the signal here.
    expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /practice exam/i })).not.toBeInTheDocument()
    expect(document.querySelectorAll('input[type=radio], input[type=checkbox]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /submit exam|next|previous/i })).not.toBeInTheDocument()
    expect(localStorage.getItem('exam.active')).toBeNull()
  })

  it('does not double-count the time that passed while the tab was closed', () => {
    vi.useFakeTimers()
    try {
      const start = new Date('2026-01-01T12:00:00Z')
      vi.setSystemTime(start)
      renderExam()

      // Ten minutes away, then back — the resume consumes the ten minutes once.
      cleanup()
      vi.advanceTimersByTime(600_000)
      renderExam()
      const onResume = readClockSeconds()

      // One more second of ticking must cost exactly one second, not re-charge
      // the ten minutes that were already deducted.
      act(() => {
        vi.advanceTimersByTime(1_000)
      })
      expect(readClockSeconds()).toBe(onResume - 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('spends no time while an attempt is restored and the clock has not moved', () => {
    vi.useFakeTimers()
    try {
      const now = new Date('2026-01-01T12:00:00Z')
      vi.setSystemTime(now)
      renderExam()

      cleanup()
      vi.advanceTimersByTime(0)
      renderExam()

      // Two renders at the same instant must agree exactly, so restoring cannot
      // silently refund the budget.
      const text = screen.getByLabelText(/time remaining/i).textContent
      const [m, s] = text.split(':').map(Number)
      expect(m * 60 + s).toBe(Math.round(BUDGET_MS / 1000))
    } finally {
      vi.useRealTimers()
    }
  })

  it('deducts elapsed wall time on resume rather than refunding the budget', () => {
    vi.useFakeTimers()
    try {
      const start = new Date('2026-01-01T12:00:00Z')
      vi.setSystemTime(start)
      renderExam()

      // Candidate leaves; ten minutes pass; they come back. Advancing the fake
      // clock is enough — no component is mounted to react to it.
      cleanup()
      vi.advanceTimersByTime(600_000)
      renderExam()

      const text = screen.getByLabelText(/time remaining/i).textContent
      const [m, s] = text.split(':').map(Number)
      expect(m * 60 + s).toBe(Math.round(BUDGET_MS / 1000) - 600)
    } finally {
      vi.useRealTimers()
    }
  })

  it('grants no extra time when the clock is moved backwards', () => {
    vi.useFakeTimers()
    try {
      const start = new Date('2026-01-01T12:00:00Z')
      vi.setSystemTime(start)
      renderExam()

      // One minute forward, then an hour backwards. Each step is followed by a tick,
      // because the clock text only re-renders when the interval fires.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      const before = readClockSeconds()

      act(() => {
        vi.setSystemTime(new Date(start.getTime() - 3_600_000))
        vi.advanceTimersByTime(1_000)
      })

      // Without the floors on both deltas, going backwards would hand back the
      // hour and the reading would rise above `before`.
      expect(readClockSeconds()).toBeLessThanOrEqual(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('submits automatically once the budget is spent', () => {
    vi.useFakeTimers()
    try {
      const start = new Date('2026-01-01T12:00:00Z')
      vi.setSystemTime(start)
      renderExam()

      act(() => {
        vi.advanceTimersByTime(BUDGET_MS + 5_000)
      })

      expect(screen.getByRole('heading', { name: 'Result' })).toBeInTheDocument()
      expect(localStorage.getItem('exam.active')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('distinguishes an unanswered item from a wrong one', async () => {
    const user = userEvent.setup()
    renderExam()

    // Answer question 1 wrongly, leave question 2 blank, answer the rest correctly.
    const wrongKeys = Object.keys(paper[0].options).filter((k) => !paper[0].answer.includes(k))
    await user.click(document.querySelectorAll('input')[Object.keys(paper[0].options).indexOf(wrongKeys[0])])
    await user.click(screen.getByRole('button', { name: 'Next' })) // now on index 1
    await user.click(screen.getByRole('button', { name: 'Next' })) // skip index 1, blank

    for (let i = 2; i < paper.length; i += 1) {
      const question = paper[i]
      const keys = Object.keys(question.options)
      for (const key of question.answer) {
        await user.click(document.querySelectorAll('input')[keys.indexOf(key)])
      }
      if (i < paper.length - 1) await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    await user.click(screen.getByRole('button', { name: 'Submit exam' }))

    // 1 wrong + 1 blank out of 20 leaves 18 correct.
    expect(screen.getByText(/18 of 20 correct \(90%\)/)).toBeInTheDocument()
    expect(screen.getByText(/1 unanswered/)).toBeInTheDocument()

    const section = screen.getByRole('heading', { name: /review what you missed/i }).closest('section')
    expect(within(section).getAllByText(/answered incorrectly/i)).toHaveLength(1)
    expect(within(section).getAllByText(/not answered/i)).toHaveLength(1)
  }, 60000)
})

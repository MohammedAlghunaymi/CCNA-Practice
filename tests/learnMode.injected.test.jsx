import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import LearnMode from '../src/features/practice/pages/LearnMode.jsx'
import { PLACEHOLDER_RATIONALE } from '../src/lib/rationale.js'
import { PROGRESS_KEY, clearProgress } from '../src/lib/progress.js'

/**
 * The reveal, against a synthetic bank — in its own file on purpose.
 *
 * `vi.mock` is file-wide. `tests/learnMode.test.jsx` renders against the real
 * 169-question bank, and if the synthetic bank were declared there it would
 * silently empty the other five domains out from under every other test in it,
 * with the whole suite green. Splitting the file is the only way to have both.
 *
 * Nothing in the shipped bank can exercise this behaviour: all 507 wrong options
 * hold the placeholder and none of the 170 correct options carries a rationale,
 * so the pager renders no per-option rationale for any of the 169 questions. A
 * suite drawn only from `src/data/questions/` would therefore stay green on a
 * pager whose rationale rendering had been deleted outright — which is the
 * failure this file exists to prevent.
 *
 * The three cases are enumerated rather than summarised because the positive one
 * is the whole point: a render test that only asserted the two absences would
 * pass against a component that never shows anything.
 */
const { mockBank, withRationale } = vi.hoisted(() => {
  const withRationale = {
    id: 'inj-1',
    objectiveId: '1.6',
    domain: 'NF',
    type: 'mcq-single',
    preamble: null,
    prompt: 'Which statement about port security is true?',
    options: {
      // correct AND carrying a real rationale: must still be suppressed, so this
      // case pins the `option.correct` conjunct rather than the placeholder rule.
      A: {
        text: 'It is a sticky-learn address limit',
        correct: true,
        rationale: 'Not shown, because the option is correct.',
      },
      // A real rationale: the only row of the reveal table that carries
      // information, and the one no bank question can reach.
      B: {
        text: 'It needs no configuration to be useful',
        correct: false,
        rationale: 'Port security must be configured per interface before it filters.',
      },
      // The bank-wide reality, in miniature.
      C: { text: 'It learns only from the first frame', correct: false, rationale: 'TODO' },
    },
    answer: ['A'],
    explanation: 'Port security enforces a learned address limit per interface.',
    difficulty: 'medium',
    batch: 'inj',
    // Carried so the pager's provenance line does not crash on a missing commit
    // and so the line is exercised here as well as against the real bank.
    upstream: { project: 'Onesayi/ccna-simulator', commit: '6efca4f15e8ccf01', id: 'inj', licence: 'MIT' },
    upstreamLabs: [],
  }
  return { mockBank: { questions: [withRationale] }, withRationale }
})

vi.mock('../src/data/questions/nf.json', () => ({ default: mockBank }))
vi.mock('../src/data/questions/na.json', () => ({ default: { questions: [] } }))
vi.mock('../src/data/questions/ipc.json', () => ({ default: { questions: [] } }))
vi.mock('../src/data/questions/ips.json', () => ({ default: { questions: [] } }))
vi.mock('../src/data/questions/sec.json', () => ({ default: { questions: [] } }))
vi.mock('../src/data/questions/auto.json', () => ({ default: { questions: [] } }))

const REAL_RATIONALE = 'Port security must be configured per interface before it filters.'
const SUPPRESSED_ON_CORRECT = 'Not shown, because the option is correct.'

function renderInjected() {
  return render(
    <MemoryRouter initialEntries={['/practice/NF']}>
      <Routes>
        <Route path="/practice/:domainId" element={<LearnMode />} />
      </Routes>
    </MemoryRouter>
  )
}

function reveal() {
  fireEvent.click(screen.getByRole('button', { name: /show answer/i }))
}

describe('LearnMode reveal, with a synthetic bank', () => {
  beforeEach(() => {
    localStorage.clear()
    clearProgress()
  })
  afterEach(() => cleanup())

  it('shows nothing until the reader asks', () => {
    renderInjected()
    expect(screen.queryByText(REAL_RATIONALE)).toBeNull()
    expect(screen.queryByText(withRationale.explanation)).toBeNull()
  })

  it('renders the real rationale under the wrong option', () => {
    renderInjected()
    reveal()
    expect(screen.getByText(REAL_RATIONALE)).toBeTruthy()
  })

  it('suppresses the placeholder rather than showing it', () => {
    renderInjected()
    reveal()
    // The literal `TODO` appears in the option TEXT here by accident of the
    // fixture, so the assertion is on the real placeholder string, and on the
    // whole document.
    expect(screen.queryByText(PLACEHOLDER_RATIONALE)).toBeNull()
    expect(document.body.textContent).not.toContain(PLACEHOLDER_RATIONALE)
  })

  it('suppresses a rationale on a correct option', () => {
    renderInjected()
    reveal()
    expect(screen.queryByText(SUPPRESSED_ON_CORRECT)).toBeNull()
  })

  it('still shows the question-level explanation exactly once', () => {
    renderInjected()
    reveal()
    expect(screen.getAllByText(withRationale.explanation)).toHaveLength(1)
  })

  it('renders the provenance line from the injected upstream', () => {
    renderInjected()
    expect(screen.getByText(/Onesayi\/ccna-simulator/)).toBeTruthy()
    expect(screen.getByText('6efca4f')).toBeTruthy()
  })

  it('counts the injected bank, not the real one', () => {
    renderInjected()
    expect(screen.getByText(/Question 1 of 1/)).toBeTruthy()
  })

  it('records the verdict for the injected question', () => {
    renderInjected()
    fireEvent.click(screen.getByRole('button', { name: /^B\./ }))
    const record = JSON.parse(localStorage.getItem(PROGRESS_KEY))
    expect(record.answers['inj-1']).toEqual({ chosen: ['B'], correct: false })
  })
})
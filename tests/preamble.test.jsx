import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import Exam, { Result, PreambleBlock } from '../src/features/exam/pages/Exam.jsx'
import { scoreExam } from '../src/lib/score.js'

/**
 * The preamble payload, and the guards around a question that has no options.
 *
 * The shipped bank holds 169 questions and every one has `preamble: null` with
 * no `preambleText`, so none of this is reachable through the real data. That is
 * precisely why it needs its own fixture: the assertions below describe
 * behaviour nothing else exercises, and a suite that only ever draws from
 * `src/data/questions/` would stay green on a renderer that had been deleted.
 *
 * Exam.jsx builds BANK at module scope, so the mocked bank has to be populated
 * before the import - hence vi.hoisted.
 */

const { mockBank, withPreamble, noOptions } = vi.hoisted(() => {
  const withPreamble = {
    id: 'pfx-1',
    objectiveId: '1.6',
    domain: 'NF',
    type: 'mcq-single',
    preamble: 'show-output',
    preambleText: 'Router#show ip interface brief\nGigabitEthernet0/0  up  up',
    prompt: 'Which interface is up?',
    options: {
      A: { text: 'GigabitEthernet0/0', correct: true },
      B: { text: 'GigabitEthernet0/1', rationale: 'That interface is administratively down.' },
    },
    answer: ['A'],
    explanation: 'The output shows 0/0 as up/up.',
    difficulty: 'medium',
    batch: 'pfx',
  }
  return {
    mockBank: { questions: [withPreamble] },
    withPreamble,
    // Not in the mocked bank, and deliberately so: `drag-drop` is not in
    // DRAWABLE_TYPES during Round 1, so the runner cannot be handed this item
    // at all. The review pane takes `questions` as a prop, so it can.
    noOptions: {
      id: 'pfx-2',
      objectiveId: '1.6',
      domain: 'NF',
      type: 'drag-drop',
      preamble: null,
      prompt: 'Match each mechanism to its purpose.',
      pairs: [
        { left: 'STP', right: 'prevents loops' },
        { left: 'BPDU guard', right: 'redundant topology' },
      ],
      answer: ['prevents loops', 'redundant topology'],
      explanation: 'STP prevents loops; BPDU guard guards the edge.',
      difficulty: 'medium',
      batch: 'pfx',
    },
  }
})

vi.mock('../src/data/questions/nf.json', () => ({ default: mockBank }))
vi.mock('../src/data/questions/na.json', () => ({ default: { questions: [] } }))
vi.mock('../src/data/questions/ipc.json', () => ({ default: { questions: [] } }))
vi.mock('../src/data/questions/ips.json', () => ({ default: { questions: [] } }))
vi.mock('../src/data/questions/sec.json', () => ({ default: { questions: [] } }))
vi.mock('../src/data/questions/auto.json', () => ({ default: { questions: [] } }))

function renderRunner() {
  return render(
    <MemoryRouter initialEntries={['/exam?seed=7']}>
      <Routes>
        <Route path="/exam" element={<Exam length={1} />} />
      </Routes>
    </MemoryRouter>
  )
}

function renderReview(question) {
  const result = scoreExam({ questions: [question], answers: { [question.id]: ['B'] } })
  return render(
    <MemoryRouter>
      <Result result={result} questions={[question]} />
    </MemoryRouter>
  )
}

/**
 * True when the preamble element precedes the prompt element in document order.
 * DOCUMENT_POSITION_FOLLOWING on a.compareDocumentPosition(b) means "b follows
 * a", so the comparison has to run preamble-first.
 */
function preamblePrecedesPrompt(promptText) {
  const preamble = screen.getByTestId('preamble')
  const prompt = screen.getByText(promptText)
  return (preamble.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

beforeEach(() => {
  localStorage.clear()
  window.history.pushState({}, '', '/exam?seed=7')
})

afterEach(() => cleanup())

describe('PreambleBlock', () => {
  it('renders the payload as a preformatted block', () => {
    render(<PreambleBlock text="Router#show ip route" />)
    expect(screen.getByTestId('preamble')).toHaveTextContent('Router#show ip route')
  })

  it('renders nothing when the payload is absent, empty or whitespace', () => {
    for (const value of [undefined, null, '', '   \n  ']) {
      const { container } = render(<PreambleBlock text={value} />)
      expect(container).toBeEmptyDOMElement()
      cleanup()
    }
  })

  it('renders on the text alone, not on the preamble flag', () => {
    // The reason the component takes no `preamble` prop: questionSchema forbids
    // the flag on hands-on but not the payload, and rejects no unknown keys, so
    // `preamble: null` alongside a rendered `preambleText` is reachable. Keying
    // the render on the flag would hide a payload that is still on screen.
    const { container } = render(<PreambleBlock text="device output" />)
    expect(container).not.toBeEmptyDOMElement()
  })
})

describe('the preamble renders above the stem', () => {
  it('in the runner', () => {
    renderRunner()
    expect(screen.getByTestId('preamble')).toBeInTheDocument()
    expect(preamblePrecedesPrompt('Which interface is up?')).toBe(true)
  })

  it('in the review pane', () => {
    renderReview(withPreamble)
    expect(screen.getByTestId('preamble')).toBeInTheDocument()
    expect(preamblePrecedesPrompt('Which interface is up?')).toBe(true)
  })
})

describe('an item with no options', () => {
  // `Object.entries(undefined)` throws, so these are the dereferences that would
  // break on the first drag-drop question shipped. Four of the five live in the
  // review pane (Exam.jsx:494, :496, :513, :514), which takes questions as a prop.
  //
  // The fifth is the runner's :343, and it cannot be exercised here: `drag-drop`
  // is not in DRAWABLE_TYPES until Track 2 Task 1, so selectQuestions refuses to
  // build a paper containing one and the runner can never be handed this item.
  // The guard is written and lint-clean but untested until then; that is stated
  // rather than papered over with a fixture that could not reach it anyway.
  it('renders the review pane without throwing', () => {
    expect(() => renderReview(noOptions)).not.toThrow()
  })

  it('still shows the prompt and says the item offers no options', () => {
    renderReview(noOptions)
    expect(screen.getByText('Match each mechanism to its purpose.')).toBeInTheDocument()
    expect(screen.getByText(/offers no options/)).toBeInTheDocument()
  })

  it('shows no rationale list, since there are no options to rationalise', () => {
    renderReview(noOptions)
    expect(screen.queryByTestId('preamble')).not.toBeInTheDocument()
  })
})
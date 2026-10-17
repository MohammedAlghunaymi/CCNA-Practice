import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import LearnMode from '../src/features/practice/pages/LearnMode.jsx'
import { byDomain } from '../src/lib/bank.js'
import { PROGRESS_KEY, clearProgress } from '../src/lib/progress.js'

/**
 * The practice pager, against the real bank.
 *
 * The sentinel used to detect a revealed explanation is the question's own
 * `explanation` string, looked up from the bank rather than hardcoded — a
 * literal in the test would go stale the moment the bank is re-authored, and a
 * generic substring would match other copy on the page.
 *
 * No `vi.mock` of the question files here, deliberately. `vi.mock` is
 * file-wide, so a synthetic bank added to this file for one case would silently
 * empty the other five domains out from under every other test in it. The
 * synthetic-bank tests live in `tests/learnMode.injected.test.jsx`.
 */
const NF = byDomain('NF')
const IPS = byDomain('IPS')

function renderAt(domainId) {
  return render(
    <MemoryRouter initialEntries={[`/practice/${domainId}`]}>
      <Routes>
        <Route path="/practice/:domainId" element={<LearnMode />} />
      </Routes>
    </MemoryRouter>
  )
}

function stored() {
  return JSON.parse(localStorage.getItem(PROGRESS_KEY))
}

function optionButton(key) {
  return screen.getByRole('button', { name: new RegExp(`^${key}\\.`) })
}

/**
 * Step forward until the named question is on screen.
 *
 * Throws if it is never reached. The loop form this replaces stopped silently
 * on whatever question happened to be last, which let an assertion about option
 * ordering pass against the wrong item.
 */
function walkTo(prompt) {
  for (let i = 0; i < 200; i += 1) {
    if (screen.queryByText(prompt)) return
    const next = screen.getByRole('button', { name: /^next$/i })
    if (next.disabled) break
    fireEvent.click(next)
  }
  throw new Error(`never reached the question: ${prompt}`)
}

describe('LearnMode', () => {
  beforeEach(() => {
    localStorage.clear()
    clearProgress()
  })
  afterEach(() => cleanup())

  it('shows the first question of the domain, unanswered', () => {
    renderAt('NF')
    expect(screen.getByText(/Question 1 of 33/)).toBeTruthy()
    expect(screen.getByText(NF[0].prompt)).toBeTruthy()
    expect(screen.queryByText(NF[0].explanation)).toBeNull()
  })

  it('reveals the explanation on demand and hides it again on the next question', () => {
    renderAt('NF')
    expect(screen.queryByText(NF[0].explanation)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText(NF[0].explanation)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    expect(screen.getByText(/Question 2 of 33/)).toBeTruthy()
    expect(screen.queryByText(NF[0].explanation)).toBeNull()
  })

  it('keeps a revisited question revealed, with its options still disabled', () => {
    // The regression a Set of ids prevents and a scalar does not: after a
    // second reveal the cursor holds only the latest id, so Prev would hide the
    // answer AND re-enable the options while the stored pick was re-supplied.
    renderAt('NF')
    fireEvent.click(screen.getByRole('button', { name: /show answer/i }))
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    fireEvent.click(screen.getByRole('button', { name: /show answer/i }))
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))

    expect(screen.getByText(/Question 1 of 33/)).toBeTruthy()
    expect(screen.getByText(NF[0].explanation)).toBeTruthy()
    for (const key of Object.keys(NF[0].options)) {
      expect(optionButton(key).disabled).toBe(true)
    }
  })

  it('disables the options once the answer is revealed', () => {
    renderAt('NF')
    expect(optionButton('A').disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /show answer/i }))
    for (const key of Object.keys(NF[0].options)) {
      expect(optionButton(key).disabled).toBe(true)
    }
  })

  it('ignores a click on an option after the reveal', () => {
    renderAt('NF')
    fireEvent.click(optionButton('A'))
    expect(stored().answers[NF[0].id].chosen).toEqual(['A'])

    fireEvent.click(screen.getByRole('button', { name: /show answer/i }))
    const before = JSON.stringify(stored().answers[NF[0].id])
    fireEvent.click(optionButton('B'))
    expect(JSON.stringify(stored().answers[NF[0].id])).toBe(before)
  })

  it('treats the first and last question as ends, not errors', () => {
    renderAt('NF')
    expect(screen.getByRole('button', { name: /previous/i }).disabled).toBe(true)

    // Step to the end. NF has 33 questions.
    for (let i = 0; i < 40; i += 1) {
      const next = screen.getByRole('button', { name: /^next$/i })
      if (next.disabled) break
      fireEvent.click(next)
    }
    expect(screen.getByText(/Question 33 of 33/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /^next$/i }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /previous/i }).disabled).toBe(false)
  })

  it('records a wrong pick as incorrect', () => {
    renderAt('NF')
    const q = NF[0]
    const wrongKey = Object.keys(q.options).find((k) => !q.answer.includes(k))
    fireEvent.click(optionButton(wrongKey))
    expect(stored().answers[q.id]).toEqual({ chosen: [wrongKey], correct: false })
  })

  it('records a right pick as correct', () => {
    renderAt('NF')
    const q = NF[0]
    fireEvent.click(optionButton(q.answer[0]))
    expect(stored().answers[q.id]).toEqual({ chosen: [q.answer[0]], correct: true })
  })

  it('marks a partial multi-answer pick incorrect rather than right', () => {
    // The bank holds exactly one mcq-multi question. `isCorrectSet` is
    // all-or-nothing; `answer.includes(chosen[0])` would call a partial pick
    // correct, and for mcq-single the two are indistinguishable — so this is
    // the only assertion that pins the rule.
    const multi = IPS.find((q) => q.type === 'mcq-multi')
    expect(multi).toBeTruthy()
    expect(multi.answer).toHaveLength(2)

    renderAt('IPS')
    // Walk to the multi question.
    walkTo(multi.prompt)
    expect(screen.getByText(multi.prompt)).toBeTruthy()

    fireEvent.click(optionButton(multi.answer[0]))
    expect(stored().answers[multi.id].correct).toBe(false)

    fireEvent.click(optionButton(multi.answer[1]))
    expect(stored().answers[multi.id].correct).toBe(true)
    expect(stored().answers[multi.id].chosen.sort()).toEqual([...multi.answer].sort())
  })

  it('adds nothing of its own about how many answers a question wants', () => {
    // The bank's own prompt already says "(Choose two.)" for the one
    // mcq-multi question, so asserting the phrase is absent would only ever
    // match the question text. What matters is that the pager contributes no
    // second mention — exactly one, and it is the prompt the bank shipped.
    const multi = IPS.find((q) => q.type === 'mcq-multi')
    renderAt('IPS')
    walkTo(multi.prompt)

    const mentions = screen.getAllByText(/choose two/i)
    expect(mentions).toHaveLength(1)
    expect(mentions[0].textContent).toBe(multi.prompt)
  })

  it('resumes the reader at the stored cursor', () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ v: 1, domain: 'NF', index: 4, answers: {} })
    )
    renderAt('NF')
    expect(screen.getByText(/Question 5 of 33/)).toBeTruthy()
  })

  it('ignores a cursor left in another domain and keeps its answers', () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        v: 1,
        domain: 'NA',
        index: 2,
        answers: { [NF[0].id]: { chosen: ['A'], correct: false } },
      })
    )
    renderAt('NF')
    // Resumes at the start, not at NA's index clamped against NF's list.
    expect(screen.getByText(/Question 1 of 33/)).toBeTruthy()
    expect(stored().answers[NF[0].id]).toEqual({ chosen: ['A'], correct: false })
  })

  it('clamps a stale same-domain cursor to the end of the list', () => {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ v: 1, domain: 'NF', index: 999, answers: {} })
    )
    renderAt('NF')
    expect(screen.getByText(/Question 33 of 33/)).toBeTruthy()
  })

  it('re-shows the reader their own pick after navigating away and back', () => {
    renderAt('NF')
    const wrongKey = Object.keys(NF[0].options).find((k) => !NF[0].answer.includes(k))
    fireEvent.click(optionButton(wrongKey))

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))

    expect(optionButton(wrongKey).getAttribute('aria-pressed')).toBe('true')
  })

  it('cites where each question came from', () => {
    renderAt('NF')
    expect(screen.getByText(/Onesayi\/ccna-simulator/)).toBeTruthy()
    expect(screen.getByText('6efca4f')).toBeTruthy()
  })

  it('renders options in a stable A-to-E order', () => {
    renderAt('IPS')
    const multi = IPS.find((q) => q.type === 'mcq-multi')
    walkTo(multi.prompt)
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.textContent.trim().slice(0, 2))
      .filter((t) => /^[A-E]\./.test(t))
    expect(labels).toEqual(['A.', 'B.', 'C.', 'D.', 'E.'])
  })

  it('says so plainly when a domain has no questions', () => {
    renderAt('XX')
    expect(screen.getByText(/Nothing to practise here/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^next$/i })).toBeNull()
  })

  it('links back to the category index', () => {
    renderAt('NF')
    expect(
      screen.getByRole('link', { name: /back to the categories/i }).getAttribute('href')
    ).toBe('/practice')
  })
})
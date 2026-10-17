import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import PracticeHome from '../src/features/practice/pages/PracticeHome.jsx'
import objectives from '../src/data/objectives.json' with { type: 'json' }
import { byDomain } from '../src/lib/bank.js'
import { PROGRESS_KEY, clearProgress } from '../src/lib/progress.js'

/**
 * The category index.
 *
 * Counts are read from the bank, never from the allocation target, and the
 * labels are asserted rather than assumed — `Home.jsx` spent three review
 * cycles printing a target under the words "in bank", and IPS is the domain that
 * catches a regression here (allocated 31, actually holding 32), so its card is
 * asserted on both numbers explicitly.
 */
function renderPractice() {
  return render(
    <MemoryRouter initialEntries={['/practice']}>
      <Routes>
        <Route path="/practice" element={<PracticeHome />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PracticeHome', () => {
  beforeEach(() => {
    localStorage.clear()
    clearProgress()
  })
  afterEach(() => cleanup())

  it('renders one card per blueprint domain', () => {
    renderPractice()
    for (const domain of objectives.domains) {
      expect(screen.getByRole('link', { name: new RegExp(domain.name, 'i') })).toBeTruthy()
    }
    expect(screen.getAllByRole('link')).toHaveLength(objectives.domains.length + 1) // +1 back link
  })

  it('labels every card with its real count from the bank', () => {
    renderPractice()
    expect(screen.getByText(/^33 in bank$/)).toBeTruthy() // NF
    expect(screen.getByText(/^37 in bank$/)).toBeTruthy() // NA
    expect(screen.getByText(/^31 in bank$/)).toBeTruthy() // IPC
    expect(screen.getByText(/^32 in bank$/)).toBeTruthy() // IPS
    expect(screen.getByText(/^24 in bank$/)).toBeTruthy() // SEC
    expect(screen.getByText(/^12 in bank$/)).toBeTruthy() // AUTO
  })

  it('never shows an allocation target in place of a count', () => {
    renderPractice()
    // 61/58/71/50/29 are the v1 per-domain targets. `31` is excluded: it is
    // both IPC's real count and IPS's target, so the string is not evidence of
    // anything on its own.
    for (const target of ['61', '58', '71', '50', '29']) {
      expect(screen.queryByText(new RegExp(`^${target}`))).toBeNull()
    }
  })

  it('states the real total, not the 300-question target', () => {
    renderPractice()
    // Not anchored at the end: the sentence is followed by more copy in the
    // same <p>, and testing-library matches a regex against the whole
    // normalised text of an element, not a substring window.
    expect(screen.getByText(/169 questions across 6 categories\./)).toBeTruthy()
  })

  it('links each card to its own domain by id', () => {
    renderPractice()
    for (const domain of objectives.domains) {
      const link = screen.getByRole('link', { name: new RegExp(domain.name, 'i') })
      expect(link.getAttribute('href')).toBe(`/practice/${domain.id}`)
    }
  })

  it('links back to the overview', () => {
    renderPractice()
    expect(
      screen.getByRole('link', { name: /back to the overview/i }).getAttribute('href')
    ).toBe('/')
  })

  it('starts every card at zero answered', () => {
    renderPractice()
    expect(screen.getByText(/^0 of 33 answered$/)).toBeTruthy()
    expect(screen.getByText(/^0 of 37 answered$/)).toBeTruthy()
  })

  it('offers no reset control when there is nothing to reset', () => {
    renderPractice()
    expect(screen.queryByRole('button', { name: /reset practice progress/i })).toBeNull()
  })
})

/**
 * The answered fraction, which is a per-domain count and not a total.
 *
 * `progress.answers` is one map keyed by question id across every domain the
 * reader has visited. Counting its keys would give all six cards the same
 * number, so a reader who answered two Network Fundamentals questions would see
 * IP Connectivity claim two as well. The second test is the one that catches it.
 */
describe('PracticeHome progress', () => {
  const NF = byDomain('NF')
  const NA = byDomain('NA')

  function seed(domainId, questionIds) {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        v: 1,
        domain: domainId,
        index: 0,
        answers: Object.fromEntries(
          questionIds.map((id) => [id, { chosen: ['A'], correct: false }])
        ),
      })
    )
  }

  beforeEach(() => {
    localStorage.clear()
    clearProgress()
  })
  afterEach(() => cleanup())

  it('counts each domain only against its own questions', () => {
    seed('NF', [NF[0].id, NF[1].id, NA[0].id])
    renderPractice()
    expect(screen.getByText(/^2 of 33 answered$/)).toBeTruthy() // NF
    expect(screen.getByText(/^1 of 37 answered$/)).toBeTruthy() // NA
    expect(screen.getByText(/^0 of 32 answered$/)).toBeTruthy() // IPS, untouched
  })

  it('ignores stored ids the bank no longer holds', () => {
    seed('NF', [NF[0].id, 'retired-question-id'])
    renderPractice()
    expect(screen.getByText(/^1 of 33 answered$/)).toBeTruthy()
  })

  it('needs two presses to erase, and erases the key outright', () => {
    seed('NF', [NF[0].id, NF[1].id])
    renderPractice()

    // First press arms it and changes nothing.
    fireEvent.click(screen.getByRole('button', { name: /reset practice progress/i }))
    expect(JSON.parse(localStorage.getItem(PROGRESS_KEY)).answers[NF[0].id]).toBeTruthy()
    expect(screen.getByText(/^2 of 33 answered$/)).toBeTruthy()

    // Second press clears.
    fireEvent.click(screen.getByRole('button', { name: /click again to erase/i }))
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(screen.getByText(/^0 of 33 answered$/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /erase|reset/i })).toBeNull()
  })
})

/**
 * The "most missed" panel.
 *
 * Every fixture here is chosen to fail against the specific wrong implementation
 * the panel is guarding against, because the obvious versions all look right:
 *
 *  - denominator. The tempting fixture — a 2-question objective answered twice —
 *    makes attempted equal bank size, so a bank-denominator implementation emits
 *    a byte-identical row and the test passes for the wrong reason. `1.6` has six
 *    questions in the bank; attempting two of them is the shape that separates
 *    the two.
 *  - ordering. Raw miss counts rank every single-question objective last, and the
 *    bank has 18 of them. `6.2` has exactly one question, so a reader who missed
 *    it should outrank one who missed four of `5.6`'s eight.
 */
describe('PracticeHome most-missed panel', () => {
  const NF = byDomain('NF')
  const NA = byDomain('NA')
  const IPS = byDomain('IPS')
  const SEC = byDomain('SEC')
  const AUTO = byDomain('AUTO')

  const byObjective = (list, oid) => list.filter((q) => q.objectiveId === oid)

  function seed(answers, domain = 'NF') {
    localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify({ v: 1, domain, index: 0, answers })
    )
  }

  const miss = (id) => [id, { chosen: ['A'], correct: false }]
  const right = (id) => [id, { chosen: ['A'], correct: true }]

  beforeEach(() => {
    localStorage.clear()
    clearProgress()
  })
  afterEach(() => cleanup())

  it('says so plainly when nothing has been missed', () => {
    seed(Object.fromEntries([right(NF[0].id)]))
    renderPractice()
    expect(screen.getByText(/Answer a question and this fills in/)).toBeTruthy()
    expect(screen.getByText(/missed — 0 of the 63 this bank covers/)).toBeTruthy()
  })

  it('measures attempts, not the size of the bank', () => {
    const q16 = byObjective(NF, '1.6')
    expect(q16.length).toBeGreaterThanOrEqual(2)
    // Two attempted, both wrong. The bank holds more, so the row must say 2.
    seed(Object.fromEntries([miss(q16[0].id), miss(q16[1].id)]))
    renderPractice()
    expect(screen.getByText(/1\.6 - missed 2 of 2 answered/)).toBeTruthy()
    expect(screen.queryByText(/1\.6 - missed 2 of 6 answered/)).toBeNull()
  })

  it('counts a right answer in the denominator', () => {
    const q16 = byObjective(NF, '1.6')
    seed(Object.fromEntries([miss(q16[0].id), right(q16[1].id), right(q16[2].id)]))
    renderPractice()
    expect(screen.getByText(/1\.6 - missed 1 of 3 answered/)).toBeTruthy()
  })

  it('ranks a missed single-question objective above a partial rate', () => {
    const single = byObjective(AUTO, '6.2')
    expect(single).toHaveLength(1)
    const q56 = byObjective(SEC, '5.6')
    expect(q56.length).toBeGreaterThanOrEqual(4)

    const answers = Object.fromEntries([
      ...q56.slice(0, 4).map((q) => miss(q.id)),
      miss(single[0].id),
    ])
    seed(answers)
    renderPractice()

    const rows = screen.getAllByText(/ - missed \d+ of \d+ answered/)
    const oneOfOne = rows.findIndex((n) => /6\.2 - missed 1 of 1 answered/.test(n.textContent))
    const fourOfEight = rows.findIndex((n) => /5\.6 - missed 4 of \d+ answered/.test(n.textContent))
    expect(oneOfOne).toBeGreaterThanOrEqual(0)
    expect(fourOfEight).toBeGreaterThanOrEqual(0)
    expect(oneOfOne).toBeLessThan(fourOfEight)
  })

  it('caps the list and counts what it hid', () => {
    // Seven distinct objectives, all missed, so the cap must engage.
    const picked = []
    for (const list of [NF, NA, IPS, SEC, AUTO]) {
      for (const q of list) {
        if (!picked.some((p) => p.objectiveId === q.objectiveId)) picked.push(q)
        if (picked.length === 7) break
      }
      if (picked.length === 7) break
    }
    expect(new Set(picked.map((q) => q.objectiveId)).size).toBe(7)

    seed(Object.fromEntries(picked.map((q) => miss(q.id))))
    renderPractice()

    const rows = screen.getAllByText(/ - missed \d+ of \d+ answered/)
    expect(rows).toHaveLength(5)
    expect(screen.getByText(/^\+2 more$/)).toBeTruthy()
    expect(screen.getByText(/missed — 7 of the 63/)).toBeTruthy()
  })

  it('shows no "+0 more" when five or fewer are missed', () => {
    seed(Object.fromEntries([miss(NF[0].id), miss(NF[1].id)]))
    renderPractice()
    expect(screen.queryByText(/^\+0 more$/)).toBeNull()
  })

  it('drops the panel after a reset', () => {
    const q16 = byObjective(NF, '1.6')
    seed(Object.fromEntries([miss(q16[0].id)]))
    renderPractice()
    expect(screen.getByText(/1\.6 - missed 1 of 1 answered/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /reset practice progress/i }))
    fireEvent.click(screen.getByRole('button', { name: /click again to erase/i }))

    expect(screen.getByText(/Answer a question and this fills in/)).toBeTruthy()
    expect(screen.queryByText(/ - missed \d+ of \d+ answered/)).toBeNull()
  })

  it('ignores stored ids the bank no longer holds', () => {
    seed(Object.fromEntries([miss('retired-question-id')]))
    renderPractice()
    expect(screen.getByText(/missed — 0 of the 63/)).toBeTruthy()
  })
})
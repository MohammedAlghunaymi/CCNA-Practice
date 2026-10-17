import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import Home from '../src/features/home/pages/Home.jsx'

/**
 * The landing page, and the false number it used to print.
 *
 * `Home.jsx` rendered the frozen v1 allocation *target* under the words
 * "in bank": NF 61, NA 58, IPC 71, IPS 31, SEC 50, AUTO 29 = 300, against a bank
 * of 169. The two disagree in both directions — IPS is allocated 31 and holds 32.
 *
 * The suffixes below are load-bearing, and one of these assertions is absent on
 * purpose. IPS's target is 31; IPC's live count is also 31. So `31 in bank` is a
 * string that legitimately renders, and NO assertion of the form "the target's
 * string is absent" can ever be satisfiable for that pair. Five absence guards
 * are listed because the sixth cannot exist. That asymmetry is the reason the two
 * columns carry different suffixes at all: share one suffix and the assertion is
 * arithmetically unsatisfiable.
 */
const LIVE = ['12', '24', '31', '32', '33', '37']
const TARGETS = ['61', '58', '71', '31', '50', '29']

// `31` is live for IPC and a target for IPS, so it collides in BOTH directions:
// `31 in bank` legitimately renders, and so does `31 target`. Every assertion
// of the form "<the other column's string> is absent" is therefore unsatisfiable
// for that one pair, and is excluded below. Share a single suffix across both
// columns and the whole file becomes arithmetically impossible.
const COLLIDES = '31'
const LIVE_UNIQUE = LIVE.filter((n) => n !== COLLIDES)
const TARGETS_UNIQUE = TARGETS.filter((n) => n !== COLLIDES)

function renderHome() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Home', () => {
  it('shows every live count, labelled as a count', () => {
    renderHome()
    for (const n of LIVE) expect(screen.getByText(new RegExp(`^${n} in bank$`))).toBeTruthy()
  })

  it('shows every allocation target, labelled as a target', () => {
    renderHome()
    for (const n of TARGETS) expect(screen.getByText(new RegExp(`^${n} target$`))).toBeTruthy()
  })

  it('never labels an allocation target as a count', () => {
    renderHome()
    for (const n of TARGETS_UNIQUE) {
      expect(screen.queryByText(new RegExp(`^${n} in bank$`))).toBeNull()
    }
  })

  it('never labels a live count as a target', () => {
    renderHome()
    for (const n of LIVE_UNIQUE) {
      expect(screen.queryByText(new RegExp(`^${n} target$`))).toBeNull()
    }
  })

  it('does not claim the bank holds the full target', () => {
    renderHome()
    expect(screen.queryByText('v1 bank target')).toBeNull()
    expect(screen.getByText(/^v1 target$/)).toBeTruthy()
  })

  it('states the real bank size beside the target, not instead of it', () => {
    renderHome()
    // 300 appears twice, from two independent sources: `milestones.v1.target`
    // and the sum of `allocation.byMilestone.v1.perDomain`. Both are targets.
    expect(screen.getAllByText('300')).toHaveLength(2)
    // 169 is the bank, and it is the only figure on the page that is neither
    // of those two.
    expect(screen.getByText('169')).toBeTruthy()
  })

  it('offers a way into practice', () => {
    renderHome()
    const link = screen.getByRole('link', { name: /practice by domain/i })
    expect(link.getAttribute('href')).toBe('/practice')
  })

  it('keeps the exam door', () => {
    renderHome()
    const link = screen.getByRole('link', { name: /start a practice exam/i })
    expect(link.getAttribute('href')).toBe('/exam')
  })
})
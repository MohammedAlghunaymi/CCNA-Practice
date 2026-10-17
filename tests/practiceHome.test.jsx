import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import PracticeHome from '../src/features/practice/pages/PracticeHome.jsx'
import objectives from '../src/data/objectives.json' with { type: 'json' }

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
})
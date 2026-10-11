import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import Exam from '../src/pages/Exam.jsx'
import { selectQuestions } from '../src/lib/selectQuestions.js'
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
  cleanup()
})

describe('Exam page', () => {
  it('draws a 20-question paper', () => {
    renderExam()
    expect(screen.getByRole('heading', { name: /practice exam/i })).toBeInTheDocument()
    expect(screen.getByText(/20 questions · question 1 of 20/)).toBeInTheDocument()
  })

  it('counts answers and advances one question at a time', async () => {
    const user = userEvent.setup()
    renderExam()

    expect(screen.getByText(/0 answered/)).toBeInTheDocument()
    await user.click(document.querySelector('input'))
    expect(screen.getByText(/1 answered/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/question 2 of 20/)).toBeInTheDocument()

    cleanup()
    renderExam()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
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
    const paper = selectQuestions(BANK, 20, SEED)
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
    expect(within(section).getAllByText(/correct answer:/i)).toHaveLength(20)
  }, 30000)

  it('distinguishes an unanswered item from a wrong one', async () => {
    const user = userEvent.setup()
    const paper = selectQuestions(BANK, 20, SEED)
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
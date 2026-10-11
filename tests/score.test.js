import { describe, it, expect } from 'vitest'
import { scoreExam, isCorrectSet } from '../src/lib/score.js'

/** Minimal single-answer item. */
function single(id, domain, answer = ['A'], explanation = 'because A is right') {
  return { id, domain, type: 'mcq-single', answer, explanation }
}

/** Minimal multi-answer item: two correct, three wrong (mirrors the real bank). */
function multi(id, domain, answer = ['A', 'C']) {
  return {
    id,
    domain,
    type: 'mcq-multi',
    answer,
    options: { A: { correct: true }, B: { correct: false }, C: { correct: true } },
    explanation: 'both A and C are required',
  }
}

const PAPER = [
  single('s1', 'NF'),
  single('s2', 'NA'),
  single('s3', 'IPC'),
  single('s4', 'IPS'),
  multi('m1', 'SEC'),
  multi('m2', 'AUTO'),
  multi('m3', 'NF'),
  multi('m4', 'IPC'),
]

describe('isCorrectSet', () => {
  it('ignores selection order', () => {
    expect(isCorrectSet(['C', 'A'], ['A', 'C'])).toBe(true)
  })

  it('rejects a strict subset, since there is no partial credit', () => {
    expect(isCorrectSet(['A'], ['A', 'C'])).toBe(false)
  })

  it('rejects a superset', () => {
    expect(isCorrectSet(['A', 'B', 'C'], ['A', 'C'])).toBe(false)
  })

  it('rejects a non-array', () => {
    expect(isCorrectSet(undefined, ['A'])).toBe(false)
  })
})

describe('scoreExam — all correct', () => {
  const result = scoreExam({
    questions: PAPER,
    answers: {
      s1: ['A'],
      s2: ['A'],
      s3: ['A'],
      s4: ['A'],
      m1: ['C', 'A'],
      m2: ['A', 'C'],
      m3: ['A', 'C'],
      m4: ['C', 'A'],
    },
  })

  it('tallies every item correct', () => {
    expect(result.correct).toBe(8)
    expect(result.total).toBe(8)
  })

  it('reports no misses', () => {
    expect(result.wrongIds).toEqual([])
    expect(result.unansweredIds).toEqual([])
    expect(result.unsubmittedCount).toBe(0)
    expect(result.explanations).toEqual({})
  })

  it('breaks the tally down per domain', () => {
    expect(result.perDomain).toEqual({
      NF: { correct: 2, total: 2 },
      NA: { correct: 1, total: 1 },
      IPC: { correct: 2, total: 2 },
      IPS: { correct: 1, total: 1 },
      SEC: { correct: 1, total: 1 },
      AUTO: { correct: 1, total: 1 },
    })
  })
})

describe('scoreExam — all wrong', () => {
  const result = scoreExam({
    questions: PAPER,
    answers: {
      s1: ['B'],
      s2: ['B'],
      s3: ['B'],
      s4: ['B'],
      m1: ['A'],
      m2: ['A'],
      m3: ['A'],
      m4: ['A'],
    },
  })

  it('tallies nothing correct', () => {
    expect(result.correct).toBe(0)
    expect(result.wrongIds).toEqual(['s1', 's2', 's3', 's4', 'm1', 'm2', 'm3', 'm4'])
    expect(result.unansweredIds).toEqual([])
  })

  it('gives a wrong-but-answered item an explanation', () => {
    expect(Object.keys(result.explanations)).toHaveLength(8)
    expect(result.explanations.s1).toBe('because A is right')
  })
})

describe('scoreExam — unanswered items', () => {
  it('treats a missing id as unanswered and scores it incorrect', () => {
    const result = scoreExam({ questions: PAPER, answers: { s1: ['A'] } })
    expect(result.unsubmittedCount).toBe(7)
    expect(result.unansweredIds).toHaveLength(7)
    expect(result.unansweredIds).not.toContain('s1')
    expect(result.correct).toBe(1)
  })

  it('treats an empty array as unanswered', () => {
    const result = scoreExam({ questions: [single('s1', 'NF')], answers: { s1: [] } })
    expect(result.unansweredIds).toEqual(['s1'])
    expect(result.unsubmittedCount).toBe(1)
    expect(result.correct).toBe(0)
  })

  it('keeps unanswered and wrong-but-answered distinguishable', () => {
    const result = scoreExam({
      questions: [single('s1', 'NF'), single('s2', 'NF')],
      answers: { s1: ['B'], s2: [] },
    })
    expect(result.wrongIds).toEqual(['s1'])
    expect(result.unansweredIds).toEqual(['s2'])
  })
})

describe('scoreExam — explanations scope', () => {
  it('covers exactly the wrong and unanswered ids, never the whole paper', () => {
    const result = scoreExam({
      questions: PAPER,
      answers: { s1: ['A'], s2: ['B'], m1: ['A'], m2: ['C', 'A'] },
    })
    const expected = ['s2', 's3', 's4', 'm1', 'm3', 'm4']
    expect(Object.keys(result.explanations).sort()).toEqual([...expected].sort())
    expect(result.explanations.s1).toBeUndefined()
  })
})

describe('scoreExam — invariant', () => {
  it('never counts an item twice or drops one', () => {
    const answerSets = [
      {},
      { s1: ['A'] },
      Object.fromEntries(PAPER.map((q) => [q.id, q.answer])),
      Object.fromEntries(PAPER.map((q) => [q.id, ['B']])),
    ]
    for (const answers of answerSets) {
      const r = scoreExam({ questions: PAPER, answers })
      expect(r.correct + r.wrongIds.length + r.unansweredIds.length).toBe(r.total)
      expect(r.unsubmittedCount).toBe(r.unansweredIds.length)
      expect(Object.keys(r.explanations)).toHaveLength(
        r.wrongIds.length + r.unansweredIds.length
      )
    }
  })

  it('scores an empty paper as zero of zero', () => {
    const r = scoreExam({ questions: [], answers: {} })
    expect(r).toMatchObject({ correct: 0, total: 0, unsubmittedCount: 0 })
  })
})
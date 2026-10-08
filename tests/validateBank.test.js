import { describe, it, expect } from 'vitest'
import { validateBank } from '../src/lib/validateBank.js'
import { indexObjectives } from '../src/lib/questionSchema.js'
import objectivesRaw from '../src/data/objectives.json' with { type: 'json' }
import config from '../src/config/bank.config.json' with { type: 'json' }

const objectives = indexObjectives(objectivesRaw)

function question(id, objectiveId, domain, overrides = {}) {
  return {
    id,
    objectiveId,
    domain,
    type: 'mcq-single',
    preamble: null,
    prompt: `Question ${id}`,
    options: {
      A: { text: 'correct', correct: true },
      B: { text: 'wrong', rationale: 'Because it is not the correct answer.' },
    },
    answer: ['A'],
    explanation: 'An explanation.',
    difficulty: 'medium',
    batch: 'b001',
    ...overrides,
  }
}

function run(questions, milestone = 'pilot', checkTotal = false) {
  return validateBank({ questions, objectives, config, milestone, checkTotal })
}

function named(results, fragment) {
  return results.find((r) => r.name.includes(fragment))
}

describe('validateBank: empty bank', () => {
  it('passes on an empty bank so Phase 0 can go green before authoring', () => {
    const { results } = run([])
    expect(results.every((r) => r.pass)).toBe(true)
    expect(named(results, 'sub-objective has at least').detail).toMatch(/bank is empty/)
  })
})

describe('validateBank: coverage floor activates on the first question', () => {
  it('fails once a single question exists and 29 in-scope objectives are empty', () => {
    const { results, stats } = run([question('NF-0001', '1.1.a', 'NF')])
    const coverage = named(results, 'sub-objective has at least')
    expect(coverage.pass).toBe(false)
    expect(coverage.detail).toMatch(/29\/30 below floor/)
    expect(stats.total).toBe(1)
  })
})

describe('validateBank: duplicates', () => {
  it('catches duplicate ids', () => {
    const q = question('NF-0001', '1.1.a', 'NF')
    const { results } = run([q, { ...q }])
    expect(named(results, 'duplicate question IDs').pass).toBe(false)
  })

  it('catches duplicate prompts regardless of casing or padding', () => {
    const a = question('NF-0001', '1.1.a', 'NF', { prompt: 'Same stem' })
    const b = question('NF-0002', '1.1.b', 'NF', { prompt: '  same STEM  ' })
    const { results } = run([a, b])
    expect(named(results, 'duplicate question prompts').pass).toBe(false)
  })
})

describe('validateBank: computational assertions', () => {
  it('passes a subnet question whose assert matches the maths', () => {
    const q = question('NF-0003', '1.6', 'NF', {
      verify: { kind: 'subnet', cidr: '10.0.0.0/24', assert: { usable: 254, prefix: 24 } },
    })
    expect(named(run([q]).results, 'agrees with real arithmetic').pass).toBe(true)
  })

  it('fails a subnet question whose assert contradicts the maths', () => {
    const q = question('NF-0004', '1.6', 'NF', {
      verify: { kind: 'subnet', cidr: '10.0.0.0/24', assert: { usable: 126, prefix: 24 } },
    })
    expect(named(run([q]).results, 'agrees with real arithmetic').pass).toBe(false)
  })
})

describe('validateBank: allocation drift', () => {
  it('reports drift as informational while the milestone is young', () => {
    // 8 of 60 questions, all NF, is 100% NF when NF's share should be 23%.
    // Authoring goes domain by domain, so this is reported, not failed.
    const questions = []
    for (let i = 0; i < 8; i++) questions.push(question(`NF-00${i}`, '1.1.a', 'NF'))
    const drift = named(run(questions).results, 'allocation drift')
    expect(drift.pass).toBe(true)
    expect(drift.detail).toMatch(/informational only until 25%/)
  })

  it('enforces drift once the milestone is a quarter done', () => {
    // 30 of 60 is halfway. A bank that is 100% NF is far off its 23% share,
    // and by now the deviation is real rather than an artefact of batching.
    const questions = []
    for (let i = 0; i < 30; i++) questions.push(question(`NF-1${i}`, '1.1.a', 'NF'))
    const drift = named(run(questions).results, 'allocation drift')
    expect(drift.pass).toBe(false)
    expect(drift.detail).toMatch(/drift/)
    expect(drift.detail).not.toMatch(/informational/)
  })
})

describe('validateBank: format matrix', () => {
  it('reports when a domain cannot fill its format cells', () => {
    // 14 questions all in NF, all mcq-single: the NF drag-drop cell needs 3.
    const questions = []
    for (let i = 0; i < 14; i++) questions.push(question(`NF-2${i}`, '1.1.a', 'NF'))
    expect(named(run(questions).results, 'fill the exam matrix').pass).toBe(false)
  })
})

describe('validateBank: total, at milestone close only', () => {
  it('is not checked mid-milestone', () => {
    const results = run([question('NF-0001', '1.1.a', 'NF')], 'pilot', false).results
    expect(named(results, 'Total equals')).toBeUndefined()
  })

  it('is checked when the milestone closes', () => {
    const results = run([question('NF-0001', '1.1.a', 'NF')], 'pilot', true).results
    const total = named(results, 'Total equals')
    expect(total).toBeDefined()
    expect(total.pass).toBe(false)
    expect(total.detail).toMatch(/1 vs target 60/)
  })
})

describe('validateBank: unknown milestone', () => {
  it('throws rather than silently passing', () => {
    expect(() => run([], 'nonsense')).toThrow(/unknown milestone/)
  })
})
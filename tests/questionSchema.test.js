import { describe, it, expect } from 'vitest'
import {
  validateQuestionShape,
  validateObjectiveMapping,
  indexObjectives,
} from '../src/lib/questionSchema.js'
import objectivesRaw from '../src/data/objectives.json' with { type: 'json' }

const objectives = indexObjectives(objectivesRaw)

function baseQuestion(overrides = {}) {
  return {
    id: 'NF-0001',
    objectiveId: '1.6',
    domain: 'NF',
    type: 'mcq-single',
    preamble: null,
    prompt: 'Which prefix provides at least 200 usable host addresses?',
    options: {
      A: { text: '10.0.0.0/24', correct: true },
      B: { text: '10.0.0.0/25', rationale: 'Halves the block to 126 usable addresses.' },
      C: { text: '10.0.1.0/24', rationale: 'Wrong subnet; the second octet is incremented.' },
      D: { text: '10.0.0.128/25', rationale: 'Correctly aligned but only 126 usable addresses.' },
    },
    answer: ['A'],
    explanation: 'A /24 yields 254 usable addresses.',
    difficulty: 'medium',
    batch: 'b001',
    ...overrides,
  }
}

describe('indexObjectives', () => {
  it('indexes all 97 sub-objectives', () => {
    const leaves = Object.values(objectives.leafIdsByDomain).flat()
    expect(leaves).toHaveLength(97)
    expect(leaves).toContain('3.4.d')
    expect(leaves).not.toContain('3.1')
  })

  it('records the domain for every objective, leaf or not', () => {
    expect(objectives.domainById['1.1']).toBe('NF')
    expect(objectives.domainById['1.1.a']).toBe('NF')
    expect(objectives.leavesByDomain.SEC).toBe(10)
  })
})

describe('validateQuestionShape: mcq', () => {
  it('accepts a well-formed single-answer question', () => {
    expect(validateQuestionShape(baseQuestion())).toEqual([])
  })

  it('requires a rationale on every wrong option', () => {
    const q = baseQuestion()
    delete q.options.B.rationale
    expect(validateQuestionShape(q).join(' ')).toMatch(/option B is wrong but has no rationale/)
  })

  it('rejects a rationale on a correct option', () => {
    const q = baseQuestion()
    q.options.A.rationale = 'because'
    expect(validateQuestionShape(q).join(' ')).toMatch(/correct option must not carry a rationale/)
  })

  it('requires the answer array to match the correct flags', () => {
    // The exact class of bug found in the reference project: a question whose
    // key disagrees with its own options.
    const q = baseQuestion({ answer: ['B'] })
    expect(validateQuestionShape(q).join(' ')).toMatch(/answer \[B\] does not match/)
  })

  it('rejects mcq-single with more than one correct answer', () => {
    const q = baseQuestion()
    q.options.B.correct = true
    delete q.options.B.rationale
    q.answer = ['A', 'B']
    expect(validateQuestionShape(q).join(' ')).toMatch(/mcq-single must have exactly one/)
  })

  it('requires an explanation on every question', () => {
    const q = baseQuestion()
    delete q.explanation
    expect(validateQuestionShape(q).join(' ')).toMatch(/explanation is required/)
  })

  it('rejects an unknown type', () => {
    expect(validateQuestionShape(baseQuestion({ type: 'essay' })).join(' ')).toMatch(/type must be one of/)
  })

  it('accepts a valid multiple-response question', () => {
    const q = baseQuestion({
      type: 'mcq-multi',
      objectiveId: '2.2',
      domain: 'NA',
      options: {
        A: { text: 'Trunk ports carry multiple VLANs', correct: true },
        B: { text: '802.1Q tags frames', correct: true },
        C: { text: 'Native VLAN crosses untagged', correct: true },
        D: { text: 'Access ports carry many VLANs', rationale: 'An access port carries exactly one VLAN.' },
      },
      answer: ['A', 'B', 'C'],
    })
    expect(validateQuestionShape(q)).toEqual([])
  })
})

describe('validateQuestionShape: drag-drop', () => {
  it('accepts repeated text on either side, because slots are positional', () => {
    const q = baseQuestion({
      type: 'drag-drop',
      objectiveId: '2.5',
      domain: 'NA',
      pairs: [
        { left: 'STP', right: 'prevents loops' },
        { left: 'STP', right: 'redundant topology' },
        { left: 'BPDU guard', right: 'prevents loops' },
      ],
    })
    delete q.options
    delete q.answer
    expect(validateQuestionShape(q)).toEqual([])
  })

  it('rejects a duplicated pairing', () => {
    const q = baseQuestion({
      type: 'drag-drop',
      objectiveId: '2.5',
      domain: 'NA',
      pairs: [
        { left: 'STP', right: 'prevents loops' },
        { left: 'STP', right: 'prevents loops' },
      ],
    })
    delete q.options
    delete q.answer
    expect(validateQuestionShape(q).join(' ')).toMatch(/duplicates an earlier pairing/)
  })

  it('requires a non-empty pairs array', () => {
    const q = baseQuestion({ type: 'drag-drop', objectiveId: '2.5', domain: 'NA', pairs: [] })
    delete q.options
    delete q.answer
    expect(validateQuestionShape(q).join(' ')).toMatch(/non-empty pairs array/)
  })

  // Every other drag-drop test above deletes `answer`, because nothing validated
  // it: validateAnswerAndOptions returns at the drag-drop branch before it ever
  // looks there. These four are the ones that now have an owner.
  it('accepts a key whose token matches its own slot', () => {
    const q = baseQuestion({
      type: 'drag-drop',
      objectiveId: '2.5',
      domain: 'NA',
      pairs: [
        { left: 'STP', right: 'prevents loops' },
        { left: 'BPDU guard', right: 'redundant topology' },
      ],
      answer: ['prevents loops', 'redundant topology'],
    })
    delete q.options
    expect(validateQuestionShape(q)).toEqual([])
  })

  it('rejects a key naming a token that is not in its own slot', () => {
    const q = baseQuestion({
      type: 'drag-drop',
      objectiveId: '2.5',
      domain: 'NA',
      pairs: [
        { left: 'STP', right: 'prevents loops' },
        { left: 'BPDU guard', right: 'redundant topology' },
      ],
      // 'redundant topology' is declared, but in slot 1, not slot 0. A
      // membership check would pass this; a positional one must not.
      answer: ['redundant topology', 'prevents loops'],
    })
    delete q.options
    expect(validateQuestionShape(q).join(' ')).toMatch(/answer\[0\] is "redundant topology" but slot 0 holds "prevents loops"/)
  })

  it('rejects a key longer than the slots it claims to fill', () => {
    const q = baseQuestion({
      type: 'drag-drop',
      objectiveId: '2.5',
      domain: 'NA',
      pairs: [{ left: 'STP', right: 'prevents loops' }],
      answer: ['prevents loops', 'invents a second slot'],
    })
    delete q.options
    expect(validateQuestionShape(q).join(' ')).toMatch(/only 1 slot/)
  })

  it('allows a short key, which means those slots were never filled', () => {
    const q = baseQuestion({
      type: 'drag-drop',
      objectiveId: '2.5',
      domain: 'NA',
      pairs: [
        { left: 'STP', right: 'prevents loops' },
        { left: 'BPDU guard', right: 'redundant topology' },
      ],
      answer: ['prevents loops'],
    })
    delete q.options
    expect(validateQuestionShape(q)).toEqual([])
  })
})

describe('validateQuestionShape: hands-on', () => {
  const handsOn = {
    id: 'IPC-0001',
    objectiveId: '3.3.a',
    domain: 'IPC',
    type: 'hands-on',
    preamble: null,
    prompt: 'Configure a default route.',
    explanation: 'A default route matches unmatched traffic.',
    difficulty: 'easy',
    batch: 'b001',
    expectedState: {
      all: [
        { path: 'ipv4.static.defaults', op: 'contains', value: '0.0.0.0 0.0.0.0' },
      ],
    },
  }

  it('accepts a hands-on task with a declarative expectedState', () => {
    expect(validateQuestionShape(handsOn)).toEqual([])
  })

  it('rejects a hands-on task with no expectedState', () => {
    const q = { ...handsOn }
    delete q.expectedState
    expect(validateQuestionShape(q).join(' ')).toMatch(/requires an expectedState predicate/)
  })

  it('rejects an unknown predicate op', () => {
    const q = { ...handsOn, expectedState: { all: [{ path: 'x', op: 'vibes', value: 1 }] } }
    expect(validateQuestionShape(q).join(' ')).toMatch(/op must be one of/)
  })

  it('requires a value for ops that need one', () => {
    const q = { ...handsOn, expectedState: { all: [{ path: 'x', op: 'equals' }] } }
    expect(validateQuestionShape(q).join(' ')).toMatch(/requires a value/)
  })

  it('does not require a value for existence ops', () => {
    const q = { ...handsOn, expectedState: { all: [{ path: 'x', op: 'exists' }] } }
    expect(validateQuestionShape(q)).toEqual([])
  })

  it('rejects a function in expectedState, since it must be serialisable', () => {
    const q = { ...handsOn, expectedState: { all: () => true } }
    expect(validateQuestionShape(q).join(' ')).toMatch(/must be a non-empty array/)
  })
})

describe('validateObjectiveMapping', () => {
  it('accepts a correct mapping', () => {
    expect(validateObjectiveMapping(baseQuestion(), objectives)).toEqual([])
  })

  it('rejects an objective id absent from objectives.json', () => {
    expect(validateObjectiveMapping(baseQuestion({ objectiveId: '9.9.z' }), objectives).join(' '))
      .toMatch(/is not in objectives.json/)
  })

  it('rejects a domain that disagrees with the objective', () => {
    expect(validateObjectiveMapping(baseQuestion({ domain: 'SEC' }), objectives).join(' '))
      .toMatch(/belongs to domain NF, but the question declares SEC/)
  })
})
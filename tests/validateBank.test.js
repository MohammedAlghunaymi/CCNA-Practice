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
  it('passes on an empty bank so the toolchain can go green before authoring', () => {
    const { results } = run([])
    // Every gate except the milestone-close total, which needs a closed batch.
    const failures = results.filter((r) => !r.pass)
    expect(failures.map((r) => r.name)).toEqual([])
    expect(named(results, 'in-scope sub-objective has').detail).toMatch(/bank is empty/)
  })
})

describe('validateBank: coverage floor activates on the first question', () => {
  it('fails once a single question exists and 29 in-scope objectives are empty', () => {
    const { results, stats } = run([question('NF-0001', '1.1.a', 'NF')])
    const coverage = named(results, 'in-scope sub-objective has')
    expect(coverage.pass).toBe(false)
    // The pilot subset is 32 objectives; one question covers one of them.
    expect(coverage.detail).toMatch(/31\/32 below floor/)
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

describe('validateBank: supply covers exam draw (check 10)', () => {
  it('passes for every milestone in the shipped config', () => {
    // The invariant the original pilot config violated: a 60-question exam
    // drawing 15 from IP Connectivity cannot be filled from 14 questions.
    for (const milestone of Object.keys(config.milestones)) {
      const check = named(run([], milestone).results, 'supply covers')
      expect(check, milestone).toBeDefined()
      expect(check.pass, `${milestone}: ${check.detail}`).toBe(true)
    }
  })

  it('fails when a milestone cannot supply one of its draw quotas', () => {
    const broken = structuredClone(config)
    broken.allocation.byMilestone.pilot.perDomain.IPC = 10
    const check = named(
      validateBank({ questions: [], objectives, config: broken, milestone: 'pilot' }).results,
      'supply covers'
    )
    expect(check.pass).toBe(false)
    expect(check.detail).toMatch(/IPC/)
    expect(check.detail).toMatch(/needs 15/)
  })

  it('reads the exam length from the milestone, not the global default', () => {
    // A 60-question pilot draws a reduced-length quota; at 100 it would demand
    // 25 from IPC, which a 60-question bank cannot supply.
    const check = named(run([], 'pilot').results, 'supply covers')
    expect(check.detail).toMatch(/60/)
  })
})

describe('validateBank: show-output floors (check 11)', () => {
  it('reports the floor per CLI domain at milestone close', () => {
    const check = named(run([], 'pilot', true).results, 'show-output')
    expect(check).toBeDefined()
    expect(check.pass).toBe(false)
    expect(check.detail).toMatch(/NF/)
    expect(check.detail).toMatch(/IPS/)
  })

  it('does not enforce the floor mid-milestone', () => {
    const check = named(run([], 'pilot', false).results, 'show-output')
    expect(check.pass).toBe(true)
    expect(check.detail).toMatch(/milestone close/)
  })

  it('passes at close when every CLI domain carries its minimum', () => {
    const questions = []
    const bases = { NF: '1.6', NA: '2.3', IPC: '3.3.a', IPS: '4.1', SEC: '5.3' }
    let n = 0
    for (const [domain, objectiveId] of Object.entries(bases)) {
      for (let i = 0; i < 2; i++) {
        questions.push(
          question(`${domain}-S${n}`, objectiveId, domain, {
            preamble: 'show-output',
            prompt: `show-output item ${n}`,
            // Both schema clauses fire on a non-null `preamble`: the payload is
            // required, and so is `sources`. Twelve fixtures in this block, so a
            // partial edit shows up as check 3 going red rather than passing.
            preambleText: `Router#show ip route brief\nitem ${n}`,
            // `published`, not `illustrative`: these prompts carry no marker and
            // are not about disclosure. `illustrative` would pull all twelve
            // into check 12 and fail them for an unrelated reason.
            sources: [{ kind: 'published' }],
          })
        )
        n++
      }
    }
    for (let i = 0; i < 2; i++) {
      questions.push(question(`AUTO-J${i}`, '6.7', 'AUTO', {
        preamble: 'show-json',
        prompt: `show-json item ${i}`,
        preambleText: `{"item": ${i}}`,
        sources: [{ kind: 'published' }],
      }))
    }
    const results = run(questions, 'pilot', false).results
    // Check 3 is not selected by any other assertion in this file, so without
    // this the suite is blind to the schema clauses above.
    expect(named(results, 'satisfies the schema').pass).toBe(true)
    expect(named(results, 'show-output').pass).toBe(true)
  })

  it('requires an [illustrative] marker on any item sourced as illustrative', () => {
    // Disclosed sourcing is the point: an item whose output block was authored
    // rather than captured must say so in the stem the student reads.
    const marked = (id) => ({
      ...question(id, '1.6', 'NF', {
        preamble: 'show-output',
        prompt: `Router#show ip route [illustrative]\n${id}`,
        // Marked too, not just the stem: check 12 requires the marker in both
        // the stem and the payload, and a payload carrying none is exactly the
        // gap the second location was added to close.
        preambleText: `Router#show ip route [illustrative]\n${id}`,
      }),
      sources: [{ kind: 'illustrative' }],
    })

    const bothMarked = run([marked('Z1'), marked('Z2')], 'pilot', false).results
    expect(named(bothMarked, 'illustrative').pass).toBe(true)
    expect(named(bothMarked, 'satisfies the schema').pass).toBe(true)

    const oneUnmarked = run(
      [
        marked('Z3'),
        {
          ...question('Z4', '1.6', 'NF', {
            preamble: 'show-output',
            prompt: 'Router#show ip route with no marker',
            // Present but unmarked: this is the case that only the payload
            // location can see. Without it Z4 is caught by the stem check alone
            // and the second location is never exercised.
            preambleText: 'Router#show ip route with no marker',
          }),
          sources: [{ kind: 'illustrative' }],
        },
      ],
      'pilot',
      false
    ).results
    expect(named(oneUnmarked, 'illustrative').pass).toBe(false)
    expect(named(oneUnmarked, 'illustrative').detail).toMatch(/Z4/)
    // Proves the failure came from the payload location, not the stem one.
    expect(named(oneUnmarked, 'illustrative').detail).toMatch(/preambleText: 1/)
  })
})

describe('validateBank: declared topic counts (check 12)', () => {
  it('passes against the shipped objectives file', () => {
    const check = named(run([]).results, 'Declared leaf counts')
    expect(check.pass).toBe(true)
    expect(check.detail).toMatch(/97/)
  })

  it('fails when a declared leafCount drifts from the counted topics', () => {
    const broken = structuredClone(objectivesRaw)
    broken.domains[0].leafCount += 1
    const check = named(
      validateBank({
        questions: [],
        objectives: indexObjectives(broken),
        config,
        milestone: 'pilot',
      }).results,
      'Declared leaf counts'
    )
    expect(check.pass).toBe(false)
    expect(check.detail).toMatch(/NF/)
  })

  it('counts lettered sub-objectives and unlettered leaves, excluding non-leaf parents', () => {
    // 97 leaves, 14 non-leaf parents, 111 nodes total.
    let leaves = 0
    let parents = 0
    for (const domain of objectivesRaw.domains) {
      for (const objective of domain.objectives) {
        if (objective.isLeaf) leaves++
        else parents++
      }
    }
    expect(leaves).toBe(97)
    expect(parents).toBe(14)
    expect(leaves + parents).toBe(111)
  })
})
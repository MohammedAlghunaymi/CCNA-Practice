import { describe, it, expect } from 'vitest'
import nf from '../src/data/questions/nf.json' with { type: 'json' }
import na from '../src/data/questions/na.json' with { type: 'json' }
import ipc from '../src/data/questions/ipc.json' with { type: 'json' }
import ips from '../src/data/questions/ips.json' with { type: 'json' }
import sec from '../src/data/questions/sec.json' with { type: 'json' }
import auto from '../src/data/questions/auto.json' with { type: 'json' }

/**
 * Stage 1 guard: every merged question must be traceable to the upstream project
 * it was adopted from, and must be able to justify its own correct answer.
 *
 * These two assertions are what let the bank be published rather than merely
 * asserted as publishable. Provenance makes each question auditable against a
 * pinned commit; a non-empty explanation is the minimum needed to teach the item,
 * since the exam shows it on every miss.
 */

const DOMAIN_FILES = { NF: nf, NA: na, IPC: ipc, IPS: ips, SEC: sec, AUTO: auto }

const allQuestions = Object.values(DOMAIN_FILES).flatMap((file) => file.questions)

describe('merged bank provenance', () => {
  it('loads the expected number of questions', () => {
    expect(allQuestions).toHaveLength(169)
  })

  it.each(Object.keys(DOMAIN_FILES))('%s questions all carry full upstream provenance', (domain) => {
    const questions = DOMAIN_FILES[domain].questions
    expect(questions.length).toBeGreaterThan(0)

    const missing = questions
      .filter(
        (q) =>
          !q.upstream ||
          typeof q.upstream.project !== 'string' ||
          !q.upstream.project.trim() ||
          typeof q.upstream.commit !== 'string' ||
          !/^[0-9a-f]{40}$/.test(q.upstream.commit) ||
          typeof q.upstream.id !== 'string' ||
          !q.upstream.id.trim() ||
          q.upstream.licence !== 'MIT'
      )
      .map((q) => q.id)

    expect(missing, `missing provenance: ${missing.join(', ')}`).toEqual([])
  })

  it('pins every question to a single upstream commit', () => {
    const commits = [...new Set(allQuestions.map((q) => q.upstream?.commit))].filter(Boolean)
    expect(commits).toEqual(['6efca4f15e8ccf01fb44973b46bb26922797965a'])
  })

  it('gives every question a non-empty explanation', () => {
    const empty = allQuestions
      .filter((q) => typeof q.explanation !== 'string' || !q.explanation.trim())
      .map((q) => q.id)

    expect(empty, `missing explanation: ${empty.join(', ')}`).toEqual([])
  })

  it('reproduces the per-domain counts recorded at adoption', () => {
    const counts = Object.fromEntries(
      Object.entries(DOMAIN_FILES).map(([domain, file]) => [domain, file.questions.length])
    )
    expect(counts).toEqual({ NF: 33, NA: 37, IPC: 31, IPS: 32, SEC: 24, AUTO: 12 })
  })
})
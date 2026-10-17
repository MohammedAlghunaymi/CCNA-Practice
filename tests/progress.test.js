import { describe, it, expect, beforeEach } from 'vitest'
import {
  PROGRESS_KEY,
  readProgress,
  writeProgress,
  resumeIndex,
  clearProgress,
} from '../src/lib/progress.js'

/**
 * The practice record.
 *
 * Two of these tests exist because the obvious implementation of `writeProgress`
 * is wrong in a way no other test would catch: build a whole record from the
 * question in front of you and `setItem` it, and every answer the reader gave in
 * any other domain is gone by the next click. `Exam.jsx:100` does exactly that,
 * and its record is one paper — this one is cumulative, so it cannot.
 */
describe('progress', () => {
  beforeEach(() => {
    localStorage.clear()
    clearProgress()
  })

  it('uses its own key and never the exam attempt key', () => {
    expect(PROGRESS_KEY).toBe('practice.progress.v1')
    writeProgress({ domain: 'NF', index: 0 })
    expect(localStorage.getItem('exam.active')).toBeNull()
    expect(localStorage.getItem(PROGRESS_KEY)).not.toBeNull()
  })

  it('writes on a fresh store instead of throwing', () => {
    // `readProgress()` returns null for an absent key, so a naive
    // `readProgress().answers` would throw here, on the very first answer.
    expect(readProgress()).toBeNull()
    const written = writeProgress({ answers: { q1: { chosen: ['A'], correct: true } } })
    expect(written.answers.q1).toEqual({ chosen: ['A'], correct: true })
    expect(readProgress().answers.q1).toEqual({ chosen: ['A'], correct: true })
  })

  it('accumulates answers across domains rather than replacing them', () => {
    writeProgress({ answers: { 'nf-1': { chosen: ['A'], correct: true } } })
    writeProgress({ answers: { 'na-1': { chosen: ['B'], correct: false } } })
    const record = readProgress()
    expect(Object.keys(record.answers).sort()).toEqual(['na-1', 'nf-1'])
    expect(record.answers['nf-1'].correct).toBe(true)
    expect(record.answers['na-1'].correct).toBe(false)
  })

  it('keeps answers when the cursor moves', () => {
    writeProgress({ answers: { 'nf-1': { chosen: ['A'], correct: true } } })
    writeProgress({ domain: 'NF', index: 7 })
    const record = readProgress()
    expect(record.index).toBe(7)
    expect(record.domain).toBe('NF')
    expect(record.answers['nf-1']).toBeTruthy()
  })

  it('defaults a missing answers map rather than throwing on it', () => {
    // A record with a matching version and no `answers` is well-formed JSON.
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ v: 1, domain: 'NF', index: 2 }))
    expect(() => readProgress()).not.toThrow()
    expect(readProgress().answers).toEqual({})
  })

  it('treats a version mismatch as a fresh start', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ v: 999, domain: 'NF', answers: {} }))
    expect(readProgress()).toBeNull()
  })

  it('clears by removing the key, not by writing an empty object', () => {
    writeProgress({ answers: { q1: { chosen: ['A'], correct: true } } })
    clearProgress()
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(readProgress()).toBeNull()
  })
})

describe('resumeIndex', () => {
  it('resumes within the domain the cursor was left in', () => {
    expect(resumeIndex({ domain: 'NF', index: 5 }, 'NF', 33)).toBe(5)
  })

  it('ignores a cursor from another domain but keeps the answers', () => {
    // The failure this prevents: clamping `index` against a list it was never
    // measured in resumes the reader at the wrong question, silently.
    expect(resumeIndex({ domain: 'NA', index: 2 }, 'NF', 33)).toBe(0)
  })

  it('clamps a stale same-domain cursor to the end of the list', () => {
    expect(resumeIndex({ domain: 'NF', index: 999 }, 'NF', 33)).toBe(32)
    expect(resumeIndex({ domain: 'NF', index: -4 }, 'NF', 33)).toBe(0)
  })

  it('resumes at zero with no record at all', () => {
    expect(resumeIndex(null, 'NF', 33)).toBe(0)
  })

  it('resumes at zero for a non-numeric cursor', () => {
    expect(resumeIndex({ domain: 'NF', index: 'x' }, 'NF', 33)).toBe(0)
  })

  it('never returns a negative index for an empty list', () => {
    expect(resumeIndex({ domain: 'NF', index: 4 }, 'NF', 0)).toBe(0)
  })
})
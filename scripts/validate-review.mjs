#!/usr/bin/env node
/**
 * CI gate: every merged question batch carries a signed-off review record.
 *
 * The plan promises that G5 (no question ships without review) is enforced
 * mechanically rather than by good intentions. This is that mechanism: a batch
 * id cannot appear in the question bank without a matching record.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const questionsDir = join(root, 'src/data/questions')
const reviewDir = join(root, 'review/batches')

const REQUIRED_FIELDS = ['batchId', 'questionIds', 'reviewer', 'reviewedAt', 'findings', 'status']

const files = existsSync(questionsDir)
  ? readdirSync(questionsDir).filter((f) => f.endsWith('.json')).sort()
  : []

const questions = []
for (const file of files) {
  const parsed = JSON.parse(readFileSync(join(questionsDir, file), 'utf8'))
  const list = Array.isArray(parsed) ? parsed : (parsed.questions ?? [])
  for (const q of list) questions.push(q)
}

const batchIds = [...new Set(questions.map((q) => q.batch).filter(Boolean))].sort()

const failures = []

if (batchIds.length === 0) {
  console.log('CCNA BATCH REVIEW VALIDATION')
  console.log('='.repeat(72))
  console.log('PASS  Every merged batch has a signed-off review record')
  console.log('      no batches merged yet; nothing to enforce')
  console.log('='.repeat(72))
  console.log('1/1 criteria pass')
  process.exit(0)
}

for (const batchId of batchIds) {
  const recordPath = join(reviewDir, `${batchId}.json`)

  if (!existsSync(recordPath)) {
    failures.push(`${batchId}: no review/batches/${batchId}.json`)
    continue
  }

  let record
  try {
    record = JSON.parse(readFileSync(recordPath, 'utf8'))
  } catch (error) {
    failures.push(`${batchId}: review record is not valid JSON (${error.message})`)
    continue
  }

  const missing = REQUIRED_FIELDS.filter((field) => record[field] === undefined)
  if (missing.length) {
    failures.push(`${batchId}: review record missing ${missing.join(', ')}`)
    continue
  }

  if (record.status !== 'signed-off') {
    failures.push(`${batchId}: status is "${record.status}", expected "signed-off"`)
    continue
  }

  const covered = new Set(record.questionIds)
  const inBatch = questions.filter((q) => q.batch === batchId).map((q) => q.id)
  const uncovered = inBatch.filter((id) => !covered.has(id))
  if (uncovered.length) {
    failures.push(`${batchId}: review record covers ${covered.size} ids but ${uncovered.length} merged question(s) are unreviewed`)
  }
}

console.log('CCNA BATCH REVIEW VALIDATION')
console.log('='.repeat(72))
if (failures.length === 0) {
  console.log('PASS  Every merged batch has a signed-off review record')
  console.log(`      ${batchIds.length} batch(es): ${batchIds.join(', ')}`)
} else {
  console.log('FAIL  Every merged batch has a signed-off review record')
  for (const failure of failures) console.log(`      - ${failure}`)
}
console.log('='.repeat(72))
console.log(`${failures.length === 0 ? 1 : 0}/1 criteria pass`)

process.exit(failures.length === 0 ? 0 : 1)
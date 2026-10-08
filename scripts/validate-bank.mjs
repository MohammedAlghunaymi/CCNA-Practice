#!/usr/bin/env node
/**
 * CI gate: question-bank integrity.
 *
 *   node scripts/validate-bank.mjs                      # judge against the pilot milestone
 *   node scripts/validate-bank.mjs --milestone v1       # judge against a named milestone
 *   node scripts/validate-bank.mjs --milestone v1 --close-total
 *
 * --close-total enforces the exact total. Omit it while a milestone is in
 * progress: per-batch merges are judged on floors, coverage and proportional
 * drift, not on a count that only applies when the milestone closes.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { indexObjectives } from '../src/lib/questionSchema.js'
import { validateBank } from '../src/lib/validateBank.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const questionsDir = join(root, 'src/data/questions')

const args = process.argv.slice(2)
const milestone = args.includes('--milestone')
  ? args[args.indexOf('--milestone') + 1]
  : 'pilot'
const checkTotal = args.includes('--close-total')

const config = JSON.parse(readFileSync(join(root, 'src/config/bank.config.json'), 'utf8'))
const objectivesRaw = JSON.parse(readFileSync(join(root, 'src/data/objectives.json'), 'utf8'))
const objectives = indexObjectives(objectivesRaw)

// Load every domain file that exists. A missing directory is a valid state:
// the bank is empty until Phase 2 authors the first batch.
const questions = []
const files = existsSync(questionsDir) ? readdirSync(questionsDir).filter((f) => f.endsWith('.json')).sort() : []
for (const file of files) {
  const parsed = JSON.parse(readFileSync(join(questionsDir, file), 'utf8'))
  const list = Array.isArray(parsed) ? parsed : (parsed.questions ?? [])
  for (const q of list) questions.push(q)
}

const { results, stats } = validateBank({ questions, objectives, config, milestone, checkTotal })

const pad = Math.max(...results.map((r) => r.name.length))
let failures = 0

console.log('CCNA QUESTION BANK VALIDATION')
console.log('='.repeat(72))
for (const result of results) {
  if (!result.pass) failures++
  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name.padEnd(pad)}`)
  console.log(`      ${result.detail}`)
}
console.log('='.repeat(72))
console.log(`${results.length - failures}/${results.length} criteria pass`)
console.log(
  `Milestone "${milestone}": ${stats.total}/${stats.target} questions, ` +
    `floor ${stats.floor} across ${stats.inScope} in-scope sub-objectives, ` +
    `${files.length} domain file(s)`
)

process.exit(failures === 0 ? 0 : 1)
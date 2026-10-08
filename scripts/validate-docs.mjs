#!/usr/bin/env node
/**
 * CI gate: generated documentation matches its source data.
 *
 * Two guarantees:
 *   1. docs/PROJECT.md enumerates every sub-objective in objectives.json, so the
 *      document the user asked for cannot silently fall out of date.
 *   2. docs/NOT-EMULATED.md is in sync with src/data/not-emulated.json.
 *
 * Delegates the staleness comparison to generate-docs.mjs --check so the two
 * scripts can never disagree about what "current" means.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const objectives = JSON.parse(readFileSync(join(root, 'src/data/objectives.json'), 'utf8'))

const results = []
const record = (name, pass, detail) => results.push({ name, pass, detail })

const projectPath = join(root, 'docs/PROJECT.md')
if (!existsSync(projectPath)) {
  record('docs/PROJECT.md exists', false, 'file is missing')
  record('docs/PROJECT.md enumerates every sub-objective', false, 'file is missing')
} else {
  const project = readFileSync(projectPath, 'utf8')

  record('docs/PROJECT.md exists', true, 'present')

  const leafIds = []
  for (const domain of objectives.domains) {
    for (const objective of domain.objectives) {
      if (objective.isLeaf) leafIds.push(objective.id)
    }
  }

  const missing = leafIds.filter((id) => !project.includes(`\`${id}\``))
  record(
    'docs/PROJECT.md enumerates every sub-objective',
    missing.length === 0,
    missing.length
      ? `${missing.length} of ${leafIds.length} absent: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' ...' : ''}`
      : `all ${leafIds.length} sub-objective IDs present`
  )
}

const generated = spawnSync(process.execPath, [join(root, 'scripts/generate-docs.mjs'), '--check'], {
  cwd: root,
  encoding: 'utf8',
})
record(
  'Generated documentation matches its source data',
  generated.status === 0,
  generated.status === 0
    ? 'NOT-EMULATED.md and the PROJECT.md appendix are current'
    : (generated.stderr || generated.stdout || '').trim().split('\n').filter(Boolean).join(' | ')
)

const pad = Math.max(...results.map((r) => r.name.length))
let failures = 0
console.log('CCNA DOCUMENTATION VALIDATION')
console.log('='.repeat(72))
for (const result of results) {
  if (!result.pass) failures++
  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name.padEnd(pad)}`)
  console.log(`      ${result.detail}`)
}
console.log('='.repeat(72))
console.log(`${results.length - failures}/${results.length} criteria pass`)

process.exit(failures === 0 ? 0 : 1)
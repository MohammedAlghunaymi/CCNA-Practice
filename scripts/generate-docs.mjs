#!/usr/bin/env node
/**
 * Generate the documentation that is derived from data, so it cannot drift:
 *
 *   docs/NOT-EMULATED.md          <- src/data/not-emulated.json
 *   PROJECT.md objective appendix <- src/data/objectives.json
 *
 * Run with --check in CI to fail if either file is stale.
 *
 * This file is a shell. The logic is in `src/lib/docs.js`, because everything
 * below runs at module scope and calls `process.exit`, which makes this file
 * impossible to import from a test — `check-anti-rot.mjs:189-190` records the
 * same constraint for every other script here, and `src/lib/validateBank.js` is
 * the pattern this follows.
 *
 * `DOCS_ROOT` overrides the repository root. The default is derived from this
 * file's location, as it always was; the override exists so a test can point the
 * real shell at a fixture tree.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assessDocs, writeDocs } from '../src/lib/docs.js'

const root = process.env.DOCS_ROOT
  ? join(process.env.DOCS_ROOT)
  : join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

const notEmulated = JSON.parse(readFileSync(join(root, 'src/data/not-emulated.json'), 'utf8'))
const objectives = JSON.parse(readFileSync(join(root, 'src/data/objectives.json'), 'utf8'))

const findings = assessDocs({ root, objectives, notEmulated })

// --check never calls writeDocs.
//
// It used to share the path with write mode and print one blanket remedy for
// every finding, which is how a manual finding ended up advertising
// `npm run docs:generate` — a command that cannot restore a deleted
// `docs/PROJECT.md`. It also repairs what it checks if given the chance: a stale
// tree would exit 1 and rewrite the file, so the next run reported clean and the
// gate passed on its second invocation. CI runs this first, with no `git diff`
// behind it.
if (check) {
  if (findings.length === 0) {
    console.log('OK    Generated documentation matches its source data')
    process.exit(0)
  }
  console.error('FAIL  Generated documentation is stale')
  for (const finding of findings) {
    console.error(`      - ${finding.file} ${finding.reason}`)
    console.error(
      finding.kind === 'manual'
        ? `        MANUAL FIX: ${finding.remedy}`
        : '        Fix with: npm run docs:generate'
    )
  }
  process.exit(1)
}

const written = writeDocs(findings, { root })

// Report what was written, and what was not. The old code reported from `stale`,
// which is how a file nothing had written came back as `updated:`.
for (const finding of written) console.log(`updated: ${finding.file}`)
for (const finding of findings) {
  if (finding.kind === 'manual') console.log(`MANUAL FIX: ${finding.file} - ${finding.remedy}`)
}

if (findings.length === 0) console.log('Generated documentation already up to date')
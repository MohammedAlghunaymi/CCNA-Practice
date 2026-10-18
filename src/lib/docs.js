import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The generated-document contract.
 *
 * This module exists because the script that used to hold this logic could not be
 * tested. `scripts/generate-docs.mjs` runs its whole body at module scope and
 * calls `process.exit`, so importing it to reach a function killed the test
 * worker mid-import. `check-anti-rot.mjs:189-190` records the rule for every
 * other script in the repo — "It cannot be imported: it calls process.exit" —
 * and the answer it already models is `src/lib/validateBank.js` plus a shell.
 * So the logic lives here and the script stays a shell.
 *
 * The defect this fixes was a predicate built by string-matching messages:
 *
 *     stale.some((s) => s.includes('missing'))
 *
 * Three of the five possible messages contain "missing", so the gate was wrong
 * in both directions at once. A stale `NOT-EMULATED.md` matched nothing and was
 * never written, while a missing `PROJECT.md` matched and rewrote an unrelated
 * file. Both printed `updated:`, and both printed a remedy that could not fix
 * them. Findings carry a `kind` instead, so the thing that decides what to write
 * and the thing that reports what is stale are the same list.
 */

// The appendix markers stay module constants on purpose: `renderAppendix`
// emits them and `assessDocs` searches for them, and two copies could drift.
export const BEGIN = '<!-- BEGIN GENERATED OBJECTIVE APPENDIX -->'
export const END = '<!-- END GENERATED OBJECTIVE APPENDIX -->'

// Pinned as constants, not free text. An empty remedy passes `expect.any(String)`
// and prints `MANUAL FIX: ` with nothing after it, which is a worse version of
// the bug being fixed.
export const REMEDY_MISSING = 'git restore docs/PROJECT.md'
export const REMEDY_MARKERS = 'restore docs/PROJECT.md, or re-insert the BEGIN/END markers'

export function renderNotEmulated(notEmulated) {
  const lines = []
  lines.push('# Emulator gaps')
  lines.push('')
  lines.push('<!-- GENERATED FILE - do not edit. Source: src/data/not-emulated.json -->')
  lines.push('<!-- Regenerate: npm run docs:generate -->')
  lines.push('')
  lines.push(notEmulated.meta.principle)
  lines.push('')
  lines.push(`**Why build rather than adopt:** ${notEmulated.meta.adoptVsBuild}`)
  lines.push('')

  lines.push('## Gaps by feature')
  lines.push('')
  lines.push('| Feature | Objective | Assessed via | Partial |')
  lines.push('|---|---|---|---|')
  for (const gap of notEmulated.gaps) {
    lines.push(`| ${gap.feature} | ${gap.objectiveId} | \`${gap.assessedVia}\` | ${gap.partial ? 'yes' : 'no'} |`)
  }
  lines.push('')

  lines.push('## Rendered show commands')
  lines.push('')
  for (const command of notEmulated.renderedShowCommands) lines.push(`- \`${command}\``)
  lines.push('')
  lines.push(
    'These exist for student feedback only. Grading reads device state directly through the ' +
      '`expectedState` DSL, so no grading path parses show output.'
  )
  lines.push('')

  lines.push('## WLC scope')
  lines.push('')
  lines.push(`Navigation: ${notEmulated.wlcScope.navigation}`)
  lines.push('')
  lines.push(`**Interface note:** ${notEmulated.wlcScope.interfaceNote}`)
  lines.push('')
  lines.push('In scope:')
  for (const item of notEmulated.wlcScope.inScope) lines.push(`- ${item}`)
  lines.push('')
  lines.push('Out of scope:')
  for (const item of notEmulated.wlcScope.outOfScope) lines.push(`- ${item}`)
  lines.push('')

  return lines.join('\n')
}

export function renderAppendix(objectives) {
  const lines = [BEGIN, '', '## Appendix: all 97 sub-objectives', '',
    '<!-- GENERATED - source: src/data/objectives.json -->', '']
  for (const domain of objectives.domains) {
    lines.push(`### ${domain.name} — ${domain.weight}% (${domain.leafCount} sub-objectives)`)
    lines.push('')
    lines.push('| ID | Description |')
    lines.push('|---|---|')
    for (const objective of domain.objectives) {
      if (!objective.isLeaf) continue
      lines.push(`| \`${objective.id}\` | ${objective.description} |`)
    }
    lines.push('')
  }
  lines.push(END)
  return lines.join('\n')
}

/**
 * Classify both generated documents. Reads only — it writes nothing.
 *
 * The reason that is a contract and not a description: this logic used to splice
 * and write inside the detection block, so an implementer moving it out could
 * easily leave the repair where it was. Then `assessDocs` would heal the file it
 * was asked to check, `--check` would exit 1 on the first run and 0 on the second,
 * and the staleness gate would be vacuous with every gate green. Every write goes
 * through `writeDocs`.
 *
 * Comparisons are byte-exact. `.trimEnd()` was used here before, which made
 * trailing-whitespace drift invisible: append `"\n   \n"`, commit it, and both
 * `--check` and `git diff --exit-code -- docs/` come back clean.
 *
 * A finding is either `regenerable` — there is a `content` to write — or
 * `manual`, there is not and a `remedy` says what a human must do. The missing
 * and markers-stripped `PROJECT.md` cases are manual because 32,133 of that
 * file's 40,388 characters are hand-authored with no source to regenerate them
 * from.
 */
export function assessDocs({ root, objectives, notEmulated }) {
  const findings = []

  const notEmulatedPath = join(root, 'docs/NOT-EMULATED.md')
  const notEmulatedContent = renderNotEmulated(notEmulated)

  if (!existsSync(notEmulatedPath)) {
    findings.push({
      file: 'docs/NOT-EMULATED.md',
      reason: 'is missing',
      kind: 'regenerable',
      content: notEmulatedContent,
    })
  } else if (readFileSync(notEmulatedPath, 'utf8') !== notEmulatedContent) {
    findings.push({
      file: 'docs/NOT-EMULATED.md',
      reason: 'is stale relative to src/data/not-emulated.json',
      kind: 'regenerable',
      content: notEmulatedContent,
    })
  }

  const projectPath = join(root, 'docs/PROJECT.md')
  if (!existsSync(projectPath)) {
    findings.push({
      file: 'docs/PROJECT.md',
      reason: 'is missing',
      kind: 'manual',
      remedy: REMEDY_MISSING,
    })
  } else {
    const project = readFileSync(projectPath, 'utf8')
    const start = project.indexOf(BEGIN)
    const end = project.indexOf(END)
    if (start === -1 || end === -1) {
      findings.push({
        file: 'docs/PROJECT.md',
        reason: 'is missing the generated appendix markers',
        kind: 'manual',
        remedy: REMEDY_MARKERS,
      })
    } else {
      const next = renderAppendix(objectives)
      const current = project.slice(start, end + END.length)
      if (current !== next) {
        // `content` is the COMPLETE file, never the appendix block alone.
        // Writing the block to the path would overwrite the 32,133
        // hand-authored characters before the markers, and `--check` would stay
        // green because the markers survive.
        findings.push({
          file: 'docs/PROJECT.md',
          reason: 'objective appendix is stale',
          kind: 'regenerable',
          content: project.slice(0, start) + next + project.slice(end + END.length),
        })
      }
    }
  }

  return findings
}

/**
 * Write every regenerable finding and return what it wrote.
 *
 * Returning the written list rather than the whole finding list is what stops
 * the report claiming `updated:` for a file nobody wrote. `root` is required and
 * has no default: a default of `process.cwd()` would let a test that forgot the
 * argument write into the real repository.
 */
export function writeDocs(findings, { root }) {
  if (root === undefined) throw new TypeError('writeDocs requires an explicit root')
  mkdirSync(join(root, 'docs'), { recursive: true })

  const written = []
  for (const finding of findings) {
    if (finding.kind !== 'regenerable') continue
    writeFileSync(join(root, finding.file), finding.content, 'utf8')
    written.push(finding)
  }
  return written
}
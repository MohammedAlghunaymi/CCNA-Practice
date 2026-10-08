#!/usr/bin/env node
/**
 * Generate the documentation that is derived from data, so it cannot drift:
 *
 *   docs/NOT-EMULATED.md          <- src/data/not-emulated.json
 *   PROJECT.md objective appendix <- src/data/objectives.json
 *
 * Run with --check in CI to fail if either file is stale.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

const notEmulated = JSON.parse(readFileSync(join(root, 'src/data/not-emulated.json'), 'utf8'))
const objectives = JSON.parse(readFileSync(join(root, 'src/data/objectives.json'), 'utf8'))

const stale = []

// ---- NOT-EMULATED.md ----------------------------------------------------
function renderNotEmulated() {
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

const notEmulatedPath = join(root, 'docs/NOT-EMULATED.md')
const notEmulatedContent = renderNotEmulated()

if (!existsSync(notEmulatedPath)) {
  stale.push('docs/NOT-EMULATED.md is missing')
} else if (readFileSync(notEmulatedPath, 'utf8').trimEnd() !== notEmulatedContent.trimEnd()) {
  stale.push('docs/NOT-EMULATED.md is stale relative to src/data/not-emulated.json')
}

// ---- PROJECT.md objective appendix --------------------------------------
const BEGIN = '<!-- BEGIN GENERATED OBJECTIVE APPENDIX -->'
const END = '<!-- END GENERATED OBJECTIVE APPENDIX -->'

function renderAppendix() {
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

const projectPath = join(root, 'docs/PROJECT.md')
if (!existsSync(projectPath)) {
  stale.push('docs/PROJECT.md is missing')
} else {
  const project = readFileSync(projectPath, 'utf8')
  const start = project.indexOf(BEGIN)
  const end = project.indexOf(END)
  if (start === -1 || end === -1) {
    stale.push('docs/PROJECT.md is missing the generated appendix markers')
  } else {
    const current = project.slice(start, end + END.length).trimEnd()
    const next = renderAppendix().trimEnd()
    if (current !== next) stale.push('docs/PROJECT.md objective appendix is stale')
    const updated = project.slice(0, start) + next + project.slice(end + END.length)
    if (!check && updated !== project) writeFileSync(projectPath, updated, 'utf8')
  }
}

if (!check && stale.some((s) => s.includes('missing'))) {
  writeFileSync(notEmulatedPath, notEmulatedContent, 'utf8')
  const remaining = stale.filter((s) => !s.includes('NOT-EMULATED'))
  if (remaining.length === 0) {
    console.log('Wrote docs/NOT-EMULATED.md')
    process.exit(0)
  }
}

if (check) {
  if (stale.length) {
    console.error('FAIL  Generated documentation is stale')
    for (const issue of stale) console.error(`      - ${issue}`)
    console.error('      Fix with: npm run docs:generate')
    process.exit(1)
  }
  console.log('OK    Generated documentation matches its source data')
  process.exit(0)
}

if (stale.length) {
  for (const issue of stale) console.log(`updated: ${issue.replace(' is stale relative to', ' from')}`)
} else {
  console.log('Generated documentation already up to date')
}
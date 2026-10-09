#!/usr/bin/env node
/**
 * Generate the frozen per-domain allocation for every milestone and write it
 * into src/config/bank.config.json.
 *
 * Re-running against a frozen allocation requires --force, and the diff must
 * be reviewed: silently relabelling the whole bank mid-milestone is exactly the
 * churn this guard exists to prevent.
 *
 *   node scripts/allocate-bank.mjs            # generate if not yet frozen
 *   node scripts/allocate-bank.mjs --force    # regenerate and refreeze
 *   node scripts/allocate-bank.mjs --check    # verify without writing
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { computeAllocation, balancedFloors, examDrawQuota } from '../src/lib/allocation.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = join(root, 'src/config/bank.config.json')
const objectivesPath = join(root, 'src/data/objectives.json')

const args = new Set(process.argv.slice(2))
const force = args.has('--force')
const check = args.has('--check')

const config = JSON.parse(readFileSync(configPath, 'utf8'))
const objectives = JSON.parse(readFileSync(objectivesPath, 'utf8'))

const leafs = {}
const weights = {}
const domainOfObjective = {}
const allLeafIds = []

for (const domain of objectives.domains) {
  const leaves = domain.objectives.filter((o) => o.isLeaf)
  leafs[domain.id] = leaves.length
  weights[domain.id] = domain.weight
  for (const leaf of leaves) {
    domainOfObjective[leaf.id] = domain.id
    allLeafIds.push(leaf.id)
  }
}

// Validate the pilot subset before allocating against it.
const pilotSubset = config.pilotSubset
const badSubset = pilotSubset.filter((id) => !allLeafIds.includes(id))
if (badSubset.length) {
  console.error(`ERROR: pilotSubset references unknown objectives: ${badSubset.join(', ')}`)
  process.exit(1)
}

const generated = {}
  for (const [name, milestone] of Object.entries(config.milestones)) {
    // Resolve the scope for this milestone. A pilot-scope milestone counts only
    // the leaves actually named in pilotSubset; everything else covers all leaves.
    let scopedLeafs = leafs
    let scopedWeights = weights

    if (milestone.scope === 'pilotSubset') {
      const counts = {}
      for (const id of pilotSubset) {
        const domain = domainOfObjective[id]
        counts[domain] = (counts[domain] ?? 0) + 1
      }
      scopedLeafs = { ...counts }
      scopedWeights = {}
      for (const domain of Object.keys(counts)) scopedWeights[domain] = weights[domain]
    }

    // Per-domain coverage minimums are frozen in config.floorsByMilestone and
    // verified against balancedFloors() below. Reading them from config rather
    // than recomputing keeps the allocation reproducible even if a future
    // milestone wants a floor the formula would not produce.
    const stored = config.floorsByMilestone?.[name]
    if (!stored) {
      console.error(`ERROR: floorsByMilestone has no entry for milestone "${name}"`)
      process.exit(1)
    }
    const derived = balancedFloors({
      leafs: scopedLeafs,
      weights: scopedWeights,
      floorPerObjective: milestone.floorPerObjective,
    })
    const mismatched = Object.keys(derived).filter((domain) => derived[domain] !== stored[domain])
    if (milestone.uniformFloors && mismatched.length === 0) {
      // Documented exception: this milestone wants the same minimum everywhere.
    } else if (mismatched.length) {
      console.error(
        `ERROR: floorsByMilestone.${name} disagrees with balancedFloors() for: ${mismatched.join(', ')}`
      )
      console.error(`  stored:  ${JSON.stringify(stored)}`)
      console.error(`  derived: ${JSON.stringify(derived)}`)
      process.exit(1)
    }

    const result = computeAllocation({
      leafs: scopedLeafs,
      weights: scopedWeights,
      scope: Object.keys(scopedLeafs),
      floors: stored,
      target: milestone.target,
    })

    generated[name] = {
      target: milestone.target,
      floorPerObjective: milestone.floorPerObjective,
      examLength: milestone.examLength,
      scope: milestone.scope,
      floors: stored,
      perDomain: result.perDomain,
      detail: result.detail,
      // Demand side: a milestone is only buildable if the bank can supply at
      // least this many questions per domain.
      drawQuota: examDrawQuota({
        matrix: config.exam.domainFormatMatrix,
        length: milestone.examLength,
      }),
    }

    const short = Object.entries(generated[name].drawQuota)
      .filter(([domain, need]) => result.perDomain[domain] < need)
      .map(([domain, need]) => `${domain} needs ${need}, bank holds ${result.perDomain[domain]}`)
    if (short.length) {
      console.error(`ERROR: milestone "${name}" cannot fill its exam:`)
      for (const line of short) console.error(`  ${line}`)
      process.exit(1)
    }
  }

const existing = config.allocation?.byMilestone ?? {}
const drifted = Object.keys(generated).filter(
  (name) => JSON.stringify(existing[name]) !== JSON.stringify(generated[name])
)

if (check) {
  if (drifted.length) {
    console.error(`FAIL: stored allocation differs from computed for: ${drifted.join(', ')}`)
    process.exit(1)
  }
  console.log('OK: stored allocation matches the formula for every milestone')
  process.exit(0)
}

if (config.allocation?.frozen && drifted.length && !force) {
  console.error('ERROR: allocation is frozen and would change. Review the diff, then re-run with --force.')
  for (const name of drifted) {
    console.error(`  ${name}: stored ${JSON.stringify(existing[name]?.perDomain)}`)
    console.error(`  ${name}: computed ${JSON.stringify(generated[name].perDomain)}`)
  }
  process.exit(1)
}

config.allocation = {
  frozen: true,
  generatedFor: Object.keys(generated),
  byMilestone: generated,
}

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')

console.log(`Wrote frozen allocation for: ${Object.keys(generated).join(', ')}`)
for (const [name, entry] of Object.entries(generated)) {
  const pairs = Object.entries(entry.perDomain)
    .map(([d, n]) => `${d} ${n}`)
    .join(' · ')
  console.log(`  ${name.padEnd(6)} target ${String(entry.target).padStart(3)}  ${pairs}`)
}
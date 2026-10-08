#!/usr/bin/env node
/**
 * CI gate: MIT-only direct dependencies, plus question-file provenance headers.
 *
 * Scope note, deliberately asymmetric:
 *   - DIRECT dependencies must be MIT. This is the promise in the README and it
 *     is checkable, so it is a hard failure.
 *   - TRANSITIVE dependencies are reported as an advisory list only. The
 *     Vite/Tailwind trees ship ISC- and Apache-licensed packages that we do not
 *     relicense and do not redistribute as part of our source. Failing the build
 *     on those would be a gate nobody could ever turn green.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const questionsDir = join(root, 'src/data/questions')

const results = []
const record = (name, pass, detail) => results.push({ name, pass, detail })

function licenseOf(name) {
  const manifestPath = join(root, 'node_modules', name, 'package.json')
  if (!existsSync(manifestPath)) return null
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')).license
  } catch {
    return null
  }
}

/** Normalise a license field (string, array, or {type}) to a comparable string. */
function licenseText(license) {
  if (typeof license === 'string') return license
  if (Array.isArray(license)) return license.join(' OR ')
  if (license && typeof license === 'object' && license.type) return license.type
  return ''
}

const isMit = (license) => /\bMIT\b/.test(licenseText(license))

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// ---- 1. project itself is MIT -------------------------------------------
const projectLicense = pkg.license ?? 'none'
const licenseFile = join(root, 'LICENSE')
record(
  'Project declares MIT and ships a LICENSE file',
  projectLicense === 'MIT' && existsSync(licenseFile),
  `package.json license="${projectLicense}", LICENSE ${existsSync(licenseFile) ? 'present' : 'MISSING'}`
)

// ---- 2. direct dependencies are MIT -------------------------------------
const direct = Object.keys(pkg.dependencies ?? {})
const directNonMit = []
const directUnknown = []
for (const name of direct) {
  const license = licenseOf(name)
  if (license === null) directUnknown.push(name)
  else if (!isMit(license)) directNonMit.push(`${name} (${licenseText(license)})`)
}
record(
  'Every direct dependency is MIT',
  directNonMit.length === 0 && directUnknown.length === 0,
  directNonMit.length
    ? `non-MIT: ${directNonMit.join(', ')}`
    : directUnknown.length
      ? `license undetermined: ${directUnknown.join(', ')}`
      : `${direct.length} direct dependencies, all MIT: ${direct.join(', ')}`
)

// ---- 3. transitive licences are advisory --------------------------------
// Walk the installed tree and summarise what is NOT MIT, so a human can see
// what the build toolchain pulls in. Reported, never enforced: we do not
// relicense or redistribute these packages, and failing on upstream licences
// would be a gate nobody could turn green.
const nonMit = new Map()
for (const entry of readdirSync(join(root, 'node_modules'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === '.bin') continue
  const candidates = entry.name.startsWith('@')
    ? readdirSync(join(root, 'node_modules', entry.name), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => `${entry.name}/${d.name}`)
    : [entry.name]

  for (const name of candidates) {
    const license = licenseOf(name)
    if (license === null || isMit(license)) continue
    const label = licenseText(license) || 'UNDECLARED'
    nonMit.set(label, (nonMit.get(label) ?? 0) + 1)
  }
}

const nonMitSummary = [...nonMit.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([label, count]) => `${label} x${count}`)

record(
  'Transitive licences reported as advisory, not enforced',
  true,
  nonMitSummary.length
    ? `non-MIT transitives: ${nonMitSummary.join(', ')}. Advisory only: the build toolchain ` +
        `pulls these from upstream and we neither relicense nor redistribute them.`
    : 'no non-MIT packages found in the installed tree'
)

// ---- 4. question files carry provenance ---------------------------------
const files = existsSync(questionsDir)
  ? readdirSync(questionsDir).filter((f) => f.endsWith('.json')).sort()
  : []
const missingProvenance = []
for (const file of files) {
  const parsed = JSON.parse(readFileSync(join(questionsDir, file), 'utf8'))
  const list = Array.isArray(parsed) ? parsed : (parsed.questions ?? [])
  if (!parsed.provenance || typeof parsed.provenance !== 'string') {
    missingProvenance.push(file)
  } else if (list.length > 0 && parsed.provenance.length < 40) {
    missingProvenance.push(`${file} (provenance too short to be meaningful)`)
  }
}
record(
  'Every question file carries a provenance header',
  missingProvenance.length === 0,
  missingProvenance.length
    ? missingProvenance.join(', ')
    : files.length
      ? `${files.length} question file(s), all carry provenance`
      : 'no question files yet; nothing to enforce'
)

// ---- 5. no vendored third-party content in src --------------------------
const suspect = []
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) scan(full)
    else if (/\.(json|jsx?|css|md)$/.test(entry.name)) {
      const text = readFileSync(full, 'utf8')
      if (/real\s+exam\s+questions?|braindump|actual\s+ccna\s+dumps?/i.test(text)) suspect.push(full)
    }
  }
}
scan(join(root, 'src'))
record('No third-party exam content referenced in src/', suspect.length === 0,
  suspect.length ? suspect.join(', ') : 'src/ scanned, no exam-dump references')

const pad = Math.max(...results.map((r) => r.name.length))
let failures = 0
console.log('CCNA LICENSE AND PROVENANCE VALIDATION')
console.log('='.repeat(72))
for (const result of results) {
  if (!result.pass) failures++
  console.log(`${result.pass ? 'PASS' : 'FAIL'}  ${result.name.padEnd(pad)}`)
  console.log(`      ${result.detail}`)
}
console.log('='.repeat(72))
console.log(`${results.length - failures}/${results.length} criteria pass`)

process.exit(failures === 0 ? 0 : 1)
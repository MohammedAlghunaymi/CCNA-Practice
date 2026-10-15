/**
 * Anti-rot gates for Phase 1.
 *
 * Every gate here exists because the defect it catches is invisible to a passing
 * suite: `validate:docs` checks the 97 leaf objective IDs and the generated
 * appendix and cannot see any of this, and `npm test` cannot see a stale string
 * in the source or the plan document. The patterns are declared as literals in
 * this file on purpose — a gate whose logic cannot be grepped out of its own
 * source is not checkable, and `validate:anti-rot` asserts they are present.
 *
 * One gate below (Gate 7) is the documented exception: it cannot be written as
 * literals, because it asserts the *failing set* of another gate rather than a
 * string's presence. It says so at its own definition.
 *
 * Run: `npm run validate:anti-rot`
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { indexObjectives } from '../src/lib/questionSchema.js'
import { validateBank } from '../src/lib/validateBank.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const results = []

function check(name, pass, detail) {
  results.push({ name, pass, detail })
}

/** Every .js/.jsx file under src/, so a `go(-1)` in a new file is still caught. */
function sourceFiles(dir = join(root, 'src')) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const examJsx = readFileSync(join(root, 'src/pages/Exam.jsx'), 'utf8')
const projectMd = readFileSync(join(root, 'docs/PROJECT.md'), 'utf8')
const sources = sourceFiles()
const allSource = sources.map((f) => readFileSync(f, 'utf8')).join('\n')

// -- Gate 1: the attempt record must not fall back to per-tab storage ----------
check(
  'Exam.jsx uses no sessionStorage',
  !examJsx.includes('sessionStorage'),
  'per-tab storage would drop the attempt when the page is closed'
)

// -- Gate 2: forward-only navigation has no decrement path ---------------------
// The minus is required. Optional, it also matches the Next button's `go(1)`.
// `[^)]*` catches a multi-arg `go(-1, true)`.
const backNav = /go\(\s*-\s*1\b[^)]*\)/
check(
  'no call site navigates backwards',
  !backNav.test(allSource),
  'matches go(-1) across all of src/, including a new file'
)

// -- Gate 3: the footer must not claim progress dies with the page -------------
// Absence alone is defeatable: "but not closing a tab" keeps the claim false and
// passes it. The presence half is what pins the corrected wording. Whitespace-
// tolerant, because the sentence is JSX text and a rewrap would otherwise make a
// literal non-contiguous in source while JSX collapses the newline in the render.
const staleFooter = /not\s+closing\s+(the|a|your)\s+(tab|browser)/
const trueFooter = /survives\s+a\s+refresh\s+and\s+closing\s+the\s+page/
check(
  'the footer states progress survives closing the page',
  !staleFooter.test(examJsx) && trueFooter.test(examJsx),
  'checks the rendered claim in both directions, not just the absence of the old one'
)

// -- Gate 4: PROJECT.md must carry the amended plan, not the retired one -------
// Phase 1 was reviewed down to four steps; §12 and §19 still advertised a
// fixture generator, four graders, a frozen DSL evaluator and a placeholder
// banner. Each is deferred to Phase 2 with its reason, and none may still be
// named as Phase 1 scope.
const retiredPlanPhrases = [
  'BroadcastChannel',
  'fixture generator',
  'placeholder banner',
  'synthetic fixtures',
  'four graders',
  'frozen DSL operator set',
  'DSL unit tests',
  'derived-matrix test',
]
const foundPhrases = retiredPlanPhrases.filter((phrase) => projectMd.includes(phrase))

// `100-item fixture` tolerates a space; `exam.test.ts` must not match G2's
// legitimate `drawExam.test.ts`, hence the lookbehind and case sensitivity.
const staleFixtureExam = /100[-\s]item\s+fixture/
const staleTestFileName = /(?<![A-Za-z])exam\.test\.ts/

check(
  'PROJECT.md no longer advertises the deferred Phase 1 scope',
  foundPhrases.length === 0 &&
    !staleFixtureExam.test(projectMd) &&
    !staleTestFileName.test(projectMd),
  foundPhrases.length > 0
    ? `still names: ${foundPhrases.join(', ')}`
    : staleFixtureExam.test(projectMd)
      ? 'still advertises a 100-item fixture exam'
      : staleTestFileName.test(projectMd)
        ? 'still names exam.test.ts, which does not exist'
        : 'clean'
)

// Both amended cells must survive on their own row. Anchoring on a row's number
// cell and then requiring the *amended* cell is what makes this honest: an anchor
// in an untouched column is blind to the edit, and a plain `.*` is greedy across
// cell boundaries, so deleting the exit criteria while leaving the filename in
// the Goal or Deliverable cell would otherwise pass.
const g1CellAnchored = /^\|\s*\*\*G1\*\*[^|]*\|[^|]*tests\/exam\.test\.jsx/m
const phase1CellAnchored = /^\| 1 \|(?:[^|]*\|){2}[^|]*tests\/exam\.test\.jsx/m

check(
  'the G1 acceptance cell carries the rewritten text',
  g1CellAnchored.test(projectMd),
  'cell-anchored, so blanking the acceptance cell fails rather than passes'
)
check(
  'the Phase 1 exit-criteria cell carries the rewritten text',
  phase1CellAnchored.test(projectMd),
  'steps past the Deliverable and Hours cells before looking for the filename'
)

// -- Gate 7: the CI relaxation is bounded, and bounds itself ---------------------
// Two CI steps carry `continue-on-error` while the bank is incomplete. A
// relaxation nobody bounds is just a red gate that got muted, so this gate
// asserts three things at once and is deleted in the same edit as the relaxation
// it bounds (Track 2 Task 2b, once every review batch is signed off).
//
// This is the one gate whose patterns cannot be literals: conjunct 1 greps
// .github/workflows/ci.yml, and conjuncts 2-3 need the real failing set out of
// validateBank, which is a function rather than a string.

const ciYml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')

// A ceiling of "at most two" would be satisfied by today's zero and could not
// tell relaxed from un-relaxed. Exactly two, each anchored to its step name,
// can: moving the flag onto some other step leaves the count at two but breaks
// an anchor, and dropping it from one drops the count.
const RELAXED_STEPS = ['Validate question bank', 'Validate batch review records']
const relaxCount = (ciYml.match(/continue-on-error: true/g) ?? []).length
const relaxAnchors = RELAXED_STEPS.map(
  (step) => new RegExp(`- name: ${step}\\r?\\n\\s+continue-on-error: true`)
)
const relaxAnchored = relaxAnchors.filter((re) => re.test(ciYml)).length
const relaxationBounded = relaxCount === 2 && relaxAnchored === RELAXED_STEPS.length

// Rebuild validateBank's inputs the way scripts/validate-bank.mjs does. It
// cannot be imported: it calls process.exit.
const loadBank = () => {
  const config = JSON.parse(readFileSync(join(root, 'src/config/bank.config.json'), 'utf8'))
  const objectives = indexObjectives(
    JSON.parse(readFileSync(join(root, 'src/data/objectives.json'), 'utf8'))
  )
  const questionsDir = join(root, 'src/data/questions')
  const questions = []
  for (const file of existsSync(questionsDir)
    ? readdirSync(questionsDir).filter((f) => f.endsWith('.json')).sort()
    : []) {
    const parsed = JSON.parse(readFileSync(join(questionsDir, file), 'utf8'))
    questions.push(...(Array.isArray(parsed) ? parsed : (parsed.questions ?? [])))
  }
  const adoptedPath = join(root, 'docs/ADOPTED.md')
  const adoptionRegistry = existsSync(adoptedPath)
    ? [...readFileSync(adoptedPath, 'utf8').matchAll(/^\| `([a-z0-9-]+)` \| \d+\.\d+\/\d+\.\d/gm)]
        .map((m) => ({ upstreamId: m[1] }))
    : null
  return validateBank({
    questions, objectives, config, milestone: 'pilot', checkTotal: false, adoptionRegistry,
  })
}

// Conjunct 2, and it is load-bearing: the four red criteria are all *deficit*
// checks, so a loader that silently drops a domain file, globs the wrong
// directory, or loads a third of the bank produces the very same four failures
// and the expiry below would read green. Measured: dropping any one of the six
// files leaves the failing set unchanged. Pinning the count is the only thing
// that separates "the bank is as expected and four checks are red" from "the
// loader is broken and everything is red".
//
// Conjunct 3, matched by name and never by position: record() appends in call
// order, so any change to the number of criteria shifts the positions. The four
// names are what actually identify the state we are in.
const EXPECTED_RED = [
  'Every in-scope sub-objective has',
  'Per-domain format counts can fill the exam matrix',
  'Per-domain allocation drift within',
  'Every wrong option carries a real rationale',
]

let loaded = null
let loadError = null
try {
  loaded = loadBank()
} catch (err) {
  loadError = err instanceof Error ? err.message : String(err)
}

const bankLoaded =
  loaded !== null && loaded.results.length === 14 && loaded.stats.total === 169

const failingNames = loaded ? loaded.results.filter((r) => !r.pass).map((r) => r.name) : []
const redSetMatches =
  failingNames.length === EXPECTED_RED.length &&
  EXPECTED_RED.every((prefix) => failingNames.some((name) => name.startsWith(prefix)))

// Directory-wide, not one file: validate-review.mjs derives its batch list from
// the `batch` field of every merged question, so signing off `upstream` while a
// later batch is still pending would un-relax CI one gate too early.
const batchesDir = join(root, 'review/batches')
const anySignedOff = existsSync(batchesDir)
  ? readdirSync(batchesDir).some((f) => {
      if (!f.endsWith('.json')) return false
      const rec = JSON.parse(readFileSync(join(batchesDir, f), 'utf8'))
      return rec?.status === 'signed-off'
    })
  : false

check(
  'the CI relaxation is bounded, and its bound expires on its own',
  relaxationBounded && bankLoaded && redSetMatches && !anySignedOff,
  loadError
    ? `could not load the bank: ${loadError}`
    : !relaxationBounded
      ? `found ${relaxCount} continue-on-error, ${relaxAnchored}/${RELAXED_STEPS.length} anchored to a named step`
      : !bankLoaded
        ? `loaded ${loaded?.results.length ?? 0} criteria over ${loaded?.stats.total ?? 0} questions, expected 14 over 169`
        : !redSetMatches
          ? `failing: ${failingNames.join(' | ') || '(none)'}`
          : anySignedOff
            ? 'a review batch is signed off, so the relaxation is no longer needed'
            : 'relaxation anchored, bank fully loaded, exactly the four expected checks red, no batch signed off'
)

// -- Report ------------------------------------------------------------------
let failed = 0
for (const { name, pass, detail } of results) {
  const tag = pass ? 'PASS' : 'FAIL'
  if (!pass) failed += 1
  console.log(`${tag}  ${name}`)
  if (!pass && detail) console.log(`      ${detail}`)
}
console.log('')
console.log(`${results.length - failed}/${results.length} criteria pass`)

if (failed > 0) process.exit(1)
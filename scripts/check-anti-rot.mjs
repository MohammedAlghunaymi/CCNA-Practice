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
 * Run: `npm run validate:anti-rot`
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
import { Link } from 'react-router'
import objectives from '../../../data/objectives.json'
import config from '../../../config/bank.config.json'
import { counts } from '../../../lib/bank.js'

/**
 * Phase 0 shell. It renders the blueprint itself, which makes the data pipeline
 * visible end to end: objectives.json -> domain counts -> allocation -> bank
 * progress. The exam-day routes replace this in Phase 1.
 */
export default function Home() {
  const frozen = config.allocation?.byMilestone?.v1
  const v1 = frozen?.perDomain ?? {}
  const totalTarget = config.milestones.v1.target
  const allocated = Object.values(v1).reduce((sum, n) => sum + n, 0)
  const bankTotal = Object.values(counts).reduce((sum, n) => sum + n, 0)

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">CCNA 200-301 v1.1 Practice Simulator</h1>
        <p className="mt-2 text-sm text-text-muted">
          {objectives.meta.exam} &middot; {objectives.meta.examTitle}
        </p>
        {/* Both modes are doors on one page. Practice has no other entry point:
            all three <Link>s that existed before this one point at `/` or
            `/exam`, and there is no layout or shell component to carry a nav, so
            without this button the whole practice feature would be unreachable
            behind a fully green test suite. */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-block rounded-md bg-accent px-5 py-2 text-sm font-semibold text-black"
            to="/practice"
          >
            Practice by domain
          </Link>
          <Link
            className="inline-block rounded-md border border-border px-5 py-2 text-sm font-semibold"
            to="/exam"
          >
            Start a practice exam
          </Link>
        </div>
      </header>

      <section aria-labelledby="domains-heading">
        <h2 id="domains-heading" className="mb-4 text-lg font-semibold">
          Blueprint coverage
        </h2>
        {/* Two numbers, two labels, never interchangeable.

            This row used to render `v1[domain.id]` — the frozen allocation
            *target* — under the words "in bank". The targets are NF 61, NA 58,
            IPC 71, IPS 31, SEC 50, AUTO 29 = 300; the bank holds 169. The
            mismatch runs in both directions: IPS is allocated 31 and holds 32.
            So neither figure can stand in for the other, and the two are
            rendered with distinct suffixes — "33 in bank" and "61 target" — so
            that no number can be read as the other kind.

            The suffixes are load-bearing, not cosmetic. IPS's target (31) equals
            IPC's live count (31), so any assertion or label that shares one
            suffix across both columns is unsatisfiable for exactly that pair. */}
        <ul className="space-y-2">
          {objectives.domains.map((domain) => (
            <li
              key={domain.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
            >
              <span>
                <span className="font-medium">{domain.name}</span>
                <span className="ml-2 text-xs text-text-faint">
                  {domain.leafCount} sub-objectives
                </span>
              </span>
              <span className="flex items-center gap-4 text-sm">
                <span className="text-text-muted">{domain.weight}% of exam</span>
                <span className="font-mono text-accent">
                  {counts[domain.id] ?? 0} in bank
                </span>
                <span className="font-mono text-text-faint">
                  {v1[domain.id] ?? 0} target
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-border bg-surface px-4 py-4">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-text-faint">Sub-objectives</dt>
            <dd className="font-mono text-lg">{objectives.meta.leafCount}</dd>
          </div>
          <div>
            {/* Renamed from "v1 bank target". `totalTarget` is
                `config.milestones.v1.target`, a milestone target, not an
                allocation and certainly not a count of questions held — the
                "bank" in the old label was the whole falsehood. `Allocated`
                beside it already carries the same 300 from a second source, so
                the two are deliberately worded differently. */}
            <dt className="text-text-faint">v1 target</dt>
            <dd className="font-mono text-lg">{totalTarget}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Allocated</dt>
            <dd className="font-mono text-lg">{allocated}</dd>
          </div>
          <div>
            <dt className="text-text-faint">In bank now</dt>
            <dd className="font-mono text-lg">{bankTotal}</dd>
          </div>
          <div>
            <dt className="text-text-faint">Exam length</dt>
            {/* Renders `config.exam.defaultLength` (100), the full-length paper,
                which is not what the runner starts on: it defaults to 20. The
                config is deliberately not changed to match, because
                validateBank.js:151 computes its format scale from it and
                tests/allocation.test.js:161-167 pins the draw quota against it -
                a 20 there turns 16 short format cells into 22 and fails the
                suite. See PROJECT.md 14. */}
            <dd className="font-mono text-lg">
              {config.exam.defaultLength}
              <span className="ml-2 text-xs font-normal text-text-faint">
                full-length paper
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-text-faint">
        Not affiliated with or endorsed by Cisco Systems, Inc. CCNA is a registered trademark of Cisco
        Systems, Inc. Objective descriptions are paraphrased by this project; only the objective IDs,
        domain names and domain weights are taken from the public blueprint at{' '}
        <a className="underline" href={objectives.meta.blueprintSource}>
          learningcontent.cisco.com
        </a>
        . No Cisco exam content is reproduced.
      </p>
    </main>
  )
}
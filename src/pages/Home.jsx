import { Link } from 'react-router'
import objectives from '../data/objectives.json'
import config from '../config/bank.config.json'

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

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">CCNA 200-301 v1.1 Practice Simulator</h1>
        <p className="mt-2 text-sm text-[--color-text-muted]">
          {objectives.meta.exam} &middot; {objectives.meta.examTitle}
        </p>
        <Link
          className="mt-6 inline-block rounded-md bg-[--color-accent] px-5 py-2 text-sm font-semibold text-black"
          to="/exam"
        >
          Start a practice exam
        </Link>
      </header>

      <section aria-labelledby="domains-heading">
        <h2 id="domains-heading" className="mb-4 text-lg font-semibold">
          Blueprint coverage
        </h2>
        <ul className="space-y-2">
          {objectives.domains.map((domain) => (
            <li
              key={domain.id}
              className="flex items-center justify-between rounded-lg border border-[--color-border] bg-[--color-surface] px-4 py-3"
            >
              <span>
                <span className="font-medium">{domain.name}</span>
                <span className="ml-2 text-xs text-[--color-text-faint]">
                  {domain.leafCount} sub-objectives
                </span>
              </span>
              <span className="flex items-center gap-4 text-sm">
                <span className="text-[--color-text-muted]">{domain.weight}% of exam</span>
                <span className="font-mono text-[--color-accent]">
                  {v1[domain.id] ?? 0} in bank
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-[--color-border] bg-[--color-surface] px-4 py-4">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[--color-text-faint]">Sub-objectives</dt>
            <dd className="font-mono text-lg">{objectives.meta.leafCount}</dd>
          </div>
          <div>
            <dt className="text-[--color-text-faint]">v1 bank target</dt>
            <dd className="font-mono text-lg">{totalTarget}</dd>
          </div>
          <div>
            <dt className="text-[--color-text-faint]">Allocated</dt>
            <dd className="font-mono text-lg">{allocated}</dd>
          </div>
          <div>
            <dt className="text-[--color-text-faint]">Exam length</dt>
            <dd className="font-mono text-lg">{config.exam.defaultLength}</dd>
          </div>
        </dl>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-[--color-text-faint]">
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
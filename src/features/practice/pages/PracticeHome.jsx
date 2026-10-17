import { Link } from 'react-router'
import objectives from '../../../data/objectives.json'
import { counts } from '../../../lib/bank.js'

/**
 * The category index: one card per blueprint domain, each linking into that
 * domain's pager.
 *
 * Counts come from `bank.counts`, which reads the loaded bank. They are not the
 * v1 allocation targets in `bank.config.json`, and the two disagree in both
 * directions — IPS is allocated 31 and holds 32 — so `Home.jsx` reports them
 * side by side under separate labels and this page reports only the real one.
 *
 * Card order is `counts` order, which `bank.js` derives from
 * `objectives.json`'s domain order. It is blueprint order (NF, NA, IPC, IPS,
 * SEC, AUTO), not alphabetical, and it is not incidental: the bank index's
 * order is a contract because practice progress persists a cursor into it.
 */
export default function PracticeHome() {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Practice by domain</h1>
        <p className="mt-2 text-sm text-text-muted">
          {total} questions across {objectives.domains.length} categories. No timer and no
          score &mdash; work through them and read the explanation.
        </p>
        <Link className="mt-6 inline-block text-sm underline" to="/">
          Back to the overview
        </Link>
      </header>

      <ul className="space-y-2">
        {objectives.domains.map((domain) => (
          <li key={domain.id}>
            <Link
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-accent"
              to={`/practice/${domain.id}`}
            >
              <span>
                <span className="font-medium">{domain.name}</span>
                <span className="ml-2 text-xs text-text-faint">
                  {domain.leafCount} sub-objectives &middot; {domain.weight}% of exam
                </span>
              </span>
              <span className="font-mono text-accent">{counts[domain.id]} in bank</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
import { useParams } from 'react-router'

/**
 * Practice pager — one question at a time. Body lands in P3.
 *
 * Consumes `:domainId` now so the route's parameter is proven to bind rather
 * than assumed. Backward navigation is intentional here, which is why Gate 2 of
 * `scripts/check-anti-rot.mjs` is scoped to the exam runner: the one-way rule
 * exists for the exam, where a decrement would rewind a scored paper, and not
 * for practice.
 */
export default function LearnMode() {
  const { domainId } = useParams()

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Practice: {domainId}</h1>
      <p className="mt-2 text-sm text-text-muted">The pager is not built yet.</p>
    </main>
  )
}
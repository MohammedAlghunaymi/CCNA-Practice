/**
 * Practice home — the category index. Body lands in P2.
 *
 * P1 registers the route against this stub so the route table is never orphaned:
 * `AppRouter.jsx` is imported by no test except `tests/router.test.jsx`, so a
 * route added later without a matching registration would leave every gate green
 * and the feature unreachable.
 */
export default function PracticeHome() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Practice by domain</h1>
      <p className="mt-2 text-sm text-text-muted">The category index is not built yet.</p>
    </main>
  )
}
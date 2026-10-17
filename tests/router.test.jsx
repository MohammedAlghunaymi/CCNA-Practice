import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes, buildRouter } from '../src/router/routes.jsx'

/**
 * The route table, and that all four paths actually resolve.
 *
 * `AppRouter.jsx` is imported by no test other than this file — `exam.test.jsx`
 * and `preamble.test.jsx` each build their own `MemoryRouter` — so a route added
 * without a matching registration would leave `npm test`, `lint`, `build`,
 * `validate:anti-rot`, `license:check` and `validate:docs` all green while the
 * feature was unreachable from the app.
 *
 * Asserting the path list is not enough on its own: it says the table contains
 * four entries, not that any of them renders. The third test mounts a real
 * memory router over the exported table and navigates each path.
 */
describe('AppRouter routes', () => {
  it('registers exactly the four routes', () => {
    expect(routes.map((r) => r.path)).toEqual([
      '/',
      '/practice',
      '/practice/:domainId',
      '/exam',
    ])
  })

  it('gives every route an element', () => {
    for (const route of routes) expect(route.element).toBeTruthy()
  })

  it('builds the router from the exported table', () => {
    const spy = vi.fn(() => ({ fake: true }))
    buildRouter(spy)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe(routes)
  })

  it.each([
    ['/', /CCNA 200-301/i],
    ['/practice', /practice by domain/i],
    ['/practice/NF', /practice:\s*NF/i],
  ])('renders %s', (entry, heading) => {
    const router = createMemoryRouter(routes, { initialEntries: [entry] })
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
  })

  it('renders /exam', () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/exam'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: /practice exam/i })).toBeTruthy()
  })
})
import { createBrowserRouter } from 'react-router'
import Home from '../features/home/pages/Home.jsx'
import PracticeHome from '../features/practice/pages/PracticeHome.jsx'
import LearnMode from '../features/practice/pages/LearnMode.jsx'
import Exam from '../features/exam/pages/Exam.jsx'

/**
 * The route table, and the only source of routes in the app.
 *
 * Kept out of `AppRouter.jsx` so that file exports only a component — a module
 * that also exports constants and functions disables React Fast Refresh for
 * everything in it, which is a cost paid in development on every save.
 *
 * `buildRouter` exists so `tests/router.test.jsx` can prove the router is built
 * from `routes` without module mocking. Two approaches were tried and rejected:
 *
 *  - `vi.mock('react-router')` does not intercept it. react-router is an
 *    externalized dependency here, so the mock registers but never applies and
 *    the spy records zero calls — a test that passes for the wrong reason.
 *  - `createBrowserRouter(routes).routes === routes` is false. react-router
 *    copies the array it is given, so identity is not observable from the
 *    returned router.
 *
 * The guarantee is structural instead: there is exactly one route literal in
 * this file, and production calls the same factory the test passes a spy into. A
 * second, unread table would have to be a second literal, which this shape makes
 * impossible rather than merely unlikely.
 */
export const routes = [
  { path: '/', element: <Home /> },
  { path: '/practice', element: <PracticeHome /> },
  { path: '/practice/:domainId', element: <LearnMode /> },
  { path: '/exam', element: <Exam /> },
]

export function buildRouter(create = createBrowserRouter) {
  return create(routes)
}
import { createBrowserRouter, RouterProvider } from 'react-router'
import { buildRouter } from './routes.jsx'

// `/exam` renders setup, the runner and the result inline on one route. It is
// deliberately stateless — refreshing redraws the paper. Splitting these into
// /exam/run and /exam/result belongs with the session work, not before it.
//
// The table itself lives in ./routes.jsx; see the note there on why.
const router = buildRouter(createBrowserRouter)

export default function AppRouter() {
  return <RouterProvider router={router} />
}
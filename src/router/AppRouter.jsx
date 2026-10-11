import { createBrowserRouter, RouterProvider } from 'react-router'
import Home from '../pages/Home.jsx'
import Exam from '../pages/Exam.jsx'

// `/exam` renders setup, the runner and the result inline on one route. It is
// deliberately stateless — refreshing redraws the paper. Splitting these into
// /exam/run and /exam/result belongs with the session work, not before it.
const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/exam', element: <Exam /> },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
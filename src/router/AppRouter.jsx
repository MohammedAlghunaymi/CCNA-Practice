import { createBrowserRouter, RouterProvider } from 'react-router'
import Home from '../pages/Home.jsx'

// Phase 0 shell. The exam-day routes (setup / exam / review / result) are
// introduced in Phase 1, built against synthetic fixture questions first.
const router = createBrowserRouter([
  { path: '/', element: <Home /> },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AppRouter from './router/AppRouter.jsx'
import './index.css'

// AppRouter owns the RouterProvider. Wrapping it here would nest two providers
// and hand the outer one a component instead of a router object.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
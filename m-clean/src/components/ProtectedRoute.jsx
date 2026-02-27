// src/components/ProtectedRoute.jsx
// ---------------------------------------------------------------
// Route protection wrapper for authenticated pages
// Redirects to login if not authenticated or unauthorized
// ---------------------------------------------------------------

import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children, requiredRole = null }) {
    const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true'
    const userRole = sessionStorage.getItem('userRole') // 'citizen' | 'officer'

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />
    }

    // If a specific role is required, check if user has that role
    if (requiredRole && userRole !== requiredRole) {
        return <Navigate to="/" replace />
    }

    return children
}

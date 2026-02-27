// src/App.jsx
// ---------------------------------------------------------------
// Root application — Tamil Nadu Government Portal Layout
// Structure follows government portal conventions:
//   1. Skip link (accessibility)
//   2. Top utility bar (Government of Tamil Nadu)
//   3. Main header (emblem + portal title + nav)
//   4. Breadcrumb / section bar
//   5. Page content
//   6. Official footer
// ---------------------------------------------------------------

import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { HiExclamationTriangle } from 'react-icons/hi2'
import Landing from './pages/Landing'
import LoginPage from './pages/LoginPage'
import FileComplaintPage from './pages/FileComplaintPage'
import HeatmapPage from './pages/HeatmapPage'
import DailyReportPage from './pages/DailyReportPage'
import OfficerDashboard from './pages/OfficerDashboard'
import LeaderboardPage from './pages/LeaderboardPage'
import UserProfilePage from './pages/UserProfilePage'
import ProtectedRoute from './components/ProtectedRoute'
import { FUNCTIONS_CONFIGURED, MAPS_CONFIGURED } from './config'

// ── Navigation items (public pages) ──────────────────────────────────────────
const PUBLIC_NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/complaint', label: 'File Complaint', end: false },
  { to: '/heatmap', label: 'Live Heatmap', end: false },
  { to: '/reports', label: 'Daily Reports', end: false },
  { to: '/leaderboard', label: 'Leaderboard', end: false },
]

// ── Navigation items (authenticated pages) ──────────────────────────────────────────
const AUTH_NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/complaint', label: 'File Complaint', end: false },
  { to: '/heatmap', label: 'Live Heatmap', end: false },
  { to: '/reports', label: 'Daily Reports', end: false },
  { to: '/leaderboard', label: 'Leaderboard', end: false },
  { to: '/dashboard', label: 'Officer Dashboard', end: false },
]

// ── Tamil Nadu Government Emblem (simplified) ──────────────────
function TNEmblem() {
  return (
    <svg
      width="48" height="48" viewBox="0 0 48 48"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="8" y="8" width="32" height="32" rx="2" stroke="#104080" strokeWidth="2" fill="none" />
      <circle cx="24" cy="24" r="10" stroke="#104080" strokeWidth="2" fill="none" />
      <circle cx="24" cy="24" r="3" fill="#104080" />
      <text x="24" y="16" fontSize="8" fill="#104080" fontWeight="bold" textAnchor="middle">TN</text>
    </svg>
  )
}

// ── Env validation banner (shown when keys are missing) ──────────
function EnvBanner() {
  const missing = []
  if (!FUNCTIONS_CONFIGURED) missing.push('VITE_FUNCTIONS_BASE_URL')
  if (!MAPS_CONFIGURED) missing.push('VITE_GOOGLE_MAPS_API_KEY')
  if (missing.length === 0) return null

  return (
    <div
      role="alert"
      style={{
        background: '#fef3c7',
        borderBottom: '1px solid #fcd34d',
        color: '#78350f',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-bold flex-shrink-0 flex items-center gap-1.5">
          <HiExclamationTriangle className="w-4 h-4" />
          Configuration
        </span>
        <span>
          Missing env var{missing.length > 1 ? 's' : ''}:{' '}
          {missing.map((k) => (
            <code key={k} className="bg-amber-100 border border-amber-300 px-1 rounded mx-0.5">{k}</code>
          ))}
          — add to <code className="bg-amber-100 border border-amber-300 px-1 rounded">m-clean/.env</code>
        </span>
      </div>
    </div>
  )
}

// ── Breadcrumb bar ────────────────────────────────────────────
function Breadcrumb() {
  const { pathname } = useLocation()
  const crumb = pathname === '/'
    ? 'Home'
    : pathname === '/login'
      ? 'Officer Login'
      : pathname === '/complaint'
        ? 'File Complaint'
        : pathname === '/heatmap'
          ? 'Live Heatmap'
          : pathname === '/reports'
            ? 'Daily Reports'
            : pathname === '/leaderboard'
              ? 'Leaderboard'
              : pathname === '/profile'
                ? 'User Profile'
                : pathname === '/dashboard'
                  ? 'Officer Dashboard'
                  : 'Page'

  return (
    <div
      className="bg-[#e8edf4] border-b border-[#d1d9e6]"
      aria-label="Breadcrumb"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
        <span>Home</span>
        <span aria-hidden="true">›</span>
        <span className="text-[var(--color-gov-700)] font-medium">{crumb}</span>
      </div>
    </div>
  )
}

// ── Full layout shell ─────────────────────────────────────────
function GovLayout({ children }) {
  const navigate = useNavigate()
  const isAuthenticated = sessionStorage.getItem('isAuthenticated') === 'true'
  const hasUserSession = sessionStorage.getItem('userPhone') || sessionStorage.getItem('userEmail')
  
  const handleLogout = () => {
    sessionStorage.clear()
    navigate('/login')
  }

  const navItems = isAuthenticated ? AUTH_NAV_ITEMS : PUBLIC_NAV_ITEMS

  return (
    <div className="flex flex-col min-h-dvh">

      {/* Skip to content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50
                   focus:bg-[var(--color-gov-700)] focus:text-white focus:px-4 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      {/* ── 1. Top utility bar ── */}
      <div className="bg-[var(--color-gov-900)] text-white text-xs py-1.5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <span className="tracking-wide opacity-90 font-semibold">
            Government of Tamil Nadu
          </span>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="opacity-70">Officer Portal</span>
                <span className="opacity-30">|</span>
                <button 
                  onClick={handleLogout}
                  className="opacity-90 hover:opacity-100 font-semibold transition-opacity"
                >
                  Logout
                </button>
              </>
            ) : hasUserSession ? (
              <>
                <button 
                  onClick={() => navigate('/profile')}
                  className="opacity-90 hover:opacity-100 font-semibold transition-opacity flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  My Profile
                </button>
                <span className="opacity-30">|</span>
                <span className="opacity-70">தமிழ்</span>
                <span className="opacity-30">|</span>
                <span className="opacity-70">English</span>
              </>
            ) : (
              <>
                <span className="opacity-70">தமிழ்</span>
                <span className="opacity-30">|</span>
                <span className="opacity-70">English</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Portal header ── */}
      <header className="bg-white border-b-2 border-[var(--color-gov-700)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          {/* Emblem */}
          <div className="flex-shrink-0">
            <TNEmblem />
          </div>

          {/* Portal title */}
          <div className="flex-1">
            <h1 className="text-lg sm:text-xl font-bold text-[var(--color-gov-900)] leading-tight tracking-tight">
              Madurai Municipal Corporation
            </h1>
            <p className="text-sm font-semibold text-[var(--color-gov-700)] leading-tight mt-0.5">
              M-Clean – Civic Sanitation Intelligence
            </p>
          </div>
        </div>

        {/* ── 3. Navigation tab bar ── */}
        <nav
          className="border-t border-[#d1d9e6] bg-[var(--color-gov-700)]"
          aria-label="Main navigation"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
            <div className="flex">
              {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'px-5 py-3 text-sm font-semibold tracking-wide transition-colors duration-150',
                    'border-b-3 focus:outline-none',
                    isActive
                      ? 'border-white text-white bg-[var(--color-gov-800)]'
                      : 'border-transparent text-blue-100 hover:text-white hover:bg-[var(--color-gov-800)]/60',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
              ))}
            </div>
            {!isAuthenticated && (
              <NavLink
                to="/login"
                className="px-4 py-3 text-sm font-semibold tracking-wide transition-colors duration-150 text-blue-100 hover:text-white hover:bg-[var(--color-gov-800)]/60"
              >
                Officer Login →
              </NavLink>
            )}
          </div>
        </nav>
      </header>

      {/* ── 4. Breadcrumb ── */}
      <Breadcrumb />

      {/* ── 5. Env warning (only when keys are missing) ── */}
      <EnvBanner />

      {/* ── 6. Page content ── */}
      <main id="main-content" className="flex-1 bg-[var(--color-surface)]">
        {children}
      </main>

      {/* ── 7. Footer ── */}
      <footer className="bg-[var(--color-gov-900)] text-white mt-auto border-t-4 border-[var(--color-gov-700)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="font-bold mb-2 text-white">M-Clean Portal</p>
              <p className="text-blue-200 text-xs leading-relaxed">
                A Madurai Municipal Corporation initiative for citizen-driven sanitation 
                reporting and grievance redressal under the Smart Cities Mission.
              </p>
            </div>
            <div>
              <p className="font-bold mb-2 text-white">Quick Links</p>
              <ul className="text-blue-200 text-xs space-y-1">
                <li><a href="#" className="hover:text-white transition">About the Portal</a></li>
                <li><a href="#" className="hover:text-white transition">Citizen Charter</a></li>
                <li><a href="#" className="hover:text-white transition">RTI Information</a></li>
                <li><a href="#" className="hover:text-white transition">Accessibility</a></li>
              </ul>
            </div>
            <div>
              <p className="font-bold mb-2 text-white">Help & Support</p>
              <ul className="text-blue-200 text-xs space-y-1">
                <li>Helpline: <strong className="text-white">0452-XXXX-XXX</strong></li>
                <li>Email: <strong className="text-white">mclean@madura.tn.gov.in</strong></li>
                <li className="pt-1">Mon–Fri, 9:00 AM – 5:00 PM</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-blue-300">
            <span>
              © {new Date().getFullYear()} Madurai Municipal Corporation, Government of Tamil Nadu.
              All rights reserved.
            </span>
            <span className="flex gap-3">
              <a href="#" className="hover:text-white transition">Terms of Use</a>
              <span>|</span>
              <a href="#" className="hover:text-white transition">Privacy Policy</a>
              <span>|</span>
              <a href="#" className="hover:text-white transition">Sitemap</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── App root ──────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <div className="flex flex-col min-h-dvh">
              {/* Top utility bar for landing */}
              <div className="bg-[var(--color-gov-900)] text-white text-xs py-1.5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
                  <span className="tracking-wide opacity-90 font-semibold">
                    Government of Tamil Nadu
                  </span>
                  <div className="flex items-center gap-4 opacity-70">
                    <span>தமிழ்</span>
                    <span>|</span>
                    <span>English</span>
                  </div>
                </div>
              </div>
              <Landing />
              {/* Footer for landing */}
              <footer className="bg-[var(--color-gov-900)] text-white mt-auto border-t-4 border-[var(--color-gov-700)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                  <div className="text-center text-xs text-blue-300">
                    <span>
                      © {new Date().getFullYear()} Madurai Municipal Corporation, Government of Tamil Nadu.
                      All rights reserved.
                    </span>
                  </div>
                </div>
              </footer>
            </div>
          }
        />
        <Route
          path="/login"
          element={<LoginPage />}
        />
        <Route
          path="/complaint"
          element={<GovLayout><FileComplaintPage /></GovLayout>}
        />
        <Route
          path="/heatmap"
          element={<GovLayout><HeatmapPage /></GovLayout>}
        />
        <Route
          path="/reports"
          element={<GovLayout><DailyReportPage /></GovLayout>}
        />
        <Route
          path="/leaderboard"
          element={<GovLayout><LeaderboardPage /></GovLayout>}
        />
        <Route
          path="/profile"
          element={<GovLayout><UserProfilePage /></GovLayout>}
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute requiredRole="officer">
              <GovLayout><OfficerDashboard /></GovLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

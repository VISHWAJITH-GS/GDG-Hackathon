// src/App.jsx
// ---------------------------------------------------------------
// Root application — Government portal layout.
// Structure follows Indian government portal conventions:
//   1. Skip link (accessibility)
//   2. Top utility bar (Ministry name)
//   3. Tricolor stripe
//   4. Main header (emblem + portal title + nav)
//   5. Breadcrumb / section bar
//   6. Page content
//   7. Official footer
// ---------------------------------------------------------------

import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import OfficerDashboard from './pages/OfficerDashboard'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CitizenDashboard from './pages/CitizenDashboard'
import AdminDashboard from './pages/AdminDashboard'
import AdminLoginPage from './pages/AdminLoginPage'
import HeatmapPage from './pages/HeatmapPage'
import DailyReportPage from './pages/DailyReportPage'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { FUNCTIONS_CONFIGURED, MAPS_CONFIGURED } from './config'

// ── Navigation items ──────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/report', label: 'File a Complaint', end: true },
  { to: '/map', label: 'Monitoring Map', end: true },
  { to: '/daily-report', label: 'Daily Report', end: true },
  { to: '/login', label: 'Login', end: true },
]

// ── Emblem SVG (Ashoka-style simplified wheel) ────────────────
function AshokaPillar() {
  return (
    <svg
      width="48" height="48" viewBox="0 0 48 48"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Stylised Ashoka Chakra — 24 spokes */}
      <circle cx="24" cy="24" r="20" stroke="#104080" strokeWidth="2" fill="none" />
      <circle cx="24" cy="24" r="3" fill="#104080" />
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i * 15 * Math.PI) / 180
        const x1 = 24 + 4 * Math.cos(angle)
        const y1 = 24 + 4 * Math.sin(angle)
        const x2 = 24 + 18 * Math.cos(angle)
        const y2 = 24 + 18 * Math.sin(angle)
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="#104080" strokeWidth="1.2"
            strokeLinecap="round"
          />
        )
      })}
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
        <span className="font-bold flex-shrink-0">Configuration</span>
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

// ── Full layout shell ─────────────────────────────────────────
function GovLayout({ children }) {
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
          <span className="tracking-wide opacity-80 font-medium">
            Government of Tamil Nadu &nbsp;|  Urban Local Bodies Department
          </span>
          <div className="flex items-center gap-4 opacity-80">
            <a href="tel:+917871661787" className="hover:text-white transition">
              Helpline: +91 78716 61787
            </a>
            <span aria-hidden="true">|</span>
            <a href="https://maduraicorporation.co.in" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">maduraicorporation.co.in</a>
          </div>
        </div>
      </div>

      {/* ── 2. Tricolor stripe ── */}
      <div className="tricolor-stripe" aria-hidden="true" />

      {/* ── 3. Portal header ── */}
      <header className="bg-white border-b border-[#d1d9e6] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          {/* Emblem */}
          <div className="flex-shrink-0">
            <AshokaPillar />
          </div>

          {/* Portal title */}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-[var(--color-gov-900)] leading-tight tracking-tight truncate">
              M-Clean &mdash; Madurai City Municipal Corporation
            </h1>
            <p className="text-xs text-[var(--color-muted)] leading-tight mt-0.5 truncate">
              Government of Tamil Nadu &mdash; AI-Enabled Civic Sanitation
            </p>
          </div>

          {/* ── 4. Navigation — left-aligned in header row ── */}
          <nav
            className="hidden md:flex items-center gap-0.5 ml-4"
            aria-label="Main navigation"
          >
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'px-3 py-1.5 text-xs font-semibold tracking-wide rounded transition-colors duration-150',
                    'border-b-2 focus:outline-none whitespace-nowrap',
                    isActive
                      ? 'border-[var(--color-gov-700)] text-[var(--color-gov-900)] bg-[var(--color-gov-50)]'
                      : 'border-transparent text-[var(--color-gov-600)] hover:text-[var(--color-gov-900)] hover:bg-[var(--color-gov-50)]',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Official badge */}
          <div className="hidden sm:flex flex-col items-end gap-0.5 flex-shrink-0">
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#FF9933' }}>
              தமிழ்நாடு
            </span>
            <span className="text-[10px] font-semibold text-[var(--color-muted)] tracking-wide">
              Est. 1866 &middot; 100 Wards
            </span>
          </div>
        </div>
      </header>

      {/* ── 5. Env warning (only when keys are missing) ── */}
      <EnvBanner />

      {/* ── 7. Page content ── */}
      <main id="main-content" className="flex-1 bg-white">
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[var(--color-gov-900)] text-white mt-auto">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div>
              <p className="font-bold mb-2 text-[var(--color-saffron)]">M-Clean Portal</p>
              <p className="text-blue-200 text-xs leading-relaxed">
                A Tamil Nadu Government initiative for citizen-driven municipal cleanliness
                reporting and grievance redressal under the Swachh Bharat Mission.
              </p>
            </div>
            <div>
              <p className="font-bold mb-2 text-[var(--color-saffron)]">Quick Links</p>
              <ul className="text-blue-200 text-xs space-y-1">
                <li><a href="#" className="hover:text-white transition">About the Portal</a></li>
                <li><a href="#" className="hover:text-white transition">Citizen Charter</a></li>
                <li><a href="#" className="hover:text-white transition">RTI Information</a></li>
                <li><a href="#" className="hover:text-white transition">Accessibility</a></li>
              </ul>
            </div>
            <div>
              <p className="font-bold mb-2 text-[var(--color-saffron)]">Help & Support</p>
              <ul className="text-blue-200 text-xs space-y-1">
                <li>Helpline: <strong className="text-white">1800-XXX-XXXX</strong></li>
                <li>Email: <strong className="text-white">support@mclean.gov.in</strong></li>
                <li className="pt-1">Mon–Fri, 9:00 AM – 5:00 PM</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-blue-300">
            <span>
                          © {new Date().getFullYear()} Urban Local Bodies Department, Government of Tamil Nadu.
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
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* ── Public portal routes (GovLayout) ── */}
          <Route path="/"         element={<GovLayout><LandingPage /></GovLayout>} />
          <Route path="/report"   element={<GovLayout><Home /></GovLayout>} />
          <Route path="/map"          element={<GovLayout><HeatmapPage /></GovLayout>} />
          <Route path="/daily-report"  element={<GovLayout><DailyReportPage /></GovLayout>} />
          <Route path="/dashboard"     element={<GovLayout><OfficerDashboard /></GovLayout>} />

          {/* ── Auth routes (no layout) ── */}
          <Route path="/login"     element={<LoginPage />} />
          <Route path="/register"  element={<RegisterPage />} />
          <Route path="/admin-mc"  element={<AdminLoginPage />} />

          {/* ── Protected citizen dashboard ── */}
          <Route path="/citizen" element={
            <ProtectedRoute role="citizen">
              <CitizenDashboard />
            </ProtectedRoute>
          } />

          {/* ── Protected admin dashboard ── */}
          <Route path="/admin" element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

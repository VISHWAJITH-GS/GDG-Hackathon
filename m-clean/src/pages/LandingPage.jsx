// src/pages/LandingPage.jsx
// ─────────────────────────────────────────────────────────────
// M-Clean · AI-Powered Civic Sanitation Portal
// Public landing page for hackathon demo — Madurai, Tamil Nadu
//
// Sections:
//   1. Hero
//   2. Live Statistics (Firestore onSnapshot)
//   3. Before vs After
//   4. AI Impact Features
//   5. Process Timeline
//   6. Call-to-Action Banner
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import StatCard from '../components/landing/StatCard'
import FeatureCard from '../components/landing/FeatureCard'
import TimelineStep from '../components/landing/TimelineStep'
import BeforeAfterCard from '../components/landing/BeforeAfterCard'

// ── Ashoka Chakra SVG (decorative) ───────────────────────────
function AshokaDeco({ size = 240, opacity = 0.06 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 48 48"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ opacity }}
    >
      <circle cx="24" cy="24" r="22" stroke="white" strokeWidth="1.5" fill="none" />
      <circle cx="24" cy="24" r="3.5" fill="white" />
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i * 15 * Math.PI) / 180
        const x1 = 24 + 5 * Math.cos(angle)
        const y1 = 24 + 5 * Math.sin(angle)
        const x2 = 24 + 20 * Math.cos(angle)
        const y2 = 24 + 20 * Math.sin(angle)
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="white" strokeWidth="1" strokeLinecap="round" />
        )
      })}
    </svg>
  )
}

// ── Inline CTA Button (gov styled, no external deps needed) ──
function HeroButton({ to, children, variant = 'primary' }) {
  const cls = variant === 'primary'
    ? 'bg-[var(--color-saffron)] text-white hover:bg-amber-500 shadow-lg hover:shadow-xl'
    : 'bg-white/10 text-white border border-white/40 hover:bg-white/20'

  return (
    <Link
      to={to}
      className={[
        'inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg',
        'font-semibold text-base tracking-wide transition-all duration-200 active:scale-95',
        cls,
      ].join(' ')}
    >
      {children}
    </Link>
  )
}

// ── Section label (small caps with saffron bar) ──────────────
function SectionLabel({ children }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-3">
      <span className="h-px flex-1 max-w-10 bg-[var(--color-gov-200,#bfdbfe)]" aria-hidden="true" />
      <span
        className="text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full"
        style={{ background: 'var(--color-gov-50)', color: 'var(--color-gov-600)', border: '1px solid var(--color-gov-100)' }}
      >
        {children}
      </span>
      <span className="h-px flex-1 max-w-10 bg-[var(--color-gov-200,#bfdbfe)]" aria-hidden="true" />
    </div>
  )
}

// ── Live stats hook (Firestore) ───────────────────────────────
function useLiveStats() {
  const [stats, setStats] = useState({
    total: 0,
    cleared: 0,
    pending: 0,
    rate: 0,
    loading: true,
  })

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'reports'),
      (snap) => {
        const total = snap.size
        const cleared = snap.docs.filter((d) => d.data().status === 'cleared').length
        const pending = snap.docs.filter((d) => d.data().status === 'pending').length
        const rate = total > 0 ? Math.round((cleared / total) * 100) : 0
        setStats({ total, cleared, pending, rate, loading: false })
      },
      (err) => {
        console.error('[M-Clean] Firestore stats error:', err)
        setStats((s) => ({ ...s, loading: false }))
      }
    )
    return unsub
  }, [])

  return stats
}

// ── HERO SECTION ─────────────────────────────────────────────
function HeroSection() {
  return (
    <section
      className="relative overflow-hidden py-20 md:py-28"
      style={{
        background: 'linear-gradient(135deg, var(--color-gov-900) 0%, var(--color-gov-800) 50%, var(--color-gov-700) 100%)',
      }}
      aria-labelledby="hero-heading"
    >
      {/* Decorative Ashoka Chakra — large, behind content */}
      <div className="absolute -right-8 top-1/2 -translate-y-1/2 pointer-events-none select-none hidden md:block">
        <AshokaDeco size={380} opacity={0.05} />
      </div>
      <div className="absolute -left-12 bottom-0 pointer-events-none select-none">
        <AshokaDeco size={220} opacity={0.04} />
      </div>

      {/* Tricolor bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(to right, var(--color-saffron) 0% 33.33%, rgba(255,255,255,0.4) 33.33% 66.66%, var(--color-tri-green) 66.66% 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl">
          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-white border border-white/20">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--color-tri-green)' }}
              aria-hidden="true"
            />
            Live · Madurai Municipal Corporation
          </div>

          {/* Headline */}
          <h1
            id="hero-heading"
            className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight mb-5"
          >
            AI-Powered{' '}
            <span
              className="relative inline-block"
              style={{ color: 'var(--color-saffron)' }}
            >
              Clean Madurai
              <span
                className="absolute bottom-0.5 left-0 right-0 h-0.5 rounded-full opacity-60"
                style={{ background: 'var(--color-saffron)' }}
                aria-hidden="true"
              />
            </span>
          </h1>

          {/* Subtext */}
          <p className="text-lg text-blue-100 leading-relaxed mb-8 max-w-xl">
            Preventive civic sanitation powered by real-time AI analysis.
            Citizens report, AI evaluates, municipalities act — restoring dignity
            and cleanliness to every ward in Madurai.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mb-8">
            {[
              { icon: '🤖', label: 'AI Waste Analysis' },
              { icon: '🗺️', label: 'Live Heatmap' },
              { icon: '⚡', label: 'Real-Time Dispatch' },
              { icon: '📊', label: 'Predictive Hotspots' },
            ].map(({ icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-blue-50 border border-white/15"
              >
                <span aria-hidden="true">{icon}</span> {label}
              </span>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-3">
            <HeroButton to="/report" variant="primary">
              <span aria-hidden="true">📷</span>
              Raise a Complaint
            </HeroButton>
            <HeroButton to="/login" variant="primary">
              <span aria-hidden="true">🔑</span>
              Citizen Login
            </HeroButton>
            <HeroButton to="/dashboard" variant="outline">
              <span aria-hidden="true">🗂️</span>
              View Dashboard
            </HeroButton>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── LIVE STATISTICS SECTION ───────────────────────────────────
function StatsSection({ stats }) {
  const cards = [
    {
      icon: '📋',
      label: 'Total Complaints Filed',
      value: stats.total,
      accent: 'var(--color-gov-700)',
      trendLabel: 'Citizen participation',
      trendPositive: true,
    },
    {
      icon: '✅',
      label: 'Complaints Cleared',
      value: stats.cleared,
      accent: '#138808',
      trendLabel: 'Verified clean',
      trendPositive: true,
    },
    {
      icon: '⏳',
      label: 'Pending Action',
      value: stats.pending,
      accent: '#D97706',
      trendLabel: 'Awaiting dispatch',
      trendPositive: false,
    },
    {
      icon: '📈',
      label: 'Clearance Rate',
      value: stats.rate,
      suffix: '%',
      accent: '#1557a0',
      trendLabel: 'Resolution efficiency',
      trendPositive: true,
    },
  ]

  return (
    <section className="py-16 bg-[var(--color-surface)]" aria-labelledby="stats-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionLabel>Live Statistics</SectionLabel>
        <h2
          id="stats-heading"
          className="text-center text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-2"
        >
          Real-Time Sanitation Pulse
        </h2>
        <p className="text-center text-sm text-[var(--color-muted)] mb-10 max-w-lg mx-auto">
          Data updated live from Firestore. Every complaint registered by a citizen
          is tracked end-to-end until clearance is verified.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <StatCard key={card.label} {...card} isLoading={stats.loading} />
          ))}
        </div>

        {/* Live indicator */}
        {!stats.loading && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[var(--color-muted)]">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: 'var(--color-tri-green)' }}
              aria-hidden="true"
            />
            Updating live via Firestore realtime stream
          </div>
        )}
      </div>
    </section>
  )
}

// ── BEFORE vs AFTER SECTION ───────────────────────────────────
function BeforeAfterSection() {
  return (
    <section
      className="py-16"
      style={{ background: 'linear-gradient(180deg, var(--color-surface) 0%, #e8edf4 100%)' }}
      aria-labelledby="before-after-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionLabel>Impact Evidence</SectionLabel>
        <h2
          id="before-after-heading"
          className="text-center text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-2"
        >
          Transformation on Every Street
        </h2>
        <p className="text-center text-sm text-[var(--color-muted)] mb-10 max-w-lg mx-auto">
          AI-powered complaint triage enables faster crew dispatch, turning civic
          neglect into clean, safe public spaces within hours.
        </p>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <BeforeAfterCard type="before" />
          <BeforeAfterCard type="after" />
        </div>

        {/* Arrow bridge — desktop only */}
        <div className="hidden md:flex items-center justify-center mt-6 gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-gov-700)]">
            <span aria-hidden="true">🤖</span>
            AI Triages Complaint
            <span aria-hidden="true"> → </span>
            Municipality Dispatches
            <span aria-hidden="true"> → </span>
            Cleanup Verified
            <span aria-hidden="true">✅</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── AI IMPACT FEATURES SECTION ────────────────────────────────
const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Waste Analysis',
    description:
      'Deep-learning model classifies waste type, severity, and estimated volume from citizen-submitted photographs within seconds of upload.',
    accent: 'var(--color-gov-700)',
  },
  {
    icon: '🗺️',
    title: 'Real-Time Heatmap Monitoring',
    description:
      'Geospatial density map of active complaints updates live — officers identify high-burden wards at a glance for priority dispatch.',
    accent: '#1557a0',
  },
  {
    icon: '🔮',
    title: 'Predictive Hotspot Detection',
    description:
      'Historical complaint patterns and seasonal data power a predictive model that flags zones likely to require intervention before escalation.',
    accent: '#7c3aed',
  },
  {
    icon: '🚛',
    title: 'Workforce Optimisation',
    description:
      "Route planning algorithms assign crews with minimal travel overlap — cutting clearance time and fuel consumption across Madurai's wards.",
    accent: '#138808',
  },
]

function FeaturesSection() {
  return (
    <section className="py-16 bg-[var(--color-surface)]" aria-labelledby="features-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionLabel>AI Capabilities</SectionLabel>
        <h2
          id="features-heading"
          className="text-center text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-2"
        >
          Intelligent Governance at Scale
        </h2>
        <p className="text-center text-sm text-[var(--color-muted)] mb-10 max-w-lg mx-auto">
          Every layer of M-Clean is purpose-built to turn raw citizen data into
          measurable civic improvement, automatically.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── PROCESS TIMELINE SECTION ──────────────────────────────────
const TIMELINE_STEPS = [
  {
    step: 1,
    icon: '📷',
    title: 'Citizen Files Complaint',
    description:
      'A resident photographs the waste site, pins the GPS location, and submits via the M-Clean portal or mobile PWA.',
  },
  {
    step: 2,
    icon: '🤖',
    title: 'AI Analyses the Waste',
    description:
      'Vision AI classifies waste category and severity. A priority score is assigned and the complaint is auto-tagged for the right ward officer.',
  },
  {
    step: 3,
    icon: '🚛',
    title: 'Municipality Dispatches Crew',
    description:
      'The officer dashboard surfaces high-priority complaints. Crew routes are optimised via the Workforce Panel and dispatched immediately.',
  },
  {
    step: 4,
    icon: '✅',
    title: 'Cleanup Verified & Closed',
    description:
      'Field crew uploads a completion photo. AI verifies the site is clear, status moves to "Cleared", and the citizen receives confirmation.',
  },
]

function TimelineSection() {
  return (
    <section
      className="py-16"
      style={{
        background: 'linear-gradient(180deg, #e8edf4 0%, var(--color-surface) 100%)',
      }}
      aria-labelledby="timeline-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionLabel>How It Works</SectionLabel>
        <h2
          id="timeline-heading"
          className="text-center text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-2"
        >
          From Report to Resolution
        </h2>
        <p className="text-center text-sm text-[var(--color-muted)] mb-12 max-w-lg mx-auto">
          A fully automated civic pipeline — zero manual follow-up needed for the
          citizen once a complaint is filed.
        </p>

        {/* Timeline row */}
        <div className="flex flex-col md:flex-row gap-8 md:gap-4">
          {TIMELINE_STEPS.map((s, idx) => (
            <TimelineStep
              key={s.step}
              {...s}
              isLast={idx === TIMELINE_STEPS.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CALL-TO-ACTION BANNER ─────────────────────────────────────
function CTABanner() {
  return (
    <section
      className="py-16 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, var(--color-gov-800) 0%, var(--color-gov-900) 100%)',
      }}
      aria-labelledby="cta-heading"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, rgba(255,153,51,0.08) 0%, transparent 60%), radial-gradient(circle at 80% 50%, rgba(19,136,8,0.08) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">
        <span
          className="inline-block text-4xl mb-4" aria-hidden="true"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(255,153,51,0.4))' }}
        >
          🌿
        </span>
        <h2
          id="cta-heading"
          className="text-2xl md:text-3xl font-extrabold text-white mb-4 leading-tight"
        >
          Make Madurai Cleaner — One Report at a Time
        </h2>
        <p className="text-blue-200 text-sm md:text-base mb-8 max-w-lg mx-auto leading-relaxed">
          Your complaint takes 30 seconds to file. Our AI handles the rest —
          analysis, dispatch, and verified cleanup. Join thousands of active citizens.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <Link
            to="/report"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base tracking-wide transition-all duration-200 active:scale-95 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            style={{ background: 'var(--color-saffron)', color: 'white' }}
          >
            <span aria-hidden="true">📷</span>
            Raise a Complaint Now
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-semibold text-base text-white border border-white/30 bg-white/10 hover:bg-white/20 transition-all duration-200 active:scale-95"
          >
            <span aria-hidden="true">🗂️</span>
            Officer Dashboard
          </Link>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-blue-300">
          {[
            { icon: '🔥', label: 'Powered by Google Firebase' },
            { icon: '🗺️', label: 'Google Maps Platform' },
            { icon: '🤖', label: 'Vertex AI · Vision API' },
            { icon: '🇮🇳', label: 'Swachh Bharat Mission' },
          ].map(({ icon, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span aria-hidden="true">{icon}</span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── STAT HIGHLIGHT TICKER (narrow band above CTA) ─────────────
function StatTicker({ stats }) {
  if (stats.loading || stats.total === 0) return null

  const items = [
    `${stats.total.toLocaleString('en-IN')} complaints registered`,
    `${stats.cleared.toLocaleString('en-IN')} cleanups verified`,
    `${stats.rate}% clearance rate`,
    `${stats.pending.toLocaleString('en-IN')} wards active`,
  ]

  return (
    <div
      className="py-2 overflow-hidden"
      style={{ background: 'var(--color-gov-700)' }}
      aria-label="Live statistics ticker"
    >
      <div className="flex items-center gap-8 px-6">
        {items.map((item, i) => (
          <span key={i} className="text-xs font-semibold text-white whitespace-nowrap flex items-center gap-2">
            <span
              className="w-1 h-1 rounded-full"
              style={{ background: 'var(--color-saffron)' }}
              aria-hidden="true"
            />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── PAGE ENTRY POINT ─────────────────────────────────────────
export default function LandingPage() {
  const stats = useLiveStats()

  return (
    <div className="flex flex-col">
      <HeroSection />
      <StatsSection stats={stats} />
      <BeforeAfterSection />
      <FeaturesSection />
      <TimelineSection />
      <StatTicker stats={stats} />
      <CTABanner />
    </div>
  )
}

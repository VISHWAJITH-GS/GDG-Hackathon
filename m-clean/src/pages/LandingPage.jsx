// src/pages/LandingPage.jsx
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// M-Clean ·· AI-Powered Civic Sanitation Portal
// Public landing page for hackathon demo — Madurai, Tamil Nadu
//
// Sections:
//   1. Hero
//   2. Live Statistics (Firestore onSnapshot)
//   3. Before vs After
//   4. AI Impact Features
//   5. Process Timeline
//   6. Call-to-Action Banner
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import StatCard from '../components/landing/StatCard'
import FeatureCard from '../components/landing/FeatureCard'
import TimelineStep from '../components/landing/TimelineStep'
import BeforeAfterCard from '../components/landing/BeforeAfterCard'
import {
  HiCamera, HiCpuChip, HiChartBar, HiCheckCircle, HiClock,
  HiClipboardDocument, HiArrowTrendingUp, HiSparkles, HiTruck,
  HiBolt, HiLockClosed, HiMapPin, HiFlag,
  HiRocketLaunch, HiGlobeAlt, HiServer,
} from 'react-icons/hi2'

// â”€â”€ Ashoka Chakra SVG (decorative) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// â”€â”€ Inline CTA Button (gov styled, glassy finish) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HeroButton({ to, children, variant = 'primary' }) {
  const cls = variant === 'primary'
    ? [
        'bg-[#104080] text-white border border-[#104080]',
        'shadow-[0_4px_14px_rgba(16,64,128,0.30)]',
        'hover:bg-[#0a3468] hover:border-[#0a3468] hover:-translate-y-px',
        'hover:shadow-[0_6px_20px_rgba(16,64,128,0.45)]',
        'active:!bg-[#082850] active:translate-y-0',
      ].join(' ')
    : [
        'bg-white/10 text-white border border-white/40 backdrop-blur-sm',
        'hover:bg-white/20 hover:border-white/60 hover:-translate-y-px',
        'hover:shadow-[0_6px_20px_rgba(255,255,255,0.12)]',
        'active:!bg-white/30 active:translate-y-0',
      ].join(' ')

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

// â”€â”€ Section label (small caps with saffron bar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Live stats hook (Firestore) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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



// â”€â”€ HERO SECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HeroSection() {
  return (
    <section
      className="relative overflow-hidden bg-[var(--color-gov-50)]"
      style={{
        minHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
      aria-labelledby="hero-heading"
    >
      {/* Tricolor bottom accent */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(to right, #FF9933 0% 33.33%, #e5e7eb 33.33% 66.66%, #138808 66.66% 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-24 md:py-32 w-full">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">

          {/* Animated tagline pill */}
          <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase bg-[var(--color-gov-50)] text-[var(--color-gov-700)] border border-[var(--color-gov-200)]">
            <span className="w-2 h-2 rounded-full animate-pulse bg-emerald-400" aria-hidden="true" />
            Report &nbsp;&middot;&nbsp; Analyse &nbsp;&middot;&nbsp; Resolve
          </div>

          {/* Heading */}
          <h1
            id="hero-heading"
            className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-[var(--color-gov-900)] leading-tight tracking-tight mb-6"
          >
            AI-Powered{' '}
            <span style={{ color: 'var(--color-gov-700)' }}>
              Clean Madurai
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-[var(--color-gov-700)] leading-relaxed mb-8 max-w-2xl">
            Report waste in 30 seconds. AI handles the rest &mdash; analysis, dispatch, and verified cleanup.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
            <HeroButton to="/report" variant="primary">
              <HiCamera className="w-5 h-5" aria-hidden="true" />
              Raise a Complaint
            </HeroButton>
            <HeroButton to="/login" variant="primary">
              <HiLockClosed className="w-5 h-5" aria-hidden="true" />
              Citizen Login
            </HeroButton>
          </div>

          {/* Glassmorphic feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
            {[
              {
                icon: <HiClipboardDocument className="w-6 h-6" />,
                title: 'Live Complaints',
                desc: 'Real-time updates on filed reports',
              },
              {
                icon: <HiMapPin className="w-6 h-6" />,
                title: 'Active Zones',
                desc: 'Monitor high-burden Madurai wards',
              },
              {
                icon: <HiCpuChip className="w-6 h-6" />,
                title: 'AI Analysis',
                desc: 'Instant waste classification & scoring',
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="flex flex-col items-center gap-2 p-5 rounded-xl text-center transition-transform hover:-translate-y-1"
                style={{
                  background: 'var(--color-gov-50)',
                  border: '1px solid var(--color-gov-200)',
                }}
              >
                <span className="text-[var(--color-gov-700)]">{icon}</span>
                <p className="text-sm font-bold text-[var(--color-gov-900)]">{title}</p>
                <p className="text-xs text-[var(--color-gov-600)] leading-snug">{desc}</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  )
}

// â”€â”€ LIVE STATISTICS SECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatsSection({ stats }) {
  const cards = [
    {
      icon: <HiClipboardDocument className="w-6 h-6" />,
      label: 'Total Complaints Filed',
      value: stats.total,
      accent: 'var(--color-gov-700)',
      trendLabel: 'Citizen participation',
      trendPositive: true,
    },
    {
      icon: <HiCheckCircle className="w-6 h-6" />,
      label: 'Complaints Cleared',
      value: stats.cleared,
      accent: '#138808',
      trendLabel: 'Verified clean',
      trendPositive: true,
    },
    {
      icon: <HiClock className="w-6 h-6" />,
      label: 'Pending Action',
      value: stats.pending,
      accent: '#D97706',
      trendLabel: 'Awaiting dispatch',
      trendPositive: false,
    },
    {
      icon: <HiArrowTrendingUp className="w-6 h-6" />,
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
          className="text-center text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-10"
        >
          Live Stats
        </h2>

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

// â”€â”€ BEFORE vs AFTER SECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BeforeAfterSection() {
  return (
    <section
      className="py-16 bg-[var(--color-gov-50)]"
      aria-labelledby="before-after-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionLabel>Impact Evidence</SectionLabel>
        <h2
          id="before-after-heading"
          className="text-center text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-10"
        >
          Before &amp; After
        </h2>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <BeforeAfterCard type="before" />
          <BeforeAfterCard type="after" />
        </div>

        {/* Arrow bridge — desktop only */}
        <div className="hidden md:flex items-center justify-center mt-6 gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-gov-700)]">
            <HiCpuChip className="w-4 h-4" aria-hidden="true" />
            AI Triages Complaint
            <span aria-hidden="true"> â†’ </span>
            Municipality Dispatches
            <span aria-hidden="true"> â†’ </span>
            Cleanup Verified
            <HiCheckCircle className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  )
}

// â”€â”€ AI IMPACT FEATURES SECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FEATURES = [
  {
    icon: <HiCpuChip className="w-6 h-6" />,
    title: 'AI Waste Analysis',
    description:
      'Classifies waste type and severity from photos in seconds.',
    accent: 'var(--color-gov-700)',
  },
  {
    icon: <HiMapPin className="w-6 h-6" />,
    title: 'Real-Time Heatmap Monitoring',
    description:
      'Live density map of active complaints across Madurai wards.',
    accent: '#1557a0',
  },
  {
    icon: <HiSparkles className="w-6 h-6" />,
    title: 'Predictive Hotspot Detection',
    description:
      'Flags zones likely to need cleanup before issues escalate.',
    accent: '#7c3aed',
  },
  {
    icon: <HiTruck className="w-6 h-6" />,
    title: 'Workforce Optimisation',
    description:
      'Optimised crew routing to cut clearance time and costs.',
    accent: '#138808',
  },
]

function FeaturesSection() {
  return (
    <section
      className="py-16 bg-[var(--color-surface)]"
      aria-labelledby="features-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionLabel>AI Capabilities</SectionLabel>
        <h2
          id="features-heading"
          className="text-center text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-10"
        >
          AI Capabilities
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  )
}

// â”€â”€ PROCESS TIMELINE SECTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TIMELINE_STEPS = [
  {
    step: 1,
    icon: <HiCamera className="w-5 h-5" />,
    title: 'Citizen Files Complaint',
    description:
      'Photo + GPS location submitted in under 30 seconds.',
  },
  {
    step: 2,
    icon: <HiCpuChip className="w-5 h-5" />,
    title: 'AI Analyses the Waste',
    description:
      'AI scores severity and routes to the right ward officer.',
  },
  {
    step: 3,
    icon: <HiTruck className="w-5 h-5" />,
    title: 'Municipality Dispatches Crew',
    description:
      'Officer dispatches crew via optimised route planning.',
  },
  {
    step: 4,
    icon: <HiCheckCircle className="w-5 h-5" />,
    title: 'Cleanup Verified & Closed',
    description:
      'AI verifies cleanup from photo. Citizen notified instantly.',
  },
]

function TimelineSection() {
  return (
    <section
      className="py-16 bg-[var(--color-gov-50)]"
      aria-labelledby="timeline-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <SectionLabel>How It Works</SectionLabel>
        <h2
          id="timeline-heading"
          className="text-center text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-12"
        >
          How It Works
        </h2>

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

// â”€â”€ CALL-TO-ACTION BANNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CTABanner() {
  return (
    <section
      className="py-16 relative overflow-hidden bg-[var(--color-gov-50)] border-t border-[var(--color-gov-100)]"
      aria-labelledby="cta-heading"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, rgba(16,64,128,0.04) 0%, transparent 60%), radial-gradient(circle at 80% 50%, rgba(16,64,128,0.04) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">
        <span
          className="inline-block mb-4" aria-hidden="true"
          style={{ color: 'var(--color-gov-700)', filter: 'drop-shadow(0 2px 8px rgba(16,64,128,0.25))' }}
        >
          <HiSparkles className="w-10 h-10 mx-auto" />
        </span>
        <h2
          id="cta-heading"
          className="text-2xl md:text-3xl font-extrabold text-[var(--color-gov-900)] mb-4 leading-tight"
        >
          Make Madurai Cleaner
        </h2>
        <p className="text-[var(--color-gov-700)] text-sm mb-6 max-w-sm mx-auto">
          30 seconds to report. AI handles the rest.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <HeroButton to="/report">
            <HiCamera className="w-5 h-5" aria-hidden="true" />
            Raise a Complaint Now
          </HeroButton>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[var(--color-gov-600)]">
          {[
            { icon: <HiBolt className="w-3.5 h-3.5" />, label: 'Powered by Google Firebase' },
            { icon: <HiMapPin className="w-3.5 h-3.5" />, label: 'Google Maps Platform' },
            { icon: <HiCpuChip className="w-3.5 h-3.5" />, label: 'Vertex AI ·· Vision API' },
            { icon: <HiFlag className="w-3.5 h-3.5" />, label: 'Swachh Bharat Mission' },
            { icon: <HiGlobeAlt className="w-3.5 h-3.5" />, label: 'maduraicorporation.co.in' },
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

// â”€â”€ STAT HIGHLIGHT TICKER (narrow band above CTA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatTicker({ stats }) {
  if (stats.loading || stats.total === 0) return null

  const items = [
    `${stats.total.toLocaleString('en-IN')} complaints registered`,
    `${stats.cleared.toLocaleString('en-IN')} cleanups verified`,
    `${stats.rate}% clearance rate`,
    `${stats.pending.toLocaleString('en-IN')} complaints pending`,
    'Corporation of Madurai ·· Est. 1866',
    '100 Wards ·· 147.99 Sq.Km ·· 5 Zones',
  ]

  return (
    <div
      className="py-2 overflow-hidden bg-[var(--color-gov-50)] border-y border-[var(--color-gov-100)]"
      aria-label="Live statistics ticker"
    >
      <div className="flex items-center gap-8 px-6">
        {items.map((item, i) => (
            <span key={i} className="text-xs font-semibold text-[var(--color-gov-700)] whitespace-nowrap flex items-center gap-2">
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

// â”€â”€ PAGE ENTRY POINT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

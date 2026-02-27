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
import {
  HiCamera, HiCpuChip, HiChartBar, HiCheckCircle, HiClock,
  HiClipboardDocument, HiArrowTrendingUp, HiSparkles, HiTruck,
  HiBolt, HiLockClosed, HiMapPin, HiFlag,
  HiRocketLaunch, HiGlobeAlt, HiServer, HiMicrophone,
} from 'react-icons/hi2'

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

// ── Inline CTA Button (gov styled, glassy finish) ────────────
function HeroButton({ to, children, variant = 'primary' }) {
  const cls = variant === 'primary'
    ? [
        'text-white border border-white/20 backdrop-blur-sm',
        '[background:linear-gradient(160deg,rgba(21,87,160,0.88)_0%,rgba(10,52,104,0.94)_100%)]',
        'shadow-[0_4px_14px_rgba(16,64,128,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]',
        'hover:[background:linear-gradient(160deg,rgba(26,107,191,0.92)_0%,rgba(16,64,128,1)_100%)]',
        'hover:shadow-[0_6px_20px_rgba(16,64,128,0.45)] hover:-translate-y-px',
        'active:[background:linear-gradient(160deg,rgba(234,88,12,0.95)_0%,rgba(194,65,12,0.98)_100%)]!',
        'active:shadow-[0_2px_8px_rgba(234,88,12,0.4)] active:translate-y-0',
      ].join(' ')
    : [
        'bg-white/10 text-white border border-white/30 backdrop-blur-sm',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
        'hover:bg-white/20 hover:-translate-y-px',
        'active:!bg-orange-600/80 active:!border-orange-400/50 active:translate-y-0',
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

// ── External link hero button (for out-of-app URLs) ─────────
function ExternalHeroButton({ href, children, variant = 'secondary' }) {
  const cls = variant === 'primary'
    ? [
        'text-white border border-white/20 backdrop-blur-sm',
        '[background:linear-gradient(160deg,rgba(21,87,160,0.88)_0%,rgba(10,52,104,0.94)_100%)]',
        'shadow-[0_4px_14px_rgba(16,64,128,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]',
        'hover:[background:linear-gradient(160deg,rgba(26,107,191,0.92)_0%,rgba(16,64,128,1)_100%)]',
        'hover:shadow-[0_6px_20px_rgba(16,64,128,0.45)] hover:-translate-y-px',
      ].join(' ')
    : [
        'bg-white/10 text-white border border-white/30 backdrop-blur-sm',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
        'hover:bg-white/20 hover:-translate-y-px',
        'active:!bg-orange-600/80 active:!border-orange-400/50 active:translate-y-0',
      ].join(' ')

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        'inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg',
        'font-semibold text-base tracking-wide transition-all duration-200 active:scale-95',
        cls,
      ].join(' ')}
    >
      {children}
    </a>
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

// ── Meenakshi Gopuram Silhouette SVG (decorative) ──────────
function GopuramSilhouette({ size = 300, opacity = 0.08 }) {
  const h = Math.round(size * 1.5)
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 200 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ opacity }}
    >
      {/* Base platform */}
      <rect x="0" y="270" width="200" height="30" fill="white" rx="3"/>
      {/* Tier 1 — widest */}
      <rect x="22" y="232" width="156" height="38" fill="white" rx="2"/>
      <rect x="16" y="225" width="168" height="9" fill="white" rx="2"/>
      {/* Small decorative niches tier 1 */}
      <rect x="34" y="239" width="12" height="20" fill="white" opacity="0.3" rx="2"/>
      <rect x="94" y="239" width="12" height="20" fill="white" opacity="0.3" rx="2"/>
      <rect x="154" y="239" width="12" height="20" fill="white" opacity="0.3" rx="2"/>
      {/* Tier 2 */}
      <rect x="36" y="196" width="128" height="36" fill="white" rx="2"/>
      <rect x="30" y="189" width="140" height="9" fill="white" rx="2"/>
      <rect x="48" y="203" width="10" height="18" fill="white" opacity="0.3" rx="2"/>
      <rect x="95" y="203" width="10" height="18" fill="white" opacity="0.3" rx="2"/>
      <rect x="142" y="203" width="10" height="18" fill="white" opacity="0.3" rx="2"/>
      {/* Tier 3 */}
      <rect x="50" y="162" width="100" height="34" fill="white" rx="2"/>
      <rect x="44" y="155" width="112" height="9" fill="white" rx="2"/>
      <rect x="60" y="169" width="9" height="16" fill="white" opacity="0.3" rx="2"/>
      <rect x="96" y="169" width="9" height="16" fill="white" opacity="0.3" rx="2"/>
      <rect x="132" y="169" width="9" height="16" fill="white" opacity="0.3" rx="2"/>
      {/* Tier 4 */}
      <rect x="62" y="130" width="76" height="32" fill="white" rx="2"/>
      <rect x="57" y="123" width="86" height="9" fill="white" rx="2"/>
      <rect x="71" y="137" width="8" height="14" fill="white" opacity="0.3" rx="2"/>
      <rect x="96" y="137" width="8" height="14" fill="white" opacity="0.3" rx="2"/>
      <rect x="121" y="137" width="8" height="14" fill="white" opacity="0.3" rx="2"/>
      {/* Tier 5 */}
      <rect x="72" y="100" width="56" height="30" fill="white" rx="2"/>
      <rect x="68" y="93" width="64" height="9" fill="white" rx="2"/>
      <rect x="80" y="107" width="7" height="12" fill="white" opacity="0.3" rx="2"/>
      <rect x="97" y="107" width="7" height="12" fill="white" opacity="0.3" rx="2"/>
      <rect x="114" y="107" width="7" height="12" fill="white" opacity="0.3" rx="2"/>
      {/* Tier 6 */}
      <rect x="80" y="73" width="40" height="27" fill="white" rx="2"/>
      <rect x="76" y="66" width="48" height="9" fill="white" rx="2"/>
      <rect x="88" y="80" width="6" height="10" fill="white" opacity="0.3" rx="2"/>
      <rect x="107" y="80" width="6" height="10" fill="white" opacity="0.3" rx="2"/>
      {/* Tier 7 */}
      <rect x="86" y="49" width="28" height="24" fill="white" rx="2"/>
      <rect x="83" y="42" width="34" height="9" fill="white" rx="2"/>
      {/* Tier 8 — top */}
      <rect x="91" y="28" width="18" height="21" fill="white" rx="2"/>
      <rect x="89" y="21" width="22" height="9" fill="white" rx="1"/>
      {/* Kalasha finial */}
      <ellipse cx="100" cy="16" rx="9" ry="7" fill="white"/>
      <rect x="97" y="6" width="6" height="11" fill="white"/>
      <ellipse cx="100" cy="4" rx="5" ry="5" fill="white"/>
      <circle cx="100" cy="0" r="4" fill="white"/>
    </svg>
  )
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
      {/* Meenakshi Gopuram silhouette — right side, evokes Madurai identity */}
      <div className="absolute right-0 bottom-0 pointer-events-none select-none hidden md:block">
        <GopuramSilhouette size={290} opacity={0.09} />
      </div>
      {/* Decorative Ashoka Chakra — small, bottom left */}
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
            Live &middot; Corporation of Madurai &middot; Est. 1866 &middot; 100 Wards
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
          <p className="text-lg text-blue-100 leading-relaxed mb-2 max-w-xl">
            Preventive civic sanitation powered by real-time AI analysis.
            Citizens report, AI evaluates, municipalities act &mdash; restoring dignity
            and cleanliness to every ward in Madurai.
          </p>
          <p className="text-xs text-blue-300 mb-8 max-w-lg">
            An initiative of the Madurai City Municipal Corporation, Government of Tamil Nadu.
            &nbsp;&middot;&nbsp; Arignar Anna Maligai, Thallakulam, Madurai &mdash; 625 002.
            &nbsp;&middot;&nbsp;
            <a href="tel:+914522540333" className="underline hover:text-white">+91 452 2540333</a>
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mb-8">
            {[
              { icon: <HiCpuChip className="w-3.5 h-3.5" />, label: 'AI Waste Analysis' },
              { icon: <HiMapPin className="w-3.5 h-3.5" />, label: 'Live Heatmap' },
              { icon: <HiBolt className="w-3.5 h-3.5" />, label: 'Real-Time Dispatch' },
              { icon: <HiChartBar className="w-3.5 h-3.5" />, label: 'Predictive Hotspots' },
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
              <HiCamera className="w-5 h-5" aria-hidden="true" />
              Raise a Complaint
            </HeroButton>
            <HeroButton to="/login" variant="primary">
              <HiLockClosed className="w-5 h-5" aria-hidden="true" />
              Citizen Login
            </HeroButton>
            <ExternalHeroButton href="http://localhost:3000" variant="primary">
              <HiMicrophone className="w-5 h-5" aria-hidden="true" />
              Voice Bot
            </ExternalHeroButton>
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
            <HiCpuChip className="w-4 h-4" aria-hidden="true" />
            AI Triages Complaint
            <span aria-hidden="true"> → </span>
            Municipality Dispatches
            <span aria-hidden="true"> → </span>
            Cleanup Verified
            <HiCheckCircle className="w-4 h-4" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── AI IMPACT FEATURES SECTION ────────────────────────────────
const FEATURES = [
  {
    icon: <HiCpuChip className="w-6 h-6" />,
    title: 'AI Waste Analysis',
    description:
      'Deep-learning model classifies waste type, severity, and estimated volume from citizen-submitted photographs within seconds of upload.',
    accent: 'var(--color-gov-700)',
  },
  {
    icon: <HiMapPin className="w-6 h-6" />,
    title: 'Real-Time Heatmap Monitoring',
    description:
      'Geospatial density map of active complaints updates live — officers identify high-burden wards at a glance for priority dispatch.',
    accent: '#1557a0',
  },
  {
    icon: <HiSparkles className="w-6 h-6" />,
    title: 'Predictive Hotspot Detection',
    description:
      'Historical complaint patterns and seasonal data power a predictive model that flags zones likely to require intervention before escalation.',
    accent: '#7c3aed',
  },
  {
    icon: <HiTruck className="w-6 h-6" />,
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
    icon: <HiCamera className="w-5 h-5" />,
    title: 'Citizen Files Complaint',
    description:
      'A resident photographs the waste site, pins the GPS location, and submits via the M-Clean portal or mobile PWA.',
  },
  {
    step: 2,
    icon: <HiCpuChip className="w-5 h-5" />,
    title: 'AI Analyses the Waste',
    description:
      'Vision AI classifies waste category and severity. A priority score is assigned and the complaint is auto-tagged for the right ward officer.',
  },
  {
    step: 3,
    icon: <HiTruck className="w-5 h-5" />,
    title: 'Municipality Dispatches Crew',
    description:
      'The officer dashboard surfaces high-priority complaints. Crew routes are optimised via the Workforce Panel and dispatched immediately.',
  },
  {
    step: 4,
    icon: <HiCheckCircle className="w-5 h-5" />,
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
          className="inline-block mb-4" aria-hidden="true"
          style={{ color: 'var(--color-saffron)', filter: 'drop-shadow(0 2px 8px rgba(255,153,51,0.4))' }}
        >
          <HiSparkles className="w-10 h-10 mx-auto" />
        </span>
        <h2
          id="cta-heading"
          className="text-2xl md:text-3xl font-extrabold text-white mb-4 leading-tight"
        >
          Make Madurai Cleaner — One Report at a Time
        </h2>
        <p className="text-blue-200 text-sm md:text-base mb-2 max-w-lg mx-auto leading-relaxed">
          Your complaint takes 30 seconds to file. Our AI handles the rest —
          analysis, dispatch, and verified cleanup. Join thousands of active citizens.
        </p>
        <p className="text-xs text-blue-400 mb-8">
          Official AI sanitation portal of the Corporation of Madurai, Tamil Nadu &mdash;
          <a href="https://maduraicorporation.co.in" target="_blank" rel="noopener noreferrer"
            className="underline hover:text-white ml-1">maduraicorporation.co.in</a>
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <Link
            to="/report"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg font-bold text-base tracking-wide transition-all duration-200 active:scale-95 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            style={{ background: 'var(--color-saffron)', color: 'white' }}
          >
            <HiCamera className="w-5 h-5" aria-hidden="true" />
            Raise a Complaint Now
          </Link>

        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-blue-300">
          {[
            { icon: <HiBolt className="w-3.5 h-3.5" />, label: 'Powered by Google Firebase' },
            { icon: <HiMapPin className="w-3.5 h-3.5" />, label: 'Google Maps Platform' },
            { icon: <HiCpuChip className="w-3.5 h-3.5" />, label: 'Vertex AI · Vision API' },
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

// ── STAT HIGHLIGHT TICKER (narrow band above CTA) ─────────────
function StatTicker({ stats }) {
  if (stats.loading || stats.total === 0) return null

  const items = [
    `${stats.total.toLocaleString('en-IN')} complaints registered`,
    `${stats.cleared.toLocaleString('en-IN')} cleanups verified`,
    `${stats.rate}% clearance rate`,
    `${stats.pending.toLocaleString('en-IN')} complaints pending`,
    'Corporation of Madurai · Est. 1866',
    '100 Wards · 147.99 Sq.Km · 5 Zones',
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

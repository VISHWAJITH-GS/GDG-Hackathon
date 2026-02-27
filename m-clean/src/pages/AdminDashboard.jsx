// src/pages/AdminDashboard.jsx
// ---------------------------------------------------------------
// Municipality / Admin dashboard — /admin/dashboard
//
// Features:
//   • Real-time complaint feed (all reports)
//   • Filter by status + text search
//   • Complaint detail modal with full metadata
//   • Dispatch Team — sets status="dispatched", assigned_to, dispatched_at
//   • Status change (pending → analyzing → dispatched → cleared)
//   • Supports role "admin" AND "municipality"
// ---------------------------------------------------------------

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, query, onSnapshot, orderBy,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { HiInboxArrowDown } from 'react-icons/hi2'
import { awardPointsForClear } from '../utils/pointsService'

const STATUS_TABS = ['all', 'pending', 'analyzing', 'dispatched', 'cleared']

const STATUS_COLORS = {
  pending:    { bg: 'bg-amber-100',  text: 'text-amber-800',  dot: 'bg-amber-400'  },
  analyzing:  { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-400'   },
  dispatched: { bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-400' },
  cleared:    { bg: 'bg-emerald-100',text: 'text-emerald-800',dot: 'bg-emerald-400' },
}

function fmt(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-pulse">
      <div className="h-40 bg-slate-200" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-slate-200 rounded w-1/3" />
        <div className="h-3 bg-slate-100 rounded w-2/3" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
        <div className="h-8 bg-slate-100 rounded mt-3" />
      </div>
    </div>
  )
}

// ── Complaint Card ────────────────────────────────────────────
function ReportCard({ report, onOpen }) {
  const sc = STATUS_COLORS[report.status] ?? STATUS_COLORS.pending
  return (
    <div
      onClick={() => onOpen(report)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpen(report)}
      className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden
                 hover:shadow-md hover:border-[#104080]/30 transition-all duration-200 cursor-pointer group"
    >
      {/* Image */}
      {report.image_url ? (
        <img
          src={report.image_url}
          alt={`Complaint: ${report.waste_type ?? 'Unknown type'}`}
          className="w-full h-40 object-cover group-hover:brightness-95 transition"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-40 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
          <span className="text-4xl opacity-40">🗑️</span>
        </div>
      )}

      <div className="p-4 space-y-2">
        {/* Status + type */}
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${sc.bg} ${sc.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
            {report.status ?? 'pending'}
          </span>
          <span className="text-xs text-slate-500 capitalize truncate">{report.waste_type ?? '—'}</span>
        </div>

        {/* Location */}
        {report.address && (
          <p className="text-xs text-slate-600 line-clamp-1 leading-relaxed">
            📍 {report.address}
          </p>
        )}

        {/* Assigned team */}
        {report.assigned_to && (
          <p className="text-xs text-purple-700 font-medium truncate">
            👷 {report.assigned_to}
          </p>
        )}

        {/* Date */}
        <p className="text-xs text-slate-400">{fmt(report.created_at)}</p>

        {/* Open detail hint */}
        <p className="text-xs text-[#104080] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
          Click to view details →
        </p>
      </div>
    </div>
  )
}

// ── Detail Modal ──────────────────────────────────────────────
function DetailModal({ report, onClose, onStatusChange, onDispatch }) {
  const overlayRef  = useRef(null)
  const [teamInput, setTeamInput]    = useState(report.assigned_to ?? '')
  const [dispatching, setDispatching] = useState(false)
  const [statusBusy,  setStatusBusy]  = useState(false)
  const [dispatchDone, setDispatchDone] = useState(false)

  // Close on overlay click
  function handleOverlay(e) {
    if (e.target === overlayRef.current) onClose()
  }
  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleDispatch() {
    if (!teamInput.trim()) return
    setDispatching(true)
    try {
      await onDispatch(report.id, teamInput.trim())
      setDispatchDone(true)
    } finally {
      setDispatching(false)
    }
  }

  async function changeStatus(newStatus) {
    setStatusBusy(true)
    try { await onStatusChange(report.id, newStatus) }
    finally { setStatusBusy(false) }
  }

  const sc = STATUS_COLORS[report.status] ?? STATUS_COLORS.pending

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlay}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4, 17, 31, 0.7)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Complaint details"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">

        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-[#0a2240]">Complaint Details</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{report.id}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Image */}
          {report.image_url && (
            <img
              src={report.image_url}
              alt="Complaint"
              className="w-full h-56 object-cover rounded-xl border border-slate-200"
            />
          )}

          {/* Status + type row */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold capitalize ${sc.bg} ${sc.text}`}>
              <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
              {report.status ?? 'pending'}
            </span>
            <span className="rounded-full bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1 capitalize">
              {report.waste_type ?? 'Unknown type'}
            </span>
            {report.severity && (
              <span className="rounded-full bg-red-50 text-red-700 text-xs font-semibold px-3 py-1 capitalize">
                Severity: {report.severity}
              </span>
            )}
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <MetaRow icon="📍" label="Location" value={report.address ?? '—'} />
            <MetaRow icon="📅" label="Reported" value={fmt(report.created_at)} />
            <MetaRow icon="🔄" label="Updated" value={fmt(report.updated_at)} />
            <MetaRow icon="👤" label="Citizen UID" value={report.created_by ?? '—'} mono />
            {report.assigned_to && (
              <MetaRow icon="👷" label="Assigned Team" value={report.assigned_to} />
            )}
            {report.dispatched_at && (
              <MetaRow icon="🚛" label="Dispatched At" value={fmt(report.dispatched_at)} />
            )}
            {report.description && (
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</p>
                <p className="text-slate-700 text-sm leading-relaxed bg-slate-50 rounded-lg p-3 border border-slate-200">
                  {report.description}
                </p>
              </div>
            )}
          </div>

          {/* ── Status change ── */}
          <div>
            <p className="text-xs font-bold text-[#0a2240] uppercase tracking-wider mb-2">
              Change Status
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_TABS.slice(1).map(s => {
                const c = STATUS_COLORS[s]
                const active = report.status === s
                return (
                  <button
                    key={s}
                    disabled={statusBusy || active}
                    onClick={() => changeStatus(s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-all
                      ${active
                        ? `${c.bg} ${c.text} ring-2 ring-offset-1 ring-current`
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50'
                      }`}
                  >
                    {statusBusy && active ? '…' : s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Dispatch Team ── */}
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <p className="text-xs font-bold text-purple-900 uppercase tracking-wider mb-3">
              🚛 Dispatch Team
            </p>

            {dispatchDone ? (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 font-semibold flex items-center gap-2">
                <span>✅</span>
                <span>Team "{teamInput}" dispatched successfully.</span>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={teamInput}
                    onChange={e => setTeamInput(e.target.value)}
                    placeholder="Enter team name or officer ID…"
                    className="flex-1 rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-slate-400 transition"
                  />
                  <button
                    onClick={handleDispatch}
                    disabled={dispatching || !teamInput.trim()}
                    className="rounded-lg bg-purple-700 hover:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed
                               text-white text-xs font-bold px-4 py-2 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {dispatching ? (
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : '🚛'} Dispatch
                  </button>
                </div>
                <p className="text-xs text-purple-600 mt-2">
                  This will set status → <strong>dispatched</strong>, record the team name and timestamp.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaRow({ icon, label, value, mono }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-slate-800 leading-snug ${mono ? 'font-mono text-xs' : ''}`}>
        {icon} {value}
      </p>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────
export default function AdminDashboard() {
  const { userDoc } = useAuth()
  const navigate    = useNavigate()

  const [complaints,  setComplaints]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('all')
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(null)   // currently open report

  // Real-time feed for ALL reports
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('created_at', 'desc'))
    const unsub = onSnapshot(
      q,
      snap => {
        setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsub
  }, [])

  // Keep modal in sync with live data
  useEffect(() => {
    if (selected) {
      const fresh = complaints.find(c => c.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [complaints]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await signOut(auth)
    navigate('/admin', { replace: true })
  }

  async function handleStatusChange(reportId, newStatus) {
    await updateDoc(doc(db, 'reports', reportId), {
      status:     newStatus,
      updated_at: serverTimestamp(),
    })

    // Award points when complaint is cleared — idempotent, safe to call every time
    if (newStatus === 'cleared') {
      const report = complaints.find(c => c.id === reportId)
      if (report?.created_by) {
        await awardPointsForClear(reportId, report.created_by)
      }
    }
  }

  const handleDispatch = useCallback(async (reportId, teamName) => {
    await updateDoc(doc(db, 'reports', reportId), {
      status:        'dispatched',
      assigned_to:   teamName,
      dispatched_at: serverTimestamp(),
      updated_at:    serverTimestamp(),
    })
  }, [])

  // Filter + search
  const filtered = useMemo(() => {
    let list = activeTab === 'all'
      ? complaints
      : complaints.filter(c => c.status === activeTab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.waste_type?.toLowerCase().includes(q) ||
        c.assigned_to?.toLowerCase().includes(q) ||
        c.created_by?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q),
      )
    }
    return list
  }, [complaints, activeTab, search])

  const stats = STATUS_TABS.slice(1).map(s => ({
    status: s,
    count: complaints.filter(c => c.status === s).length,
  }))

  const roleBadge = userDoc?.role === 'municipality'
    ? { label: 'Municipality Officer', color: 'bg-blue-500/20 text-blue-200 ring-blue-400/30' }
    : { label: 'Admin', color: 'bg-[#FF9933]/20 text-[#FF9933] ring-[#FF9933]/30' }

  return (
    <div className="min-h-screen bg-[#f0f4f8]">

      {/* ── Top bar ── */}
      <header className="bg-[#0a2240] text-white shadow-md sticky top-0 z-30">
        <div className="flex h-1">
          <div className="flex-1" style={{ background: '#FF9933' }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: '#138808' }} />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs opacity-60 uppercase tracking-wider font-medium">Aqro  · Municipality Control Panel</p>
            <h1 className="text-sm sm:text-base font-bold leading-tight">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {userDoc?.name && (
              <span className="hidden sm:block text-sm opacity-75 truncate max-w-[120px]">
                {userDoc.name}
              </span>
            )}
            <span className={`rounded-full text-xs font-bold px-2.5 py-0.5 ring-1 whitespace-nowrap ${roleBadge.color}`}>
              {roleBadge.label}
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold
                         px-3 py-1.5 ring-1 ring-white/20 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Stats row ── */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(({ status, count }) => {
            const c = STATUS_COLORS[status]
            return (
              <button
                key={status}
                onClick={() => setActiveTab(status)}
                className={`rounded-xl shadow-sm border px-4 py-4 flex flex-col gap-1.5 text-left transition-all
                  ${activeTab === status
                    ? 'border-[#104080] bg-[#0a2240] text-white shadow-md'
                    : 'bg-white border-slate-200 hover:border-[#104080]/40'
                  }`}
              >
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold capitalize
                  ${activeTab === status ? 'bg-white/20 text-white' : `${c.bg} ${c.text}`}`}>
                  {status}
                </span>
                <span className={`text-2xl font-extrabold mt-1 ${activeTab === status ? 'text-white' : 'text-[#0a2240]'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </section>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex flex-wrap gap-1.5 flex-1">
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-[#0a2240] text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                {tab}
                {tab !== 'all' && (
                  <span className="ml-1 opacity-60">
                    ({complaints.filter(c => c.status === tab).length})
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search type, team, location…"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm w-full sm:w-60
                       focus:outline-none focus:ring-2 focus:ring-[#104080] placeholder:text-slate-400 transition"
          />
        </div>

        {/* Count */}
        <p className="text-xs text-slate-500 -mt-2">
          Showing{' '}
          <strong className="text-[#0a2240]">{filtered.length}</strong>
          {' '}of{' '}
          <strong className="text-[#0a2240]">{complaints.length}</strong> total complaints
        </p>

        {/* ── Grid ── */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
            <HiInboxArrowDown className="w-12 h-12 mx-auto mb-3 text-slate-300" aria-hidden="true" />
            <p className="font-semibold text-slate-600">No complaints found</p>
            <p className="text-sm mt-1">
              {search
                ? 'Try clearing the search filter.'
                : `No complaints with status "${activeTab}".`}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                onOpen={setSelected}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Detail Modal ── */}
      {selected && (
        <DetailModal
          report={selected}
          onClose={() => setSelected(null)}
          onStatusChange={handleStatusChange}
          onDispatch={handleDispatch}
        />
      )}
    </div>
  )
}

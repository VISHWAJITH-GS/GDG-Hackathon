// src/pages/AdminDashboard.jsx
// ---------------------------------------------------------------
// Admin-facing dashboard:
//   • View all complaints across all citizens
//   • Filter by status
//   • Change status → updates Firestore
//   • Assign workforce → updates assigned_to field
// ---------------------------------------------------------------

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, query, onSnapshot, orderBy,
  doc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { auth, db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import ComplaintCard from '../components/ComplaintCard'
import StatusBadge from '../components/StatusBadge'

const STATUS_TABS = ['all', 'pending', 'analyzing', 'dispatched', 'cleared']

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-pulse">
      <div className="h-44 bg-slate-200" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-slate-200 rounded w-1/3" />
        <div className="h-3 bg-slate-100 rounded w-2/3" />
        <div className="h-3 bg-slate-100 rounded w-1/2" />
        <div className="h-8 bg-slate-100 rounded mt-3" />
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { userDoc } = useAuth()
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState('all')
  const [search,     setSearch]     = useState('')

  // Real-time listener for ALL reports
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('created_at', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  async function handleSignOut() {
    await signOut(auth)
    navigate('/login', { replace: true })
  }

  async function handleStatusChange(reportId, newStatus) {
    await updateDoc(doc(db, 'reports', reportId), {
      status:     newStatus,
      updated_at: serverTimestamp(),
    })
  }

  async function handleAssign(reportId, teamName) {
    await updateDoc(doc(db, 'reports', reportId), {
      assigned_to: teamName,
      updated_at:  serverTimestamp(),
    })
  }

  // Filter + search
  const filtered = useMemo(() => {
    let list = activeTab === 'all' ? complaints : complaints.filter(c => c.status === activeTab)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.waste_type?.toLowerCase().includes(q) ||
        c.assigned_to?.toLowerCase().includes(q) ||
        c.created_by?.toLowerCase().includes(q),
      )
    }
    return list
  }, [complaints, activeTab, search])

  // Stats
  const stats = STATUS_TABS.slice(1).map(s => ({
    status: s,
    count: complaints.filter(c => c.status === s).length,
  }))

  return (
    <div className="min-h-screen bg-[#f0f4f8]">

      {/* Top bar */}
      <header className="bg-[#0a2240] text-white shadow-md">
        <div className="flex h-1">
          <div className="flex-1" style={{ background: '#FF9933' }} />
          <div className="flex-1 bg-white" />
          <div className="flex-1" style={{ background: '#138808' }} />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs opacity-70 uppercase tracking-wider">M-Clean Portal</p>
            <h1 className="text-base font-bold leading-tight">Admin Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm opacity-80">{userDoc?.name}</span>
            <span className="rounded-full bg-[#FF9933]/20 text-[#FF9933] text-xs font-bold px-2.5 py-0.5 ring-1 ring-[#FF9933]/30">
              Admin
            </span>
            <button onClick={handleSignOut}
              className="rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold
                         px-3 py-1.5 ring-1 ring-white/20 transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Stats */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map(({ status, count }) => (
            <div key={status}
              className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-4 flex flex-col gap-1.5">
              <StatusBadge status={status} />
              <span className="text-2xl font-bold text-[#0a2240] mt-1">{count}</span>
            </div>
          ))}
        </section>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Status filters */}
          <div className="flex flex-wrap gap-1.5 flex-1">
            {STATUS_TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${activeTab === tab
                  ? 'bg-[#0a2240] text-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'}`}>
                {tab}
                {tab !== 'all' && (
                  <span className="ml-1 opacity-60">
                    ({complaints.filter(c => c.status === tab).length})
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Search */}
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by type, team, UID…"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-full sm:w-56
                       focus:outline-none focus:ring-2 focus:ring-[#104080] placeholder:text-slate-400 transition bg-white"
          />
        </div>

        {/* Total count */}
        <p className="text-xs text-slate-500">
          Showing <strong className="text-[#0a2240]">{filtered.length}</strong> of{' '}
          <strong className="text-[#0a2240]">{complaints.length}</strong> total complaints
        </p>

        {/* Grid */}
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
            <p className="text-4xl mb-3">📭</p>
            <p className="font-semibold text-slate-600">No complaints found</p>
            <p className="text-sm mt-1">
              {search ? 'Try clearing the search filter.' : `No complaints with status "${activeTab}".`}
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(report => (
              <ComplaintCard
                key={report.id}
                report={report}
                isAdmin={true}
                onStatusChange={handleStatusChange}
                onAssign={handleAssign}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

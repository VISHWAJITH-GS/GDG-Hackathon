// src/pages/OfficerDashboard.jsx
// ----------------------------------------------------------------
// Officer Dashboard — Government portal style.
// Displays grievances in an official card+table hybrid layout.
// Status workflow: Pending → In Progress → Resolved
// ----------------------------------------------------------------

import { useState } from 'react'
import Badge from '../components/Badge'

// ── Seed data ─────────────────────────────────────────────────
const SEED_REPORTS = [
    {
        id: 'MCL-2026-10001',
        location: 'MG Road, Near Public Park',
        ward: 'Ward 07',
        category: 'Garbage / Solid Waste',
        description: 'Large pile of garbage dumped on the footpath blocking pedestrian access.',
        imageUrl: null,
        status: 'pending',
        submittedAt: Date.now() - 1000 * 60 * 60 * 2,
    },
    {
        id: 'MCL-2026-10002',
        location: 'Sector 12 Bus Stand',
        ward: 'Ward 12',
        category: 'Drainage / Sewage Overflow',
        description: 'Broken bins overflowing with waste every morning causing health hazard.',
        imageUrl: null,
        status: 'inprogress',
        submittedAt: Date.now() - 1000 * 60 * 60 * 24,
    },
    {
        id: 'MCL-2026-10003',
        location: 'Gandhi Nagar, Block C',
        ward: 'Ward 03',
        category: 'Stagnant Water / Waterlogging',
        description: 'Stagnant water and waste accumulation near the drainage channel.',
        imageUrl: null,
        status: 'pending',
        submittedAt: Date.now() - 1000 * 60 * 30,
    },
    {
        id: 'MCL-2026-10004',
        location: 'Old Market Street',
        ward: 'Ward 05',
        category: 'Illegal Dumping',
        description: 'Vegetable vendors leaving organic waste on the road every evening.',
        imageUrl: null,
        status: 'resolved',
        submittedAt: Date.now() - 1000 * 60 * 60 * 48,
    },
    {
        id: 'MCL-2026-10005',
        location: 'Lake View Road',
        ward: 'Ward 09',
        category: 'Illegal Dumping',
        description: 'Illegal dumping of construction debris near the lake shore.',
        imageUrl: null,
        status: 'pending',
        submittedAt: Date.now() - 1000 * 60 * 10,
    },
]

const FILTERS = [
    { key: 'all', label: 'All Complaints' },
    { key: 'pending', label: 'Pending' },
    { key: 'inprogress', label: 'In Progress' },
    { key: 'resolved', label: 'Resolved' },
]

const NEXT_STATUS = {
    pending: 'inprogress',
    inprogress: 'resolved',
}

const NEXT_LABEL = {
    pending: 'Mark In Progress',
    inprogress: 'Mark Resolved',
}

// Format date to Indian standard
function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    })
}
function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit',
    })
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, count, icon, accent }) {
    return (
        <div
            className="stat-card flex items-center gap-4"
            style={{ borderTopColor: accent }}
        >
            <div
                className="w-11 h-11 rounded flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: `${accent}18` }}
            >
                {icon}
            </div>
            <div>
                <p className="text-2xl font-bold text-[var(--color-gov-900)]">{count}</p>
                <p className="text-xs text-[var(--color-muted)] font-medium mt-0.5">{label}</p>
            </div>
        </div>
    )
}

// ── Row component ─────────────────────────────────────────────
function GrievanceRow({ report, onStatusChange, idx }) {
    const { id, location, ward, category, status, submittedAt } = report
    return (
        <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}>
            {/* Ref # */}
            <td className="px-4 py-3 text-xs font-mono text-[var(--color-gov-700)] whitespace-nowrap">
                {id}
            </td>
            {/* Location */}
            <td className="px-4 py-3 text-sm">
                <p className="font-semibold text-[var(--color-text)]">{location}</p>
                <p className="text-xs text-[var(--color-muted)]">{ward}</p>
            </td>
            {/* Category */}
            <td className="px-4 py-3 text-xs text-[var(--color-text-soft)] hidden sm:table-cell">
                {category}
            </td>
            {/* Date */}
            <td className="px-4 py-3 text-xs text-[var(--color-muted)] whitespace-nowrap hidden md:table-cell">
                <p>{fmtDate(submittedAt)}</p>
                <p>{fmtTime(submittedAt)}</p>
            </td>
            {/* Status */}
            <td className="px-4 py-3">
                <Badge status={status} />
            </td>
            {/* Action */}
            <td className="px-4 py-3 text-right">
                {status !== 'resolved' ? (
                    <button
                        onClick={() => onStatusChange(id, NEXT_STATUS[status])}
                        className="btn-gov-outline text-xs px-3 py-1.5"
                    >
                        {NEXT_LABEL[status]}
                    </button>
                ) : (
                    <span className="text-xs text-[var(--color-tri-green)] font-semibold">✔ Closed</span>
                )}
            </td>
        </tr>
    )
}

// ── Dashboard page ────────────────────────────────────────────
export default function OfficerDashboard() {
    const [reports, setReports] = useState(SEED_REPORTS)
    const [activeFilter, setActiveFilter] = useState('all')

    const counts = reports.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1
        return acc
    }, {})

    const handleStatusChange = (id, newStatus) => {
        setReports((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
        )
        // TODO: await updateDoc(doc(db, 'reports', id), { status: newStatus })
    }

    const visible =
        activeFilter === 'all'
            ? reports
            : reports.filter((r) => r.status === activeFilter)

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

            {/* Page meta header */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-[var(--color-gov-900)]">
                        Grievance Management Dashboard
                    </h1>
                    <p className="text-sm text-[var(--color-muted)] mt-0.5">
                        Sanitation &amp; Cleanliness Complaints &mdash; Logged till {fmtDate(Date.now())}
                    </p>
                </div>
                <button className="btn-gov self-start sm:self-auto text-sm">
                    ⬇ Export Report
                </button>
            </div>

            {/* ── Statistics ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
                <StatCard label="Total Complaints" count={reports.length} icon="📋" accent="#104080" />
                <StatCard label="Pending" count={counts.pending ?? 0} icon="🕐" accent="#D97706" />
                <StatCard label="In Progress" count={counts.inprogress ?? 0} icon="🔄" accent="#1D4ED8" />
                <StatCard label="Resolved" count={counts.resolved ?? 0} icon="✅" accent="#166534" />
            </div>

            {/* ── Filter + table card ── */}
            <div className="gov-card overflow-hidden">
                {/* Card header with filter tabs */}
                <div className="flex items-center justify-between flex-wrap gap-2
                        bg-[var(--color-gov-800)] px-5 py-3">
                    <p className="text-white font-semibold text-sm tracking-wide">
                        Grievance Register
                    </p>
                    <div className="flex gap-1 flex-wrap">
                        {FILTERS.map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setActiveFilter(key)}
                                className={[
                                    'px-3 py-1 rounded text-xs font-semibold transition-colors duration-150',
                                    activeFilter === key
                                        ? 'bg-[var(--color-saffron)] text-white'
                                        : 'bg-white/10 text-blue-100 hover:bg-white/20',
                                ].join(' ')}
                            >
                                {label}
                                {key !== 'all' && counts[key]
                                    ? <span className="ml-1 opacity-75">({counts[key]})</span>
                                    : null}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                {visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                        <span className="text-4xl">📭</span>
                        <p className="text-[var(--color-muted)] text-sm">
                            No complaints found under this filter.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--color-border)] bg-[var(--color-gov-50)]">
                                    {['Reference No.', 'Location / Ward', 'Category', 'Date & Time', 'Status', 'Action'].map((h) => (
                                        <th
                                            key={h}
                                            className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider
                                 text-[var(--color-gov-800)]"
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {visible.map((report, idx) => (
                                    <GrievanceRow
                                        key={report.id}
                                        report={report}
                                        onStatusChange={handleStatusChange}
                                        idx={idx}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Table footer */}
                <div className="bg-[var(--color-gov-50)] border-t border-[var(--color-border)]
                        px-5 py-2.5 flex items-center justify-between text-xs text-[var(--color-muted)]">
                    <span>Showing {visible.length} of {reports.length} records</span>
                    <span>Last refreshed: {fmtDate(Date.now())}, {fmtTime(Date.now())}</span>
                </div>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-[var(--color-muted)] mt-4 text-center">
                This portal is for authorised government officers only. Unauthorised access is a
                punishable offence under the Information Technology Act, 2000.
            </p>
        </div>
    )
}

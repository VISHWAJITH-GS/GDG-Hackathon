// src/components/Badge.jsx
// -------------------------------------------------------
// Status badge — government portal style.
// Solid bordered pill with official colour coding.
// Note: React requires style as an object, not a string.
// -------------------------------------------------------

const STATUS_MAP = {
    pending: {
        label: 'Pending',
        style: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' },
    },
    inprogress: {
        label: 'In Progress',
        style: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #93C5FD' },
    },
    resolved: {
        label: 'Resolved',
        style: { background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' },
    },
    rejected: {
        label: 'Rejected',
        style: { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' },
    },
}

export default function Badge({ status = 'pending' }) {
    const { label, style } = STATUS_MAP[status] ?? STATUS_MAP.pending
    return (
        <span
            style={style}
            className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
        >
            {label}
        </span>
    )
}

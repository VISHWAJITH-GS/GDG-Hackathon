// src/components/ReportCard.jsx
// ----------------------------------------------------------
// Card used in the Officer Dashboard to display a single
// cleanliness report.  Accepts a `report` prop and an
// `onStatusChange` callback.
// ----------------------------------------------------------

import Badge from './Badge'
import Button from './Button'

// Officers can cycle through these statuses
const NEXT_STATUS = {
    pending: 'inprogress',
    inprogress: 'resolved',
    resolved: 'resolved',   // already terminal
}

export default function ReportCard({ report, onStatusChange }) {
    const {
        id,
        location = 'Unknown location',
        description = '',
        imageUrl,
        status = 'pending',
        submittedAt,
    } = report

    return (
        <article className="glass rounded-2xl overflow-hidden flex flex-col group transition-transform duration-200 hover:-translate-y-0.5">
            {/* Photo */}
            {imageUrl ? (
                <div className="relative h-44 overflow-hidden bg-slate-800">
                    <img
                        src={imageUrl}
                        alt={`Report from ${location}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                </div>
            ) : (
                /* Placeholder when no image is available */
                <div className="h-44 bg-slate-800 flex items-center justify-center text-5xl select-none">
                    🗑️
                </div>
            )}

            {/* Body */}
            <div className="flex flex-col gap-3 p-4 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="font-semibold text-slate-100 text-sm leading-tight">
                            {location}
                        </p>
                        {submittedAt && (
                            <p className="text-xs text-slate-500 mt-0.5">
                                {new Date(submittedAt).toLocaleDateString('en-IN', {
                                    day: 'numeric', month: 'short', year: 'numeric',
                                })}
                            </p>
                        )}
                    </div>
                    <Badge status={status} />
                </div>

                {description && (
                    <p className="text-slate-400 text-sm line-clamp-2">{description}</p>
                )}

                {/* Action — advance to next status */}
                {status !== 'resolved' && onStatusChange && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-auto self-start"
                        onClick={() => onStatusChange(id, NEXT_STATUS[status])}
                    >
                        Mark as {NEXT_STATUS[status] === 'inprogress' ? 'In Progress' : 'Resolved'}
                    </Button>
                )}
            </div>
        </article>
    )
}

// src/components/Heatmap.jsx
// ---------------------------------------------------------------
// Waste-report heatmap for the Officer Dashboard.
//
// Flow:
//   1. Load Google Maps JS API (+ visualization library) dynamically.
//   2. Open a Firestore real-time listener on the "reports" collection.
//   3. Extract lat/lng from each document and build a HeatmapLayer.
//   4. Re-render the layer whenever Firestore reports a change.
//   5. Show "Total reports today" stat card above the map.
//
// Environment variable:
//   VITE_GOOGLE_MAPS_API_KEY  — set in .env (never commit real keys)
// ---------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from 'react'
import { db } from '../firebase'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Replace with your own key or set VITE_GOOGLE_MAPS_API_KEY in .env
const MAPS_API_KEY =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? 'YOUR_GOOGLE_MAPS_API_KEY'

// Madurai city centre coordinates
const MADURAI_CENTER = { lat: 9.9252, lng: 78.1198 }
const DEFAULT_ZOOM = 13

// Firestore collection that holds waste reports
const REPORTS_COLLECTION = 'reports'

// Script tag id — prevents duplicate injection
const MAPS_SCRIPT_ID = 'google-maps-script'

// ---------------------------------------------------------------------------
// Utility: Dynamically load the Maps JS API (idempotent)
// ---------------------------------------------------------------------------
function loadMapsScript() {
    return new Promise((resolve, reject) => {
        // Already loaded
        if (window.google?.maps) {
            resolve()
            return
        }
        // Script tag already injected but still loading
        if (document.getElementById(MAPS_SCRIPT_ID)) {
            const existing = document.getElementById(MAPS_SCRIPT_ID)
            existing.addEventListener('load', resolve)
            existing.addEventListener('error', reject)
            return
        }

        const script = document.createElement('script')
        script.id = MAPS_SCRIPT_ID
        script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_API_KEY}&libraries=visualization`
        script.async = true
        script.defer = true
        script.onload = resolve
        script.onerror = () => reject(new Error('Failed to load Google Maps API'))
        document.head.appendChild(script)
    })
}

// ---------------------------------------------------------------------------
// Utility: Is a timestamp from today (IST)?
// ---------------------------------------------------------------------------
function isToday(ts) {
    if (!ts) return false
    const date = ts.toDate ? ts.toDate() : new Date(ts)
    const now = new Date()
    return (
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
    )
}

// ---------------------------------------------------------------------------
// Sub-component: Stat card
// ---------------------------------------------------------------------------
function StatCard({ label, value, accent = 'var(--color-gov-700)', icon }) {
    return (
        <div
            className="stat-card flex items-center gap-4"
            style={{ borderTopColor: accent }}
        >
            {icon && (
                <span
                    className="text-2xl flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full"
                    style={{ background: `${accent}18` }}
                    aria-hidden="true"
                >
                    {icon}
                </span>
            )}
            <div>
                <p className="text-xs font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--color-muted)' }}>
                    {label}
                </p>
                <p className="text-2xl font-bold mt-0.5"
                    style={{ color: 'var(--color-text)' }}>
                    {value}
                </p>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Sub-component: Status badge (for the live-feed legend)
// ---------------------------------------------------------------------------
function LiveBadge() {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ background: '#dcfce7', color: '#166534' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            LIVE
        </span>
    )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Heatmap() {
    const mapContainerRef = useRef(null)   // DOM node for the map
    const mapRef = useRef(null)            // google.maps.Map instance
    const heatmapRef = useRef(null)        // google.maps.visualization.HeatmapLayer
    const markersRef = useRef([])          // individual markers (optional)

    const [mapsReady, setMapsReady] = useState(false)
    const [mapsError, setMapsError] = useState(null)
    const [reports, setReports] = useState([])      // all Firestore docs
    const [firestoreError, setFirestoreError] = useState(null)
    const [loading, setLoading] = useState(true)

    // ------------------------------------------------------------------
    // Step 1 — Load Google Maps JS API on mount
    // ------------------------------------------------------------------
    useEffect(() => {
        loadMapsScript()
            .then(() => setMapsReady(true))
            .catch((err) => setMapsError(err.message))
    }, [])

    // ------------------------------------------------------------------
    // Step 2 — Initialise the Map once the API is ready
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!mapsReady || !mapContainerRef.current) return

        mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
            center: MADURAI_CENTER,
            zoom: DEFAULT_ZOOM,
            mapTypeId: 'roadmap',
            // Subtle style — desaturated to make heat colours pop
            styles: [
                { elementType: 'geometry', stylers: [{ saturation: -30 }] },
                { featureType: 'poi', stylers: [{ visibility: 'off' }] },
                {
                    featureType: 'transit',
                    elementType: 'labels.icon',
                    stylers: [{ visibility: 'off' }],
                },
            ],
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
        })

        // Create an empty HeatmapLayer — data will be set by the Firestore listener
        heatmapRef.current = new window.google.maps.visualization.HeatmapLayer({
            data: [],
            map: mapRef.current,
            radius: 35,
            opacity: 0.75,
            gradient: [
                'rgba(0, 128, 0, 0)',    // transparent (no data)
                'rgba(0, 200, 0, 1)',    // green  (mild)
                'rgba(255, 165, 0, 1)',  // orange (moderate)
                'rgba(255, 69, 0, 1)',   // red-orange
                'rgba(220, 38, 38, 1)',  // red    (severe)
                'rgba(127, 0, 0, 1)',    // dark red (critical)
            ],
        })
    }, [mapsReady])

    // ------------------------------------------------------------------
    // Step 3 — Update heatmap whenever reports change
    // ------------------------------------------------------------------
    const refreshHeatmap = useCallback((docs) => {
        if (!heatmapRef.current || !window.google?.maps) return

        const points = docs
            .filter((r) => r.lat != null && r.lng != null)
            .map((r) => ({
                location: new window.google.maps.LatLng(r.lat, r.lng),
                // Weight by severity_score if available (1–10), otherwise 1
                weight: r.severity ?? 1,
            }))

        heatmapRef.current.setData(points)
    }, [])

    useEffect(() => {
        refreshHeatmap(reports)
    }, [reports, refreshHeatmap, mapsReady])

    // ------------------------------------------------------------------
    // Step 4 — Firestore real-time listener (auto-updates on new reports)
    // ------------------------------------------------------------------
    useEffect(() => {
        setLoading(true)

        const q = query(
            collection(db, REPORTS_COLLECTION),
            orderBy('metadata.processed_at', 'desc')
        )

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const docs = snapshot.docs.map((doc) => {
                    const data = doc.data()

                    // Support both flat { latitude, longitude } and nested { metadata: { latitude, longitude } }
                    const lat =
                        data.latitude ??
                        data.metadata?.latitude ??
                        data.location?.latitude ??
                        null

                    const lng =
                        data.longitude ??
                        data.metadata?.longitude ??
                        data.location?.longitude ??
                        null

                    return {
                        id: doc.id,
                        lat: lat != null ? parseFloat(lat) : null,
                        lng: lng != null ? parseFloat(lng) : null,
                        severity: data.ai_analysis?.severity_score ?? null,
                        urgency: data.ai_analysis?.urgency_level ?? 'Unknown',
                        waste_type: data.ai_analysis?.waste_type ?? 'Unknown',
                        status: data.status ?? 'pending',
                        timestamp: data.metadata?.processed_at ?? data.created_at ?? null,
                    }
                })

                setReports(docs)
                setLoading(false)
            },
            (err) => {
                console.error('[Heatmap] Firestore error:', err)
                setFirestoreError(err.message)
                setLoading(false)
            }
        )

        return () => unsubscribe()
    }, [])

    // ------------------------------------------------------------------
    // Derived stats
    // ------------------------------------------------------------------
    const todayReports = reports.filter((r) => isToday(r.timestamp))
    const totalReports = reports.length
    const validPoints = reports.filter((r) => r.lat != null && r.lng != null).length
    const criticalCount = reports.filter((r) => r.urgency === 'Critical').length

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
    return (
        <div style={{ fontFamily: 'var(--font-sans)' }}>

            {/* ── Section header ── */}
            <div className="section-header flex items-center justify-between">
                <span>📍 Waste Hotspot Heatmap — Madurai</span>
                <LiveBadge />
            </div>

            {/* ── Stat row ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-[var(--color-surface)]">
                <StatCard
                    label="Reports Today"
                    value={loading ? '—' : todayReports.length}
                    icon="📋"
                    accent="var(--color-gov-700)"
                />
                <StatCard
                    label="Total Reports"
                    value={loading ? '—' : totalReports}
                    icon="🗂️"
                    accent="var(--color-chakra)"
                />
                <StatCard
                    label="Critical Zones"
                    value={loading ? '—' : criticalCount}
                    icon="🚨"
                    accent="#DC2626"
                />
            </div>

            {/* ── Error states ── */}
            {mapsError && (
                <div className="gov-alert-error mx-4 mb-3" role="alert">
                    <strong>Maps Error:</strong> {mapsError}. Ensure{' '}
                    <code>VITE_GOOGLE_MAPS_API_KEY</code> is set in your{' '}
                    <code>.env</code> file and the Maps JS API is enabled in GCP.
                </div>
            )}

            {firestoreError && (
                <div className="gov-alert-error mx-4 mb-3" role="alert">
                    <strong>Firestore Error:</strong> {firestoreError}
                </div>
            )}

            {/* ── Map container ── */}
            <div className="px-4 pb-4">
                <div
                    className="gov-card overflow-hidden relative"
                    style={{ height: '480px', minHeight: '320px' }}
                >
                    {/* Map canvas */}
                    <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

                    {/* Loading overlay */}
                    {(loading || !mapsReady) && !mapsError && (
                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                            style={{ background: 'rgba(245,247,250,0.92)' }}
                        >
                            <div
                                className="w-8 h-8 rounded-full border-4 animate-spin"
                                style={{
                                    borderColor: 'var(--color-gov-100)',
                                    borderTopColor: 'var(--color-gov-700)',
                                }}
                            />
                            <p className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>
                                {!mapsReady ? 'Loading maps…' : 'Fetching report data…'}
                            </p>
                        </div>
                    )}

                    {/* No-data notice */}
                    {mapsReady && !loading && validPoints === 0 && !mapsError && (
                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none"
                            style={{ background: 'rgba(245,247,250,0.85)' }}
                        >
                            <span className="text-4xl">🗺️</span>
                            <p className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
                                No geo-tagged reports found
                            </p>
                            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                                Reports will appear here automatically when location data is available.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Legend ── */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
                    style={{ color: 'var(--color-muted)' }}>
                    <span className="font-semibold uppercase tracking-wide">Heat intensity:</span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
                        Low
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ background: '#f97316' }} />
                        Moderate
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ background: '#dc2626' }} />
                        Severe
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ background: '#7f0000' }} />
                        Critical
                    </span>
                    <span className="ml-auto" style={{ color: 'var(--color-muted)' }}>
                        {validPoints} geo-tagged report{validPoints !== 1 ? 's' : ''} plotted
                    </span>
                </div>
            </div>
        </div>
    )
}

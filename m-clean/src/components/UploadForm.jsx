// src/components/UploadForm.jsx
// ---------------------------------------------------------------
// Citizen upload component — Single source of truth for:
//   • Image file selection with drag-and-drop + preview
//   • Browser Geolocation API capture
//   • Firebase Storage upload (resumable, with progress bar)
//   • Firestore write to "reports" collection with schema:
//       { image_url, metadata: { latitude, longitude }, status, timestamp }
//   • Non-blocking analyzeWaste Cloud Function trigger after save
//   • Full loading, error, and success states
// ---------------------------------------------------------------

import { useState, useRef, useCallback } from 'react'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db, storage } from '../firebase'
import { FUNCTIONS_BASE, FUNCTIONS_CONFIGURED } from '../config'
import { HiExclamationTriangle } from 'react-icons/hi2'

// ── Constants ──────────────────────────────────────────────────
const ACCEPTED_MIME = 'image/jpeg,image/png,image/webp'
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const FIRESTORE_COL = 'reports'

// ── Helpers ────────────────────────────────────────────────────
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Non-blocking: send image to backend /analyze-image for AI analysis.
// Fires and forgets — upload success does NOT depend on this call.
async function triggerAnalyzeWaste(reportId, imageFile, coords) {
    if (!FUNCTIONS_CONFIGURED) {
        console.info('[UploadForm] analyze-image skipped — VITE_FUNCTIONS_BASE_URL not configured.')
        return
    }
    try {
        // Convert File to base64 (strip the data:...;base64, prefix)
        const imageBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result.split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(imageFile)
        })

        const res = await fetch(`${FUNCTIONS_BASE}/analyze-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reportId,
                imageBase64,
                latitude: coords.latitude,
                longitude: coords.longitude,
            }),
        })
        if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            console.warn('[UploadForm] analyze-image returned non-OK:', res.status, body)
        } else {
            const result = await res.json()
            console.info('[UploadForm] AI analysis complete for report:', reportId,
                '| waste_type:', result.analysis?.waste_type,
                '| severity:', result.analysis?.severity_score)
        }
    } catch (err) {
        console.warn('[UploadForm] analyze-image call failed (non-critical):', err.message)
    }
}

// ── Sub-components ─────────────────────────────────────────────
function Spinner({ size = 'h-4 w-4' }) {
    return (
        <svg className={`animate-spin ${size}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    )
}

function ProgressBar({ value }) {
    return (
        <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--color-gov-100)' }}>
            <div
                className="h-2 rounded-full transition-all duration-300"
                style={{ width: `${value}%`, background: 'var(--color-gov-700)' }}
                role="progressbar"
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
            />
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────
export default function UploadForm({ onSuccess, createdBy = null }) {
    // ── State ──────────────────────────────────────────────────────
    const [imageFile, setImageFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [isDragging, setIsDragging] = useState(false)

    const [geoStatus, setGeoStatus] = useState('idle') // idle | fetching | done | denied | error
    const [coords, setCoords] = useState(null)

    const [uploadStatus, setUploadStatus] = useState('idle') // idle | uploading | saving | triggering | done | error
    const [uploadProgress, setUploadProgress] = useState(0)
    const [docId, setDocId] = useState(null)
    const [imageUrl, setImageUrl] = useState(null)

    const [fileError, setFileError] = useState('')
    const [geoError, setGeoError] = useState('')
    const [submitError, setSubmitError] = useState('')

    // ── Extra fields ───────────────────────────────────────────────
    const [areaName,   setAreaName]   = useState('')
    const [wardNumber, setWardNumber] = useState('')
    const [wasteTypes, setWasteTypes] = useState([])

    const WASTE_OPTIONS = [
      'Household / Organic',
      'Plastic Waste',
      'Construction Debris',
      'Biomedical / Hazardous',
      'Electronic Waste',
      'Liquid / Sewage',
    ]

    function toggleWasteType(type) {
      setWasteTypes(prev =>
        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
      )
    }

    const fileInputRef = useRef(null)

    // ── Image selection ────────────────────────────────────────────
    const applyFile = useCallback((file) => {
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setFileError('Only JPEG, PNG, or WebP images are accepted.')
            return
        }
        if (file.size > MAX_FILE_BYTES) {
            setFileError(`File too large (${formatBytes(file.size)}). Max 5 MB allowed.`)
            return
        }
        setFileError('')
        setImageFile(file)
        setPreview(URL.createObjectURL(file))
    }, [])

    const handleFileChange = (e) => applyFile(e.target.files?.[0])
    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        applyFile(e.dataTransfer.files?.[0])
    }
    const clearImage = () => {
        setImageFile(null)
        if (preview) URL.revokeObjectURL(preview)
        setPreview(null)
        setFileError('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // ── Geolocation ────────────────────────────────────────────────
    const fetchLocation = () => {
        if (!navigator.geolocation) {
            setGeoError('Geolocation is not supported by this browser.')
            setGeoStatus('error')
            return
        }
        setGeoStatus('fetching')
        setGeoError('')
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
                setGeoStatus('done')
            },
            (err) => {
                const messages = {
                    1: 'Location permission denied. Please allow access and retry.',
                    2: 'Location information unavailable.',
                    3: 'Location request timed out. Please retry.',
                }
                setGeoError(messages[err.code] ?? 'Unknown geolocation error.')
                setGeoStatus(err.code === 1 ? 'denied' : 'error')
            },
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
        )
    }

    // ── Form submit ────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault()
        setSubmitError('')

        if (!imageFile) { setSubmitError('Please select an image to upload.'); return }
        if (!coords) { setSubmitError('Please capture your location before submitting.'); return }
        if (!areaName.trim()) { setSubmitError('Please enter the area name.'); return }
        if (!wardNumber.trim()) { setSubmitError('Please enter the ward number.'); return }
        if (wasteTypes.length === 0) { setSubmitError('Please select at least one type of waste.'); return }

        try {
            // Step 1 — Upload to Firebase Storage
            setUploadStatus('uploading')
            setUploadProgress(0)

            const ext = imageFile.name.split('.').pop()
            const storePath = `reports/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
            const storageRef = ref(storage, storePath)
            const uploadTask = uploadBytesResumable(storageRef, imageFile)

            const downloadURL = await new Promise((resolve, reject) => {
                uploadTask.on(
                    'state_changed',
                    (snapshot) => {
                        setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
                    },
                    (err) => reject(err),
                    async () => resolve(await getDownloadURL(uploadTask.snapshot.ref)),
                )
            })

            setImageUrl(downloadURL)

            // Step 2 — Save to Firestore "reports" collection
            setUploadStatus('saving')

            const docRef = await addDoc(collection(db, FIRESTORE_COL), {
                image_url: downloadURL,
                metadata: {
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                },
                area_name:   areaName.trim(),
                ward_number: wardNumber.trim(),
                waste_types: wasteTypes,
                status: 'pending',
                created_by: createdBy,
                assigned_to: null,
                waste_type: null,
                severity_score: null,
                created_at: serverTimestamp(),
                timestamp: serverTimestamp(),
            })

            setDocId(docRef.id)

            // Step 3 — Trigger AI analysis (non-blocking)
            setUploadStatus('triggering')
            await triggerAnalyzeWaste(docRef.id, imageFile, coords)

            setUploadStatus('done')
            onSuccess?.({ docId: docRef.id, imageUrl: downloadURL, coords })

        } catch (err) {
            console.error('[UploadForm] submission error:', err)
            const friendlyMessage =
                err?.code === 'storage/unauthorized' ? 'No permission to upload. Contact the administrator.'
                    : err?.code === 'storage/quota-exceeded' ? 'Storage quota exceeded. Try again later.'
                        : err?.code?.startsWith('firestore/') ? 'Failed to save record. Please retry.'
                            : 'An unexpected error occurred. Please try again.'
            setSubmitError(friendlyMessage)
            setUploadStatus('error')
        }
    }

    // ── Reset ──────────────────────────────────────────────────────
    const handleReset = () => {
        clearImage()
        setCoords(null); setGeoStatus('idle'); setGeoError('')
        setUploadStatus('idle'); setUploadProgress(0)
        setDocId(null); setImageUrl(null); setSubmitError('')
        setAreaName(''); setWardNumber(''); setWasteTypes([])
    }

    const isUploading = ['uploading', 'saving', 'triggering'].includes(uploadStatus)

    // ── Success screen ─────────────────────────────────────────────
    if (uploadStatus === 'done') {
        return (
            <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
                <div className="gov-card overflow-hidden">
                    <div className="section-header">Complaint Submitted — Acknowledgement</div>
                    <div className="p-8 flex flex-col items-center text-center gap-6">

                        <div className="w-20 h-20 rounded-full bg-[#F0FDF4] border-4 border-[var(--color-tri-green)] flex items-center justify-center">
                            <svg className="w-10 h-10 text-[var(--color-tri-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>

                        <div>
                            <h2 className="text-xl font-bold" style={{ color: 'var(--color-gov-900)' }}>
                                Complaint Registered Successfully
                            </h2>
                            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
                                Image and location data saved. AI analysis has been triggered.
                            </p>
                        </div>

                        {imageUrl && (
                            <img src={imageUrl} alt="Uploaded" className="w-full max-h-48 object-cover rounded border border-[var(--color-border)]" />
                        )}

                        <div className="bg-[var(--color-gov-50)] border border-[var(--color-gov-100)] rounded-md px-6 py-4 w-full text-left space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--color-muted)' }} className="font-medium">Document ID</span>
                                <span className="font-mono text-xs break-all" style={{ color: 'var(--color-gov-800)' }}>{docId}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--color-muted)' }} className="font-medium">Latitude</span>
                                <span className="font-mono" style={{ color: 'var(--color-gov-800)' }}>{coords?.latitude?.toFixed(6)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--color-muted)' }} className="font-medium">Longitude</span>
                                <span className="font-mono" style={{ color: 'var(--color-gov-800)' }}>{coords?.longitude?.toFixed(6)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--color-muted)' }} className="font-medium">Collection</span>
                                <span className="font-mono" style={{ color: 'var(--color-gov-800)' }}>{FIRESTORE_COL}</span>
                            </div>
                        </div>

                        <div className="gov-alert-success w-full text-left text-sm">
                            📁 Report saved to Firestore <strong>{FIRESTORE_COL}</strong> collection. AI analysis will process shortly.
                        </div>

                        <button onClick={handleReset} className="btn-gov">
                            Submit Another Report
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ── Upload form ────────────────────────────────────────────────
    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
            <div className="gov-card overflow-hidden">
                <div className="section-header">Image Upload — Photographic Evidence</div>

                <form onSubmit={handleSubmit} noValidate className="p-6 flex flex-col gap-6">

                    {/* Section A — Image */}
                    <section>
                        <h2 className="text-sm font-bold mb-3 pb-1.5 border-b flex items-center gap-2"
                            style={{ color: 'var(--color-gov-800)', borderColor: 'var(--color-border)' }}>
                            <span className="text-white text-xs font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--color-gov-800)' }}>A</span>
                            Select Photograph
                        </h2>

                        <label className="field-label">
                            Photograph File <span className="req">*</span>
                        </label>

                        {preview ? (
                            <div className="relative border rounded overflow-hidden" style={{ borderColor: 'var(--color-border-strong)' }}>
                                <img src={preview} alt="Preview" className="w-full max-h-60 object-cover" />
                                <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 text-xs flex justify-between items-center"
                                    style={{ color: 'var(--color-muted)' }}>
                                    <span className="truncate max-w-[70%]">{imageFile?.name}</span>
                                    <span>{formatBytes(imageFile?.size ?? 0)}</span>
                                </div>
                                {!isUploading && (
                                    <button type="button" onClick={clearImage} aria-label="Remove photo"
                                        className="absolute top-2 right-2 bg-white/90 hover:bg-white border rounded-full px-2 py-1 text-xs font-semibold transition"
                                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-gov-900)' }}>
                                        ✕ Remove
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div
                                role="button" tabIndex={0}
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                                onDragLeave={() => setIsDragging(false)}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                                className={[
                                    'border-2 border-dashed rounded p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors duration-200 text-center',
                                    isDragging
                                        ? 'border-[var(--color-gov-600)] bg-[var(--color-gov-50)]'
                                        : 'border-[var(--color-border-strong)] hover:border-[var(--color-gov-500)] hover:bg-[var(--color-gov-50)]',
                                ].join(' ')}
                            >
                                <svg className="w-10 h-10" style={{ color: 'var(--color-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: 'var(--color-gov-700)' }}>Click to upload or drag &amp; drop</p>
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>JPEG, PNG or WebP · Max 5 MB</p>
                                </div>
                            </div>
                        )}

                        <input ref={fileInputRef} id="upload-photo" type="file" accept={ACCEPTED_MIME}
                            onChange={handleFileChange} className="sr-only" aria-label="Choose photo" />

                        {fileError && (
                            <p role="alert" className="text-xs text-red-700 mt-1.5 flex items-center gap-1">
                                <HiExclamationTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> {fileError}
                            </p>
                        )}
                    </section>

                    {/* Section B — Geolocation */}
                    <section>
                        <h2 className="text-sm font-bold mb-3 pb-1.5 border-b flex items-center gap-2"
                            style={{ color: 'var(--color-gov-800)', borderColor: 'var(--color-border)' }}>
                            <span className="text-white text-xs font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--color-gov-800)' }}>B</span>
                            Location Capture
                        </h2>

                        <div className="flex items-center gap-3 flex-wrap">
                            <button type="button" onClick={fetchLocation}
                                disabled={geoStatus === 'fetching' || isUploading}
                                className={[
                                    'btn-gov-outline flex items-center gap-2 text-sm',
                                    geoStatus === 'done' ? 'border-[var(--color-tri-green)] text-[var(--color-tri-green)]' : '',
                                ].join(' ')}
                                id="btn-capture-location">
                                {geoStatus === 'fetching' ? (
                                    <><Spinner /> Locating…</>
                                ) : geoStatus === 'done' ? (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        Location Captured
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        Capture My Location
                                    </>
                                )}
                            </button>

                            {coords && (
                                <div className="text-xs font-mono rounded px-3 py-1.5 leading-relaxed"
                                    style={{ background: 'var(--color-gov-50)', border: '1px solid var(--color-gov-100)', color: 'var(--color-gov-700)' }}>
                                    <span style={{ color: 'var(--color-muted)', fontFamily: 'sans-serif' }}>Lat: </span>{coords.latitude.toFixed(6)}
                                    <span className="mx-1" style={{ color: 'var(--color-muted)' }}>·</span>
                                    <span style={{ color: 'var(--color-muted)', fontFamily: 'sans-serif' }}>Lng: </span>{coords.longitude.toFixed(6)}
                                </div>
                            )}
                        </div>

                        {geoError && (
                            <p role="alert" className="text-xs text-red-700 mt-2 flex items-start gap-1">
                                <HiExclamationTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" /> {geoError}
                            </p>
                        )}

                        <p className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>
                            Your browser will request GPS permission. Location is required to geotag the photograph.
                        </p>
                    </section>

                    {/* Section C — Additional Details */}
                    <section>
                        <h2 className="text-sm font-bold mb-3 pb-1.5 border-b flex items-center gap-2"
                            style={{ color: 'var(--color-gov-800)', borderColor: 'var(--color-border)' }}>
                            <span className="text-white text-xs font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'var(--color-gov-800)' }}>C</span>
                            Complaint Details
                        </h2>

                        <div className="flex flex-col gap-4">
                            {/* Area Name */}
                            <div>
                                <label htmlFor="area-name" className="field-label">
                                    Area Name <span className="req">*</span>
                                </label>
                                <input
                                    id="area-name"
                                    type="text"
                                    value={areaName}
                                    onChange={e => setAreaName(e.target.value)}
                                    placeholder="e.g. Anna Nagar, Madurai"
                                    disabled={isUploading}
                                    className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-gov-600)] transition"
                                    style={{ borderColor: 'var(--color-border-strong)' }}
                                />
                            </div>

                            {/* Ward Number */}
                            <div>
                                <label htmlFor="ward-number" className="field-label">
                                    Ward Number <span className="req">*</span>
                                </label>
                                <input
                                    id="ward-number"
                                    type="text"
                                    value={wardNumber}
                                    onChange={e => setWardNumber(e.target.value)}
                                    placeholder="e.g. 24"
                                    disabled={isUploading}
                                    className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-gov-600)] transition"
                                    style={{ borderColor: 'var(--color-border-strong)' }}
                                />
                            </div>

                            {/* Waste Types */}
                            <div>
                                <label className="field-label">
                                    Type of Waste <span className="req">*</span>
                                </label>
                                <div className="flex flex-wrap gap-2 mt-1.5">
                                    {WASTE_OPTIONS.map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            disabled={isUploading}
                                            onClick={() => toggleWasteType(type)}
                                            className={[
                                                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                                                wasteTypes.includes(type)
                                                    ? 'bg-[var(--color-gov-800)] text-white border-[var(--color-gov-800)]'
                                                    : 'bg-white text-[var(--color-gov-800)] border-[var(--color-border-strong)] hover:bg-[var(--color-gov-50)]',
                                            ].join(' ')}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Upload progress */}
                    {isUploading && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs" style={{ color: 'var(--color-muted)' }}>
                                <span>
                                    {uploadStatus === 'uploading' ? `Uploading image… ${uploadProgress}%`
                                        : uploadStatus === 'saving' ? 'Saving to database…'
                                            : 'Triggering AI analysis…'}
                                </span>
                                {uploadStatus === 'uploading' && <span>{uploadProgress}%</span>}
                            </div>
                            <ProgressBar value={uploadStatus === 'saving' || uploadStatus === 'triggering' ? 100 : uploadProgress} />
                        </div>
                    )}

                    {/* Submit error */}
                    {submitError && <div role="alert" className="gov-alert-error">⚠️ {submitError}</div>}

                    {/* Action row */}
                    <div className="flex items-center gap-4 pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <button type="submit" id="btn-upload-submit" disabled={isUploading} className="btn-gov flex items-center gap-2">
                            {isUploading && <Spinner />}
                            {isUploading
                                ? uploadStatus === 'saving' ? 'Saving…'
                                    : uploadStatus === 'triggering' ? 'Triggering AI…'
                                        : 'Uploading…'
                                : 'Upload & Submit'
                            }
                        </button>
                        {!isUploading && (
                            <button type="button" onClick={handleReset} className="btn-gov-outline">Clear</button>
                        )}
                    </div>

                </form>
            </div>
        </div>
    )
}

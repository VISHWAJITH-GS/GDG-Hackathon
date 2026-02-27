// src/components/UploadForm.jsx
// ---------------------------------------------------------------
// Self-contained upload component for the m-clean portal.
//
// Features:
//   • Image file selection with drag-and-drop + preview
//   • Browser Geolocation API (latitude / longitude)
//   • Upload image to Firebase Storage (modular SDK)
//   • Save metadata document to Firestore:
//       { image_url, latitude, longitude, timestamp }
//   • Full error handling with user-visible messages
//   • Success banner with Firestore document ID
//
// Usage:
//   import UploadForm from './components/UploadForm'
//   <UploadForm />
//
// Firebase must be configured in src/firebase.js before use.
// ---------------------------------------------------------------

import { useState, useRef, useCallback } from 'react'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db, storage } from '../firebase'

// ── Accepted MIME types ────────────────────────────────────────
const ACCEPTED_MIME = 'image/jpeg,image/png,image/webp'
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

// ── Helpers ────────────────────────────────────────────────────
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Sub-components ─────────────────────────────────────────────
function Spinner({ size = 'h-4 w-4' }) {
    return (
        <svg className={`animate-spin ${size}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    )
}

function ProgressBar({ value }) {
    return (
        <div className="w-full bg-[var(--color-gov-100)] rounded-full h-2 overflow-hidden">
            <div
                className="bg-[var(--color-gov-700)] h-2 rounded-full transition-all duration-300"
                style={{ width: `${value}%` }}
                role="progressbar"
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
            />
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────
export default function UploadForm() {
    // ── State ────────────────────────────────────────────────────
    const [imageFile, setImageFile] = useState(null)      // File object
    const [preview, setPreview] = useState(null)      // Object URL
    const [isDragging, setIsDragging] = useState(false)

    // Geolocation
    const [geoStatus, setGeoStatus] = useState('idle')    // idle | fetching | done | denied | error
    const [coords, setCoords] = useState(null)      // { latitude, longitude }

    // Upload / Firestore
    const [uploadStatus, setUploadStatus] = useState('idle')    // idle | uploading | saving | done | error
    const [uploadProgress, setUploadProgress] = useState(0)
    const [docId, setDocId] = useState(null)
    const [imageUrl, setImageUrl] = useState(null)

    // Error messages
    const [fileError, setFileError] = useState('')
    const [geoError, setGeoError] = useState('')
    const [submitError, setSubmitError] = useState('')

    const fileInputRef = useRef(null)

    // ── Image selection helpers ───────────────────────────────────
    const applyFile = useCallback((file) => {
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setFileError('Only JPEG, PNG, or WebP images are accepted.')
            return
        }
        if (file.size > MAX_FILE_BYTES) {
            setFileError(`File is too large (${formatBytes(file.size)}). Maximum allowed size is 5 MB.`)
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

    // ── Geolocation ───────────────────────────────────────────────
    const fetchLocation = () => {
        if (!navigator.geolocation) {
            setGeoError('Geolocation is not supported by your browser.')
            setGeoStatus('error')
            return
        }
        setGeoStatus('fetching')
        setGeoError('')
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setCoords({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                })
                setGeoStatus('done')
                setGeoError('')
            },
            (err) => {
                const messages = {
                    1: 'Location permission was denied. Please allow access and try again.',
                    2: 'Location information is unavailable. Check your device settings.',
                    3: 'Location request timed out. Please try again.',
                }
                setGeoError(messages[err.code] ?? 'An unknown geolocation error occurred.')
                setGeoStatus(err.code === 1 ? 'denied' : 'error')
            },
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
        )
    }

    // ── Form submit ───────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault()
        setSubmitError('')

        // Validations
        if (!imageFile) {
            setSubmitError('Please select an image to upload.')
            return
        }
        if (!coords) {
            setSubmitError('Please capture your location before submitting.')
            return
        }

        try {
            // ── Step 1: Upload to Firebase Storage ──────────────────
            setUploadStatus('uploading')
            setUploadProgress(0)

            const ext = imageFile.name.split('.').pop()
            const storePath = `complaints/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
            const storageRef = ref(storage, storePath)
            const uploadTask = uploadBytesResumable(storageRef, imageFile)

            const downloadURL = await new Promise((resolve, reject) => {
                uploadTask.on(
                    'state_changed',
                    (snapshot) => {
                        const pct = Math.round(
                            (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
                        )
                        setUploadProgress(pct)
                    },
                    (err) => reject(err),
                    async () => {
                        const url = await getDownloadURL(uploadTask.snapshot.ref)
                        resolve(url)
                    },
                )
            })

            setImageUrl(downloadURL)

            // ── Step 2: Save metadata to Firestore ─────────────────
            setUploadStatus('saving')

            const docRef = await addDoc(collection(db, 'complaints'), {
                image_url: downloadURL,
                latitude: coords.latitude,
                longitude: coords.longitude,
                timestamp: serverTimestamp(),
            })

            setDocId(docRef.id)
            setUploadStatus('done')

        } catch (err) {
            console.error('[UploadForm] submission error:', err)
            const friendlyMessage =
                err?.code === 'storage/unauthorized'
                    ? 'You do not have permission to upload files. Contact the administrator.'
                    : err?.code === 'storage/quota-exceeded'
                        ? 'Storage quota exceeded. Please try again later.'
                        : err?.code?.startsWith('firestore/')
                            ? 'Failed to save record in database. Please try again.'
                            : 'An unexpected error occurred during upload. Please try again.'
            setSubmitError(friendlyMessage)
            setUploadStatus('error')
        }
    }

    // ── Reset ─────────────────────────────────────────────────────
    const handleReset = () => {
        clearImage()
        setCoords(null)
        setGeoStatus('idle')
        setGeoError('')
        setUploadStatus('idle')
        setUploadProgress(0)
        setDocId(null)
        setImageUrl(null)
        setSubmitError('')
    }

    const isUploading = uploadStatus === 'uploading' || uploadStatus === 'saving'

    // ── Success screen ────────────────────────────────────────────
    if (uploadStatus === 'done') {
        return (
            <div className="max-w-xl mx-auto px-4 sm:px-6 py-10">
                <div className="gov-card overflow-hidden">
                    <div className="section-header">Upload Complete — Confirmation</div>
                    <div className="p-8 flex flex-col items-center text-center gap-6">

                        {/* Checkmark */}
                        <div className="w-20 h-20 rounded-full bg-[#F0FDF4] border-4
                            border-[var(--color-tri-green)] flex items-center justify-center">
                            <svg className="w-10 h-10 text-[var(--color-tri-green)]"
                                fill="none" viewBox="0 0 24 24"
                                stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>

                        <div>
                            <h2 className="text-xl font-bold text-[var(--color-gov-900)]">
                                Image Uploaded Successfully
                            </h2>
                            <p className="text-[var(--color-muted)] text-sm mt-1">
                                The image and location data have been saved to the database.
                            </p>
                        </div>

                        {/* Image preview */}
                        {imageUrl && (
                            <img
                                src={imageUrl}
                                alt="Uploaded image"
                                className="w-full max-h-48 object-cover rounded border border-[var(--color-border)]"
                            />
                        )}

                        {/* Metadata summary */}
                        <div className="bg-[var(--color-gov-50)] border border-[var(--color-gov-100)]
                            rounded-md px-6 py-4 w-full text-left space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)] font-medium">Document ID</span>
                                <span className="font-mono text-[var(--color-gov-800)] text-xs break-all">{docId}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)] font-medium">Latitude</span>
                                <span className="font-mono text-[var(--color-gov-800)]">
                                    {coords?.latitude?.toFixed(6)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)] font-medium">Longitude</span>
                                <span className="font-mono text-[var(--color-gov-800)]">
                                    {coords?.longitude?.toFixed(6)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-[var(--color-muted)] font-medium">Timestamp</span>
                                <span className="text-[var(--color-gov-800)]">
                                    {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                </span>
                            </div>
                        </div>

                        <div className="gov-alert-success w-full text-left text-sm">
                            📁 The record has been saved to Firestore under the{' '}
                            <strong>complaints</strong> collection.
                        </div>

                        <button onClick={handleReset} className="btn-gov">
                            Upload Another Image
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ── Upload form ───────────────────────────────────────────────
    return (
        <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
            <div className="gov-card overflow-hidden">
                <div className="section-header">
                    Image Upload — Photographic Evidence
                </div>

                <form onSubmit={handleSubmit} noValidate className="p-6 flex flex-col gap-6">

                    {/* ─ Section A: Image Upload ─ */}
                    <section>
                        <h2 className="text-sm font-bold text-[var(--color-gov-800)] mb-3
                           pb-1.5 border-b border-[var(--color-border)]
                           flex items-center gap-2">
                            <span className="bg-[var(--color-gov-800)] text-white text-xs
                               font-bold px-1.5 py-0.5 rounded">A</span>
                            Select Photograph
                        </h2>

                        <label className="field-label">
                            Photograph File <span className="req">*</span>
                        </label>

                        {preview ? (
                            /* ── Preview ── */
                            <div className="relative border border-[var(--color-border-strong)] rounded overflow-hidden">
                                <img
                                    src={preview}
                                    alt="Selected photograph preview"
                                    className="w-full max-h-60 object-cover"
                                />
                                {/* File info strip */}
                                <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5
                                text-xs text-[var(--color-muted)] flex justify-between items-center">
                                    <span className="truncate max-w-[70%]">{imageFile?.name}</span>
                                    <span>{formatBytes(imageFile?.size ?? 0)}</span>
                                </div>
                                {!isUploading && (
                                    <button
                                        type="button"
                                        onClick={clearImage}
                                        aria-label="Remove photograph"
                                        className="absolute top-2 right-2 bg-white/90 hover:bg-white
                               text-[var(--color-gov-900)] border border-[var(--color-border)]
                               rounded-full px-2 py-1 text-xs font-semibold transition"
                                    >
                                        ✕ Remove
                                    </button>
                                )}
                            </div>
                        ) : (
                            /* ── Drop zone ── */
                            <div
                                role="button"
                                tabIndex={0}
                                onDrop={handleDrop}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                                onDragLeave={() => setIsDragging(false)}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                                className={[
                                    'border-2 border-dashed rounded p-8 flex flex-col items-center gap-3',
                                    'cursor-pointer transition-colors duration-200 text-center',
                                    isDragging
                                        ? 'border-[var(--color-gov-600)] bg-[var(--color-gov-50)]'
                                        : 'border-[var(--color-border-strong)] hover:border-[var(--color-gov-500)] hover:bg-[var(--color-gov-50)]',
                                ].join(' ')}
                            >
                                <svg className="w-10 h-10 text-[var(--color-muted)]" fill="none"
                                    viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2
                       l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01
                       M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                </svg>
                                <div>
                                    <p className="text-sm font-semibold text-[var(--color-gov-700)]">
                                        Click to upload or drag &amp; drop
                                    </p>
                                    <p className="text-xs text-[var(--color-muted)] mt-1">
                                        JPEG, PNG or WebP · Max 5 MB
                                    </p>
                                </div>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            id="upload-photo"
                            type="file"
                            accept={ACCEPTED_MIME}
                            onChange={handleFileChange}
                            className="sr-only"
                            aria-label="Choose photograph"
                        />

                        {fileError && (
                            <p role="alert" className="text-xs text-red-700 mt-1.5 flex items-center gap-1">
                                <span>⚠️</span> {fileError}
                            </p>
                        )}
                    </section>

                    {/* ─ Section B: Geolocation ─ */}
                    <section>
                        <h2 className="text-sm font-bold text-[var(--color-gov-800)] mb-3
                           pb-1.5 border-b border-[var(--color-border)]
                           flex items-center gap-2">
                            <span className="bg-[var(--color-gov-800)] text-white text-xs
                               font-bold px-1.5 py-0.5 rounded">B</span>
                            Location Capture
                        </h2>

                        <div className="flex items-center gap-3 flex-wrap">
                            <button
                                type="button"
                                onClick={fetchLocation}
                                disabled={geoStatus === 'fetching' || isUploading}
                                className={[
                                    'btn-gov-outline flex items-center gap-2 text-sm',
                                    geoStatus === 'done' ? 'border-[var(--color-tri-green)] text-[var(--color-tri-green)]' : '',
                                ].join(' ')}
                                id="btn-capture-location"
                            >
                                {geoStatus === 'fetching' ? (
                                    <><Spinner /> Locating…</>
                                ) : geoStatus === 'done' ? (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
                                            stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        Location Captured
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827
                           0l-4.244-4.243a8 8 0 1111.314 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                                                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                        Capture My Location
                                    </>
                                )}
                            </button>

                            {coords && (
                                <div className="text-xs text-[var(--color-gov-700)] font-mono bg-[var(--color-gov-50)]
                                border border-[var(--color-gov-100)] rounded px-3 py-1.5 leading-relaxed">
                                    <span className="text-[var(--color-muted)] font-sans">Lat: </span>
                                    {coords.latitude.toFixed(6)}
                                    <span className="mx-1 text-[var(--color-muted)]">·</span>
                                    <span className="text-[var(--color-muted)] font-sans">Lng: </span>
                                    {coords.longitude.toFixed(6)}
                                </div>
                            )}
                        </div>

                        {geoError && (
                            <p role="alert" className="text-xs text-red-700 mt-2 flex items-start gap-1">
                                <span className="shrink-0">⚠️</span> {geoError}
                            </p>
                        )}

                        <p className="text-xs text-[var(--color-muted)] mt-2">
                            Your browser will request permission to read your current GPS coordinates.
                            These are required to geotag the photograph.
                        </p>
                    </section>

                    {/* Upload progress (visible during upload) */}
                    {isUploading && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-[var(--color-muted)]">
                                <span>
                                    {uploadStatus === 'uploading'
                                        ? `Uploading image… ${uploadProgress}%`
                                        : 'Saving to database…'}
                                </span>
                                {uploadStatus === 'uploading' && <span>{uploadProgress}%</span>}
                            </div>
                            <ProgressBar value={uploadStatus === 'saving' ? 100 : uploadProgress} />
                        </div>
                    )}

                    {/* Submit error */}
                    {submitError && (
                        <div role="alert" className="gov-alert-error">
                            ⚠️ {submitError}
                        </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center gap-4 pt-2 border-t border-[var(--color-border)]">
                        <button
                            type="submit"
                            id="btn-upload-submit"
                            disabled={isUploading}
                            className="btn-gov flex items-center gap-2"
                        >
                            {isUploading && <Spinner />}
                            {isUploading ? (
                                uploadStatus === 'saving' ? 'Saving…' : 'Uploading…'
                            ) : (
                                'Upload & Save'
                            )}
                        </button>

                        {!isUploading && (
                            <button
                                type="button"
                                onClick={handleReset}
                                className="btn-gov-outline"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                </form>
            </div>
        </div>
    )
}

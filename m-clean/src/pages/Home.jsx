// src/pages/Home.jsx
// ----------------------------------------------------------------
// Citizen Complaint Registration Page
// Government portal style — formal section headers, field labels,
// official buttons, and structured layout.
// ----------------------------------------------------------------

import { useState, useRef } from 'react'

const ACCEPT = 'image/jpeg,image/png,image/webp'

// Reusable spinner
function Spinner() {
    return (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
    )
}

export default function Home() {
    const [location, setLocation] = useState('')
    const [ward, setWard] = useState('')
    const [category, setCategory] = useState('')
    const [description, setDescription] = useState('')
    const [imageFile, setImageFile] = useState(null)
    const [preview, setPreview] = useState(null)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [refNum, setRefNum] = useState('')
    const [error, setError] = useState('')
    const fileInputRef = useRef(null)

    // Preview selected image
    const handleFileChange = (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        setImageFile(file)
        setPreview(URL.createObjectURL(file))
        setError('')
    }

    // Drag-and-drop
    const handleDrop = (e) => {
        e.preventDefault()
        const file = e.dataTransfer.files?.[0]
        if (!file || !file.type.startsWith('image/')) return
        setImageFile(file)
        setPreview(URL.createObjectURL(file))
    }

    const clearImage = () => {
        setImageFile(null)
        setPreview(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // Form submit
    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!location.trim()) { setError('Location / Address is required.'); return }
        if (!category) { setError('Please select a complaint category.'); return }
        if (!imageFile) { setError('Please attach a supporting photograph.'); return }

        setSubmitting(true)
        try {
            // TODO: Firebase upload + Firestore doc creation
            await new Promise((r) => setTimeout(r, 2000))
            // Generate a mock reference number
            const ref = `MCL-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`
            setRefNum(ref)
            setSubmitted(true)
        } catch (err) {
            setError('Submission failed due to a server error. Please try again later.')
            console.error(err)
        } finally {
            setSubmitting(false)
        }
    }

    const handleReset = () => {
        setLocation(''); setWard(''); setCategory(''); setDescription('')
        clearImage(); setSubmitted(false); setRefNum(''); setError('')
    }

    /* ── Success screen ── */
    if (submitted) {
        return (
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
                <div className="gov-card overflow-hidden">
                    <div className="section-header">Complaint Registration — Acknowledgement</div>
                    <div className="p-8 flex flex-col items-center text-center gap-5">
                        {/* Checkmark seal */}
                        <div className="w-20 h-20 rounded-full bg-[#F0FDF4] border-4 border-[var(--color-tri-green)] flex items-center justify-center">
                            <svg className="w-10 h-10 text-[var(--color-tri-green)]" fill="none"
                                viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>

                        <div>
                            <h2 className="text-xl font-bold text-[var(--color-gov-900)]">
                                Complaint Registered Successfully
                            </h2>
                            <p className="text-[var(--color-muted)] text-sm mt-1">
                                Your grievance has been recorded and forwarded to the concerned officer.
                            </p>
                        </div>

                        {/* Reference number */}
                        <div className="bg-[var(--color-gov-50)] border border-[var(--color-gov-100)]
                            rounded-md px-6 py-4 w-full max-w-xs">
                            <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider mb-1">
                                Reference Number
                            </p>
                            <p className="text-2xl font-bold text-[var(--color-gov-800)] font-mono tracking-widest">
                                {refNum}
                            </p>
                            <p className="text-xs text-[var(--color-muted)] mt-1">
                                Please note this number for tracking your complaint.
                            </p>
                        </div>

                        <div className="gov-alert-success w-full text-left">
                            An acknowledgement will be dispatched to your registered mobile number /
                            email address within 24 hours.
                        </div>

                        <div className="flex gap-3 flex-wrap justify-center">
                            <button onClick={handleReset} className="btn-gov">
                                Register Another Complaint
                            </button>
                            <button className="btn-gov-outline">
                                Download Acknowledgement
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    /* ── Registration form ── */
    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">

            {/* Page notice banner */}
            <div className="mb-5 bg-[#FFF8E7] border border-[#FCEAAA] border-l-4
                      border-l-[var(--color-saffron)] rounded px-4 py-3
                      text-xs text-[#6B4E00] flex items-start gap-2">
                <span className="text-base leading-none mt-0.5">ℹ️</span>
                <span>
                    Fields marked with <strong className="text-red-700">*</strong> are mandatory.
                    All complaints are subject to verification by the designated sanitation officer.
                    Misuse of this portal may attract penal action under applicable law.
                </span>
            </div>

            <div className="gov-card overflow-hidden">
                {/* Card header */}
                <div className="section-header">
                    Complaint Registration Form — Sanitation &amp; Cleanliness
                </div>

                <form onSubmit={handleSubmit} noValidate className="p-6 flex flex-col gap-6">

                    {/* ─ Section A: Location Details ─ */}
                    <section>
                        <h2 className="text-sm font-bold text-[var(--color-gov-800)] mb-3
                           pb-1.5 border-b border-[var(--color-border)]
                           flex items-center gap-2">
                            <span className="bg-[var(--color-gov-800)] text-white text-xs
                               font-bold px-1.5 py-0.5 rounded">A</span>
                            Location Details
                        </h2>

                        <div className="grid sm:grid-cols-2 gap-4">
                            {/* Address */}
                            <div className="sm:col-span-2">
                                <label htmlFor="location" className="field-label">
                                    Street Address / Locality <span className="req">*</span>
                                </label>
                                <input
                                    id="location"
                                    type="text"
                                    className="field-input"
                                    placeholder="e.g. MG Road, Sector 5, Near Public Park"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                />
                            </div>

                            {/* Ward */}
                            <div>
                                <label htmlFor="ward" className="field-label">
                                    Ward / Block Number
                                </label>
                                <input
                                    id="ward"
                                    type="text"
                                    className="field-input"
                                    placeholder="e.g. Ward No. 12"
                                    value={ward}
                                    onChange={(e) => setWard(e.target.value)}
                                />
                            </div>

                            {/* Category */}
                            <div>
                                <label htmlFor="category" className="field-label">
                                    Complaint Category <span className="req">*</span>
                                </label>
                                <select
                                    id="category"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="field-input"
                                >
                                    <option value="">— Select Category —</option>
                                    <option value="garbage">Garbage / Solid Waste</option>
                                    <option value="drainage">Drainage / Sewage Overflow</option>
                                    <option value="illegal_dump">Illegal Dumping</option>
                                    <option value="stagnant_water">Stagnant Water / Waterlogging</option>
                                    <option value="public_toilet">Public Toilet Cleanliness</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* ─ Section B: Complaint Details ─ */}
                    <section>
                        <h2 className="text-sm font-bold text-[var(--color-gov-800)] mb-3
                           pb-1.5 border-b border-[var(--color-border)]
                           flex items-center gap-2">
                            <span className="bg-[var(--color-gov-800)] text-white text-xs
                               font-bold px-1.5 py-0.5 rounded">B</span>
                            Complaint Description
                        </h2>

                        <div>
                            <label htmlFor="description" className="field-label">
                                Brief Description of Issue
                            </label>
                            <textarea
                                id="description"
                                rows={4}
                                className="field-input resize-none"
                                placeholder="Describe the cleanliness issue in detail…"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                            <p className="text-xs text-[var(--color-muted)] mt-1">
                                Maximum 500 characters. Do not include personal information of third parties.
                            </p>
                        </div>
                    </section>

                    {/* ─ Section C: Supporting Evidence ─ */}
                    <section>
                        <h2 className="text-sm font-bold text-[var(--color-gov-800)] mb-3
                           pb-1.5 border-b border-[var(--color-border)]
                           flex items-center gap-2">
                            <span className="bg-[var(--color-gov-800)] text-white text-xs
                               font-bold px-1.5 py-0.5 rounded">C</span>
                            Supporting Photograph
                        </h2>

                        <label className="field-label">
                            Attach Photograph <span className="req">*</span>
                        </label>

                        {preview ? (
                            <div className="relative border border-[var(--color-border-strong)]
                              rounded overflow-hidden">
                                <img src={preview} alt="Attached photograph preview"
                                    className="w-full max-h-56 object-cover" />
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
                            </div>
                        ) : (
                            <div
                                role="button"
                                tabIndex={0}
                                onDrop={handleDrop}
                                onDragOver={(e) => e.preventDefault()}
                                onClick={() => fileInputRef.current?.click()}
                                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                                className="border-2 border-dashed border-[var(--color-border-strong)]
                           hover:border-[var(--color-gov-500)] hover:bg-[var(--color-gov-50)]
                           rounded p-8 flex flex-col items-center gap-3 cursor-pointer
                           transition-colors duration-200 text-center"
                            >
                                <svg className="w-10 h-10 text-[var(--color-muted)]" fill="none"
                                    viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
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
                            id="photo"
                            type="file"
                            accept={ACCEPT}
                            onChange={handleFileChange}
                            className="sr-only"
                        />
                    </section>

                    {/* Error */}
                    {error && (
                        <div role="alert" className="gov-alert-error">
                            ⚠️ {error}
                        </div>
                    )}

                    {/* Submit row */}
                    <div className="flex items-center gap-4 pt-2 border-t border-[var(--color-border)]">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="btn-gov"
                        >
                            {submitting && <Spinner />}
                            {submitting ? 'Submitting…' : 'Submit Complaint'}
                        </button>
                        <button
                            type="reset"
                            onClick={handleReset}
                            className="btn-gov-outline"
                        >
                            Clear Form
                        </button>
                        <p className="text-xs text-[var(--color-muted)] ml-auto hidden sm:block">
                            By submitting, you agree to the&nbsp;
                            <a href="#" className="text-[var(--color-gov-600)] underline hover:no-underline">
                                Terms of Use
                            </a>
                        </p>
                    </div>

                </form>
            </div>
        </div>
    )
}

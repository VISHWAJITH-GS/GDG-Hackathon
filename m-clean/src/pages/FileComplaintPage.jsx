// src/pages/FileComplaintPage.jsx
// ---------------------------------------------------------------
// Citizen Complaint Filing Portal
// Allows citizens to report waste accumulation with photos and location
// ---------------------------------------------------------------

import { useState, useEffect } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../firebase'
import Button from '../components/Button'
import Toast from '../components/Toast'
import { ensureUserDocument, incrementUserTokens, createUserIdentifier } from '../utils/userManager'

export default function FileComplaintPage() {
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        email: '',
        address: '',
        wardNo: '',
        description: '',
        wasteType: 'mixed',
    })
    
    const [location, setLocation] = useState({ lat: null, lng: null })
    const [photo, setPhoto] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(null)
    const [loading, setLoading] = useState(false)
    const [toast, setToast] = useState({ show: false, message: '', type: 'info' })
    const [locationLoading, setLocationLoading] = useState(false)

    // Get current location on mount
    useEffect(() => {
        if ('geolocation' in navigator) {
            setLocationLoading(true)
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    })
                    setLocationLoading(false)
                },
                (error) => {
                    console.error('Geolocation error:', error)
                    setLocationLoading(false)
                    showToast('Unable to get location. Please enter manually.', 'warning')
                }
            )
        }
    }, [])

    function showToast(message, type = 'info') {
        setToast({ show: true, message, type })
    }

    function handleChange(e) {
        setFormData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }))
    }

    function handlePhotoChange(e) {
        const file = e.target.files?.[0]
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                showToast('File size must be less than 5MB', 'error')
                return
            }
            setPhoto(file)
            setPhotoPreview(URL.createObjectURL(file))
        }
    }

    async function handleSubmit(e) {
        e.preventDefault()
        setLoading(true)

        try {
            if (!photo) {
                throw new Error('Please upload a photo of the waste accumulation')
            }

            if (!location.lat || !location.lng) {
                throw new Error('Location is required. Please enable location access.')
            }

            // Create user identifier for token tracking
            const userId = createUserIdentifier(formData)

            // Ensure user document exists before submission
            await ensureUserDocument(userId, {
                name: formData.name,
                email: formData.email,
                phone: formData.phone
            })

            // Upload photo to Firebase Storage
            const photoRef = ref(storage, `complaints/${Date.now()}_${photo.name}`)
            await uploadBytes(photoRef, photo)
            const photoURL = await getDownloadURL(photoRef)

            // Create complaint document
            const complaintData = {
                ...formData,
                userId,
                location: {
                    lat: location.lat,
                    lng: location.lng
                },
                photoURL,
                status: 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                source: 'citizen_portal'
            }

            await addDoc(collection(db, 'reports'), complaintData)

            // Increment user tokens atomically after successful submission
            await incrementUserTokens(userId)

            // Store user info in sessionStorage for leaderboard personalization
            if (formData.phone) {
                sessionStorage.setItem('userPhone', formData.phone)
            }
            if (formData.email) {
                sessionStorage.setItem('userEmail', formData.email)
            }

            showToast('Complaint submitted successfully! You earned 1 participation token. View your profile to track your civic contributions.', 'success')
            
            // Reset form
            setFormData({
                name: '',
                phone: '',
                email: '',
                address: '',
                wardNo: '',
                description: '',
                wasteType: 'mixed',
            })
            setPhoto(null)
            setPhotoPreview(null)
        } catch (err) {
            console.error('Submission error:', err)
            showToast(err.message || 'Failed to submit complaint. Please try again.', 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[var(--color-surface)] py-8">
            <div className="max-w-3xl mx-auto px-4 sm:px-6">
                
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-gov-900)] mb-2">
                        File a Sanitation Complaint
                    </h1>
                    <p className="text-[var(--color-muted)]">
                        Report waste accumulation in your area. Our team will respond within 48 hours.
                    </p>
                </div>

                {/* Main Form Card */}
                <div className="gov-card p-6 sm:p-8 mb-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        
                        {/* Personal Information Section */}
                        <div>
                            <h2 className="text-lg font-bold text-[var(--color-gov-800)] mb-4 pb-2 border-b border-[var(--color-border)]">
                                Your Information
                            </h2>
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="name" className="field-label">
                                        Full Name <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        className="field-input"
                                        placeholder="Enter your full name"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="phone" className="field-label">
                                        Mobile Number <span className="req">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        id="phone"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        className="field-input"
                                        placeholder="10-digit mobile number"
                                        pattern="[0-9]{10}"
                                        required
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label htmlFor="email" className="field-label">
                                        Email Address (Optional)
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        className="field-input"
                                        placeholder="your.email@example.com"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Location Section */}
                        <div>
                            <h2 className="text-lg font-bold text-[var(--color-gov-800)] mb-4 pb-2 border-b border-[var(--color-border)]">
                                Complaint Location
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="address" className="field-label">
                                        Street Address <span className="req">*</span>
                                    </label>
                                    <textarea
                                        id="address"
                                        name="address"
                                        value={formData.address}
                                        onChange={handleChange}
                                        className="field-input"
                                        rows={2}
                                        placeholder="Enter the exact location of waste accumulation"
                                        required
                                    />
                                </div>
                                <div>
                                    <label htmlFor="wardNo" className="field-label">
                                        Ward Number <span className="req">*</span>
                                    </label>
                                    <select
                                        id="wardNo"
                                        name="wardNo"
                                        value={formData.wardNo}
                                        onChange={handleChange}
                                        className="field-input"
                                        required
                                    >
                                        <option value="">Select Ward</option>
                                        {Array.from({ length: 100 }, (_, i) => i + 1).map(num => (
                                            <option key={num} value={num}>Ward {num}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="bg-[var(--color-gov-50)] rounded p-4 flex items-start gap-3">
                                    <svg className="w-5 h-5 text-[var(--color-gov-700)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-[var(--color-gov-800)] mb-1">
                                            GPS Location
                                        </p>
                                        {locationLoading ? (
                                            <p className="text-xs text-[var(--color-muted)]">Getting your location...</p>
                                        ) : location.lat ? (
                                            <p className="text-xs text-[var(--color-muted)] font-mono">
                                                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-red-600">Location not available</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Waste Details Section */}
                        <div>
                            <h2 className="text-lg font-bold text-[var(--color-gov-800)] mb-4 pb-2 border-b border-[var(--color-border)]">
                                Complaint Details
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="wasteType" className="field-label">
                                        Waste Type <span className="req">*</span>
                                    </label>
                                    <select
                                        id="wasteType"
                                        name="wasteType"
                                        value={formData.wasteType}
                                        onChange={handleChange}
                                        className="field-input"
                                        required
                                    >
                                        <option value="mixed">Mixed Waste</option>
                                        <option value="plastic">Plastic Waste</option>
                                        <option value="organic">Organic Waste</option>
                                        <option value="construction">Construction Debris</option>
                                        <option value="medical">Medical Waste</option>
                                        <option value="electronic">Electronic Waste</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="description" className="field-label">
                                        Description <span className="req">*</span>
                                    </label>
                                    <textarea
                                        id="description"
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        className="field-input"
                                        rows={4}
                                        placeholder="Describe the waste accumulation issue in detail..."
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Photo Upload Section */}
                        <div>
                            <h2 className="text-lg font-bold text-[var(--color-gov-800)] mb-4 pb-2 border-b border-[var(--color-border)]">
                                Upload Photo
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="photo" className="field-label">
                                        Photo Evidence <span className="req">*</span>
                                    </label>
                                    <input
                                        type="file"
                                        id="photo"
                                        accept="image/*"
                                        onChange={handlePhotoChange}
                                        className="field-input"
                                        required
                                    />
                                    <p className="text-xs text-[var(--color-muted)] mt-1">
                                        Upload a clear photo of the waste. Max size: 5MB
                                    </p>
                                </div>
                                {photoPreview && (
                                    <div className="border border-[var(--color-border)] rounded p-4">
                                        <p className="text-sm font-semibold text-[var(--color-gov-800)] mb-2">Photo Preview:</p>
                                        <img 
                                            src={photoPreview} 
                                            alt="Waste preview" 
                                            className="w-full max-w-md h-auto rounded border border-[var(--color-border)]"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-4 border-t border-[var(--color-border)]">
                            <Button
                                type="submit"
                                variant="primary"
                                size="lg"
                                loading={loading}
                                className="w-full sm:w-auto px-8"
                            >
                                Submit Complaint
                            </Button>
                        </div>
                    </form>
                </div>

                {/* Information Card */}
                <div className="gov-card p-6 bg-[var(--color-gov-50)]">
                    <h3 className="text-sm font-bold text-[var(--color-gov-800)] mb-2">
                        What happens next?
                    </h3>
                    <ul className="text-xs text-[var(--color-muted)] space-y-2">
                        <li className="flex items-start gap-2">
                            <span className="text-[var(--color-gov-700)] font-bold">1.</span>
                            <span>Your complaint will be registered and you'll receive a tracking ID via SMS</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-[var(--color-gov-700)] font-bold">2.</span>
                            <span>AI will analyze the waste type and severity automatically</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-[var(--color-gov-700)] font-bold">3.</span>
                            <span>Municipal officers will assign a sanitation crew within 24 hours</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-[var(--color-gov-700)] font-bold">4.</span>
                            <span>You'll receive SMS updates on the cleanup progress</span>
                        </li>
                    </ul>
                </div>

            </div>

            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ show: false, message: '', type: 'info' })}
                />
            )}
        </div>
    )
}

// src/pages/LoginPage.jsx
// ---------------------------------------------------------------
// Dual Login Page — Tamil Nadu Government Portal
// Secure authentication for Citizens and Municipal Officers
// ---------------------------------------------------------------

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button'

function TNEmblemLarge() {
    return (
        <svg
            width="80" height="80" viewBox="0 0 80 80"
            fill="none" xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="mx-auto"
        >
            <rect x="12" y="12" width="56" height="56" rx="4" stroke="#104080" strokeWidth="3" fill="none" />
            <circle cx="40" cy="40" r="18" stroke="#104080" strokeWidth="3" fill="none" />
            <circle cx="40" cy="40" r="5" fill="#104080" />
            <text x="40" y="30" fontSize="14" fill="#104080" fontWeight="bold" textAnchor="middle">TN</text>
        </svg>
    )
}

export default function LoginPage() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState('citizen') // 'citizen' | 'officer'
    
    // Citizen form state
    const [citizenData, setCitizenData] = useState({
        identifier: '', // mobile or email
        otp: ''
    })
    const [otpSent, setOtpSent] = useState(false)
    const [mockOtp, setMockOtp] = useState('')
    
    // Officer form state
    const [officerData, setOfficerData] = useState({
        email: '',
        password: ''
    })
    
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    function handleCitizenChange(e) {
        setCitizenData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }))
        setError('')
    }

    function handleOfficerChange(e) {
        setOfficerData(prev => ({
            ...prev,
            [e.target.name]: e.target.value
        }))
        setError('')
    }

    async function handleSendOtp(e) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (!citizenData.identifier) {
                throw new Error('Please enter your mobile number or email')
            }

            // Simulate OTP sending delay
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Generate mock OTP for MVP
            const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString()
            setMockOtp(generatedOtp)
            setOtpSent(true)
            
            // In production, this would call Firebase Auth or SMS API
            console.log('Mock OTP sent:', generatedOtp)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleCitizenLogin(e) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (!citizenData.otp) {
                throw new Error('Please enter the OTP')
            }

            await new Promise(resolve => setTimeout(resolve, 800))

            // Verify mock OTP
            if (citizenData.otp === mockOtp) {
                sessionStorage.setItem('isAuthenticated', 'true')
                sessionStorage.setItem('userRole', 'citizen')
                sessionStorage.setItem('userName', 'Citizen')
                sessionStorage.setItem('userIdentifier', citizenData.identifier)
                navigate('/')
            } else {
                throw new Error('Invalid OTP. Please check and try again.')
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleOfficerLogin(e) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (!officerData.email || !officerData.password) {
                throw new Error('Please enter both email and password')
            }

            await new Promise(resolve => setTimeout(resolve, 800))

            // Demo credentials check
            if (officerData.email === 'officer@madurai.tn.gov.in' && officerData.password === 'admin123') {
                sessionStorage.setItem('isAuthenticated', 'true')
                sessionStorage.setItem('userRole', 'officer')
                sessionStorage.setItem('officerName', 'Municipal Officer')
                sessionStorage.setItem('officerEmail', officerData.email)
                navigate('/dashboard')
            } else {
                throw new Error('Invalid credentials. Please check your email and password.')
            }
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col">
            {/* Top utility bar */}
            <div className="bg-[var(--color-gov-900)] text-white text-xs py-1.5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
                    <span className="tracking-wide opacity-90 font-semibold">
                        Government of Tamil Nadu
                    </span>
                    <div className="flex items-center gap-4 opacity-70">
                        <span>தமிழ்</span>
                        <span>|</span>
                        <span>English</span>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 bg-[var(--color-surface)] flex items-center justify-center px-4 py-8 sm:py-12">
                <div className="w-full max-w-md">
                    
                    {/* Official Header */}
                    <div className="gov-card p-6 mb-6 text-center">
                        <TNEmblemLarge />
                        <h1 className="text-xl font-bold text-[var(--color-gov-900)] mt-4 mb-1">
                            Tamil Nadu Government
                        </h1>
                        <p className="text-base font-semibold text-[var(--color-gov-700)] mb-0.5">
                            Madurai Municipal Corporation
                        </p>
                        <p className="text-sm text-[var(--color-muted)]">
                            M-Clean Sanitation Portal
                        </p>
                    </div>

                    {/* Login Card */}
                    <div className="gov-card p-6">
                        
                        {/* Role Selection Tabs */}
                        <div className="flex border-b border-[var(--color-border)] mb-6">
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveTab('citizen')
                                    setError('')
                                    setOtpSent(false)
                                }}
                                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
                                    activeTab === 'citizen'
                                        ? 'text-[var(--color-gov-700)] border-b-2 border-[var(--color-gov-700)]'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-gov-600)]'
                                }`}
                            >
                                Citizen Login
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setActiveTab('officer')
                                    setError('')
                                }}
                                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
                                    activeTab === 'officer'
                                        ? 'text-[var(--color-gov-700)] border-b-2 border-[var(--color-gov-700)]'
                                        : 'text-[var(--color-muted)] hover:text-[var(--color-gov-600)]'
                                }`}
                            >
                                Officer Login
                            </button>
                        </div>

                        {error && (
                            <div className="gov-alert-error mb-4" role="alert">
                                {error}
                            </div>
                        )}

                        {/* Citizen Login Form */}
                        {activeTab === 'citizen' && !otpSent && (
                            <form onSubmit={handleSendOtp} className="space-y-4">
                                <div>
                                    <label htmlFor="identifier" className="field-label">
                                        Mobile Number or Email <span className="req">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        id="identifier"
                                        name="identifier"
                                        value={citizenData.identifier}
                                        onChange={handleCitizenChange}
                                        className="field-input"
                                        placeholder="Enter mobile number or email"
                                        autoComplete="username"
                                        required
                                    />
                                    <p className="text-xs text-[var(--color-muted)] mt-1">
                                        Enter your registered mobile number or email address
                                    </p>
                                </div>

                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="lg"
                                    loading={loading}
                                    className="w-full"
                                >
                                    Send OTP
                                </Button>
                            </form>
                        )}

                        {/* Citizen OTP Verification Form */}
                        {activeTab === 'citizen' && otpSent && (
                            <div className="space-y-4">
                                <div className="bg-[var(--color-gov-50)] rounded p-4 mb-4">
                                    <p className="text-sm font-semibold text-[var(--color-gov-800)] mb-1">
                                        OTP Sent Successfully
                                    </p>
                                    <p className="text-xs text-[var(--color-muted)] mb-2">
                                        Check your registered mobile/email for the verification code
                                    </p>
                                    <p className="text-xs font-mono bg-white rounded px-2 py-1 border border-[var(--color-border)]">
                                        Demo OTP: <strong className="text-[var(--color-gov-700)]">{mockOtp}</strong>
                                    </p>
                                </div>

                                <form onSubmit={handleCitizenLogin} className="space-y-4">
                                    <div>
                                        <label htmlFor="otp" className="field-label">
                                            Enter OTP <span className="req">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            id="otp"
                                            name="otp"
                                            value={citizenData.otp}
                                            onChange={handleCitizenChange}
                                            className="field-input"
                                            placeholder="Enter 6-digit OTP"
                                            maxLength={6}
                                            pattern="[0-9]{6}"
                                            autoComplete="one-time-code"
                                            required
                                        />
                                    </div>

                                    <div className="flex gap-3">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="lg"
                                            onClick={() => {
                                                setOtpSent(false)
                                                setCitizenData({ identifier: citizenData.identifier, otp: '' })
                                            }}
                                            className="flex-1"
                                        >
                                            Back
                                        </Button>
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="lg"
                                            loading={loading}
                                            className="flex-1"
                                        >
                                            Verify & Login
                                        </Button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Officer Login Form */}
                        {activeTab === 'officer' && (
                            <form onSubmit={handleOfficerLogin} className="space-y-4">
                                <div>
                                    <label htmlFor="email" className="field-label">
                                        Official Email <span className="req">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={officerData.email}
                                        onChange={handleOfficerChange}
                                        className="field-input"
                                        placeholder="officer@madurai.tn.gov.in"
                                        autoComplete="email"
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="password" className="field-label">
                                        Password <span className="req">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        id="password"
                                        name="password"
                                        value={officerData.password}
                                        onChange={handleOfficerChange}
                                        className="field-input"
                                        placeholder="Enter your password"
                                        autoComplete="current-password"
                                        required
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="lg"
                                    loading={loading}
                                    className="w-full"
                                >
                                    Sign In
                                </Button>

                                {/* Demo credentials */}
                                <div className="mt-6 pt-6 border-t border-[var(--color-border)]">
                                    <p className="text-xs text-[var(--color-muted)] text-center mb-2">
                                        Demo Credentials (for testing):
                                    </p>
                                    <div className="bg-[var(--color-gov-50)] rounded p-3 text-xs font-mono space-y-1">
                                        <p><strong>Email:</strong> officer@madurai.tn.gov.in</p>
                                        <p><strong>Password:</strong> admin123</p>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>

                    {/* Security Notice */}
                    <div className="mt-6 gov-card p-4">
                        <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-[var(--color-gov-700)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <div>
                                <p className="text-sm font-semibold text-[var(--color-gov-800)] mb-1">
                                    Security Notice
                                </p>
                                <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                                    Authorized use only. Unauthorized access is prohibited and 
                                    may result in legal action under the Information Technology Act, 2000.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Back to home */}
                    <div className="text-center mt-4">
                        <button
                            onClick={() => navigate('/')}
                            className="text-sm text-[var(--color-gov-700)] hover:underline font-semibold"
                        >
                            ← Back to Home
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="bg-[var(--color-gov-900)] text-white py-4">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-xs text-blue-300">
                    <span>
                        © {new Date().getFullYear()} Madurai Municipal Corporation, Government of Tamil Nadu.
                    </span>
                </div>
            </footer>
        </div>
    )
}

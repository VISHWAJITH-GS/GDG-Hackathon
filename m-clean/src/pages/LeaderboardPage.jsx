// src/pages/LeaderboardPage.jsx
// ---------------------------------------------------------------
// Citizen Participation Leaderboard
// Recognizes active civic contributors through token-based ranking
// ---------------------------------------------------------------

import { useState, useEffect } from 'react'
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore'
import { db } from '../firebase'
import { createUserIdentifier } from '../utils/userManager'

function RankBadge({ rank }) {
    const badges = {
        1: { label: 'Gold', color: '#FFD700', bgColor: '#FEF3C7', textColor: '#92400E' },
        2: { label: 'Silver', color: '#C0C0C0', bgColor: '#E5E7EB', textColor: '#374151' },
        3: { label: 'Bronze', color: '#CD7F32', bgColor: '#FED7AA', textColor: '#9A3412' }
    }

    const badge = badges[rank]

    if (!badge) {
        return (
            <div className="w-10 h-10 rounded-full bg-[var(--color-gov-100)] flex items-center justify-center border-2 border-[var(--color-gov-300)]">
                <span className="text-sm font-bold text-[var(--color-gov-700)]">{rank}</span>
            </div>
        )
    }

    return (
        <div 
            className="w-10 h-10 rounded-full flex items-center justify-center border-2 font-bold text-sm relative"
            style={{ 
                backgroundColor: badge.bgColor,
                borderColor: badge.color,
                color: badge.textColor
            }}
            title={`${badge.label} Medal`}
        >
            {rank}
        </div>
    )
}

function LeaderboardRow({ rank, user, isCurrentUser }) {
    return (
        <tr className={`border-b border-[var(--color-border)] hover:bg-[var(--color-gov-50)] transition-colors ${isCurrentUser ? 'bg-blue-50' : ''}`}>
            <td className="px-4 py-4">
                <div className="flex items-center justify-center">
                    <RankBadge rank={rank} />
                </div>
            </td>
            <td className="px-4 py-4">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--color-gov-900)]">
                        {user.name}
                        {isCurrentUser && (
                            <span className="ml-2 text-xs font-normal text-[var(--color-gov-700)] bg-[var(--color-gov-100)] px-2 py-0.5 rounded">
                                You
                            </span>
                        )}
                    </span>
                </div>
            </td>
            <td className="px-4 py-4 text-center">
                <span className="text-[var(--color-muted)]">{user.total_complaints || 0}</span>
            </td>
            <td className="px-4 py-4 text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--color-gov-700)] text-white rounded-full text-sm font-semibold">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {user.tokens || 0}
                </span>
            </td>
        </tr>
    )
}

function YourRankCard({ rank, tokens, complaints }) {
    return (
        <div className="gov-card p-6 bg-gradient-to-br from-[var(--color-gov-700)] to-[var(--color-gov-800)] text-white mb-6">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm opacity-90 mb-1">Your Current Rank</p>
                    <p className="text-4xl font-bold">#{rank}</p>
                </div>
                <div className="text-right">
                    <div className="flex items-center gap-2 justify-end mb-2">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="text-2xl font-bold">{tokens}</span>
                        <span className="text-sm opacity-90">tokens</span>
                    </div>
                    <p className="text-xs opacity-80">{complaints} complaints submitted</p>
                </div>
            </div>
        </div>
    )
}

export default function LeaderboardPage() {
    const [leaderboard, setLeaderboard] = useState([])
    const [loading, setLoading] = useState(true)
    const [currentUserData, setCurrentUserData] = useState(null)
    const [currentUserRank, setCurrentUserRank] = useState(null)

    useEffect(() => {
        const q = query(
            collection(db, 'users'),
            where('role', '==', 'citizen'),
            orderBy('tokens', 'desc'),
            limit(20)
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }))
            
            setLeaderboard(users)
            setLoading(false)

            const currentUserPhone = sessionStorage.getItem('userPhone')
            const currentUserEmail = sessionStorage.getItem('userEmail')
            
            if (currentUserPhone || currentUserEmail) {
                let userId
                try {
                    userId = createUserIdentifier({ 
                        phone: currentUserPhone, 
                        email: currentUserEmail 
                    })
                } catch (err) {
                    console.log('No user identifier available')
                }

                if (userId) {
                    const userIndex = users.findIndex(u => u.id === userId)
                    if (userIndex !== -1) {
                        setCurrentUserData(users[userIndex])
                        setCurrentUserRank(userIndex + 1)
                    }
                }
            }
        })

        return () => unsubscribe()
    }, [])

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--color-surface)] flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[var(--color-gov-700)] border-t-transparent mb-4"></div>
                    <p className="text-[var(--color-muted)]">Loading leaderboard...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[var(--color-surface)] py-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
                
                {/* Header Section */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-3">
                        <svg className="w-8 h-8 text-[var(--color-gov-700)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--color-gov-900)]">
                            Citizen Civic Participation Leaderboard
                        </h1>
                    </div>
                    <p className="text-[var(--color-muted)] max-w-3xl">
                        Recognizing Active Contributors to Clean Madurai. This leaderboard recognizes civic participation 
                        in reporting sanitation issues and contributing to a cleaner, healthier city.
                    </p>
                </div>

                {/* Your Rank Section (if logged in with session data) */}
                {currentUserData && currentUserRank && (
                    <YourRankCard 
                        rank={currentUserRank}
                        tokens={currentUserData.tokens || 0}
                        complaints={currentUserData.total_complaints || 0}
                    />
                )}

                {/* Information Card */}
                <div className="gov-card p-4 mb-6 bg-[var(--color-gov-50)] border-l-4 border-[var(--color-gov-700)]">
                    <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-[var(--color-gov-700)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                            <p className="text-sm font-semibold text-[var(--color-gov-900)] mb-1">
                                How Tokens Work
                            </p>
                            <p className="text-xs text-[var(--color-muted)]">
                                Each time you submit a verified sanitation complaint, you earn 1 participation token. 
                                Tokens represent your contribution to civic cleanliness and are tracked in real-time. 
                                Keep reporting issues to climb the leaderboard!
                            </p>
                        </div>
                    </div>
                </div>

                {/* Leaderboard Table */}
                <div className="gov-card overflow-hidden">
                    {leaderboard.length === 0 ? (
                        <div className="p-12 text-center">
                            <svg className="w-16 h-16 text-[var(--color-muted)] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="text-[var(--color-muted)]">No participants yet. Be the first to report and earn tokens!</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-[var(--color-gov-700)] text-white">
                                    <tr>
                                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                                            Rank
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                                            Citizen Name
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                                            Total Complaints
                                        </th>
                                        <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider">
                                            Tokens
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-[var(--color-border)]">
                                    {leaderboard.map((user, index) => (
                                        <LeaderboardRow
                                            key={user.id}
                                            rank={index + 1}
                                            user={user}
                                            isCurrentUser={currentUserData?.id === user.id}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer Note */}
                <div className="mt-6 text-center text-xs text-[var(--color-muted)]">
                    <p>
                        Leaderboard updates in real-time. Rankings are based on verified complaints submitted through the M-Clean portal.
                    </p>
                    <p className="mt-2">
                        Only citizen accounts are displayed. Municipal officers are excluded from public rankings.
                    </p>
                </div>

            </div>
        </div>
    )
}

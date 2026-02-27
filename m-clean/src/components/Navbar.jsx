// src/components/Navbar.jsx
// ---------------------------------------------------------
// Top navigation bar shared across all pages.
// Highlights the active route and provides mobile-friendly
// touch targets.
// ---------------------------------------------------------

import { NavLink } from 'react-router-dom'

// Nav item definition — add new pages here
const NAV_ITEMS = [
    { to: '/', label: 'Report', icon: '📷' },
    { to: '/dashboard', label: 'Dashboard', icon: '🗂️' },
]

export default function Navbar() {
    return (
        <header className="sticky top-0 z-50 glass">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
                {/* Brand */}
                <span className="flex items-center gap-2 select-none">
                    <span className="text-2xl">🌿</span>
                    <span className="font-extrabold text-lg tracking-tight gradient-text">
                        m-clean
                    </span>
                </span>

                {/* Navigation links */}
                <nav className="flex gap-1">
                    {NAV_ITEMS.map(({ to, label, icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'} // exact match only for home
                            className={({ isActive }) =>
                                [
                                    'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                                    isActive
                                        ? 'bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40'
                                        : 'text-slate-400 hover:text-slate-100 hover:bg-white/5',
                                ].join(' ')
                            }
                        >
                            <span aria-hidden="true">{icon}</span>
                            {label}
                        </NavLink>
                    ))}
                </nav>
            </div>
        </header>
    )
}

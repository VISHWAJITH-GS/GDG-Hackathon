// src/components/Navbar.jsx
// ---------------------------------------------------------
// Top navigation bar for Tamil Nadu Government portal.
// Formal, clean design without emojis or playful elements.
// ---------------------------------------------------------

import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
    { to: '/', label: 'Report', icon: null },
    { to: '/dashboard', label: 'Dashboard', icon: null },
]

export default function Navbar() {
    return (
        <header className="sticky top-0 z-50 bg-white border-b border-[#D1D9E6]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
                <span className="flex items-center gap-2 select-none">
                    <span className="font-bold text-lg text-[#104080] tracking-tight">
                        Aqro 
                    </span>
                </span>

                <nav className="flex gap-1">
                    {NAV_ITEMS.map(({ to, label, icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            className={({ isActive }) =>
                                [
                                    'flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold transition-colors duration-200',
                                    isActive
                                        ? 'bg-[#104080] text-white'
                                        : 'text-[#5A6E8A] hover:text-[#104080] hover:bg-[#f4f6f9]',
                                ].join(' ')
                            }
                        >
                            {label}
                        </NavLink>
                    ))}
                </nav>
            </div>
        </header>
    )
}

// src/components/Button.jsx
// --------------------------------------------------
// Reusable button with variant, size & loading state.
// Tamil Nadu Government official design style.
// Glassy finish with orange on active/click state.
// Variants: "primary" | "secondary" | "ghost" | "danger"
// Sizes: "sm" | "md" | "lg"
// --------------------------------------------------

const VARIANTS = {
    // Glassy deep-blue — highlights on hover, orange on press
    primary: [
        'text-white border border-white/20',
        '[background:linear-gradient(160deg,rgba(21,87,160,0.92)_0%,rgba(10,52,104,0.96)_100%)]',
        'shadow-[0_4px_14px_rgba(16,64,128,0.28),inset_0_1px_0_rgba(255,255,255,0.15)]',
        'hover:[background:linear-gradient(160deg,rgba(26,107,191,0.95)_0%,rgba(16,64,128,0.98)_100%)]',
        'hover:shadow-[0_6px_20px_rgba(16,64,128,0.38),inset_0_1px_0_rgba(255,255,255,0.18)] hover:-translate-y-px',
        'active:![background:linear-gradient(160deg,rgba(234,88,12,0.95)_0%,rgba(194,65,12,0.98)_100%)]',
        'active:!border-orange-500/50 active:!shadow-[0_2px_8px_rgba(234,88,12,0.4)] active:translate-y-0 active:scale-[0.99]',
        'backdrop-blur-sm',
    ].join(' '),

    // Glassy white / outline — orange border + text on press
    secondary: [
        'bg-white/50 border-[1.5px] border-[#104080]/40 text-[#104080]',
        'backdrop-blur-sm',
        'shadow-[0_2px_8px_rgba(16,64,128,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]',
        'hover:bg-white/80 hover:shadow-[0_4px_12px_rgba(16,64,128,0.15)] hover:-translate-y-px',
        'active:!bg-orange-50 active:!border-orange-500 active:!text-orange-600 active:translate-y-0 active:scale-[0.99]',
    ].join(' '),

    ghost: [
        'bg-transparent border border-[#D1D9E6] text-[#104080]',
        'hover:bg-[#f4f6f9] hover:-translate-y-px',
        'active:!bg-orange-50 active:!border-orange-400 active:!text-orange-600 active:translate-y-0 active:scale-[0.99]',
    ].join(' '),

    danger: [
        'text-white border border-[#B22222]/30',
        '[background:linear-gradient(160deg,rgba(178,34,34,0.9)_0%,rgba(139,26,26,0.95)_100%)]',
        'shadow-[0_4px_14px_rgba(178,34,34,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]',
        'hover:[background:linear-gradient(160deg,rgba(185,40,40,0.95)_0%,rgba(150,30,30,0.98)_100%)] hover:-translate-y-px',
        'active:![background:linear-gradient(160deg,rgba(234,88,12,0.95)_0%,rgba(194,65,12,0.98)_100%)] active:translate-y-0 active:scale-[0.99]',
        'backdrop-blur-sm',
    ].join(' '),
}

const SIZES = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3 text-base',
}

export default function Button({
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    className = '',
    ...props
}) {
    return (
        <button
            disabled={loading || props.disabled}
            className={[
                'inline-flex items-center justify-center gap-2 rounded-md font-semibold',
                'transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
                'relative overflow-hidden',
                VARIANTS[variant] ?? VARIANTS.primary,
                SIZES[size] ?? SIZES.md,
                className,
            ].join(' ')}
            {...props}
        >
            {loading && (
                <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v8H4z"
                    />
                </svg>
            )}
            {children}
        </button>
    )
}

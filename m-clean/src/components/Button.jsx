// src/components/Button.jsx
// --------------------------------------------------
// Reusable button with variant, size & loading state.
// Variants: "primary" | "ghost" | "danger"
// Sizes: "sm" | "md" | "lg"
// --------------------------------------------------

const VARIANTS = {
    primary: 'bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-green-900/30',
    ghost: 'bg-white/5 hover:bg-white/10 text-slate-200 ring-1 ring-white/10',
    danger: 'bg-red-500/20 hover:bg-red-500/30 text-red-300 ring-1 ring-red-500/40',
}

const SIZES = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-7 py-3.5 text-base',
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
                'inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
                'transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed',
                VARIANTS[variant] ?? VARIANTS.primary,
                SIZES[size] ?? SIZES.md,
                className,
            ].join(' ')}
            {...props}
        >
            {/* Spinner shown when loading */}
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

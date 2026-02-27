// src/components/Button.jsx
// --------------------------------------------------
// Reusable button with variant, size & loading state.
// Tamil Nadu Government official design style.
// Variants: "primary" | "secondary" | "ghost" | "danger"
// Sizes: "sm" | "md" | "lg"
// --------------------------------------------------

const VARIANTS = {
    primary: 'bg-[#104080] hover:bg-[#0a3468] text-white border border-[#104080]',
    secondary: 'bg-white hover:bg-[#f0f6fc] text-[#104080] border border-[#104080]',
    ghost: 'bg-transparent hover:bg-[#f4f6f9] text-[#104080] border border-[#D1D9E6]',
    danger: 'bg-[#B22222] hover:bg-[#8B1A1A] text-white border border-[#B22222]',
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
                'inline-flex items-center justify-center gap-2 rounded font-semibold',
                'transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
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

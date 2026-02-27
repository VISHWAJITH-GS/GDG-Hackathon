// src/config.js
// ---------------------------------------------------------------
// Central environment configuration for Aqro .
// All env variables are read ONCE here and exported as constants.
// Components import from here — never from import.meta.env directly.
// ---------------------------------------------------------------

// ── Raw values ─────────────────────────────────────────────────
export const FUNCTIONS_BASE =
    import.meta.env.VITE_FUNCTIONS_BASE_URL?.trim() ?? ''

export const MAPS_API_KEY =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''

// ── Validation flags ───────────────────────────────────────────
export const FUNCTIONS_CONFIGURED =
    !!FUNCTIONS_BASE &&
    !FUNCTIONS_BASE.includes('YOUR_PROJECT_ID') &&
    FUNCTIONS_BASE.startsWith('https://')

export const MAPS_CONFIGURED =
    !!MAPS_API_KEY &&
    MAPS_API_KEY.length > 10 &&
    !MAPS_API_KEY.startsWith('YOUR_')

// ── Console warnings at module load time ──────────────────────
if (!FUNCTIONS_CONFIGURED) {
    console.error(
        '[Aqro ] ⚠️  VITE_FUNCTIONS_BASE_URL is missing or invalid.\n' +
        '           Add it to Aqro /.env:\n' +
        '           VITE_FUNCTIONS_BASE_URL=https://asia-south1-madurai-clean-ai-ffce1.cloudfunctions.net'
    )
}

if (!MAPS_CONFIGURED) {
    console.error(
        '[Aqro ] ⚠️  VITE_GOOGLE_MAPS_API_KEY is missing or invalid.\n' +
        '           Add it to Aqro /.env:\n' +
        '           VITE_GOOGLE_MAPS_API_KEY=<your_key>'
    )
}

// ── Fixed constants ────────────────────────────────────────────
export const NUM_WORKERS = 25
export const NUM_TRUCKS = 8

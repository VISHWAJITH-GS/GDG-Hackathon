// src/firebase.js
// ---------------------------------------------------------------
// Firebase modular SDK initialisation (v9+).
// All credentials are read from environment variables.
// Run `cp .env.example .env` and fill in real values from the
// Firebase Console → Project Settings → Your apps → Config.
// ---------------------------------------------------------------

import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Guard: warn clearly if Firebase is not configured
const REQUIRED_FIREBASE_KEYS = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
]
const missingFirebase = REQUIRED_FIREBASE_KEYS.filter(
    (k) => !import.meta.env[k]
)
if (missingFirebase.length > 0) {
    console.error(
        '[M-Clean] 🔥 Missing Firebase env vars:\n  ' +
        missingFirebase.join('\n  ') +
        '\n  Add them to m-clean/.env — see .env.example for reference.'
    )
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

export { app, auth, db, storage }

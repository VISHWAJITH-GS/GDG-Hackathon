// src/firebase.js
// ---------------------------------------------------------------
// Firebase modular SDK initialisation (v9+).
// Credentials are loaded from .env (VITE_ prefix).
// ---------------------------------------------------------------

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getAnalytics, isSupported } from 'firebase/analytics'

const firebaseConfig = {
    apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? 'YOUR_API_KEY',
    authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? 'YOUR_PROJECT.firebaseapp.com',
    projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? 'YOUR_PROJECT_ID',
    storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? 'YOUR_PROJECT.appspot.com',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? 'YOUR_SENDER_ID',
    appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? 'YOUR_APP_ID',
    measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     ?? undefined,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const storage = getStorage(app)
const auth = getAuth(app)
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

// Analytics — only initialised in browsers that support it (not SSR / bots)
isSupported().then(yes => { if (yes) getAnalytics(app) })

export { app, db, storage, auth, googleProvider }

// src/context/AuthContext.jsx
// ---------------------------------------------------------------
// Global auth state provider.
// Wraps the app and exposes { user, userDoc, loading }.
//   user    — Firebase Auth user object (or null)
//   userDoc — Firestore "users/{uid}" document data (or null)
//   loading — true while onAuthStateChanged hasn't resolved yet
// ---------------------------------------------------------------

import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true) // reset on every auth change — ProtectedRoute waits
      if (firebaseUser) {
        setUser(firebaseUser)
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
          setUserDoc(snap.exists() ? snap.data() : null)
        } catch {
          setUserDoc(null)
        }
      } else {
        setUser(null)
        setUserDoc(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Call this after creating a new user doc so AuthContext is immediately up-to-date
  async function refreshUserDoc(uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid))
      setUserDoc(snap.exists() ? snap.data() : null)
    } catch {
      setUserDoc(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, userDoc, loading, refreshUserDoc }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

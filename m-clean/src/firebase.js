// src/firebase.js
// ---------------------------------------------------------------
// Firebase configuration placeholder.
// Replace the firebaseConfig object below with your own project
// credentials from the Firebase Console once backend is ready.
// ---------------------------------------------------------------

// import { initializeApp } from 'firebase/app'
// import { getFirestore }   from 'firebase/firestore'
// import { getStorage }     from 'firebase/storage'
// import { getAuth }        from 'firebase/auth'

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
}

// const app       = initializeApp(firebaseConfig)
// const db        = getFirestore(app)
// const storage   = getStorage(app)
// const auth      = getAuth(app)

// export { app, db, storage, auth }

export default firebaseConfig

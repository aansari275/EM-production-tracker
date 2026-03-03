import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

// Firebase configuration for easternmillscom project
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDummyKeyForDevelopment',
  authDomain: 'easternmillscom.firebaseapp.com',
  projectId: 'easternmillscom',
  storageBucket: 'easternmillscom.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

// Google Auth provider restricted to easternmills.com domain
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ hd: 'easternmills.com' })

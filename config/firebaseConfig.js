// backend/config/firebaseConfig.js
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const { getAuth } = require('firebase/auth');

// Your Firebase Web Config (100% public — safe to commit)
const firebaseConfig = {
  apiKey: "AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "migingo-store.firebaseapp.com",
  projectId: "migingo-store",
  storageBucket: "migingo-store.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789012"
};

// Initialize Firebase once
const app = initializeApp(firebaseConfig);

// Export only what you need
const db = getFirestore(app);
const auth = getAuth(app);

module.exports = { db, auth };
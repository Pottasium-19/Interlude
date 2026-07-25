// firebase.js
// Single responsibility: initialize Firebase and export the Firestore instance.
// Replace the values below with your own Firebase project's config
// (Firebase Console > Project Settings > General > Your apps > SDK setup).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCaKh9hAdVy243Fb7dwIcfi5Xey2SObv8s",
  authDomain: "interlude-d276d.firebaseapp.com",
  projectId: "interlude-d276d",
  storageBucket: "interlude-d276d.firebasestorage.app",
  messagingSenderId: "593151886590",
  appId: "1:593151886590:web:5ed8d602cf7cd8679411af",
  measurementId: "G-NDZJSQD3X9"
};

const app = initializeApp(firebaseConfig);

// Exported once, reused by every other module. Nothing else in the
// codebase should call initializeApp again.
export const db = getFirestore(app);

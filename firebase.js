// firebase.js
// Single responsibility: initialize Firebase and export the Firestore instance.
// Replace the values below with your own Firebase project's config
// (Firebase Console > Project Settings > General > Your apps > SDK setup).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);

// Exported once, reused by every other module. Nothing else in the
// codebase should call initializeApp again.
export const db = getFirestore(app);

// --- FIREBASE CONFIGURATION (MODULAR V12.10.0) ---
const firebaseConfig = {
    apiKey: "AIzaSyChIHC7HP8GRVmGKbrM-lzA7AMhXs96p_M",
    authDomain: "iraqi-archive.firebaseapp.com",
    projectId: "iraqi-archive",
    storageBucket: "iraqi-archive.firebasestorage.app",
    messagingSenderId: "43267192357",
    appId: "1:43267192357:web:56d5a684c6ee97aeff71cc"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut,
    sendPasswordResetEmail,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

import { 
    getFirestore, 
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, addDoc, getDocs,
    arrayUnion, arrayRemove, onSnapshot, query
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { 
    initializeAppCheck, 
    ReCaptchaV3Provider 
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app-check.js";

const ADMIN_EMAIL = 'alaidan25@gmail.com';

const app = initializeApp(firebaseConfig);

// 🛡️ SPAM PROTECTION: ENABLE LOCALHOST DEBUGGING
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

// 🛡️ SPAM PROTECTION: INITIALIZE iNVISIBLE RECAPTCHA V3
const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('PASTE_YOUR_RECAPTCHA_SITE_KEY_HERE'),
    isTokenAutoRefreshEnabled: true
});

const auth = getAuth(app);
const db = getFirestore(app);

export { 
    auth, db, 
    ADMIN_EMAIL,
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut,
    sendPasswordResetEmail,
    sendEmailVerification,
    doc, getDoc, setDoc, updateDoc, deleteDoc,
    collection, addDoc, getDocs,
    arrayUnion, arrayRemove, onSnapshot, query
};

/**
 * auth.js — Iraqi Archive Identity System
 * Handles Login, Sign-up, and Email Verification
 */

import { 
    auth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    sendPasswordResetEmail,
    sendEmailVerification,
    signOut
} from './firebase-config.js';

import { showToast } from './utils.js';

// --- UI ELEMENTS ---
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');
const errorDiv = document.getElementById('error-message');
const successDiv = document.getElementById('success-message');

const toggleBtn = document.getElementById('toggle-auth');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const toggleArea = document.querySelector('.toggle-area');
const togglePrompt = document.getElementById('toggle-prompt');

const forgotPasswordLink = document.getElementById('forgot-password-link');
const resetView = document.getElementById('reset-view');
const resetEmailInput = document.getElementById('reset-email');
const sendResetBtn = document.getElementById('send-reset-btn');
const resetBtnText = document.getElementById('reset-btn-text');
const resetBtnSpinner = document.getElementById('reset-btn-spinner');
const backToLoginBtn = document.getElementById('back-to-login');

// Verification View Elements
const verifyView = document.getElementById('verify-view');
const refreshVerifyBtn = document.getElementById('refresh-verify-btn');
const resendVerifyBtn = document.getElementById('resend-verify-btn');
const verifyBackToLogin = document.getElementById('verify-back-to-login');

let mode = 'login'; // 'login', 'signup', 'reset', or 'verify'

// --- ERROR MAPPING ---
const errorMessages = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/invalid-credential': 'Invalid email or password. Please check your credentials.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.'
};

// --- AUTH STATE OBSERVER ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Critical: Reload user data to get latest verification status
        await user.reload();
        
        if (user.emailVerified) {
            // Force refresh token to update claims (like email_verified) for Firestore
            await user.getIdToken(true);
            
            // Only redirect if NOT in special modes
            if (mode !== 'reset' && mode !== 'verify') {
                window.location.href = 'index.html';
            }
        } else {
            // User is logged in but NOT verified
            if (mode !== 'verify') switchView('verify');
        }
    } else {
        // If not logged in and we are in verify mode, go back to login
        if (mode === 'verify') switchView('login');
    }
});

// --- UI ACTIONS ---
forgotPasswordLink?.addEventListener('click', () => switchView('reset'));
backToLoginBtn?.addEventListener('click', () => switchView('login'));
verifyBackToLogin?.addEventListener('click', () => {
    signOut(auth).then(() => switchView('login'));
});

toggleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(mode === 'login' ? 'signup' : 'login');
});

refreshVerifyBtn?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (user) {
        await user.reload();
        if (user.emailVerified) {
            // Force refresh the ID token so security rules recognize the verified status
            await user.getIdToken(true);
            showToast('Identity Activated!', 'success');
            window.location.href = 'index.html';
        } else {
            showToast('Verification not detected yet.', 'error');
        }
    }
});

resendVerifyBtn?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (user) {
        try {
            await sendEmailVerification(user);
            showToast('Verification Sent. Check your inbox.', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    }
});

function switchView(newMode) {
    mode = newMode;
    hideAllMessages();
    
    // Hide all main containers
    authForm.classList.add('hidden');
    resetView.classList.add('hidden');
    verifyView.classList.add('hidden');
    toggleArea.classList.remove('hidden');
    
    if (mode === 'reset') {
        resetView.classList.remove('hidden');
        toggleArea.classList.add('hidden');
        authTitle.textContent = 'Reset Password';
        authSubtitle.textContent = 'Enter your email to receive a recovery link.';
    } else if (mode === 'verify') {
        verifyView.classList.remove('hidden');
        toggleArea.classList.add('hidden');
        authTitle.textContent = 'Active Check Required';
        authSubtitle.textContent = 'Your identity is pending cryptographic confirmation.';
    } else {
        authForm.classList.remove('hidden');
        if (mode === 'signup') {
            authTitle.textContent = 'Create Account';
            authSubtitle.textContent = 'Join the Iraqi Archive to save your findings.';
            btnText.textContent = 'Sign Up';
            togglePrompt.textContent = 'Already have an account?';
            toggleBtn.textContent = 'Log In';
        } else {
            authTitle.textContent = 'Welcome Back';
            authSubtitle.textContent = 'Please enter your details to sign in.';
            btnText.textContent = 'Log In';
            togglePrompt.textContent = "Don't have an account?";
            toggleBtn.textContent = 'Sign Up';
        }
    }
}

// --- FORM SUBMISSION ---
authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    setLoading(submitBtn, btnText, btnSpinner, true);
    hideAllMessages();

    try {
        if (mode === 'login') {
            const result = await signInWithEmailAndPassword(auth, email, password);
            if (!result.user.emailVerified) {
                switchView('verify');
            } else {
                showToast('Welcome back!', 'success');
            }
        } else {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(result.user);
            showToast('Account created! Verify your email.', 'success');
            switchView('verify');
        }
    } catch (error) {
        if (mode === 'signup' && error.code === 'auth/email-already-in-use') {
            try {
                // Attempt seamless recovery
                const result = await signInWithEmailAndPassword(auth, email, password);
                if (!result.user.emailVerified) {
                    await sendEmailVerification(result.user);
                    showToast('Account recovered! A new link has been sent.', 'success');
                    switchView('verify');
                } else {
                    await user.getIdToken(true);
                    showToast('Account already exists. Welcome back!', 'success');
                    window.location.href = 'index.html';
                }
            } catch (recoveryErr) {
                // If login fails, the password was wrong for the existing account
                showError('This email is already registered. Please Log In or reset your password.');
            }
        } else {
            showError(errorMessages[error.code] || error.message);
        }
        setLoading(submitBtn, btnText, btnSpinner, false);
    }
});

// --- PASSWORD RESET SUBMISSION ---
sendResetBtn?.addEventListener('click', async () => {
    const email = resetEmailInput.value.trim();
    if (!email) return showError('Please enter your email.');

    setLoading(sendResetBtn, resetBtnText, resetBtnSpinner, true);
    hideAllMessages();

    try {
        await sendPasswordResetEmail(auth, email);
        showSuccess('Reset link sent! Please check your inbox.');
        showToast('Password reset email sent.', 'success');
        setTimeout(() => switchView('login'), 3000);
    } catch (error) {
        showError(errorMessages[error.code] || error.message);
    } finally {
        setLoading(sendResetBtn, resetBtnText, resetBtnSpinner, false);
    }
});

// --- HELPER FUNCTIONS ---
function setLoading(btn, textEl, spinnerEl, isLoading) {
    btn.disabled = isLoading;
    if (isLoading) {
        textEl.classList.add('hidden');
        spinnerEl.classList.remove('hidden');
    } else {
        textEl.classList.remove('hidden');
        spinnerEl.classList.add('hidden');
    }
}

function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
}

function showSuccess(msg) {
    successDiv.textContent = msg;
    successDiv.classList.remove('hidden');
}

function hideAllMessages() {
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
}

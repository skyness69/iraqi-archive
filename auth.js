import { 
    auth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged,
    sendPasswordResetEmail 
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

let mode = 'login'; // 'login', 'signup', or 'reset'

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
onAuthStateChanged(auth, (user) => {
    if (user && mode !== 'reset') {
        window.location.href = 'index.html';
    }
});

// --- TOGGLE ACTIONS ---
forgotPasswordLink.addEventListener('click', () => {
    switchView('reset');
});

backToLoginBtn.addEventListener('click', () => {
    switchView('login');
});

toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(mode === 'login' ? 'signup' : 'login');
});

function switchView(newMode) {
    mode = newMode;
    hideAllMessages();
    
    // Hide/Show correct forms
    if (mode === 'reset') {
        authForm.classList.add('hidden');
        resetView.classList.remove('hidden');
        toggleArea.classList.add('hidden');
        
        authTitle.textContent = 'Reset Password';
        authSubtitle.textContent = 'Enter your email to receive a recovery link.';
    } else {
        authForm.classList.remove('hidden');
        resetView.classList.add('hidden');
        toggleArea.classList.remove('hidden');
        
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
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    setLoading(submitBtn, btnText, btnSpinner, true);
    hideAllMessages();

    try {
        if (mode === 'login') {
            await signInWithEmailAndPassword(auth, email, password);
            showToast('Welcome back!', 'success');
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
            showToast('Account created successfully!', 'success');
        }
    } catch (error) {
        showError(errorMessages[error.code] || error.message);
        setLoading(submitBtn, btnText, btnSpinner, false);
    }
});

// --- PASSWORD RESET SUBMISSION ---
sendResetBtn.addEventListener('click', async () => {
    const email = resetEmailInput.value.trim();
    if (!email) {
        showError('Please enter your email address first.');
        return;
    }

    setLoading(sendResetBtn, resetBtnText, resetBtnSpinner, true);
    hideAllMessages();

    try {
        await sendPasswordResetEmail(auth, email);
        showSuccess('Reset link sent! Please check your inbox.');
        showToast('Password reset email sent.', 'success');
        // Optional: switch back to login after a delay
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

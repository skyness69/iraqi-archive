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
    'auth/user-not-found': 'لم يتم العثور على حساب بهذا البريد.',
    'auth/wrong-password': 'كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى.',
    'auth/invalid-email': 'يرجى إدخال بريد إلكتروني صحيح.',
    'auth/email-already-in-use': 'هذا البريد الإلكتروني مسجل مسبقاً.',
    'auth/invalid-credential': 'البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التأكد من البيانات.',
    'auth/weak-password': 'يجب أن لا تقل كلمة المرور عن 6 أحرف.',
    'auth/too-many-requests': 'محاولات دخول كثيرة فاشلة. يرجى المحاولة مرة أخرى لاحقاً.'
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
            showToast('تم تفعيل الهوية بنجاح!', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 500);
        } else {
            showToast('لم يتم التحقق من الهوية بعد.', 'error');
        }
    }
});

resendVerifyBtn?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (user) {
        try {
            await sendEmailVerification(user);
            showToast('تم الإرسال. تحقق من صندوق الوارد.', 'success');
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
        authTitle.textContent = 'استعادة كلمة المرور';
        authSubtitle.textContent = 'أدخل بريدك الإلكتروني لاستلام رابط الاستعادة.';
    } else if (mode === 'verify') {
        verifyView.classList.remove('hidden');
        toggleArea.classList.add('hidden');
        authTitle.textContent = 'مطلوب التحقق النشط';
        authSubtitle.textContent = 'هويتك في انتظار التأكيد والموافقة.';
    } else {
        authForm.classList.remove('hidden');
        if (mode === 'signup') {
            authTitle.textContent = 'إنشاء حساب جديد';
            authSubtitle.textContent = 'انضم إلى الأرشيف العراقي لحفظ مواردك.';
            btnText.textContent = 'اشتراك';
            togglePrompt.textContent = 'هل لديك حساب بالفعل؟';
            toggleBtn.textContent = 'تسجيل الدخول';
        } else {
            authTitle.textContent = 'مرحباً بعودتك';
            authSubtitle.textContent = 'يرجى إدخال بياناتك للدخول.';
            btnText.textContent = 'دخول';
            togglePrompt.textContent = "مستخدم جديد للأرشيف؟";
            toggleBtn.textContent = 'تسجيل جديد';
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
                showToast('مرحباً بك مجدداً!', 'success');
            }
        } else {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(result.user);
            showToast('تم إنشاء الحساب! الرجاء التحقق من بريدك.', 'success');
            switchView('verify');
        }
    } catch (error) {
        if (mode === 'signup' && error.code === 'auth/email-already-in-use') {
            try {
                // Attempt seamless recovery
                const result = await signInWithEmailAndPassword(auth, email, password);
                if (!result.user.emailVerified) {
                    await sendEmailVerification(result.user);
                    showToast('تم استعادة الحساب! تم إرسال رابط جديد.', 'success');
                    switchView('verify');
                } else {
                    await user.getIdToken(true);
                    showToast('الحساب موجود مسبقاً. مرحباً بعودتك!', 'success');
                    window.location.href = 'index.html';
                }
            } catch (recoveryErr) {
                // If login fails, the password was wrong for the existing account
                showError('هذا البريد مسجل مسبقاً. الرجاء تسجيل الدخول أو استعادة كلمة المرور.');
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
    if (!email) return showError('يرجى إدخال البريد الإلكتروني الخاص بك.');

    setLoading(sendResetBtn, resetBtnText, resetBtnSpinner, true);
    hideAllMessages();

    try {
        await sendPasswordResetEmail(auth, email);
        showSuccess('تم إرسال رابط الاستعادة! الرجاء تفقد البريد.');
        showToast('تم التوجيه للبريد.', 'success');
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

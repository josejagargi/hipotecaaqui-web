/**
 * portal-auth.js
 * Firebase Authentication for Hipoteca Aquí Portal
 * Supports: Email/Password + Google Sign-In
 */

const firebaseConfig = {
    apiKey: "AIzaSyABbXdqKjMj4UtBic9GGCvlxY454ungydw",
    authDomain: "contascan-pro-jgg.firebaseapp.com",
    projectId: "contascan-pro-jgg",
    storageBucket: "contascan-pro-jgg.firebasestorage.app",
    messagingSenderId: "271199573526",
    appId: "1:271199573526:web:896d57c37ec4ba98d10737"
};

// Initialize Firebase (avoid duplicate init)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();

// ─── Friendly error messages ──────────────────────────────────────────────────
const AUTH_ERRORS = {
    'auth/user-not-found':      'No existe ninguna cuenta de acceso con ese email. Si es tu primera vez accediendo, por favor crea tu contraseña en la pestaña "Crear Cuenta".',
    'auth/wrong-password':      'Contraseña incorrecta. Inténtalo de nuevo o recupérala si la has olvidado.',
    'auth/invalid-email':       'El formato del email no es válido.',
    'auth/invalid-credential':  'Email o contraseña incorrectos. Si aún no has establecido tu contraseña, haz clic en la pestaña "Crear Cuenta".',
    'auth/too-many-requests':   'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    'auth/user-disabled':       'Esta cuenta está desactivada. Contacta con soporte.',
    'auth/popup-closed-by-user':'Ventana de Google cerrada. Inténtalo de nuevo.',
    'auth/popup-blocked':       'El navegador bloqueó la ventana. Permite las ventanas emergentes e inténtalo de nuevo.',
    'auth/network-request-failed': 'Error de conexión. Comprueba tu internet.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Si has olvidado tu contraseña, utiliza la pestaña "Recuperar".',
    'auth/operation-not-allowed': 'Este método de acceso no está habilitado. Contacta con soporte.'
};

function getAuthError(error) {
    return AUTH_ERRORS[error.code] || `Error: ${error.message}`;
}

// ─── Helper: show/hide UI messages ────────────────────────────────────────────
window.showAuthMsg = function(text, type = 'error') {
    const box = document.getElementById('msgBox');
    if (!box) { console.warn(text); return; }
    box.textContent = text;
    box.className = `msg-box ${type} show`;
};
window.hideAuthMsg = function() {
    const box = document.getElementById('msgBox');
    if (box) box.className = 'msg-box';
};

// ─── Auth State Observer ───────────────────────────────────────────────────────
// Only guards login.html and dashboard.html — never redirects from index.html
auth.onAuthStateChanged(user => {
    const path = window.location.pathname;
    const isLoginPage    = path.includes('login.html')     || path.endsWith('/login');
    const isDashboard    = path.includes('dashboard.html') || path.endsWith('/dashboard');
    const isPortalPage   = isLoginPage || isDashboard;

    if (!isPortalPage) return; // Leave index.html and other pages alone

    if (user) {
        // Logged in → go to dashboard
        if (isLoginPage) window.location.href = 'dashboard.html';
    } else {
        // Not logged in → go to login
        if (isDashboard) window.location.href = 'login.html';
    }
});

// ─── Email / Password Login ────────────────────────────────────────────────────
window.loginWithEmail = async function(email, password) {
    try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Email login error:', error);
        throw error;
    }
};

// ─── Email / Password Sign Up (First Access) ───────────────────────────────────
window.signUpWithEmail = async function(email, password) {
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Email sign up error:', error);
        throw error;
    }
};

// ─── Google Sign-In ────────────────────────────────────────────────────────────
window.loginWithGoogle = async function() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        await auth.signInWithPopup(provider);
        window.location.href = 'dashboard.html';
    } catch (error) {
        console.error('Google login error:', error);
        throw error;
    }
};

// ─── Password Reset ────────────────────────────────────────────────────────────
window.sendPasswordReset = async function(email) {
    await auth.sendPasswordResetEmail(email);
};

// ─── Logout ────────────────────────────────────────────────────────────────────
window.logout = async function() {
    try {
        localStorage.removeItem('currentUserFranquiciadoId');
        localStorage.removeItem('currentUserEmail');
        localStorage.removeItem('portal_role');
        await auth.signOut();
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
};

// ─── Get current user (for dashboard use) ─────────────────────────────────────
window.getCurrentUser = function() {
    return auth.currentUser;
};

window.onAuthReady = function(callback) {
    auth.onAuthStateChanged(callback);
};

// Export error helper
window.getAuthError = getAuthError;

// Firebase Configuration for Family Connect
// Using the same Firebase project as TV Time Manager

const firebaseConfig = {
    apiKey: "AIzaSyDK15y-JQrDozJ3aXxFC1XSVuniRjcUL1E",
    authDomain: "tv-time-management.firebaseapp.com",
    projectId: "tv-time-management",
    storageBucket: "tv-time-management.firebasestorage.app",
    messagingSenderId: "836553253045",
    appId: "1:836553253045:web:e93f536adf7afbbced5efc"
};

let db = null;

function notifyFirebaseReady() {
    window.dispatchEvent(new CustomEvent('firebaseReady'));
}

async function signInWithRetry(auth, attempts = 0) {
    if (auth.currentUser) return auth.currentUser;
    try {
        const result = await auth.signInAnonymously();
        return result.user;
    } catch (error) {
        console.error('Error authenticating:', error);
        if (attempts >= 4) return auth.currentUser;
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempts + 1)));
        return signInWithRetry(auth, attempts + 1);
    }
}

async function initializeFirebaseIfReady() {
    if (typeof firebase === 'undefined') {
        if (window.location.protocol !== 'file:') {
            setTimeout(initializeFirebaseIfReady, 100);
        }
        return;
    }
    if (window.location.protocol === 'file:') {
        console.log('Running from file:// - Firebase disabled');
        return;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        try {
            db.settings({ experimentalAutoDetectLongPolling: true });
        } catch (settingsError) {
            console.warn('Could not set Firestore polling:', settingsError);
        }

        const auth = firebase.auth();
        auth.onAuthStateChanged((user) => {
            if (user) notifyFirebaseReady();
        });
        const user = await signInWithRetry(auth);
        if (user) {
            console.log('Authenticated anonymously:', user.uid);
            notifyFirebaseReady();
        } else {
            console.warn('Could not authenticate with Firebase. Some features may not work.');
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
    }
}

if (typeof firebase !== 'undefined' && window.location.protocol !== 'file:') {
    initializeFirebaseIfReady();
} else if (window.location.protocol !== 'file:') {
    setTimeout(initializeFirebaseIfReady, 200);
} else {
    console.log('Running from file:// - Firebase disabled');
}

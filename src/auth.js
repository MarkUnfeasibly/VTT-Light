// /src/auth.js
// Firebase Authentication for VTT-Light — the app does not boot until a user
// is signed in.
//
// Sign-in options:
//   - Discord : custom OIDC provider "discord.com" (enabled in the Firebase
//               console, using the POPS Relay application).
//   - Email   : Firebase email/password, for players without Discord.
//
// The signed-in identity becomes the crew record's id (Firebase UID), and a
// Discord sign-in carries the Discord user id — the same one the bridge
// stamps on relayed chat, so POPS names resolve automatically.

import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    OAuthProvider,
    signInWithPopup,
} from "firebase/auth";
import { app } from "./firebase.js";

export const auth = getAuth(app);

let currentUser = null;
let initialStateFired = false;
const readyListeners = [];
const changeListeners = [];

// Fires on *every* auth change (signed out -> signed in -> signed out).
// This is what actually drives the login gate: the first callback is usually
// "not signed in yet" (Firebase is still restoring the session), and signing
// up or signing in arrives on a LATER callback.
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    // Lightweight diagnostics for the login gate (safe in production builds).
    try {
        window.__VTT_AUTH__ = { uid: user ? user.uid : null, at: Date.now() };
        console.log("[auth] state →", user ? "user:" + String(user.uid).slice(0, 8) : "signed out");
    } catch (e) { /* diagnostics only */ }
    if (!initialStateFired) {
        initialStateFired = true;
        readyListeners.splice(0).forEach((cb) => {
            try { cb(user); } catch (e) { console.error(e); }
        });
    }
    changeListeners.forEach((cb) => {
        try { cb(user); } catch (e) { console.error(e); }
    });
});

/** Fires once when Firebase has settled its first answer (user or null). */
export function onAuthReady(cb) {
    if (initialStateFired) cb(currentUser);
    else readyListeners.push(cb);
}

/** Fires on every sign-in / sign-out, and once immediately if settled. */
export function onAuthChange(cb) {
    changeListeners.push(cb);
    if (initialStateFired) cb(currentUser);
}

export function getUser() {
    return currentUser;
}

/** Friendly display name for the signed-in user. */
export function displayName() {
    const u = currentUser;
    if (!u) return "Crew";
    const provider = u.providerData && u.providerData[0];
    return (
        u.displayName ||
        (provider && provider.displayName) ||
        (u.email ? u.email.split("@")[0] : "Crew")
    );
}

/** Discord identity of the signed-in user, if they signed in with Discord. */
export function discordIdentity() {
    const u = currentUser;
    if (!u || !u.providerData) return null;
    const p = u.providerData.find((x) => x.providerId === "discord.com");
    if (!p) return null;
    return {
        id: String(p.uid),
        username: (p.displayName || "Discord").toLowerCase().split("#")[0],
        avatar: p.photoURL || null,
    };
}

export async function signInEmail(email, password) {
    return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signUpEmail(email, password) {
    return createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOutUser() {
    // Clear the seat — the next account must not inherit it.
    try {
        localStorage.removeItem('vtt_player_id');
        localStorage.removeItem('vtt_player_name');
    } catch (e) { /* storage unavailable */ }
    await signOut(auth);
    location.reload();
}

export async function signInWithDiscord() {
    const provider = new OAuthProvider("discord.com");
    provider.setCustomParameters({ prompt: "identify" });
    return signInWithPopup(auth, provider);
}

// --- Login screen ------------------------------------------------------------

function friendlyError(err) {
    const code = (err && err.code) || "";
    const map = {
        "auth/invalid-credential": "Email or password not recognised.",
        "auth/invalid-login-credentials": "Email or password not recognised.",
        "auth/user-not-found": "No account with that email.",
        "auth/wrong-password": "Wrong password.",
        "auth/email-already-in-use": "That email already has an account — switch to Sign in.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/invalid-email": "That email address looks wrong.",
        "auth/popup-closed-by-user": "Discord sign-in was closed before it finished.",
        "auth/popup-blocked": "Allow popups for this site, then try again.",
        "auth/operation-not-allowed": "Enable the provider in the Firebase console (Authentication → Sign-in method).",
        "auth/unauthorized-domain": "Add this domain under Firebase Authentication → Settings → Authorised domains.",
        "auth/configuration-not-found": "The Discord provider isn't enabled in the Firebase console yet.",
        "auth/invalid-oidc-provider": "The Discord provider isn't configured correctly in the Firebase console.",
    };
    return map[code] || (err && err.message) || "Sign-in failed.";
}

/** The Discord button is optional until the provider is configured in the
 *  Firebase console — say so plainly instead of showing a raw error. */
function discordFriendlyError(err) {
    const code = (err && err.code) || "";
    if (
        code === "auth/operation-not-allowed" ||
        code === "auth/configuration-not-found" ||
        code === "auth/invalid-oidc-provider" ||
        code === "auth/missing-or-invalid-credentials"
    ) {
        return "Discord sign-in isn't switched on in Firebase yet — use the form below for now (see FIREBASE_SETUP.md, step 4).";
    }
    return friendlyError(err);
}

export function showAuthScreen(show) {
    const el = document.getElementById("auth-screen");
    if (el) el.style.display = show ? "flex" : "none";
    document.documentElement.classList.toggle("authenticated", !show);
}

/** Small "signed in as … ⏻" chip, shown once a session exists. */
export function setupAuthChip() {
    const chip = document.getElementById("auth-chip");
    if (!chip) return;
    chip.querySelector(".auth-chip-name").textContent = displayName();
    chip.querySelector(".auth-chip-out").onclick = () => signOutUser().catch((e) => console.error(e));
    chip.style.display = "flex";
}

/** Wire the login overlay. Call once at startup. */
export function setupAuthUI() {
    const screenEl = document.getElementById("auth-screen");
    if (!screenEl) return;

    const discordBtn = document.getElementById("auth-discord");
    const emailEl = document.getElementById("auth-email");
    const passEl = document.getElementById("auth-password");
    const submitBtn = document.getElementById("auth-submit");
    const tabSignin = document.getElementById("auth-tab-signin");
    const tabSignup = document.getElementById("auth-tab-signup");
    const subtitleEl = document.getElementById("auth-subtitle");
    const hintEl = document.getElementById("auth-hint");
    const errEl = document.getElementById("auth-error");
    const setErr = (msg) => { if (errEl) errEl.textContent = msg || ""; };

    let mode = "signin";

    /** Switch between sign-in and create-account, and make it obvious. */
    const setMode = (next) => {
        mode = next;
        const signup = mode === "signup";
        if (tabSignin) tabSignin.classList.toggle("auth-tab-active", !signup);
        if (tabSignup) tabSignup.classList.toggle("auth-tab-active", signup);
        document.documentElement.classList.toggle("auth-signup", signup);
        if (submitBtn) submitBtn.textContent = signup ? "Create account" : "Sign in";
        if (subtitleEl) {
            subtitleEl.textContent = signup
                ? "New here? Create an account — you'll drop straight into the VTT"
                : "Sign in to open the control interface";
        }
        if (hintEl) {
            hintEl.textContent = signup
                ? "Pick a password of 6+ characters. Already have an account? Switch back to SIGN IN above."
                : "";
        }
        if (passEl) passEl.autocomplete = signup ? "new-password" : "current-password";
        setErr("");
    };

    if (tabSignin) tabSignin.onclick = () => setMode("signin");
    if (tabSignup) tabSignup.onclick = () => setMode("signup");

    if (discordBtn) {
        discordBtn.onclick = () => {
            setErr("");
            signInWithDiscord().catch((e) => setErr(discordFriendlyError(e)));
        };
    }

    const submit = async () => {
        setErr("");
        if (!emailEl.value.trim() || !passEl.value) { setErr("Email and password are required."); return; }
        if (mode === "signup" && passEl.value.length < 6) { setErr("Password must be at least 6 characters."); return; }
        submitBtn.disabled = true;
        submitBtn.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
        try {
            if (mode === "signin") await signInEmail(emailEl.value, passEl.value);
            else await signUpEmail(emailEl.value, passEl.value);
            // onAuthChange in main.js takes over from here.
        } catch (e) {
            setErr(friendlyError(e));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = mode === "signup" ? "Create account" : "Sign in";
        }
    };

    if (submitBtn) submitBtn.onclick = submit;
    if (passEl) passEl.onkeydown = (e) => { if (e.key === "Enter") submit(); };
    if (emailEl) emailEl.onkeydown = (e) => { if (e.key === "Enter") submit(); };

    setMode("signin");
}

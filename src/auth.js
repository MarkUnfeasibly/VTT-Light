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
let onUserReady;

/** Resolves once with the first signed-in user (or null if signed out). */
export function onAuthReady(cb) {
    if (onUserReady) {
        onUserReady(cb);
        return;
    }
    let fired = false;
    const off = onAuthStateChanged(auth, (user) => {
        if (fired) return;
        fired = true;
        off();
        onUserReady = (next) => next(user);
        cb(user);
    });
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
    const toggleBtn = document.getElementById("auth-toggle");
    const errEl = document.getElementById("auth-error");
    const setErr = (msg) => { if (errEl) errEl.textContent = msg || ""; };

    let mode = "signin";

    if (discordBtn) {
        discordBtn.onclick = () => {
            setErr("");
            signInWithDiscord().catch((e) => setErr(friendlyError(e)));
        };
    }

    const submit = async () => {
        setErr("");
        if (!emailEl.value.trim() || !passEl.value) { setErr("Email and password are required."); return; }
        submitBtn.disabled = true;
        try {
            if (mode === "signin") await signInEmail(emailEl.value, passEl.value);
            else await signUpEmail(emailEl.value, passEl.value);
        } catch (e) {
            setErr(friendlyError(e));
        } finally {
            submitBtn.disabled = false;
        }
    };

    if (submitBtn) submitBtn.onclick = submit;
    if (passEl) {
        passEl.onkeydown = (e) => { if (e.key === "Enter") submit(); };
        emailEl.onkeydown = (e) => { if (e.key === "Enter") submit(); };
    }
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            mode = mode === "signin" ? "signup" : "signin";
            submitBtn.textContent = mode === "signin" ? "Sign in" : "Create account";
            toggleBtn.textContent =
                mode === "signin" ? "Need an account? Create one" : "Have an account? Sign in";
        };
    }
}

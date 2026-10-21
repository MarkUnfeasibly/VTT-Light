// src/discord.js
// Links a crew member's Discord account to a player record using Discord
// OAuth2 with PKCE (public client — no client secret required).
//
// Setup required (once, by an admin):
//   1. Create an application at https://discord.com/developers/applications
//   2. OAuth2 -> add redirect: <your origin><your path>  (e.g. http://localhost:5173/)
//   3. Paste the Application (Client) ID into the CREW MANIFEST panel. It is
//      stored in the shared Firebase config, so one admin configures everyone.
//
import { playerDB } from './playerdb.js';

const VERIFIER_KEY = 'vtt_discord_verifier';
const STATE_KEY = 'vtt_discord_state';
const PLAYER_KEY = 'vtt_discord_player';
const CLIENT_ID_SETTING = 'discord_client_id';

const API = 'https://discord.com/api';

function b64url(bytes) {
    let s = '';
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256b64url(input) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return b64url(new Uint8Array(digest));
}

function redirectUri() {
    // Always redirects back to the current page, stripping any query string.
    return location.origin + location.pathname;
}

export function avatarUrl(discordId, avatarHash) {
    if (avatarHash) return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=64`;
    // Default avatar: discriminator-free derivation from the user id.
    const idx = Number((BigInt(discordId) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

export async function getDiscordClientId() {
    return playerDB.getSharedSetting(CLIENT_ID_SETTING);
}

export async function setDiscordClientId(clientId) {
    return playerDB.setSharedSetting(CLIENT_ID_SETTING, (clientId || '').trim());
}

/** True when the Client ID is present in the SHARED config (not just locally). */
export async function hasSharedDiscordClientId() {
    return (await playerDB.readCloudSetting(CLIENT_ID_SETTING)).found;
}

/**
 * Starts the Discord OAuth2 (PKCE) flow. Redirects the browser to Discord.
 * @param playerId  player record to attach the Discord profile to on return
 */
export async function startDiscordLink(playerId) {
    const clientId = await getDiscordClientId();
    if (!clientId) {
        alert(
            'Discord linking is not set up yet.\n\n' +
            'An admin must paste the Application (Client) ID into the ' +
            'CREW MANIFEST panel (Discord App ID field).\n\n' +
            'Alternatively, type a Discord username or numeric user ID into ' +
            'the "Discord account" box and save — no setup needed.'
        );
        return;
    }
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = await sha256b64url(verifier);
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));

    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(STATE_KEY, state);
    localStorage.setItem(PLAYER_KEY, playerId);

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri(),
        scope: 'identify',
        state,
        code_challenge_method: 'S256',
        code_challenge: challenge
    });
    location.href = `${API}/oauth2/authorize?${params}`;
}

/**
 * Call on page load. If the URL carries a Discord OAuth callback (?code=...&state=...),
 * completes the exchange, attaches the Discord profile to the player record,
 * and cleans the URL. Returns { profile, playerName } or { error } or null.
 */
export async function handleDiscordRedirect() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) return null;

    // Clean the address bar immediately, whatever happens next.
    history.replaceState(null, '', location.pathname);

    const savedState = localStorage.getItem(STATE_KEY);
    const verifier = localStorage.getItem(VERIFIER_KEY);
    const playerId = localStorage.getItem(PLAYER_KEY);
    localStorage.removeItem(STATE_KEY);
    localStorage.removeItem(VERIFIER_KEY);
    localStorage.removeItem(PLAYER_KEY);

    if (!savedState || state !== savedState || !verifier || !playerId) {
        return { error: 'Discord link aborted (state mismatch or expired). Try again.' };
    }

    try {
        const clientId = await getDiscordClientId();
        const tokenRes = await fetch(`${API}/oauth2/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri(),
                code_verifier: verifier
            })
        });
        if (!tokenRes.ok) throw new Error(`token exchange failed (HTTP ${tokenRes.status})`);
        const token = await tokenRes.json();

        const meRes = await fetch(`${API}/users/@me`, {
            headers: { Authorization: `Bearer ${token.access_token}` }
        });
        if (!meRes.ok) throw new Error(`/@me fetch failed (HTTP ${meRes.status})`);
        const me = await meRes.json();

        const profile = {
            id: me.id,
            username: me.global_name || me.username,
            handle: me.username,
            avatar: me.avatar ? avatarUrl(me.id, me.avatar) : null
        };

        const player = await playerDB.getPlayer(playerId);
        if (!player) return { error: 'Player record no longer exists.' };
        player.discord = profile;
        await playerDB.savePlayer(player);

        return { profile, playerName: player.name, playerId };
    } catch (err) {
        console.error('Discord link failed:', err);
        return { error: `Discord link failed: ${err.message}` };
    }
}

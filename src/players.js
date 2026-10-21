// src/players.js
// CREW MANIFEST panel (its own floating panel): manages the local player
// database, the "seat" (active player identity), Discord linking, and the
// admin flag.
//
// Access model:
//   - The whole panel is only VISIBLE in an admin session (/admin_mode and
//     the other admin URL forms). Players never see it (html.player hides it).
//   - Admin URL (/admin_mode)   : full management — add/edit/delete, admin
//                                 flags, Discord Client ID config.
//   - Prep mode additionally requires the SEATED player to carry isAdmin=true.

import { playerDB, newId } from './playerdb.js';
import { startDiscordLink, handleDiscordRedirect, getDiscordClientId, setDiscordClientId, avatarUrl } from './discord.js';

const SEAT_KEY = 'vtt_player_name';       // legacy key used by pops.js
const SEAT_ID_KEY = 'vtt_player_id';

let players = [];
const listeners = [];

/** Subscribe to any change in the crew roster or the seated player. */
export function onPlayerChange(cb) { listeners.push(cb); }
function emit() { listeners.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } }); }

function isAdminSession() { return !!window.__VTT_ADMIN__; }

function seatedPlayer() {
    const id = localStorage.getItem(SEAT_ID_KEY);
    return players.find((p) => p.id === id) || null;
}

/** True when an admin-flagged crew member is currently seated. */
export function isAdminSeated() {
    const p = seatedPlayer();
    return !!(p && p.isAdmin === true);
}

/** Name of the seated player, or 'Crew' — used by POPS + dice rolls. */
export function getCurrentPlayerName() {
    const p = seatedPlayer();
    return p ? p.name : (localStorage.getItem(SEAT_KEY) || 'Crew');
}

async function seat(p) {
    localStorage.setItem(SEAT_ID_KEY, p.id);
    localStorage.setItem(SEAT_KEY, p.name);
    renderCrew();
    emit();
}

function uns_seat() {
    localStorage.removeItem(SEAT_ID_KEY);
    localStorage.removeItem(SEAT_KEY);
    renderCrew();
    emit();
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function playerAvatarHtml(p, size = 26) {
    const url = (p.discord && p.discord.avatar) || avatarUrl('0', null);
    const img = (p.discord && p.discord.avatar)
        ? `<img src="${p.discord.avatar}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">`
        : `<span style="display:inline-flex;width:${size}px;height:${size}px;border-radius:50%;align-items:center;justify-content:center;background:${esc(p.color || '#3f3f46')};font-size:${Math.round(size * 0.55)}px;">${esc((p.name || '?')[0].toUpperCase())}</span>`;
    return img;
}

async function renderCrew() {
    const listEl = document.getElementById('crew-list');
    const adminEl = document.getElementById('crew-admin-tools');
    const seatBtn = document.getElementById('crew-seat-toggle');
    if (!listEl) return;

    if (adminEl) adminEl.style.display = isAdminSession() ? 'block' : 'none';

    const seated = seatedPlayer();

    if (seatBtn) {
        seatBtn.textContent = seated ? `⏏ Leave seat (${seated.name})` : '🛅 Take a seat';
    }

    if (players.length === 0) {
        listEl.innerHTML = `<div style="color:#71717a; font-size:11px; text-align:center; padding:10px 4px;">
            No crew registered yet.${isAdminSession() ? '<br>Add a crew member below.' : ''}
        </div>`;
        return;
    }

    listEl.innerHTML = players.map((p) => {
        const isSeated = seated && seated.id === p.id;
        const discordChip = p.discord
            ? `<span title="Discord: ${esc(p.discord.handle || p.discord.username)}" style="font-size:9px; background:#5865F2; color:#fff; padding:1px 5px; border-radius:4px;">${esc(p.discord.username)}</span>`
            : (isAdminSession()
                ? `<button class="crew-mini-btn" data-action="link-discord" data-id="${p.id}" style="font-size:9px; background:#27272a; border:1px solid #3f3f46; color:#a1a1aa; padding:1px 5px; border-radius:4px; width:auto; cursor:pointer;">🔗 Link Discord</button>`
                : `<span style="font-size:9px; color:#52525b;">—</span>`);

        const adminBadge = p.isAdmin
            ? `<span title="Admin — prep mode access" style="font-size:10px;">👑</span>`
            : '';

        const adminRow = isAdminSession() ? `
            <button class="crew-mini-btn" data-action="toggle-admin" data-id="${p.id}"
                title="${p.isAdmin ? 'Remove admin' : 'Grant admin (prep mode)'}"
                style="font-size:10px; background:${p.isAdmin ? '#4a148c' : '#27272a'}; border:1px solid ${p.isAdmin ? '#6a1b9a' : '#3f3f46'}; color:#e4e4e7; padding:1px 6px; border-radius:4px; width:auto; cursor:pointer;">${p.isAdmin ? '👑' : '🗡️'}</button>
            <button class="crew-mini-btn" data-action="edit" data-id="${p.id}"
                style="font-size:10px; background:#27272a; border:1px solid #3f3f46; color:#a1a1aa; padding:1px 6px; border-radius:4px; width:auto; cursor:pointer;">✎</button>
            <button class="crew-mini-btn" data-action="delete" data-id="${p.id}"
                style="font-size:10px; background:#27272a; border:1px solid #7f0000; color:#f87171; padding:1px 6px; border-radius:4px; width:auto; cursor:pointer;">✕</button>
        ` : '';

        return `
        <div class="crew-row" data-id="${p.id}" style="
            display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:6px; cursor:pointer;
            background:${isSeated ? '#04302c' : 'transparent'}; border:1px solid ${isSeated ? '#00ffcc55' : 'transparent'};">
            ${playerAvatarHtml(p)}
            <div style="flex:1; min-width:0;">
                <div style="font-size:12px; font-weight:600; color:${isSeated ? '#00ffcc' : '#e4e4e7'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${esc(p.name)} ${adminBadge}
                </div>
                ${p.character ? `<div style="font-size:10px; color:#71717a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(p.character)}</div>` : ''}
            </div>
            ${discordChip}
            ${adminRow}
        </div>`;
    }).join('');

    // Wire row actions
    listEl.querySelectorAll('.crew-row').forEach((row) => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.crew-mini-btn')) return;
            const p = players.find((x) => x.id === row.dataset.id);
            if (!p) return;
            if (seated && seated.id === p.id) uns_seat(); else seat(p);
        });
    });
    listEl.querySelectorAll('.crew-mini-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const p = players.find((x) => x.id === btn.dataset.id);
            if (!p) return;
            switch (btn.dataset.action) {
                case 'toggle-admin': {
                    // Bootstrap rule: if no admin exists yet, allow the first grant
                    // from an admin session; afterwards, only an admin can re-grant.
                    if (p.isAdmin || isAdminSeated() || !(await playerDB.anyAdminExists())) {
                        p.isAdmin = !p.isAdmin;
                        await playerDB.savePlayer(p);
                        await loadPlayers();
                    } else {
                        alert('Only a seated admin can change admin flags.');
                    }
                    break;
                }
                case 'edit':
                    openEditor(p);
                    break;
                case 'delete': {
                    if (!confirm(`Remove ${p.name} from the crew manifest?`)) return;
                    await playerDB.deletePlayer(p.id);
                    if (localStorage.getItem(SEAT_ID_KEY) === p.id) uns_seat();
                    await loadPlayers();
                    break;
                }
                case 'link-discord':
                    await startDiscordLink(p.id);
                    break;
            }
        });
    });
}

async function loadPlayers() {
    players = await playerDB.getAllPlayers();
    renderCrew();
    emit();
}

// --- CREW RECORD EDITOR (admin modal) --------------------------------------
let editingId = null;

function modalEl(id) { return document.getElementById(id); }

function openEditor(player) {
    const modal = modalEl('player-edit-modal');
    if (!modal) return;
    editingId = player ? player.id : null;

    modalEl('pe-title').textContent = player ? 'EDIT CREW RECORD' : 'NEW CREW RECORD';
    modalEl('pe-name').value = player ? player.name : '';
    modalEl('pe-character').value = (player && player.character) || '';
    modalEl('pe-color').value = (player && player.color) || '#3f3f46';

    // Bootstrap: the very first crew member defaults to admin.
    const noAdminsYet = !player && players.every((p) => !p.isAdmin);
    modalEl('pe-admin').checked = noAdminsYet ? true : !!(player && player.isAdmin);

    const linked = player && player.discord;
    modalEl('pe-discord-status').textContent = linked
        ? `${linked.username}${linked.handle ? ' (@' + linked.handle + ')' : ''}`
        : 'not linked';
    modalEl('pe-discord-status').style.color = linked ? '#8b5cf6' : '#a1a1aa';
    modalEl('pe-discord-unlink').style.display = linked ? 'block' : 'none';
    modalEl('pe-discord-link').style.display = linked ? 'none' : 'block';
    modalEl('pe-discord-manual').value = '';

    modal.style.display = 'flex';
}

function closeEditor() {
    const modal = modalEl('player-edit-modal');
    if (modal) modal.style.display = 'none';
    editingId = null;
}

async function saveEditor() {
    const name = modalEl('pe-name').value.trim();
    if (!name) { alert('Crew name is required.'); return; }
    const character = modalEl('pe-character').value.trim();
    const color = modalEl('pe-color').value;
    const isAdmin = modalEl('pe-admin').checked;
    const manualHandle = modalEl('pe-discord-manual').value.trim().replace(/^@/, '');

    let p = editingId ? players.find((x) => x.id === editingId) : null;
    if (!p) {
        p = { id: newId(), discord: null, createdAt: Date.now() };
    }
    p.name = name;
    p.character = character;
    p.color = color;
    p.isAdmin = isAdmin;
    if (manualHandle) {
        // Accept either a Discord username/handle or the numeric user ID
        // (the relay stamps every message with the author's Discord ID).
        const looksLikeId = /^\d{5,}$/.test(manualHandle);
        p.discord = looksLikeId
            ? { id: manualHandle, username: manualHandle, handle: null, avatar: null }
            : { id: null, username: manualHandle, handle: manualHandle, avatar: null };
    }

    await playerDB.savePlayer(p);
    const seated = seatedPlayer();
    if (seated && seated.id === p.id) localStorage.setItem(SEAT_KEY, p.name);
    closeEditor();
    await loadPlayers();
}

function wireEditor() {
    if (!modalEl('player-edit-modal')) return;

    modalEl('pe-save').addEventListener('click', saveEditor);
    modalEl('pe-cancel').addEventListener('click', closeEditor);
    modalEl('pe-cancel-x').addEventListener('click', closeEditor);

    // Click on the dark backdrop closes the modal.
    modalEl('player-edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'player-edit-modal') closeEditor();
    });

    modalEl('pe-delete').addEventListener('click', async () => {
        const p = editingId ? players.find((x) => x.id === editingId) : null;
        if (!p) return closeEditor();
        if (!confirm(`Remove ${p.name} from the crew manifest?`)) return;
        await playerDB.deletePlayer(p.id);
        if (localStorage.getItem(SEAT_ID_KEY) === p.id) uns_seat();
        closeEditor();
        await loadPlayers();
    });

    modalEl('pe-discord-link').addEventListener('click', async () => {
        if (!editingId) { alert('Save the record first, then link Discord.'); return; }
        await startDiscordLink(editingId);
    });

    modalEl('pe-discord-unlink').addEventListener('click', async () => {
        const p = editingId ? players.find((x) => x.id === editingId) : null;
        if (!p) return;
        p.discord = null;
        await playerDB.savePlayer(p);
        openEditor(p); // refresh modal state
        await loadPlayers();
    });
}

export async function setupPlayers() {
    const addBtn = document.getElementById('crew-add-btn');
    const seatBtn = document.getElementById('crew-seat-toggle');
    const clientIdInput = document.getElementById('crew-discord-client-id');

    // 1. Finish any Discord OAuth round-trip first.
    try {
        const result = await handleDiscordRedirect();
        if (result && result.error) {
            alert(result.error);
        } else if (result && result.profile) {
            console.log('Discord linked:', result);
        }
    } catch (e) {
        console.error('Discord redirect handling failed:', e);
    }

    // 2. Discord Client ID config (admin sessions only).
    if (clientIdInput) {
        if (isAdminSession()) {
            clientIdInput.value = (await getDiscordClientId()) || '';
            clientIdInput.addEventListener('change', async () => {
                await setDiscordClientId(clientIdInput.value);
            });
        }
    }

    // 3. Add crew (admin sessions only — button hidden otherwise).
    if (addBtn) {
        addBtn.style.display = isAdminSession() ? 'inline-block' : 'none';
        addBtn.addEventListener('click', () => openEditor(null));
    }

    if (seatBtn) {
        seatBtn.addEventListener('click', () => {
            const seated = seatedPlayer();
            if (seated) { uns_seat(); return; }
            if (players.length === 0) { alert('No crew registered yet.'); return; }
            // Quick seat picker
            const names = players.map((p, i) => `${i + 1}. ${p.name}${p.isAdmin ? ' 👑' : ''}`).join('\n');
            const pick = prompt(`Who is taking the seat?\n\n${names}\n\nEnter number:`);
            const idx = parseInt(pick, 10) - 1;
            if (!isNaN(idx) && players[idx]) seat(players[idx]);
        });
    }

    // Admin record editor modal
    wireEditor();

    await loadPlayers();
}

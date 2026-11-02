import * as PIXI from 'pixi.js';
import { state } from './state.js';
import { onValue, set, dbRefs } from './firebase.js';
import { onAuthChange, setupAuthUI, showAuthScreen, setupAuthChip } from './auth.js';
import { setupInputs } from './input.js';
import { setupUI } from './ui.js';
import { initPopsListener } from "./pops.js";
import { setupPlayers, ensureCrewForUser } from "./players.js";
import { setupDice } from "./dice.js";
import { setupInventory } from './inventory.js';
import { setupPanels } from "./panels.js";
import { setupSections } from "./sections.js";
import { 
    app, 
    redrawWalls, updateLighting, displayMap, 
    createLightMarker, createTokenSprite, drawMarkerIcon, drawTokenIcon,
    lightMarkerLayer, tokenLayer, haloLayer, drawHalos, updateScaleBar
} from './renderer.js';

// 1. Attach PixiJS Canvas to the DOM
// Native ES modules automatically defer until the HTML is parsed, so we run this directly.
const container = document.getElementById('vtt-container');
if (container) {
    container.appendChild(app.view);
} else {
    console.error("CRITICAL: Could not find <div id='vtt-container'></div> in index.html!");
}

// 2. Configure PDF.js Worker for the CDN script
window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let started = false;

/** Everything below waits for a signed-in user. */
function startApp() {
    if (started) return;
    started = true;

    // 3. Initialize Interactivity
    const boot = () => {
        setupInputs();
        setupUI();
        // Crew manifest (player database) + DICE BAY panel + Inventory panel
        setupPlayers();
        setupDice();
        setupInventory();
        // Draggable panels (positions remembered in the lite database);
        // section panels are built once panel positions have loaded
        setupPanels().then(setupSections).catch((e) => console.error('Panel setup failed:', e));
        // Boot POPS Realtime Listener
        initPopsListener();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // 4. Map Firebase Cloud State to Local Engine State
    onValue(dbRefs.walls, (snapshot) => {
        state.walls = snapshot.val() || [];
        if (state.activeSelectWallIndex !== null && state.activeSelectWallIndex >= state.walls.length) {
            state.activeSelectWallIndex = null;
        }
        redrawWalls();
        updateLighting();
    });

    onValue(dbRefs.lights, (snapshot) => {
        state.lights = snapshot.val() || {};
        for (const id in state.lightMarkers) {
            if (!state.lights[id]) {
                lightMarkerLayer.removeChild(state.lightMarkers[id]);
                state.lightMarkers[id].destroy();
                delete state.lightMarkers[id];
            }
        }
        for (const id in state.lights) {
            if (!state.lightMarkers[id]) {
                state.lightMarkers[id] = createLightMarker(id, state.lights[id]);
                lightMarkerLayer.addChild(state.lightMarkers[id]);
            } else {
                if (state.activeDragLightId !== id) {
                    state.lightMarkers[id].x = state.lights[id].x;
                    state.lightMarkers[id].y = state.lights[id].y;
                }
                drawMarkerIcon(state.lightMarkers[id], state.lights[id].type, id === state.activeSelectLightId);
            }
        }
        updateLighting();
    });

    onValue(dbRefs.tokenSettings, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            set(dbRefs.tokenSettings, { count: 6, radius: 250 });
            return;
        }
        state.tokenSettings = data;
        const tokenCountSel = document.getElementById('tokenCountSelect');
        if (tokenCountSel) tokenCountSel.value = state.tokenSettings.count;
        document.getElementById('tokenRadiusInput').value = state.tokenSettings.radius;
        
        for (let i = 1; i <= 6; i++) {
            if (state.tokenSprites[i]) state.tokenSprites[i].visible = (i <= state.tokenSettings.count);
        }
        updateLighting();
    });

    onValue(dbRefs.tokens, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            // V1.4 Player & Token alignment: Do not auto-spawn default 1-6 array if cleared
            Object.keys(state.tokenSprites || {}).forEach(id => {
                if (state.tokenSprites[id]) {
                    tokenLayer.removeChild(state.tokenSprites[id]);
                    state.tokenSprites[id].destroy({ children: true });
                }
            });
            state.tokens = {};
            state.tokenSprites = {};
            updateLighting();
            drawHalos();
            return;
        }

        // V1.4 Player & Token alignment: Support dynamic token count instead of hardcoded 6
        const keys = Object.keys(data);
        
        // Remove sprites that no longer exist in the database
        Object.keys(state.tokenSprites || {}).forEach(id => {
            if (!data[id]) {
                if (state.tokenSprites[id]) {
                    tokenLayer.removeChild(state.tokenSprites[id]);
                    state.tokenSprites[id].destroy({ children: true });
                }
                delete state.tokenSprites[id];
                delete state.tokens[id];
            }
        });

        keys.forEach(key => {
            const i = parseInt(key);
            if (!state.tokens[i]) state.tokens[i] = { x: 0, y: 0, hasLantern: false };

            if (state.activeDragTokenId !== i.toString()) {
                state.tokens[i].x = data[i].x;
                state.tokens[i].y = data[i].y;
                state.tokens[i].originX = data[i].originX;
                state.tokens[i].originY = data[i].originY;
                if (state.tokenSprites[i]) {
                    state.tokenSprites[i].x = state.tokens[i].x;
                    state.tokenSprites[i].y = state.tokens[i].y;
                }
            }
            
            // Sync custom fields from database
            state.tokens[i].hasLantern = data[i].hasLantern;
            if (data[i].color) state.tokens[i].color = data[i].color;
            if (data[i].label) state.tokens[i].label = data[i].label;
            
            if (!state.tokenSprites[i]) {
                state.tokenSprites[i] = createTokenSprite(i);
                tokenLayer.addChild(state.tokenSprites[i]);
            }
            
            state.tokenSprites[i].visible = true; // Visibility managed by existence in DB now
        });
        updateLighting();
        drawHalos();
    });

    onValue(dbRefs.movementLock, (snapshot) => {
            state.isMovementLocked = snapshot.val() || false;
            
            const lockBtn = document.getElementById('toggleLock');
            if (lockBtn) {
                lockBtn.innerText = state.isMovementLocked ? "🔒 Tokens: LOCKED" : "🔓 Tokens: UNLOCKED";
                lockBtn.style.background = state.isMovementLocked ? "#d32f2f" : "#b71c1c";
            }
            drawHalos(); // NEW: Show or hide rings instantly
    });

    onValue(dbRefs.mapData, async (snapshot) => {
        const data = snapshot.val();
        if (!data || !data.url) return;
        if (state.currentMapUrl === data.url) return;
        state.currentMapUrl = data.url;

        try {
            if (data.type === 'application/pdf') {
                // PDFs require a secure fetch to generate the raw data blob
                const response = await fetch(data.url);
                const blob = await response.blob();
                const localUrl = URL.createObjectURL(blob);

                const loadingTask = window.pdfjsLib.getDocument(localUrl);
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2.0 });
                 
                const offScreenCanvas = document.createElement('canvas');
                const context = offScreenCanvas.getContext('2d');
                offScreenCanvas.height = viewport.height;
                offScreenCanvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const texture = PIXI.Texture.from(offScreenCanvas);
                displayMap(texture);
            } else {
                // Standard images load directly, bypassing CORS fetch issues
                const texture = await PIXI.Texture.fromURL(data.url);
                displayMap(texture);
            }
        } catch (error) {
            console.error("Cloud Map Error:", error);
        }
    });

    onValue(dbRefs.haloRadius, (snapshot) => {
        state.haloRadius = snapshot.val() || 200;
        drawHalos();
    });

    onValue(dbRef(db, 'mapScale'), (snapshot) => {
        state.mapScale = snapshot.val() || { pixels: 70, distance: 5, unit: 'ft' };
        
        const pxInput = document.getElementById('scalePixels');
        const distInput = document.getElementById('scaleDistance');
        const unitInput = document.getElementById('scaleUnit');
        if (pxInput) pxInput.value = Math.round(state.mapScale.pixels);
        if (distInput) distInput.value = state.mapScale.distance;
        if (unitInput) unitInput.value = state.mapScale.unit;

        updateScaleBar();
    });
}

// 0. AUTH GATE — the VTT does not boot until someone is signed in.
// onAuthChange fires on every state change: the first callback is usually
// "no session yet" (login screen), and the sign-in/sign-up that follows
// arrives on a later callback — which is what starts the app.
setupAuthUI();
let booted = false;
onAuthChange(async (user) => {
    console.log("[gate] auth callback →", user ? "user:" + String(user.uid).slice(0, 8) : "signed out", "booted=", booted);
    showAuthScreen(!user);
    if (!user || booted) return;
    booted = true;

    // Show the sign-out chip the moment there is a session.
    setupAuthChip();

    try {
        await ensureCrewForUser(user);
    } catch (e) {
        console.error('Crew record setup failed:', e);
    }
    startApp();
});

import * as PIXI from 'pixi.js';
import { state } from './state.js';
import { onValue, set, dbRefs } from './firebase.js';
import { setupInputs } from './input.js';
import { setupUI } from './ui.js';
import { 
    app, 
    redrawWalls, updateLighting, displayMap, 
    createLightMarker, createTokenSprite, drawMarkerIcon, drawTokenIcon,
    lightMarkerLayer, tokenLayer, haloLayer, drawHalos
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

// 3. Initialize Interactivity
setupInputs();
setupUI();

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
    document.getElementById('tokenCountSelect').value = state.tokenSettings.count;
    document.getElementById('tokenRadiusInput').value = state.tokenSettings.radius;
    
    for (let i = 1; i <= 6; i++) {
        if (state.tokenSprites[i]) state.tokenSprites[i].visible = (i <= state.tokenSettings.count);
    }
    updateLighting();
});

onValue(dbRefs.tokens, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
        const initialTokens = {};
        for (let i = 1; i <= 6; i++) {
            initialTokens[i] = { x: (i * 60) - 210, y: 0, hasLantern: false };
        }
        set(dbRefs.tokens, initialTokens);
        return;
    }

    for (let i = 1; i <= 6; i++) {
        if (!data[i]) continue;
        
        if (!state.tokens[i]) state.tokens[i] = { x: 0, y: 0, hasLantern: false };

        if (state.activeDragTokenId !== i.toString()) {
            state.tokens[i].x = data[i].x;
            state.tokens[i].y = data[i].y;
            // NEW: Sync the origin lock positions
            state.tokens[i].originX = data[i].originX;
            state.tokens[i].originY = data[i].originY;
            if (state.tokenSprites[i]) {
                state.tokenSprites[i].x = state.tokens[i].x;
                state.tokenSprites[i].y = state.tokens[i].y;
            }
        }
        
        state.tokens[i].hasLantern = data[i].hasLantern;
        
        if (!state.tokenSprites[i]) {
            state.tokenSprites[i] = createTokenSprite(i);
            tokenLayer.addChild(state.tokenSprites[i]);
        }
        
        state.tokenSprites[i].visible = (i <= state.tokenSettings.count);
        drawTokenIcon(state.tokenSprites[i].getChildAt(0), state.tokens[i].hasLantern);
    }
    updateLighting();
    drawHalos(); // NEW: Redraw halos whenever tokens update
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
        const response = await fetch(data.url);
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);

        if (data.type === 'application/pdf') {
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
            const texture = await PIXI.Texture.fromURL(localUrl);
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
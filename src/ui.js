import { state } from './state.js';
// Combined renderer imports:
import { 
    app, mapContainer, fitMapToScreen, redrawWalls, updateLighting, 
    wallLayer, previewLayer, lightMarkerLayer, fowContainer, lightingContainer,
    VTT_WIDTH, VTT_HEIGHT, updateScaleBar 
} from './renderer.js';
import { db, set, dbRef, dbRefs, storage, storageRef, uploadBytes, getDownloadURL, get } from './firebase.js';
import { isAdminSeated, onPlayerChange } from './players.js';
import { playerDB } from './playerdb.js';
import * as PIXI from 'pixi.js';

export function setupUI() {
    // --- FEATURE: MAX MOVE HALO SLIDER ---
    document.getElementById('haloRadiusInput').addEventListener('input', (e) => {
        set(dbRefs.haloRadius, parseInt(e.target.value, 10));
    });
    
    // --- ZOOM AND CENTER OVERLAY CONTROLS ---
    function applyZoom(zoomFactor) {
        if (!mapContainer) return;
        
        // Find the exact center of the screen
        const screenCenterX = VTT_WIDTH / 2;
        const screenCenterY = VTT_HEIGHT / 2;
        
        // Translate screen center to the map's local coordinates
        const localPointer = mapContainer.toLocal(new PIXI.Point(screenCenterX, screenCenterY));
        
        // Calculate the new scale and clamp it between 0.1x and 5.0x
        let newScale = mapContainer.scale.x * zoomFactor;
        newScale = Math.max(0.1, Math.min(newScale, 5.0));
        mapContainer.scale.set(newScale);

        // Adjust map position so the point we zoomed into stays dead center
        mapContainer.x = screenCenterX - localPointer.x * mapContainer.scale.x;
        mapContainer.y = screenCenterY - localPointer.y * mapContainer.scale.y;
        
        updateScaleBar();
    
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}
    document.getElementById('btnZoomIn').addEventListener('click', () => {
        applyZoom(1.2); // Zoom in by 20%
    });

    document.getElementById('btnZoomOut').addEventListener('click', () => {
        applyZoom(0.8); // Zoom out by 20%
    });

    document.getElementById('btnCenter').addEventListener('click', () => {
        if (!mapContainer) return;
        
        // Reset the container to the true center of the canvas
        mapContainer.x = VTT_WIDTH / 2;
        mapContainer.y = VTT_HEIGHT / 2;
        mapContainer.angle = 0;
        
        // Trigger the original fit function to perfectly scale the map to the window boundaries
        fitMapToScreen();
    });

    // --- FEATURE: TOKEN LOCK & TURN RESET ---
    document.getElementById('toggleLock').addEventListener('click', () => {
        const newLockState = !state.isMovementLocked;
        set(dbRefs.movementLock, newLockState);
        
        // When UNLOCKING (starting a new round), lock in the tokens' current positions as their new origins
        if (!newLockState && state.tokens) {
            Object.keys(state.tokens).forEach(id => {
                const t = state.tokens[id];
                if (!t || typeof t !== 'object') return; // Protect against null array gaps
                
                // Fallback safely to 0 if x or y are missing to prevent Firebase undefined crash
                const startX = t.x !== undefined ? t.x : 0;
                const startY = t.y !== undefined ? t.y : 0;
                
                set(dbRef(db, `tokens/${id}/originX`), startX);
                set(dbRef(db, `tokens/${id}/originY`), startY);
            });
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    });

    // --- FEATURE: EXPORT SCENE ---
    document.getElementById('exportScene').addEventListener('click', async () => {
        try {
            const mapSnap = await get(dbRefs.mapData);
            const sceneData = {
                mapData: mapSnap.val(),
                walls: state.walls || [],
                lights: state.lights || null
            };
            
            const blob = new Blob([JSON.stringify(sceneData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `VTT_Scene_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export failed:", e);
            alert("Failed to export scene.");
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    });

    // --- FEATURE: IMPORT SCENE ---
    document.getElementById('importScene').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const sceneData = JSON.parse(e.target.result);
                
                // Push loaded data directly to Firebase to sync all clients
                if (sceneData.mapData) set(dbRefs.mapData, sceneData.mapData);
                set(dbRefs.walls, sceneData.walls || []);
                set(dbRefs.lights, sceneData.lights || null);
                
                // Reset UI states
                state.activeSelectWallIndex = null;
                state.activeSelectLightId = null;
                redrawWalls();
                
                event.target.value = ""; // Clear input so same file can be re-loaded if needed
            } catch (err) {
                console.error("Import failed:", err);
                alert("Invalid scene file.");
            
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}        };
        reader.readAsText(file);
    });

    document.getElementById('rotateCCW').addEventListener('click', () => {
        if (!state.currentMapSprite) return;
        mapContainer.angle = (mapContainer.angle - 90) % 360;
        fitMapToScreen();
    });

    document.getElementById('rotateCW').addEventListener('click', () => {
        if (!state.currentMapSprite) return;
        mapContainer.angle = (mapContainer.angle + 90) % 360;
        fitMapToScreen();
    });

    document.getElementById('toggleDraw').addEventListener('click', (e) => {
        state.isDrawMode = !state.isDrawMode;
        
        const doorBtn = document.getElementById('toggleDoorDraw');
        const lightBtn = document.getElementById('toggleLightMode');

        if (state.isDrawMode) {
            state.isLightAddMode = false;
            state.isDoorDrawMode = false; // Turn off doors
            
            // Force Door button to OFF visual state
            doorBtn.style.background = "#444";
            doorBtn.innerText = "🚪 Door (OFF)";
            lightBtn.style.background = "#27272a";
        } else {
            state.activeSelectWallIndex = null;
            redrawWalls();
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}        
        // Update Wall button visual state
        e.target.style.background = state.isDrawMode ? "#2e7d32" : "#444";
        e.target.innerText = state.isDrawMode ? "✏️ Wall" : "✏️ Wall (OFF)";
        app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
    });

    document.getElementById('toggleDoorDraw').addEventListener('click', (e) => {
        state.isDoorDrawMode = !state.isDoorDrawMode;
        
        const wallBtn = document.getElementById('toggleDraw');
        const lightBtn = document.getElementById('toggleLightMode');

        if (state.isDoorDrawMode) {
            state.isDrawMode = false;
            state.isLightAddMode = false;
            
            // Force Wall button to OFF visual state
            wallBtn.style.background = "#444";
            wallBtn.innerText = "✏️ Wall (OFF)";
            lightBtn.style.background = "#27272a";
        } else {
            state.activeSelectWallIndex = null;
            redrawWalls();
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}        
        // Update Door button visual state (Using the same green as walls)
        e.target.style.background = state.isDoorDrawMode ? "#2e7d32" : "#444";
        e.target.innerText = state.isDoorDrawMode ? "🚪 Door" : "🚪 Door (OFF)";
        app.view.style.cursor = state.isDoorDrawMode ? 'crosshair' : 'default';
    });
    
    document.getElementById('btnToggleDoor').addEventListener('click', () => {
        if (state.activeSelectWallIndex !== null && state.walls[state.activeSelectWallIndex]) {
            const selectedGeom = state.walls[state.activeSelectWallIndex];
            
            if (selectedGeom.type === 'door') {
                selectedGeom.isOpen = !selectedGeom.isOpen;
                set(dbRefs.walls, state.walls);
                redrawWalls();
                updateLighting();
            
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    });

    document.getElementById('toggleLightMode').addEventListener('click', (e) => {
        state.isLightAddMode = !state.isLightAddMode;
        
        if (state.isLightAddMode) {
            state.isDrawMode = false;
            state.isDoorDrawMode = false;
            state.activeSelectWallIndex = null;
            redrawWalls();
            
            // Force BOTH architecture buttons to OFF visual state
            const wallBtn = document.getElementById('toggleDraw');
            const doorBtn = document.getElementById('toggleDoorDraw');
            
            wallBtn.style.background = "#444";
            wallBtn.innerText = "✏️ Wall (OFF)";
            doorBtn.style.background = "#444";
            doorBtn.innerText = "🚪 Door (OFF)";
            
            e.target.style.background = "#b8860b";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#27272a";
            app.view.style.cursor = 'default';
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    });

    const tokenCountSel = document.getElementById('tokenCountSelect'); // optional — removed from the Entities panel
    if (tokenCountSel) tokenCountSel.addEventListener('change', (e) => {
        const newCount = parseInt(e.target.value, 10);
        set(dbRefs.tokenSettings, { ...state.tokenSettings, count: newCount });
    });

    document.getElementById('tokenRadiusInput').addEventListener('input', (e) => {
        const newRadius = parseInt(e.target.value, 10);
        state.tokenSettings.radius = newRadius;
        updateLighting(); 
        set(dbRefs.tokenSettings, state.tokenSettings);
    });
    
    document.getElementById('clearWalls').addEventListener('click', () => { 
        set(dbRefs.walls, []); 
        state.activeSelectWallIndex = null; 
        redrawWalls(); 
    });

    // --- FIX 2B: LIGHT RADIUS & TYPE ---
    document.getElementById('lightRadiusInput').addEventListener('input', (e) => {
        const newRadius = parseInt(e.target.value, 10);
        
        // BUG 2B FIX: Only edit a placed light if we explicitly clicked it (not in 'Place Light' mode)
        if (!state.isLightAddMode && state.activeSelectLightId && state.lights[state.activeSelectLightId]) {
            state.lights[state.activeSelectLightId].radius = newRadius; 
            updateLighting(); 
            set(dbRef(db, `lights/${state.activeSelectLightId}/radius`), newRadius); 
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    });

    document.getElementById('lightTypeSelect').addEventListener('change', (e) => {
        const type = e.target.value;
        const radiusInput = document.getElementById('lightRadiusInput');
        
        // Auto-set the radius slider based on the type
        if (type === 'ceiling') radiusInput.value = 400;
        if (type === 'emergency') radiusInput.value = 120;
        
        // BUG 2B FIX: Only edit a placed light if we explicitly clicked it
        if (!state.isLightAddMode && state.activeSelectLightId && state.lights[state.activeSelectLightId]) {
            set(dbRef(db, `lights/${state.activeSelectLightId}/type`), type);
            set(dbRef(db, `lights/${state.activeSelectLightId}/radius`), parseInt(radiusInput.value, 10));
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    });

    // --- FIX 2A: CLEAR ALL LIGHTS GHOSTING ---
    document.getElementById('clearLights').addEventListener('click', () => { 
        // 1. Send clear command to Firebase
        set(dbRefs.lights, null); 
        
        // 2. BUG 2A FIX: Instantly wipe local state to prevent any network-lag ghosts
        state.lights = {};
        state.activeSelectLightId = null; 
        
        // 3. Destroy all existing marker graphics from the canvas immediately
        if (state.lightMarkers) {
            Object.keys(state.lightMarkers).forEach(id => {
                if (state.lightMarkers[id]) {
                    lightMarkerLayer.removeChild(state.lightMarkers[id]);
                    state.lightMarkers[id].destroy();
                
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}            });
            state.lightMarkers = {};
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}        
        // 4. Force a clean render update
        updateLighting();
    });

    const modeSelect = document.getElementById('modeSelect');
    const gmTools = document.getElementById('gmTools');
    const modeToggle = document.getElementById('mode-toggle');
    const modeSwitch = modeToggle ? modeToggle.querySelector('.mode-switch') : null;
    const prepSide = modeToggle ? modeToggle.querySelector('[data-side="prep"]') : null;
    const playSide = modeToggle ? modeToggle.querySelector('[data-side="play"]') : null;

    // The sliding switch mirrors the hidden <select> (input.js/renderer.js keep
    // reading its value — nothing else changes for them). The knob is left for
    // PLAY, right for PREP; the active label lights up.
    const syncModeToggle = () => {
        if (!modeSwitch) return;
        const isPrep = modeSelect.value === 'prep';
        modeSwitch.setAttribute('aria-checked', String(isPrep));
        modeSwitch.dataset.mode = isPrep ? 'prep' : 'play';
        const knob = modeSwitch.querySelector('.mode-knob');
        if (knob) knob.classList.toggle('knob-right', isPrep);
        if (prepSide) prepSide.classList.toggle('mode-side-active', isPrep);
        if (playSide) playSide.classList.toggle('mode-side-active', !isPrep);
    };

    // Flipping the switch (or clicking either label) sets the mode.
    const setMode = (mode) => {
        if (mode !== 'prep' && mode !== 'play') return;
        if (modeSelect.value === mode) return;
        modeSelect.value = mode;
        modeSelect.dispatchEvent(new Event('change'));
        syncModeToggle();
    };
    if (modeSwitch) {
        // Listen on the switch itself. Its child knob is inside it, so a click
        // on the knob bubbles up here too.
        modeSwitch.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (modeSwitch.disabled) return;
            setMode(modeSelect.value === 'prep' ? 'play' : 'prep');
        });
    
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    [prepSide, playSide].forEach((side) => {
        if (side) side.addEventListener('click', () => {
            if (modeSwitch && modeSwitch.disabled) return;
            setMode(side.dataset.side);
        });
    });
    // The <select> is the single source of truth: whenever its value changes by
    // any route (switch, label, gate, or code), re-sync the switch visuals.
    modeSelect.addEventListener('change', syncModeToggle);
    syncModeToggle();

    // V1.4 Player & Token alignment: Token spawner suite for custom labels and colors
    // --- FEATURE: TOKEN SPAWNING (CREW & NPCS) ---
    // Helper to extract initials (up to 2 chars) from a name
    function getInitials(name) {
        if (!name) return "?";
        const parts = name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        // V1.4 Fix: Use only the first letter for single-word names (e.g., "Sean" -> "S", not "SE")
        return name.charAt(0).toUpperCase();
    
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}
    document.getElementById('btnSpawnCrew').addEventListener('click', async () => {
        // Read the local player database
        const players = await playerDB.getAllPlayers();
        if (!players || players.length === 0) {
            alert("No crew registered in manifest.");
            return;
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}
        // 1. Force the count to 0 so we always get a clean, fresh spawn
        let currentCount = 0; 
        const newTokens = {}; // Bundle all tokens together
        
        players.forEach(p => {
            // 2. Strict GM check: Ensure we skip anyone with the Admin flag
            if (p.isAdmin === true) return; 
            
            currentCount++;
            const label = getInitials(p.name);
            const color = p.color || "#3f3f46";
            
            // Build the token payload locally
            newTokens[currentCount] = {
                x: 0,
                y: 0,
                color: color,
                label: label,
                hasLantern: false
            };
        });
        
        // 3. AWAIT the data write: Guarantee the custom colors are in the database FIRST
        await set(dbRef(db, 'tokens'), newTokens);
        
        // 4. NOW tell the engine to render them (it will find the colors waiting for it)
        await set(dbRefs.tokenSettings, { ...state.tokenSettings, count: currentCount });
    });

    document.getElementById('btnSpawnNPC').addEventListener('click', () => {
        const color = document.getElementById('spawnColor').value;
        const label = document.getElementById('spawnLabel').value.trim() || "?";
        
        let currentCount = state.tokenSettings ? state.tokenSettings.count || 0 : 0;
        currentCount++;
        
        // Spawn slightly offset from center so they don't pile up perfectly on each other
        const offsetX = (Math.random() * 100) - 50;
        const offsetY = (Math.random() * 100) - 50;
        
        set(dbRef(db, `tokens/${currentCount}`), {
            x: offsetX,
            y: offsetY,
            color: color,
            label: label,
            hasLantern: false
        });
        
        set(dbRefs.tokenSettings, { ...state.tokenSettings, count: currentCount });
        document.getElementById('spawnLabel').value = ''; // clear input
    });

    document.getElementById('btnClearTokens').addEventListener('click', () => {
        if (confirm("Remove all tokens from the map?")) {
            set(dbRef(db, 'tokens'), null);
            set(dbRefs.tokenSettings, { ...state.tokenSettings, count: 0 });
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    });

    
    // V1.4 Player & Token alignment: Token spawner suite for custom labels and colors
    // --- FEATURE: TOKEN SPAWNING (CREW & NPCS) ---
    // Helper to extract initials (up to 2 chars) from a name
    function getInitials(name) {
        if (!name) return "?";
        const parts = name.trim().split(' ');
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        // V1.4 Fix: Use only the first letter for single-word names (e.g., "Sean" -> "S", not "SE")
        return name.charAt(0).toUpperCase();
    
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}
    document.getElementById('btnSpawnCrew').addEventListener('click', async () => {
        // Read the local player database
        const players = await playerDB.getAllPlayers();
        if (!players || players.length === 0) {
            alert("No crew registered in manifest.");
            return;
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}
        // We reset tokenSettings count to handle the new batch
        let currentCount = state.tokenSettings ? state.tokenSettings.count || 0 : 0;
        
        players.forEach(p => {
            // V1.5 Fix: Do not spawn a map token for the GM/Admin
            if (p.isAdmin) return;
            
            currentCount++;
            const label = getInitials(p.name);
            const color = p.color || "#3f3f46";
            
            // Spawn in center of map
            set(dbRef(db, `tokens/${currentCount}`), {
                x: 0,
                y: 0,
                color: color,
                label: label,
                hasLantern: false
            });
        });
        
        set(dbRefs.tokenSettings, { ...state.tokenSettings, count: currentCount });
    });

    document.getElementById('btnSpawnNPC').addEventListener('click', () => {
        const color = document.getElementById('spawnColor').value;
        const label = document.getElementById('spawnLabel').value.trim() || "?";
        
        let currentCount = state.tokenSettings ? state.tokenSettings.count || 0 : 0;
        currentCount++;
        
        // Spawn slightly offset from center so they don't pile up perfectly on each other
        const offsetX = (Math.random() * 100) - 50;
        const offsetY = (Math.random() * 100) - 50;
        
        set(dbRef(db, `tokens/${currentCount}`), {
            x: offsetX,
            y: offsetY,
            color: color,
            label: label,
            hasLantern: false
        });
        
        set(dbRefs.tokenSettings, { ...state.tokenSettings, count: currentCount });
        document.getElementById('spawnLabel').value = ''; // clear input
    });

    document.getElementById('btnClearTokens').addEventListener('click', () => {
        if (confirm("Remove all tokens from the map?")) {
            set(dbRef(db, 'tokens'), null);
            set(dbRefs.tokenSettings, { ...state.tokenSettings, count: 0 });
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    });

    // --- ACCESS GATE -------------------------------------------------------
    // A plain URL (/) is always play-mode only.
    // An admin URL (/admin_mode, ?admin, ?mode=admin) opens an ADMIN SESSION,
    // but prep mode only unlocks once a crew member flagged 👑 isAdmin in the
    // player database is seated. The gate re-evaluates whenever the crew
    // roster or seat changes (see players.js).
    if (window.__VTT_ADMIN__) {
        const modeSection = document.getElementById('modeSection');

        const hint = document.createElement('div');
        hint.style.cssText = "text-align:center; font-size:10px; color:#f59e0b; padding:2px 0; display:none;";
        hint.textContent = '👑 Seat an admin crew member to unlock prep mode';
        if (modeSection) modeSection.appendChild(hint);

        const applyAdminGate = () => {
            if (isAdminSeated()) {
                if (modeSwitch) modeSwitch.disabled = false;
                hint.style.display = 'none';
                if (modeSelect.value !== 'prep') {
                    modeSelect.value = 'prep'; // admins land in prep mode
                    modeSelect.dispatchEvent(new Event('change'));
                
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}            } else {
                if (modeSwitch) modeSwitch.disabled = true;
                hint.style.display = 'block';
                if (modeSelect.value !== 'play') {
                    modeSelect.value = 'play';
                    modeSelect.dispatchEvent(new Event('change'));
                
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}            
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}            // Always re-sync, whether or not the value changed — the switch must
            // never be out of step with the hidden <select>.
            syncModeToggle();
        };
        onPlayerChange(applyAdminGate); // fires once players.js finishes loading
        applyAdminGate();
    } else {
        // Players: hide the toggle entirely so prep can never be selected.
        if (modeToggle) modeToggle.style.display = 'none';

        const modeSection = document.getElementById('modeSection');
        if (modeSection) {
            const badge = document.createElement('div');
            badge.style.cssText = "text-align:center; font-size:11px; letter-spacing:0.5px; color:#71717a; padding:4px 0;";
            badge.innerHTML = '👤 PLAYER · <span style="color:#00ffcc;">PLAY MODE</span>';
            modeSection.appendChild(badge);
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}    
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}
    modeSelect.addEventListener('change', (e) => {
        syncModeToggle();
        const isPrepMode = e.target.value === 'prep';
        
        wallLayer.visible = isPrepMode;
        previewLayer.visible = isPrepMode; 
        lightMarkerLayer.visible = isPrepMode;
        fowContainer.visible = !isPrepMode;
        lightingContainer.mask = null; 
        
        // Toggle the entire GM UI block
        if (gmTools) gmTools.style.display = isPrepMode ? 'flex' : 'none';
        
        if (!isPrepMode) {
            state.isDrawMode = false;
            state.isLightAddMode = false;
            state.activeSelectLightId = null; 
            state.activeSelectWallIndex = null;
            document.getElementById('toggleDraw').innerText = "✏️ Draw Walls: OFF";
            document.getElementById('toggleDraw').style.background = "#444";
            document.getElementById('toggleLightMode').innerText = "💡 Add Lights: OFF";
            document.getElementById('toggleLightMode').style.background = "#b8860b";
            if (!state.isSpacePressed) app.view.style.cursor = 'default';
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}        
        redrawWalls();
        updateLighting(); 
    });

    // Force Play Mode immediately on load
    modeSelect.dispatchEvent(new Event('change'));

    // --- INSTANT MAP PREVIEW UPLOAD ---
    document.getElementById('mapUpload').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const sectionHeader = document.querySelector('#sec-cartography h4');
        if (sectionHeader) sectionHeader.innerText = "Cartography (Uploading...) ⏳";
        document.getElementById('mapUpload').disabled = true;

        // 1. INSTANT LOCAL PREVIEW FOR THE GM (Zero Latency)
        try {
            const localUrl = URL.createObjectURL(file);
            if (file.type !== 'application/pdf') {
                const texture = await PIXI.Texture.fromURL(localUrl);
                displayMap(texture);
                state.currentMapUrl = localUrl; 
            
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}        } catch (previewErr) {
            console.warn("Local preview skipped:", previewErr);
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}
        // 2. BACKGROUND UPLOAD FOR PLAYERS
        try {
            const sRef = storageRef(storage, `maps/${Date.now()}_${file.name}`);
            await uploadBytes(sRef, file);
            const url = await getDownloadURL(sRef);
            
            // Sync the final cloud URL to everyone else
            set(dbRefs.mapData, { url: url, type: file.type });
        } catch (e) {
            console.error(e);
            alert("Upload failed.");
        
    // --- FEATURE: SCALE CALIBRATION ---
    document.getElementById('btnCalibrate').addEventListener('click', (e) => {
        state.isCalibrating = !state.isCalibrating;
        if (state.isCalibrating) {
            e.target.style.background = "#d32f2f";
            e.target.innerText = "Cancel Calibration";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.style.background = "#1e88e5";
            e.target.innerText = "📏 Calibrate by Dragging";
            app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
        }
    });

    ['scalePixels', 'scaleDistance', 'scaleUnit'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            const px = parseFloat(document.getElementById('scalePixels').value) || 70;
            const dist = parseFloat(document.getElementById('scaleDistance').value) || 5;
            const unit = document.getElementById('scaleUnit').value || 'ft';
            set(dbRef(db, 'mapScale'), { pixels: px, distance: dist, unit: unit });
        });
    });
}        
        if (sectionHeader) sectionHeader.innerText = "Cartography";
        document.getElementById('mapUpload').disabled = false;
    });
}
import { state } from './state.js';
// Combined renderer imports:
import { 
    app, mapContainer, fitMapToScreen, redrawWalls, updateLighting, 
    wallLayer, previewLayer, lightMarkerLayer, fowContainer, lightingContainer,
    VTT_WIDTH, VTT_HEIGHT 
} from './renderer.js';
import { db, set, dbRef, dbRefs, storage, storageRef, uploadBytes, getDownloadURL, get } from './firebase.js';
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
    // Replace your existing toggleLock listener with this one:
    document.getElementById('toggleLock').addEventListener('click', () => {
        const newLockState = !state.isMovementLocked;
        set(dbRefs.movementLock, newLockState);
        
        // When UNLOCKING (starting a new round), lock in the tokens' current positions as their new origins
        if (!newLockState && state.tokens) {
            Object.keys(state.tokens).forEach(id => {
                const t = state.tokens[id];
                set(dbRef(db, `tokens/${id}/originX`), t.x);
                set(dbRef(db, `tokens/${id}/originY`), t.y);
            });
        }
    });

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
        }
    });

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
            }
        };
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
            }
        }
    });

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
        }
    });

    document.getElementById('lightRadiusInput').addEventListener('input', (e) => {
        const newRadius = parseInt(e.target.value, 10);
        if (state.activeSelectLightId && state.lights[state.activeSelectLightId]) {
            state.lights[state.activeSelectLightId].radius = newRadius; 
            updateLighting(); 
            set(dbRef(db, `lights/${state.activeSelectLightId}/radius`), newRadius); 
        }
    });

    document.getElementById('lightTypeSelect').addEventListener('change', (e) => {
        const type = e.target.value;
        const radiusInput = document.getElementById('lightRadiusInput');
        
        if (type === 'ceiling') radiusInput.value = 400;
        if (type === 'emergency') radiusInput.value = 120;
        
        if (state.activeSelectLightId && state.lights[state.activeSelectLightId]) {
            set(dbRef(db, `lights/${state.activeSelectLightId}/type`), type);
            set(dbRef(db, `lights/${state.activeSelectLightId}/radius`), parseInt(radiusInput.value, 10));
        }
    });

    document.getElementById('tokenCountSelect').addEventListener('change', (e) => {
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

    document.getElementById('clearLights').addEventListener('click', () => { 
        set(dbRefs.lights, null); 
        state.activeSelectLightId = null; 
    });
    const modeSelect = document.getElementById('modeSelect');
    const gmTools = document.getElementById('gmTools');

    modeSelect.addEventListener('change', (e) => {
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
        }
        
        redrawWalls();
        updateLighting(); 
    });

    // Force Play Mode immediately on load
    modeSelect.dispatchEvent(new Event('change'));

    document.getElementById('mapUpload').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const fileLabel = document.querySelector('label[for="mapUpload"] strong');
        fileLabel.innerText = "Uploading... ";
        document.getElementById('mapUpload').disabled = true;

        try {
            const sRef = storageRef(storage, `maps/${Date.now()}_${file.name}`);
            await uploadBytes(sRef, file);
            const url = await getDownloadURL(sRef);
            set(dbRefs.mapData, { url: url, type: file.type });
        } catch (e) {
            console.error(e);
            alert("Upload failed.");
        }
        
        fileLabel.innerText = "Map: ";
        document.getElementById('mapUpload').disabled = false;
    });
}
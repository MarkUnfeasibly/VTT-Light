import { state } from './state.js';
import { app, mapContainer, fitMapToScreen, redrawWalls, updateLighting, wallLayer, previewLayer, lightMarkerLayer, fowContainer, lightingContainer } from './renderer.js';
import { db, set, dbRef, dbRefs, storage, storageRef, uploadBytes, getDownloadURL, get } from './firebase.js';

export function setupUI() {
    // --- FEATURE: MAX MOVE HALO SLIDER ---
    document.getElementById('haloRadiusInput').addEventListener('input', (e) => {
        set(dbRefs.haloRadius, parseInt(e.target.value, 10));
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
        if (state.isDrawMode) {
            state.isLightAddMode = false; 
            document.getElementById('toggleLightMode').innerText = "💡 Add Lights: OFF";
            document.getElementById('toggleLightMode').style.background = "#b8860b";
            document.getElementById('lightHint').style.display = "none";
        } else {
            state.activeSelectWallIndex = null;
            redrawWalls();
        }
        
        e.target.innerText = state.isDrawMode ? "✏️ Draw Walls: ON" : "✏️ Draw Walls: OFF";
        e.target.style.background = state.isDrawMode ? "#2e7d32" : "#444";
        app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
    });

    document.getElementById('toggleLightMode').addEventListener('click', (e) => {
        state.isLightAddMode = !state.isLightAddMode;
        
        if (state.isLightAddMode) {
            state.isDrawMode = false; 
            state.activeSelectWallIndex = null;
            redrawWalls();
            document.getElementById('toggleDraw').innerText = "✏️ Draw Walls: OFF";
            document.getElementById('toggleDraw').style.background = "#444";
            
            e.target.innerText = "💡 Add Lights: ON";
            e.target.style.background = "#d4a017";
            document.getElementById('lightHint').style.display = "inline-block";
            app.view.style.cursor = 'crosshair';
        } else {
            e.target.innerText = "💡 Add Lights: OFF";
            e.target.style.background = "#b8860b";
            document.getElementById('lightHint').style.display = "none";
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
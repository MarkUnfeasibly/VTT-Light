import { state } from './state.js';
import { app, mapContainer, fitMapToScreen, redrawWalls, updateLighting, wallLayer, previewLayer, lightMarkerLayer, fowContainer } from './renderer.js';
import { db, set, dbRef, dbRefs, storage, storageRef, uploadBytes, getDownloadURL } from './firebase.js';

export function setupUI() {
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

    document.getElementById('modeSelect').addEventListener('change', (e) => {
        const isPrepMode = e.target.value === 'prep';
        
        wallLayer.visible = isPrepMode;
        previewLayer.visible = isPrepMode; 
        lightMarkerLayer.visible = isPrepMode;
        fowContainer.visible = !isPrepMode;
        lightingContainer.mask = null; // Lighting container should never be masked
        
        document.getElementById('drawControls').style.display = isPrepMode ? 'flex' : 'none';
        document.getElementById('lightControls').style.display = isPrepMode ? 'flex' : 'none';
        document.getElementById('tokenControls').style.display = isPrepMode ? 'flex' : 'none';
        
        if (isPrepMode) {
            document.getElementById('lightHint').style.display = "inline-block";
        } else {
            document.getElementById('lightHint').style.display = "none";
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

    document.getElementById('mapUpload').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const fileLabel = document.querySelector('label[for="mapUpload"] strong');
        fileLabel.innerText = "Uploading... ";
        document.getElementById('mapUpload').disabled = true;

        try {
            const sRef = storageRef(storage, 'maps/current_map');
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
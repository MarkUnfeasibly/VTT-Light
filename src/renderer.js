import * as PIXI from 'pixi.js';
import { state } from './state.js';
import { db, set, dbRef } from './firebase.js';
import { generateRaycastPolygon } from './math.js';

export const VTT_WIDTH = 1024;
export const VTT_HEIGHT = 768;

export const app = new PIXI.Application({
    width: VTT_WIDTH,
    height: VTT_HEIGHT,
    backgroundColor: 0x111111,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
});

export const mapContainer = new PIXI.Container();
mapContainer.x = VTT_WIDTH / 2;
mapContainer.y = VTT_HEIGHT / 2;
app.stage.addChild(mapContainer);

export const wallLayer = new PIXI.Graphics();
export const previewLayer = new PIXI.Graphics();

export const lightingContainer = new PIXI.Container();
export const darknessContainer = new PIXI.Container();
darknessContainer.filters = [new PIXI.AlphaFilter(1.0)]; 
export const darknessRect = new PIXI.Graphics();
darknessContainer.addChild(darknessRect);

export const eraseLayer = new PIXI.Container();
darknessContainer.addChild(eraseLayer);
export const lanternLayer = new PIXI.Container(); 

lightingContainer.addChild(darknessContainer);
lightingContainer.addChild(lanternLayer);

export const fowContainer = new PIXI.Container();
fowContainer.filters = [new PIXI.AlphaFilter(1.0)];
export const fowDarkness = new PIXI.Graphics();
export const fowEraseLayer = new PIXI.Container();
fowContainer.addChild(fowDarkness);
fowContainer.addChild(fowEraseLayer);

export const lightMarkerLayer = new PIXI.Container(); 
export const tokenLayer = new PIXI.Container(); 

const gradientCache = {};
export function getGradientTexture(radius) {
    if (gradientCache[radius]) return gradientCache[radius];
    const canvas = document.createElement('canvas');
    canvas.width = radius * 2;
    canvas.height = radius * 2;
    const ctx = canvas.getContext('2d');
    
    const grd = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grd.addColorStop(0, 'rgba(255, 255, 255, 1)'); 
    grd.addColorStop(1, 'rgba(255, 255, 255, 0)'); 
    
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, radius * 2, radius * 2);
    
    const texture = PIXI.Texture.from(canvas);
    gradientCache[radius] = texture;
    return texture;
}

export function drawMarkerIcon(marker, type, isSelected) {
    marker.clear();
    const color = type === 'emergency' ? 0xff0000 : 0xffd700;
    marker.beginFill(color, 0.8);
    marker.drawCircle(0, 0, 12);
    marker.endFill();
    marker.lineStyle(isSelected ? 4 : 2, isSelected ? 0x00ff00 : 0xffffff);
    marker.drawCircle(0, 0, 12);
}

export function createLightMarker(id, lightData) {
    const marker = new PIXI.Graphics();
    drawMarkerIcon(marker, lightData.type, id === state.activeSelectLightId);

    marker.eventMode = 'static';
    marker.cursor = 'pointer';
    marker.x = lightData.x;
    marker.y = lightData.y;

    marker.on('pointerdown', (e) => {
        e.stopPropagation(); 
        if (e.shiftKey) {
            set(dbRef(db, `lights/${id}`), null);
            if (state.activeSelectLightId === id) state.activeSelectLightId = null;
            return;
        }
        
        if (document.getElementById('modeSelect').value === 'prep') {
            state.activeSelectWallIndex = null;
            redrawWalls();
            
            state.activeDragLightId = id;
            state.activeSelectLightId = id; 
            app.view.style.cursor = 'grabbing';
            
            document.getElementById('lightTypeSelect').value = lightData.type;
            document.getElementById('lightRadiusInput').value = lightData.radius || 400;
            
            Object.keys(state.lightMarkers).forEach(otherId => {
                drawMarkerIcon(state.lightMarkers[otherId], state.lights[otherId].type, otherId === state.activeSelectLightId);
            });
        }
    });
    return marker;
}

export function drawTokenIcon(graphics, hasLantern) {
    graphics.clear();
    graphics.beginFill(0x2d88ff); 
    graphics.lineStyle(3, hasLantern ? 0xffe699 : 0xffffff); 
    graphics.moveTo(0, -20);
    graphics.lineTo(20, 0);
    graphics.lineTo(0, 20);
    graphics.lineTo(-20, 0);
    graphics.closePath();
    graphics.endFill();
    
    if (hasLantern) {
        graphics.lineStyle(0);
        graphics.beginFill(0xffe699, 0.4);
        graphics.drawCircle(0, 0, 24);
        graphics.endFill();
    }
}

export function createTokenSprite(id) {
    const container = new PIXI.Container();
    container.eventMode = 'static';
    container.cursor = 'pointer';

    const bg = new PIXI.Graphics();
    drawTokenIcon(bg, false);
    
    const text = new PIXI.Text(id.toString(), {
        fontFamily: 'system-ui',
        fontSize: 18,
        fill: 0xffffff,
        fontWeight: 'bold'
    });
    text.anchor.set(0.5);

    container.addChild(bg);
    container.addChild(text);

    let lastClickTime = 0;

    container.on('pointerdown', (e) => {
        e.stopPropagation();
        const now = Date.now();
        if (now - lastClickTime < 300) {
            set(dbRef(db, `tokens/${id}/hasLantern`), !state.tokens[id].hasLantern);
        }
        lastClickTime = now;

        state.activeDragTokenId = id.toString();
        app.view.style.cursor = 'grabbing';
    });

    return container;
}

export function displayMap(texture) {
    state.currentMapSprite = new PIXI.Sprite(texture);
    state.currentMapSprite.anchor.set(0.5); 
    
    mapContainer.addChildAt(state.currentMapSprite, 0);
    mapContainer.addChild(wallLayer);
    mapContainer.addChild(previewLayer);
    
    mapContainer.addChild(lightingContainer);
    mapContainer.addChild(fowContainer); 
    mapContainer.addChild(lightMarkerLayer); 
    mapContainer.addChild(tokenLayer); 
    mapContainer.addChild(haloLayer);
    
    mapContainer.angle = 0; 
    fitMapToScreen();
    
    const isPrepMode = document.getElementById('modeSelect').value === 'prep';
    wallLayer.visible = isPrepMode;
    previewLayer.visible = isPrepMode;
    lightMarkerLayer.visible = isPrepMode;
    fowContainer.visible = !isPrepMode; 
    
    updateLighting();
}

export function fitMapToScreen() {
    if (!state.currentMapSprite) return;
    const origWidth = state.currentMapSprite.texture.width;
    const origHeight = state.currentMapSprite.texture.height;
    const isSwapped = Math.abs(mapContainer.angle % 180) === 90;
    const currentWidth = isSwapped ? origHeight : origWidth;
    const currentHeight = isSwapped ? origWidth : origHeight;

    const scaleX = VTT_WIDTH / currentWidth;
    const scaleY = VTT_HEIGHT / currentHeight;
    mapContainer.scale.set(Math.min(scaleX, scaleY) * 0.95); 
}

export function redrawWalls() {
    wallLayer.clear();
    const isPrepMode = document.getElementById('modeSelect').value === 'prep';
    wallLayer.visible = isPrepMode;
    if (!isPrepMode) return;

    state.walls.forEach((wall, idx) => {
        const isSelected = idx === state.activeSelectWallIndex;
        wallLayer.lineStyle(4, isSelected ? 0x00ff00 : 0x00ffff, 1); 
        wallLayer.moveTo(wall.p1.x, wall.p1.y);
        wallLayer.lineTo(wall.p2.x, wall.p2.y);
        
        if (isSelected) {
            wallLayer.lineStyle(2, 0xffffff, 1);
            wallLayer.beginFill(0x00ff00, 0.8);
            wallLayer.drawCircle(wall.p1.x, wall.p1.y, 8);
            wallLayer.drawCircle(wall.p2.x, wall.p2.y, 8);
            wallLayer.endFill();
        }
    });
}

export function updateLighting() {
    if (!state.currentMapSprite) return;

    const w = state.currentMapSprite.texture.width / 2;
    const h = state.currentMapSprite.texture.height / 2;
    
    const bounds = [
        { id: "Top Bound",    p1: { x: -w * 2, y: -h }, p2: { x: w * 2, y: -h } },
        { id: "Right Bound",  p1: { x: w, y: -h * 2 },  p2: { x: w, y: h * 2 } },
        { id: "Bottom Bound", p1: { x: w * 2, y: h },   p2: { x: -w * 2, y: h } },
        { id: "Left Bound",   p1: { x: -w, y: h * 2 },  p2: { x: -w, y: -h * 2 } }
    ];

    const allWalls = state.walls.concat(bounds);
    const uniquePoints = [];
    
    allWalls.forEach(wall => {
        [wall.p1, wall.p2].forEach(pt => {
            const exists = uniquePoints.some(up => Math.abs(up.x - pt.x) < 0.1 && Math.abs(up.y - pt.y) < 0.1);
            if (!exists) uniquePoints.push(pt);
        });
    });

    const mapCorners = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }];
    mapCorners.forEach(pt => {
        const exists = uniquePoints.some(up => Math.abs(up.x - pt.x) < 0.1 && Math.abs(up.y - pt.y) < 0.1);
        if (!exists) uniquePoints.push(pt);
    });

    const isPrepMode = document.getElementById('modeSelect').value === 'prep';
    
    // CLEAR TIER 1
    darknessRect.clear();
    darknessRect.beginFill(0x000000, isPrepMode ? 0.7 : 1.0); 
    darknessRect.drawRect(-w * 2, -h * 2, w * 4, h * 4);
    darknessRect.endFill();
    
    while (eraseLayer.children.length > 0) {
        const child = eraseLayer.children[0];
        eraseLayer.removeChild(child);
        child.destroy({ children: true });
    }
    while (lanternLayer.children.length > 0) {
        const child = lanternLayer.children[0];
        lanternLayer.removeChild(child);
        child.destroy({ children: true });
    }

    // CLEAR TIER 2 (FoW)
    fowDarkness.clear();
    fowDarkness.beginFill(0x000000, 1.0);
    fowDarkness.drawRect(-w * 2, -h * 2, w * 4, h * 4);
    fowDarkness.endFill();

    while (fowEraseLayer.children.length > 0) {
        const child = fowEraseLayer.children[0];
        fowEraseLayer.removeChild(child);
        child.destroy({ children: true });
    }

    // GATHER TIER 1 LIGHTS
    const activeLights = Object.values(state.lights).map(l => ({...l}));
    for (let i = 1; i <= state.tokenSettings.count; i++) {
        if (state.tokens[i] && state.tokens[i].hasLantern) {
            activeLights.push({ x: state.tokens[i].x, y: state.tokens[i].y, type: 'tokenLantern', radius: state.tokenSettings.radius });
        }
    }

    // RENDER TIER 1
    activeLights.forEach(light => {
        const radius = light.radius || 400; 
        let tintColor = 0xfff5cc; 
        let tintAlpha = 0.2;
        if (light.type === 'emergency') { tintColor = 0xff3300; tintAlpha = 0.5; } 
        else if (light.type === 'tokenLantern') { tintColor = 0xffe699; tintAlpha = 0.35; }

        const originPt = { x: light.x, y: light.y };
        const maskGraphics = generateRaycastPolygon(originPt, radius, uniquePoints, allWalls);
        const maskGraphicsColor = maskGraphics.clone();
        const gradTexture = getGradientTexture(radius);

        const eraseSprite = new PIXI.Sprite(gradTexture);
        eraseSprite.anchor.set(0.5);
        eraseSprite.x = light.x; eraseSprite.y = light.y;
        eraseSprite.blendMode = PIXI.BLEND_MODES.ERASE; 
        eraseSprite.mask = maskGraphics;
        
        const eraseGroup = new PIXI.Container();
        eraseGroup.addChild(eraseSprite); eraseGroup.addChild(maskGraphics);
        eraseLayer.addChild(eraseGroup);

        const colorSprite = new PIXI.Sprite(gradTexture);
        colorSprite.anchor.set(0.5);
        colorSprite.x = light.x; colorSprite.y = light.y;
        colorSprite.tint = tintColor; colorSprite.alpha = tintAlpha;
        colorSprite.blendMode = PIXI.BLEND_MODES.ADD;
        colorSprite.mask = maskGraphicsColor;

        const colorGroup = new PIXI.Container();
        colorGroup.addChild(colorSprite); colorGroup.addChild(maskGraphicsColor);
        lanternLayer.addChild(colorGroup);
    });

    // RENDER TIER 2 (FOG OF WAR MASK)
    // RENDER TIER 2 (FOG OF WAR MASK)
    lightingContainer.mask = null; // Ensure base lighting is never masked

    if (!isPrepMode) {
        for (let i = 1; i <= state.tokenSettings.count; i++) {
            if (state.tokens[i]) {
                const tokenOrigin = { x: state.tokens[i].x, y: state.tokens[i].y };
                
                // Generate the infinite line of sight polygon
                const fowMask = generateRaycastPolygon(tokenOrigin, 4000, uniquePoints, allWalls);
                
                // Erase this polygon from the pitch-black fowDarkness layer
                fowMask.blendMode = PIXI.BLEND_MODES.ERASE; 
                fowEraseLayer.addChild(fowMask);
            }
        }
    }
}
export const haloLayer = new PIXI.Graphics();
// Make sure to add it to your mapContainer (e.g., mapContainer.addChild(haloLayer))

export function drawHalos() {
    haloLayer.clear();
    
    // Hide halos in prep mode or when the board is locked
    if (document.getElementById('modeSelect').value === 'prep' || state.isMovementLocked) return;

    haloLayer.lineStyle(3, 0x00ffcc, 0.4); // Faint cyan ring
    
    if (state.tokens && state.tokenSettings) {
        // NEW: Only draw rings for the active number of players
        for (let i = 1; i <= state.tokenSettings.count; i++) {
            const t = state.tokens[i];
            if (t) {
                const ox = t.originX !== undefined ? t.originX : t.x;
                const oy = t.originY !== undefined ? t.originY : t.y;
                haloLayer.drawCircle(ox, oy, state.haloRadius || 200);
            }
        }
    }
}
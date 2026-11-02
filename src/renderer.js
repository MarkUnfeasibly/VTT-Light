import * as PIXI from 'pixi.js';
import { state } from './state.js';
import { db, set, dbRef } from './firebase.js';
import { generateRaycastPolygon } from './math.js';

// Viewport tracks the #vtt-container element (the middle grid column), so the
// map always fills the space between the GM and POPS panels.
function containerSize() {
    const el = document.getElementById('vtt-container');
    return {
        w: (el && el.clientWidth) || 1024,
        h: (el && el.clientHeight) || 768
    };
}

const initialSize = containerSize();
export let VTT_WIDTH = initialSize.w;
export let VTT_HEIGHT = initialSize.h;

export const app = new PIXI.Application({
    width: VTT_WIDTH,
    height: VTT_HEIGHT,
    backgroundColor: 0x111111,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true
});

// Keep the canvas filling the middle column on window resize / layout change.
function fitViewportToContainer() {
    const { w, h } = containerSize();
    if (w === VTT_WIDTH && h === VTT_HEIGHT) return;
    VTT_WIDTH = w;
    VTT_HEIGHT = h;
    app.renderer.resize(w, h);
    updateLighting();
}
window.addEventListener('resize', fitViewportToContainer);

// Layout changes (e.g. a panel undocking from the grid) also resize the
// middle column without a window resize — watch it directly. The resize is
// deferred one frame to avoid a ResizeObserver feedback loop.
if (window.ResizeObserver) {
    const vttEl = document.getElementById('vtt-container');
    let roFrame = null;
    if (vttEl) {
        new ResizeObserver(() => {
            if (roFrame) return;
            roFrame = requestAnimationFrame(() => { roFrame = null; fitViewportToContainer(); });
        }).observe(vttEl);
    }
}

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
    let color = 0xffd700; // ceiling
    if (type === 'emergency' || type === 'emergency_flicker') color = 0xff0000;
    if (type === 'warning') color = 0xff8c00; // amber

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

// NEW: Define 6 distinct colors (Red, Green, Blue, Purple, Orange, Cyan)
export const TOKEN_COLORS = [
    0xe53935, // 1
    0x43a047, // 2
    0x1e88e5, // 3
    0x8e24aa, // 4
    0xfb8c00, // 5
    0x00acc1  // 6
];

// V1.4 Player & Token alignment: Custom hex color support
export function drawTokenIcon(graphics, hasLantern, id, customColorHex = null) {
    console.log(`[V1.4 Debug] drawTokenIcon called for id: ${id}, color: ${customColorHex}`);
    let color = TOKEN_COLORS[id - 1] || 0x2d88ff; 
    if (customColorHex) {
        color = parseInt(customColorHex.replace('#', '0x'), 16);
    }

    graphics.clear();
    graphics.beginFill(color); 
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

// V1.4 Player & Token alignment: Dynamic token labels based on initials
export function createTokenSprite(id) {
    const container = new PIXI.Container();
    container.eventMode = 'static';
    container.cursor = 'pointer';
    container.tokenId = id; // Tag for visual sync loop

    const bg = new PIXI.Graphics();
    container.bgGraphic = bg; // Tag for visual sync loop
    
    const customColor = (state.tokens && state.tokens[id] && state.tokens[id].color) ? state.tokens[id].color : null;
    drawTokenIcon(bg, false, id, customColor);
    container.lastColor = customColor;
    container.lastHasLantern = false;
    
    const customLabel = (state.tokens && state.tokens[id] && state.tokens[id].label) ? state.tokens[id].label : id.toString();
    const text = new PIXI.Text(customLabel, {
        fontFamily: 'system-ui',
        fontSize: 14,
        fill: 0xffffff,
        fontWeight: 'bold'
    });
    text.anchor.set(0.5);
    container.textObj = text; // Tag for visual sync loop
    container.lastLabel = customLabel;

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
    // 1. Remove and destroy the old map to prevent layer stacking
    if (state.currentMapSprite) {
        mapContainer.removeChild(state.currentMapSprite);
        state.currentMapSprite.destroy();
    }

    state.currentMapSprite = new PIXI.Sprite(texture);
    state.currentMapSprite.anchor.set(0.5); 
    
    // 2. Add the new map at the very bottom (index 0)
    mapContainer.addChildAt(state.currentMapSprite, 0);
    
    // 3. Ensure all UI and lighting layers stay on top
    mapContainer.addChild(wallLayer);
    mapContainer.addChild(previewLayer);
    mapContainer.addChild(lightingContainer);
    mapContainer.addChild(fowContainer); 
    mapContainer.addChild(lightMarkerLayer); 
    mapContainer.addChild(tokenLayer); 
    mapContainer.addChild(haloLayer);
    
    mapContainer.angle = 0; 
    fitMapToScreen();
    
    // Safely check modeSelect in case the DOM isn't fully loaded
    const modeSelect = document.getElementById('modeSelect');
    const isPrepMode = modeSelect ? modeSelect.value === 'prep' : false;
    
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
    
    updateScaleBar();
}

export function redrawWalls() {
    wallLayer.clear();
    const isPrepMode = document.getElementById('modeSelect').value === 'prep';
    wallLayer.visible = isPrepMode;
    if (!isPrepMode) return;

    state.walls.forEach((w, index) => {
        const isSelected = index === state.activeSelectWallIndex;
        
        // Define line styles based on wall type and open/closed state
        if (w.type === 'door') {
            if (w.isOpen) {
                // Open Door: Faint Yellow line (using return instead of continue if we wanted to skip)
                wallLayer.lineStyle(isSelected ? 6 : 2, isSelected ? 0xffffff : 0xffff00, 0.4);
            } else {
                // Closed Door: Solid Cyan line
                wallLayer.lineStyle(isSelected ? 6 : 4, isSelected ? 0xffffff : 0x00ffff, 1);
            }
        } else {
            // Standard Wall: Solid Red line
            wallLayer.lineStyle(isSelected ? 6 : 4, isSelected ? 0xffffff : 0xff0000, 1);
        }

        wallLayer.moveTo(w.p1.x, w.p1.y);
        wallLayer.lineTo(w.p2.x, w.p2.y);
        
        // Draw the grab-nodes for the currently selected wall/door
        if (isSelected) {
            wallLayer.lineStyle(2, 0xffffff, 1);
            wallLayer.beginFill(0x00ff00, 0.8);
            wallLayer.drawCircle(w.p1.x, w.p1.y, 8);
            wallLayer.drawCircle(w.p2.x, w.p2.y, 8);
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

    // CRITICAL FIX: Strip out open doors *before* passing geometry to the raycaster
    const activeBlockers = state.walls.filter(w => !(w.type === 'door' && w.isOpen)).concat(bounds);
    const uniquePoints = [];
    
    activeBlockers.forEach(wall => {
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
        if (light.type === 'emergency' || light.type === 'emergency_flicker') { tintColor = 0xff3300; tintAlpha = 0.5; } 
        else if (light.type === 'warning') { tintColor = 0xffa500; tintAlpha = 0.6; } // Amber/Orange
        else if (light.type === 'tokenLantern') { tintColor = 0xffe699; tintAlpha = 0.35; }

        const originPt = { x: light.x, y: light.y };
        
        // FIX: Replaced allWalls with activeBlockers
        const maskGraphics = generateRaycastPolygon(originPt, radius, uniquePoints, activeBlockers);
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
        
        // Tag for the animation loop
        eraseGroup.lightType = light.type;
        colorGroup.lightType = light.type;
        eraseGroup.baseAlpha = 1.0;
        colorGroup.baseAlpha = tintAlpha;
        
        lanternLayer.addChild(colorGroup);
    });

    // RENDER TIER 2 (FOG OF WAR MASK)
    lightingContainer.mask = null; 

    if (!isPrepMode) {
        for (let i = 1; i <= state.tokenSettings.count; i++) {
            if (state.tokens[i]) {
                const tokenOrigin = { x: state.tokens[i].x, y: state.tokens[i].y };
                
                // FIX: Replaced allWalls with activeBlockers
                const fowMask = generateRaycastPolygon(tokenOrigin, 4000, uniquePoints, activeBlockers);
                
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

    if (state.tokens && state.tokenSettings) {
        for (let i = 1; i <= state.tokenSettings.count; i++) {
            const t = state.tokens[i];
            if (t) {
                const ox = t.originX !== undefined ? t.originX : t.x;
                const oy = t.originY !== undefined ? t.originY : t.y;
                let color = TOKEN_COLORS[i - 1] || 0x00ffcc;
                if (t.color) color = parseInt(t.color.replace('#', '0x'), 16);
                
                // Set the specific color for this token's ring
                haloLayer.lineStyle(3, color, 0.4); 
                haloLayer.drawCircle(ox, oy, state.haloRadius || 200);
            }
        }
    }
}
// --- ANIMATED LIGHTING ENGINE ---
app.ticker.add(() => {
    const time = Date.now();
    
    // V1.6 Player & Token alignment: Real-time visual sync. 
    // This runs at 60 FPS but only performs local memory string comparisons, putting absolutely zero load on the network or CPU.
    // It completely defeats Firebase state/caching race conditions.
    const tokensLen = tokenLayer.children.length;
    for (let i = 0; i < tokensLen; i++) {
        const container = tokenLayer.children[i];
        if (container.tokenId && state.tokens && state.tokens[container.tokenId]) {
            const tData = state.tokens[container.tokenId];
            
            if (container.lastColor !== tData.color || container.lastHasLantern !== tData.hasLantern) {
                drawTokenIcon(container.bgGraphic, tData.hasLantern, container.tokenId, tData.color);
                container.lastColor = tData.color;
                container.lastHasLantern = tData.hasLantern;
            }
            if (container.lastLabel !== tData.label) {
                container.textObj.text = tData.label || container.tokenId.toString();
                container.lastLabel = tData.label;
            }
        }
    }
    
    // Calculate the warning pulse (a smooth sine wave between 0.2 and 1.0)
    // Speed: 800ms per full cycle
    const pulseFactor = 0.6 + (Math.sin(time / 200) * 0.4); 
    
    // Calculate erratic flicker (95% chance of 1.0, 5% chance of dropping low)
    const flickerFactor = Math.random() > 0.95 ? (Math.random() * 0.4 + 0.1) : 1.0;

    // Apply to erase layer (the hole cut in the darkness)
    for (let i = 0; i < eraseLayer.children.length; i++) {
        const group = eraseLayer.children[i];
        if (group.lightType === 'warning') {
            group.alpha = pulseFactor;
        } else if (group.lightType === 'emergency_flicker' || group.lightType === 'ceiling_flicker') {
            group.alpha = flickerFactor;
        }
    }
    
    // Apply to color layer (the tinted overlay)
    for (let i = 0; i < lanternLayer.children.length; i++) {
        const group = lanternLayer.children[i];
        if (group.lightType === 'warning') {
            group.alpha = group.baseAlpha * pulseFactor;
        } else if (group.lightType === 'emergency_flicker' || group.lightType === 'ceiling_flicker') {
            group.alpha = group.baseAlpha * flickerFactor;
        }
    }
});


export const rulerLayer = new PIXI.Graphics();
export const rulerText = new PIXI.Text('', { fontFamily: 'system-ui', fontSize: 16, fill: 0xffffff, fontWeight: 'bold', dropShadow: true, dropShadowDistance: 2 });
rulerText.anchor.set(0.5, 1);

const rulerContainer = new PIXI.Container();
rulerContainer.addChild(rulerLayer);
rulerContainer.addChild(rulerText);
app.stage.addChild(rulerContainer); 

let isRuling = false;
let ruleStartGlobal = null;

app.stage.eventMode = 'static';
app.stage.hitArea = new PIXI.Rectangle(0, 0, 10000, 10000); 

app.stage.on('pointerdown', (e) => {
    if (e.shiftKey || state.isCalibrating) {
        isRuling = true;
        ruleStartGlobal = { x: e.global.x, y: e.global.y };
        rulerLayer.clear();
        rulerText.text = '';
    }
});

app.stage.on('pointermove', (e) => {
    if (isRuling && ruleStartGlobal) {
        const currentGlobal = e.global;
        rulerLayer.clear();
        rulerLayer.lineStyle(3, state.isCalibrating ? 0xff5900 : 0x00ffcc, 0.8);
        rulerLayer.moveTo(ruleStartGlobal.x, ruleStartGlobal.y);
        rulerLayer.lineTo(currentGlobal.x, currentGlobal.y);

        const localStart = mapContainer.toLocal(ruleStartGlobal);
        const localEnd = mapContainer.toLocal(currentGlobal);
        const pxDistance = Math.hypot(localEnd.x - localStart.x, localEnd.y - localStart.y);

        const scale = state.mapScale || { pixels: 70, distance: 5, unit: 'ft' };
        let realDist = (pxDistance / scale.pixels) * scale.distance;

        rulerText.text = `${realDist.toFixed(1)} ${scale.unit}`;
        rulerText.x = currentGlobal.x;
        rulerText.y = currentGlobal.y - 15;
        
        if (state.isCalibrating) {
            rulerText.text = `${Math.round(pxDistance)} px`;
        }
    }
});

app.stage.on('pointerup', (e) => {
    if (state.isCalibrating && isRuling && ruleStartGlobal) {
        const localStart = mapContainer.toLocal(ruleStartGlobal);
        const localEnd = mapContainer.toLocal(e.global);
        const pxDistance = Math.hypot(localEnd.x - localStart.x, localEnd.y - localStart.y);
        
        if (pxDistance > 10) {
            const distStr = prompt(`You dragged ${Math.round(pxDistance)} pixels.\nHow much real distance does this represent?`, "5");
            if (distStr && !isNaN(parseFloat(distStr))) {
                const unit = document.getElementById('scaleUnit').value || 'ft';
                set(dbRef(db, 'mapScale'), { pixels: pxDistance, distance: parseFloat(distStr), unit: unit });
            }
        }
        state.isCalibrating = false;
        const btn = document.getElementById('btnCalibrate');
        if (btn) {
            btn.innerText = "📏 Calibrate by Dragging";
            btn.style.background = "#1e88e5";
        }
        app.view.style.cursor = state.isDrawMode ? 'crosshair' : 'default';
    }
    
    isRuling = false;
    ruleStartGlobal = null;
    rulerLayer.clear();
    rulerText.text = '';
});

export function updateScaleBar() {
    const scaleText = document.getElementById('scaleText');
    if (!scaleText) return;

    const localPx = 50 / mapContainer.scale.x; 
    const scale = state.mapScale || { pixels: 70, distance: 5, unit: 'ft' };
    
    let realDist = (localPx / scale.pixels) * scale.distance;
    
    if (realDist < 10) realDist = realDist.toFixed(1);
    else realDist = Math.round(realDist);
    
    scaleText.innerText = `${realDist} ${scale.unit}`;
}

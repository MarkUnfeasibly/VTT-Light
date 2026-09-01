import * as PIXI from 'pixi.js';
import { state } from './state.js';
import { app, mapContainer, previewLayer, redrawWalls, updateLighting, drawMarkerIcon } from './renderer.js';
import { db, set, dbRef, dbRefs } from './firebase.js';
import { getSnappedPoint, dist2, distToSegmentSquared, doSegmentsIntersect } from './math.js';

export function setupInputs() {
    app.stage.eventMode = 'static';
    app.stage.hitArea = new PIXI.Rectangle(0, 0, app.view.width, app.view.height);

    app.stage.on('pointerdown', (e) => {
        if (!state.currentMapSprite) return;

        if (state.isSpacePressed || e.button === 1 || e.button === 2) {
            state.isPanning = true;
            state.panStart = { x: e.global.x - mapContainer.x, y: e.global.y - mapContainer.y };
            app.view.style.cursor = 'grabbing';
            return;
        }

        const pt = mapContainer.toLocal(e.global);

        if (state.isLightAddMode) {
            const newId = 'light_' + Date.now();
            const radius = parseInt(document.getElementById('lightRadiusInput').value, 10);
            set(dbRef(db, `lights/${newId}`), {
                x: pt.x, y: pt.y,
                type: document.getElementById('lightTypeSelect').value,
                radius: radius
            });
            state.activeSelectLightId = newId; 
            return; 
        }

        if (document.getElementById('modeSelect').value === 'prep') {
            if (state.activeSelectWallIndex !== null && state.walls[state.activeSelectWallIndex]) {
                const w = state.walls[state.activeSelectWallIndex];
                if (dist2(pt, w.p1) < 100) { state.activeDragWallNode = 'p1'; return; }
                if (dist2(pt, w.p2) < 100) { state.activeDragWallNode = 'p2'; return; }
            }

            let clickedWallIdx = null;
            for (let i = 0; i < state.walls.length; i++) {
                if (distToSegmentSquared(pt, state.walls[i].p1, state.walls[i].p2) < 64) {
                    clickedWallIdx = i;
                    break;
                }
            }

            if (clickedWallIdx !== null) {
                if (e.shiftKey) {
                    state.walls.splice(clickedWallIdx, 1);
                    set(dbRefs.walls, state.walls);
                    state.activeSelectWallIndex = null;
                } else {
                    state.activeSelectWallIndex = clickedWallIdx;
                    redrawWalls();
                }
                return; 
            }

            if (state.isDrawMode) {
                state.isDrawing = true;
                state.activeSelectWallIndex = null;
                redrawWalls();
                const snap = getSnappedPoint(pt);
                state.startPoint = snap.point;
                return;
            }
            
            state.activeSelectWallIndex = null;
            redrawWalls();
        }

        if (!state.isDrawMode) {
            if (state.activeSelectLightId) {
                state.activeSelectLightId = null;
                Object.keys(state.lightMarkers).forEach(id => {
                    drawMarkerIcon(state.lightMarkers[id], state.lights[id].type, false);
                });
            }
        }
    });

    app.stage.on('pointermove', (e) => {
        if (state.isPanning) {
            mapContainer.x = e.global.x - state.panStart.x;
            mapContainer.y = e.global.y - state.panStart.y;
            return;
        }

        if (state.activeDragLightId && state.lights[state.activeDragLightId]) {
            const newPos = mapContainer.toLocal(e.global);
            state.lights[state.activeDragLightId].x = newPos.x;
            state.lights[state.activeDragLightId].y = newPos.y;
            
            if (state.lightMarkers[state.activeDragLightId]) {
                state.lightMarkers[state.activeDragLightId].x = newPos.x;
                state.lightMarkers[state.activeDragLightId].y = newPos.y;
            }
            updateLighting();
            return;
        }
        
        if (state.activeDragTokenId && state.tokens[state.activeDragTokenId]) {
            const newPos = mapContainer.toLocal(e.global);
            const oldPos = { 
                x: state.tokens[state.activeDragTokenId].x, 
                y: state.tokens[state.activeDragTokenId].y 
            };
            
            let hasCollision = false;
            const TOKEN_RADIUS_SQ = 24 * 24; // Physical radius of the token icon
            
            // Check if the intended move hits any walls
            for (const wall of state.walls) {
                // 1. Did the token move too fast and jump through a wall?
                if (doSegmentsIntersect(oldPos, newPos, wall.p1, wall.p2)) {
                    hasCollision = true;
                    break;
                }
                // 2. Is the token sliding too close to the wall?
                if (distToSegmentSquared(newPos, wall.p1, wall.p2) < TOKEN_RADIUS_SQ) {
                    hasCollision = true;
                    break;
                }
            }

            // Only move the token if the path is clear
            if (!hasCollision) {
                state.tokens[state.activeDragTokenId].x = newPos.x;
                state.tokens[state.activeDragTokenId].y = newPos.y;
                
                if (state.tokenSprites[state.activeDragTokenId]) {
                    state.tokenSprites[state.activeDragTokenId].x = newPos.x;
                    state.tokenSprites[state.activeDragTokenId].y = newPos.y;
                }
                
                set(dbRef(db, `tokens/${state.activeDragTokenId}/x`), newPos.x);
                set(dbRef(db, `tokens/${state.activeDragTokenId}/y`), newPos.y);

                updateLighting(); 
            }
            return;
        }

        if (state.activeDragWallNode !== null && state.activeSelectWallIndex !== null) {
            const pt = mapContainer.toLocal(e.global);
            const snap = getSnappedPoint(pt, state.activeSelectWallIndex);
            state.walls[state.activeSelectWallIndex][state.activeDragWallNode] = snap.point;
            redrawWalls();
            updateLighting(); 
            return;
        }

        if (!state.isDrawing) return;
        const pt = mapContainer.toLocal(e.global);
        const snap = getSnappedPoint(pt);
        
        previewLayer.clear();
        previewLayer.lineStyle(4, snap.isSnapped ? 0x00ff00 : 0xff0000, 0.8);
        previewLayer.moveTo(state.startPoint.x, state.startPoint.y);
        previewLayer.lineTo(snap.point.x, snap.point.y);
        
        if (snap.isSnapped) {
            previewLayer.beginFill(0x00ff00, 0.5);
            previewLayer.drawCircle(snap.point.x, snap.point.y, 8);
            previewLayer.endFill();
        }
    });

    const stopInteraction = (e) => {
        if (state.isPanning) {
            state.isPanning = false;
            app.view.style.cursor = state.isSpacePressed ? 'grab' : (state.isDrawMode || state.isLightAddMode ? 'crosshair' : 'default');
            return;
        }

        if (state.activeDragLightId) {
            set(dbRef(db, `lights/${state.activeDragLightId}/x`), state.lights[state.activeDragLightId].x);
            set(dbRef(db, `lights/${state.activeDragLightId}/y`), state.lights[state.activeDragLightId].y);
            state.activeDragLightId = null;
            app.view.style.cursor = state.isSpacePressed ? 'grab' : (state.isDrawMode || state.isLightAddMode ? 'crosshair' : 'default');
            return;
        }
        
        if (state.activeDragTokenId) {
            set(dbRef(db, `tokens/${state.activeDragTokenId}/x`), state.tokens[state.activeDragTokenId].x);
            set(dbRef(db, `tokens/${state.activeDragTokenId}/y`), state.tokens[state.activeDragTokenId].y);
            state.activeDragTokenId = null;
            app.view.style.cursor = state.isSpacePressed ? 'grab' : (state.isDrawMode || state.isLightAddMode ? 'crosshair' : 'default');
            return;
        }

        if (state.activeDragWallNode !== null) {
            state.activeDragWallNode = null;
            set(dbRefs.walls, state.walls); 
            return;
        }

        if (!state.isDrawing) return;
        state.isDrawing = false;
        previewLayer.clear();
        const pt = mapContainer.toLocal(e.global);
        const snap = getSnappedPoint(pt);
        
        if (dist2(state.startPoint, snap.point) > 1) {
            const newWalls = [...state.walls, { p1: state.startPoint, p2: snap.point }];
            set(dbRefs.walls, newWalls);
            state.activeSelectWallIndex = newWalls.length - 1; 
            redrawWalls();
        }
    };

    app.stage.on('pointerup', stopInteraction);
    app.stage.on('pointerupoutside', stopInteraction);

    app.view.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            const tag = document.activeElement ? document.activeElement.tagName : '';
            if (tag === 'SELECT' || tag === 'INPUT') return; 
            
            e.preventDefault(); 
            state.isSpacePressed = true;
            if (!state.isPanning && state.currentMapSprite) app.view.style.cursor = 'grab';
        }

        if ((e.code === 'Backspace' || e.code === 'Delete') && state.activeSelectWallIndex !== null) {
            state.walls.splice(state.activeSelectWallIndex, 1);
            set(dbRefs.walls, state.walls);
            state.activeSelectWallIndex = null;
            redrawWalls();
            updateLighting();
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            state.isSpacePressed = false;
            if (!state.isPanning && state.currentMapSprite) app.view.style.cursor = (state.isDrawMode || state.isLightAddMode) ? 'crosshair' : 'default';
        }
    });

    app.view.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (!state.currentMapSprite) return;

        if (e.ctrlKey || e.metaKey) {
            const pointer = mapContainer.toLocal(new PIXI.Point(e.offsetX, e.offsetY));
            const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95; 
            let newScale = mapContainer.scale.x * zoomFactor;
            
            newScale = Math.max(0.1, Math.min(newScale, 5.0));
            mapContainer.scale.set(newScale);

            mapContainer.x = e.offsetX - pointer.x * mapContainer.scale.x;
            mapContainer.y = e.offsetY - pointer.y * mapContainer.scale.y;
        } else {
            mapContainer.x -= e.deltaX;
            mapContainer.y -= e.deltaY;
        }
    }, { passive: false });
}
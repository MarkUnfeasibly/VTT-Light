import * as PIXI from 'pixi.js';
import { state } from './state.js';

export function dist2(v, w) { 
    return Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2); 
}

export function distToSegmentSquared(p, v, w) {
    let l2 = dist2(v, w);
    if (l2 === 0) return dist2(p, v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

export const SNAP_RADIUS_SQ = 15 * 15;

export function getSnappedPoint(pt, ignoreWallIndex = -1) {
    let snappedPt = { x: pt.x, y: pt.y };
    let closestDist = SNAP_RADIUS_SQ;
    let isSnapped = false;
    state.walls.forEach((wall, idx) => {
        if (idx === ignoreWallIndex) return;
        [wall.p1, wall.p2].forEach(wp => {
            const d2 = dist2(pt, wp);
            if (d2 < closestDist) {
                closestDist = d2;
                snappedPt = { x: wp.x, y: wp.y };
                isSnapped = true;
            }
        });
    });
    return { point: snappedPt, isSnapped };
}

export function getIntersection(rayOrigin, dx, dy, wall) {
    const r_px = rayOrigin.x, r_py = rayOrigin.y;
    const s_px = wall.p1.x, s_py = wall.p1.y;
    const s_dx = wall.p2.x - wall.p1.x, s_dy = wall.p2.y - wall.p1.y;

    const magnitude = dx * s_dy - dy * s_dx;
    if (Math.abs(magnitude) < 0.000001) return null; 

    const t2 = (dx * (r_py - s_py) - dy * (r_px - s_px)) / magnitude;
    const ix = s_px + s_dx * t2;
    const iy = s_py + s_dy * t2;
    const t1 = (ix - r_px) * dx + (iy - r_py) * dy;

    if (t1 > 0.001 && t2 >= -0.0001 && t2 <= 1.0001) {
        return { x: ix, y: iy, param: t1 };
    }
    return null;
}

export function normalizeAngle(angle) {
    let mod = angle % (Math.PI * 2);
    if (mod < 0) mod += Math.PI * 2;
    return mod;
}

export function generateRaycastPolygon(origin, radius, uniquePoints, allWalls) {
    const baseRays = [];
    uniquePoints.forEach(p => {
        const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
        baseRays.push(angle - 0.001, angle, angle + 0.001);
    });
    for(let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
        baseRays.push(a);
    }

    const intersects = [];
    baseRays.forEach(rayAngle => {
        const dx = Math.cos(rayAngle);
        const dy = Math.sin(rayAngle);
        let closestIntersect = null;

        allWalls.forEach(wall => {
            const intersect = getIntersection(origin, dx, dy, wall);
            if (intersect && (!closestIntersect || intersect.param < closestIntersect.param)) {
                closestIntersect = intersect;
            }
        });

        if (closestIntersect && closestIntersect.param <= radius) {
            intersects.push({ x: closestIntersect.x, y: closestIntersect.y, angle: normalizeAngle(rayAngle) });
        } else {
            intersects.push({
                x: origin.x + dx * radius,
                y: origin.y + dy * radius,
                angle: normalizeAngle(rayAngle)
            });
        }
    });

    intersects.sort((a, b) => a.angle - b.angle);

    const maskGraphics = new PIXI.Graphics();
    maskGraphics.beginFill(0xffffff, 1.0);
    for (let i = 0; i < intersects.length; i++) {
        if (i === 0) maskGraphics.moveTo(intersects[i].x, intersects[i].y);
        else maskGraphics.lineTo(intersects[i].x, intersects[i].y);
    }
    maskGraphics.endFill();
    return maskGraphics;
}
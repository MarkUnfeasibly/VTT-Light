// src/panels.js
// Makes the MAP VIEWPORT, GM_SYS, CREW, POPS, DICE BAY and GM_SYS section
// panels draggable by their headers, and those panels minimisable
// (collapse to header). POPS can also be resized vertically (never wider).
// - Drag a header to float the panel anywhere on screen
// - No panel may be dragged ABOVE the MAP VIEWPORT panel (clamped to its
//   top edge, wherever the viewport currently is)
// - Double-click a header to redock it to its default position
//   (the viewport docks pinned to the top of the page)
// - Positions, heights and minimised state are remembered in the lite database

import { playerDB } from './playerdb.js';

const SETTING_KEY = 'panel_positions';
const DRAGGABLE = ['viewport-widget', 'gm-widget', 'pops-widget', 'dice-widget', 'crew-widget'];
const MINIMIZABLE = ['gm-widget', 'pops-widget', 'dice-widget', 'crew-widget'];
let positions = {};
let zCounter = 10001;

function savePositions() {
    playerDB.setSetting(SETTING_KEY, positions).catch((e) => console.error('Could not save panel layout:', e));
}

function setEntry(id, patch) {
    positions[id] = { ...(positions[id] || {}), ...patch };
    // Drop empty entries so docked-default panels aren't stored at all.
    const e = positions[id];
    if (!e.min && typeof e.x !== 'number' && typeof e.y !== 'number') delete positions[id];
    savePositions();
}

// Panels may move ON TOP of the viewport, but never ABOVE its top edge
// (dragging a panel past the page top would trigger scrolling).
function minTopFor(el) {
    if (el.id === 'viewport-widget') return 0;
    const vp = document.getElementById('viewport-widget');
    if (!vp) return 0;
    return Math.max(0, vp.getBoundingClientRect().top);
}

// Bring a panel to the front (used when a section panel opens).
export function bringToFront(el) {
    el.style.zIndex = String(zCounter++);
}

// Wire up drag / minimise / redock for a single panel element.
// Exported so dynamically-created section panels can join the same system.
export function initPanelDrag(el) {
    if (!el || el.__vttDragInit) return;
    const header = el.querySelector('.pops-header');
    if (!header) return;
    el.__vttDragInit = true;

    const id = el.id;

    // Remember the docked (default) inline style so we can always return to it.
    const originalStyle = el.getAttribute('style') || '';

    // Restore remembered minimised state (collapsed to the panel's bottom edge).
    const remembered = positions[id];
    if (remembered && remembered.min) {
        el.classList.add('minimized');
        const dockedTop = el.style.top;
        const dockedBottom = el.style.bottom;
        const headerH = el.getBoundingClientRect().height || 61;
        const hasSavedY = typeof remembered.y === 'number';
        // Chip position: explicit last chip top, else the remembered bottom edge.
        const chipTop = typeof remembered.my === 'number'
            ? remembered.my
            : (typeof remembered.mb === 'number' ? remembered.mb - headerH : null);
        if (chipTop !== null) {
            el.style.top = Math.max(minTopFor(el), chipTop) + 'px';
            el.style.bottom = 'auto';
        }
        // Where the panel expands back to when restored.
        el.__restoreTop = hasSavedY ? Math.max(minTopFor(el), remembered.y) + 'px' : dockedTop;
        el.__restoreBottom = hasSavedY ? 'auto' : dockedBottom;
    }

    // Restore a remembered panel height (vertical-only resize).
    if (remembered && typeof remembered.h === 'number') {
        el.style.height = Math.max(140, remembered.h) + 'px';
        el.style.bottom = 'auto';
        el.dataset.resized = '1';
    }

    // Restore remembered horizontal/floating position.
    const hasX = remembered && typeof remembered.x === 'number';
    const hasY = remembered && typeof remembered.y === 'number';
    const isMin = el.classList.contains('minimized');
    if (hasX && (hasY || isMin)) {
        const w = el.getBoundingClientRect().width || parseFloat(el.style.width) || 280;
        el.style.position = 'fixed';
        el.style.boxSizing = 'border-box';
        if (!isMin) el.style.width = w + 'px';
        el.style.left = Math.max(0, Math.min(remembered.x, window.innerWidth - 120)) + 'px';
        el.style.right = 'auto';
        el.style.margin = '0';
        el.style.zIndex = String(zCounter++);
        if (!isMin && hasY) {
            el.style.top = Math.max(minTopFor(el), Math.min(remembered.y, window.innerHeight - 40)) + 'px';
            el.style.bottom = 'auto';
            el.__restoreTop = el.style.top;
        }
        el.dataset.dragged = '1'; // remembers a user-chosen position
    }

    // --- Minimise button (panels only — the viewport and section panels stay open) ---
    if (MINIMIZABLE.includes(id)) {
        const btn = document.createElement('button');
        btn.textContent = '–';
        btn.title = 'Minimise panel';
        btn.style.cssText = 'width:auto; padding:1px 9px; margin-left:8px; font-size:13px; line-height:1.4; background:#27272a;';
        const syncBtn = () => {
            const min = el.classList.contains('minimized');
            btn.textContent = min ? '▢' : '–';
            btn.title = min ? 'Restore panel' : 'Minimise panel';
        };
        syncBtn();
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = el.getBoundingClientRect();

            if (!el.classList.contains('minimized')) {
                // Collapse to the panel's BOTTOM edge: remember the current top,
                // then re-anchor the header where the bottom edge was.
                el.__restoreTop = el.style.top;
                el.__restoreBottom = el.style.bottom;
                el.classList.add('minimized');
                const headerH = el.getBoundingClientRect().height || rect.height;
                const chipTop = Math.max(0, rect.bottom - headerH);
                el.style.top = chipTop + 'px';
                el.style.bottom = 'auto';
                setEntry(id, { min: true, mb: Math.round(rect.bottom), my: Math.round(chipTop) });
            } else {
                el.classList.remove('minimized');
                if (el.__restoreTop) el.style.top = el.__restoreTop;
                else el.style.removeProperty('top');
                if (el.__restoreBottom) el.style.bottom = el.__restoreBottom;
                else el.style.removeProperty('bottom');
                setEntry(id, { min: undefined, mb: undefined, my: undefined });
            }
            syncBtn();
        });
        header.appendChild(btn);
    }

    // --- Vertical resize (panels marked data-resize="height", e.g. POPS) ---
    // Height only — the width never changes. The panel floats so its height is
    // independent of any bottom anchor, and the height is remembered.
    if (el.dataset.resize === 'height') {
        const handle = document.createElement('div');
        handle.className = 'panel-resize-handle';
        handle.title = 'Drag to resize height';
        el.appendChild(handle);

        let resizing = false, startY = 0, startH = 0, origTop = 0, origBottom = 0, anchorBottom = false;

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = el.getBoundingClientRect();
            resizing = true;
            startY = e.clientY;
            startH = rect.height;
            origTop = rect.top;
            origBottom = rect.bottom;
            // Docked at the page bottom? Keep that bottom edge and grow upward.
            anchorBottom = rect.bottom >= window.innerHeight - 30;
            el.style.position = 'fixed';
            el.style.boxSizing = 'border-box';
            el.style.left = rect.left + 'px';
            el.style.top = rect.top + 'px';
            el.style.width = rect.width + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.margin = '0';
            el.style.height = startH + 'px';
            el.style.zIndex = String(zCounter++);
            try { handle.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
        });

        handle.addEventListener('pointermove', (e) => {
            if (!resizing) return;
            const dy = e.clientY - startY;
            if (anchorBottom) {
                // Bottom edge fixed: taller grows upward, never above the page gutter.
                const h = Math.max(140, Math.min(startH + dy, origBottom - 20));
                el.style.height = h + 'px';
                el.style.top = (origBottom - h) + 'px';
            } else {
                // Top edge fixed: taller grows downward, never past the page bottom.
                const h = Math.max(140, Math.min(startH + dy, window.innerHeight - origTop - 20));
                el.style.height = h + 'px';
            }
        });

        const endResize = () => {
            if (!resizing) return;
            resizing = false;
            el.dataset.resized = '1';
            setEntry(id, {
                x: parseFloat(el.style.left),
                y: parseFloat(el.style.top),
                h: Math.round(el.getBoundingClientRect().height)
            });
        };
        handle.addEventListener('pointerup', endResize);
        handle.addEventListener('pointercancel', endResize);
    }

    // --- Drag behaviour ---
    header.style.cursor = 'grab';
    header.title = 'Drag to move' + (MINIMIZABLE.includes(id) ? ' · – minimises' : '') + ' · double-click to redock';

    let dragging = false, moved = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, input, select, a, label')) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;
        try { header.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
        header.style.cursor = 'grabbing';
    });

    header.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!moved) {
            if (Math.hypot(dx, dy) < 5) return; // drag threshold
            moved = true;
            el.style.position = 'fixed';
            el.style.boxSizing = 'border-box';
            el.style.width = el.getBoundingClientRect().width + 'px';
            el.style.left = origLeft + 'px';
            el.style.top = origTop + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.margin = '0';
            el.style.zIndex = String(zCounter++); // bring to front while handling
        }
        const rect = el.getBoundingClientRect();
        const x = Math.max(-rect.width + 140, Math.min(origLeft + dx, window.innerWidth - 140));
        // Never above the viewport panel.
        const y = Math.max(minTopFor(el), Math.min(origTop + dy, window.innerHeight - 40));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
    });

    function endDrag() {
        if (!dragging) return;
        dragging = false;
        header.style.cursor = 'grab';
        if (moved) {
            el.dataset.dragged = '1'; // remembers a user-chosen position
            if (el.classList.contains('minimized')) {
                // A dragged chip stores its own top; the expanded y (if any) stays.
                el.__restoreTop = el.style.top;
                el.__restoreBottom = 'auto';
                setEntry(id, { x: parseFloat(el.style.left), my: parseFloat(el.style.top) });
            } else {
                setEntry(id, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
            }
        }
    }
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);

    header.addEventListener('dblclick', () => {
        // Redock to the default position and clear the saved entry.
        delete positions[id];
        savePositions();
        el.classList.remove('minimized');
        delete el.dataset.dragged; // redocked — default positioning again
        const display = el.style.display; // keep section panels open when redocking
        el.setAttribute('style', originalStyle);
        if (display) el.style.display = display;
        const minBtn = header.querySelector('button[title="Restore panel"], button[title="Minimise panel"]');
        if (minBtn) minBtn.textContent = '–';
    });
}

export async function setupPanels() {
    positions = (await playerDB.getSetting(SETTING_KEY)) || {};
    DRAGGABLE.forEach((id) => initPanelDrag(document.getElementById(id)));
}

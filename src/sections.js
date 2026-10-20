// src/sections.js
// Each GM_SYS section (Cartography, Architecture, Lighting System, Entities)
// sits behind its own launcher button in the GM rail — same style as the other
// buttons. Pressing a launcher opens the section as a floating panel.
// Rules:
//   - only ONE section panel can be open at a time (opening another closes
//     the current one; clicking the open launcher again closes it)
//   - all section panels auto-close when the mode returns to PLAY
//     (including when prep access is revoked by the admin gate)
//   - panels drag like every other panel and remember their position

import { initPanelDrag, bringToFront } from './panels.js';

let openPanel = null;

function closeSectionPanels() {
    document.querySelectorAll('.section-panel').forEach((p) => { p.style.display = 'none'; });
    document.querySelectorAll('.section-launcher.open').forEach((b) => b.classList.remove('open'));
    openPanel = null;
}

// A section panel must never cover the GM_SYS rail. On open, if the panel's
// remembered/default position would overlap the rail, slide it to the rail's
// right edge; a position the user deliberately placed elsewhere is kept.
function positionBesideGM(panel) {
    const gm = document.getElementById('gm-widget');
    if (!gm) return;
    const gmRect = gm.getBoundingClientRect();
    if (!gmRect.width || !gmRect.height) return;

    const rect = panel.getBoundingClientRect();
    const overlaps = rect.left < gmRect.right && rect.right > gmRect.left
        && rect.top < gmRect.bottom && rect.bottom > gmRect.top;
    if (!overlaps) return;

    const w = rect.width || 340;
    const left = Math.min(gmRect.right + 15, window.innerWidth - w - 10);
    panel.style.left = Math.max(10, left) + 'px';
}

export function setupSections() {
    const launchers = document.querySelectorAll('.section-launcher');
    if (!launchers.length) return;

    launchers.forEach((launcher) => {
        const section = document.getElementById(launcher.dataset.panel);
        if (!section) return;

        // Icon + title come straight from the launcher label ("📐 Cartography").
        const label = launcher.textContent.trim();
        const icon = label.split(' ')[0];
        const title = label.slice(icon.length).trim().toUpperCase();

        // Build the floating panel and move the section's markup into it.
        const panel = document.createElement('div');
        panel.id = 'panel-' + section.id;
        panel.className = 'pops-panel section-panel';
        panel.style.cssText = 'left: 316px; top: calc(58vh + 36px); width: 340px; max-height: calc(42vh - 40px); overflow-y: auto;';

        const header = document.createElement('div');
        header.className = 'pops-header';
        header.innerHTML = `
            <div>
                <div style="font-size: 16px; display: flex; align-items: center; gap: 8px;">
                    <span style="color: #00ffcc; font-size: 14px;">${icon}</span>
                    <span class="pops-brand" style="color: #00ffcc;">${title}</span>
                </div>
            </div>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.title = 'Close panel';
        closeBtn.style.cssText = 'width:auto; padding:2px 8px; background:#27272a;';
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeSectionPanels(); });
        header.appendChild(closeBtn);

        panel.appendChild(header);
        panel.appendChild(section); // element IDs + listeners survive the move
        document.body.appendChild(panel);

        initPanelDrag(panel);

        launcher.addEventListener('click', () => {
            if (openPanel === panel) { closeSectionPanels(); return; }
            closeSectionPanels();
            panel.style.display = 'flex';
            positionBesideGM(panel);
            bringToFront(panel);
            launcher.classList.add('open');
            openPanel = panel;
        });
    });

    // Auto-close whenever the mode returns to PLAY (or prep is revoked).
    const modeSelect = document.getElementById('modeSelect');
    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            if (e.target.value !== 'prep') closeSectionPanels();
        });
    }
}

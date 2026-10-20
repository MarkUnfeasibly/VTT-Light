// src/dice.js
// DICE BAY panel: two 3D d6 dice — click (or Enter/Space on) EITHER die to
// roll BOTH. A completed roll is:
//   - broadcast to all clients via the 'rolls' node in Firebase
//   - posted into the POPS chat log (pops_log) so it lands in the POPS panel

import { db, set, dbRef } from './firebase.js';
import { postRollToPops } from './pops.js';
import { getCurrentPlayerName } from './players.js';
import './poly-die.js';

// Unique per page load — identifies this client's broadcasts.
const SESSION_ID = Math.random().toString(36).slice(2, 10);

export function setupDice() {
    const die1 = document.getElementById('die1');
    const die2 = document.getElementById('die2');
    if (!die1 || !die2) return;

    let rolling = false;

    async function rollBoth() {
        if (rolling || die1.rolling || die2.rolling) return;
        rolling = true;

        const [r1, r2] = await Promise.all([die1.roll(), die2.roll()]);
        const total = r1.value + r2.value;
        const sender = getCurrentPlayerName();

        // Broadcast to other clients
        set(dbRef(db, 'rolls'), null); // trim history — only latest roll matters
        set(dbRef(db, 'rolls/last'), {
            d1: r1.value, d2: r2.value, total,
            sender, session: SESSION_ID, ts: Date.now()
        }).catch((e) => console.error('Roll broadcast failed:', e));

        // Post into the POPS panel for everyone
        postRollToPops(sender, `🎲 ${r1.value} + ${r2.value} = ${total}`, {
            d1: r1.value, d2: r2.value, total
        }).catch((e) => console.error('POPS roll post failed:', e));

        rolling = false;
    }

    // Take over from the die's own single-die click/keydown handlers:
    // clicking either die rolls BOTH dice.
    [die1, die2].forEach((d) => {
        if (d._onClick) d.removeEventListener('click', d._onClick);
        if (d._onKey) d.removeEventListener('keydown', d._onKey);
        d.addEventListener('click', rollBoth);
        d.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rollBoth(); }
        });
    });
}

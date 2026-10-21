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
    const container = document.getElementById('dice-container');
    const btnRoll = document.getElementById('btnRollDice');
    const inputCount = document.getElementById('diceCount');
    const selectSides = document.getElementById('diceSides');
    
    if (!container || !btnRoll || !inputCount || !selectSides) return;

    let rolling = false;
    let currentDice = [];

    // Spawns the correct number and type of 3D dice into the container
    function renderDice() {
        container.innerHTML = '';
        currentDice = [];
        
        const count = Math.min(20, Math.max(1, parseInt(inputCount.value, 10) || 1));
        const sides = selectSides.value;

        for (let i = 0; i < count; i++) {
            const die = document.createElement('poly-die');
            die.setAttribute('sides', sides);
            die.setAttribute('size', '80'); // Adjusted size so multiple fit easily
            
            // Clicking ANY die triggers a roll of ALL dice
            die.addEventListener('click', rollAll);
            die.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); rollAll(); }
            });
            
            currentDice.push(die);
            container.appendChild(die);
        }
    }

    // Rolls all active dice and broadcasts the total
    async function rollAll() {
        if (rolling || currentDice.some(d => d.rolling)) return;
        rolling = true;

        // Fire off all roll animations concurrently
        const results = await Promise.all(currentDice.map(die => die.roll()));
        
        const values = results.map(r => r.value);
        const total = values.reduce((sum, val) => sum + val, 0);
        const sender = getCurrentPlayerName();
        const sides = selectSides.value;
        const count = values.length;

        // Broadcast to other clients
        set(dbRef(db, 'rolls'), null); // trim history
        set(dbRef(db, 'rolls/last'), {
            values, total, sides, count,
            sender, session: SESSION_ID, ts: Date.now()
        }).catch((e) => console.error('Roll broadcast failed:', e));

        // Post into the POPS panel (e.g. "🎲 3d6: 4 + 2 + 6 = 12")
        const formula = `${count}d${sides}`;
        const equation = values.join(' + ');
        postRollToPops(sender, `🎲 ${formula}: ${equation} = ${total}`, {
            values, total, formula
        }).catch((e) => console.error('POPS roll post failed:', e));

        rolling = false;
    }

    // Re-render the 3D objects instantly whenever the user changes the count or type
    inputCount.addEventListener('input', renderDice);
    selectSides.addEventListener('change', renderDice);
    
    // Wire up the Roll button
    btnRoll.addEventListener('click', rollAll);

    // Initial load
    renderDice();
}
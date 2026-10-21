// /src/pops.js
import { db } from "./firebase.js"; // Corrected export name from firebase.js
import { ref, push, onValue } from "firebase/database";
import { playerDB } from "./playerdb.js";
import { onPlayerChange } from "./players.js";

const RAG_API_URL = "https://traveller-rag-api-600932660900.us-central1.run.app/search";
// Update this URL if your SLM service URL differs
const SLM_API_URL = "https://traveller-slm-service-600932660900.us-central1.run.app/api/generate";

const popsDbRef = ref(db, "pops_log");

/** Messages can arrive from Discord, so never trust them as HTML. */
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// --- Discord name -> crew member lookup -------------------------------------
// The bridge stamps each relayed message with the author's Discord ID. If that
// person has a crew record with a linked Discord account (or a manual
// username/ID), POPS shows their crew name instead of the Discord handle.

const DISCORD_EMOJI = "⌁";
let crewByDiscord = new Map();
let crewIndexAt = 0;

async function refreshCrewIndex(force) {
  const now = Date.now();
  if (!force && now - crewIndexAt < 5000) return;
  crewIndexAt = now;
  try {
    const players = await playerDB.getAllPlayers();
    const map = new Map();
    for (const p of players || []) {
      const d = p.discord;
      if (!d) continue;
      if (d.id) map.set(String(d.id), p);
      if (d.handle) map.set(String(d.handle).toLowerCase(), p);
      if (d.username) map.set(String(d.username).toLowerCase(), p);
    }
    crewByDiscord = map;
  } catch (_) {
    /* local DB unavailable — fall back to raw Discord handles */
  }
}

function crewForDiscord(item) {
  const byId = item.discordId ? crewByDiscord.get(String(item.discordId)) : null;
  if (byId) return byId;
  const byName = crewByDiscord.get(String(item.sender || "").toLowerCase());
  return byName || null;
}

// --- Minimised-panel alert ---------------------------------------------------
// When POPS is minimised and a new message arrives, the panel shudders and a
// short "futuristic computer" ping plays (Web Audio — no asset needed).
let audioCtx = null;

function playPopsAlert() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    const t0 = audioCtx.currentTime;
    // Three quick chirps sweeping upward through a band-pass filter.
    [[660, 0], [880, 0.08], [1320, 0.16]].forEach(([f, dt]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const flt = audioCtx.createBiquadFilter();
      flt.type = "bandpass"; flt.frequency.value = f * 2; flt.Q.value = 2;
      osc.type = "square";
      osc.frequency.setValueAtTime(f, t0 + dt);
      osc.frequency.exponentialRampToValueAtTime(f * 1.35, t0 + dt + 0.06);
      gain.gain.setValueAtTime(0.0001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + dt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.10);
      osc.connect(flt).connect(gain).connect(audioCtx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.12);
    });
  } catch (_) { /* audio unavailable */ }
}

function alertMinimisedPops() {
  const panel = document.getElementById("pops-widget");
  if (!panel || !panel.classList.contains("minimized")) return;
  panel.classList.remove("shudder");
  void panel.offsetWidth; // restart the animation
  panel.classList.add("shudder");
  playPopsAlert();
}

/**
 * Queries Cloud Run backend with grounded zero-temperature configuration
 */
async function queryPopsBackend(userQuery) {
  try {
    // 1. Retrieve RAG Context
    const ragRes = await fetch(RAG_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: userQuery })
    });
    const ragData = await ragRes.json();
    const context = ragData.context || "";

    const fullPrompt = context ? `${context}\n\nUser Question: ${userQuery}` : userQuery;

    // 2. Query SLM with temperature 0.0
    const slmRes = await fetch(SLM_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "traveller-slm",
        prompt: fullPrompt,
        options: { temperature: 0.0, top_p: 0.8 },
        stream: false
      })
    });
    const slmData = await slmRes.json();
    return slmData.response || "POPS processing error: Null response.";
  } catch (err) {
    console.error("POPS API Error:", err);
    return "POPS status: Peripheral offline or unresponsive.";
  }
}

/**
 * Posts a dice roll result to the shared POPS log so every connected
 * client sees it in the POPS panel.
 */
export async function postRollToPops(playerName, rollText, detail) {
  await push(popsDbRef, {
    sender: playerName || "Crew",
    text: rollText,
    type: "roll",
    detail: detail || null,
    timestamp: Date.now()
  });
}

/**
 * Submits query and posts AI response to Realtime Database
 */
export async function askPops(playerName, question) {
  if (!question.trim()) return;

  const timestamp = Date.now();

  // 1. Sync User Question to Realtime DB
  await push(popsDbRef, {
    sender: playerName,
    text: question,
    type: "question",
    timestamp: timestamp
  });

  // 2. Fetch answer from backend
  const answer = await queryPopsBackend(question);

  // 3. Sync POPS Answer to Realtime DB
  await push(popsDbRef, {
    sender: "POPS",
    text: answer,
    type: "answer",
    timestamp: Date.now()
  });
}

/**
 * Real-time listener for all connected clients
 */
export function initPopsListener() {
  const entriesEl = document.getElementById("pops-log-entries");
  const inputEl = document.getElementById("pops-input");
  const sendBtn = document.getElementById("pops-send-btn");

  if (!entriesEl || !inputEl || !sendBtn) return;

  const playerName = localStorage.getItem("vtt_player_name") || "Crew";

  // Resolve Discord authors to crew members (throttled inside).
  refreshCrewIndex(true);
  // Keep the index fresh when an admin edits the crew manifest.
  onPlayerChange(() => refreshCrewIndex(true));

  // Event handlers
  const handleSend = async () => {
    const q = inputEl.value.trim();
    if (!q) return;
    inputEl.value = "";
    await askPops(playerName, q);
  };

  sendBtn.onclick = handleSend;
  inputEl.onkeypress = (e) => {
    if (e.key === "Enter") handleSend();
  };

  // Realtime Database listener
  let lastTopKey = null;   // Firebase key of the newest entry seen
  let firstSnapshot = true;

  const scrollToBottom = () => {
    const apply = () => { entriesEl.scrollTop = entriesEl.scrollHeight; };
    // Double rAF: let the new entries lay out before scrolling.
    requestAnimationFrame(() => requestAnimationFrame(apply));
    // Fallbacks for throttled/background tabs (where rAF is paused) and
    // late font/layout shifts.
    setTimeout(apply, 60);
    setTimeout(apply, 400);
  };

  onValue(popsDbRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const keys = Object.keys(data).sort(); // push keys sort chronologically
    const entries = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
    if (entries.some((e) => e.type === "discord")) refreshCrewIndex();
    const topKey = keys[keys.length - 1];
    const incoming = !firstSnapshot && topKey !== lastTopKey;
    firstSnapshot = false;
    lastTopKey = topKey;

    entriesEl.innerHTML = entries.map((item) => {
      const isPops = item.type === "answer";
      const isRoll = item.type === "roll";
      const isDiscord = item.type === "discord";
      const crew = isDiscord ? crewForDiscord(item) : null;
      const senderDisplay = isPops
        ? `<span class="C9DxTc" style="font-family: 'Audiowide', docs-Audiowide, Arial, sans-serif; font-weight: 700; color: rgba(255, 89, 0, 1);">📟 POPS</span>`
        : `<span style="font-weight: 600; color: ${crew ? '#00ffcc' : '#93c5fd'};">${escapeHtml(crew ? crew.name : (item.sender || 'Crew Member'))}</span>${isRoll ? ' <span style="color:#a78bfa;">🎲</span>' : ''}${isDiscord ? ` <span style="color:#818cf8; font-size:10px; letter-spacing:.06em;">${DISCORD_EMOJI} ${escapeHtml(crew ? (item.sender || '') : 'DISCORD')}</span>` : ''}`;

      const borderColor = isPops ? 'rgba(255, 89, 0, 1)' : (isDiscord ? '#5865f2' : (isRoll ? '#8b5cf6' : '#3b82f6'));
      const bgColor = isPops ? '#1c1917' : (isDiscord ? '#171a2b' : (isRoll ? '#1a1826' : '#18181b'));

      return `
        <div style="background: ${bgColor}; padding: 10px 12px; border-radius: 8px; border-left: 3px solid ${borderColor};">
          <div style="font-size: 11px; margin-bottom: 4px;">${senderDisplay}</div>
          <div style="white-space: pre-wrap; line-height: 1.5; color: #e4e4e7;">${escapeHtml(item.text)}</div>
        </div>
      `;
    }).join("");

    // Most recent messages are what matters — always end up at the newest.
    scrollToBottom();
    if (incoming) alertMinimisedPops();
  });

  // Keep the newest entry in view: retry after fonts/layout settle and on load.
  scrollToBottom();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scrollToBottom).catch(() => {});
  window.addEventListener("load", scrollToBottom);
  window.addEventListener("focus", scrollToBottom);

  // Let the panel flash again on the next arrival.
  const popsPanel = document.getElementById("pops-widget");
  if (popsPanel) {
    popsPanel.addEventListener("animationend", () => popsPanel.classList.remove("shudder"));

    // Content is hidden while minimised, so scroll attempts then are no-ops —
    // jump to the newest message when the panel is restored.
    new MutationObserver(() => {
      if (!popsPanel.classList.contains("minimized")) scrollToBottom();
    }).observe(popsPanel, { attributes: true, attributeFilter: ["class"] });
  }
}